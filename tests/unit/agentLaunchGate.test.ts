import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mod = require('../../scripts/agentLaunchGate.js');

// VHS-REQ-719 (VHS #2392 agent-coordination, board #2315, issue #2447): graduated agent-launch
// gate. Serializes subagent spawns via the shared agent-gateway lease and records launch
// contention (cpu+gpu+DISK) into the same contention ledger the pre-push gate writes, with
// phase-bucketing analysis. Pure logic AND the acquire/release orchestration are dependency-
// injected, so the I/O paths are real-tested here with fakes; only defaultDeps()/CLI are v8-ignored.

describe('agentLaunchGate.launchResource (VHS-REQ-719)', () => {
  it('sanitizes + prefixes a group, defaulting when empty', () => {
    expect(mod.launchResource('gpu eval')).toBe('agent-launch:gpu-eval');
    expect(mod.launchResource('  weird/@name!  ')).toBe('agent-launch:weird-name');
    expect(mod.launchResource('')).toBe('agent-launch:default');
    expect(mod.launchResource(null)).toBe('agent-launch:default');
  });
});

describe('agentLaunchGate.shouldSerializeLaunch (VHS-REQ-719)', () => {
  it('serializes in a multi-agent context, stays advisory for a solo spawn', () => {
    expect(mod.shouldSerializeLaunch({ VIHS_SUBAGENT_ID: '2447' }, 1)).toBe(true);
    expect(mod.shouldSerializeLaunch({}, 2)).toBe(true);
    expect(mod.shouldSerializeLaunch({}, 1)).toBe(false);
    expect(mod.shouldSerializeLaunch(undefined, undefined)).toBe(false);
  });
});

describe('agentLaunchGate.backoffMs (VHS-REQ-719)', () => {
  it('is exponential and capped', () => {
    expect(mod.backoffMs(0)).toBe(200);
    expect(mod.backoffMs(1)).toBe(400);
    expect(mod.backoffMs(2)).toBe(800);
    expect(mod.backoffMs(10)).toBe(3000); // capped
    expect(mod.backoffMs(-5)).toBe(200); // guarded
    expect(mod.backoffMs(3, 100, 1000)).toBe(800);
  });
});

describe('agentLaunchGate.classifyLaunchOutcome (VHS-REQ-719)', () => {
  it('acquired -> done; last attempt -> advisory-degraded; else retry', () => {
    expect(mod.classifyLaunchOutcome(true, 0, 5)).toEqual({ done: true, mode: 'acquired' });
    expect(mod.classifyLaunchOutcome(false, 4, 5)).toEqual({ done: true, mode: 'advisory-degraded' });
    expect(mod.classifyLaunchOutcome(false, 0, 5)).toEqual({ done: false, mode: 'retry' });
  });
});

describe('agentLaunchGate.phaseAt (VHS-REQ-719)', () => {
  const markers = [
    { ts: '2026-01-01T00:00:00.000Z', phase: 'gpu-eval' },
    { ts: '2026-01-01T00:10:00.000Z', phase: 'disk-io' }
  ];
  it('resolves the latest marker at or before ts, else unknown', () => {
    expect(mod.phaseAt('2026-01-01T00:05:00.000Z', markers)).toBe('gpu-eval');
    expect(mod.phaseAt('2026-01-01T00:12:00.000Z', markers)).toBe('disk-io');
    expect(mod.phaseAt('2025-12-31T00:00:00.000Z', markers)).toBe('unknown'); // before first marker
    expect(mod.phaseAt('not-a-date', markers)).toBe('unknown');
    expect(mod.phaseAt('2026-01-01T00:05:00.000Z', [])).toBe('unknown');
  });
});

