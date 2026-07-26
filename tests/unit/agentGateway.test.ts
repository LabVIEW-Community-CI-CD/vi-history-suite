import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const gw = require('../../scripts/agentGateway.js');

// VHS-REQ-719 (VHS #2392 agent-coordination): the shared agent gateway graduated to
// scripts/. Pure logic (identity, staleness, release-decision, formatting) is unit-tested
// here + mapped; the filesystem lease I/O shim is v8-ignored (integration-validated
// cross-plane) but exercised below with a temp dir for correctness.

describe('agentGateway identity (VHS-REQ-719)', () => {
  it('resolveSubagentId precedence: env > cwd-lane > main > pid', () => {
    expect(gw.resolveSubagentId({ VIHS_SUBAGENT_ID: 'lane-x' }, { cwdBasename: '2411', repoBasename: 'vi-history-suite', pid: 5 })).toEqual({ id: 'lane-x', source: 'env' });
    expect(gw.resolveSubagentId({}, { cwdBasename: '2411', repoBasename: 'vi-history-suite', pid: 5 })).toEqual({ id: '2411', source: 'cwd' });
    expect(gw.resolveSubagentId({}, { cwdBasename: 'vi-history-suite', repoBasename: 'vi-history-suite', pid: 5 })).toEqual({ id: 'main', source: 'main' });
    expect(gw.resolveSubagentId({}, { pid: 5 })).toEqual({ id: 'pid-5', source: 'pid' });
    expect(gw.resolveSubagentId(undefined, undefined)).toEqual({ id: 'pid-0', source: 'pid' });
  });

  it('formatIdentity joins plane/lane with fallbacks', () => {
    expect(gw.formatIdentity('WIN', '2411')).toBe('WIN/2411');
    expect(gw.formatIdentity(undefined, undefined)).toBe('UNKNOWN/main');
  });
});

describe('agentGateway lease-state (VHS-REQ-719)', () => {
  const t0 = Date.parse('2026-01-01T00:00:00Z');
  const fresh = { resource: 'git', owner: 'WIN/main', pid: 1, token: 'abc', acquiredAt: '2026-01-01T00:00:00Z', ttlSec: 300 };

  it('isLeaseStale honors the TTL and guards missing fields', () => {
    expect(gw.isLeaseStale(fresh, t0 + 299 * 1000)).toBe(false);
    expect(gw.isLeaseStale(fresh, t0 + 301 * 1000)).toBe(true);
    expect(gw.isLeaseStale(null, t0)).toBe(false);
    expect(gw.isLeaseStale({ acquiredAt: '2026-01-01T00:00:00Z' }, t0)).toBe(false); // no ttlSec
  });

  it('describeLease renders free / held / stale', () => {
    expect(gw.describeLease(null)).toBe('(free)');
    expect(gw.describeLease(fresh, t0 + 10 * 1000)).toMatch(/git held by WIN\/main \(pid 1, 10s ago, ttl 300s\)/);
    expect(gw.describeLease(fresh, t0 + 400 * 1000)).toMatch(/STALE/);
  });
});

describe('agentGateway release-decision canRelease (VHS-REQ-719)', () => {
  const holder = { resource: 'git', owner: 'WIN/main', token: 'tok123' };
  it('permits force / token / owner-match; refuses otherwise', () => {
    expect(gw.canRelease(null, { token: 'tok123' })).toEqual({ allowed: false, reason: 'not-held' });
    expect(gw.canRelease(holder, { force: true })).toEqual({ allowed: true, reason: 'force' });
    expect(gw.canRelease(holder, { token: 'tok123' })).toEqual({ allowed: true, reason: 'token' });
    expect(gw.canRelease(holder, { owner: 'WIN/main' })).toEqual({ allowed: true, reason: 'owner-match' });
    expect(gw.canRelease(holder, { token: 'wrong' })).toEqual({ allowed: false, reason: 'credential-mismatch' });
    expect(gw.canRelease(holder, { owner: 'LINUX/main' })).toEqual({ allowed: false, reason: 'credential-mismatch' });
    expect(gw.canRelease(holder, {})).toEqual({ allowed: false, reason: 'no-credential' });
  });

  it('makeLease builds a stamped record (explicit + default paths)', () => {
    const l = gw.makeLease('git', 'WIN/2411', { ttlSec: 120, now: Date.parse('2026-01-01T00:00:00Z'), pid: 42, token: 'fixed' });
    expect(l).toMatchObject({ resource: 'git', owner: 'WIN/2411', pid: 42, token: 'fixed', ttlSec: 120, acquiredAt: '2026-01-01T00:00:00.000Z' });
    const d = gw.makeLease('db', 'WIN/main');
    expect(d.resource).toBe('db');
    expect(typeof d.token).toBe('string');
    expect(d.ttlSec).toBe(300);
    expect(typeof d.pid).toBe('number');
  });
});

describe('agentGateway lease I/O mutex (VHS-REQ-719, integration)', () => {
  it('acquires, refuses while held, releases (token + owner-match + force), reclaims stale', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-gate-ut-'));
    try {
      const t0 = Date.parse('2026-01-01T00:00:00Z');
      const a = gw.acquireLease(dir, 'git', 'WIN/2411', { ttlSec: 300, now: t0 });
      expect(a.granted).toBe(true);
      expect(a.token).toBeTruthy();
      // held -> a second lane is refused (deterministic serialization)
      const b = gw.acquireLease(dir, 'git', 'WIN/2412', { ttlSec: 300, now: t0 + 1000 });
      expect(b.granted).toBe(false);
      expect(b.holder.owner).toBe('WIN/2411');
      // wrong token refused; owner-match releases without token
      expect(gw.releaseLease(dir, 'git', { token: 'nope' }).released).toBe(false);
      expect(gw.releaseLease(dir, 'git', { owner: 'WIN/2411' })).toMatchObject({ released: true, reason: 'owner-match' });
      expect(gw.readLease(dir, 'git')).toBeNull();

      // token release path
      const c = gw.acquireLease(dir, 'git', 'WIN/2412', { now: t0 + 2000 });
      expect(gw.releaseLease(dir, 'git', { token: c.token })).toMatchObject({ released: true, reason: 'token' });

      // force release path
      gw.acquireLease(dir, 'git', 'WIN/x', { now: t0 + 3000 });
      expect(gw.releaseLease(dir, 'git', { force: true })).toMatchObject({ released: true, reason: 'force' });

      // stale reclaim
      gw.acquireLease(dir, 'db', 'WIN/dead', { ttlSec: 10, now: t0 });
      const e = gw.acquireLease(dir, 'db', 'LINUX/main', { ttlSec: 10, now: t0 + 11 * 1000 });
      expect(e.granted).toBe(true);
      expect(e.reclaimedFrom).toBe('WIN/dead');

      // listLeases + special-char resource name
      gw.acquireLease(dir, 'worktree:2411', 'WIN/2411', { now: t0 });
      const names = gw.listLeases(dir).map((l: { resource: string }) => l.resource);
      expect(names).toContain('db');
      expect(names).toContain('worktree:2411');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
