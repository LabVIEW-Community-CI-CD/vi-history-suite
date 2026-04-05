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
    options?: { linuxWorkspaceRoot?: string; windowsWorkspaceRoot?: string }
  ) => {
    representedPairCount: number;
    comparablePairCount: number;
    runtimeTotalMs: number;
    providerCounts: Record<string, number>;
    lastPairId: string;
  };
  normalizeArtifactPath: (
    filePath: string,
    options?: { linuxWorkspaceRoot?: string; windowsWorkspaceRoot?: string }
  ) => string;
  readWindowsExactPairDiagnosis: (
    reportPath: string,
    proofRootPath: string
  ) => {
    engine: string;
    proofRootPath: string;
    reportPath: string;
    selectedHash?: string;
    baseHash?: string;
    runtimeExecutionState?: string;
    runtimeFailureReason?: string;
    runtimeDiagnosticReason?: string;
    runtimeLabviewIniPath?: string;
    runtimeLabviewTcpPort?: number;
    runtimeExecutable?: string;
    headlessSessionResetExecutable?: string;
    headlessSessionResetArgs: string[];
    headlessSessionResetExitCode?: number;
    headlessSessionResetStdoutPath?: string;
    headlessSessionResetStderrPath?: string;
    runtimeNotes: string[];
  };
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
        validatedComparablePairCount: number;
        comparablePrefixRuntimeTotalMs: number;
      };
      linuxHost: {
        latestSummaryPath: string;
        dashboardJsonPath: string;
        validatedComparablePairCount: number;
        comparablePrefixRuntimeTotalMs: number;
        fullWindowBlocker: {
          terminalPairIndex: number;
          terminalPairFailureReason: string;
          terminalPairDiagnosticReason: string;
        };
      };
      windowsBenchmarkImage: {
        state: string;
        latestSummaryPath: string;
        dashboardJsonPath: string;
        imageRef: string;
        validatedComparablePairCount: number;
        comparablePrefixRuntimeTotalMs: number;
        fullWindowBlocker: {
          terminalPairIndex: number;
          terminalPairFailureReason: string;
          terminalPairDiagnosticReason: string;
        };
        exactPairDiagnostics?: Array<{
          engine: string;
          proofRootPath: string;
          reportPath: string;
          selectedHash?: string;
          baseHash?: string;
          runtimeFailureReason?: string;
          runtimeDiagnosticReason?: string;
          runtimeLabviewIniPath?: string;
          runtimeLabviewTcpPort?: number;
        }>;
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
      comparablePacket.normalizeArtifactPath(
        'C:\\workspace\\.cache\\harness-reports\\HARNESS-VHS-002\\dashboard-smoke.json',
        {
          windowsWorkspaceRoot:
            '/mnt/c/Users/sveld/AppData/Local/VI History Suite/windows-benchmark-image-proof'
        }
      )
    ).toBe(
      '/mnt/c/Users/sveld/AppData/Local/VI History Suite/windows-benchmark-image-proof/cache/harness-reports/HARNESS-VHS-002/dashboard-smoke.json'
    );
    expect(
      comparablePacket.normalizeArtifactPath('/workspace/.cache/report-metadata.json', {
        linuxWorkspaceRoot: '/mnt/c/Users/sveld/AppData/Local/VI History Suite/host-linux-dashboard-benchmark/workspace-stage/current'
      })
    ).toBe(
      '/mnt/c/Users/sveld/AppData/Local/VI History Suite/host-linux-dashboard-benchmark/workspace-stage/current/.cache/report-metadata.json'
    );
  });

  it('reads a retained Windows exact-pair diagnosis report', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-exact-pair-'));
    const reportPath = path.join(
      tempRoot,
      'cache',
      'harness-reports',
      'HARNESS-VHS-002',
      'comparison-report-smoke.json'
    );

    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(
      reportPath,
      JSON.stringify({
        runtimeEngine: 'labview-cli',
        selectedHash: '3408654e680200d7787c17cc0b443a97fcdfb360',
        baseHash: '6dd65df674287c9705959a7e9aca6b02e8445d40',
        runtimeExecutionState: 'failed',
        runtimeFailureReason: 'command-exited-nonzero',
        runtimeDiagnosticReason: 'labview-cli-call-by-reference',
        runtimeLabviewIniPath:
          'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini',
        runtimeLabviewTcpPort: 3363,
        runtimeExecutable:
          'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        headlessSessionResetExecutable:
          'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        headlessSessionResetArgs: [
          '-LogToConsole',
          'TRUE',
          '-OperationName',
          'CloseLabVIEW',
          '-LabVIEWPath',
          'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
          '-Headless',
          'true'
        ],
        headlessSessionResetExitCode: 1,
        headlessSessionResetStdoutPath: 'C:\\workspace\\.cache\\headless-session-reset-stdout.txt',
        headlessSessionResetStderrPath: 'C:\\workspace\\.cache\\headless-session-reset-stderr.txt',
        runtimeNotes: ['Attempted Windows headless session reset via LabVIEWCLI CloseLabVIEW.']
      }),
      'utf8'
    );

    const summary = comparablePacket.readWindowsExactPairDiagnosis(reportPath, tempRoot);
    expect(summary).toEqual({
      engine: 'labview-cli',
      proofRootPath: tempRoot,
      reportPath,
      selectedHash: '3408654e680200d7787c17cc0b443a97fcdfb360',
      baseHash: '6dd65df674287c9705959a7e9aca6b02e8445d40',
      runtimeExecutionState: 'failed',
      runtimeFailureReason: 'command-exited-nonzero',
      runtimeDiagnosticReason: 'labview-cli-call-by-reference',
      runtimeLabviewIniPath:
        'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini',
      runtimeLabviewTcpPort: 3363,
      runtimeExecutable:
        'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      headlessSessionResetExecutable:
        'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      headlessSessionResetArgs: [
        '-LogToConsole',
        'TRUE',
        '-OperationName',
        'CloseLabVIEW',
        '-LabVIEWPath',
        'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
        '-Headless',
        'true'
      ],
      headlessSessionResetExitCode: 1,
      headlessSessionResetStdoutPath: 'C:\\workspace\\.cache\\headless-session-reset-stdout.txt',
      headlessSessionResetStderrPath: 'C:\\workspace\\.cache\\headless-session-reset-stderr.txt',
      runtimeNotes: ['Attempted Windows headless session reset via LabVIEWCLI CloseLabVIEW.']
    });
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
        dashboardCommitWindow: 129,
        comparePairCount: 128,
        lastComparablePairId: '87792a7b6545'
      },
      surfaces: {
        windowsHost: {
          latestRunPath: '/tmp/latest-dashboard-run.json',
          dashboardJsonPath: '/tmp/windows-dashboard.json',
          validatedComparablePairCount: 128,
          comparablePrefixRuntimeTotalMs: 4432457
        },
        linuxHost: {
          latestSummaryPath: '/tmp/latest-summary.json',
          dashboardJsonPath: '/tmp/linux-dashboard.json',
          validatedComparablePairCount: 134,
          comparablePrefixRuntimeTotalMs: 489440,
          fullWindowBlocker: {
            terminalPairIndex: 135,
            terminalPairFailureReason: 'command-exited-nonzero',
            terminalPairDiagnosticReason: 'linux-headless-recursive-load'
          }
        },
        windowsBenchmarkImage: {
          state: 'bounded-blocked',
          latestSummaryPath: '/tmp/windows-image-summary.json',
          dashboardJsonPath: '/tmp/windows-image-dashboard.json',
          imageRef:
            'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/windows-dashboard-benchmark:sha-b679b8761f09df3f39d1a2d35addad2aaf0654b9',
          validatedComparablePairCount: 128,
          comparablePrefixRuntimeTotalMs: 623664,
          fullWindowBlocker: {
            terminalPairIndex: 129,
            terminalPairFailureReason: 'command-exited-nonzero',
            terminalPairDiagnosticReason: 'labview-cli-call-by-reference'
          },
          exactPairDiagnostics: [
            {
              engine: 'labview-cli',
              proofRootPath: '/tmp/windows-benchmark-image-pair129-labviewcli',
              reportPath: '/tmp/windows-benchmark-image-pair129-labviewcli/comparison-report-smoke.json',
              baseHash: '6dd65df674287c9705959a7e9aca6b02e8445d40',
              selectedHash: '3408654e680200d7787c17cc0b443a97fcdfb360',
              runtimeFailureReason: 'command-exited-nonzero',
              runtimeDiagnosticReason: 'labview-cli-call-by-reference',
              runtimeLabviewIniPath:
                'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini',
              runtimeLabviewTcpPort: 3363,
              headlessSessionResetExitCode: 1,
              headlessSessionResetStdoutPath: '/tmp/windows-benchmark-image-pair129-labviewcli/headless-session-reset-stdout.txt',
              headlessSessionResetStderrPath: '/tmp/windows-benchmark-image-pair129-labviewcli/headless-session-reset-stderr.txt'
            },
            {
              engine: 'lvcompare',
              proofRootPath: '/tmp/windows-benchmark-image-pair129-lvcompare',
              reportPath: '/tmp/windows-benchmark-image-pair129-lvcompare/comparison-report-smoke.json',
              baseHash: '6dd65df674287c9705959a7e9aca6b02e8445d40',
              selectedHash: '3408654e680200d7787c17cc0b443a97fcdfb360',
              runtimeFailureReason: 'command-timed-out'
            }
          ]
        }
      },
      comparison: {
        linuxVsWindowsRuntimeRatio: 0.1104,
        windowsVsLinuxSpeedupFactor: 9.0556,
        deltaRuntimeMs: 3943017
      }
    });

    expect(markdown).toContain('Comparable Prefix Benchmark Packet');
    expect(markdown).toContain('129 commits / 128 pairs');
    expect(markdown).toContain('linux-headless-recursive-load');
    expect(markdown).toContain('labview-cli-call-by-reference');
    expect(markdown).toContain('bounded-blocked');
    expect(markdown).toContain('## Windows Exact-Pair Diagnosis');
    expect(markdown).toContain(
      'labview-cli: 6dd65df67428 -> 3408654e6802 :: command-exited-nonzero (labview-cli-call-by-reference)'
    );
    expect(markdown).toContain(
      'labview-cli selected LabVIEW.ini: C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini'
    );
    expect(markdown).toContain('labview-cli selected LabVIEW TCP port: 3363');
    expect(markdown).toContain('labview-cli recovery exit code: 1');
    expect(markdown).toContain(
      'labview-cli recovery stderr: /tmp/windows-benchmark-image-pair129-labviewcli/headless-session-reset-stderr.txt'
    );
    expect(markdown).toContain(
      'lvcompare: 6dd65df67428 -> 3408654e6802 :: command-timed-out'
    );
  });
});
