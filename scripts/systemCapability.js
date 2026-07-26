'use strict';
// scripts/systemCapability.js (VHS-REQ-719) -- shared per-actor system-capability sampler.
//
// Single source of truth for the CPU + GPU + DISK resource snapshot that the contention ledger
// records (issue #2438, board #2315). Both the pre-push gate (scripts/prePushGate.js) and the
// agent-launch gate consume it so there is ONE { cpu, gpu, disk } record schema. `summarizeDisk`
// is a drop-in for the inlined normalizer added to prePushGate.js in #2435 ({ present, writeMBps,
// readMBps }) plus a compute fallback for a raw { bytes, writeMs, readMs } micro-benchmark sample.
//
// Coverage discipline (VHS-REQ-719, v8-ignore-is-tech-debt steer): the pure logic (transferMBps,
// summarizeDisk, classifyDiskPressure) and the sampling ORCHESTRATION are dependency-injected --
// each sample* takes an explicit `io` bag so it is real-tested with fakes (no real disk/gpu/clock).
// Only defaultIo() (the real binding) + capture() + the require.main CLI are v8-ignored.

const DEFAULT_BENCH_BYTES = 16 * 1024 * 1024; // 16 MiB: times meaningfully, quick enough to probe
const DISK_SLOW_WRITE_MBPS = 50;  // fsync'd write MB/s <= this => disk-heavy (saturated/slow device)
const DISK_SLOW_READ_MBPS = 80;   // read MB/s <= this => disk-heavy

// ------------------------------- pure logic (unit-tested) -------------------------------

/** Transfer rate in MB/s (MB = 1e6 bytes) from a byte count + elapsed ms; null for a bad duration. */
function transferMBps(bytes, ms) {
  const b = Number(bytes) || 0;
  const t = Number(ms) || 0;
  if (t <= 0) return null;
  return Number((b / 1e6 / (t / 1000)).toFixed(1));
}

/** Normalize a raw disk sample into the shared { present, writeMBps, readMBps } shape. Drop-in for
 *  the prePushGate.js #2435 normalizer (Number.isFinite-guarded, no NaN leak); additionally computes
 *  from a raw { bytes, writeMs, readMs } micro-benchmark sample when the MB/s fields are absent. */
function summarizeDisk(rawDisk) {
  rawDisk = rawDisk || {};
  let writeMBps = Number.isFinite(rawDisk.writeMBps) ? rawDisk.writeMBps : null;
  let readMBps = Number.isFinite(rawDisk.readMBps) ? rawDisk.readMBps : null;
  if (writeMBps === null && rawDisk.bytes != null && rawDisk.writeMs != null) writeMBps = transferMBps(rawDisk.bytes, rawDisk.writeMs);
  if (readMBps === null && rawDisk.bytes != null && rawDisk.readMs != null) readMBps = transferMBps(rawDisk.bytes, rawDisk.readMs);
  return { present: writeMBps != null || readMBps != null, writeMBps, readMBps };
}

/** Disk pressure: an achieved transfer rate at/below a slow floor (a saturated/contended disk
 *  benchmarks slow). Mirrors gpuHeavy/cpuHeavy so contention can be attributed to DISK. writeMBps
 *  is the primary (fsync'd device) signal; readMBps is secondary (warm-cache influenced). */
function classifyDiskPressure(disk, opts) {
  opts = opts || {};
  const slowWrite = typeof opts.slowWriteMBps === 'number' ? opts.slowWriteMBps : DISK_SLOW_WRITE_MBPS;
  const slowRead = typeof opts.slowReadMBps === 'number' ? opts.slowReadMBps : DISK_SLOW_READ_MBPS;
  disk = disk || {};
  if (!disk.present) return false;
  const writeHeavy = typeof disk.writeMBps === 'number' && disk.writeMBps <= slowWrite;
  const readHeavy = typeof disk.readMBps === 'number' && disk.readMBps <= slowRead;
  return writeHeavy || readHeavy;
}

// ---------------- sampling orchestration (DI: io explicit, real-tested with fakes) ----------------

