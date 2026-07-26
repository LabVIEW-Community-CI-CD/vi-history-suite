// prototype/diskBenchmark.mjs (VHS-REQ-719, board #2315) -- LINUX track:disk-benchmark
//
// Hard-disk transfer-rate benchmarking as the THIRD per-actor system-capability dimension
// ALONGSIDE CPU (loadPerCore) and GPU (util), for the contention ledger + benchmark-phase
// correlation (board #2315). Disk transfer rate gates IO-heavy phases (VI render staging,
// dataset writes, git operations); capturing it alongside cpu/gpu lets a contention point be
// attributed to DISK pressure, not just CPU or GPU.
//
// INDEPENDENT + self-contained: this module does NOT edit or import WIN's in-flight
// scripts/prePushGate.js summarizeResources. It produces a disk dimension + a combined
// { cpu, gpu, disk } capability snapshot in the SAME record shape the ledger already uses
// (cpu.loadPerCore, gpu.present/util) PLUS disk.{ writeMBps, readMBps }. The disk dimension
// COMPOSES into the resources snapshot at the record-building site (in the launch-gate I/O,
// wired after WIN's ping) -- no change to WIN's file, no collision.
//
// PURE logic (transferMBps, summarizeDisk, classifyDiskPressure) is unit-tested via the
// selftest; the filesystem micro-benchmark + probes + CLI are the timing-dependent I/O shim.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DEFAULT_BENCH_BYTES = 16 * 1024 * 1024; // 16 MiB: big enough to time meaningfully, quick enough to probe
const DISK_SLOW_WRITE_MBPS = 50;  // achieved fsync'd write MB/s <= this => disk-heavy (saturated/slow device)
const DISK_SLOW_READ_MBPS = 80;   // achieved read MB/s <= this => disk-heavy

// ------------------------------- pure logic (unit-tested) -------------------------------

/** Transfer rate in MB/s (MB = 1e6 bytes, the storage transfer-rate convention) from a byte
 *  count + elapsed milliseconds. Returns null for a non-positive duration. */
export function transferMBps(bytes, ms) {
  const b = Number(bytes) || 0;
  const t = Number(ms) || 0;
  if (t <= 0) return null;
  return Number((b / 1e6 / (t / 1000)).toFixed(1));
}

/** Normalize a raw disk micro-benchmark sample into the ledger disk dimension. Accepts either
 *  pre-computed {writeMBps, readMBps} or raw {bytes, writeMs, readMs}. */
export function summarizeDisk(raw) {
  raw = raw || {};
  const writeMBps = typeof raw.writeMBps === 'number' ? raw.writeMBps : transferMBps(raw.bytes, raw.writeMs);
  const readMBps = typeof raw.readMBps === 'number' ? raw.readMBps : transferMBps(raw.bytes, raw.readMs);
  return {
    present: writeMBps != null || readMBps != null,
    writeMBps: writeMBps == null ? null : writeMBps,
    readMBps: readMBps == null ? null : readMBps
  };
}

/** Disk pressure: an achieved transfer rate at/below a slow floor (a saturated/contended disk
 *  benchmarks slow). Mirrors the gpuHeavy/cpuHeavy contention signals so the phase-bucketing
 *  can add a diskHeavy dimension. writeMBps is the primary (fsync'd device) signal; readMBps
 *  is secondary (warm-cache influenced, so it only flags genuine slowness). */
export function classifyDiskPressure(disk, opts) {
  opts = opts || {};
  const slowWrite = typeof opts.slowWriteMBps === 'number' ? opts.slowWriteMBps : DISK_SLOW_WRITE_MBPS;
  const slowRead = typeof opts.slowReadMBps === 'number' ? opts.slowReadMBps : DISK_SLOW_READ_MBPS;
  disk = disk || {};
  if (!disk.present) return false;
  const writeHeavy = typeof disk.writeMBps === 'number' && disk.writeMBps <= slowWrite;
  const readHeavy = typeof disk.readMBps === 'number' && disk.readMBps <= slowRead;
  return writeHeavy || readHeavy;
}

export const constants = { DEFAULT_BENCH_BYTES, DISK_SLOW_WRITE_MBPS, DISK_SLOW_READ_MBPS };

// ------------------------------- I/O shim (integration-only) -------------------------------
/* v8 ignore start */ // filesystem micro-benchmark + resource probes + CLI: timing/host dependent

/** Real disk read/write transfer-rate micro-benchmark: write bytes to a temp file with an
 *  fsync (so the WRITE times the device, not just the page cache), then read it back. Cleans
 *  up. Note: the read is warm-cache influenced (a true cold read needs cache-drop/root), so
 *  readMBps is a relative signal that flags only genuine slowness. Returns a raw sample. */
export function sampleDiskTransfer(opts) {
  opts = opts || {};
  const bytes = Number(opts.bytes) || DEFAULT_BENCH_BYTES;
  const dir = opts.dir || os.tmpdir();
  const file = path.join(dir, '.vihs-disk-bench-' + process.pid + '-' + Date.now() + '.tmp');
  const buf = Buffer.alloc(bytes, 0x61);
  let writeMs = null;
  let readMs = null;
  try {
    const wStart = process.hrtime.bigint();
    const fd = fs.openSync(file, 'w');
    try { fs.writeSync(fd, buf); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    writeMs = Number(process.hrtime.bigint() - wStart) / 1e6;
    const rStart = process.hrtime.bigint();
    fs.readFileSync(file);
    readMs = Number(process.hrtime.bigint() - rStart) / 1e6;
  } catch { /* best effort: observability never blocks */ }
  finally { try { fs.unlinkSync(file); } catch { /* ignore */ } }
  return { bytes, writeMs, readMs, writeMBps: transferMBps(bytes, writeMs), readMBps: transferMBps(bytes, readMs) };
}

/** CPU sample (loadPerCore) -- self-contained, matches the ledger cpu shape. */
function sampleCpu() {
  const load = os.loadavg ? os.loadavg() : [0, 0, 0];
  const cores = (os.cpus() || []).length;
  const load1 = load[0] || 0;
  return { load1: Number(load1.toFixed(3)), cores, loadPerCore: cores > 0 ? Number((load1 / cores).toFixed(3)) : null };
}

/** GPU sample (present/util) via nvidia-smi -- self-contained, matches the ledger gpu shape. */
function sampleGpu() {
  try {
    const out = execFileSync('nvidia-smi', ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 1500 });
    const util = parseInt(String(out).trim().split('\n')[0], 10);
    return { present: true, util: Number.isFinite(util) ? util : null };
  } catch { return { present: false, util: null }; }
}

/** Combined per-actor system-capability snapshot: DISK alongside CPU and GPU (board #2315).
 *  Same shape the contention ledger uses, extended with a disk dimension. */
export function sampleSystemCapability(opts) {
  return { cpu: sampleCpu(), gpu: sampleGpu(), disk: summarizeDisk(sampleDiskTransfer(opts)) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const sub = process.argv[2] || 'sample';
  if (sub === 'sample' || sub === 'bench') {
    const capability = sampleSystemCapability();
    const out = {
      schema: 'vi-history-suite/system-capability@v1',
      capturedAt: new Date().toISOString(),
      capability,
      pressure: {
        diskHeavy: classifyDiskPressure(capability.disk),
        gpuPresent: capability.gpu.present
      }
    };
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.error('usage: node prototype/diskBenchmark.mjs [sample|bench]');
    process.exit(2);
  }
}
/* v8 ignore stop */
