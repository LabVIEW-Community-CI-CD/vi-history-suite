// prototype/diskBenchmark.selftest.mjs -- pure-logic selftest for the disk-benchmark track.
// Run: node prototype/diskBenchmark.selftest.mjs   (no deps, no npm ci needed)
import { transferMBps, summarizeDisk, classifyDiskPressure, constants } from './diskBenchmark.mjs';

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

// 1. transferMBps: MB = 1e6 bytes convention
eq(transferMBps(1e8, 1000), 100, '100 MB in 1s -> 100 MB/s');
eq(transferMBps(5e7, 500), 100, '50 MB in 0.5s -> 100 MB/s');
eq(transferMBps(1e6, 1000), 1, '1 MB in 1s -> 1 MB/s');
eq(transferMBps(1000, 0), null, 'zero duration -> null');
eq(transferMBps(1000, -5), null, 'negative duration -> null');

// 2. summarizeDisk: from raw {bytes, writeMs, readMs}
eq(summarizeDisk({ bytes: 1e8, writeMs: 1000, readMs: 200 }), { present: true, writeMBps: 100, readMBps: 500 }, 'summarize from raw ms');
// summarizeDisk: from pre-computed MBps
eq(summarizeDisk({ writeMBps: 250.5, readMBps: 1200 }), { present: true, writeMBps: 250.5, readMBps: 1200 }, 'summarize from precomputed');
// summarizeDisk: empty -> not present
eq(summarizeDisk({}), { present: false, writeMBps: null, readMBps: null }, 'empty -> not present');

// 3. classifyDiskPressure: slow write => heavy; fast => not; absent => not
ok(classifyDiskPressure({ present: true, writeMBps: 30, readMBps: 500 }) === true, 'slow write (<=50) -> disk-heavy');
ok(classifyDiskPressure({ present: true, writeMBps: 900, readMBps: 40 }) === true, 'slow read (<=80) -> disk-heavy');
ok(classifyDiskPressure({ present: true, writeMBps: 900, readMBps: 1500 }) === false, 'fast write+read -> not heavy');
ok(classifyDiskPressure({ present: false, writeMBps: null, readMBps: null }) === false, 'not present -> not heavy');
ok(classifyDiskPressure({ present: true, writeMBps: 900, readMBps: 1500 }, { slowWriteMBps: 1000 }) === true, 'custom slowWrite threshold raises pressure');

// 4. constants sanity
ok(constants.DEFAULT_BENCH_BYTES === 16 * 1024 * 1024, 'default bench size 16 MiB');
ok(constants.DISK_SLOW_WRITE_MBPS > 0 && constants.DISK_SLOW_READ_MBPS > 0, 'slow thresholds positive');

console.log('1..' + n);
console.log(failed === 0
  ? 'diskBenchmark self-test PASSED (' + n + ' assertions)'
  : 'diskBenchmark self-test FAILED (' + failed + '/' + n + ')');
process.exit(failed === 0 ? 0 : 1);