/** Real disk read/write transfer-rate micro-benchmark over an injected io bag: write bytes with an
 *  fsync (times the device, not just page cache), then read back; clean up. Returns a raw sample. */
function sampleDiskTransfer(opts, io) {
  opts = opts || {};
  const bytes = Number(opts.bytes) || DEFAULT_BENCH_BYTES;
  const file = io.join(opts.dir || io.tmpdir(), '.vihs-syscap-' + io.pid + '-' + io.now() + '.tmp');
  const buf = io.alloc(bytes);
  let writeMs = null;
  let readMs = null;
  try {
    const wStart = io.hrtime();
    const fd = io.openSync(file, 'w');
    try { io.writeSync(fd, buf); io.fsyncSync(fd); } finally { io.closeSync(fd); }
    writeMs = io.elapsedMs(wStart);
    const rStart = io.hrtime();
    io.readFileSync(file);
    readMs = io.elapsedMs(rStart);
  } catch { /* best effort: observability never blocks */ }
  finally { try { io.unlinkSync(file); } catch { /* ignore */ } }
  return { bytes, writeMs, readMs, writeMBps: transferMBps(bytes, writeMs), readMBps: transferMBps(bytes, readMs) };
}

/** CPU sample (loadPerCore) over an injected io bag. */
function sampleCpu(io) {
  const load = io.loadavg();
  const cores = io.cpuCount();
  const load1 = (Array.isArray(load) ? load[0] : 0) || 0;
  return { load1: Number(load1.toFixed(3)), cores, loadPerCore: cores > 0 ? Number((load1 / cores).toFixed(3)) : null };
}

/** GPU sample (present/util) over an injected io bag; nvidiaSmi() throwing => not present. */
function sampleGpu(io) {
  try {
    const out = io.nvidiaSmi();
    const util = parseInt(String(out).trim().split('\n')[0], 10);
    return { present: true, util: Number.isFinite(util) ? util : null };
  } catch { return { present: false, util: null }; }
}

/** Combined per-actor system-capability snapshot: DISK alongside CPU and GPU (board #2315). */
function sampleSystemCapability(opts, io) {
  return { cpu: sampleCpu(io), gpu: sampleGpu(io), disk: summarizeDisk(sampleDiskTransfer(opts, io)) };
}

const constants = { DEFAULT_BENCH_BYTES, DISK_SLOW_WRITE_MBPS, DISK_SLOW_READ_MBPS };

module.exports = {
  transferMBps,
  summarizeDisk,
  classifyDiskPressure,
  sampleDiskTransfer,
  sampleCpu,
  sampleGpu,
  sampleSystemCapability,
  constants,
  // real-binding conveniences (below, v8-ignored):
  get defaultIo() { return defaultIo; },
  get capture() { return capture; }
};

/* v8 ignore start */ // real io binding + capture() convenience + CLI entry: host/timing dependent
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function defaultIo() {
  return {
    pid: process.pid,
    now: Date.now,
    join: path.join,
    tmpdir: os.tmpdir,
    alloc: (n) => Buffer.alloc(n, 0x61),
    hrtime: process.hrtime.bigint,
    elapsedMs: (start) => Number(process.hrtime.bigint() - start) / 1e6,
    openSync: fs.openSync,
    writeSync: fs.writeSync,
    fsyncSync: fs.fsyncSync,
    closeSync: fs.closeSync,
    readFileSync: fs.readFileSync,
    unlinkSync: fs.unlinkSync,
    loadavg: () => (os.loadavg ? os.loadavg() : [0, 0, 0]),
    cpuCount: () => (os.cpus() || []).length,
    nvidiaSmi: () => execFileSync('nvidia-smi', ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 1500 })
  };
}

/** Capture a real cpu+gpu+disk snapshot using the default io binding. */
function capture(opts) { return sampleSystemCapability(opts, defaultIo()); }

if (require.main === module) {
  const out = { schema: 'vi-history-suite/system-capability@v1', capturedAt: new Date().toISOString(), capability: capture(), diskHeavy: false };
  out.diskHeavy = classifyDiskPressure(out.capability.disk);
  console.log(JSON.stringify(out, null, 2));
}
/* v8 ignore stop */
