import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bf = require('../../scripts/branchFlowEnforce.js');

// VHS-REQ-719 (VHS #2392 Phase 2): pre-push branch-flow enforcement, at parity with hosted Branch
// Governance. Pure over parsed refs + an injected issueExists probe, so host-free in CI.
// Covers VHS-REQ-719.1 (protected-push / branch-name / missing-issue rules + tag and exempt
// patterns), VHS-REQ-719.2 (stable rule ids + a remedy naming the derived agent identity), and
// VHS-REQ-719.3 (missing-issue self-skips with an audit note when gh is unavailable).
const Z = '0000000000000000000000000000000000000000';
const S = '1111111111111111111111111111111111111111';
const ref = (branch: string, localSha = S) => ({
  localRef: `refs/heads/${branch}`,
  localSha,
  remoteRef: `refs/heads/${branch}`,
  remoteSha: Z
});

describe('branchFlowEnforce (issue #2392)', () => {
  it('parses git pre-push stdin and strips refs/heads/', () => {
    const parsed = bf.parsePushRefs(`refs/heads/feature/1-a ${S} refs/heads/feature/1-a ${Z}\n`);
    expect(parsed).toHaveLength(1);
    expect(bf.branchNameFromRef(parsed[0].remoteRef)).toBe('feature/1-a');
    expect(bf.featureIssueNumber('feature/2392-x')).toBe(2392);
    expect(bf.featureIssueNumber('fix/y')).toBeNull();
  });

  it('ALLOWS a well-formed feature/<issue#> branch whose issue exists', () => {
    const r = bf.evaluateBranchFlow({ refs: [ref('feature/2392-agent-env')], issueExists: () => true });
    expect(r.ok).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it('BLOCKS a direct push to develop and main (rule no-direct-protected-push)', () => {
    const r = bf.evaluateBranchFlow({ refs: [ref('develop'), ref('main')] });
    expect(r.ok).toBe(false);
    expect(r.violations.map((v: { rule: string }) => v.rule)).toEqual([
      'no-direct-protected-push',
      'no-direct-protected-push'
    ]);
  });

  it('BLOCKS a non-flow branch name with a rename remedy (rule branch-name)', () => {
    const r = bf.evaluateBranchFlow({ refs: [ref('chore/cleanup')] });
    expect(r.ok).toBe(false);
    expect(r.violations[0].rule).toBe('branch-name');
    expect(r.violations[0].message).toMatch(/git branch -m chore\/cleanup feature\/<issue#>-<slug>/);
  });

  it('BLOCKS a feature branch whose issue does not exist (rule missing-issue)', () => {
    const r = bf.evaluateBranchFlow({ refs: [ref('feature/999999-ghost')], issueExists: () => false });
    expect(r.ok).toBe(false);
    expect(r.violations[0].rule).toBe('missing-issue');
  });

  it('IGNORES tag pushes (refs/tags/*) and branch deletions', () => {
    const tagRef = { localRef: 'refs/tags/v1.2.3', localSha: S, remoteRef: 'refs/tags/v1.2.3', remoteSha: Z };
    expect(bf.evaluateBranchFlow({ refs: [tagRef] }).ok).toBe(true);
    expect(bf.evaluateBranchFlow({ refs: [ref('chore/gone', Z)] }).ok).toBe(true);
  });

  it('ALLOWS fix/*, release/v*, hotfix/v*, dependabot/* (Branch Governance parity)', () => {
    const r = bf.evaluateBranchFlow({
      refs: [ref('fix/hotpatch'), ref('release/v1.2.0'), ref('hotfix/v1.2.1'), ref('dependabot/npm/qs-6.15.3')]
    });
    expect(r.ok).toBe(true);
  });

  it('EXEMPTS the prototype branch and wip//spike//prototype/ patterns', () => {
    const r = bf.evaluateBranchFlow({
      refs: [ref('prototype/ollama-mcp-linux-collab'), ref('wip/scratch'), ref('spike/idea'), ref('prototype/x')]
    });
    expect(r.ok).toBe(true);
  });

  it('Rule C SKIP-when-unverifiable (no gh) records an audit note, does not block', () => {
    const r = bf.evaluateBranchFlow({ refs: [ref('feature/999999-ghost')], ruleCVerifiable: false });
    expect(r.ok).toBe(true);
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toMatch(/Rule C skipped: gh unavailable.*#999999/);
  });

  it('formatViolations renders a remedy block with the agent identity', () => {
    const r = bf.evaluateBranchFlow({ refs: [ref('develop')] });
    const text = bf.formatViolations(r, { teamName: 'WIN-vitlt', plane: 'native' });
    expect(text).toMatch(/push BLOCKED \[WIN-vitlt\/native\]/);
    expect(text).toMatch(/no-direct-protected-push/);
  });
});
