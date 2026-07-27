// @ts-check
/**
 * Unit tests for the gitlab-bot forge adapter PURE CORE + injectable shell.
 * Node built-in runner, injected fake `glab` + no-op sleep -- no network, no glab CLI.
 *
 * Run: node --test gitlabBotPoll.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mapGitlabSeverity,
  cleanGitlabBody,
  noteIsHarvestable,
  gitlabNoteToRawFinding,
  flattenDiscussions,
  gitlabDiscussionsToReport,
  encodeProject,
  fetchMrHeadSha,
  harvestGitlabFindings,
} from './gitlabBotPoll.mjs';

const botNote = {
  author: { username: 'gitlab-duo-bot' },
  body: '![P1 Badge](x) Possible SQL injection in the query builder.',
  system: false,
  type: 'DiffNote',
  position: { position_type: 'text', new_path: 'src/a.ts', new_line: 12 },
};
const warnNote = {
  author: { username: 'a-reviewer' },
  body: 'Prefer const here.',
  system: false,
  position: { position_type: 'text', new_path: 'src/b.ts', new_line: 5 },
};
const systemNote = { author: { username: 'x' }, body: 'changed the description', system: true, position: { position_type: 'text', new_path: 'src/c.ts', new_line: 1 } };
const generalNote = { author: { username: 'x' }, body: 'a general non-inline note', system: false };

test('mapGitlabSeverity maps a P-badge, else warning', () => {
  assert.equal(mapGitlabSeverity('![P1 Badge](x) x'), 'blocker');
  assert.equal(mapGitlabSeverity('![P2 Badge](x) x'), 'warning');
  assert.equal(mapGitlabSeverity('![P3 Badge](x) x'), 'nit');
  assert.equal(mapGitlabSeverity('no badge'), 'warning');
});

test('cleanGitlabBody strips image/badge markdown, collapses ws, tags author', () => {
  const out = cleanGitlabBody(botNote.body, 'gitlab-duo-bot');
  assert.ok(out.startsWith('[gitlab:gitlab-duo-bot] '));
  assert.ok(!/!\[/.test(out), 'image/badge markdown removed');
  assert.ok(/SQL injection/.test(out));
  assert.equal(cleanGitlabBody('   ', 'x'), '');
});

test('noteIsHarvestable: inline non-system yes; system/non-inline/non-bot no', () => {
  assert.equal(noteIsHarvestable(botNote, []), true);
  assert.equal(noteIsHarvestable(systemNote, []), false, 'system note excluded');
  assert.equal(noteIsHarvestable(generalNote, []), false, 'no position excluded');
  assert.equal(noteIsHarvestable(warnNote, ['gitlab-duo-bot']), false, 'author not in bots excluded');
  assert.equal(noteIsHarvestable(botNote, ['gitlab-duo-bot']), true, 'author in bots included');
  assert.equal(noteIsHarvestable({ ...botNote, position: { position_type: 'image', new_path: 'x.png' } }, []), false, 'image position excluded');
});

test('gitlabNoteToRawFinding maps an inline bot DiffNote', () => {
  const rf = gitlabNoteToRawFinding(botNote, {});
  assert.deepEqual(rf, {
    file: 'src/a.ts',
    line: 12,
    severity: 'blocker',
    message: '[gitlab:gitlab-duo-bot] Possible SQL injection in the query builder.',
    ruleId: 'gitlab-gitlab-duo-bot',
  });
});

test('gitlabNoteToRawFinding drops system/non-inline/filtered; falls back to old_line', () => {
  assert.equal(gitlabNoteToRawFinding(systemNote, {}), null);
  assert.equal(gitlabNoteToRawFinding(generalNote, {}), null);
  assert.equal(gitlabNoteToRawFinding(warnNote, { bots: ['only-this-bot'] }), null);
  const del = { author: { username: 'b' }, system: false, body: 'x', position: { position_type: 'text', old_path: 'src/d.ts', new_line: null, old_line: 7 } };
  assert.equal(gitlabNoteToRawFinding(del, {}).line, 7, 'old_line fallback');
  assert.equal(gitlabNoteToRawFinding(del, {}).file, 'src/d.ts', 'old_path fallback');
});

test('flattenDiscussions collects notes across discussions', () => {
  const notes = flattenDiscussions([{ notes: [botNote] }, { notes: [warnNote, systemNote] }, {}, null]);
  assert.equal(notes.length, 3);
});

test('gitlabDiscussionsToReport emits report@v1 and drops non-harvestable notes', () => {
  const report = gitlabDiscussionsToReport([
    { notes: [botNote] },
    { notes: [warnNote, systemNote] },
    { notes: [generalNote] },
  ]);
  assert.equal(report.schema, 'vi-history-suite/local-review@v1');
  assert.equal(report.summary.total, 2, 'system + general notes dropped');
  assert.equal(report.summary.blockers, 1);
  assert.equal(report.summary.warnings, 1);
  assert.equal(report.findings[0].severity, 'blocker');
  assert.equal(report.findings[0].file, 'src/a.ts');
});

test('gitlabDiscussionsToReport honors the bots filter', () => {
  const report = gitlabDiscussionsToReport([{ notes: [botNote, warnNote] }], { bots: ['gitlab-duo-bot'] });
  assert.equal(report.summary.total, 1, 'only the configured bot note');
  assert.equal(report.findings[0].ruleId, 'gitlab-gitlab-duo-bot');
});

test('encodeProject: numeric verbatim, path URL-encoded', () => {
  assert.equal(encodeProject('123'), '123');
  assert.equal(encodeProject('group/sub/proj'), 'group%2Fsub%2Fproj');
});

test('fetchMrHeadSha reads diff_refs.head_sha', () => {
  const deps = { glab: () => JSON.stringify({ diff_refs: { head_sha: 'GLSHA' }, sha: 'other' }), sleep: async () => {}, log: () => {} };
  assert.equal(fetchMrHeadSha(deps, { project: 'g/p', mr: 5 }), 'GLSHA');
});

test('harvestGitlabFindings wires head sha + discussions into report@v1 (injected glab)', async () => {
  const deps = {
    glab: (args) => {
      const s = args.join(' ');
      if (s.includes('discussions')) return JSON.stringify([{ notes: [botNote] }, { notes: [warnNote, systemNote] }]);
      return JSON.stringify({ diff_refs: { head_sha: 'GLSHA9' } });
    },
    sleep: async () => {},
    log: () => {},
  };
  const res = await harvestGitlabFindings({ project: 'group/proj', mr: 42 }, deps);
  assert.equal(res.headSha, 'GLSHA9');
  assert.equal(res.waited.present, true);
  assert.equal(res.report.summary.total, 2);
  assert.equal(res.report.summary.blockers, 1);
});

test('harvestGitlabFindings requires project and mr', async () => {
  const deps = { glab: () => '', sleep: async () => {}, log: () => {} };
  await assert.rejects(() => harvestGitlabFindings({ project: '', mr: 1 }, deps), /requires a project/);
  await assert.rejects(() => harvestGitlabFindings({ project: 'g/p', mr: '' }, deps), /requires an MR/);
});
