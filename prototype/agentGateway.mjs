// prototype/agentGateway.mjs
//
// Single shared coordination entry point for the coordinator + its subagents
// (issue #2392 follow-on; the parallel-track fan-out needs it once subagents
// run git/gh concurrently across worktrees). Provides two guarantees:
//   1. AGENT IDENTIFICATION — every caller resolves a stable identity
//      "<plane>/<subagent-lane>" (plane from deriveAgentEnvironment; lane from
//      VIHS_SUBAGENT_ID or the worktree dir), so bus/lock records name a real actor.
//   2. DETERMINISTIC SERIALIZATION — a filesystem lease/mutex under the SHARED
//      git common dir (so it spans ALL worktrees + the main clone on one machine).
//      Stateful ops (git push, gh PR) acquire the lease first, so they run
//      one-at-a-time in arrival order instead of racing.
//
// PURE vs I/O: the identity + lease-state logic is pure (unit-testable). The
// filesystem lease ops are thin and take an explicit gateDir (tests use a temp dir).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ---------------- pure identity ----------------

/** Resolve the subagent lane for this caller. Precedence: explicit env var,
 *  else the working-dir basename (a worktree dir like "2411" becomes the lane),
 *  else the pid. Deterministic given its inputs. */
export function resolveSubagentId(env = {}, { cwdBasename, pid, repoBasename } = {}) {
  if (env.VIHS_SUBAGENT_ID) return { id: String(env.VIHS_SUBAGENT_ID), source: 'env' };
  if (cwdBasename && cwdBasename !== repoBasename) return { id: cwdBasename, source: 'cwd' };
  if (cwdBasename && cwdBasename === repoBasename) return { id: 'main', source: 'main' };
  return { id: 'pid-' + (pid || 0), source: 'pid' };
}

/** "<plane>/<lane>" — the actor identity stamped on leases + bus records. */
export function formatIdentity(agent, subagentId) {
  return `${agent || 'UNKNOWN'}/${subagentId || 'main'}`;
}

// ---------------- pure lease-state ----------------

export function isLeaseStale(lease, now = Date.now()) {
  if (!lease || !lease.acquiredAt || !lease.ttlSec) return false;
  return now - Date.parse(lease.acquiredAt) > lease.ttlSec * 1000;
}

export function describeLease(lease, now = Date.now()) {
  if (!lease) return '(free)';
  const ageSec = Math.round((now - Date.parse(lease.acquiredAt)) / 1000);
  return `${lease.resource} held by ${lease.owner} (pid ${lease.pid}, ${ageSec}s ago, ttl ${lease.ttlSec}s${isLeaseStale(lease, now) ? ', STALE' : ''})`;
}

// ---------------- thin filesystem lease (deterministic mutex) ----------------

function lockDir(gateDir, resource) {
  return path.join(gateDir, encodeURIComponent(resource) + '.lock');
}
function ownerFile(gateDir, resource) {
  return path.join(lockDir(gateDir, resource), 'owner.json');
}

export function readLease(gateDir, resource) {
  try {
    return JSON.parse(fs.readFileSync(ownerFile(gateDir, resource), 'utf8'));
  } catch {
    return null;
  }
}

export function listLeases(gateDir) {
  let entries = [];
  try { entries = fs.readdirSync(gateDir); } catch { return []; }
  const out = [];
  for (const e of entries) {
    if (!e.endsWith('.lock')) continue;
    const resource = decodeURIComponent(e.slice(0, -'.lock'.length));
    const lease = readLease(gateDir, resource);
    if (lease) out.push(lease);
  }
  return out.sort((a, b) => (a.acquiredAt < b.acquiredAt ? -1 : 1));
}

/** Atomically acquire the mutex for `resource`. mkdir is the atomic primitive:
 *  exactly one concurrent caller wins. A stale lease (past its TTL — holder
 *  likely died) is reclaimed. Returns {granted, token} or {granted:false, holder}. */
export function acquireLease(gateDir, resource, owner, { ttlSec = 300, now = Date.now(), pid = process.pid, token } = {}) {
  fs.mkdirSync(gateDir, { recursive: true });
  const dir = lockDir(gateDir, resource);
  const lease = {
    resource,
    owner,
    pid,
    token: token || crypto.randomBytes(8).toString('hex'),
    acquiredAt: new Date(now).toISOString(),
    ttlSec
  };
  const tryWrite = () => {
    fs.mkdirSync(dir); // atomic; throws EEXIST if held
    fs.writeFileSync(ownerFile(gateDir, resource), JSON.stringify(lease, null, 2));
    return { granted: true, token: lease.token, owner, resource };
  };
  try {
    return tryWrite();
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const held = readLease(gateDir, resource);
    if (held && isLeaseStale(held, now)) {
      // reclaim: remove the dead holder's lock and retry once
      fs.rmSync(dir, { recursive: true, force: true });
      const r = tryWrite();
      return { ...r, reclaimedFrom: held.owner };
    }
    return { granted: false, holder: held, resource };
  }
}

/** Release the mutex iff the token matches the current holder (prevents a
 *  caller from releasing someone else's lease). */
export function releaseLease(gateDir, resource, token) {
  const held = readLease(gateDir, resource);
  if (!held) return { released: false, reason: 'not-held', resource };
  if (held.token !== token) return { released: false, reason: 'token-mismatch', holder: held, resource };
  fs.rmSync(lockDir(gateDir, resource), { recursive: true, force: true });
  return { released: true, resource };
}
