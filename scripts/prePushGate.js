'use strict';
// scripts/prePushGate.js (VHS-REQ-719)
//
// Wires the pre-push hook to the agent gateway so the resource-heavy validation
// phase (adr/agent/standards) SERIALIZES across concurrent agents/subagents on one
// machine, instead of N heavy runs thrashing CPU/GPU at once. Design envelope
// (agreed cross-plane): ENFORCE (wait) only in a MULTI-AGENT context (VIHS_SUBAGENT_ID
// set or >1 git worktree); stay ADVISORY (zero friction) for a plain solo push; a
// bounded retry that DEGRADES TO ADVISORY (warn + proceed, never hard-block) on
// timeout; release via owner-match at hook end. The push itself is never blocked.
//
// OBSERVABILITY (benchmark correlation): every contended RETRY and every advisory
// degrade is appended to a contention ledger (NDJSON under the shared git dir) with
// a timestamp + a CPU/GPU resource snapshot, so contention points can be correlated
// to a benchmark timeline and analyzed for GPU-vs-CPU pressure.
//
// Coverage discipline (VHS-REQ-719): the pure decision logic below is unit-tested +
// mapped; the filesystem/probe/loop I/O shim + CLI are v8-ignored (integration-only).

const gw = require('./agentGateway');

const RESOURCE = 'pre-push-validation';
const DEFAULT_MAX_ATTEMPTS = 6;
const DEFAULT_TTL_SEC = 120;

// ------------------------------- pure logic -------------------------------

/** Enforce (serialize) only when more than one agent could be acting on this
 *  machine: an explicit subagent lane, or more than one git worktree. */
function shouldEnforce(env, worktreeCount) {
  env = env || {};
  if (env.VIHS_SUBAGENT_ID) return true;
  return Number(worktreeCount || 0) > 1;
}

/** Exponential backoff (ms) for retry attempt N, capped. */
function backoffMs(attempt, base, cap) {
  base = base || 250;
  cap = cap || 4000;
  return Math.min(cap, base * Math.pow(2, Math.max(0, attempt)));
}

/** Classify one acquire attempt into the loop's next action. */
function classifyAcquireOutcome(granted, attempt, maxAttempts) {
  if (granted) return { done: true, mode: 'acquired' };
  if (attempt + 1 >= maxAttempts) return { done: true, mode: 'advisory-degraded' };
  return { done: false, mode: 'retry' };
}

/** Resolve the acquire-attempt budget from an env value, guarding against a
 *  non-positive/non-integer value silently disabling the acquire loop. */
function resolveMaxAttempts(rawValue, def) {
  def = def || DEFAULT_MAX_ATTEMPTS;
  const n = Number(rawValue);
  return Number.isInteger(n) && n >= 1 ? n : def;
}

/** Normalize a raw resource sample into a compact, benchmark-correlatable shape.
 *  loadPerCore is the CPU-pressure signal (loadavg1 / cores); gpu carries presence
 *  + best-effort utilization so a contention point can be attributed to GPU or CPU. */
function summarizeResources(raw) {
  raw = raw || {};
  const cores = Number(raw.cores) || 0;
  const load1 = typeof raw.load1 === 'number' ? raw.load1 : (Array.isArray(raw.loadavg) ? raw.loadavg[0] : 0);
  const loadPerCore = cores > 0 ? Number((load1 / cores).toFixed(3)) : null;
  return {
    cpu: {
      load1: Number((load1 || 0).toFixed(3)),
      cores,
      loadPerCore,
      utilPct: typeof raw.cpuUtilPct === 'number' ? Math.round(raw.cpuUtilPct) : null
    },
    gpu: { present: Boolean(raw.gpuPresent), util: typeof raw.gpuUtil === 'number' ? raw.gpuUtil : null }
  };
}

/** Build one contention-ledger record (a timestamped, resource-correlated signal). */
function buildContentionRecord(opts) {
  opts = opts || {};
  return {
    ts: new Date(opts.now ?? Date.now()).toISOString(),
    event: opts.event, // 'retry' | 'advisory-degraded' | 'acquired'
    resource: opts.resource || RESOURCE,
    identity: opts.identity || 'UNKNOWN/main',
    attempt: Number(opts.attempt) || 0,
    waitedMs: Number(opts.waitedMs) || 0,
    resources: summarizeResources(opts.resources)
  };
}

module.exports = {
  RESOURCE,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_TTL_SEC,
  shouldEnforce,
  backoffMs,
  classifyAcquireOutcome,
  resolveMaxAttempts,
  summarizeResources,
  buildContentionRecord
};

/* v8 ignore start */ // I/O shim (git worktree count, resource probe, ledger append, retry loop) + CLI: integration-only
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function sleepSync(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* best effort */ } }

function worktreeCount() {
  try { return execFileSync('git', ['worktree', 'list'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).length; } catch { return 1; }
}

let GPU_PRESENT; // cache PRESENCE only; utilization is sampled FRESH each call (per-retry)
function sampleGpuUtil() {
  if (GPU_PRESENT === false) return { present: false, util: null };
  try {
    const out = execFileSync('nvidia-smi', ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 1500 });
    const util = parseInt(String(out).trim().split('\n')[0], 10);
    GPU_PRESENT = true;
    return { present: true, util: Number.isFinite(util) ? util : null };
  } catch { GPU_PRESENT = false; return { present: false, util: null }; }
}

