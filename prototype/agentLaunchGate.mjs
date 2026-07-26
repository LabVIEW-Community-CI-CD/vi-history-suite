// prototype/agentLaunchGate.mjs (VHS-REQ-719, board #2315) -- LINUX track:agent-launch-gate
//
// Agent-LAUNCH gate experiment: serialize subagent SPAWNS on one machine via the merged
// agent gateway lease (scripts/agentGateway.js), and record launch-contention into the SAME
// contention ledger as the pre-push gate (scripts/prePushGate.js), so spawn contention is
// timestamped + resource-attributed (CPU loadPerCore / GPU util) and correlatable to a
// benchmark timeline (GPU-heavy vs CPU-heavy phases). Feeds board #2315 (per-actor
// system-capability benchmarking): the contention ledger IS a per-actor capability signal.
//
// Design envelope (agreed cross-plane, discussioncomment-17789318 / 17789319):
//   resource = agent-launch:<group>; acquire before a subagent spawns; SAME bounded-wait
//   ADVISORY-DEGRADE as the pre-push gate (a launch is NEVER hard-blocked -- a deadlocked
//   launch gate is worse than contention); short TTL (30-60s) so a crashed launcher
//   self-clears fast; per-retry resource sample; release by PPID-keyed token.
//
// THIS FILE = PURE logic + selftest (WIN-independent, zero imports). The I/O CLI (lease loop
// via scripts/agentGateway.js + ledger via scripts/prePushGate.js summarizeResources /
// buildContentionRecord) wires on WIN's ping AFTER #2423 lands the fixed ledger API, so the
// pure logic here consumes only the STABLE ledger record shape, never the in-flight internals.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as gw from './agentGateway.mjs';
import { sampleSystemCapability, classifyDiskPressure } from './diskBenchmark.mjs';

const LAUNCH_RESOURCE_PREFIX = 'agent-launch:';
const DEFAULT_LAUNCH_TTL_SEC = 45;      // 30-60s envelope: short so a crashed launcher self-clears
const DEFAULT_LAUNCH_MAX_ATTEMPTS = 5;  // brief bounded retry, then advisory-degrade (never hard-block)
const GPU_BUSY_UTIL = 50;               // util% >= this => GPU-heavy contention
const CPU_BUSY_LOAD_PER_CORE = 0.7;     // loadavg1/cores >= this => CPU-heavy contention

/** Stable, sanitized resource name for a launch group. */
export function launchResource(group) {
  const raw = group == null ? '' : String(group);
  const g = raw.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return LAUNCH_RESOURCE_PREFIX + (g || 'default');
}

/** Serialize spawns only when more than one agent could spawn on this machine (an explicit
 *  subagent lane, or >1 git worktree). Solo -> skip (advisory, zero friction). Mirrors the
 *  pre-push gate's shouldEnforce so the two gates share one multi-agent-context definition. */
export function shouldSerializeLaunch(env, worktreeCount) {
  env = env || {};
  if (env.VIHS_SUBAGENT_ID) return true;
  return Number(worktreeCount || 0) > 1;
}

/** Exponential backoff (ms) for retry attempt N, capped. */
export function backoffMs(attempt, base, cap) {
  base = base || 200;
  cap = cap || 3000;
  return Math.min(cap, base * Math.pow(2, Math.max(0, attempt)));
}

/** Classify one launch-acquire attempt: acquired | advisory-degraded (last attempt) | retry. */
export function classifyLaunchOutcome(granted, attempt, maxAttempts) {
  if (granted) return { done: true, mode: 'acquired' };
  if (attempt + 1 >= maxAttempts) return { done: true, mode: 'advisory-degraded' };
  return { done: false, mode: 'retry' };
}

/** Resolve the phase active at a timestamp given phase markers ({ts, phase}); the latest
 *  marker at or before ts wins. Returns 'unknown' before the first marker / on a bad ts. */
