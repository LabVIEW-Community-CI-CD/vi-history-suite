// prototype/systemFingerprint.mjs (board #2315) -- LINUX track:system-fingerprint
//
// Per-actor STATIC capability fingerprint for Mirror Mode #2315. Its "system-capability awareness"
// needs each mirror/actor fingerprinted so cold/warm render timings are comparable across very
// different hardware. scripts/systemCapability.js already captures the DYNAMIC pressure signal
// (cpu loadPerCore, gpu util, disk MB/s); this captures the STATIC identity half:
//   CPU model + logical cores, total/available RAM, disk free + filesystem type,
//   OS/runtime/bitness (+ a labviewBuild hook), plus a stable fingerprintId keyed on the
//   NON-volatile identity fields so the reconciler can key an actor across runs.
//
// PROTOTYPE experiment (not on develop). Pure logic (bitnessFromArch, bytesToMB,
// summarizeFingerprint, fingerprintId) is unit-tested; the OS/statfs probe is DEPENDENCY-INJECTED
// (sampleFingerprint takes an `io` bag) so the orchestration is real-tested with fakes. Only
// defaultIo() (the real binding) + the import.meta.url CLI are v8-ignored, per the steer. Composes
// with systemCapability's dynamic signal into a full per-actor capability record for #2315.

import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const SCHEMA = 'vi-history-suite/system-fingerprint@v1';

// ------------------------------- pure logic (unit-tested) -------------------------------

/** 64/32 bit width from a Node process.arch, or null for an unknown arch. */
export function bitnessFromArch(arch) {
  const a = String(arch || '');
  if (a === 'x64' || a === 'arm64' || a === 'ppc64' || a === 'ppc64le' || a === 's390x' || a === 'loong64' || a === 'riscv64') return 64;
  if (a === 'ia32' || a === 'arm' || a === 'mips' || a === 'mipsel') return 32;
  return null;
}

/** Bytes -> whole MB (MB = 1e6), null for a bad/negative input. */
export function bytesToMB(bytes) {
  const b = Number(bytes);
  if (!Number.isFinite(b) || b < 0) return null;
  return Math.round(b / 1e6);
}

/** Normalize a raw probe bag into the stable fingerprint shape. Pure. */
export function summarizeFingerprint(raw) {
  raw = raw || {};
  const cpus = Array.isArray(raw.cpus) ? raw.cpus : [];
  const model = cpus.length && cpus[0] && cpus[0].model
    ? String(cpus[0].model).trim().replace(/\s+/g, ' ')
    : null;
  const statfs = raw.statfs || {};
  const freeMB = (Number.isFinite(statfs.bsize) && Number.isFinite(statfs.bavail))
    ? bytesToMB(statfs.bsize * statfs.bavail)
    : null;
  return {
    cpu: { model, logicalCores: cpus.length || null },
    memory: { totalMB: bytesToMB(raw.totalmem), availableMB: bytesToMB(raw.freemem) },
    disk: { freeMB, fsTypeId: Number.isFinite(statfs.type) ? statfs.type : null },
    os: { platform: raw.platform || null, release: raw.release || null, arch: raw.arch || null, bitness: bitnessFromArch(raw.arch) },
    labviewBuild: raw.labviewBuild || null
  };
}

/** Stable 12-hex id from the NON-volatile identity fields only (excludes availableMB / disk freeMB,
 *  which drift run-to-run) so the reconciler keys the same actor across runs. Pure + deterministic. */
export function fingerprintId(fp) {
  fp = fp || {};
  const cpu = fp.cpu || {};
  const mem = fp.memory || {};
  const osInfo = fp.os || {};
  const disk = fp.disk || {};
  const stable = [
    cpu.model, cpu.logicalCores, mem.totalMB,
    osInfo.platform, osInfo.release, osInfo.arch, osInfo.bitness,
    disk.fsTypeId, fp.labviewBuild
  ].map((v) => (v == null ? '' : String(v))).join('|');
  return crypto.createHash('sha256').update(stable).digest('hex').slice(0, 12);
}

export const constants = { SCHEMA };

// ---------------- DI'd orchestration (real-tested with fakes, NOT v8-ignored) ----------------

/** Capture a fingerprint over an injected io bag (os/statfs/clock probes). */
export function sampleFingerprint(io) {
  const fp = summarizeFingerprint({
    cpus: io.cpus(),
    totalmem: io.totalmem(),
    freemem: io.freemem(),
    platform: io.platform(),
    release: io.release(),
    arch: io.arch(),
    statfs: io.statfs(),
    labviewBuild: io.labviewBuild()
  });
  return { schema: SCHEMA, capturedAt: io.now(), fingerprintId: fingerprintId(fp), fingerprint: fp };
}

/* v8 ignore start */ // real os/statfs/clock binding + CLI entry: host dependent
export function defaultIo() {
  return {
    cpus: () => os.cpus() || [],
    totalmem: () => os.totalmem(),
    freemem: () => os.freemem(),
    platform: () => os.platform(),
    release: () => os.release(),
    arch: () => os.arch(),
    statfs: () => { try { return fs.statfsSync('/'); } catch { return {}; } },
    labviewBuild: () => null, // hook: probe a LabVIEW build id when running on a LabVIEW host
    now: () => new Date().toISOString()
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  console.log(JSON.stringify(sampleFingerprint(defaultIo()), null, 2));
}
/* v8 ignore stop */
