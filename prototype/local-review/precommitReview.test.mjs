import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HYGIENE_RUBRIC,
  LEARNED_HYGIENE_RUBRIC,
  PROMOTED_FROM_PREPUSH,
  ACTIVE_HYGIENE_RUBRIC,
  iterateAddedLines,
  detectHygieneFindings,
  parseModelFindings,
  buildHygieneModelPrompt,
  reviewStagedForCommit
} from './precommitReview.mjs';
import { LEARNED_RUBRIC as PREPUSH_LEARNED_RUBRIC } from './reviewDiff.mjs';

function diffFor(file, addedLines) {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1,0 +1,' + addedLines.length + ' @@',
    ...addedLines.map((l) => `+${l}`)
  ].join('\n');
}

test('HYGIENE_RUBRIC is disjoint deterministic + judgment criteria', () => {
  const ids = HYGIENE_RUBRIC.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(HYGIENE_RUBRIC.some((r) => r.deterministic));
  assert.ok(HYGIENE_RUBRIC.some((r) => !r.deterministic));
});

test('iterateAddedLines attributes file and new-file line numbers', () => {
  const diff = diffFor('src/a.ts', ['const x = 1;', 'const y = 2;']);
  const added = [...iterateAddedLines(diff)];
  assert.deepEqual(added.map((a) => [a.file, a.line, a.text]), [
    ['src/a.ts', 1, 'const x = 1;'],
    ['src/a.ts', 2, 'const y = 2;']
  ]);
});

test('iterateAddedLines fails closed on non-string', () => {
  assert.throws(() => [...iterateAddedLines(42)], /string diff/);
});

test('detects a GitHub PAT secret (blocker)', () => {
  const diff = diffFor('src/a.ts', [`const t = "ghp_${'a'.repeat(36)}";`]);
  const f = detectHygieneFindings({ files: [{ path: 'src/a.ts' }], diff });
  assert.ok(f.some((x) => x.ruleId === 'secret-in-diff' && x.severity === 'blocker'));
});

test('detects a private key block (blocker)', () => {
  const diff = diffFor('config.pem', ['-----BEGIN RSA PRIVATE KEY-----']);
  const f = detectHygieneFindings({ files: [], diff });
  assert.ok(f.some((x) => x.ruleId === 'secret-in-diff'));
});

test('detects an unresolved merge-conflict marker (blocker)', () => {
  const diff = diffFor('src/a.ts', ['<<<<<<< HEAD', 'const x = 1;', '=======']);
  const f = detectHygieneFindings({ files: [], diff });
  assert.equal(f.filter((x) => x.ruleId === 'merge-conflict-marker').length, 2);
});

test('detects a focused test .only (blocker) in a test file', () => {
  const diff = diffFor('tests/unit/a.test.ts', ['it.only("x", () => {});']);
  const f = detectHygieneFindings({ files: [], diff });
  assert.ok(f.some((x) => x.ruleId === 'focused-test' && x.severity === 'blocker'));
});

test('detects a skipped test .skip (warning) in a test file', () => {
  const diff = diffFor('tests/unit/a.test.ts', ['describe.skip("x", () => {});']);
  const f = detectHygieneFindings({ files: [], diff });
  assert.ok(f.some((x) => x.ruleId === 'skipped-test' && x.severity === 'warning'));
});

test('detects console.log (warning) and debugger (blocker) in source, not tests', () => {
  const src = detectHygieneFindings({ files: [], diff: diffFor('src/a.ts', ['console.log("x");', 'debugger;']) });
  assert.ok(src.some((x) => x.ruleId === 'debug-logging' && x.severity === 'warning'));
  assert.ok(src.some((x) => x.ruleId === 'debugger-statement' && x.severity === 'blocker'));
  // A console.log inside a test file is NOT flagged as debug-logging.
  const testF = detectHygieneFindings({ files: [], diff: diffFor('tests/unit/a.test.ts', ['console.log("x");']) });
  assert.ok(!testF.some((x) => x.ruleId === 'debug-logging'));
});

test('detects accidental artifact path adds (blocker)', () => {
  for (const p of ['out/x.js', 'coverage/lcov.info', '.lvkit/map.json', 'ext.vsix', '.env']) {
    const f = detectHygieneFindings({ files: [{ path: p }], diff: '' });
    assert.ok(f.some((x) => x.ruleId === 'accidental-artifact'), `expected artifact finding for ${p}`);
  }
});

test('detects mojibake (warning)', () => {
  const f = detectHygieneFindings({ files: [], diff: diffFor('README.md', ['caf\uFFFD']) });
  assert.ok(f.some((x) => x.ruleId === 'encoding-mojibake'));
});

test('a clean staged diff yields no findings', () => {
  const f = detectHygieneFindings({ files: [{ path: 'src/a.ts' }], diff: diffFor('src/a.ts', ['export const answer = 42;']) });
  assert.deepEqual(f, []);
});

test('hygiene-allow:<ruleId> suppresses that specific finding on the line', () => {
  const f = detectHygieneFindings({ files: [], diff: diffFor('src/a.ts', ['debugger; // hygiene-allow:debugger-statement']) });
  assert.equal(f.filter((x) => x.ruleId === 'debugger-statement').length, 0);
});

test('bare hygiene-allow suppresses any finding on the line', () => {
  const f = detectHygieneFindings({ files: [], diff: diffFor('src/a.ts', ['console.log("x"); // hygiene-allow']) });
  assert.deepEqual(f, []);
});

