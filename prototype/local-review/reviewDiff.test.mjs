// @ts-check
/**
 * Unit tests for the PURE CORE of the local review gate.
 * Uses the Node built-in test runner (`node --test`) and an INJECTED fake
 * reviewer + fake git runner — no live model, no real git, fully deterministic.
 *
 * Run: node --test reviewDiff.test.mjs   (or: npm test)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RUBRIC,
  LEARNED_RUBRIC,
  ACTIVE_RUBRIC,
  REPORT_SCHEMA,
  SCHEMA_VERSION,
  ReviewInputError,
  parseNameStatus,
  buildReviewPrompt,
  validateFinding,
  validateFindings,
  sortFindings,
  decideBlocking,
  countBySeverity,
  buildReport,
  formatHumanSummary,
  reviewChangeSet,
  collectChangeSet,
} from './reviewDiff.mjs';

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const SAMPLE_DIFF = [
  'diff --git a/src/foo.ts b/src/foo.ts',
  'index 111..222 100644',
  '--- a/src/foo.ts',
  '+++ b/src/foo.ts',
  '@@ -1,3 +1,4 @@',
  ' const x = 1;',
  '+const y = 2;',
  ' export const z = x;',
].join('\n');

const SAMPLE_CHANGE_SET = {
  diff: SAMPLE_DIFF,
  files: [{ status: 'M', path: 'src/foo.ts' }],
};

/** A fake reviewer that returns canned findings, ignoring the prompt. */
function fakeReviewer(findings) {
  return async () => findings;
}

/** A fake reviewer that captures the prompt it was given. */
function capturingReviewer(sink) {
  return async (prompt) => {
    sink.prompt = prompt;
    return [];
  };
}

/** A fake git runner that returns canned stdout per joined-args key and records calls. */
function fakeGit(responses, calls) {
  return async (args) => {
    calls.push(args);
    const key = args.join(' ');
    if (!(key in responses)) throw new Error(`unexpected git call: ${key}`);
    return responses[key];
  };
}

// ---------------------------------------------------------------------------
// RUBRIC shape.
// ---------------------------------------------------------------------------

