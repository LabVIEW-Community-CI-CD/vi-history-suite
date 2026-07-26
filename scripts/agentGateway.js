'use strict';
// scripts/agentGateway.js (VHS-REQ-719)
//
// Graduated agent gateway: the single shared entry point the coordinator and its
// subagents use for (1) AGENT IDENTIFICATION -- a stable "<plane>/<lane>" identity
// (plane from the agent-environment module; lane from VIHS_SUBAGENT_ID, else the
// worktree dir, else pid) -- and (2) DETERMINISTIC SERIALIZATION of stateful ops
// (git push, gh PR) via a filesystem lease/mutex under the SHARED git common dir,
// so one lease spans every worktree + the main clone on a machine.
//
// Coverage discipline (mirrors branchFlowEnforce/collabPromote, VHS-REQ-719): the
// PURE logic below (identity, staleness, release-decision, formatting) is unit-
// tested and mapped; the filesystem lease I/O shim and the CLI are integration-
// validated cross-plane and wrapped in v8-ignore ranges (not unit-coverable).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ----------------------------- pure: identity -----------------------------

/** Resolve the subagent lane for this caller. Precedence: explicit env var, else
 *  the working-dir basename (a worktree dir like "2411" becomes the lane), else
 *  "main" when it is the repo root, else the pid. Deterministic given its inputs. */
function resolveSubagentId(env, opts) {
  env = env || {};
  opts = opts || {};
  const { cwdBasename, pid, repoBasename } = opts;
  if (env.VIHS_SUBAGENT_ID) return { id: String(env.VIHS_SUBAGENT_ID), source: 'env' };
  if (cwdBasename && cwdBasename !== repoBasename) return { id: cwdBasename, source: 'cwd' };
  if (cwdBasename && cwdBasename === repoBasename) return { id: 'main', source: 'main' };
  return { id: 'pid-' + (pid || 0), source: 'pid' };
}

/** "<plane>/<lane>" -- the actor identity stamped on leases + bus records. */
function formatIdentity(agent, subagentId) {
  return `${agent || 'UNKNOWN'}/${subagentId || 'main'}`;
}

// --------------------------- pure: lease-state ---------------------------

/** A lease is stale once it is older than its TTL (holder likely died). */
function isLeaseStale(lease, now) {
  now = now || Date.now();
  if (!lease || !lease.acquiredAt || !lease.ttlSec) return false;
  return now - Date.parse(lease.acquiredAt) > lease.ttlSec * 1000;
}

/** Human-readable one-line description of a lease (or "(free)"). */
function describeLease(lease, now) {
  now = now || Date.now();
  if (!lease) return '(free)';
  const ageSec = Math.round((now - Date.parse(lease.acquiredAt)) / 1000);
  return `${lease.resource} held by ${lease.owner} (pid ${lease.pid}, ${ageSec}s ago, ttl ${lease.ttlSec}s${isLeaseStale(lease, now) ? ', STALE' : ''})`;
}

// ------------------------- pure: release-decision -------------------------

/** Decide whether a release is permitted against the current holder. Credentials,
 *  in precedence order: explicit `force`, matching `token` (default path), or
 *  `owner`-identity match (the caller IS the holder -- removes lost-token friction).
 *  Returns {allowed, reason}. Pure: no I/O. */
function canRelease(holder, creds) {
  creds = creds || {};
  const { token, owner, force } = creds;
  if (!holder) return { allowed: false, reason: 'not-held' };
  if (force) return { allowed: true, reason: 'force' };
  if (token && holder.token === token) return { allowed: true, reason: 'token' };
  if (owner && holder.owner === owner) return { allowed: true, reason: 'owner-match' };
  return { allowed: false, reason: token || owner ? 'credential-mismatch' : 'no-credential' };
}

/** Build a lease record. Pure given explicit token/now/pid (defaults are I/O-ish
 *  randomness/clock, exercised only through acquireLease). */
function makeLease(resource, owner, opts) {
  opts = opts || {};
  return {
    resource,
    owner,
    pid: opts.pid || process.pid,
    token: opts.token || crypto.randomBytes(8).toString('hex'),
    acquiredAt: new Date(opts.now || Date.now()).toISOString(),
    ttlSec: opts.ttlSec || 300
  };
}

// Filesystem lease I/O (atomic-mkdir mutex): unit-tested via a temp dir in
// tests/unit/agentGateway.test.ts, so it COUNTS toward coverage (not v8-ignored).
function lockDir(gateDir, resource) { return path.join(gateDir, encodeURIComponent(resource) + '.lock'); }
function ownerFile(gateDir, resource) { return path.join(lockDir(gateDir, resource), 'owner.json'); }

function readLease(gateDir, resource) {
  try { return JSON.parse(fs.readFileSync(ownerFile(gateDir, resource), 'utf8')); } catch { return null; }
}

