// Self-test for branchFlowEnforce.mjs (issue #2392 Phase 2 prototype). Pure over
// parsed refs + an injected issueExists probe, so it runs anywhere. Graduates to a
// governed tests/unit case in PR2. Run: node prototype/branchFlowEnforce.selftest.mjs

import assert from 'node:assert/strict';
import {
  branchNameFromRef,
  parsePushRefs,
  featureIssueNumber,
  evaluateBranchFlow,
  formatViolations
} from './branchFlowEnforce.mjs';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`  ok  ${name}\n`);
}

const Z = '0000000000000000000000000000000000000000';
const S = '1111111111111111111111111111111111111111';
const ref = (remoteBranch, localSha = S) => ({
  localRef: `refs/heads/${remoteBranch}`,
  localSha,
  remoteRef: `refs/heads/${remoteBranch}`,
  remoteSha: Z
});

test('branchNameFromRef strips refs/heads/', () => {
  assert.equal(branchNameFromRef('refs/heads/feature/2392-x'), 'feature/2392-x');
  assert.equal(branchNameFromRef('develop'), 'develop');
});

test('parsePushRefs parses the git pre-push stdin lines', () => {
  const parsed = parsePushRefs(`refs/heads/feature/1-a ${S} refs/heads/feature/1-a ${Z}\n`);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].remoteRef, 'refs/heads/feature/1-a');
});

test('featureIssueNumber extracts the issue number or null', () => {
  assert.equal(featureIssueNumber('feature/2392-agent-env'), 2392);
  assert.equal(featureIssueNumber('chore/cleanup'), null);
});

test('ALLOWS a well-formed feature/<issue#> branch with an existing issue', () => {
  const r = evaluateBranchFlow({ refs: [ref('feature/2392-agent-env')], issueExists: () => true });
  assert.equal(r.ok, true);
  assert.equal(r.violations.length, 0);
});

test('BLOCKS a direct push to develop and to main', () => {
  const r = evaluateBranchFlow({ refs: [ref('develop'), ref('main')] });
  assert.equal(r.ok, false);
  assert.equal(r.violations.length, 2);
  assert.ok(r.violations.every((v) => v.rule === 'no-direct-protected-push'));
});

test('BLOCKS a non-flow branch name (chore/*) with a rename remedy', () => {
  const r = evaluateBranchFlow({ refs: [ref('chore/cleanup')] });
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].rule, 'branch-name');
  assert.match(r.violations[0].message, /git branch -m chore\/cleanup feature\/<issue#>-<slug>/);
});

test('BLOCKS a feature branch whose issue does not exist', () => {
  const r = evaluateBranchFlow({ refs: [ref('feature/999999-ghost')], issueExists: () => false });
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].rule, 'missing-issue');
});

test('EXEMPTS the prototype collaboration branch from the pattern', () => {
  const r = evaluateBranchFlow({ refs: [ref('prototype/ollama-mcp-linux-collab')] });
  assert.equal(r.ok, true);
});

test('IGNORES branch deletions (all-zero local sha)', () => {
  const r = evaluateBranchFlow({ refs: [ref('chore/gone', Z)] });
  assert.equal(r.ok, true);
});

test('ALLOWS release/ and hotfix/ and dependabot/ branches', () => {
  const r = evaluateBranchFlow({
    refs: [ref('release/v1.2.0'), ref('hotfix/v1.2.1'), ref('dependabot/npm_and_yarn/qs-6.15.3')]
  });
  assert.equal(r.ok, true);
});

test('formatViolations renders a remedy block with the agent identity', () => {
  const r = evaluateBranchFlow({ refs: [ref('develop')] });
  const text = formatViolations(r, { teamName: 'WIN-vitlt', plane: 'native' });
  assert.match(text, /push BLOCKED \[WIN-vitlt\/native\]/);
  assert.match(text, /no-direct-protected-push/);
});

process.stdout.write(`\nAll ${passed} branchFlowEnforce self-tests passed.\n`);
