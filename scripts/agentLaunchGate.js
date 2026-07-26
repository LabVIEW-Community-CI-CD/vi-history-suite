'use strict';
// scripts/agentLaunchGate.js (VHS-REQ-719, board #2315, issue #2447) -- graduated agent-launch gate.
//
// Serializes subagent SPAWNS on one machine via the shared agent-gateway lease
// (scripts/agentGateway.js) and records launch contention into the SAME contention ledger the
// pre-push gate writes (.git/vihs-gate/contention-ledger.ndjson), so spawn contention is
// timestamped and resource-attributed (CPU load-per-core / GPU util / DISK transfer rate) and
// correlatable to a benchmark timeline (GPU-heavy vs CPU-heavy vs DISK-heavy phases). Feeds board
// #2315 (per-actor system-capability benchmarking): the contention ledger IS a per-actor signal.
//
// Envelope: resource = agent-launch:<group>; acquire before a subagent spawns; bounded-wait
// ADVISORY-DEGRADE (a launch is NEVER hard-blocked -- a deadlocked launch gate is worse than
// contention); short TTL (30-60s) so a crashed launcher self-clears; a cpu+gpu+disk sample per
// contention; release by the token held from acquire.
//
// Coverage discipline (v8-ignore-is-tech-debt steer): the pure logic AND the acquire/release
// orchestration are dependency-injected (runLaunchAcquire/runLaunchRelease take a `deps` bag) so
// they are real-tested with fakes -- only defaultDeps() (the real lease/disk/clock/fs binding) and
// the require.main CLI are v8-ignored. Consumes develop scripts/agentGateway.js (lease) and
// scripts/systemCapability.js (capture + classifyDiskPressure) as the single sources of truth.

const gw = require('./agentGateway.js');
const systemCapability = require('./systemCapability.js');
const { classifyDiskPressure } = systemCapability;

const LAUNCH_RESOURCE_PREFIX = 'agent-launch:';
const DEFAULT_LAUNCH_TTL_SEC = 45;      // 30-60s envelope: short so a crashed launcher self-clears
const DEFAULT_LAUNCH_MAX_ATTEMPTS = 5;  // brief bounded retry, then advisory-degrade (never hard-block)
const GPU_BUSY_UTIL = 50;               // util% >= this => GPU-heavy contention
const CPU_BUSY_LOAD_PER_CORE = 0.7;     // loadavg1/cores >= this => CPU-heavy contention

// ------------------------------- pure logic (unit-tested) -------------------------------

/** Stable, sanitized resource name for a launch group. */
function launchResource(group) {
  const raw = group == null ? '' : String(group);
  const g = raw.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return LAUNCH_RESOURCE_PREFIX + (g || 'default');
}

/** Serialize spawns only when more than one agent could spawn on this machine (an explicit
 *  subagent lane, or >1 git worktree). Solo -> skip (advisory, zero friction). Mirrors the
 *  pre-push gate's shouldEnforce so the two gates share one multi-agent-context definition. */
function shouldSerializeLaunch(env, worktreeCount) {
  env = env || {};
  if (env.VIHS_SUBAGENT_ID) return true;
  return Number(worktreeCount || 0) > 1;
}

/** Exponential backoff (ms) for retry attempt N, capped. */
function backoffMs(attempt, base, cap) {
  base = base || 200;
  cap = cap || 3000;
  return Math.min(cap, base * Math.pow(2, Math.max(0, attempt)));
}

/** Classify one launch-acquire attempt: acquired | advisory-degraded (last attempt) | retry. */
function classifyLaunchOutcome(granted, attempt, maxAttempts) {
  if (granted) return { done: true, mode: 'acquired' };
  if (attempt + 1 >= maxAttempts) return { done: true, mode: 'advisory-degraded' };
  return { done: false, mode: 'retry' };
}

/** Resolve the phase active at a timestamp given phase markers ({ts, phase}); the latest marker
 *  at or before ts wins. Returns 'unknown' before the first marker / on a bad ts. */
