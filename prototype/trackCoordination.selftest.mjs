// prototype/trackCoordination.selftest.mjs
// Deterministic self-test for the pure parallel-track coordination logic.
// Run: node prototype/trackCoordination.selftest.mjs
import assert from 'node:assert/strict';
import {
  normalizeTrackFile,
  filesOverlap,
  parseTrackFiles,
  parseTrackClaims,
  detectTrackCollisions,
  proposeCollisions,
  classifyCoBatch
} from './trackCoordination.mjs';

let n = 0;
const ok = (label) => { n += 1; console.log('ok ' + n + ' - ' + label); };

// normalizeTrackFile
assert.equal(normalizeTrackFile('package.json').kind, 'file');
assert.equal(normalizeTrackFile('src/reporting/**').kind, 'dir');
assert.equal(normalizeTrackFile('src/reporting/**').prefix, 'src/reporting/');
assert.equal(normalizeTrackFile('docs/').kind, 'dir');
assert.equal(normalizeTrackFile('a\\b\\c.ts').path, 'a/b/c.ts'); // backslash normalized
assert.equal(normalizeTrackFile('   '), null);
ok('normalizeTrackFile: files, dirs, backslash, empty');

// filesOverlap: exact file collision
assert.deepEqual(filesOverlap(['package.json'], ['package.json', 'x.ts']), ['package.json']);
// disjoint
assert.deepEqual(filesOverlap(['package.json'], ['AGENTS.md']), []);
// dir contains file
assert.ok(filesOverlap(['src/reporting/**'], ['src/reporting/run.ts']).length === 1);
// file at the dir root
assert.ok(filesOverlap(['docs/'], ['docs/readme.md']).length === 1);
// nested dirs
assert.ok(filesOverlap(['src/**'], ['src/reporting/**']).length === 1);
// sibling dirs are disjoint
assert.deepEqual(filesOverlap(['src/git/**'], ['src/ui/**']), []);
ok('filesOverlap: exact, disjoint, dir-contains-file, nested dirs, siblings');

// parseTrackFiles
assert.deepEqual(parseTrackFiles('files=package.json,package-lock.json | deps bump').files, ['package.json', 'package-lock.json']);
assert.equal(parseTrackFiles('files=package.json | deps bump').note, 'deps bump');
assert.deepEqual(parseTrackFiles('no files token here').files, []);
ok('parseTrackFiles: files list + note + missing token');

// parseTrackClaims lifecycle
const msgs = [
  { ts: '2026-01-01T00:00:00Z', agent: 'WIN', type: 'CLAIM', task: 'track:deps', msg: 'files=package.json,package-lock.json | deps overrides' },
  { ts: '2026-01-01T00:01:00Z', agent: 'LINUX', type: 'CLAIM', task: 'track:docs', msg: 'files=AGENTS.md | pitfall doc' },
  { ts: '2026-01-01T00:05:00Z', agent: 'WIN', type: 'DONE', task: 'track:deps', msg: 'merged' },
  { ts: '2026-01-01T00:02:00Z', agent: 'WIN', type: 'PROGRESS', task: 'not-a-track', msg: 'ignore me' }
];
const claims = parseTrackClaims(msgs);
assert.equal(claims.length, 2);
const deps = claims.find((c) => c.name === 'deps');
const docs = claims.find((c) => c.name === 'docs');
assert.equal(deps.live, false); // closed by DONE
assert.equal(docs.live, true);
assert.deepEqual(deps.files, ['package.json', 'package-lock.json']);
assert.equal(docs.agent, 'LINUX');
ok('parseTrackClaims: lifecycle open/closed + files + owner, ignores non-track tasks');

// re-claim after DONE reopens a track
const reclaim = parseTrackClaims([
  ...msgs,
  { ts: '2026-01-01T01:00:00Z', agent: 'LINUX', type: 'CLAIM', task: 'track:deps', msg: 'files=package.json | new deps work' }
]);
assert.equal(reclaim.find((c) => c.name === 'deps').live, true);
assert.equal(reclaim.find((c) => c.name === 'deps').agent, 'LINUX');
ok('parseTrackClaims: re-CLAIM after DONE reopens with new owner');

// detectTrackCollisions: disjoint live tracks -> none
assert.deepEqual(detectTrackCollisions(claims), []);
// colliding live tracks
const collidingClaims = parseTrackClaims([
  { ts: '2026-01-01T00:00:00Z', agent: 'WIN', type: 'CLAIM', task: 'track:a', msg: 'files=package.json' },
  { ts: '2026-01-01T00:01:00Z', agent: 'LINUX', type: 'CLAIM', task: 'track:b', msg: 'files=package.json,x.ts' }
]);
const cols = detectTrackCollisions(collidingClaims);
assert.equal(cols.length, 1);
assert.deepEqual(cols[0].overlap, ['package.json']);
ok('detectTrackCollisions: disjoint=none, overlap flagged with paths');

// proposeCollisions: check a new file set before claiming
const pcOk = proposeCollisions(['docs/faq.md'], claims);
assert.deepEqual(pcOk, []);
const pcBad = proposeCollisions(['AGENTS.md'], claims);
assert.equal(pcBad.length, 1);
assert.equal(pcBad[0].track, 'docs');
// excludeAgent lets me re-check my own without self-collision
const pcSelf = proposeCollisions(['AGENTS.md'], parseTrackClaims([
  { ts: '2026-01-01T00:00:00Z', agent: 'WIN', type: 'CLAIM', task: 'track:docs', msg: 'files=AGENTS.md' }
]), { excludeAgent: 'WIN' });
assert.deepEqual(pcSelf, []);
ok('proposeCollisions: clean, conflict, excludeAgent(self)');

// classifyCoBatch
const readout = classifyCoBatch(
  [
    { number: 1, headRefName: 'feature/1-a', author: 'WIN', armed: true, mergeStateStatus: 'CLEAN' },
    { number: 2, headRefName: 'feature/2-b', author: 'LINUX', armed: true, mergeStateStatus: 'BLOCKED' },
    { number: 3, headRefName: 'feature/3-c', author: 'WIN', armed: false, mergeStateStatus: 'CLEAN' }
  ],
  { waitMinutes: 9, grouping: 'ALLGREEN', maxMerge: 15, maxBuild: 1, method: 'REBASE' }
);
assert.deepEqual(readout.coBatchNow, [1]); // armed + green
assert.deepEqual(readout.willFollow, [2]); // armed but still building
assert.equal(readout.counts.unarmed, 1);
assert.equal(readout.policy.waitMinutes, 9);
ok('classifyCoBatch: ready co-batch, building follows, unarmed counted, policy echoed');

console.log('1..' + n);
console.log('trackCoordination self-test PASSED (' + n + ' assertions groups)');