test('RUBRIC encodes all eight recurring findings (a-h) with required fields', () => {
  assert.equal(RUBRIC.length, 8);
  const letters = RUBRIC.map((r) => r.letter);
  assert.deepEqual(letters, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  for (const rule of RUBRIC) {
    assert.equal(typeof rule.id, 'string');
    assert.ok(rule.id.length > 0);
    assert.ok(['blocker', 'warning', 'nit'].includes(rule.defaultSeverity));
    assert.ok(rule.title.length > 0);
    assert.ok(rule.guidance.length > 0);
    assert.ok(rule.antipattern.length > 0);
  }
  // (a) fail-closed input validation is the one blocker-by-default rule.
  const failClosed = RUBRIC.find((r) => r.id === 'fail-closed-input-validation');
  assert.equal(failClosed.defaultSeverity, 'blocker');
});

test('LEARNED_RUBRIC entries carry provenance and use non-colliding L-letters', () => {
  assert.ok(LEARNED_RUBRIC.length >= 1);
  const baseLetters = new Set(RUBRIC.map((r) => r.letter));
  const seen = new Set();
  for (const rule of LEARNED_RUBRIC) {
    assert.ok(rule.id.length > 0);
    assert.ok(['blocker', 'warning', 'nit'].includes(rule.defaultSeverity));
    assert.ok(rule.title.length > 0 && rule.guidance.length > 0 && rule.antipattern.length > 0);
    // Iterative-strictness contract: every learned rule cites the Copilot review it came from.
    assert.equal(typeof rule.source, 'string');
    assert.ok(rule.source.length > 0, `learned rule ${rule.id} must cite its source`);
    assert.ok(!baseLetters.has(rule.letter), `learned letter ${rule.letter} collides with the base rubric`);
    assert.ok(!seen.has(rule.letter), `duplicate learned letter ${rule.letter}`);
    seen.add(rule.letter);
  }
});

test('ACTIVE_RUBRIC is the base rubric plus every learned rule', () => {
  assert.equal(ACTIVE_RUBRIC.length, RUBRIC.length + LEARNED_RUBRIC.length);
  const ids = new Set(ACTIVE_RUBRIC.map((r) => r.id));
  for (const rule of [...RUBRIC, ...LEARNED_RUBRIC]) {
    assert.ok(ids.has(rule.id), `ACTIVE_RUBRIC should include ${rule.id}`);
  }
});

// ---------------------------------------------------------------------------
// parseNameStatus.
// ---------------------------------------------------------------------------

test('parseNameStatus parses statuses, handles renames, skips blanks, sorts stably', () => {
  const raw = [
    'M\tsrc/z.ts',
    'A\tsrc/a.ts',
    '', // blank
    'R100\tsrc/old.ts\tsrc/new.ts', // rename -> destination is last
  ].join('\n');
  const files = parseNameStatus(raw);
  assert.deepEqual(files, [
    { status: 'A', path: 'src/a.ts' },
    { status: 'R100', path: 'src/new.ts' },
    { status: 'M', path: 'src/z.ts' },
  ]);
});

test('parseNameStatus tolerates CRLF line endings', () => {
  const files = parseNameStatus('M\tsrc/foo.ts\r\nA\tsrc/bar.ts\r\n');
  assert.deepEqual(files.map((f) => f.path), ['src/bar.ts', 'src/foo.ts']);
});

test('parseNameStatus fails closed on non-string input', () => {
  assert.throws(() => parseNameStatus(null), ReviewInputError);
  assert.throws(() => parseNameStatus(42), ReviewInputError);
});

// ---------------------------------------------------------------------------
// buildReviewPrompt.
// ---------------------------------------------------------------------------

test('buildReviewPrompt embeds every rubric id, the file list, and the diff', () => {
  const prompt = buildReviewPrompt(SAMPLE_CHANGE_SET);
  for (const rule of RUBRIC) {
    assert.ok(prompt.includes(rule.id), `prompt should mention rule ${rule.id}`);
  }
  assert.ok(prompt.includes('src/foo.ts'));
  assert.ok(prompt.includes('const y = 2;'));
  assert.ok(prompt.includes('Return ONLY a JSON array of findings'));
});

test('buildReviewPrompt embeds learned rules with their LEARNED FROM provenance', () => {
  const prompt = buildReviewPrompt(SAMPLE_CHANGE_SET);
  for (const rule of LEARNED_RUBRIC) {
    assert.ok(prompt.includes(rule.id), `prompt should mention learned rule ${rule.id}`);
    assert.ok(prompt.includes(rule.source), `prompt should cite provenance for ${rule.id}`);
  }
  assert.ok(prompt.includes('LEARNED FROM:'));
});

test('buildReviewPrompt handles an empty change set without throwing', () => {
  const prompt = buildReviewPrompt({ diff: '', files: [] });
  assert.ok(prompt.includes('(no changed files reported)'));
  assert.ok(prompt.includes('(empty diff)'));
});

test('buildReviewPrompt fails closed on a malformed change set', () => {
  assert.throws(() => buildReviewPrompt(null), ReviewInputError);
  assert.throws(() => buildReviewPrompt({ diff: 123 }), ReviewInputError);
  assert.throws(() => buildReviewPrompt({ diff: 'x', files: 'nope' }), ReviewInputError);
});

// ---------------------------------------------------------------------------
// validateFinding / validateFindings (fail-closed contract — rubric a).
// ---------------------------------------------------------------------------

test('validateFinding accepts a valid finding and normalizes missing line to null', () => {
  const f = validateFinding({ file: 'src/a.ts', severity: 'warning', message: 'x' });
  assert.deepEqual(f, { file: 'src/a.ts', line: null, severity: 'warning', message: 'x' });
});

test('validateFinding keeps optional ruleId when present and non-empty', () => {
  const f = validateFinding({
    file: 'src/a.ts',
    line: 5,
    severity: 'blocker',
    message: 'bad',
    ruleId: 'fail-closed-input-validation',
  });
  assert.equal(f.ruleId, 'fail-closed-input-validation');
  assert.equal(f.line, 5);
});

test('validateFinding throws (never fabricates) on malformed input', () => {
  assert.throws(() => validateFinding(null), ReviewInputError);
  assert.throws(() => validateFinding([]), ReviewInputError);
  assert.throws(() => validateFinding({ severity: 'warning', message: 'm' }), ReviewInputError); // no file
  assert.throws(() => validateFinding({ file: 'a', message: 'm' }), ReviewInputError); // no severity
  assert.throws(() => validateFinding({ file: 'a', severity: 'warning' }), ReviewInputError); // no message
  assert.throws(
    () => validateFinding({ file: 'a', severity: 'critical', message: 'm' }),
    ReviewInputError,
  ); // bad severity
  assert.throws(
    () => validateFinding({ file: 'a', severity: 'nit', message: 'm', line: 0 }),
    ReviewInputError,
  ); // non-positive line
  assert.throws(
    () => validateFinding({ file: 'a', severity: 'nit', message: 'm', line: 1.5 }),
    ReviewInputError,
  ); // non-integer line
});

test('validateFindings fails closed when the reviewer does not return an array', () => {
  assert.throws(() => validateFindings({ nope: true }), ReviewInputError);
  assert.throws(() => validateFindings(null), ReviewInputError);
});

// ---------------------------------------------------------------------------
// sortFindings (determinism by construction — rubric g).
// ---------------------------------------------------------------------------

test('sortFindings orders by severity desc, then file, then line, deterministically', () => {
  const input = [
    { file: 'b.ts', line: 2, severity: 'nit', message: 'n' },
    { file: 'a.ts', line: 9, severity: 'blocker', message: 'b2' },
    { file: 'a.ts', line: 1, severity: 'blocker', message: 'b1' },
    { file: 'a.ts', line: null, severity: 'warning', message: 'w' },
  ];
  const sorted = sortFindings(input);
  assert.deepEqual(
    sorted.map((f) => `${f.severity}:${f.file}:${f.line}`),
    ['blocker:a.ts:1', 'blocker:a.ts:9', 'warning:a.ts:null', 'nit:b.ts:2'],
  );
  // Pure: input is not mutated.
  assert.equal(input[0].file, 'b.ts');
});

// ---------------------------------------------------------------------------
// decideBlocking + countBySeverity (threshold/exit decision).
// ---------------------------------------------------------------------------

const MIXED = [
  { file: 'a.ts', line: 1, severity: 'blocker', message: 'b' },
  { file: 'b.ts', line: 2, severity: 'warning', message: 'w' },
  { file: 'c.ts', line: 3, severity: 'nit', message: 'n' },
];

test('countBySeverity tallies each severity', () => {
  assert.deepEqual(countBySeverity(MIXED), { blocker: 1, warning: 1, nit: 1 });
});

test('decideBlocking: default threshold (warning) blocks warning + blocker, not nit', () => {
  const { blocking, blockingFindings } = decideBlocking(MIXED);
  assert.equal(blocking, true);
  assert.deepEqual(blockingFindings.map((f) => f.severity).sort(), ['blocker', 'warning']);
});

test('decideBlocking: threshold=blocker only blocks blockers', () => {
  const { blockingFindings } = decideBlocking(MIXED, 'blocker');
  assert.deepEqual(blockingFindings.map((f) => f.severity), ['blocker']);
});

test('decideBlocking: threshold=nit blocks everything', () => {
  const { blocking, blockingFindings } = decideBlocking(MIXED, 'nit');
  assert.equal(blocking, true);
  assert.equal(blockingFindings.length, 3);
});

test('decideBlocking: no findings => not blocking', () => {
  assert.deepEqual(decideBlocking([]), { blocking: false, blockingFindings: [] });
});

test('decideBlocking fails closed on an unknown threshold', () => {
  assert.throws(() => decideBlocking(MIXED, 'critical'), ReviewInputError);
});

// ---------------------------------------------------------------------------
// buildReport (schema-tagged report shape — rubric h additive schema).
// ---------------------------------------------------------------------------

test('buildReport emits the schema-tagged report with correct summary + blocking', () => {
  const report = buildReport({ findings: MIXED, threshold: 'warning' });
  assert.equal(report.schema, REPORT_SCHEMA);
  assert.equal(report.schema, 'vi-history-suite/local-review@v1');
  assert.equal(report.schemaVersion, SCHEMA_VERSION);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.threshold, 'warning');
  assert.equal(report.blocking, true);
  assert.deepEqual(report.summary, {
    total: 3,
    blockers: 1,
    warnings: 1,
    nits: 1,
    blockingCount: 2,
    threshold: 'warning',
  });
  // findings are sorted (blocker first).
  assert.equal(report.findings[0].severity, 'blocker');
});