describe('agentLaunchGate.bucketContentionByPhase (VHS-REQ-719)', () => {
  const markers = [
    { ts: '2026-01-01T00:00:00.000Z', phase: 'gpu-eval' },
    { ts: '2026-01-01T00:10:00.000Z', phase: 'disk-io' }
  ];
  it('buckets contention by phase, attributing GPU / CPU / DISK pressure and excluding non-contention', () => {
    const records = [
      { ts: '2026-01-01T00:05:00.000Z', event: 'retry', resource: 'agent-launch:bench', resources: { gpu: { present: true, util: 80 }, cpu: { loadPerCore: 0.1 }, disk: { present: true, writeMBps: 1500, readMBps: 1800 } } }, // gpu-eval, gpuHeavy
      { ts: '2026-01-01T00:06:00.000Z', event: 'retry', resource: 'agent-launch:bench', resources: { gpu: { present: true, util: 5 }, cpu: { loadPerCore: 0.9 }, disk: { present: true, writeMBps: 1500, readMBps: 1800 } } }, // gpu-eval, cpuHeavy
      { ts: '2026-01-01T00:12:00.000Z', event: 'advisory-degraded', resource: 'agent-launch:bench', resources: { gpu: { present: false, util: null }, cpu: { loadPerCore: 0.1 }, disk: { present: true, writeMBps: 30, readMBps: 40 } } }, // disk-io, diskHeavy
      { ts: '2026-01-01T00:13:00.000Z', event: 'retry', resource: 'agent-launch:bench', resources: { gpu: { present: true, util: 5 }, cpu: { loadPerCore: 0.1 }, disk: { present: true, writeMBps: 1500, readMBps: 1800 } } }, // disk-io, neither
      { ts: '2026-01-01T00:14:00.000Z', event: 'acquired', resources: {} }, // excluded (not contention)
      { ts: '2026-01-01T00:15:00.000Z', event: 'phase-marker' } // excluded
    ];
    const buckets = mod.bucketContentionByPhase(records, markers);
    const gpuEval = buckets.find((b: { phase: string }) => b.phase === 'gpu-eval');
    const diskIo = buckets.find((b: { phase: string }) => b.phase === 'disk-io');
    expect(gpuEval).toEqual({ phase: 'gpu-eval', total: 2, gpuHeavy: 1, cpuHeavy: 1, diskHeavy: 0, neither: 0 });
    expect(diskIo).toEqual({ phase: 'disk-io', total: 2, gpuHeavy: 0, cpuHeavy: 0, diskHeavy: 1, neither: 1 });
  });
  it('honors a tunable slow-write floor (per-machine disk threshold)', () => {
    const records = [
      { ts: '2026-01-01T00:12:00.000Z', event: 'retry', resource: 'agent-launch:bench', resources: { gpu: { present: false }, cpu: { loadPerCore: 0.1 }, disk: { present: true, writeMBps: 100, readMBps: 1800 } } }
    ];
    expect(mod.bucketContentionByPhase(records, markers)[0].diskHeavy).toBe(0); // 100 > default 50
    expect(mod.bucketContentionByPhase(records, markers, { slowWriteMBps: 200 })[0].diskHeavy).toBe(1); // 100 <= 200
  });
});

describe('agentLaunchGate.buildLaunchRecord (VHS-REQ-719)', () => {
  it('builds the unified cpu+gpu+DISK record and preserves an epoch-0 ts (?? not ||)', () => {
    const rec = mod.buildLaunchRecord({
      event: 'retry', now: 0,
      capability: { cpu: { loadPerCore: 0.1 }, gpu: { present: true, util: 5 }, disk: { present: true, writeMBps: 100, readMBps: 200 } }
    });
    expect(rec.ts).toBe('1970-01-01T00:00:00.000Z'); // epoch-0 preserved
    expect(rec.event).toBe('retry');
    expect(rec.resource).toBe('agent-launch:default');
    expect(rec.identity).toBe('UNKNOWN/main');
    expect(rec.resources).toEqual({ cpu: { loadPerCore: 0.1 }, gpu: { present: true, util: 5 }, disk: { present: true, writeMBps: 100, readMBps: 200 } });
  });
  it('null-shapes an absent capability', () => {
    expect(mod.buildLaunchRecord({}).resources).toEqual({ cpu: null, gpu: null, disk: null });
  });
});

// ---- DI'd orchestration ----

