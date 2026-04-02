import { describe, expect, it } from 'vitest';

import { renderHistoryPanelHtml } from '../../src/ui/historyPanel';

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

    expect(html).toContain('VIP_Pre-Install Custom Action.vi');
    expect(html).toContain('labview-icon-editor');
    expect(html).toContain('Improve deployment behavior');
    expect(html).toContain('Open@commit');
    expect(html).toContain('Diff prev');
    expect(html).toContain('Copy hash');
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
    expect(html).toContain('data-testid="history-action-copy"');
    expect(html).toContain('Newest commit first');
    expect(html).toContain('Oldest retained revision');
    expect(html).toContain('Binary review limits:');
    expect(html).toContain('Reviewer guidance:');
    expect(html).toContain('Confidence and scope:');
    expect(html).toContain('Local Git history, tracked-file status, and content-detected VI signature checks.');
    expect(html).toContain('Direct local evidence for chronology, path provenance, retained hashes, and command routing.');
    expect(html).toContain('Needs external comparison tooling:');
    expect(html).toContain('Binary semantic differences, visual or cosmetic change detection, and NI comparison-report output.');
    expect(html).toContain('Selected:</strong> <code>abcdef12</code>');
    expect(html).toContain('vs base:</strong> <code>11111111</code>');
  });
});
