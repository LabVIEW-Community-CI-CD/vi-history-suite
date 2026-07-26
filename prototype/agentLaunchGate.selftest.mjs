// prototype/agentLaunchGate.selftest.mjs -- pure-logic selftest for the agent-launch gate.
// Run: node prototype/agentLaunchGate.selftest.mjs   (no deps, no npm ci needed)
import {
  launchResource,
  shouldSerializeLaunch,
  backoffMs,
  classifyLaunchOutcome,
  phaseAt,
  bucketContentionByPhase,
  buildLaunchRecord,
  runLaunchAcquire,
  runLaunchRelease,
  constants
} from './agentLaunchGate.mjs';

let n = 0;
let failed = 0;
function ok(cond, desc) {
  n += 1;
  console.log((cond ? 'ok ' : 'not ok ') + n + ' - ' + desc);
  if (!cond) failed += 1;
}
function eq(actual, expected, desc) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), desc + '  (got ' + JSON.stringify(actual) + ')');
}

// 1. launchResource: default + sanitization + prefix
eq(launchResource(), 'agent-launch:default', 'launchResource() -> default');
eq(launchResource('bench A/1'), 'agent-launch:bench-A-1', 'launchResource sanitizes unsafe chars');
eq(launchResource('   '), 'agent-launch:default', 'launchResource blank -> default');

// 2. shouldSerializeLaunch: solo skip, subagent + multi-worktree enforce
ok(shouldSerializeLaunch({}, 1) === false, 'solo (no id, 1 worktree) -> skip');
ok(shouldSerializeLaunch({ VIHS_SUBAGENT_ID: 'x' }, 1) === true, 'subagent lane -> serialize');
ok(shouldSerializeLaunch({}, 2) === true, 'multi-worktree -> serialize');

// 3. backoffMs: exponential + capped at 3000
eq([0, 1, 2, 3, 4, 5].map((a) => backoffMs(a)), [200, 400, 800, 1600, 3000, 3000], 'backoff exponential capped at 3000');

// 4. classifyLaunchOutcome
eq(classifyLaunchOutcome(true, 0, 5), { done: true, mode: 'acquired' }, 'granted -> acquired');
eq(classifyLaunchOutcome(false, 1, 5), { done: false, mode: 'retry' }, 'mid-fail -> retry');
eq(classifyLaunchOutcome(false, 4, 5), { done: true, mode: 'advisory-degraded' }, 'last-fail -> advisory-degraded');

// 5. phaseAt: latest marker at or before ts wins
const markers = [
  { ts: '2026-07-26T00:00:00Z', phase: 'idle' },
  { ts: '2026-07-26T00:10:00Z', phase: 'gpu-eval' },
  { ts: '2026-07-26T00:20:00Z', phase: 'cpu-build' }
];
eq(phaseAt('2026-07-26T00:05:00Z', markers), 'idle', 'phaseAt before 2nd marker -> idle');
eq(phaseAt('2026-07-26T00:15:00Z', markers), 'gpu-eval', 'phaseAt in gpu window -> gpu-eval');
eq(phaseAt('2026-07-26T00:25:00Z', markers), 'cpu-build', 'phaseAt after last -> cpu-build');
eq(phaseAt('2026-07-25T23:00:00Z', markers), 'unknown', 'phaseAt before first marker -> unknown');

// 6. bucketContentionByPhase: bucket by phase + GPU/CPU-heavy split; exclude non-contention
const records = [
  { ts: '2026-07-26T00:12:00Z', event: 'retry', resources: { cpu: { loadPerCore: 0.1 }, gpu: { present: true, util: 90 } } },
  { ts: '2026-07-26T00:14:00Z', event: 'advisory-degraded', resources: { cpu: { loadPerCore: 0.2 }, gpu: { present: true, util: 80 } } },
  { ts: '2026-07-26T00:22:00Z', event: 'retry', resources: { cpu: { loadPerCore: 0.9 }, gpu: { present: true, util: 5 } } },
  { ts: '2026-07-26T00:23:00Z', event: 'acquired', resources: { cpu: { loadPerCore: 0.9 }, gpu: { present: true, util: 5 } } }
];
const b = bucketContentionByPhase(records, markers);
const gpuPhase = b.find((x) => x.phase === 'gpu-eval');
const cpuPhase = b.find((x) => x.phase === 'cpu-build');
ok(gpuPhase && gpuPhase.total === 2 && gpuPhase.gpuHeavy === 2 && gpuPhase.cpuHeavy === 0, 'gpu-eval phase: 2 contention, both GPU-heavy');
ok(cpuPhase && cpuPhase.total === 1 && cpuPhase.cpuHeavy === 1 && cpuPhase.gpuHeavy === 0, 'cpu-build phase: 1 contention, CPU-heavy');
ok(b.reduce((s, x) => s + x.total, 0) === 3, 'acquired event excluded from contention buckets');

