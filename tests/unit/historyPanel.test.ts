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
    expect(html).toContain('Create decision record');
    expect(html).toContain('Copy hash');
    expect(html).toContain('Copy review packet');
    expect(html).toContain('data-testid="history-status"');
    expect(html).toContain('data-testid="history-review-packet"');
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
    expect(html).toContain('data-testid="history-row"');
    expect(html).toContain('data-testid="history-compare-base"');
    expect(html).toContain('data-testid="history-compare-pair"');
    expect(html).toContain('data-testid="history-action-open"');
    expect(html).toContain('data-testid="history-action-diff"');
    expect(html).toContain('data-testid="history-action-report"');
    expect(html).toContain('data-testid="history-action-copy"');
    expect(html).toContain('data-testid="history-action-dashboard"');
    expect(html).toContain('data-testid="history-action-documentation"');
    expect(html).toContain('data-testid="history-action-decision-record"');
    expect(html).toContain('Newest commit first');
    expect(html).toContain('Oldest retained revision');
    expect(html).toContain('Binary review limits:');
    expect(html).toContain('Reviewer guidance:');
    expect(html).toContain('Confidence and scope:');
    expect(html).toContain('Local Git history, tracked-file status, and content-detected VI signature checks.');
    expect(html).toContain('Direct local evidence for chronology, path provenance, retained hashes, and retained compare pairing.');
    expect(html).toContain('Repository/path facts, retained commit chronology, selected-versus-base pairing, compare-pair summaries, and dashboard availability.');
    expect(html).toContain('Needs external comparison tooling:');
    expect(html).toContain('Binary semantic differences, visual or cosmetic change detection, and NI comparison-report output.');
    expect(html).toContain('Selected:</strong> <code>abcdef12</code>');
    expect(html).toContain('vs base:</strong> <code>11111111</code>');
    expect(html).toContain('Open compare</code> action targets once retained pair evidence exists.');
    expect(html).toContain('Generate compare</code> when a pair has no retained evidence yet');
    expect(html).toContain('Refresh compare</code> when you want to update already-retained evidence');
    expect(html).toContain('Open docs</code> to open the bundled user documentation');
    expect(html).toContain(
      'Create decision record</code> when you want to retain a separate human review outcome'
    );
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

  it('renders a portable factual review packet', () => {
    const reviewPacket = renderHistoryReviewPacketText({
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
    expect(reviewPacket).toContain('Path: Tooling/deployment/VIP_Pre-Install Custom Action.vi');
    expect(reviewPacket).toContain('Retained revisions: 2');
    expect(reviewPacket).toContain('Dashboard available: no');
    expect(reviewPacket).toContain('Confidence and scope:');
    expect(reviewPacket).toContain('Included here: chronology, path provenance, retained hashes, compare pairs, and dashboard availability.');
    expect(reviewPacket).toContain('Needs external comparison tooling: binary semantic differences, visual or cosmetic change detection, and NI comparison-report output.');
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
});
