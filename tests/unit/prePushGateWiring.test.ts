import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pg = require('../../scripts/prePushGate.js');

// VHS-REQ-719 (VHS #2392 agent-coordination): the pre-push hook wires the agent gateway
// to serialize the resource-heavy validation phase across concurrent agents, recording
// contended retries as timestamped CPU/GPU-correlated signals. Pure decision logic is
// tested here + mapped; the git/probe/ledger/retry I/O shim is v8-ignored (integration).

describe('prePushGate.shouldEnforce (VHS-REQ-719)', () => {
  it('enforces in a multi-agent context, stays advisory for a solo push', () => {
    expect(pg.shouldEnforce({ VIHS_SUBAGENT_ID: '2411' }, 1)).toBe(true); // explicit subagent lane
    expect(pg.shouldEnforce({}, 2)).toBe(true); // >1 worktree
    expect(pg.shouldEnforce({}, 1)).toBe(false); // solo, single worktree
    expect(pg.shouldEnforce({}, 0)).toBe(false);
    expect(pg.shouldEnforce(undefined, undefined)).toBe(false);
  });
});

describe('prePushGate.backoffMs (VHS-REQ-719)', () => {
  it('is exponential and capped', () => {
    expect(pg.backoffMs(0)).toBe(250);
    expect(pg.backoffMs(1)).toBe(500);
    expect(pg.backoffMs(2)).toBe(1000);
    expect(pg.backoffMs(10)).toBe(4000); // capped
    expect(pg.backoffMs(-5)).toBe(250); // guarded
    expect(pg.backoffMs(3, 100, 1000)).toBe(800);
  });
});

describe('prePushGate.classifyAcquireOutcome (VHS-REQ-719)', () => {
  it('acquired -> done; last attempt -> advisory-degraded; else retry', () => {
    expect(pg.classifyAcquireOutcome(true, 0, 6)).toEqual({ done: true, mode: 'acquired' });
    expect(pg.classifyAcquireOutcome(false, 5, 6)).toEqual({ done: true, mode: 'advisory-degraded' });
    expect(pg.classifyAcquireOutcome(false, 0, 6)).toEqual({ done: false, mode: 'retry' });
  });
});

describe('prePushGate.summarizeResources (VHS-REQ-719)', () => {
  it('computes CPU load-per-core + util%, carries GPU presence/util', () => {
    const s = pg.summarizeResources({ load1: 4, cores: 8, cpuUtilPct: 42.6, gpuPresent: true, gpuUtil: 73 });
    expect(s.cpu).toEqual({ load1: 4, cores: 8, loadPerCore: 0.5, utilPct: 43 });
    expect(s.gpu).toEqual({ present: true, util: 73 });
  });
  it('accepts a loadavg array and guards zero cores / absent GPU / absent util', () => {
    const s = pg.summarizeResources({ loadavg: [2, 1, 1], cores: 0 });
    expect(s.cpu.load1).toBe(2);
    expect(s.cpu.loadPerCore).toBeNull(); // no cores -> no per-core signal
    expect(s.cpu.utilPct).toBeNull();
    expect(s.gpu).toEqual({ present: false, util: null });
    expect(pg.summarizeResources(undefined).cpu.load1).toBe(0);
    // NaN must never leak into a ledger record
    const nan = pg.summarizeResources({ load1: NaN, cpuUtilPct: NaN, gpuUtil: NaN, cores: 4 });
    expect(nan.cpu.load1).toBe(0);
    expect(nan.cpu.utilPct).toBeNull();
    expect(nan.gpu.util).toBeNull();
  });
});

describe('prePushGate.resolveMaxAttempts (VHS-REQ-719)', () => {
  it('takes a positive integer, else the default (guards silent loop-disable)', () => {
    expect(pg.resolveMaxAttempts('3', 6)).toBe(3);
    expect(pg.resolveMaxAttempts(undefined, 6)).toBe(6);
    expect(pg.resolveMaxAttempts('0', 6)).toBe(6);
    expect(pg.resolveMaxAttempts('-2', 6)).toBe(6); // negative would skip the acquire loop
    expect(pg.resolveMaxAttempts('abc', 6)).toBe(6);
    expect(pg.resolveMaxAttempts('2.5', 6)).toBe(6); // non-integer
    expect(pg.resolveMaxAttempts('4')).toBe(4); // falls back to DEFAULT_MAX_ATTEMPTS internally
    expect(pg.resolveMaxAttempts('bad', 0)).toBe(6); // a falsy/invalid default cannot disable the loop
    expect(pg.resolveMaxAttempts('bad', 3)).toBe(3);
  });
});

describe('prePushGate.buildContentionRecord (VHS-REQ-719)', () => {
  it('builds a timestamped, resource-correlated ledger record', () => {
    const rec = pg.buildContentionRecord({
      now: Date.parse('2026-01-01T00:00:00Z'),
      event: 'retry',
      resource: 'pre-push-validation',
      identity: 'WIN/2411',
      attempt: 2,
      waitedMs: 750,
      resources: { load1: 6, cores: 4, gpuPresent: true, gpuUtil: 90 }
    });
    expect(rec).toMatchObject({
      ts: '2026-01-01T00:00:00.000Z',
      event: 'retry',
      resource: 'pre-push-validation',
      identity: 'WIN/2411',
      attempt: 2,
      waitedMs: 750
    });
    expect(rec.resources.cpu.loadPerCore).toBe(1.5); // 6/4 -> CPU-pressure signal
    expect(rec.resources.gpu).toEqual({ present: true, util: 90 });
  });
  it('defaults event fields safely', () => {
    const rec = pg.buildContentionRecord({ event: 'advisory-degraded' });
    expect(rec.event).toBe('advisory-degraded');
    expect(rec.resource).toBe(pg.RESOURCE);
    expect(rec.identity).toBe('UNKNOWN/main');
    expect(rec.attempt).toBe(0);
  });
  it('preserves a valid epoch-0 timestamp (nullish, not falsy)', () => {
    expect(pg.buildContentionRecord({ now: 0, event: 'retry' }).ts).toBe('1970-01-01T00:00:00.000Z');
  });
});