// 6b. bucketContentionByPhase classifies DISK-heavy alongside gpu/cpu
const diskRecs = [
  { ts: '2026-07-26T00:12:00Z', event: 'retry', resources: { cpu: { loadPerCore: 0.1 }, gpu: { present: true, util: 5 }, disk: { present: true, writeMBps: 30, readMBps: 1800 } } },
  { ts: '2026-07-26T00:22:00Z', event: 'retry', resources: { cpu: { loadPerCore: 0.1 }, gpu: { present: true, util: 5 }, disk: { present: true, writeMBps: 1500, readMBps: 1800 } } }
];
const db = bucketContentionByPhase(diskRecs, markers);
const dGpu = db.find((x) => x.phase === 'gpu-eval');
const dCpu = db.find((x) => x.phase === 'cpu-build');
ok(dGpu && dGpu.diskHeavy === 1 && dGpu.gpuHeavy === 0 && dGpu.cpuHeavy === 0, 'gpu-eval phase: 1 DISK-heavy contention (slow write)');
ok(dCpu && dCpu.diskHeavy === 0 && dCpu.neither === 1, 'cpu-build phase: fast disk -> not disk-heavy (neither)');

// 7. constants sanity (TTL in the agreed 30-60s envelope)
ok(constants.DEFAULT_LAUNCH_TTL_SEC >= 30 && constants.DEFAULT_LAUNCH_TTL_SEC <= 60, 'default TTL in 30-60s envelope');

// 8. buildLaunchRecord: composes cpu+gpu+disk + preserves epoch-0 ts (?? not ||)
const rec0 = buildLaunchRecord({ event: 'retry', resource: 'agent-launch:g', identity: 'LINUX/x', attempt: 2, waitedMs: 500, now: 0, capability: { cpu: { loadPerCore: 0.1 }, gpu: { present: true, util: 5 }, disk: { present: true, writeMBps: 1500, readMBps: 1800 } } });
eq(rec0.ts, '1970-01-01T00:00:00.000Z', 'buildLaunchRecord preserves epoch-0 ts (?? not ||)');
ok(rec0.resources.disk && rec0.resources.disk.writeMBps === 1500, 'record carries DISK dimension alongside cpu+gpu');
ok(rec0.resources.cpu.loadPerCore === 0.1 && rec0.resources.gpu.util === 5, 'record carries cpu+gpu');

// 9. runLaunchAcquire SOLO -> skipped (advisory)
const soloRes = runLaunchAcquire({ env: {}, worktreeCount: 1 }, { group: 'g' });
eq({ serialized: soloRes.serialized, mode: soloRes.mode }, { serialized: false, mode: 'skipped' }, 'runLaunchAcquire solo -> skipped advisory');

// 10. runLaunchAcquire ACQUIRE on first try (multi-agent via subagent id)
let acqCalls = 0;
const okRes = runLaunchAcquire({ env: { VIHS_SUBAGENT_ID: 'lane1' }, acquireLease: () => { acqCalls += 1; return { granted: true, token: 'tok-1' }; } }, { group: 'g' });
eq({ mode: okRes.mode, token: okRes.token, attempt: okRes.attempt }, { mode: 'acquired', token: 'tok-1', attempt: 0 }, 'runLaunchAcquire acquires on attempt 1');
ok(acqCalls === 1, 'acquire called once when granted immediately');

// 11. runLaunchAcquire CONTENTION -> retry then advisory-degrade + ledger records carry disk
const ledger = [];
const degradeRes = runLaunchAcquire({
  env: { VIHS_SUBAGENT_ID: 'lane2' },
  acquireLease: () => ({ granted: false, holder: { owner: 'LINUX/other' } }),
  sampleCapability: () => ({ cpu: { loadPerCore: 0.9 }, gpu: { present: true, util: 3 }, disk: { present: true, writeMBps: 40, readMBps: 1800 } }),
  appendLedger: (r) => ledger.push(r),
  sleep: () => {},
  now: () => 1000
}, { group: 'g', maxAttempts: 3 });
eq(degradeRes.mode, 'advisory-degraded', 'runLaunchAcquire contention -> advisory-degraded (never hard-blocks)');
ok(ledger.length === 3, 'contention wrote 3 ledger records (2 retry + 1 advisory-degraded)');
eq([ledger[0].event, ledger[1].event, ledger[2].event], ['retry', 'retry', 'advisory-degraded'], 'ledger contention event sequence');
ok(ledger[2].resources.disk.writeMBps === 40, 'ledger records carry the disk dimension');

// 12. runLaunchAcquire retry-then-acquire
let n2 = 0;
const retryRes = runLaunchAcquire({
  env: { VIHS_SUBAGENT_ID: 'lane3' },
  acquireLease: () => { n2 += 1; return n2 >= 2 ? { granted: true, token: 'tok-2' } : { granted: false, holder: { owner: 'x' } }; },
  sampleCapability: () => ({ cpu: {}, gpu: {}, disk: {} }),
  appendLedger: () => {}, sleep: () => {}, now: () => 0
}, { group: 'g', maxAttempts: 5 });
eq({ mode: retryRes.mode, attempt: retryRes.attempt, token: retryRes.token }, { mode: 'acquired', attempt: 1, token: 'tok-2' }, 'retry once then acquire on attempt 2');

// 13. runLaunchRelease by token
let released = null;
const relRes = runLaunchRelease({ releaseLease: (resource, token) => { released = { resource, token }; } }, { group: 'g', token: 'tok-2' });
ok(relRes.released === true && released.token === 'tok-2' && released.resource === 'agent-launch:g', 'runLaunchRelease releases by token');
ok(runLaunchRelease({ releaseLease: () => {} }, { group: 'g' }).released === false, 'runLaunchRelease without a token -> not released');

console.log('1..' + n);
console.log(failed === 0
  ? 'agentLaunchGate self-test PASSED (' + n + ' assertions)'
  : 'agentLaunchGate self-test FAILED (' + failed + '/' + n + ')');
process.exit(failed === 0 ? 0 : 1);
