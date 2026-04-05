import { describe, expect, it } from 'vitest';

import {
  renderHistoryPanelHtml,
  renderHistoryReviewPacketText
} from '../../src/ui/historyPanel';

describe('renderHistoryPanelHtml', () => {
  it('renders metadata, commit facts, and review actions', () => {
    const html = renderHistoryPanelHtml({
      repositoryName: 'labview-icon-editor',
      repositoryRoot: '/tmp/labview-icon-editor',
      relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
      signature: 'LVIN',
      eligible: true,
      surfaceCapabilities: {
        benchmarkStatusAvailable: true
      },
      historyWindow: {
        mode: 'auto',
        configuredMaxEntries: 100,
        effectiveEntryCeiling: 1000,
        loadedCommitCount: 2,
        totalCommitCount: 2,
        truncated: false,
        decision: 'auto-full-history'
      },
      commits: [
        {
          hash: 'abcdef1234567890',
          authorDate: '2026-04-02T00:00:00Z',
          authorName: 'A User',
          subject: 'Improve deployment behavior',
          previousHash: '1111111122222222',
          retainedComparisonEvidenceAvailable: false
        },
        {
          hash: '1111111122222222',
          authorDate: '2026-04-01T00:00:00Z',
          authorName: 'B User',
          subject: 'Initial deployment behavior'
        }
      ]
    });

    expect(html).toContain('VIP_Pre-Install Custom Action.vi');
    expect(html).toContain('labview-icon-editor');
    expect(html).toContain('Improve deployment behavior');
    expect(html).toContain('Open@commit');
    expect(html).toContain('Open compare');
    expect(html).toContain('Generate compare');
    expect(html).toContain('Open dashboard');
    expect(html).toContain('Open docs');
    expect(html).toContain('Open benchmark status');
    expect(html).toContain('Create decision record');
    expect(html).toContain('Submit host review');
    expect(html).toContain('Select outcome');
    expect(html).toContain('Select confidence');
    expect(html).toContain('Copy hash');
    expect(html).toContain('Copy review packet');
    expect(html).toContain('data-testid="history-status"');
    expect(html).toContain('data-testid="history-compare-runtime-status"');
    expect(html).toContain('data-testid="history-compare-runtime-summary"');
    expect(html).toContain('data-testid="history-compare-runtime-next-action"');
    expect(html).toContain('data-testid="history-review-packet"');
    expect(html).toContain('data-testid="history-status-history-window"');
    expect(html).toContain('data-testid="history-review-window"');
    expect(html).toContain('data-testid="history-chronology-order"');
    expect(html).toContain('data-testid="history-newest-commit"');
    expect(html).toContain('data-testid="history-oldest-commit"');
    expect(html).toContain('data-testid="history-meta-repository"');
    expect(html).toContain('data-testid="history-meta-path"');
    expect(html).toContain('data-testid="history-binary-limitations"');
    expect(html).toContain('data-testid="history-review-guidance"');
    expect(html).toContain('data-testid="history-guidance-step"');
    expect(html).toContain('data-testid="history-confidence-scope"');
    expect(html).toContain('data-testid="history-confidence-basis"');
    expect(html).toContain('data-testid="history-confidence-rating"');
    expect(html).toContain('data-testid="history-scope-included"');
    expect(html).toContain('data-testid="history-scope-excluded"');
    expect(html).toContain('data-testid="history-surface-capabilities"');
    expect(html).toContain('data-testid="history-capability-comparison"');
    expect(html).toContain('data-testid="history-capability-open-compare"');
    expect(html).toContain('data-testid="history-capability-dashboard"');
    expect(html).toContain('data-testid="history-capability-decision-record"');
    expect(html).toContain('data-testid="history-capability-documentation"');
    expect(html).toContain('data-testid="history-capability-benchmark-status"');
    expect(html).toContain('data-testid="history-capability-human-review"');
    expect(html).toContain('data-testid="history-row"');
    expect(html).toContain('data-testid="history-compare-base"');
    expect(html).toContain('data-testid="history-compare-pair"');
    expect(html).toContain('data-testid="history-action-open"');
    expect(html).toContain('data-testid="history-action-diff"');
    expect(html).toContain('data-testid="history-action-report"');
    expect(html).toContain('data-testid="history-action-copy"');
    expect(html).toContain('data-testid="history-action-dashboard"');
    expect(html).toContain('data-testid="history-action-documentation"');
    expect(html).toContain('data-testid="history-action-benchmark-status"');
    expect(html).toContain('data-testid="history-action-decision-record"');
    expect(html).toContain('data-testid="history-action-submit-human-review"');
    expect(html).toContain('data-testid="history-human-review-submit"');
    expect(html).toContain('data-testid="history-human-review-outcome-field"');
    expect(html).toContain('data-testid="history-human-review-confidence-field"');
    expect(html).toContain('data-testid="history-human-review-note-field"');
    expect(html).toContain('Newest commit first');
    expect(html).toContain('full history loaded automatically (2/2 commits)');
    expect(html).toContain('Oldest retained revision');
    expect(html).toContain('Binary review limits:');
    expect(html).toContain('Reviewer guidance:');
    expect(html).toContain('Confidence and scope:');
    expect(html).toContain('Local Git history, tracked-file status, and content-detected VI signature checks.');
    expect(html).toContain('Direct local evidence for chronology, path provenance, retained hashes, and retained compare pairing.');
    expect(html).toContain('Repository/path facts, retained commit chronology, selected-versus-base pairing, compare-pair summaries, and dashboard availability.');
    expect(html).toContain('Compare generation:</strong> Available for retained pairs that have a base revision');
    expect(html).toContain('Open compare:</strong> Available once retained pair evidence exists');
    expect(html).toContain('Dashboard:</strong> Available when the retained review window reaches at least three commits');
    expect(html).toContain('Decision record:</strong> Available when the retained review window reaches at least three commits');
    expect(html).toContain('Documentation:</strong> Available in this build');
    expect(html).toContain(
      "Benchmark status:</strong> Available only on Sergio Velderrain's canonical Windows 11 host machine"
    );
    expect(html).toContain(
      "Host review submission:</strong> Available only on Sergio Velderrain's canonical Windows 11 host machine"
    );
    expect(html).toContain('Needs external comparison tooling:');
    expect(html).toContain('Binary semantic differences, visual or cosmetic change detection, and LabVIEW comparison-report output.');
    expect(html).toContain('Selected:</strong> <code>abcdef12</code>');
    expect(html).toContain('vs base:</strong> <code>11111111</code>');
    expect(html).toContain('Open compare</code> action targets once retained pair evidence exists and retained compare opening is available in this build.');
    expect(html).toContain('Generate compare</code> when a pair has no retained evidence yet');
    expect(html).toContain('Refresh compare</code> when you want to update already-retained evidence');
    expect(html).toContain('Open docs</code> to open the bundled user documentation');
    expect(html).toContain(
      'Open benchmark status</code> on the canonical Windows 11 host when you need the retained Windows baseline plus the live or completed Linux benchmark state inside VS Code'
    );
    expect(html).toContain(
      'Create decision record</code> when decision-record support is available in this build and you want to retain a separate human review outcome'
    );
    expect(html).toContain(
      'Submit host review</code> after the manual right-click pass on the canonical Windows 11 host machine'
    );
    expect(html).toContain(
      'Pass + High: the click flow behaved as expected and no meaningful doubt remains.'
    );
    expect(html).toContain('No host review has been submitted from this panel yet.');
    expect(html).toContain(
      'No compare action from this panel has retained provider or acquisition truth yet.'
    );
    expect(html).toContain("message.type === 'comparisonRuntimeResult'");
  });

  it('renders refresh-state pair actions when retained comparison evidence already exists', () => {
    const html = renderHistoryPanelHtml({
      repositoryName: 'labview-icon-editor',
      repositoryRoot: '/tmp/labview-icon-editor',
      relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
      signature: 'LVIN',
      eligible: true,
      commits: [
        {
          hash: 'abcdef1234567890',
          authorDate: '2026-04-02T00:00:00Z',
          authorName: 'A User',
          subject: 'Improve deployment behavior',
          previousHash: '1111111122222222',
          retainedComparisonEvidenceAvailable: true
        },
        {
          hash: '1111111122222222',
          authorDate: '2026-04-01T00:00:00Z',
          authorName: 'B User',
          subject: 'Initial deployment behavior'
        }
      ]
    });

    expect(html).toContain('Open compare');
    expect(html).toContain('Refresh compare');
    expect(html).toContain('data-command="generateComparisonReport" data-hash="abcdef1234567890">Refresh compare</button>');
    expect(html).toContain('data-testid="history-action-report" disabled>Generate compare</button>');
    expect(html).toContain('data-testid="history-action-decision-record" disabled');
  });

  it('renders capability-truthful disabled actions when optional surfaces are unavailable in this build', () => {
    const html = renderHistoryPanelHtml({
      repositoryName: 'labview-icon-editor',
      repositoryRoot: '/tmp/labview-icon-editor',
      relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
      signature: 'LVIN',
      eligible: true,
      surfaceCapabilities: {
        comparisonGenerationAvailable: false,
        retainedComparisonOpenAvailable: false,
        dashboardAvailable: false,
        decisionRecordAvailable: false,
        documentationAvailable: false,
        benchmarkStatusAvailable: false,
        humanReviewSubmissionAvailable: false
      },
      commits: [
        {
          hash: 'abcdef1234567890',
          authorDate: '2026-04-02T00:00:00Z',
          authorName: 'A User',
          subject: 'Improve deployment behavior',
          previousHash: '1111111122222222',
          retainedComparisonEvidenceAvailable: true
        },
        {
          hash: '1111111122222222',
          authorDate: '2026-04-01T00:00:00Z',
          authorName: 'B User',
          subject: 'Older deployment behavior',
          previousHash: '3333333344444444'
        },
        {
          hash: '3333333344444444',
          authorDate: '2026-03-31T00:00:00Z',
          authorName: 'C User',
          subject: 'Initial deployment behavior'
        }
      ]
    });

    expect(html).toContain('data-testid="history-action-documentation" disabled');
    expect(html).toContain('data-testid="history-action-dashboard" disabled');
    expect(html).toContain('data-testid="history-action-decision-record" disabled');
    expect(html).toContain('data-testid="history-action-diff" disabled');
    expect(html).toContain('data-testid="history-action-report" disabled>Refresh compare</button>');
    expect(html).toContain('Compare generation:</strong> Unavailable in this build');
    expect(html).toContain('Open compare:</strong> Unavailable in this build');
    expect(html).toContain('Dashboard:</strong> Unavailable in this build');
    expect(html).toContain('Decision record:</strong> Unavailable in this build');
    expect(html).toContain('Documentation:</strong> Unavailable in this build');
    expect(html).not.toContain('data-testid="history-capability-benchmark-status"');
    expect(html).not.toContain('data-testid="history-capability-human-review"');
    expect(html).not.toContain('data-testid="history-action-benchmark-status"');
    expect(html).not.toContain('data-testid="history-human-review-submit"');
    expect(html).not.toContain('data-command="submitHumanReview">Submit host review</button>');
  });

  it('renders a portable factual review packet', () => {
    const reviewPacket = renderHistoryReviewPacketText({
      repositoryName: 'labview-icon-editor',
      repositoryRoot: '/tmp/labview-icon-editor',
      repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
      relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
      signature: 'LVIN',
      eligible: true,
      repositorySupport: {
        repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        normalizedRepositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        tier: 'governed-upstream',
        familyId: 'labview-icon-editor',
        familyDisplayName: 'NI LabVIEW Icon Editor',
        supportLabel: 'Governed upstream: NI LabVIEW Icon Editor',
        supportGuidance:
          'This upstream repo is inside the governed family. Core compare and dashboard surfaces remain in scope here, while decision-record, benchmark, and maintainer host-review lanes stay governed separately.',
        allowCoreReviewActions: true,
        allowDecisionRecordActions: true,
        allowBenchmarkStatus: true,
        allowHumanReviewSubmission: true
      },
      historyWindow: {
        mode: 'capped',
        configuredMaxEntries: 2,
        effectiveEntryCeiling: 2,
        loadedCommitCount: 2,
        totalCommitCount: 4,
        truncated: true,
        decision: 'capped-truncated-to-max'
      },
      commits: [
        {
          hash: 'abcdef1234567890',
          authorDate: '2026-04-02T00:00:00Z',
          authorName: 'A User',
          subject: 'Improve deployment behavior',
          previousHash: '1111111122222222'
        },
        {
          hash: '1111111122222222',
          authorDate: '2026-04-01T00:00:00Z',
          authorName: 'B User',
          subject: 'Initial deployment behavior'
        }
      ]
    });

    expect(reviewPacket).toContain('VI History Review Packet');
    expect(reviewPacket).toContain('Repository: labview-icon-editor');
    expect(reviewPacket).toContain('Origin: https://github.com/ni/labview-icon-editor.git');
    expect(reviewPacket).toContain('Path: Tooling/deployment/VIP_Pre-Install Custom Action.vi');
    expect(reviewPacket).toContain('Repo support: Governed upstream: NI LabVIEW Icon Editor');
    expect(reviewPacket).toContain('Retained revisions: 2');
    expect(reviewPacket).toContain('History window: capped window truncated to 2/4 commits at the configured ceiling (2)');
    expect(reviewPacket).toContain('Dashboard available: no');
    expect(reviewPacket).toContain('Confidence and scope:');
    expect(reviewPacket).toContain('Included here: chronology, path provenance, retained hashes, compare pairs, and dashboard availability.');
    expect(reviewPacket).toContain('Needs external comparison tooling: binary semantic differences, visual or cosmetic change detection, and LabVIEW comparison-report output.');
    expect(reviewPacket).toContain('- abcdef12 vs 11111111 :: Improve deployment behavior');
    expect(reviewPacket).toContain('- 11111111 :: oldest retained revision :: Initial deployment behavior');
  });

  it('renders an explicit no-retained-commits fallback in HTML and the copied review packet', () => {
    const model = {
      repositoryName: 'labview-icon-editor',
      repositoryRoot: '/tmp/labview-icon-editor',
      relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
      signature: 'LVIN' as const,
      eligible: false,
      commits: []
    };

    const html = renderHistoryPanelHtml(model);
    const reviewPacket = renderHistoryReviewPacketText(model);

    expect(html).toContain('No retained commits');
    expect(html).toContain('data-testid="history-action-dashboard" disabled');
    expect(reviewPacket).toContain('Newest retained commit: No retained commits');
    expect(reviewPacket).toContain('Oldest retained commit: No retained commits');
  });

  it('renders repository support details for a governed upstream repo', () => {
    const html = renderHistoryPanelHtml({
      repositoryName: 'labview-icon-editor',
      repositoryRoot: '/tmp/labview-icon-editor',
      repositoryUrl: 'git@github.com:ni/labview-icon-editor.git',
      relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
      signature: 'LVIN',
      eligible: true,
      repositorySupport: {
        repositoryUrl: 'git@github.com:ni/labview-icon-editor.git',
        normalizedRepositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        tier: 'governed-upstream',
        familyId: 'labview-icon-editor',
        familyDisplayName: 'NI LabVIEW Icon Editor',
        supportLabel: 'Governed upstream: NI LabVIEW Icon Editor',
        supportGuidance:
          'This upstream repo is inside the governed family. Core compare and dashboard surfaces remain in scope here, while decision-record, benchmark, and maintainer host-review lanes stay governed separately.',
        allowCoreReviewActions: true,
        allowDecisionRecordActions: true,
        allowBenchmarkStatus: true,
        allowHumanReviewSubmission: true
      },
      commits: [
        {
          hash: 'abcdef1234567890',
          authorDate: '2026-04-02T00:00:00Z',
          authorName: 'A User',
          subject: 'Improve deployment behavior',
          previousHash: '1111111122222222'
        },
        {
          hash: '1111111122222222',
          authorDate: '2026-04-01T00:00:00Z',
          authorName: 'B User',
          subject: 'Initial deployment behavior'
        }
      ]
    });

    expect(html).toContain('data-testid="history-meta-origin"');
    expect(html).toContain('data-testid="history-meta-support"');
    expect(html).toContain('data-testid="history-repository-support"');
    expect(html).toContain('Origin:</strong> git@github.com:ni/labview-icon-editor.git');
    expect(html).toContain('Repo support:</strong> Governed upstream: NI LabVIEW Icon Editor');
  });

  it('renders a fail-closed unsupported-family state for repos outside the governed family', () => {
    const html = renderHistoryPanelHtml({
      repositoryName: 'other-repo',
      repositoryRoot: '/tmp/other-repo',
      repositoryUrl: 'https://github.com/example/other-repo.git',
      relativePath: 'Some.vi',
      signature: 'LVIN',
      eligible: true,
      repositorySupport: {
        repositoryUrl: 'https://github.com/example/other-repo.git',
        normalizedRepositoryUrl: 'https://github.com/example/other-repo.git',
        tier: 'unsupported',
        supportLabel: 'Unsupported outside governed repo family',
        supportGuidance:
          'This GitHub repository is outside the governed vi-history-suite repo family. Compare, dashboard, decision-record, benchmark, and host-review actions are blocked here.',
        allowCoreReviewActions: false,
        allowDecisionRecordActions: false,
        allowBenchmarkStatus: false,
        allowHumanReviewSubmission: false
      },
      surfaceCapabilities: {
        comparisonGenerationAvailable: false,
        retainedComparisonOpenAvailable: false,
        dashboardAvailable: false,
        decisionRecordAvailable: false,
        documentationAvailable: true,
        benchmarkStatusAvailable: false,
        humanReviewSubmissionAvailable: false
      },
      commits: [
        {
          hash: 'abcdef1234567890',
          authorDate: '2026-04-02T00:00:00Z',
          authorName: 'A User',
          subject: 'Update unsupported repo',
          previousHash: '1111111122222222'
        },
        {
          hash: '1111111122222222',
          authorDate: '2026-04-01T00:00:00Z',
          authorName: 'B User',
          subject: 'Initial unsupported repo state'
        }
      ]
    });

    expect(html).toContain('Unsupported outside governed repo family');
    expect(html).toContain('Compare generation:</strong> Blocked outside the governed repo family');
    expect(html).toContain('Dashboard:</strong> Blocked outside the governed repo family');
    expect(html).toContain('Decision record:</strong> Blocked outside the governed repo family');
    expect(html).toContain('data-testid="history-action-dashboard" disabled');
    expect(html).toContain('data-testid="history-action-decision-record" disabled');
    expect(html).toContain('data-testid="history-action-diff" disabled');
    expect(html).toContain('data-testid="history-action-report" disabled>Generate compare</button>');
  });
});