// Cross-platform instantaneous CPU utilization from two os.cpus() samples — os.loadavg()
// is always 0 on Windows, so loadPerCore alone is not a Windows CPU-pressure signal.
function sampleCpuUtilPct() {
  const snap = () => (os.cpus() || []).reduce((a, c) => { const t = c.times; a.idle += t.idle; a.total += t.user + t.nice + t.sys + t.idle + t.irq; return a; }, { idle: 0, total: 0 });
  const a = snap(); sleepSync(120); const b = snap();
  const idleD = b.idle - a.idle; const totalD = b.total - a.total;
  return totalD > 0 ? Math.max(0, Math.min(100, Math.round((1 - idleD / totalD) * 100))) : null;
}

function sampleResources() {
  const load = os.loadavg ? os.loadavg() : [0, 0, 0];
  const cores = (os.cpus() || []).length;
  const gpu = sampleGpuUtil();
  return { load1: load[0], cores, cpuUtilPct: sampleCpuUtilPct(), gpuPresent: gpu.present, gpuUtil: gpu.util };
}

function selfTokenPath(gateDir) { return path.join(gateDir, '.self-' + (process.ppid || process.pid)); }

function appendLedger(gateDir, record) {
  try {
    fs.mkdirSync(gateDir, { recursive: true });
    fs.appendFileSync(path.join(gateDir, 'contention-ledger.ndjson'), JSON.stringify(record) + '\n');
  } catch { /* observability is best-effort, never blocks a push */ }
}

function identity() {
  let plane = process.env.VIHS_COLLAB_AGENT ? process.env.VIHS_COLLAB_AGENT.toUpperCase() : null;
  if (!plane) { try { plane = require('./deriveAgentEnvironment').deriveTeamName().toUpperCase(); } catch { plane = process.platform === 'win32' ? 'WIN' : 'LINUX'; } }
  const sa = gw.resolveSubagentId(process.env, { cwdBasename: path.basename(process.cwd()), pid: process.pid, repoBasename: 'vi-history-suite' });
  return gw.formatIdentity(plane, sa.id);
}

// acquire: serialize the validation phase (multi-agent only), record contention.
function cliAcquire() {
  if (!shouldEnforce(process.env, worktreeCount())) {
    console.error('[pre-push-gate] solo context — skipping gate (advisory).');
    return 0;
  }
  const gateDir = gw.resolveGateDir();
  const id = identity();
  const maxAttempts = resolveMaxAttempts(process.env.VIHS_PREPUSH_GATE_ATTEMPTS, DEFAULT_MAX_ATTEMPTS);
  const start = Date.now();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const r = gw.acquireLease(gateDir, RESOURCE, id, { ttlSec: DEFAULT_TTL_SEC });
    const outcome = classifyAcquireOutcome(r.granted, attempt, maxAttempts);
    if (r.granted) {
      try { fs.writeFileSync(selfTokenPath(gateDir), r.token); } catch { /* best effort */ }
      console.error(`[pre-push-gate] acquired ${RESOURCE} as ${id} (attempt ${attempt + 1}).`);
      return 0;
    }
    const waitedMs = Date.now() - start;
    const record = buildContentionRecord({ event: outcome.mode === 'advisory-degraded' ? 'advisory-degraded' : 'retry', resource: RESOURCE, identity: id, attempt, waitedMs, resources: sampleResources() });
    appendLedger(gateDir, record);
    if (outcome.done) {
      console.error(`[pre-push-gate] could not acquire ${RESOURCE} in ${attempt + 1} attempts (held by ${r.holder ? r.holder.owner : '?'}); DEGRADING TO ADVISORY — proceeding without the lease. Contention recorded.`);
      return 0; // advisory-degrade: never hard-block a push
    }
    console.error(`[pre-push-gate] ${RESOURCE} busy (held by ${r.holder ? r.holder.owner : '?'}); retry ${attempt + 1}/${maxAttempts} after backoff. Contention recorded.`);
    sleepSync(backoffMs(attempt));
  }
  return 0;
}

function cliRelease() {
  try {
    const gateDir = gw.resolveGateDir();
    const id = identity();
    let token;
    try { token = fs.readFileSync(selfTokenPath(gateDir), 'utf8').trim(); } catch { /* no self-token */ }
    // Release only THIS invocation's lease by token; fall back to owner-match only if
    // the self-token file is missing, so a sibling invocation sharing our identity
    // cannot release a lease we did not acquire.
    gw.releaseLease(gateDir, RESOURCE, token ? { token } : { owner: id });
    try { fs.unlinkSync(selfTokenPath(gateDir)); } catch { /* best effort */ }
  } catch { /* best effort */ }
  return 0;
}

if (require.main === module) {
  const sub = process.argv[2];
  process.exit(sub === 'acquire' ? cliAcquire() : sub === 'release' ? cliRelease() : 0);
}
/* v8 ignore stop */