interface AcquireOverrides {
  env?: Record<string, unknown>;
  worktreeCount?: number;
  acquireLease?: (...a: unknown[]) => unknown;
  sampleCapability?: (...a: unknown[]) => unknown;
}

function makeAcquireDeps(overrides: AcquireOverrides = {}) {
  const ledger: Array<Record<string, unknown>> = [];
  const logs: string[] = [];
  let t = 1000;
  const deps = {
    env: { VIHS_SUBAGENT_ID: '2447' },
    worktreeCount: 1,
    identity: 'LINUX/test',
    now: () => (t += 5),
    sleep: () => {},
    log: (m: string) => logs.push(m),
    acquireLease: () => ({ granted: true, token: 'TOK1' }),
    sampleCapability: () => ({ cpu: { loadPerCore: 0.1 }, gpu: { present: true, util: 5 }, disk: { present: true, writeMBps: 1500, readMBps: 1800 } }),
    appendLedger: (r: Record<string, unknown>) => ledger.push(r),
    ...overrides
  };
  return { deps, ledger, logs };
}

describe('agentLaunchGate.runLaunchAcquire (VHS-REQ-719, DI orchestration)', () => {
  it('skips (advisory) in a solo context without touching the lease', () => {
    let called = false;
    const { deps } = makeAcquireDeps({ env: {}, worktreeCount: 1, acquireLease: () => { called = true; return { granted: false }; } });
    const res = mod.runLaunchAcquire(deps, { group: 'bench' });
    expect(res).toEqual({ serialized: false, mode: 'skipped', resource: 'agent-launch:bench' });
    expect(called).toBe(false);
  });
  it('acquires on the first attempt and returns the token', () => {
    const { deps, ledger } = makeAcquireDeps();
    const res = mod.runLaunchAcquire(deps, { group: 'bench' });
    expect(res).toEqual({ serialized: true, mode: 'acquired', resource: 'agent-launch:bench', token: 'TOK1', attempt: 0 });
    expect(ledger.length).toBe(0); // no contention recorded
  });
  it('bounded-retries then DEGRADES TO ADVISORY on sustained contention, recording cpu+gpu+DISK', () => {
    const { deps, ledger } = makeAcquireDeps({ acquireLease: () => ({ granted: false, holder: { owner: 'OTHER/lane' } }) });
    const res = mod.runLaunchAcquire(deps, { group: 'bench', maxAttempts: 3 });
    expect(res.mode).toBe('advisory-degraded'); // never hard-blocked
    expect(res.serialized).toBe(true);
    expect(ledger.length).toBe(3);
    expect(ledger[0].event).toBe('retry');
    expect(ledger[2].event).toBe('advisory-degraded');
    expect((ledger[2].resources as { disk: { writeMBps: number } }).disk.writeMBps).toBe(1500); // DISK axis in the ledger
    expect(ledger[0].holder).toBe('OTHER/lane');
  });
  it('acquires on a later attempt after transient contention', () => {
    let n = 0;
    const { deps, ledger } = makeAcquireDeps({ acquireLease: () => (n++ === 0 ? { granted: false, holder: { owner: 'X' } } : { granted: true, token: 'TOK2' }) });
    const res = mod.runLaunchAcquire(deps, { group: 'bench' });
    expect(res.mode).toBe('acquired');
    expect(res.token).toBe('TOK2');
    expect(res.attempt).toBe(1);
    expect(ledger.length).toBe(1); // one retry recorded before success
  });
});

