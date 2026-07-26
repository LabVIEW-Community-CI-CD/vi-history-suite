// prototype/launchContentionBench.mjs (VHS-REQ-719, board #2315) -- LINUX track:launch-contention-bench
//
// Multi-spawn contention driver for the launch gate: marks a phase, generates REAL resource load
// (disk saturation and/or a GPU command), HOLDS the launch-gate lease, then spawns N concurrent
// `agentLaunchGate.mjs acquire` workers that all CONTEND (the driver holds the lease) so each
// worker's per-contention resource sample is taken UNDER load -> the ledger records the reduced
// disk MB/s (and live GPU util) at the contention moment. Then it releases + marks phase-end.
// Run `node prototype/agentLaunchGate.mjs analyze` to see the per-phase GPU/CPU/DISK-heavy report.
//
// Genuinely forceable on Linux: DISK pressure -- concurrent fsync writers saturate the device so
// the launch gate's 16 MiB disk micro-benchmark reads a lower MB/s (diskHeavy fires once it drops
// under the classifier floor; on a very fast NVMe the raw MB/s still drops even if the boolean
// floor is not crossed -- the signal is real, the threshold is tunable via analyze opts). GPU
// pressure -- pass --gpu-cmd "<cmd>" (e.g. an ollama generate) to run a real GPU workload during
// the phase; nvidia-smi util is sampled live per contention. CPU via loadavg lags (1-min average)
// so a short bench will not spike it.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as gw from './agentGateway.mjs';

// ------------------------------- pure logic (selftested) -------------------------------

/** Parse the driver CLI args into a normalized plan (pure). */
export function parseArgs(argv) {
  const a = { workers: 6, load: 'disk', group: 'bench', phase: null, gpuCmd: null, diskWriters: 4 };
  const list = argv || [];
  for (let i = 0; i < list.length; i += 1) {
    const t = list[i];
    if (t === '--workers') a.workers = Math.max(1, Number(list[++i]) || a.workers);
    else if (t === '--load') a.load = String(list[++i] || a.load);
    else if (t === '--group') a.group = String(list[++i] || a.group);
    else if (t === '--phase') a.phase = String(list[++i] || '');
    else if (t === '--gpu-cmd') a.gpuCmd = String(list[++i] || '');
    else if (t === '--disk-writers') a.diskWriters = Math.max(1, Number(list[++i]) || a.diskWriters);
  }
  if (!a.phase) a.phase = (a.load === 'none' ? 'baseline' : a.load + '-heavy') + '-phase';
  return a;
}

/** Deterministic worker lane ids (pure). */
export function planLanes(workers) {
  const n = Math.max(1, Number(workers) || 1);
  return Array.from({ length: n }, (_, i) => 'bench-worker-' + (i + 1));
}

export const constants = { DEFAULT_WORKERS: 6, DEFAULT_DISK_WRITERS: 4 };

// ------------------------------- I/O orchestration -------------------------------
/* v8 ignore start */ // process spawn + real load + git/fs + CLI: host/timing dependent, integration-only

function resolveGateDir() {
  let common;
  try { common = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim(); } catch { common = '.git'; }
  if (!path.isAbsolute(common)) common = path.resolve(process.cwd(), common);
  return path.join(common, 'vihs-gate');
}

function appendMarker(gateDir, phase) {
  try {
    fs.mkdirSync(gateDir, { recursive: true });
    fs.appendFileSync(path.join(gateDir, 'contention-ledger.ndjson'), JSON.stringify({ ts: new Date().toISOString(), event: 'phase-marker', phase }) + '\n');
  } catch { /* best effort */ }
}

// A background disk saturator: loop writing a 64 MiB buffer with fsync until a stop file appears.
const DISK_WRITER_SRC = "const fs=require('node:fs');const f=process.argv[2],stop=process.argv[3];const b=Buffer.alloc(64*1024*1024,7);while(!fs.existsSync(stop)){try{const fd=fs.openSync(f,'w');fs.writeSync(fd,b);fs.fsyncSync(fd);fs.closeSync(fd);}catch{}}try{fs.unlinkSync(f);}catch{}";

function startDiskLoad(dir, writers) {
  const stop = path.join(dir, '.vihs-bench-stop-' + process.pid);
  try { fs.unlinkSync(stop); } catch { /* ignore */ }
  const procs = [];
  for (let i = 0; i < writers; i += 1) {
    const f = path.join(dir, '.vihs-bench-write-' + process.pid + '-' + i + '.tmp');
    procs.push(spawn(process.execPath, ['-e', DISK_WRITER_SRC, f, stop], { stdio: 'ignore' }));
  }
  return function stopDiskLoad() {
    try { fs.writeFileSync(stop, '1'); } catch { /* ignore */ }
    for (const p of procs) { try { p.kill(); } catch { /* ignore */ } }
    setTimeout(() => { try { fs.unlinkSync(stop); } catch { /* ignore */ } }, 500);
  };
}

function spawnContenders(scriptPath, group, lanes) {
  return Promise.all(lanes.map((lane) => new Promise((resolve) => {
    const p = spawn(process.execPath, [scriptPath, 'acquire', group], { stdio: 'ignore', env: { ...process.env, VIHS_SUBAGENT_ID: lane } });
    p.on('exit', (code) => resolve({ lane, code }));
    p.on('error', () => resolve({ lane, code: -1 }));
  })));
}

async function main(argv) {
  const plan = parseArgs(argv);
  const gateDir = resolveGateDir();
  const script = fileURLToPath(new URL('./agentLaunchGate.mjs', import.meta.url));
  const resource = 'agent-launch:' + plan.group;
  const lanes = planLanes(plan.workers);
  console.error('[bench] phase=' + plan.phase + ' workers=' + lanes.length + ' load=' + plan.load + (plan.gpuCmd ? ' gpu-cmd=set' : ''));
  appendMarker(gateDir, plan.phase);
  const holderId = gw.formatIdentity('LINUX', 'bench-holder');
  const held = gw.acquireLease(gateDir, resource, holderId, { ttlSec: 120 });
  if (!held || !held.granted) { console.error('[bench] could not hold the lease (already held); aborting cleanly'); return; }
  let stopLoad = () => {};
  let gpuProc = null;
  try {
    if (plan.load === 'disk') stopLoad = startDiskLoad(gateDir, plan.diskWriters);
    if (plan.gpuCmd) gpuProc = spawn('bash', ['-c', plan.gpuCmd], { stdio: 'ignore' });
    const results = await spawnContenders(script, plan.group, lanes);
    console.error('[bench] contenders exited: ' + results.map((r) => r.lane + '=' + r.code).join(' '));
  } finally {
    stopLoad();
    if (gpuProc) { try { gpuProc.kill(); } catch { /* ignore */ } }
    try { gw.releaseLease(gateDir, resource, held.token); } catch { /* ignore */ }
  }
  appendMarker(gateDir, plan.phase + '-end');
  console.error('[bench] done -- run: node prototype/agentLaunchGate.mjs analyze');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).catch((e) => { console.error('[bench] error: ' + (e && e.message)); process.exit(1); });
}
/* v8 ignore stop */