test('buildReport on a clean change set is not blocking', () => {
  const report = buildReport({ findings: [] });
  assert.equal(report.blocking, false);
  assert.equal(report.summary.total, 0);
});

test('buildReport fails closed on non-array findings', () => {
  assert.throws(() => buildReport({ findings: 'nope' }), ReviewInputError);
});

// ---------------------------------------------------------------------------
// formatHumanSummary.
// ---------------------------------------------------------------------------

test('formatHumanSummary shows BLOCK verdict and lists findings', () => {
  const report = buildReport({ findings: MIXED });
  const text = formatHumanSummary(report);
  assert.match(text, /BLOCK/);
  assert.match(text, /a\.ts:1/);
  assert.match(text, /\[blocker/);
});

test('formatHumanSummary shows PASS verdict for a clean change set', () => {
  const text = formatHumanSummary(buildReport({ findings: [] }));
  assert.match(text, /PASS/);
  assert.match(text, /no findings/);
});

// ---------------------------------------------------------------------------
// reviewChangeSet (the injectable review seam).
// ---------------------------------------------------------------------------

test('reviewChangeSet passes the built prompt to the injected reviewer', async () => {
  const sink = {};
  await reviewChangeSet(SAMPLE_CHANGE_SET, { review: capturingReviewer(sink) });
  assert.ok(sink.prompt.includes('src/foo.ts'));
  assert.ok(sink.prompt.includes('fail-closed-input-validation'));
});

test('reviewChangeSet returns validated findings from the injected fake reviewer', async () => {
  const canned = [
    { file: 'src/foo.ts', line: 7, severity: 'warning', message: 'comment claims UTC round-trip' },
  ];
  const findings = await reviewChangeSet(SAMPLE_CHANGE_SET, { review: fakeReviewer(canned) });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'warning');
  assert.equal(findings[0].line, 7);
});

