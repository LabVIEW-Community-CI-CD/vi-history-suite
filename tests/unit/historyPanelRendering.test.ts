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

  describe('repository facts rendering', () => {
    it('renders repository name in meta section', () => {
      const model = createTestViewModel({
        repositoryName: 'my-labview-project'
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-meta-repository"');
      expect(html).toContain('<strong>Repository:</strong> my-labview-project');
    });

    it('renders repository root path in meta section', () => {
      const model = createTestViewModel({
        repositoryRoot: '/workspace/repos/test-project'
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-meta-root"');
      expect(html).toContain('<strong>Root:</strong> /workspace/repos/test-project');
    });

    it('renders origin URL when repository URL is available', () => {
      const model = createTestViewModel({
        repositoryUrl: 'https://github.com/org/repo.git'
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-meta-origin"');
      expect(html).toContain('<strong>Origin:</strong> https://github.com/org/repo.git');
    });

    it('renders unavailable state when repository URL is not present', () => {
      const model = createTestViewModel({
        repositoryUrl: undefined
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-meta-origin"');
      expect(html).toContain('<strong>Origin:</strong> Unavailable');
    });

    it('renders relative path in meta section', () => {
      const model = createTestViewModel({
        relativePath: 'Source/Controls/CustomButton.ctl'
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-meta-path"');
      expect(html).toContain('<strong>Path:</strong> Source/Controls/CustomButton.ctl');
    });
  });

  describe('VI signature rendering', () => {
    it('renders LVIN signature in status section', () => {
      const model = createTestViewModel({
        signature: 'LVIN'
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-status-signature"');
      expect(html).toContain('>LVIN</span>');
    });

    it('renders LVCC signature in status section', () => {
      const model = createTestViewModel({
        signature: 'LVCC'
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-status-signature"');
      expect(html).toContain('>LVCC</span>');
    });

    it('renders unknown signature state', () => {
      const model = createTestViewModel({
        signature: 'unknown'
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-status-signature"');
      expect(html).toContain('>unknown</span>');
    });
  });

  describe('commit facts rendering', () => {
    it('renders retained commit count in status section', () => {
      const model = createTestViewModel({
        commits: [
          createTestCommit({ hash: 'commit1', previousHash: 'commit2' }),
          createTestCommit({ hash: 'commit2', previousHash: 'commit3' }),
          createTestCommit({ hash: 'commit3' })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-status-commit-count"');
      expect(html).toMatch(/data-testid="history-status-commit-count"[^>]*>3<\/span>/);
    });

    it('renders newest commit in review facts section', () => {
      const newestCommit = createTestCommit({
        hash: 'newest1234567890abcdef1234567890abcdef12',
        authorDate: '2025-03-15',
        authorName: 'Newest Author',
        previousHash: 'older123'
      });
      const model = createTestViewModel({
        commits: [newestCommit, createTestCommit({ hash: 'older123' })]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-newest-commit"');
      expect(html).toContain('<strong>Newest:</strong>');
      expect(html).toContain('newest12');
      expect(html).toContain('2025-03-15');
      expect(html).toContain('Newest Author');
    });

    it('renders oldest commit in review facts section', () => {
      const oldestCommit = createTestCommit({
        hash: 'oldest1234567890abcdef1234567890abcdef12',
        authorDate: '2024-06-01',
        authorName: 'Original Author'
      });
      const model = createTestViewModel({
        commits: [
          createTestCommit({ hash: 'newer123', previousHash: 'oldest1234567890abcdef1234567890abcdef12' }),
          oldestCommit
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-oldest-commit"');
      expect(html).toContain('<strong>Oldest:</strong>');
      expect(html).toContain('oldest12');
      expect(html).toContain('2024-06-01');
      expect(html).toContain('Original Author');
    });

    it('renders retained revisions count in review facts section', () => {
      const model = createTestViewModel({
        commits: [
          createTestCommit({ hash: 'a1', previousHash: 'a2' }),
          createTestCommit({ hash: 'a2', previousHash: 'a3' }),
          createTestCommit({ hash: 'a3', previousHash: 'a4' }),
          createTestCommit({ hash: 'a4', previousHash: 'a5' }),
          createTestCommit({ hash: 'a5' })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-retained-span"');
      expect(html).toContain('<strong>Retained revisions:</strong> 5');
    });
  });

  describe('chronology order rendering', () => {
    it('renders chronology order indicator in review facts section', () => {
      const model = createTestViewModel();
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-chronology-order"');
      expect(html).toContain('<strong>Order:</strong> Newest commit first');
    });
  });

  describe('binary review limitation text', () => {
    it('renders binary limitations section with factual explanation', () => {
      const model = createTestViewModel();
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-binary-limitations"');
      expect(html).toContain('Binary review limits:');
      expect(html).toContain('Git-backed LabVIEW VI revisions are binary artifacts');
    });

    it('does not claim semantic VI differences from Git-only history', () => {
      const model = createTestViewModel();
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('This surface retains chronology and commit facts');
      expect(html).toContain('pairwise compare actions use retained LabVIEW comparison-report evidence');
      expect(html).toContain('installed tooling instead of plain text diff');
    });

    it('renders confidence and scope section explaining external tooling needs', () => {
      const model = createTestViewModel();
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-confidence-scope"');
      expect(html).toContain('data-testid="history-scope-excluded"');
      expect(html).toContain('Needs external comparison tooling:');
      expect(html).toContain('Binary semantic differences');
      expect(html).toContain('visual or cosmetic change detection');
      expect(html).toContain('LabVIEW comparison-report output');
    });
  });

  describe('HTML escaping for user and path-derived values', () => {
    it('escapes HTML entities in repository name', () => {
      const model = createTestViewModel({
        repositoryName: '<script>alert("xss")</script>'
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain('&lt;script&gt;alert');
    });

    it('escapes HTML entities in repository root path', () => {
      const model = createTestViewModel({
        repositoryRoot: '/path/<malicious>/repo'
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).not.toContain('/path/<malicious>/repo');
      expect(html).toContain('/path/&lt;malicious&gt;/repo');
    });

    it('escapes HTML entities in relative path', () => {
      const model = createTestViewModel({
        relativePath: 'Examples/<script>Test</script>.vi'
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).not.toContain('Examples/<script>Test</script>.vi');
      expect(html).toContain('Examples/&lt;script&gt;Test&lt;/script&gt;.vi');
    });

    it('escapes HTML entities in repository URL', () => {
      const model = createTestViewModel({
        repositoryUrl: 'https://example.com/<script>xss</script>'
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).not.toContain('https://example.com/<script>xss</script>');
      expect(html).toContain('https://example.com/&lt;script&gt;xss&lt;/script&gt;');
    });

    it('escapes HTML entities in commit author name', () => {
      const model = createTestViewModel({
        commits: [
          createTestCommit({
            hash: 'abc123',
            authorName: '<script>alert("author")</script>'
          })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).not.toContain('<script>alert("author")</script>');
      expect(html).toContain('&lt;script&gt;alert');
    });

    it('escapes HTML entities in commit subject', () => {
      const model = createTestViewModel({
        commits: [
          createTestCommit({
            hash: 'abc123',
            subject: 'Fix <bug> in "module"'
          })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).not.toContain('Fix <bug>');
      expect(html).toContain('Fix &lt;bug&gt;');
      expect(html).toContain('&quot;module&quot;');
    });

    it('escapes HTML entities in commit hash data attributes', () => {
      const model = createTestViewModel({
        commits: [
          createTestCommit({
            hash: 'abc<>123"def'
          })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('abc&lt;&gt;123&quot;def');
    });

    it('serializes compare preflight data safely for inline script embedding', () => {
      const model = createTestViewModel();
      const html = renderHistoryPanelHtml(model, undefined, {
        status: 'ready',
        provider: 'host',
        labviewVersion: '2025',
        labviewBitness: 'x64',
        nextAction: '</script><script>alert("xss")</script>',
        cliHint: 'Use settings CLI'
      });

      expect(html).toContain('const comparePreflight = ');
      expect(html).toContain('\\u003C/script>\\u003Cscript>alert(\\"xss\\")\\u003C/script>');
      expect(html.match(/<\/script>/g) ?? []).toHaveLength(1);
    });

    it('escapes single quotes in values', () => {
      const model = createTestViewModel({
        repositoryName: "repo'name"
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('repo&#39;name');
    });

    it('escapes ampersands in values', () => {
      const model = createTestViewModel({
        repositoryName: 'repo&project'
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('repo&amp;project');
    });
  });

  describe('compare preflight Pick Image Version CTA (VHS-REQ-650)', () => {
    const mismatchPreflight = {
      status: 'blocked' as const,
      provider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x64',
      nextAction: 'Next action: switch Docker or pick a matching image version.',
      cliHint: 'Use settings CLI',
      blockedReason: 'container-image-platform-mismatch'
    };

    it('renders the CTA when preflight is blocked by a container image platform mismatch', () => {
      const html = renderHistoryPanelHtml(createTestViewModel(), undefined, mismatchPreflight);
      expect(html).toContain('data-testid="history-action-pick-image-version"');
      expect(html).toContain('data-command="pickContainerImageVersion"');
      expect(html).toContain('>Pick Image Version</button>');
    });

    it('does not render the CTA for a different blocked reason', () => {
      const html = renderHistoryPanelHtml(createTestViewModel(), undefined, {
        ...mismatchPreflight,
        blockedReason: 'labview-version-required'
      });
      expect(html).not.toContain('data-testid="history-action-pick-image-version"');
    });

    it('does not render the CTA when the blocked state carries no blockedReason', () => {
      const { blockedReason: _omit, ...withoutReason } = mismatchPreflight;
      const html = renderHistoryPanelHtml(createTestViewModel(), undefined, withoutReason);
      expect(html).not.toContain('data-testid="history-action-pick-image-version"');
    });

    it('does not render the CTA when the preflight is ready', () => {
      const html = renderHistoryPanelHtml(createTestViewModel(), undefined, {
        status: 'ready',
        provider: 'docker',
        labviewVersion: '2026',
        labviewBitness: 'x64',
        nextAction: 'Next action: choose Compare.',
        cliHint: 'Use settings CLI',
        blockedReason: 'container-image-platform-mismatch'
      });
      expect(html).not.toContain('data-testid="history-action-pick-image-version"');
    });
  });

  describe('eligibility rendering', () => {
    it('renders eligible status when model is eligible', () => {
      const model = createTestViewModel({
        eligible: true
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-status-eligibility"');
      expect(html).toContain('>Eligible</span>');
    });

    it('renders not eligible status when model is not eligible', () => {
      const model = createTestViewModel({
        eligible: false
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-status-eligibility"');
      expect(html).toContain('>Not eligible</span>');
    });
  });

  describe('history window rendering', () => {
    it('renders history window summary in status section', () => {
      const model = createTestViewModel({
        historyWindow: {
          mode: 'auto',
          configuredMaxEntries: 100,
          effectiveEntryCeiling: 1000,
          loadedCommitCount: 50,
          totalCommitCount: 50,
          truncated: false,
          decision: 'auto-full-history'
        }
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-status-history-window"');
      expect(html).toContain('full history loaded automatically');
    });

    it('renders truncated window summary when history is capped', () => {
      const model = createTestViewModel({
        historyWindow: {
          mode: 'auto',
          configuredMaxEntries: 100,
          effectiveEntryCeiling: 100,
          loadedCommitCount: 100,
          totalCommitCount: 500,
          truncated: true,
          decision: 'auto-truncated-to-ceiling'
        }
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-status-history-window"');
      expect(html).toContain('auto window truncated');
      expect(html).toContain('100/500 commits');
    });

    it('renders review window in review facts section', () => {
      const model = createTestViewModel();
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-review-window"');
      expect(html).toContain('<strong>Window:</strong>');
    });
  });

  describe('commit table rendering', () => {
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
        commits: [
          createTestCommit({ hash: 'abcdef1234567890abcdef1234567890abcdef12' })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-commit-hash"');
      expect(html).toContain('<code>abcdef12</code>');
    });

    it('renders commit date in each row', () => {
      const model = createTestViewModel({
        commits: [
          createTestCommit({ hash: 'abc123', authorDate: '2025-05-20' })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-commit-date"');
      expect(html).toContain('2025-05-20');
    });

    it('renders commit author in each row', () => {
      const model = createTestViewModel({
        commits: [
          createTestCommit({ hash: 'abc123', authorName: 'John Developer' })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-commit-author"');
      expect(html).toContain('John Developer');
    });

    it('renders commit subject in each row', () => {
      const model = createTestViewModel({
        commits: [
          createTestCommit({ hash: 'abc123', subject: 'Add feature X' })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-commit-subject"');
      expect(html).toContain('Add feature X');
    });

    it('renders the commit body in a dedicated cell for each row', () => {
      const model = createTestViewModel({
        commits: [
          createTestCommit({ hash: 'abc123', body: 'Investigated the wiring change' })
        ]
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
          createTestCommit({
            hash: 'abc123',
            body: '  - indented bullet\n    nested detail'
          })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('  - indented bullet<br />    nested detail');
    });

    it('renders a factual fallback for commits with an empty body', () => {
      const model = createTestViewModel({
        commits: [
          createTestCommit({ hash: 'oldest123', body: '' })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-commit-body-empty"');
      expect(html).toContain('No commit body');
    });

    it('renders commit actions including open and copy buttons', () => {
      const model = createTestViewModel({
        commits: [
          createTestCommit({ hash: 'actioncommit1234567890123456789012345678' })
        ]
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-commit-actions"');
      expect(html).toContain('data-testid="history-action-open"');
      expect(html).toContain('data-testid="history-action-copy"');
      expect(html).toContain('data-command="openCommit"');
      expect(html).toContain('data-command="copyHash"');
    });
  });

  describe('edge cases', () => {
    it('handles empty commits array gracefully', () => {
      const model = createTestViewModel({
        commits: []
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-status-commit-count"');
      expect(html).toContain('>0</span>');
      expect(html).toContain('data-testid="history-newest-commit"');
      expect(html).toContain('No retained commits');
      expect(html).toContain('data-testid="history-oldest-commit"');
    });

    it('handles single commit gracefully', () => {
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

      expect(html).toContain('>1</span>');
      expect(html).toContain('onlycomm');
      expect(html).toContain('Solo Author');
    });

    it('handles very long repository path', () => {
      const longPath = '/very/long/path/' + 'nested/'.repeat(20) + 'repo';
      const model = createTestViewModel({
        repositoryRoot: longPath
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain(longPath);
    });

    it('handles standard VI signature values', () => {
      const model = createTestViewModel({
        signature: 'LVIN'
      });
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('LVIN');
    });
  });

  describe('copy review packet action button (VHS-REQ-039)', () => {
    it('renders copy review packet button with data-command="copyReviewPacket"', () => {
      const model = createTestViewModel();
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-command="copyReviewPacket"');
    });

    it('renders copy review packet button with data-testid="history-action-copy-review-packet"', () => {
      const model = createTestViewModel();
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-action-copy-review-packet"');
    });

    it('renders copy review packet button with expected label text', () => {
      const model = createTestViewModel();
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('>Copy review packet</button>');
    });
  });
});
