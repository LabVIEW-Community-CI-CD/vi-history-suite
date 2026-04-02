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
        }
      ]
    });

    expect(html).toContain('VIP_Pre-Install Custom Action.vi');
    expect(html).toContain('labview-icon-editor');
    expect(html).toContain('Improve deployment behavior');
    expect(html).toContain('Open@commit');
    expect(html).toContain('Diff prev');
    expect(html).toContain('Copy hash');
  });
});