export function phaseAt(ts, phaseMarkers) {
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return 'unknown';
  const markers = (phaseMarkers || [])
    .filter((m) => m && m.ts && Number.isFinite(Date.parse(m.ts)))
    .slice()
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  let name = 'unknown';
  for (const m of markers) {
    if (Date.parse(m.ts) <= t) name = m.phase || m.name || 'unknown';
    else break;
  }
  return name;
}

/** ANALYSIS (the benchmark-phase join, refinement iii): bucket contention records into the
 *  phase active at each record's ts, split by dominant resource pressure (GPU, CPU, and DISK).
 *  Pure over already-parsed ledger records + phase markers; reads only the STABLE record shape
 *  { ts, event, resources: { cpu: { loadPerCore }, gpu: { present, util }, disk: { present,
 *  writeMBps, readMBps } } } so it is unaffected by WIN's in-flight summarizeResources internal
 *  fixes. disk-heavy reuses the disk-benchmark classifier (slow transfer = saturated device).
 *  Only 'retry' and 'advisory-degraded' events are contention; 'acquired'/'phase-marker' are
 *  excluded. */
export function bucketContentionByPhase(records, phaseMarkers, opts) {
  opts = opts || {};
  const gpuBusy = typeof opts.gpuBusyUtil === 'number' ? opts.gpuBusyUtil : GPU_BUSY_UTIL;
  const cpuBusy = typeof opts.cpuBusyLoadPerCore === 'number' ? opts.cpuBusyLoadPerCore : CPU_BUSY_LOAD_PER_CORE;
  const buckets = new Map();
  for (const r of records || []) {
    if (!r || !r.ts) continue;
    if (r.event !== 'retry' && r.event !== 'advisory-degraded') continue;
    const phase = phaseAt(r.ts, phaseMarkers);
    const res = r.resources || {};
    const gpu = res.gpu || {};
    const cpu = res.cpu || {};
    const gpuHeavy = Boolean(gpu.present) && typeof gpu.util === 'number' && gpu.util >= gpuBusy;
    const cpuHeavy = typeof cpu.loadPerCore === 'number' && cpu.loadPerCore >= cpuBusy;
    const diskHeavy = classifyDiskPressure(res.disk, { slowWriteMBps: opts.slowWriteMBps, slowReadMBps: opts.slowReadMBps });
    const b = buckets.get(phase) || { phase, total: 0, gpuHeavy: 0, cpuHeavy: 0, diskHeavy: 0, neither: 0 };
    b.total += 1;
    if (gpuHeavy) b.gpuHeavy += 1;
    if (cpuHeavy) b.cpuHeavy += 1;
    if (diskHeavy) b.diskHeavy += 1;
    if (!gpuHeavy && !cpuHeavy && !diskHeavy) b.neither += 1;
    buckets.set(phase, b);
  }
  return [...buckets.values()];
}

export const constants = {
  LAUNCH_RESOURCE_PREFIX,
  DEFAULT_LAUNCH_TTL_SEC,
  DEFAULT_LAUNCH_MAX_ATTEMPTS,
  GPU_BUSY_UTIL,
  CPU_BUSY_LOAD_PER_CORE
};

// ------------------------------- record building (pure) -------------------------------

/** Build one launch-contention ledger record: the same shape as the pre-push gate's records
 *  (ts, event, resource, identity, attempt, waitedMs) PLUS a combined cpu+gpu+DISK resource
 *  snapshot. opts.now uses ?? (not ||) so an epoch-0 ts is preserved -- the Copilot fix WIN
 *  applied to prePushGate.buildContentionRecord, adopted here. */
export function buildLaunchRecord(opts) {
  opts = opts || {};
  const cap = opts.capability || {};
  return {
    ts: new Date(opts.now ?? Date.now()).toISOString(),
    event: opts.event,
    resource: opts.resource || (LAUNCH_RESOURCE_PREFIX + 'default'),
    identity: opts.identity || 'UNKNOWN/main',
    attempt: Number(opts.attempt) || 0,
    waitedMs: Number(opts.waitedMs) || 0,
    holder: opts.holder || null,
    resources: { cpu: cap.cpu || null, gpu: cap.gpu || null, disk: cap.disk || null }
  };
}

