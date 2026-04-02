import { describe, expect, it } from 'vitest';

import { runDesignGateCli } from '../../src/cli/runDesignGate';

describe('runDesignGateCli', () => {
  it('returns the retained report when the shared runner passes', async () => {
    await expect(
      runDesignGateCli({
        repoRoot: '/tmp/vi-history-suite',
        runner: async () => ({
          generatedAt: '2026-04-02T00:00:00.000Z',
          repoRoot: '/tmp/vi-history-suite',
          status: 'pass',
          steps: []
        })
      })
    ).resolves.toMatchObject({
      repoRoot: '/tmp/vi-history-suite',
      status: 'pass'
    });
  });

  it('throws when the shared runner returns a failed report', async () => {
    await expect(
      runDesignGateCli({
        repoRoot: '/tmp/vi-history-suite',
        runner: async () => ({
          generatedAt: '2026-04-02T00:00:00.000Z',
          repoRoot: '/tmp/vi-history-suite',
          status: 'fail',
          steps: []
        })
      })
    ).rejects.toThrow('design gate failed');
  });
});
