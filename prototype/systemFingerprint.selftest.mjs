// prototype/systemFingerprint.selftest.mjs (board #2315) -- selftest for the per-actor fingerprint.
// Zero-dependency; run: node prototype/systemFingerprint.selftest.mjs

import * as fp from './systemFingerprint.mjs';

let pass = 0;
let fail = 0;
function ok(name, cond) { if (cond) { pass += 1; } else { fail += 1; console.error('FAIL: ' + name); } }
function eq(name, a, b) { ok(name + ' (got ' + JSON.stringify(a) + ')', JSON.stringify(a) === JSON.stringify(b)); }

// bitnessFromArch
eq('bitness x64', fp.bitnessFromArch('x64'), 64);
eq('bitness arm64', fp.bitnessFromArch('arm64'), 64);
eq('bitness ia32', fp.bitnessFromArch('ia32'), 32);
eq('bitness arm', fp.bitnessFromArch('arm'), 32);
eq('bitness unknown', fp.bitnessFromArch('weird'), null);
eq('bitness empty', fp.bitnessFromArch(undefined), null);

// bytesToMB
eq('bytesToMB 1e6', fp.bytesToMB(1e6), 1);
eq('bytesToMB 16MiB', fp.bytesToMB(16 * 1024 * 1024), 17); // 16777216/1e6 = 16.78 -> 17
eq('bytesToMB 0', fp.bytesToMB(0), 0);
eq('bytesToMB negative', fp.bytesToMB(-5), null);
eq('bytesToMB NaN', fp.bytesToMB(NaN), null);

// summarizeFingerprint
const raw = {
  cpus: [{ model: 'Test CPU  X  @ 3.0GHz' }, {}, {}, {}],
  totalmem: 32e9,
  freemem: 8e9,
  platform: 'linux',
  release: '6.8.0',
  arch: 'x64',
  statfs: { bsize: 4096, bavail: 1000000, type: 61267 },
  labviewBuild: null
};
const s = fp.summarizeFingerprint(raw);
eq('cpu.model normalized', s.cpu.model, 'Test CPU X @ 3.0GHz');
eq('cpu.logicalCores', s.cpu.logicalCores, 4);
eq('memory.totalMB', s.memory.totalMB, 32000);
eq('memory.availableMB', s.memory.availableMB, 8000);
eq('disk.freeMB', s.disk.freeMB, 4096); // 4096 * 1e6 bytes -> 4096 MB
eq('disk.fsTypeId', s.disk.fsTypeId, 61267);
eq('os', s.os, { platform: 'linux', release: '6.8.0', arch: 'x64', bitness: 64 });
eq('labviewBuild null', s.labviewBuild, null);

const empty = fp.summarizeFingerprint({});
eq('empty cpu', empty.cpu, { model: null, logicalCores: null });
eq('empty memory', empty.memory, { totalMB: null, availableMB: null });
eq('empty disk', empty.disk, { freeMB: null, fsTypeId: null });
eq('empty os', empty.os, { platform: null, release: null, arch: null, bitness: null });

// fingerprintId: deterministic + stable across volatile-only change, different on identity change
const id1 = fp.fingerprintId(s);
const id2 = fp.fingerprintId(fp.summarizeFingerprint(raw));
ok('fingerprintId deterministic', id1 === id2 && /^[0-9a-f]{12}$/.test(id1));
const volatileChanged = fp.summarizeFingerprint({ ...raw, freemem: 1e9, statfs: { bsize: 4096, bavail: 5, type: 61267 } });
ok('fingerprintId stable across volatile RAM/disk-free change', fp.fingerprintId(volatileChanged) === id1);
const identityChanged = fp.summarizeFingerprint({ ...raw, cpus: [{ model: 'Different CPU' }, {}, {}, {}] });
ok('fingerprintId differs on identity change', fp.fingerprintId(identityChanged) !== id1);

// sampleFingerprint over a fake io bag
const fakeIo = {
  cpus: () => [{ model: 'IO CPU' }, {}],
  totalmem: () => 16e9,
  freemem: () => 4e9,
  platform: () => 'linux',
  release: () => '6.8.0',
  arch: () => 'x64',
  statfs: () => ({ bsize: 1024, bavail: 2000000, type: 1 }),
  labviewBuild: () => null,
  now: () => '2026-01-01T00:00:00.000Z'
};
const doc = fp.sampleFingerprint(fakeIo);
eq('sample schema', doc.schema, 'vi-history-suite/system-fingerprint@v1');
eq('sample capturedAt', doc.capturedAt, '2026-01-01T00:00:00.000Z');
ok('sample fingerprintId hex', /^[0-9a-f]{12}$/.test(doc.fingerprintId));
eq('sample cores', doc.fingerprint.cpu.logicalCores, 2);
eq('sample totalMB', doc.fingerprint.memory.totalMB, 16000);
eq('sample freeMB', doc.fingerprint.disk.freeMB, 2048); // 1024 * 2e6 -> 2.048e9 -> 2048 MB

console.log('systemFingerprint selftest: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
