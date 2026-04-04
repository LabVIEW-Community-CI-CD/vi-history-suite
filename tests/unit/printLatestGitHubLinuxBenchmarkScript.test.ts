import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const latestBenchmark = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'printLatestGitHubLinuxBenchmark.js'
)) as {
  DEFAULT_GITHUB_REPOSITORY: string;
  selectLatestBenchmarkRun: (
    runs: Array<{
      databaseId: number;
      event: string;
      status: string;
      conclusion: string;
      createdAt: string;
      updatedAt?: string;
    }>
  ) =>
    | {
        databaseId: number;
        event: string;
        status: string;
        conclusion: string;
      }
    | undefined;
  formatLatestGitHubLinuxBenchmark: (candidate: {
    mode: string;
    repository: string;
    cacheState: string;
    summaryPath: string;
    run?: { databaseId?: number; url?: string };
    imageReceipt?: { imageResolution?: string };
    summary: {
      completedAt: string;
      targetRelativePath: string;
      runtimeImage: string;
      benchmarkImage?: { reference?: string; digest?: string };
      headlessDisplayProvider?: string;
      wallClockSeconds: number;
      totalPairPreparationSeconds: number;
      generatedReportCount: number;
      blockedPairCount: number;
      failedPairCount: number;
      noGeneratedReportPairCount: number;
      providerCounts: Record<string, number>;
    };
  }) => string;
};

describe('printLatestGitHubLinuxBenchmark script', () => {
  it('selects the newest successful workflow-dispatch benchmark run', () => {
    const selected = latestBenchmark.selectLatestBenchmarkRun([
      {
        databaseId: 1,
        event: 'push',
        status: 'completed',
        conclusion: 'success',
        createdAt: '2026-04-04T20:00:00Z'
      },
      {
        databaseId: 2,
        event: 'workflow_dispatch',
        status: 'completed',
        conclusion: 'failure',
        createdAt: '2026-04-04T20:10:00Z'
      },
      {
        databaseId: 3,
        event: 'workflow_dispatch',
        status: 'completed',
        conclusion: 'success',
        createdAt: '2026-04-04T20:20:00Z'
      },
      {
        databaseId: 4,
        event: 'workflow_dispatch',
        status: 'in_progress',
        conclusion: '',
        createdAt: '2026-04-04T20:30:00Z'
      }
    ]);

    expect(selected?.databaseId).toBe(3);
  });

  it('formats benchmark summaries with cache state and image resolution', () => {
    const text = latestBenchmark.formatLatestGitHubLinuxBenchmark({
      mode: 'github-run-artifact',
      repository: latestBenchmark.DEFAULT_GITHUB_REPOSITORY,
      cacheState: 'downloaded',
      summaryPath: '/tmp/latest-summary.json',
      run: {
        databaseId: 23987178240,
        url: 'https://github.com/example/actions/runs/23987178240'
      },
      imageReceipt: {
        imageResolution: 'reused-existing-sha-tag'
      },
      summary: {
        completedAt: '2026-04-04T20:50:00Z',
        targetRelativePath: 'resource/plugins/lv_icon.vi',
        runtimeImage: 'nationalinstruments/labview:2026q1-linux',
        benchmarkImage: {
          reference: 'ghcr.io/example/linux-dashboard-benchmark',
          digest: 'sha256:abc123'
        },
        headlessDisplayProvider: 'xvfb-run',
        wallClockSeconds: 123.456,
        totalPairPreparationSeconds: 120,
        generatedReportCount: 137,
        blockedPairCount: 0,
        failedPairCount: 0,
        noGeneratedReportPairCount: 0,
        providerCounts: {
          'containerized / labview-cli / x64 / linux': 137
        }
      }
    });

    expect(text).toContain('discovery: github-run-artifact');
    expect(text).toContain('cacheState: downloaded');
    expect(text).toContain('imageResolution: reused-existing-sha-tag');
    expect(text).toContain('headlessDisplay: xvfb-run');
    expect(text).toContain('providers: containerized / labview-cli / x64 / linux=137');
  });
});