describe('agentLaunchGate.runLaunchRelease (VHS-REQ-719, DI orchestration)', () => {
  it('releases by token', () => {
    const calls: Array<[string, string]> = [];
    const deps = { releaseLease: (resource: string, token: string) => { calls.push([resource, token]); } };
    const res = mod.runLaunchRelease(deps, { group: 'bench', token: 'TOK1' });
    expect(res).toEqual({ released: true, resource: 'agent-launch:bench' });
    expect(calls).toEqual([['agent-launch:bench', 'TOK1']]);
  });
  it('does not release without a token', () => {
    let called = false;
    const deps = { releaseLease: () => { called = true; } };
    const res = mod.runLaunchRelease(deps, { group: 'bench' });
    expect(res).toEqual({ released: false, resource: 'agent-launch:bench' });
    expect(called).toBe(false);
  });
  it('never throws: a failing releaseLease degrades to not-released', () => {
    const deps = { releaseLease: () => { throw new Error('gone'); } };
    const res = mod.runLaunchRelease(deps, { group: 'bench', token: 'TOK1' });
    expect(res).toEqual({ released: false, resource: 'agent-launch:bench' });
  });
});

describe('agentLaunchGate module surface (VHS-REQ-719)', () => {
  it('exports constants and the real-binding convenience', () => {
    expect(mod.constants).toEqual({
      LAUNCH_RESOURCE_PREFIX: 'agent-launch:',
      DEFAULT_LAUNCH_TTL_SEC: 45,
      DEFAULT_LAUNCH_MAX_ATTEMPTS: 5,
      GPU_BUSY_UTIL: 50,
      CPU_BUSY_LOAD_PER_CORE: 0.7
    });
    expect(typeof mod.defaultDeps).toBe('function'); // v8-ignored real binding, referenced not invoked
  });
});

describe('agentLaunchGate defensive/fallback branches (VHS-REQ-719)', () => {
  it('a bare runLaunchAcquire() defaults to a solo skip (deps/opts/env/worktree defaults)', () => {
    expect(mod.runLaunchAcquire().mode).toBe('skipped');
  });
  it('tolerates a minimal deps bag: missing log/now/sampleCapability/appendLedger/sleep and an undefined lease result', () => {
    const deps = { env: { VIHS_SUBAGENT_ID: '1' }, worktreeCount: 1, identity: 'X', acquireLease: () => undefined };
    const res = mod.runLaunchAcquire(deps, { group: 'bench', ttlSec: 30, maxAttempts: 2 });
    expect(res.mode).toBe('advisory-degraded'); // never hard-blocked even with a bare deps bag
    expect(res.serialized).toBe(true);
  });
  it('a bare runLaunchRelease() is a no-op', () => {
    expect(mod.runLaunchRelease()).toEqual({ released: false, resource: 'agent-launch:default' });
  });
  it('buildLaunchRecord carries explicit fields when provided', () => {
    const rec = mod.buildLaunchRecord({ event: 'retry', now: 1000, resource: 'agent-launch:x', identity: 'A/b', attempt: 2, waitedMs: 50, holder: 'H', capability: { cpu: { loadPerCore: 0.2 }, gpu: { present: false }, disk: { present: false } } });
    expect(rec.resource).toBe('agent-launch:x');
    expect(rec.identity).toBe('A/b');
    expect(rec.attempt).toBe(2);
    expect(rec.waitedMs).toBe(50);
    expect(rec.holder).toBe('H');
  });
  it('phaseAt falls back marker.phase -> marker.name -> unknown', () => {
    expect(mod.phaseAt('2026-01-01T00:05:00.000Z', [{ ts: '2026-01-01T00:00:00.000Z', name: 'named' }])).toBe('named');
    expect(mod.phaseAt('2026-01-01T00:05:00.000Z', [{ ts: '2026-01-01T00:00:00.000Z' }])).toBe('unknown');
  });
  it('bucketContentionByPhase tolerates undefined records, skips malformed/non-contention, and honors busy thresholds', () => {
    expect(mod.bucketContentionByPhase(undefined, undefined)).toEqual([]);
    const records = [
      null,
      { event: 'retry' }, // no ts -> skipped
      { ts: '2026-01-01T00:00:00.000Z', event: 'acquired', resources: {} }, // not contention -> skipped
      { ts: '2026-01-01T00:00:00.000Z', event: 'retry', resource: 'agent-launch:bench', resources: { gpu: { present: true, util: 10 }, cpu: { loadPerCore: 0.4 }, disk: { present: false } } }
    ];
    const buckets = mod.bucketContentionByPhase(records, [], { gpuBusyUtil: 5, cpuBusyLoadPerCore: 0.3, slowWriteMBps: 10, slowReadMBps: 10 });
    expect(buckets).toEqual([{ phase: 'unknown', total: 1, gpuHeavy: 1, cpuHeavy: 1, diskHeavy: 0, neither: 0 }]);
  });
});