function phaseAt(ts, phaseMarkers) {
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

/** ANALYSIS (the benchmark-phase join): bucket contention records into the phase active at each
 *  record's ts, split by dominant resource pressure (GPU, CPU, and DISK). Pure over already-parsed
 *  ledger records + phase markers; reads only the STABLE record shape { ts, event, resources: {
 *  cpu: { loadPerCore }, gpu: { present, util }, disk: { present, writeMBps, readMBps } } }.
 *  disk-heavy reuses systemCapability.classifyDiskPressure (slow transfer = saturated device). Only
 *  'retry'/'advisory-degraded' events are contention; 'acquired'/'phase-marker' are excluded. */
function bucketContentionByPhase(records, phaseMarkers, opts) {
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

/** Build one launch-contention ledger record: the same shape as the pre-push gate's records
 *  (ts, event, resource, identity, attempt, waitedMs) PLUS a combined cpu+gpu+DISK resource
 *  snapshot. opts.now uses ?? (not ||) so an epoch-0 ts is preserved. */
function buildLaunchRecord(opts) {
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

/** Serialize a subagent launch: skip (advisory) in a solo context; else bounded-retry acquire of
 *  agent-launch:<group>, recording each contention (with a cpu+gpu+disk snapshot) to the ledger,
 *  and DEGRADE TO ADVISORY on timeout -- a launch is NEVER hard-blocked. */
function runLaunchAcquire(deps, opts) {
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

/** Release a launch slot by the token held from runLaunchAcquire. Best-effort -- never throws. */
function runLaunchRelease(deps, opts) {
  deps = deps || {};
  opts = opts || {};
  const resource = launchResource(opts.group);
  try {
    if (opts.token && deps.releaseLease) { deps.releaseLease(resource, opts.token); return { released: true, resource }; }
  } catch { /* best effort */ }
  return { released: false, resource };
}

const constants = {
  LAUNCH_RESOURCE_PREFIX,
  DEFAULT_LAUNCH_TTL_SEC,
  DEFAULT_LAUNCH_MAX_ATTEMPTS,
  GPU_BUSY_UTIL,
  CPU_BUSY_LOAD_PER_CORE
};

module.exports = {
  launchResource,
  shouldSerializeLaunch,
  backoffMs,
  classifyLaunchOutcome,
  phaseAt,
  bucketContentionByPhase,
  buildLaunchRecord,
  runLaunchAcquire,
  runLaunchRelease,
  constants,
  // real-binding conveniences (below, v8-ignored):
  get defaultDeps() { return defaultDeps; }
};

/* v8 ignore start */ // default deps binding (real lease/disk/clock/fs) + CLI entry: host/timing dependent
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

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

/** Real default deps: develop agentGateway lease + systemCapability cpu+gpu+disk capture. */
function defaultDeps() {
  const gateDir = gw.resolveGateDir();
  return {
    env: process.env,
    worktreeCount: realWorktreeCount(),
    identity: realIdentity(),
    now: Date.now,
    sleep: sleepSync,
    log: (m) => console.error(m),
    acquireLease: (resource, owner, o) => gw.acquireLease(gateDir, resource, owner, o),
    releaseLease: (resource, token) => gw.releaseLease(gateDir, resource, { token }),
    sampleCapability: () => systemCapability.capture({}),
    appendLedger: (record) => appendLedgerLine(gateDir, record)
  };
}

if (require.main === module) {
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
    appendLedgerLine(gw.resolveGateDir(), { ts: new Date().toISOString(), event: 'phase-marker', phase });
    console.error('[launch-gate] phase-marker ' + phase + ' recorded.');
    process.exit(0);
  } else if (sub === 'analyze') {
    const swIdx = process.argv.indexOf('--slow-write');
    const srIdx = process.argv.indexOf('--slow-read');
    const opts = {};
    if (swIdx >= 0) opts.slowWriteMBps = Number(process.argv[swIdx + 1]);
    if (srIdx >= 0) opts.slowReadMBps = Number(process.argv[srIdx + 1]);
    const entries = readLedger(gw.resolveGateDir());
    const markers = entries.filter((e) => e.event === 'phase-marker');
    const buckets = bucketContentionByPhase(entries, markers, opts);
    console.log(JSON.stringify({ schema: 'vi-history-suite/launch-contention-by-phase@v1', analyzedAt: new Date().toISOString(), thresholds: { slowWriteMBps: opts.slowWriteMBps ?? null, slowReadMBps: opts.slowReadMBps ?? null }, markerCount: markers.length, contentionCount: buckets.reduce((s, b) => s + b.total, 0), buckets }, null, 2));
    process.exit(0);
  } else {
    console.error('usage: node scripts/agentLaunchGate.js [acquire <group> | release <group> <token> | mark <phase> | analyze [--slow-write N] [--slow-read N]]');
    process.exit(2);
  }
}
/* v8 ignore stop */
