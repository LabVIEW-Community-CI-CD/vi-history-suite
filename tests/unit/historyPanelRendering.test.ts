import { describe, expect, it } from 'vitest';

import { renderHistoryPanelHtml } from '../../src/ui/historyPanel';
import { ViHistoryViewModel, ViHistoryCommit } from '../../src/services/viHistoryModel';

function createTestCommit(overrides: Partial<ViHistoryCommit> = {}): ViHistoryCommit {
  return {
    hash: 'abc1234567890def1234567890abcdef12345678',
    authorName: 'Test Author',
    authorDate: '2025-01-15',
    subject: 'Test commit subject',
    body: 'Test commit body',
    ...overrides
  };
}

function createTestViewModel(overrides: Partial<ViHistoryViewModel> = {}): ViHistoryViewModel {
  const defaultCommits = [
    createTestCommit({
      hash: 'newest1234567890abcdef1234567890abcdef12',
      previousHash: 'older12345678901234567890123456789012345',
      authorDate: '2025-01-20',
      subject: 'Newest commit'
    }),
    createTestCommit({
      hash: 'older12345678901234567890123456789012345',
      authorDate: '2025-01-15',
      subject: 'Oldest retained revision'
    })
  ];

  const commits = overrides.commits ?? defaultCommits;
  const commitCount = commits.length;

  return {
    repositoryName: 'vi-history-suite',
    repositoryRoot: '/home/user/projects/vi-history-suite',
    repositoryUrl: 'https://github.com/LabVIEW-Community-CI-CD/vi-history-suite',
    relativePath: 'Examples/Sample.vi',
    signature: 'LVIN',
    eligible: true,
    commits,
    historyWindow: overrides.historyWindow ?? {
      mode: 'auto',
      configuredMaxEntries: 100,
      effectiveEntryCeiling: 1000,
      loadedCommitCount: commitCount,
      totalCommitCount: commitCount,
      truncated: false,
      decision: 'auto-full-history'
    },
    surfaceCapabilities: {
      comparisonGenerationAvailable: true,
      documentationAvailable: true
    },
    ...overrides
  };
}

