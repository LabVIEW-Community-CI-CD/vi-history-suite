import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sc = require('../../scripts/systemCapability.js');

// VHS-REQ-719 (VHS #2392 agent-coordination, issue #2438): shared per-actor system-capability
// sampler -- ONE { cpu, gpu, disk } record schema for the contention ledger, consumed by the
// pre-push gate and the agent-launch gate. Pure logic (transferMBps, summarizeDisk,
// classifyDiskPressure) and the sampling ORCHESTRATION are dependency-injected, so the I/O
// paths are real-tested here with fakes; only defaultIo()/capture()/CLI are v8-ignored.

interface FakeIoOptions {
  elapsed?: number[];
  openThrows?: boolean;
  loadavg?: unknown;
  cpuCount?: number;
  nvidiaSmi?: () => string;
}

function makeFakeIo(opts: FakeIoOptions = {}) {
  const calls: Record<string, number> = {};
  const bump = (k: string) => { calls[k] = (calls[k] || 0) + 1; };
  const elapsed = [...(opts.elapsed ?? [10, 5])];
  const io = {
    pid: 4321,
    now: () => 777,
    join: (...p: string[]) => p.join('/'),
    tmpdir: () => '/tmp',
    alloc: (n: number) => ({ length: n }),
    hrtime: () => { bump('hrtime'); return 0n; },
    elapsedMs: () => { bump('elapsedMs'); return elapsed.length ? (elapsed.shift() as number) : 0; },
    openSync: () => { bump('openSync'); if (opts.openThrows) throw new Error('open failed'); return 7; },
    writeSync: () => { bump('writeSync'); },
    fsyncSync: () => { bump('fsyncSync'); },
    closeSync: () => { bump('closeSync'); },
    readFileSync: () => { bump('readFileSync'); return Buffer.alloc(0); },
    unlinkSync: () => { bump('unlinkSync'); },
    loadavg: () => (opts.loadavg !== undefined ? opts.loadavg : [2, 1, 1]),
    cpuCount: () => (opts.cpuCount !== undefined ? opts.cpuCount : 8),
    nvidiaSmi: opts.nvidiaSmi ?? (() => '42')
  };
  return { io, calls };
}

describe('systemCapability.transferMBps (VHS-REQ-719)', () => {
  it('computes MB/s (MB = 1e6) and guards a non-positive duration', () => {
    expect(sc.transferMBps(16 * 1024 * 1024, 10)).toBe(1677.7);
    expect(sc.transferMBps(1e6, 1000)).toBe(1);
    expect(sc.transferMBps(0, 10)).toBe(0);
    expect(sc.transferMBps(1000, 0)).toBeNull();
    expect(sc.transferMBps(1000, -5)).toBeNull();
    expect(sc.transferMBps(NaN, 10)).toBe(0);
  });
});

describe('systemCapability.summarizeDisk (VHS-REQ-719)', () => {
  it('is a drop-in for the prePushGate #2435 shape (precomputed MB/s, NaN-guarded)', () => {
    expect(sc.summarizeDisk({ writeMBps: 954.7, readMBps: 3531.8 })).toEqual({ present: true, writeMBps: 954.7, readMBps: 3531.8 });
    expect(sc.summarizeDisk({ writeMBps: 900 })).toEqual({ present: true, writeMBps: 900, readMBps: null });
    expect(sc.summarizeDisk({ writeMBps: NaN, readMBps: NaN })).toEqual({ present: false, writeMBps: null, readMBps: null });
    expect(sc.summarizeDisk(undefined)).toEqual({ present: false, writeMBps: null, readMBps: null });
  });
  it('computes MB/s from a raw { bytes, writeMs, readMs } micro-benchmark sample when absent', () => {
    expect(sc.summarizeDisk({ bytes: 16 * 1024 * 1024, writeMs: 10, readMs: 5 })).toEqual({ present: true, writeMBps: 1677.7, readMBps: 3355.4 });
    // mixed: precomputed write is kept, read is computed from the raw sample
    expect(sc.summarizeDisk({ writeMBps: 900, bytes: 16 * 1024 * 1024, readMs: 5 })).toEqual({ present: true, writeMBps: 900, readMBps: 3355.4 });
  });
});

describe('systemCapability.classifyDiskPressure (VHS-REQ-719)', () => {
  it('flags a slow/saturated disk on write OR read, honors tunable thresholds, else false', () => {
    expect(sc.classifyDiskPressure({ present: false })).toBe(false);
    expect(sc.classifyDiskPressure(undefined)).toBe(false);
    expect(sc.classifyDiskPressure({ present: true, writeMBps: 40, readMBps: 500 })).toBe(true); // writeHeavy
    expect(sc.classifyDiskPressure({ present: true, writeMBps: 500, readMBps: 70 })).toBe(true); // readHeavy
    expect(sc.classifyDiskPressure({ present: true, writeMBps: 500, readMBps: 500 })).toBe(false); // fast: neither
    expect(sc.classifyDiskPressure({ present: true, writeMBps: null, readMBps: 70 })).toBe(true); // read-only signal
    expect(sc.classifyDiskPressure({ present: true, writeMBps: 100, readMBps: 500 }, { slowWriteMBps: 200 })).toBe(true);
    expect(sc.classifyDiskPressure({ present: true, writeMBps: 300, readMBps: 300 }, { slowWriteMBps: 200, slowReadMBps: 200 })).toBe(false);
  });
});

