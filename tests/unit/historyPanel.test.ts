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
    expect(html).toContain('Open docs');
    expect(html).toContain('Open benchmark status');
    expect(html).toContain('Submit host review');
    expect(html).toContain('Select outcome');
    expect(html).toContain('Select confidence');
    expect(html).toContain('Copy hash');
    expect(html).toContain('Copy review packet');
    expect(html).toContain('data-testid="history-status"');
    expect(html).toContain('data-testid="history-compare-runtime-status"');
    expect(html).toContain('data-testid="history-compare-selection-status"');
    expect(html).toContain('data-testid="history-compare-selection-summary"');
    expect(html).toContain('data-testid="history-compare-runtime-summary"');
    expect(html).toContain('data-testid="history-compare-runtime-next-action"');
    expect(html).toContain('data-testid="history-compare-runtime-details"');
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
    expect(html).toContain('data-testid="history-capability-documentation"');
    expect(html).toContain('data-testid="history-capability-benchmark-status"');
    expect(html).toContain('data-testid="history-capability-human-review"');
    expect(html).toContain('data-testid="history-row"');
    expect(html).toContain('data-testid="history-commit-select"');
    expect(html).toContain('data-testid="history-commit-select-cell"');
    expect(html).toContain('data-testid="history-compare-base"');
    expect(html).toContain('data-testid="history-compare-pair"');
    expect(html).toContain('data-testid="history-action-open"');
    expect(html).toContain('data-testid="history-action-copy"');
    expect(html).toContain('data-testid="history-action-documentation"');
    expect(html).toContain('data-testid="history-action-benchmark-status"');
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
    expect(html).toContain('Repository/path facts, retained commit chronology, checkbox-selected compare pairing, and retained compare-pair summaries.');
    expect(html).toContain('Pair selection:</strong> Available for any retained review window with at least two commits; the second checkbox selection generates the explicit selected/base pair');
    expect(html).toContain('Retained pair review:</strong> Retained comparison evidence opens automatically through the checkbox-selected compare flow when available; no separate compare button is exposed on commit rows');
    expect(html).toContain('Documentation:</strong> Available in this build');
    expect(html).toContain(
      "Benchmark status:</strong> Available only on Sergio Velderrain's canonical Windows 11 host machine"
    );
    expect(html).toContain(
      "Host review submission:</strong> Available only on Sergio Velderrain's canonical Windows 11 host machine"
    );
    expect(html).toContain('Needs external comparison tooling:');
    expect(html).toContain('Binary semantic differences, visual or cosmetic change detection, and LabVIEW comparison-report output.');
    expect(html).toContain('Adjacent:</strong> <code>abcdef12</code>');
    expect(html).toContain('vs prior:</strong> <code>11111111</code>');
    expect(html).toContain('Checkbox selection defines the exact selected/base pair. The adjacent-pair text in each row is chronology context only');
    expect(html).toContain('Open docs</code> to open the bundled user documentation');
    expect(html).toContain(
      'Open benchmark status</code> on the canonical Windows 11 host when you need the retained Windows baseline plus the live or completed Linux benchmark state inside VS Code'
    );
    expect(html).toContain(
      'Submit host review</code> after the manual right-click pass on the canonical Windows 11 host machine from the deterministic local fixture workspace, not a OneDrive-backed path'
    );
    expect(html).toContain(
      'Pass + High: the click flow behaved as expected and no meaningful doubt remains.'
    );
    expect(html).toContain('No host review has been submitted from this panel yet.');
    expect(html).toContain(
      'No compare action from this panel has retained provider or acquisition truth yet.'
    );
    expect(html).toContain(
      'Select any two retained revisions. The second checkbox selection will generate a comparison report automatically for that exact pair, using the newer commit as selected and the older commit as base.'
    );
    expect(html).toContain("command: 'generateComparisonReportFromSelection'");
    expect(html).toContain('handleCommitSelectionChange');
    expect(html).toContain('Select one more retained revision to generate a comparison report for the chosen pair.');
    expect(html).toContain('Generating compare for the selected retained pair...');
    expect(html).toContain('let panelState = vscode.getState() ?? {};');
    expect(html).toContain('hostReviewDraft');
    expect(html).toContain('persistHostReviewDraft');
    expect(html).toContain('clearHostReviewDraft');
    expect(html).toContain("message.status === 'success'");
    expect(html).toContain("message.type === 'comparisonRuntimeProgress'");
    expect(html).toContain("message.type === 'comparisonRuntimeResult'");
  });

  it('keeps compare row buttons off the extension-user surface even when retained comparison evidence already exists', () => {
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

    expect(html).not.toContain('data-testid="history-action-diff"');
    expect(html).not.toContain('data-testid="history-action-report"');
    expect(html).not.toContain('data-testid="history-action-dashboard"');
    expect(html).not.toContain('data-testid="history-action-decision-record"');
  });

  it('renders the last retained compare runtime truth when the panel is reopened', () => {
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
    }, {
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890',
      outcome: 'opened-comparison-report',
      comparisonRuntimePanelStatus: 'succeeded',
      comparisonRuntimePanelSummary:
        'Generate compare for abcdef12 vs 11111111. Provider: windows-container. Execution mode: auto. Report status: ready-for-runtime. Runtime state: succeeded. Windows image acquisition: acquired.',
      comparisonRuntimePanelNextAction:
        'Next action: open the retained comparison packet for the full governed runtime summary.',
      comparisonRuntimePanelDetails: [
        {
          label: 'Provider',
          value: 'windows-container'
        },
        {
          label: 'Execution mode',
          value: 'auto'
        },
        {
          label: 'Report status',
          value: 'ready-for-runtime'
        },
        {
          label: 'Runtime state',
          value: 'succeeded'
        },
        {
          label: 'Windows image acquisition',
          value: 'acquired'
        }
      ]
    });

    expect(html).toContain('data-state="succeeded"');
    expect(html).toContain(
      'Generate compare for abcdef12 vs 11111111. Provider: windows-container. Execution mode: auto. Report status: ready-for-runtime. Runtime state: succeeded. Windows image acquisition: acquired.'
    );
    expect(html).toContain(
      'Next action: open the retained comparison packet for the full governed runtime summary.'
    );
    expect(html).toContain('<strong>Provider:</strong> windows-container');
    expect(html).toContain('<strong>Execution mode:</strong> auto');
    expect(html).toContain('<strong>Windows image acquisition:</strong> acquired');
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
    expect(html).not.toContain('data-testid="history-action-dashboard"');
    expect(html).not.toContain('data-testid="history-action-decision-record"');
    expect(html).not.toContain('data-testid="history-action-diff"');
    expect(html).not.toContain('data-testid="history-action-report"');
    expect(html).toContain('Pair selection:</strong> Unavailable in this build');
    expect(html).toContain('Retained pair review:</strong> Retained comparison opening is unavailable in this build');
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
    expect(reviewPacket).toContain('Included here: chronology, path provenance, retained hashes, checkbox-selected compare pairing, and retained compare pairs.');
    expect(reviewPacket).toContain('Confidence and scope:');
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
    expect(html).not.toContain('data-testid="history-action-dashboard"');
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

  it('renders repo-agnostic support for repos outside the canonical governed family', () => {
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
        tier: 'generic-repository',
        supportLabel: 'Repo-agnostic support',
        supportGuidance:
          'VI History is available for this repository. Canonical benchmark, scenario, and maintainer host-review evidence remain separately governed and may be narrower than the current repo.',
        allowCoreReviewActions: true,
        allowDecisionRecordActions: true,
        allowBenchmarkStatus: true,
        allowHumanReviewSubmission: true
      },
      surfaceCapabilities: {
        comparisonGenerationAvailable: true,
        retainedComparisonOpenAvailable: true,
        dashboardAvailable: true,
        decisionRecordAvailable: true,
        documentationAvailable: true,
        benchmarkStatusAvailable: true,
        humanReviewSubmissionAvailable: true
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

    expect(html).toContain('Repo-agnostic support');
    expect(html).toContain('Pair selection:</strong> Available for any retained review window with at least two commits; the second checkbox selection generates the explicit selected/base pair');
    expect(html).not.toContain('data-testid="history-action-dashboard"');
    expect(html).not.toContain('data-testid="history-action-decision-record"');
    expect(html).toContain('data-testid="history-action-open"');
    expect(html).not.toContain('data-testid="history-action-report"');
  });
});