test('self-excludes the reviewer own directory by default (linter self-reference)', () => {
  const f = detectHygieneFindings(
    { files: [{ path: 'prototype/local-review/x.mjs' }], diff: diffFor('prototype/local-review/precommitReview.mjs', ['debugger;']) }
  );
  assert.deepEqual(f, []);
});

test('honors caller-supplied excludePaths', () => {
  const f = detectHygieneFindings(
    { files: [], diff: diffFor('vendor/thirdparty.js', ['debugger;']) },
    { excludePaths: ['vendor/'] }
  );
  assert.deepEqual(f, []);
});

test('detectHygieneFindings fails closed on a non-object change set', () => {
  assert.throws(() => detectHygieneFindings(null), /change set/);
});

test('parseModelFindings tolerates {findings:[...]}, bare array, and garbage', () => {
  assert.equal(parseModelFindings('{"findings":[{"file":"a","severity":"nit","message":"m"}]}').length, 1);
  assert.equal(parseModelFindings('[{"file":"a"}]').length, 1);
  assert.deepEqual(parseModelFindings('no json here'), []);
  assert.deepEqual(parseModelFindings(''), []);
});

test('buildHygieneModelPrompt asks only for judgment criteria', () => {
  const p = buildHygieneModelPrompt({ files: [{ path: 'src/a.ts' }], diff: diffFor('src/a.ts', ['x']) });
  assert.match(p, /scope-coherence/);
  assert.match(p, /leftover-marker/);
  // Deterministic ids must NOT be requested from the model.
  assert.doesNotMatch(p, /secret-in-diff/);
});

test('LEARNED_HYGIENE_RUBRIC entries are model-judged, warning, and cite a Copilot-PR source', () => {
  assert.ok(LEARNED_HYGIENE_RUBRIC.length >= 1);
  for (const rule of LEARNED_HYGIENE_RUBRIC) {
    assert.equal(rule.deterministic, false, `${rule.id} must be model-judged`);
    assert.equal(rule.severity, 'warning', `${rule.id} must be warning-only (never hard-block a commit)`);
    assert.equal(rule.promotedFrom, 'copilot-pr');
    assert.ok(typeof rule.source === 'string' && rule.source.length > 0, `${rule.id} must cite its source`);
  }
});

test('PROMOTED_FROM_PREPUSH mirrors every pre-push learned rule as warning-only judgment', () => {
  assert.equal(PROMOTED_FROM_PREPUSH.length, PREPUSH_LEARNED_RUBRIC.length);
  const prepushIds = new Set(PREPUSH_LEARNED_RUBRIC.map((r) => r.id));
  for (const rule of PROMOTED_FROM_PREPUSH) {
    assert.ok(prepushIds.has(rule.id), `${rule.id} should mirror a pre-push learned rule`);
    assert.equal(rule.deterministic, false);
    assert.equal(rule.severity, 'warning');
    assert.equal(rule.promotedFrom, 'pre-push');
    assert.ok(rule.desc.length > 0);
  }
});

test('ACTIVE_HYGIENE_RUBRIC is the base plus both feeds, deduped by id', () => {
  const ids = ACTIVE_HYGIENE_RUBRIC.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'active rubric must have no duplicate ids');
  for (const rule of [...HYGIENE_RUBRIC, ...PROMOTED_FROM_PREPUSH, ...LEARNED_HYGIENE_RUBRIC]) {
    assert.ok(ids.includes(rule.id), `active rubric should include ${rule.id}`);
  }
});

test('buildHygieneModelPrompt embeds promoted rules with their provenance', () => {
  const p = buildHygieneModelPrompt({ files: [{ path: 'src/a.ts' }], diff: diffFor('src/a.ts', ['x']) });
  for (const rule of [...PROMOTED_FROM_PREPUSH, ...LEARNED_HYGIENE_RUBRIC]) {
    assert.ok(p.includes(rule.id), `prompt should mention promoted rule ${rule.id}`);
  }
  assert.match(p, /promoted from pre-push/);
  assert.match(p, /promoted from copilot-pr/);
});

test('reviewStagedForCommit merges deterministic + injected model findings and blocks', async () => {
  const diff = diffFor('src/a.ts', ['console.log("x");']);
  const report = await reviewStagedForCommit(
    { files: [{ path: 'src/a.ts' }], diff },
    { model: async () => '{"findings":[{"file":"src/a.ts","line":1,"severity":"warning","message":"mixes concerns","ruleId":"scope-coherence"}]}' }
  );
  assert.equal(report.schema, 'vi-history-suite/local-review@v1');
  assert.ok(report.findings.some((x) => x.ruleId === 'debug-logging'));
  assert.ok(report.findings.some((x) => x.ruleId === 'scope-coherence'));
  assert.equal(report.blocking, true); // warnings block at the default threshold
});

test('reviewStagedForCommit still gates on deterministic findings when the model host is down', async () => {
  const diff = diffFor('tests/unit/a.test.ts', ['it.only("x", () => {});']);
  const report = await reviewStagedForCommit(
    { files: [], diff },
    { model: async () => { throw new Error('ECONNREFUSED 11434'); } }
  );
  assert.ok(report.modelError.includes('ECONNREFUSED'));
  assert.ok(report.findings.some((x) => x.ruleId === 'focused-test'));
  assert.equal(report.blocking, true);
});

test('reviewStagedForCommit is clean (exit-0 shape) on a tidy diff with a quiet model', async () => {
  const report = await reviewStagedForCommit(
    { files: [{ path: 'src/a.ts' }], diff: diffFor('src/a.ts', ['export const answer = 42;']) },
    { model: async () => '{"findings":[]}' }
  );
  assert.equal(report.blocking, false);
  assert.equal(report.findings.length, 0);
});
