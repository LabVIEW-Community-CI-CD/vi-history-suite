// prototype/agentGateway.selftest.mjs
// Deterministic self-test for the agent gateway (identity + lease mutex).
// Run: node prototype/agentGateway.selftest.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resolveSubagentId,
  formatIdentity,
  isLeaseStale,
  describeLease,
  acquireLease,
  releaseLease,
  readLease,
  listLeases
} from './agentGateway.mjs';

let n = 0;
const ok = (label) => { n += 1; console.log('ok ' + n + ' - ' + label); };

// identity precedence
assert.deepEqual(resolveSubagentId({ VIHS_SUBAGENT_ID: 'lane-x' }, { cwdBasename: '2411', repoBasename: 'vi-history-suite', pid: 5 }), { id: 'lane-x', source: 'env' });
assert.deepEqual(resolveSubagentId({}, { cwdBasename: '2411', repoBasename: 'vi-history-suite', pid: 5 }), { id: '2411', source: 'cwd' });
assert.deepEqual(resolveSubagentId({}, { cwdBasename: 'vi-history-suite', repoBasename: 'vi-history-suite', pid: 5 }), { id: 'main', source: 'main' });
assert.deepEqual(resolveSubagentId({}, { pid: 5 }), { id: 'pid-5', source: 'pid' });
assert.equal(formatIdentity('WIN', '2411'), 'WIN/2411');
assert.equal(formatIdentity(undefined, undefined), 'UNKNOWN/main');
ok('identity: env > cwd-lane > main > pid; formatIdentity');

// lease staleness (pure)
const t0 = Date.parse('2026-01-01T00:00:00Z');
const fresh = { resource: 'git', owner: 'WIN/main', pid: 1, acquiredAt: '2026-01-01T00:00:00Z', ttlSec: 300 };
assert.equal(isLeaseStale(fresh, t0 + 299 * 1000), false);
assert.equal(isLeaseStale(fresh, t0 + 301 * 1000), true);
assert.match(describeLease(fresh, t0 + 10 * 1000), /git held by WIN\/main/);
assert.equal(describeLease(null), '(free)');
ok('lease staleness + describe');

// filesystem mutex lifecycle
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-gate-test-'));
try {
  const a = acquireLease(dir, 'git', 'WIN/2411', { ttlSec: 300, now: t0 });
  assert.equal(a.granted, true);
  assert.ok(a.token);
  // second acquirer is refused while held (deterministic serialization: one holder)
  const b = acquireLease(dir, 'git', 'WIN/2412', { ttlSec: 300, now: t0 + 1000 });
  assert.equal(b.granted, false);
  assert.equal(b.holder.owner, 'WIN/2411');
  // release with wrong token refused
  const wrong = releaseLease(dir, 'git', 'deadbeef');
  assert.equal(wrong.released, false);
  assert.equal(wrong.reason, 'token-mismatch');
  // release with correct token frees it
  assert.equal(releaseLease(dir, 'git', a.token).released, true);
  assert.equal(readLease(dir, 'git'), null);
  // now the waiter can acquire
  const c = acquireLease(dir, 'git', 'WIN/2412', { ttlSec: 300, now: t0 + 2000 });
  assert.equal(c.granted, true);
  ok('mutex: acquire, refuse-while-held, token-mismatch release, release, re-acquire');

  // stale reclaim: a lease past its TTL is stolen by a new acquirer
  const d = acquireLease(dir, 'db', 'WIN/dead', { ttlSec: 10, now: t0 });
  assert.equal(d.granted, true);
  const e = acquireLease(dir, 'db', 'LINUX/main', { ttlSec: 10, now: t0 + 11 * 1000 });
  assert.equal(e.granted, true);
  assert.equal(e.reclaimedFrom, 'WIN/dead');
  ok('mutex: stale lease reclaimed by new acquirer');

  // listLeases reports current holders sorted by acquisition
  const leases = listLeases(dir);
  assert.ok(leases.some((l) => l.resource === 'git' && l.owner === 'WIN/2412'));
  assert.ok(leases.some((l) => l.resource === 'db' && l.owner === 'LINUX/main'));
  ok('listLeases reports live holders');

  // resource-name with a slash is encoded safely (e.g. "worktree:2411")
  const f = acquireLease(dir, 'worktree:2411', 'WIN/2411', { now: t0 });
  assert.equal(f.granted, true);
  assert.ok(readLease(dir, 'worktree:2411'));
  ok('resource names with special chars are encoded');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('1..' + n);
console.log('agentGateway self-test PASSED (' + n + ' groups)');