describe('historyPanelRendering', () => {
  describe('panel title (orientation header)', () => {
    it('renders a slim title with the relative path and commit count', () => {
      const model = createTestViewModel({
        relativePath: 'Examples/Sample.vi',
        commits: [
          createTestCommit({ hash: 'a1', previousHash: 'a2' }),
          createTestCommit({ hash: 'a2' })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-title"');
      expect(html).toContain('Examples/Sample.vi');
      expect(html).toContain('(2 commits)');
    });

    it('uses a singular commit label for a single retained commit', () => {
      const model = createTestViewModel({ commits: [createTestCommit({ hash: 'only1' })] });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('(1 commit)');
    });

    it('escapes the relative path in the title', () => {
      const model = createTestViewModel({ relativePath: 'Examples/<script>Test</script>.vi' });
      const html = renderHistoryPanelHtml(model);

      expect(html).not.toContain('<script>Test</script>');
      expect(html).toContain('Examples/&lt;script&gt;Test&lt;/script&gt;.vi');
    });
  });

  describe('working-tree comparison (VHS-REQ-641)', () => {
    it('renders a selectable working-tree row when uncommitted changes are present', () => {
      const model = createTestViewModel({
        workingTree: { hasUncommittedChanges: true, headHash: 'newest1234567890abcdef1234567890abcdef12' }
      });
      const html = renderHistoryPanelHtml(model);
      expect(html).toContain('data-testid="history-working-tree-row"');
      // The row carries a selection checkbox bound to the working-tree sentinel
      // and sorts as the newest entry (commit-index -1).
      expect(html).toContain('data-hash="WORKTREE"');
      expect(html).toContain('data-commit-index="-1"');
      // The standalone vs-HEAD button is replaced by the selectable row.
      expect(html).not.toContain('data-command="compareWorkingTree"');
    });

    it('omits the working-tree row when the file is clean', () => {
      const html = renderHistoryPanelHtml(createTestViewModel());
      expect(html).not.toContain('data-testid="history-working-tree-row"');
      expect(html).not.toContain('data-hash="WORKTREE"');
    });

    it('omits the working-tree row when comparison generation is unavailable', () => {
      const model = createTestViewModel({
        workingTree: { hasUncommittedChanges: true, headHash: 'newest1234567890abcdef1234567890abcdef12' },
        surfaceCapabilities: { comparisonGenerationAvailable: false }
      });
      const html = renderHistoryPanelHtml(model);
      expect(html).not.toContain('data-testid="history-working-tree-row"');
    });
  });

  describe('commit table rendering (VHS-REQ-017, VHS-REQ-639)', () => {
    it('renders history table with all commit rows', () => {
      const model = createTestViewModel({
        commits: [
          createTestCommit({ hash: 'commit1hash1234', previousHash: 'commit2hash5678' }),
          createTestCommit({ hash: 'commit2hash5678', previousHash: 'commit3hash9012' }),
          createTestCommit({ hash: 'commit3hash9012' })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-table"');
      const rowMatches = html.match(/data-testid="history-row"/g);
      expect(rowMatches).toHaveLength(3);
    });

    it('renders commit hash in each row', () => {
      const model = createTestViewModel({
        commits: [createTestCommit({ hash: 'abcdef1234567890abcdef1234567890abcdef12' })]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-commit-hash"');
      expect(html).toContain('<code>abcdef12</code>');
    });

    it('renders commit date in each row', () => {
      const model = createTestViewModel({
        commits: [createTestCommit({ hash: 'abc123', authorDate: '2025-05-20' })]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-commit-date"');
      expect(html).toContain('2025-05-20');
    });

    it('renders commit author in each row', () => {
      const model = createTestViewModel({
        commits: [createTestCommit({ hash: 'abc123', authorName: 'John Developer' })]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-commit-author"');
      expect(html).toContain('John Developer');
    });

    it('renders commit subject in each row', () => {
      const model = createTestViewModel({
        commits: [createTestCommit({ hash: 'abc123', subject: 'Add feature X' })]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-commit-subject"');
      expect(html).toContain('Add feature X');
    });

    it('renders the commit body in a dedicated cell for each row', () => {
      const model = createTestViewModel({
        commits: [createTestCommit({ hash: 'abc123', body: 'Investigated the wiring change' })]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-commit-body"');
      expect(html).toContain('Investigated the wiring change');
      expect(html).not.toContain('data-testid="history-compare-pair"');
      expect(html).not.toContain('data-testid="history-compare-base"');
    });

    it('preserves multi-line commit bodies as line breaks and escapes HTML', () => {
      const model = createTestViewModel({
        commits: [
          createTestCommit({
            hash: 'abc123',
            body: 'First line\nSecond <script>alert(1)</script> line'
          })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('First line<br />Second');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).not.toContain('<script>alert(1)</script>');
    });

    it('preserves leading indentation in the commit body instead of trimming it', () => {
      const model = createTestViewModel({
        commits: [
          createTestCommit({ hash: 'abc123', body: '  - indented bullet\n    nested detail' })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('  - indented bullet<br />    nested detail');
    });

    it('renders a factual fallback for commits with an empty body', () => {
      const model = createTestViewModel({
        commits: [createTestCommit({ hash: 'oldest123', body: '' })]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-commit-body-empty"');
      expect(html).toContain('No commit body');
    });

    it('does not render per-row commit action buttons (VHS-REQ-017)', () => {
      const model = createTestViewModel({
        commits: [createTestCommit({ hash: 'actioncommit1234567890123456789012345678' })]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).not.toContain('data-testid="history-commit-actions"');
      expect(html).not.toContain('data-testid="history-action-open"');
      expect(html).not.toContain('data-testid="history-action-copy"');
      expect(html).not.toContain('data-command="openCommit"');
      expect(html).not.toContain('data-command="copyHash"');
      expect(html).not.toContain('<th>Actions</th>');
    });
  });

  describe('explicit compare control (VHS-REQ-133)', () => {
    it('renders a Compare button disabled by default', () => {
      const html = renderHistoryPanelHtml(createTestViewModel());

      expect(html).toContain('data-testid="history-action-compare-selected"');
      expect(html).toContain('data-command="generateComparisonReportFromSelection"');
      expect(html).toMatch(/id="history-action-compare-selected"[^>]*disabled/);
    });

    it('pins the Compare button in a sticky footer bar (#559)', () => {
      const html = renderHistoryPanelHtml(createTestViewModel());

      // The Compare button lives in a dedicated bar...
      expect(html).toContain('data-testid="history-compare-bar"');
      // ...that is a sticky footer so it stays reachable on large histories.
      expect(html).toMatch(/\.compare-bar\s*\{[^}]*position:\s*sticky/);
      expect(html).toMatch(/\.compare-bar\s*\{[^}]*bottom:\s*0/);
      // The bar still renders after the commit table (natural position on short
      // histories), keeping the explicit selection-then-Compare flow.
      expect(html.indexOf('data-testid="history-table"')).toBeLessThan(
        html.indexOf('data-testid="history-compare-bar"')
      );
    });

    it('renders a selection checkbox for each commit row', () => {
      const model = createTestViewModel({
        commits: [
          createTestCommit({ hash: 'a1', previousHash: 'a2' }),
          createTestCommit({ hash: 'a2' })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      const selects = html.match(/<input data-testid="history-commit-select"/g);
      expect(selects).toHaveLength(2);
    });

    it('disables the selection checkboxes when comparison generation is unavailable', () => {
      const model = createTestViewModel({
        surfaceCapabilities: { comparisonGenerationAvailable: false }
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toMatch(/data-testid="history-commit-select"[^>]*disabled/);
    });
  });

  describe('HTML escaping for user and path-derived values (VHS-REQ-017)', () => {
    it('escapes HTML entities in commit author name', () => {
      const model = createTestViewModel({
        commits: [
          createTestCommit({ hash: 'abc123', authorName: '<script>alert("author")</script>' })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).not.toContain('<script>alert("author")</script>');
      expect(html).toContain('&lt;script&gt;alert');
    });

    it('escapes HTML entities in commit subject', () => {
      const model = createTestViewModel({
        commits: [createTestCommit({ hash: 'abc123', subject: 'Fix <bug> in "module"' })]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).not.toContain('Fix <bug>');
      expect(html).toContain('Fix &lt;bug&gt;');
      expect(html).toContain('&quot;module&quot;');
    });

    it('escapes HTML entities in commit hash data attributes', () => {
      const model = createTestViewModel({
        commits: [createTestCommit({ hash: 'abc<>123"def' })]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('abc&lt;&gt;123&quot;def');
    });

    it('escapes single quotes in commit values', () => {
      const model = createTestViewModel({
        commits: [createTestCommit({ hash: 'abc123', authorName: "O'Brien" })]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('O&#39;Brien');
    });

    it('escapes ampersands in commit values', () => {
      const model = createTestViewModel({
        commits: [createTestCommit({ hash: 'abc123', subject: 'wire A&B' })]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('wire A&amp;B');
    });
  });

  describe('minimized panel surface', () => {
    it('does not render the removed factual/guidance/runtime/preflight sections', () => {
      const html = renderHistoryPanelHtml(createTestViewModel());

      expect(html).not.toContain('data-testid="history-review-packet"');
      expect(html).not.toContain('data-testid="history-meta"');
      expect(html).not.toContain('data-testid="history-binary-limitations"');
      expect(html).not.toContain('data-testid="history-review-guidance"');
      expect(html).not.toContain('data-testid="history-confidence-scope"');
      expect(html).not.toContain('data-testid="history-compare-runtime-status"');
      expect(html).not.toContain('data-testid="history-compare-preflight"');
      expect(html).not.toContain('data-testid="history-human-review-submit"');
    });

    it('does not render the in-panel copy/docs/benchmark/pick-image buttons', () => {
      const html = renderHistoryPanelHtml(createTestViewModel());

      expect(html).not.toContain('data-command="copyReviewPacket"');
      expect(html).not.toContain('data-command="openDocumentation"');
      expect(html).not.toContain('data-command="openBenchmarkStatus"');
      expect(html).not.toContain('data-command="submitHumanReview"');
      expect(html).not.toContain('data-testid="history-action-pick-image-version"');
    });

    it('does not render the eligibility/signature/window status header', () => {
      const html = renderHistoryPanelHtml(
        createTestViewModel({ signature: 'unknown', eligible: false })
      );

      expect(html).not.toContain('data-testid="history-status-eligibility"');
      expect(html).not.toContain('data-testid="history-status-signature"');
      expect(html).not.toContain('data-testid="history-status-history-window"');
    });
  });

  describe('edge cases', () => {
    it('handles an empty commits array gracefully', () => {
      const model = createTestViewModel({ commits: [] });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-table"');
      expect(html).toContain('(0 commits)');
      expect(html).not.toContain('data-testid="history-row"');
    });

    it('handles a single commit gracefully', () => {
      const model = createTestViewModel({
        commits: [
          createTestCommit({
            hash: 'onlycommit12345678901234567890123456789',
            authorDate: '2025-01-01',
            authorName: 'Solo Author'
          })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('onlycomm');
      expect(html).toContain('Solo Author');
      expect(html).toContain('(1 commit)');
    });
  });
});