describe('systemCapability.sampleDiskTransfer (VHS-REQ-719, DI I/O)', () => {
  it('times an fsync-ed write + read-back and computes MB/s over injected io', () => {
    const { io, calls } = makeFakeIo({ elapsed: [10, 5] });
    const raw = sc.sampleDiskTransfer({}, io);
    expect(raw.bytes).toBe(16 * 1024 * 1024);
    expect(raw.writeMs).toBe(10);
    expect(raw.readMs).toBe(5);
    expect(raw.writeMBps).toBe(1677.7);
    expect(raw.readMBps).toBe(3355.4);
    expect(calls.writeSync).toBe(1);
    expect(calls.fsyncSync).toBe(1); // fsync => the device is timed, not just page cache
    expect(calls.closeSync).toBe(1);
    expect(calls.readFileSync).toBe(1);
    expect(calls.unlinkSync).toBe(1); // cleaned up
  });
  it('honors a custom byte count', () => {
    const { io } = makeFakeIo({ elapsed: [1000, 1000] });
    const raw = sc.sampleDiskTransfer({ bytes: 1e6 }, io);
    expect(raw.writeMBps).toBe(1);
    expect(raw.readMBps).toBe(1);
  });
  it('never throws: an I/O failure yields null timings and still attempts cleanup', () => {
    const { io, calls } = makeFakeIo({ openThrows: true });
    const raw = sc.sampleDiskTransfer({}, io);
    expect(raw.writeMs).toBeNull();
    expect(raw.readMs).toBeNull();
    expect(raw.writeMBps).toBeNull();
    expect(raw.readMBps).toBeNull();
    expect(calls.fsyncSync).toBeUndefined(); // never reached
    expect(calls.unlinkSync).toBe(1); // finally still runs
  });
});

describe('systemCapability.sampleCpu (VHS-REQ-719, DI I/O)', () => {
  it('computes loadPerCore and guards zero cores / a non-array loadavg', () => {
    const { io } = makeFakeIo({ loadavg: [4, 1, 1], cpuCount: 8 });
    expect(sc.sampleCpu(io)).toEqual({ load1: 4, cores: 8, loadPerCore: 0.5 });
    const zero = makeFakeIo({ loadavg: [4, 1, 1], cpuCount: 0 });
    expect(sc.sampleCpu(zero.io)).toEqual({ load1: 4, cores: 0, loadPerCore: null });
    const bad = makeFakeIo({ loadavg: 'nope', cpuCount: 4 });
    expect(sc.sampleCpu(bad.io)).toEqual({ load1: 0, cores: 4, loadPerCore: 0 });
  });
});

describe('systemCapability.sampleGpu (VHS-REQ-719, DI I/O)', () => {
  it('parses utilization, nulls a non-numeric reading, and treats a probe failure as absent', () => {
    expect(sc.sampleGpu(makeFakeIo({ nvidiaSmi: () => '73' }).io)).toEqual({ present: true, util: 73 });
    expect(sc.sampleGpu(makeFakeIo({ nvidiaSmi: () => '55\n60' }).io)).toEqual({ present: true, util: 55 });
    expect(sc.sampleGpu(makeFakeIo({ nvidiaSmi: () => 'N/A' }).io)).toEqual({ present: true, util: null });
    expect(sc.sampleGpu(makeFakeIo({ nvidiaSmi: () => { throw new Error('no smi'); } }).io)).toEqual({ present: false, util: null });
  });
});

describe('systemCapability.sampleSystemCapability (VHS-REQ-719, DI I/O)', () => {
  it('composes one unified { cpu, gpu, disk } snapshot', () => {
    const { io } = makeFakeIo({ elapsed: [10, 5], loadavg: [4, 1, 1], cpuCount: 8, nvidiaSmi: () => '73' });
    expect(sc.sampleSystemCapability({}, io)).toEqual({
      cpu: { load1: 4, cores: 8, loadPerCore: 0.5 },
      gpu: { present: true, util: 73 },
      disk: { present: true, writeMBps: 1677.7, readMBps: 3355.4 }
    });
  });
});

describe('systemCapability module surface (VHS-REQ-719)', () => {
  it('exports constants and the real-binding conveniences', () => {
    expect(sc.constants).toEqual({ DEFAULT_BENCH_BYTES: 16 * 1024 * 1024, DISK_SLOW_WRITE_MBPS: 50, DISK_SLOW_READ_MBPS: 80 });
    expect(typeof sc.defaultIo).toBe('function'); // v8-ignored real binding, referenced not invoked
    expect(typeof sc.capture).toBe('function');
  });
});
