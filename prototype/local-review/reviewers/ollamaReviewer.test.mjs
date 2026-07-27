// @ts-check
/**
 * Unit tests for the ollama-local review provider (prototype/local-review/reviewers/ollamaReviewer.mjs).
 * Node built-in runner: `node --test prototype/local-review/reviewers/ollamaReviewer.test.mjs`.
 * All model + network I/O is faked/stubbed -- no Ollama server is contacted.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractJsonArray,
  createOllamaReviewGenerate,
  makeOllamaReviewer,
  REVIEW_SYSTEM,
  REVIEW_FORMAT,
} from './ollamaReviewer.mjs';
import { reviewChangeSet, buildReport } from '../reviewDiff.mjs';

// ---------------------------------------------------------------------------
// extractJsonArray (pure core).
// ---------------------------------------------------------------------------

test('extractJsonArray: reads a bare JSON array', () => {
  const out = extractJsonArray('[{"file":"a.ts","line":1,"severity":"nit","message":"x"}]');
  assert.equal(out.length, 1);
  assert.equal(out[0].file, 'a.ts');
});

test('extractJsonArray: reads a ```json fenced array', () => {
  const text = 'Here are the findings:\n```json\n[{"file":"a.ts","line":2,"severity":"warning","message":"y"}]\n```\n';
  const out = extractJsonArray(text);
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, 'warning');
});

test('extractJsonArray: extracts from surrounding prose', () => {
  const text = 'I reviewed the diff. Result: [{"file":"b.ts","line":null,"severity":"blocker","message":"z"}] -- done.';
  const out = extractJsonArray(text);
  assert.equal(out.length, 1);
  assert.equal(out[0].line, null);
});

test('extractJsonArray: prefers the fenced block over stray brackets in prose', () => {
  const text = 'See note [1] and item [2] above.\n```json\n[{"file":"c.ts","line":3,"severity":"nit","message":"real"}]\n```';
  const out = extractJsonArray(text);
  assert.equal(out.length, 1);
  assert.equal(out[0].message, 'real');
});

test('extractJsonArray: an explicit empty array is a valid clean result', () => {
  assert.deepEqual(extractJsonArray('[]'), []);
  assert.deepEqual(extractJsonArray('No issues found.\n```json\n[]\n```'), []);
});

test('extractJsonArray: fail-closed when no JSON array is present', () => {
  assert.throws(() => extractJsonArray('The change set looks clean, no findings.'), /parseable JSON array/);
  assert.throws(() => extractJsonArray(''), /parseable JSON array/);
});

test('extractJsonArray: fail-closed when the array does not parse', () => {
  assert.throws(() => extractJsonArray('[not valid json'), /parseable JSON array/);
});

// ---------------------------------------------------------------------------
// makeOllamaReviewer (injectable ReviewFn).
// ---------------------------------------------------------------------------

test('makeOllamaReviewer: passes the reviewDiff prompt to the injected model and returns its findings', async () => {
  let captured = null;
  const generate = async (prompt) => {
    captured = prompt;
    return '```json\n[{"file":"a.ts","line":5,"severity":"warning","message":"unchecked"}]\n```';
  };
  const review = makeOllamaReviewer({ generate });
  const out = await review('PROMPT-BODY');
  assert.equal(captured, 'PROMPT-BODY');
  assert.equal(out.length, 1);
  assert.equal(out[0].file, 'a.ts');
});

test('makeOllamaReviewer: a clean model response yields no findings', async () => {
  const review = makeOllamaReviewer({ generate: async () => '[]' });
  assert.deepEqual(await review('p'), []);
});

test('makeOllamaReviewer: propagates fail-closed when the model ignores the contract', async () => {
  const review = makeOllamaReviewer({ generate: async () => 'looks fine to me' });
  await assert.rejects(review('p'), /parseable JSON array/);
});

// ---------------------------------------------------------------------------
// createOllamaReviewGenerate (network shape, stubbed fetch).
// ---------------------------------------------------------------------------

test('createOllamaReviewGenerate: posts a deterministic /api/chat request and returns message content', async () => {
  const original = globalThis.fetch;
  let seenUrl = null;
  let seenBody = null;
  globalThis.fetch = async (url, init) => {
    seenUrl = url;
    seenBody = JSON.parse(init.body);
    return { json: async () => ({ message: { content: '[]' } }) };
  };
  try {
    const generate = createOllamaReviewGenerate({ ollamaUrl: 'http://host:1234', model: 'test-model' });
    const out = await generate('the-prompt');
    assert.equal(out, '[]');
    assert.equal(seenUrl, 'http://host:1234/api/chat');
    assert.equal(seenBody.model, 'test-model');
    assert.equal(seenBody.stream, false);
    assert.equal(seenBody.options.temperature, 0);
    assert.equal(seenBody.messages[0].role, 'system');
    assert.equal(seenBody.messages[0].content, REVIEW_SYSTEM);
    assert.equal(seenBody.messages[1].role, 'user');
    assert.equal(seenBody.messages[1].content, 'the-prompt');
    // structured outputs on by default: a findings-array JSON schema constrains decoding
    assert.deepEqual(seenBody.format, REVIEW_FORMAT);
    assert.equal(seenBody.format.type, 'array');
    assert.deepEqual(seenBody.format.items.properties.severity.enum, ['blocker', 'warning', 'nit']);
  } finally {
    globalThis.fetch = original;
  }
});

test('createOllamaReviewGenerate: format:null opts out of structured outputs', async () => {
  const original = globalThis.fetch;
  let seenBody = null;
  globalThis.fetch = async (_url, init) => {
    seenBody = JSON.parse(init.body);
    return { json: async () => ({ message: { content: '[]' } }) };
  };
  try {
    const generate = createOllamaReviewGenerate({ model: 'm', format: null });
    await generate('p');
    assert.equal('format' in seenBody, false);
  } finally {
    globalThis.fetch = original;
  }
});

test('createOllamaReviewGenerate: surfaces an ollama error field as a throw', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ json: async () => ({ error: 'model not found' }) });
  try {
    const generate = createOllamaReviewGenerate({ model: 'missing' });
    await assert.rejects(generate('p'), /model not found/);
  } finally {
    globalThis.fetch = original;
  }
});

// ---------------------------------------------------------------------------
// Integration: reviewDiff seam -> report@v1 with an Ollama-backed reviewer.
// ---------------------------------------------------------------------------

test('reviewChangeSet + buildReport: ollama reviewer feeds the same report@v1 contract', async () => {
  const changeSet = {
    diff: 'diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n+const x = doThing()\n',
    files: [{ path: 'a.ts', status: 'M' }],
  };
  const generate = async () =>
    '[{"file":"a.ts","line":1,"severity":"warning","message":"return value ignored","ruleId":"unchecked-return"}]';
  const review = makeOllamaReviewer({ generate });
  const findings = await reviewChangeSet(changeSet, { review });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'unchecked-return');

  const report = buildReport({ findings, threshold: 'warning' });
  assert.equal(report.schema, 'vi-history-suite/local-review@v1');
  assert.equal(report.summary.total, 1);
  assert.equal(report.summary.warnings, 1);
  assert.equal(report.blocking, true);
});

test('reviewChangeSet: a clean ollama pass produces a non-blocking report', async () => {
  const changeSet = { diff: 'diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n+// comment\n', files: [{ path: 'a.ts', status: 'M' }] };
  const review = makeOllamaReviewer({ generate: async () => '[]' });
  const findings = await reviewChangeSet(changeSet, { review });
  const report = buildReport({ findings, threshold: 'warning' });
  assert.equal(report.summary.total, 0);
  assert.equal(report.blocking, false);
});