// ---------------- DI'd orchestration (real-tested with fakes, NOT v8-ignored) ----------------
// deps is dependency-injected so the acquire/retry/degrade/ledger orchestration is unit-tested
// with fakes (no real lease/disk/clock). Only the default-deps binding + CLI entry are ignored,
// per the v8-ignore-is-tech-debt steer.

/** Serialize a subagent launch: skip (advisory) in a solo context; else bounded-retry acquire
 *  of agent-launch:<group>, recording each contention (with a cpu+gpu+disk snapshot) to the
 *  ledger, and DEGRADE TO ADVISORY on timeout -- a launch is NEVER hard-blocked. */
export function runLaunchAcquire(deps, opts) {
  deps = deps || {};
  opts = opts || {};
  const env = deps.env || {};
  const worktreeCount = deps.worktreeCount == null ? 1 : deps.worktreeCount;
  const resource = launchResource(opts.group);
  const identity = deps.identity || 'UNKNOWN/main';
  const maxAttempts = Number(opts.maxAttempts) > 0 ? Number(opts.maxAttempts) : DEFAULT_LAUNCH_MAX_ATTEMPTS;
  const ttlSec = Number(opts.ttlSec) > 0 ? Number(opts.ttlSec) : DEFAULT_LAUNCH_TTL_SEC;
  const log = deps.log || (() => {});
  const nowFn = deps.now || (() => Date.now());
  if (!shouldSerializeLaunch(env, worktreeCount)) {
    log('[launch-gate] solo context -- skipping launch gate (advisory).');
    return { serialized: false, mode: 'skipped', resource };
  }
  const start = nowFn();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const r = deps.acquireLease(resource, identity, { ttlSec }) || {};
    const outcome = classifyLaunchOutcome(Boolean(r.granted), attempt, maxAttempts);
    if (r.granted) {
      log('[launch-gate] acquired ' + resource + ' as ' + identity + ' (attempt ' + (attempt + 1) + ').');
      return { serialized: true, mode: 'acquired', resource, token: r.token, attempt };
    }
    const holderOwner = r.holder ? r.holder.owner : null;
    const record = buildLaunchRecord({
      event: outcome.mode === 'advisory-degraded' ? 'advisory-degraded' : 'retry',
      resource, identity, attempt, waitedMs: nowFn() - start,
      capability: deps.sampleCapability ? deps.sampleCapability() : null,
      holder: holderOwner, now: nowFn()
    });
    if (deps.appendLedger) deps.appendLedger(record);
    if (outcome.done) {
      log('[launch-gate] could not acquire ' + resource + ' in ' + (attempt + 1) + ' attempts (held by ' + (holderOwner || '?') + '); DEGRADING TO ADVISORY -- proceeding.');
      return { serialized: true, mode: 'advisory-degraded', resource, attempt };
    }
    log('[launch-gate] ' + resource + ' busy (held by ' + (holderOwner || '?') + '); retry ' + (attempt + 1) + '/' + maxAttempts + '.');
    if (deps.sleep) deps.sleep(backoffMs(attempt));
  }
  return { serialized: true, mode: 'advisory-degraded', resource };
}

/** Release a launch slot by the token held from runLaunchAcquire (token-based, matching the
 *  prototype agentGateway.releaseLease). Best-effort -- releasing never throws. */
export function runLaunchRelease(deps, opts) {
  deps = deps || {};
  opts = opts || {};
  const resource = launchResource(opts.group);
  try {
    if (opts.token && deps.releaseLease) { deps.releaseLease(resource, opts.token); return { released: true, resource }; }
  } catch { /* best effort */ }
  return { released: false, resource };
}

/* v8 ignore start */ // default dependency bindings (real lease/disk/clock/fs) + CLI entry: host/timing dependent