test('reviewChangeSet fails closed when the reviewer returns a malformed finding', async () => {
  const bad = [{ file: 'src/foo.ts', severity: 'warning' /* no message */ }];
  await assert.rejects(
    () => reviewChangeSet(SAMPLE_CHANGE_SET, { review: fakeReviewer(bad) }),
    ReviewInputError,
  );
});

test('reviewChangeSet requires an injected review function', async () => {
  await assert.rejects(() => reviewChangeSet(SAMPLE_CHANGE_SET, {}), ReviewInputError);
});

// End-to-end pure pipeline with an injected fake reviewer -> report.
test('end-to-end: fake reviewer -> validate -> report -> blocking decision', async () => {
  const canned = [
    { file: 'src/date.ts', line: 12, severity: 'warning', message: 'Date.parse too permissive', ruleId: 'iso8601-strict-parsing' },
    { file: 'src/model.ts', line: 3, severity: 'blocker', message: 'no fail-closed validation', ruleId: 'fail-closed-input-validation' },
    { file: 'src/x.ts', line: 1, severity: 'nit', message: 'rename var', ruleId: 'style' },
  ];
  const findings = await reviewChangeSet(SAMPLE_CHANGE_SET, { review: fakeReviewer(canned) });
  const report = buildReport({ findings, threshold: 'warning' });
  assert.equal(report.blocking, true);
  assert.equal(report.summary.blockingCount, 2);
  assert.equal(report.findings[0].severity, 'blocker'); // sorted first
});

// ---------------------------------------------------------------------------
// collectChangeSet (injectable git runner).
// ---------------------------------------------------------------------------

test('collectChangeSet builds range diff args for the default base', async () => {
  const calls = [];
  const git = fakeGit(
    {
      'diff --unified=3 develop...HEAD': SAMPLE_DIFF,
      'diff --name-status develop...HEAD': 'M\tsrc/foo.ts',
    },
    calls,
  );
  const cs = await collectChangeSet({}, { git });
  assert.deepEqual(calls[0], ['diff', '--unified=3', 'develop...HEAD']);
  assert.deepEqual(calls[1], ['diff', '--name-status', 'develop...HEAD']);
  assert.equal(cs.diff, SAMPLE_DIFF);
  assert.deepEqual(cs.files, [{ status: 'M', path: 'src/foo.ts' }]);
});

test('collectChangeSet honors a custom --base', async () => {
  const calls = [];
  const git = fakeGit(
    {
      'diff --unified=3 main...HEAD': SAMPLE_DIFF,
      'diff --name-status main...HEAD': 'A\tsrc/new.ts',
    },
    calls,
  );
  await collectChangeSet({ base: 'main' }, { git });
  assert.deepEqual(calls[0], ['diff', '--unified=3', 'main...HEAD']);
});

test('collectChangeSet builds --cached args when staged', async () => {
  const calls = [];
  const git = fakeGit(
    {
      'diff --cached --unified=3': SAMPLE_DIFF,
      'diff --cached --name-status': 'M\tsrc/foo.ts',
    },
    calls,
  );
  await collectChangeSet({ staged: true }, { git });
  assert.deepEqual(calls[0], ['diff', '--cached', '--unified=3']);
  assert.deepEqual(calls[1], ['diff', '--cached', '--name-status']);
});

test('collectChangeSet requires an injected git runner', async () => {
  await assert.rejects(() => collectChangeSet({}, {}), ReviewInputError);
});

test('collectChangeSet fails closed on an empty base', async () => {
  await assert.rejects(
    () => collectChangeSet({ base: '' }, { git: async () => '' }),
    ReviewInputError,
  );
});