describe('agentLaunchGate review-sweep fixes (VHS-REQ-719, issue #2453)', () => {
  it('shouldSerializeLaunch honors the VIHS_LAUNCH_SERIALIZE force for a shared worktree', () => {
    expect(mod.shouldSerializeLaunch({ VIHS_LAUNCH_SERIALIZE: '1' }, 1)).toBe(true); // force-on with no subagent id / single worktree
    expect(mod.shouldSerializeLaunch({ VIHS_LAUNCH_SERIALIZE: '0' }, 1)).toBe(false);
  });
  it('bucketContentionByPhase falls back to defaults for NaN thresholds (no silent disable)', () => {
    const records = [
      { ts: '2026-01-01T00:05:00.000Z', event: 'retry', resource: 'agent-launch:bench', resources: { gpu: { present: true, util: 80 }, cpu: { loadPerCore: 0.9 }, disk: { present: true, writeMBps: 30, readMBps: 40 } } }
    ];
    const b = mod.bucketContentionByPhase(records, [], { gpuBusyUtil: NaN, cpuBusyLoadPerCore: NaN, slowWriteMBps: NaN, slowReadMBps: NaN })[0];
    expect(b).toEqual({ phase: 'unknown', total: 1, gpuHeavy: 1, cpuHeavy: 1, diskHeavy: 1, neither: 0 }); // defaults still classify
  });
  it('bucketContentionByPhase excludes non-launch (pre-push-validation) records from the shared ledger', () => {
    const records = [
      { ts: '2026-01-01T00:05:00.000Z', event: 'retry', resource: 'pre-push-validation', resources: { gpu: { present: true, util: 80 }, cpu: { loadPerCore: 0.9 }, disk: { present: true, writeMBps: 30 } } }, // excluded (not a launch resource)
      { ts: '2026-01-01T00:06:00.000Z', event: 'retry', resource: 'agent-launch:bench', resources: { gpu: { present: false }, cpu: { loadPerCore: 0.1 }, disk: { present: false } } } // counted
    ];
    expect(mod.bucketContentionByPhase(records, [])).toEqual([{ phase: 'unknown', total: 1, gpuHeavy: 0, cpuHeavy: 0, diskHeavy: 0, neither: 1 }]);
  });
  it('runLaunchAcquire is best-effort: a throwing or missing acquireLease degrades to advisory (never hard-blocks)', () => {
    const throwing = makeAcquireDeps({ acquireLease: () => { throw new Error('gate dir unwritable'); } });
    const r1 = mod.runLaunchAcquire(throwing.deps, { group: 'bench', maxAttempts: 2 });
    expect(r1.mode).toBe('advisory-degraded');
    expect(r1.serialized).toBe(true);
    const r2 = mod.runLaunchAcquire({ env: { VIHS_SUBAGENT_ID: '1' }, worktreeCount: 1, identity: 'X', log: () => {}, now: () => 1, sleep: () => {} }, { group: 'bench', maxAttempts: 2 }); // no acquireLease at all
    expect(r2.mode).toBe('advisory-degraded');
  });
  it('runLaunchAcquire samples capability at most ONCE across retries (bounded disk benchmark)', () => {
    let calls = 0;
    const deps = makeAcquireDeps({ acquireLease: () => ({ granted: false, holder: { owner: 'X' } }), sampleCapability: () => { calls += 1; return { cpu: { loadPerCore: 0.1 }, gpu: { present: false }, disk: { present: false } }; } });
    mod.runLaunchAcquire(deps.deps, { group: 'bench', maxAttempts: 4 });
    expect(calls).toBe(1); // one sample reused across all 4 contention records, not 4 fsync benchmarks
  });
});