function resolveGateDir() {
  let common;
  try { common = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim(); } catch { common = '.git'; }
  if (!path.isAbsolute(common)) common = path.resolve(process.cwd(), common);
  return path.join(common, 'vihs-gate');
}
function realWorktreeCount() {
  try { return execFileSync('git', ['worktree', 'list'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).length; } catch { return 1; }
}
function realIdentity() {
  const plane = process.env.VIHS_COLLAB_AGENT ? process.env.VIHS_COLLAB_AGENT.toUpperCase() : (process.platform === 'win32' ? 'WIN' : 'LINUX');
  const sa = gw.resolveSubagentId(process.env, { cwdBasename: path.basename(process.cwd()), pid: process.pid, repoBasename: 'vi-history-suite' });
  return gw.formatIdentity(plane, sa.id);
}
function sleepSync(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* best effort */ } }
function appendLedgerLine(gateDir, record) {
  try { fs.mkdirSync(gateDir, { recursive: true }); fs.appendFileSync(path.join(gateDir, 'contention-ledger.ndjson'), JSON.stringify(record) + '\n'); } catch { /* best effort */ }
}
function readLedger(gateDir) {
  try {
    const txt = fs.readFileSync(path.join(gateDir, 'contention-ledger.ndjson'), 'utf8');
    return txt.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

/** Real default deps: prototype agentGateway lease + diskBenchmark cpu+gpu+disk capability. */
export function defaultDeps() {
  const gateDir = resolveGateDir();
  return {
    env: process.env,
    worktreeCount: realWorktreeCount(),
    identity: realIdentity(),
    now: Date.now,
    sleep: sleepSync,
    log: (m) => console.error(m),
    acquireLease: (resource, owner, o) => gw.acquireLease(gateDir, resource, owner, o),
    releaseLease: (resource, token) => gw.releaseLease(gateDir, resource, token),
    sampleCapability: () => sampleSystemCapability(),
    appendLedger: (record) => appendLedgerLine(gateDir, record)
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const sub = process.argv[2] || 'status';
  const group = process.argv[3] || process.env.VIHS_LAUNCH_GROUP || 'default';
  if (sub === 'acquire') {
    const res = runLaunchAcquire(defaultDeps(), { group });
    if (res.token) console.log('LAUNCH-TOKEN ' + res.token);
    process.exit(0);
  } else if (sub === 'release') {
    runLaunchRelease(defaultDeps(), { group, token: process.argv[4] || process.env.VIHS_LAUNCH_TOKEN });
    process.exit(0);
  } else if (sub === 'mark') {
    const phase = process.argv[3] || 'unknown';
    appendLedgerLine(resolveGateDir(), { ts: new Date().toISOString(), event: 'phase-marker', phase });
    console.error('[launch-gate] phase-marker ' + phase + ' recorded.');
    process.exit(0);
  } else if (sub === 'analyze') {
    const swIdx = process.argv.indexOf('--slow-write');
    const srIdx = process.argv.indexOf('--slow-read');
    const opts = {};
    if (swIdx >= 0) opts.slowWriteMBps = Number(process.argv[swIdx + 1]);
    if (srIdx >= 0) opts.slowReadMBps = Number(process.argv[srIdx + 1]);
    const entries = readLedger(resolveGateDir());
    const markers = entries.filter((e) => e.event === 'phase-marker');
    const buckets = bucketContentionByPhase(entries, markers, opts);
    console.log(JSON.stringify({ schema: 'vi-history-suite/launch-contention-by-phase@v1', analyzedAt: new Date().toISOString(), thresholds: { slowWriteMBps: opts.slowWriteMBps ?? null, slowReadMBps: opts.slowReadMBps ?? null }, markerCount: markers.length, contentionCount: buckets.reduce((s, b) => s + b.total, 0), buckets }, null, 2));
    process.exit(0);
  } else {
    console.error('usage: node prototype/agentLaunchGate.mjs [acquire <group> | release <group> <token> | mark <phase> | analyze]');
    process.exit(2);
  }
}
/* v8 ignore stop */
