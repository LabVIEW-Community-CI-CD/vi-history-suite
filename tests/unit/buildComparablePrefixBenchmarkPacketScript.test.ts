import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const comparablePacket = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'buildComparablePrefixBenchmarkPacket.js'
)) as {
  summarizeDashboardPrefix: (
    dashboardJsonPath: string,
    comparablePairCount: number,
    options?: { linuxWorkspaceRoot?: string }
  ) => {
    representedPairCount: number;
    comparablePairCount: number;
    runtimeTotalMs: number;
    providerCounts: Record<string, number>;
    lastPairId: string;
  };
  normalizeArtifactPath: (
    filePath: string,
    options?: { linuxWorkspaceRoot?: string }
  ) => string;
  renderComparablePrefixBenchmarkPacketMarkdown: (packet: {
    generatedAt: string;
    proofState: string;
    targetRelativePath: string;
    fullWindow: { dashboardCommitWindow: number; comparePairCount: number };
    comparablePrefix: {
      dashboardCommitWindow: number;
      comparePairCount: number;
      lastComparablePairId: string;
    };
    surfaces: {
      windowsHost: {
        latestRunPath: string;
        dashboardJsonPath: string;
        comparablePrefixRuntimeTotalMs: number;
      };
      linuxHost: {
        latestSummaryPath: string;
        dashboardJsonPath: string;
        comparablePrefixRuntimeTotalMs: number;
        fullWindowBlocker: {
          terminalPairIndex: number;
          terminalPairFailureReason: string;
          terminalPairDiagnosticReason: string;
        };
      };
      windowsBenchmarkImage: {
        state: string;
        imageRef: string;
      };
    };
    comparison: {
      linuxVsWindowsRuntimeRatio?: number;
      windowsVsLinuxSpeedupFactor?: number;
      deltaRuntimeMs: number;
    };
  }) => string;
};

describe('buildComparablePrefixBenchmarkPacket script', () => {
  it('summarizes a comparable dashboard prefix from retained metadata', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-prefix-packet-'));
    const reportHistoryRoot = path.join(tempRoot, 'report-history');
    const firstPairDirectory = path.join(reportHistoryRoot, 'pairs', 'pair-a');
    const secondPairDirectory = path.join(reportHistoryRoot, 'pairs', 'pair-b');
    const dashboardJsonPath = path.join(tempRoot, 'dashboard.json');

    await fs.mkdir(firstPairDirectory, { recursive: true });
    await fs.mkdir(secondPairDirectory, { recursive: true });
    await fs.writeFile(
      path.join(firstPairDirectory, 'report-metadata.json'),
      JSON.stringify({
        runtimeExecution: {
          durationMs: 40
        }
      }),
      'utf8'
    );
    await fs.writeFile(
      path.join(secondPairDirectory, 'report-metadata.json'),
      JSON.stringify({
        runtimeExecution: {
          durationMs: 60
        }
      }),
      'utf8'
    );
    await fs.writeFile(
      dashboardJsonPath,
      JSON.stringify({
        summary: {
          representedPairCount: 3
        },
        entries: [
          {
            pairId: 'pair-a',
            metadataFilePath: path.join(firstPairDirectory, 'report-metadata.json'),
            runtimeProviderLabel: 'windows-container / labview-cli / auto / win32'
          },
          {
            pairId: 'pair-b',
            metadataFilePath: path.join(secondPairDirectory, 'report-metadata.json'),
            runtimeProviderLabel: 'windows-container / labview-cli / auto / win32'
          },
          {
            pairId: 'pair-c',
            metadataFilePath: path.join(secondPairDirectory, 'report-metadata.json'),
            runtimeProviderLabel: 'windows-container / labview-cli / auto / win32'
          }
        ]
      }),
      'utf8'
    );

    const summary = comparablePacket.summarizeDashboardPrefix(dashboardJsonPath, 2);
    expect(summary.representedPairCount).toBe(3);
    expect(summary.comparablePairCount).toBe(2);
    expect(summary.runtimeTotalMs).toBe(100);
    expect(summary.providerCounts).toEqual({
      'windows-container / labview-cli / auto / win32': 2
    });
    expect(summary.lastPairId).toBe('pair-b');
  });

  it('maps /workspace and Windows drive paths into local host paths', () => {
    expect(
      comparablePacket.normalizeArtifactPath('C:\\Users\\sveld\\report-metadata.json')
    ).toBe('/mnt/c/Users/sveld/report-metadata.json');
    expect(
      comparablePacket.normalizeArtifactPath('/workspace/.cache/report-metadata.json', {
        linuxWorkspaceRoot: '/mnt/c/Users/sveld/AppData/Local/VI History Suite/host-linux-dashboard-benchmark/workspace-stage/current'
      })
    ).toBe(
      '/mnt/c/Users/sveld/AppData/Local/VI History Suite/host-linux-dashboard-benchmark/workspace-stage/current/.cache/report-metadata.json'
    );
  });

  it('renders a concise comparable-prefix markdown packet', () => {
    const markdown = comparablePacket.renderComparablePrefixBenchmarkPacketMarkdown({
      generatedAt: '2026-04-05T07:30:00.000Z',
      proofState: 'bounded-prefix-comparable',
      targetRelativePath: 'resource/plugins/lv_icon.vi',
      fullWindow: {
        dashboardCommitWindow: 139,
        comparePairCount: 138
      },
      comparablePrefix: {
        dashboardCommitWindow: 135,
        comparePairCount: 134,
        lastComparablePairId: '2a28a2b984d9'
      },
      surfaces: {
        windowsHost: {
          latestRunPath: '/tmp/latest-dashboard-run.json',
          dashboardJsonPath: '/tmp/windows-dashboard.json',
          comparablePrefixRuntimeTotalMs: 4432457
        },
        linuxHost: {
          latestSummaryPath: '/tmp/latest-summary.json',
          dashboardJsonPath: '/tmp/linux-dashboard.json',
          comparablePrefixRuntimeTotalMs: 489440,
          fullWindowBlocker: {
            terminalPairIndex: 135,
            terminalPairFailureReason: 'command-exited-nonzero',
            terminalPairDiagnosticReason: 'linux-headless-recursive-load'
          }
        },
        windowsBenchmarkImage: {
          state: 'pending-proof',
          imageRef:
            'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/windows-dashboard-benchmark:main'
        }
      },
      comparison: {
        linuxVsWindowsRuntimeRatio: 0.1104,
        windowsVsLinuxSpeedupFactor: 9.0556,
        deltaRuntimeMs: 3943017
      }
    });

    expect(markdown).toContain('Comparable Prefix Benchmark Packet');
    expect(markdown).toContain('135 commits / 134 pairs');
    expect(markdown).toContain('linux-headless-recursive-load');
    expect(markdown).toContain('pending-proof');
  });
});