function listLeases(gateDir) {
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
 *  exactly one concurrent caller wins. A stale lease is reclaimed. */
function acquireLease(gateDir, resource, owner, opts) {
  opts = opts || {};
  const now = opts.now || Date.now();
  fs.mkdirSync(gateDir, { recursive: true });
  const dir = lockDir(gateDir, resource);
  const lease = makeLease(resource, owner, opts);
  const tryWrite = () => {
    fs.mkdirSync(dir); // atomic; throws EEXIST if held
    fs.writeFileSync(ownerFile(gateDir, resource), JSON.stringify(lease, null, 2));
    return { granted: true, token: lease.token, owner, resource };
  };
  try {
    return tryWrite();
  } catch (e) {
    /* v8 ignore next */ // defensive: a non-EEXIST mkdir failure (disk/perm) is not unit-triggerable
    if (e.code !== 'EEXIST') throw e;
    const held = readLease(gateDir, resource);
    if (held && isLeaseStale(held, now)) {
      fs.rmSync(dir, { recursive: true, force: true });
      return Object.assign(tryWrite(), { reclaimedFrom: held.owner });
    }
    return { granted: false, holder: held, resource };
  }
}

/** Release the mutex iff canRelease permits (token, owner-match, or force). */
function releaseLease(gateDir, resource, creds) {
  const held = readLease(gateDir, resource);
  const decision = canRelease(held, creds);
  if (!decision.allowed) return { released: false, reason: decision.reason, holder: held, resource };
  fs.rmSync(lockDir(gateDir, resource), { recursive: true, force: true });
  return { released: true, reason: decision.reason, resource };
}

/* v8 ignore start */ // git-spawn + CLI/require.main entry: the genuinely-untestable process edges.
/** The shared gate dir under the git common dir (spans all worktrees + main). */
function resolveGateDir(cwd) {
  const { execFileSync } = require('child_process');
  let common = '.git';
  try { common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' }).trim() || '.git'; } catch { /* default */ }
  if (!path.isAbsolute(common)) common = path.resolve(cwd || process.cwd(), common);
  return path.join(common, 'vihs-gate');
}

function cliIdentity() {
  let plane = process.env.VIHS_COLLAB_AGENT ? process.env.VIHS_COLLAB_AGENT.toUpperCase() : null;
  if (!plane) { try { plane = require('./deriveAgentEnvironment').deriveTeamName().toUpperCase(); } catch { plane = process.platform === 'win32' ? 'WIN' : 'LINUX'; } }
  const sa = resolveSubagentId(process.env, { cwdBasename: path.basename(process.cwd()), pid: process.pid, repoBasename: 'vi-history-suite' });
  return { plane, lane: sa.id, identity: formatIdentity(plane, sa.id) };
}

function parseCliArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : true; a[k] = v; }
  }
  return a;
}

function main(argv) {
  const sub = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'status';
  const a = parseCliArgs(argv.slice(1));
  const gateDir = resolveGateDir();
  const { identity } = cliIdentity();
  if (sub === 'whoami') { console.log('identity=' + identity + '  gateDir=' + gateDir); return 0; }
  if (sub === 'acquire') {
    const resource = String(a.resource || '');
    if (!resource) { console.error('gate acquire: --resource required'); return 2; }
    const r = acquireLease(gateDir, resource, identity, { ttlSec: a.ttl ? Number(a.ttl) : 300 });
    if (r.granted) { console.log('GRANTED ' + resource + ' -> ' + identity + '  token=' + r.token + (r.reclaimedFrom ? ' (reclaimed from ' + r.reclaimedFrom + ')' : '')); return 0; }
    console.error('BUSY ' + resource + ' -- ' + describeLease(r.holder)); return 3;
  }
  if (sub === 'release') {
    const resource = String(a.resource || '');
    if (!resource) { console.error('gate release: --resource required'); return 2; }
    const r = releaseLease(gateDir, resource, { token: a.token && a.token !== true ? String(a.token) : undefined, owner: identity, force: Boolean(a.force) });
    if (r.released) { console.log('RELEASED ' + resource + ' (' + r.reason + ')'); return 0; }
    console.error('NOT RELEASED ' + resource + ' -- ' + r.reason); return 3;
  }
  if (sub === 'status') {
    const leases = listLeases(gateDir);
    console.log('# gate leases (' + leases.length + ') @ ' + gateDir);
    for (const l of leases) console.log('  ' + describeLease(l));
    if (!leases.length) console.log('  (none held -- gate is free)');
    return 0;
  }
  console.error('usage: node scripts/agentGateway.js whoami | acquire --resource R [--ttl N] | release --resource R [--token T | --force] | status');
  return 2;
}

if (require.main === module) { process.exit(main(process.argv.slice(2))); }
/* v8 ignore stop */

module.exports = {
  resolveSubagentId,
  formatIdentity,
  isLeaseStale,
  describeLease,
  canRelease,
  makeLease,
  // I/O shim (integration-validated; exported for the hook + cross-plane validation)
  readLease,
  listLeases,
  acquireLease,
  releaseLease,
  resolveGateDir
};
