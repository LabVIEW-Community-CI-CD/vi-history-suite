// @ts-check
/**
 * Unit tests for the github-bot review provider PURE CORE + injectable shell.
 * Node built-in runner, injected fake `gh` + no-op sleep — no network, no gh CLI.
 *
 * Run: node --test githubBotPoll.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mapBotSeverity,
  sourceOf,
  cleanBody,
  botCommentToRawFinding,
  botCommentsToReport,
  fetchBotComments,
  waitForCopilotReview,
  harvestBotFindings,
} from './githubBotPoll.mjs';

const CODEX_P1 = '**<sub><sub>![P1 Badge](https://img.shields.io/badge/P1-orange)</sub></sub>  Keep rows out**\n\nBody text.\n\nUseful? React with up/down.';
const CODEX_P2 = '![P2 Badge](x) Parse without quoting. Useful? React.';

test('mapBotSeverity maps Codex P1/P2/P3 badges', () => {
  assert.equal(mapBotSeverity('codex', CODEX_P1), 'blocker');
  assert.equal(mapBotSeverity('codex', CODEX_P2), 'warning');
  assert.equal(mapBotSeverity('codex', '![P3 Badge](x) nit'), 'nit');
});

test('mapBotSeverity defaults to warning for Copilot and un-badged bots', () => {
  assert.equal(mapBotSeverity('copilot', 'no badge here'), 'warning');
  assert.equal(mapBotSeverity('codex', 'no badge at all'), 'warning');
  assert.equal(mapBotSeverity('bot', ''), 'warning');
});

test('sourceOf classifies the author login', () => {
  assert.equal(sourceOf('Copilot'), 'copilot');
  assert.equal(sourceOf('chatgpt-codex-connector[bot]'), 'codex');
  assert.equal(sourceOf('someone-else'), 'bot');
});

test('cleanBody strips badge + Useful footer, collapses ws, tags source', () => {
  const out = cleanBody(CODEX_P1, 'codex');
  assert.ok(out.startsWith('[codex] '));
  assert.ok(!/Badge/.test(out), 'badge markdown removed');
  assert.ok(!/Useful\?/i.test(out), 'reaction footer removed');
  assert.ok(/Body text\./.test(out));
  assert.equal(cleanBody('   ', 'copilot'), '');
});

test('botCommentToRawFinding maps an inline Copilot comment', () => {
  const rf = botCommentToRawFinding({ login: 'Copilot', path: 'scripts/x.cjs', line: 42, body: 'Coerce Buffer to utf8.' });
  assert.deepEqual(rf, {
    file: 'scripts/x.cjs',
    line: 42,
    severity: 'warning',
    message: '[copilot] Coerce Buffer to utf8.',
    ruleId: 'github-copilot',
  });
});

test('botCommentToRawFinding drops non-inline and empty comments; normalizes bad line', () => {
  assert.equal(botCommentToRawFinding({ login: 'Copilot', path: null, line: null, body: 'general note' }), null);
  assert.equal(botCommentToRawFinding({ login: 'Copilot', path: 'a.ts', line: 1, body: '   ' }), null);
  const rf = botCommentToRawFinding({ login: 'Copilot', path: 'a.ts', line: 0, body: 'x' });
  assert.equal(rf.line, null, 'line 0 -> null');
});

test('botCommentsToReport emits a sorted report@v1 and skips non-inline comments', () => {
  const report = botCommentsToReport([
    { login: 'Copilot', path: 'a.ts', line: 5, body: 'a warning' },
    { login: 'chatgpt-codex-connector[bot]', path: 'b.ts', line: 9, body: CODEX_P1 },
    { login: 'Copilot', path: null, line: null, body: 'general (dropped)' },
  ]);
  assert.equal(report.schema, 'vi-history-suite/local-review@v1');
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.summary.total, 2, 'the path-less comment is dropped');
  assert.equal(report.summary.blockers, 1);
  assert.equal(report.summary.warnings, 1);
  // sorted: blocker (b.ts) before warning (a.ts)
  assert.equal(report.findings[0].severity, 'blocker');
  assert.equal(report.findings[0].file, 'b.ts');
  assert.equal(report.blocking, true);
});

test('fetchBotComments filters to the head sha and bot authors', () => {
  const apiJson = JSON.stringify([
    { commit_id: 'HEAD1', user: { login: 'Copilot' }, path: 'a.ts', line: 3, body: 'c1' },
    { commit_id: 'HEAD1', user: { login: 'chatgpt-codex-connector[bot]' }, path: 'b.ts', line: 4, body: 'c2' },
    { commit_id: 'HEAD1', user: { login: 'a-human' }, path: 'c.ts', line: 5, body: 'human' },
    { commit_id: 'OLD', user: { login: 'Copilot' }, path: 'd.ts', line: 6, body: 'stale' },
  ]);
  const deps = { gh: () => apiJson, sleep: async () => {}, log: () => {} };
  const got = fetchBotComments(deps, { repo: 'o/r', pr: 1, headSha: 'HEAD1' });
  assert.equal(got.length, 2, 'only bot authors on the head sha');
  assert.deepEqual(got.map((c) => c.path).sort(), ['a.ts', 'b.ts']);
});

test('waitForCopilotReview completes once the run reports completed', async () => {
  let call = 0;
  const deps = {
    gh: () => {
      call += 1;
      const status = call >= 3 ? 'completed' : 'in_progress';
      return JSON.stringify([{ name: 'Running Copilot Code Review', status, conclusion: status === 'completed' ? 'success' : null, headSha: 'SHA' }]);
    },
    sleep: async () => {},
    log: () => {},
  };
  const res = await waitForCopilotReview(deps, { branch: 'feature/x', headSha: 'SHA', maxPolls: 10, sleepMs: 0 });
  assert.equal(res.completed, true);
  assert.equal(res.conclusion, 'success');
  assert.equal(res.polls, 3);
});

test('harvestBotFindings wires repo/sha/comments into a report@v1 (injected gh)', async () => {
  const deps = {
    gh: (args) => {
      const s = args.join(' ');
      if (s.includes('repo view')) return 'LabVIEW-Community-CI-CD/vi-history-suite';
      if (s.includes('headRefOid')) return 'SHA9';
      if (s.includes('headRefName')) return 'feature/2489-x';
      if (s.includes('run list')) return JSON.stringify([{ name: 'Running Copilot Code Review', status: 'completed', conclusion: 'success', headSha: 'SHA9' }]);
      if (s.includes('pulls') && s.includes('comments')) {
        return JSON.stringify([
          { commit_id: 'SHA9', user: { login: 'Copilot' }, path: 'x.cjs', line: 12, body: 'add alt attribute' },
          { commit_id: 'SHA9', user: { login: 'chatgpt-codex-connector[bot]' }, path: 'x.cjs', line: 40, body: CODEX_P1 },
        ]);
      }
      return '[]';
    },
    sleep: async () => {},
    log: () => {},
  };
  const res = await harvestBotFindings({ pr: 2490 }, deps);
  assert.equal(res.repo, 'LabVIEW-Community-CI-CD/vi-history-suite');
  assert.equal(res.headSha, 'SHA9');
  assert.equal(res.waited.completed, true);
  assert.equal(res.report.summary.total, 2);
  assert.equal(res.report.summary.blockers, 1);
});

test('harvestBotFindings requires a PR number', async () => {
  const deps = { gh: () => '', sleep: async () => {}, log: () => {} };
  await assert.rejects(() => harvestBotFindings({ pr: '' }, deps), /requires a PR number/);
});
