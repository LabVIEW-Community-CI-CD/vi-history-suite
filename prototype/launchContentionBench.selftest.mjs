// prototype/launchContentionBench.selftest.mjs -- pure-logic selftest for the contention driver.
// Run: node prototype/launchContentionBench.selftest.mjs   (no deps, no spawn)
import { parseArgs, planLanes, constants } from './launchContentionBench.mjs';

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

// 1. parseArgs defaults
eq(parseArgs([]), { workers: 6, load: 'disk', group: 'bench', phase: 'disk-heavy-phase', gpuCmd: null, diskWriters: 4 }, 'defaults -> disk load, 6 workers, disk-heavy-phase');

// 2. parseArgs overrides
eq(parseArgs(['--workers', '10', '--load', 'none', '--group', 'g2', '--disk-writers', '2']),
  { workers: 10, load: 'none', group: 'g2', phase: 'baseline-phase', gpuCmd: null, diskWriters: 2 },
  'overrides parsed; load=none -> baseline-phase');

// 3. explicit phase + gpu-cmd
eq(parseArgs(['--phase', 'gpu-eval', '--gpu-cmd', 'ollama run x']),
  { workers: 6, load: 'disk', group: 'bench', phase: 'gpu-eval', gpuCmd: 'ollama run x', diskWriters: 4 },
  'explicit --phase + --gpu-cmd preserved');

// 4. workers floor / falsy handling
ok(parseArgs(['--workers', '0']).workers === 6, '--workers 0 (falsy) -> default 6');
ok(parseArgs(['--workers', 'abc']).workers === 6, 'non-numeric workers -> default');

// 5. planLanes
eq(planLanes(3), ['bench-worker-1', 'bench-worker-2', 'bench-worker-3'], 'planLanes 3 -> deterministic lane ids');
ok(planLanes(0).length === 1, 'planLanes floors to 1');
ok(planLanes(1)[0] === 'bench-worker-1', 'planLanes 1 -> single lane');

// 6. constants
ok(constants.DEFAULT_WORKERS === 6 && constants.DEFAULT_DISK_WRITERS === 4, 'constants present');

console.log('1..' + n);
console.log(failed === 0
  ? 'launchContentionBench self-test PASSED (' + n + ' assertions)'
  : 'launchContentionBench self-test FAILED (' + failed + '/' + n + ')');
process.exit(failed === 0 ? 0 : 1);
