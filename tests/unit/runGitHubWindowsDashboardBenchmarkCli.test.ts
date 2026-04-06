import { describe, expect, it, vi } from 'vitest';

import {
  applyGitHubWindowsDashboardBenchmarkCliExitCode,
  buildGitHubWindowsDashboardBenchmarkSummary,
  formatGitHubWindowsDashboardBenchmarkSuccess,
  getGitHubWindowsDashboardBenchmarkUsage,
  maybeRunGitHubWindowsDashboardBenchmarkCliAsMain,
  parseGitHubWindowsDashboardBenchmarkArgs,
  runGitHubWindowsDashboardBenchmarkCli,
  runGitHubWindowsDashboardBenchmarkCliMain
} from '../../src/cli/runGitHubWindowsDashboardBenchmark';

const WINDOWS_LABVIEW_EXE_PATH =
  'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
const WINDOWS_X86_LABVIEW_EXE_PATH =
  'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
const WINDOWS_LABVIEW_CLI_PATH =
  'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe';

describe('runGitHubWindowsDashboardBenchmarkCli', () => {
  it('parses deterministic benchmark args with a deep Windows default', () => {
    expect(parseGitHubWindowsDashboardBenchmarkArgs([])).toEqual({
      harnessId: 'HARNESS-VHS-002',
      dashboardCommitWindow: 1000,
      labviewCliPath: undefined,
      labviewExePath: undefined,
      strictRsrcHeader: false,
      helpRequested: false
    });

    expect(
      parseGitHubWindowsDashboardBenchmarkArgs([
        '--harness-id',
        'HARNESS-VHS-999',
        '--dashboard-commit-window',
        '139',
        '--labview-cli-path',
        WINDOWS_LABVIEW_CLI_PATH,
        '--labview-exe-path',
        WINDOWS_X86_LABVIEW_EXE_PATH,
        '--strict-rsrc-header'
      ])
    ).toEqual({
      harnessId: 'HARNESS-VHS-999',
      dashboardCommitWindow: 139,
      labviewCliPath: WINDOWS_LABVIEW_CLI_PATH,
      labviewExePath: WINDOWS_X86_LABVIEW_EXE_PATH,
      strictRsrcHeader: true,
      helpRequested: false
    });

    expect(() =>
      parseGitHubWindowsDashboardBenchmarkArgs(['--dashboard-commit-window', '2'])
    ).toThrow(/Unsupported value for --dashboard-commit-window/);
    expect(() =>
      parseGitHubWindowsDashboardBenchmarkArgs([
        '--labview-exe-path',
        WINDOWS_LABVIEW_EXE_PATH
      ])
    ).toThrow(/Canonical CreateComparisonReport overrides require both --labview-cli-path and --labview-exe-path/);
    expect(() =>
      parseGitHubWindowsDashboardBenchmarkArgs([
        '--labview-cli-path',
        WINDOWS_LABVIEW_CLI_PATH,
        '--labview-exe-path',
        WINDOWS_LABVIEW_EXE_PATH
      ])
    ).toThrow(/must form one coherent bitness bundle/);
    expect(getGitHubWindowsDashboardBenchmarkUsage()).toContain(
      'Defaults to HARNESS-VHS-002'
    );
  });

  it('fails closed on missing explicit runtime paths on the canonical Windows host', async () => {
    const runner = vi.fn();

    await expect(
      runGitHubWindowsDashboardBenchmarkCli(
        [
          '--labview-cli-path',
          WINDOWS_LABVIEW_CLI_PATH,
          '--labview-exe-path',
          WINDOWS_X86_LABVIEW_EXE_PATH
        ],
        {
          hostPlatform: 'win32',
          pathExists: (vi.fn(async (candidatePath: string) =>
            candidatePath !== WINDOWS_LABVIEW_CLI_PATH
          ) as never),
          runner
        }
      )
    ).rejects.toThrow(/--labview-cli-path does not exist on the canonical Windows host/);

    expect(runner).not.toHaveBeenCalled();
  });

  it('writes a retained Windows benchmark summary from the dashboard smoke result', async () => {
    const writes: string[] = [];
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const copyFile = vi.fn().mockResolvedValue(undefined);
    const pathExists = vi.fn().mockResolvedValue(true);
    const runner = vi.fn().mockImplementation(async (_harnessId, options) => {
      await options.reportProgress?.({
        message:
          'Preparing dashboard pair 7/138; est. 64m 17s left: executing LabVIEW comparison-report runtime.'
      });
      return {
        report: {
          harnessId: 'HARNESS-VHS-002',
          repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
          cloneDirectory: 'C:\\tmp\\harness',
          targetRelativePath: 'resource/plugins/lv_icon.vi',
          head: 'abcdef1234567890',
          generatedAt: '2026-04-05T03:00:00.000Z',
          eligible: true,
          signature: 'LVIN',
          dashboardCommitWindow: 139,
          comparePairCount: 138,
          dashboardFilePath: 'C:\\tmp\\dashboard.html',
          dashboardJsonFilePath: 'C:\\tmp\\dashboard.json',
          dashboardWindowCompletenessState: 'complete',
          dashboardArchivedPairCount: 138,
          dashboardMissingPairCount: 0,
          dashboardGeneratedReportCount: 136,
          dashboardMetadataPairCount: 136,
          dashboardOverviewImageCount: 272,
          dashboardDetailItemCount: 544,
          dashboardProviderSummaries: [],
          completionState: 'completed',
          processedPairCount: 138,
          terminalPairIndex: undefined,
          terminalPairFailureReason: undefined,
          comparabilityState: 'comparable-to-windows-baseline',
          dashboardEtaAccuracyFilePath: 'C:\\tmp\\dashboard-pair-eta-accuracy.json',
          dashboardEtaAccuracyRecord: {
            recordedAt: '2026-04-05T03:00:00.000Z',
            stage: 'pair-preparation',
            preparedPairCount: 138,
            etaEligiblePairCount: 136,
            measuredPairCount: 135,
            unmeasuredPairCount: 3,
            excludedPairCount: 2,
            meanAbsoluteErrorSeconds: 4.2,
            maxAbsoluteErrorSeconds: 19.3,
            meanSignedErrorSeconds: 0.8,
            meanAbsolutePercentageError: 8.9,
            samples: []
          },
          pairSummaries: [
            {
              pairIndex: 1,
              selectedHash: 'aaaa',
              baseHash: 'bbbb',
              reportStatus: 'ready-for-runtime',
              runtimeExecutionState: 'succeeded',
              runtimeProvider: 'host-native',
              runtimeEngine: 'labview-cli',
              generatedReportExists: true,
              packetFilePath: 'C:\\tmp\\packet-1.json',
              reportFilePath: 'C:\\tmp\\report-1.html',
              metadataFilePath: 'C:\\tmp\\metadata-1.json',
              actualPreparationSeconds: 10
            },
            {
              pairIndex: 2,
              selectedHash: 'cccc',
              baseHash: 'dddd',
              reportStatus: 'ready-for-runtime',
              runtimeExecutionState: 'succeeded',
              runtimeProvider: 'host-native',
              runtimeEngine: 'labview-cli',
              generatedReportExists: false,
              packetFilePath: 'C:\\tmp\\packet-2.json',
              reportFilePath: 'C:\\tmp\\report-2.html',
              metadataFilePath: 'C:\\tmp\\metadata-2.json',
              actualPreparationSeconds: 3
            },
            {
              pairIndex: 3,
              selectedHash: 'eeee',
              baseHash: 'ffff',
              reportStatus: 'ready-for-runtime',
              runtimeExecutionState: 'succeeded',
              runtimeProvider: 'host-native',
              runtimeEngine: 'labview-cli',
              generatedReportExists: true,
              packetFilePath: 'C:\\tmp\\packet-3.json',
              reportFilePath: 'C:\\tmp\\report-3.html',
              metadataFilePath: 'C:\\tmp\\metadata-3.json',
              actualPreparationSeconds: 7
            }
          ]
        },
        reportJsonPath: 'C:\\tmp\\reports\\HARNESS-VHS-002\\dashboard-smoke.json',
        reportMarkdownPath: 'C:\\tmp\\reports\\HARNESS-VHS-002\\dashboard-smoke.md',
        reportHtmlPath: 'C:\\tmp\\reports\\HARNESS-VHS-002\\dashboard-smoke.html'
      };
    });

    await expect(
      runGitHubWindowsDashboardBenchmarkCli([], {
        repoRoot: '/tmp/vi-history-suite',
        runner,
        mkdir,
        writeFile,
        copyFile,
        pathExists,
        now: (() => {
          const values = [
            new Date('2026-04-05T03:00:00.000Z'),
            new Date('2026-04-05T04:10:00.000Z')
          ];
          return () => values.shift() ?? new Date('2026-04-05T04:10:00.000Z');
        })(),
        stdout: {
          write(text: string) {
            writes.push(text);
          }
        }
      })
    ).resolves.toBe('pass');

    expect(runner).toHaveBeenCalledWith(
      'HARNESS-VHS-002',
      expect.objectContaining({
        runtimePlatform: 'win32',
        dashboardCommitWindow: 1000,
        runtimeSettings: {
          labviewCliPath: undefined,
          labviewExePath: undefined
        }
      })
    );
    expect(mkdir).toHaveBeenCalledWith(
      '/tmp/vi-history-suite/.cache/github-experiments/windows-dashboard-benchmark/HARNESS-VHS-002',
      { recursive: true }
    );
    expect(writeFile.mock.calls[0]?.[0]).toContain('latest-progress.json');
    expect(writeFile.mock.calls.at(-1)?.[1]).toContain('"phase": "completed"');
    expect(copyFile).toHaveBeenCalledWith(
      'C:\\tmp\\reports\\HARNESS-VHS-002\\dashboard-smoke.json',
      expect.stringContaining('dashboard-smoke.json')
    );
    expect(writes.join('')).toContain(
      'VIHS_PROGRESS: Preparing the Windows benchmark workspace for HARNESS-VHS-002.'
    );
    expect(writes.join('')).toContain(
      'GitHub Windows dashboard benchmark completed for HARNESS-VHS-002'
    );
    expect(writes.join('')).toContain('Completion: completed (comparable-to-linux-benchmark-image)');
    expect(writes.join('')).toContain(
      'Pair outcomes: generated=136 blocked=0 failed=0 not-available=0 no-generated=1'
    );
  });

  it('fails closed when the retained Windows benchmark surface is contaminated before runtime launch', async () => {
    const writes: string[] = [];
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const copyFile = vi.fn().mockResolvedValue(undefined);
    const runner = vi.fn().mockResolvedValue({
      report: {
        harnessId: 'HARNESS-VHS-002',
        repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        cloneDirectory: 'C:\\tmp\\harness',
        targetRelativePath: 'resource/plugins/lv_icon.vi',
        head: 'abcdef1234567890',
        generatedAt: '2026-04-05T03:00:00.000Z',
        eligible: true,
        signature: 'LVIN',
        dashboardCommitWindow: 129,
        comparePairCount: 128,
        dashboardFilePath: 'C:\\tmp\\dashboard.html',
        dashboardJsonFilePath: 'C:\\tmp\\dashboard.json',
        dashboardWindowCompletenessState: 'complete',
        dashboardArchivedPairCount: 128,
        dashboardMissingPairCount: 0,
        dashboardGeneratedReportCount: 0,
        dashboardMetadataPairCount: 0,
        dashboardOverviewImageCount: 0,
        dashboardDetailItemCount: 0,
        dashboardProviderSummaries: [],
        completionState: 'completed',
        processedPairCount: 128,
        terminalPairIndex: undefined,
        terminalPairFailureReason: undefined,
        comparabilityState: 'characterization-only',
        pairSummaries: [
          {
            pairIndex: 1,
            selectedHash: 'aaaa',
            baseHash: 'bbbb',
            reportStatus: 'ready-for-runtime',
            runtimeExecutionState: 'not-available',
            runtimeProvider: 'host-native',
            runtimeEngine: 'labview-cli',
            runtimeBlockedReason: 'windows-host-runtime-surface-contaminated',
            runtimeDiagnosticNotes: [
              'Windows host preflight observed existing runtime processes before launch: LabVIEW.exe (pid 3288).',
              'Windows host preflight observed an existing TCP listener on the governed VI Server port before launch: LabVIEW.exe listening on 0.0.0.0:3363.'
            ],
            generatedReportExists: false,
            packetFilePath: 'C:\\tmp\\packet-1.json',
            reportFilePath: 'C:\\tmp\\report-1.html',
            metadataFilePath: 'C:\\tmp\\metadata-1.json',
            actualPreparationSeconds: 1
          }
        ]
      },
      reportJsonPath: 'C:\\tmp\\reports\\HARNESS-VHS-002\\dashboard-smoke.json',
      reportMarkdownPath: 'C:\\tmp\\reports\\HARNESS-VHS-002\\dashboard-smoke.md',
      reportHtmlPath: 'C:\\tmp\\reports\\HARNESS-VHS-002\\dashboard-smoke.html'
    });

    await expect(
      runGitHubWindowsDashboardBenchmarkCli([], {
        repoRoot: '/tmp/vi-history-suite',
        runner,
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile,
        copyFile,
        pathExists: vi.fn().mockResolvedValue(true),
        now: (() => {
          const values = [
            new Date('2026-04-05T03:00:00.000Z'),
            new Date('2026-04-05T03:00:05.000Z')
          ];
          return () => values.shift() ?? new Date('2026-04-05T03:00:05.000Z');
        })(),
        stdout: {
          write(text: string) {
            writes.push(text);
          }
        }
      })
    ).rejects.toThrow(
      /Windows benchmark failed at pair 1\/128: windows-host-runtime-surface-contaminated/
    );

    const retainedSummary = writeFile.mock.calls
      .find((call) => String(call[0]).endsWith('latest-summary.json'))?.[1];
    const retainedFailureReceipt = writeFile.mock.calls
      .map((call) => String(call[1]))
      .find((contents) => contents.includes('"schema": "vi-history-suite/github-windows-dashboard-benchmark-pair-failure@v1"'));

    expect(String(retainedSummary)).toContain('"completionState": "failed"');
    expect(String(retainedSummary)).toContain('"blockedPairCount": 1');
    expect(String(retainedSummary)).toContain('"notAvailablePairCount": 1');
    expect(String(retainedSummary)).toContain(
      '"terminalPairFailureReason": "windows-host-runtime-surface-contaminated"'
    );
    expect(String(retainedSummary)).toContain('"comparabilityState": "characterization-only"');
    expect(retainedFailureReceipt).toContain('"runtimeBlockedReason": "windows-host-runtime-surface-contaminated"');
    expect(copyFile).toHaveBeenCalledWith(
      'C:\\tmp\\reports\\HARNESS-VHS-002\\dashboard-smoke.json',
      expect.stringContaining('dashboard-smoke.json')
    );
    expect(writeFile.mock.calls.at(-1)?.[1]).toContain('"phase": "failed"');
  });

  it('fails closed when env-derived explicit Windows runtime overrides bypass the CLI surface', async () => {
    const originalCliPath = process.env.VIHS_GITHUB_WINDOWS_BENCHMARK_LABVIEW_CLI_PATH;
    const originalExePath = process.env.VIHS_GITHUB_WINDOWS_BENCHMARK_LABVIEW_EXE_PATH;
    const runner = vi.fn();

    process.env.VIHS_GITHUB_WINDOWS_BENCHMARK_LABVIEW_CLI_PATH = WINDOWS_LABVIEW_CLI_PATH;
    process.env.VIHS_GITHUB_WINDOWS_BENCHMARK_LABVIEW_EXE_PATH = WINDOWS_LABVIEW_EXE_PATH;

    try {
      await expect(
        runGitHubWindowsDashboardBenchmarkCli([], {
          runner
        })
      ).rejects.toThrow(/must form one coherent bitness bundle/);
    } finally {
      if (originalCliPath === undefined) {
        delete process.env.VIHS_GITHUB_WINDOWS_BENCHMARK_LABVIEW_CLI_PATH;
      } else {
        process.env.VIHS_GITHUB_WINDOWS_BENCHMARK_LABVIEW_CLI_PATH = originalCliPath;
      }

      if (originalExePath === undefined) {
        delete process.env.VIHS_GITHUB_WINDOWS_BENCHMARK_LABVIEW_EXE_PATH;
      } else {
        process.env.VIHS_GITHUB_WINDOWS_BENCHMARK_LABVIEW_EXE_PATH = originalExePath;
      }
    }

    expect(runner).not.toHaveBeenCalled();
  });

  it('surfaces help and exit wiring deterministically while rejecting direct legacy main execution', async () => {
    const stdoutWrites: string[] = [];
    const stderrWrites: string[] = [];
    const processLike = { exitCode: 0 };

    await expect(
      runGitHubWindowsDashboardBenchmarkCli(['--help'], {
        stdout: { write(text: string) { stdoutWrites.push(text); } }
      })
    ).resolves.toBe('help');

    expect(
      maybeRunGitHubWindowsDashboardBenchmarkCliAsMain(
        [],
        module,
        module,
        {},
        processLike,
        { write(text: string) { stderrWrites.push(text); } }
      )
    ).toBe(true);

    expect(stdoutWrites.join('')).toContain('Usage: runGitHubWindowsDashboardBenchmark');
    expect(processLike.exitCode).toBe(1);
    expect(stderrWrites.join('')).toContain('single public proof entrypoint');
    expect(stderrWrites.join('')).toContain('npm run proof:run -- benchmark-windows');
    expect(applyGitHubWindowsDashboardBenchmarkCliExitCode(7, processLike)).toBe(7);
    expect(processLike.exitCode).toBe(7);
    expect(
      formatGitHubWindowsDashboardBenchmarkSuccess(
        buildGitHubWindowsDashboardBenchmarkSummary(
          {
            report: {
              harnessId: 'HARNESS-VHS-002',
              repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
              cloneDirectory: 'C:\\tmp\\harness',
              targetRelativePath: 'resource/plugins/lv_icon.vi',
              head: 'head',
              generatedAt: '2026-04-05T03:00:00.000Z',
              eligible: true,
              signature: 'LVIN',
              dashboardCommitWindow: 139,
              comparePairCount: 1,
              dashboardFilePath: 'a',
              dashboardJsonFilePath: 'b',
              dashboardWindowCompletenessState: 'complete',
              dashboardArchivedPairCount: 1,
              dashboardMissingPairCount: 0,
              dashboardGeneratedReportCount: 1,
              dashboardMetadataPairCount: 1,
              dashboardOverviewImageCount: 2,
              dashboardDetailItemCount: 4,
              dashboardProviderSummaries: [],
              completionState: 'completed',
              processedPairCount: 1,
              comparabilityState: 'comparable-to-windows-baseline',
              pairSummaries: [
                {
                  pairIndex: 1,
                  selectedHash: 'a',
                  baseHash: 'b',
                  reportStatus: 'ready-for-runtime',
                  runtimeExecutionState: 'succeeded',
                  runtimeProvider: 'host-native',
                  runtimeEngine: 'labview-cli',
                  generatedReportExists: true,
                  packetFilePath: 'a',
                  reportFilePath: 'b',
                  metadataFilePath: 'c',
                  actualPreparationSeconds: 1
                }
              ]
            },
            reportJsonPath: 'a',
            reportMarkdownPath: 'b',
            reportHtmlPath: 'c'
          },
          {
            startedAt: new Date('2026-04-05T03:00:00.000Z'),
            completedAt: new Date('2026-04-05T03:00:05.000Z'),
            benchmarkRoot: 'C:\\tmp',
            runtimeImage: 'nationalinstruments/labview:2026q1-windows'
          }
        )
      ).join('\n')
    ).toContain('Runtime image: nationalinstruments/labview:2026q1-windows');

    await expect(
      runGitHubWindowsDashboardBenchmarkCliMain(
        ['--dashboard-commit-window', '2'],
        {},
        { write(text: string) { stderrWrites.push(text); } }
      )
    ).resolves.toBe(1);
    expect(stderrWrites.join('')).toContain('Unsupported value for --dashboard-commit-window');
  });

  it('retains the terminal Windows diagnostic reason in failed summaries', () => {
    const summary = buildGitHubWindowsDashboardBenchmarkSummary(
      {
        report: {
          harnessId: 'HARNESS-VHS-002',
          repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
          cloneDirectory: 'C:\\tmp\\harness',
          targetRelativePath: 'resource/plugins/lv_icon.vi',
          head: 'head',
          generatedAt: '2026-04-05T03:00:00.000Z',
          eligible: true,
          signature: 'LVIN',
          dashboardCommitWindow: 129,
          comparePairCount: 128,
          dashboardFilePath: 'a',
          dashboardJsonFilePath: 'b',
          dashboardWindowCompletenessState: 'incomplete-missing-archives',
          dashboardArchivedPairCount: 129,
          dashboardMissingPairCount: 0,
          dashboardGeneratedReportCount: 128,
          dashboardMetadataPairCount: 128,
          dashboardOverviewImageCount: 2,
          dashboardDetailItemCount: 4,
          dashboardProviderSummaries: [],
          completionState: 'failed',
          processedPairCount: 129,
          terminalPairIndex: 129,
          terminalPairFailureReason: 'command-exited-nonzero',
          comparabilityState: 'characterization-only',
          pairSummaries: [
            {
              pairIndex: 129,
              selectedHash: '3408654e680200d7787c17cc0b443a97fcdfb360',
              baseHash: '6dd65df674287c9705959a7e9aca6b02e8445d40',
              reportStatus: 'ready-for-runtime',
              runtimeExecutionState: 'failed',
              runtimeProvider: 'host-native',
              runtimeEngine: 'labview-cli',
              runtimeFailureReason: 'command-exited-nonzero',
              runtimeDiagnosticReason: 'labview-cli-call-by-reference',
              runtimeDiagnosticNotes: [
                'Attempted Windows headless session reset via LabVIEWCLI CloseLabVIEW after call-by-reference diagnosis, then retried the pair once.'
              ],
              generatedReportExists: false,
              packetFilePath: 'a',
              reportFilePath: 'b',
              metadataFilePath: 'c',
              actualPreparationSeconds: 1
            }
          ]
        },
        reportJsonPath: 'a',
        reportMarkdownPath: 'b',
        reportHtmlPath: 'c'
      },
      {
        startedAt: new Date('2026-04-05T03:00:00.000Z'),
        completedAt: new Date('2026-04-05T03:00:05.000Z'),
        benchmarkRoot: 'C:\\tmp',
        runtimeImage: 'nationalinstruments/labview:2026q1-windows'
      }
    );

    expect(summary.terminalPairDiagnosticReason).toBe('labview-cli-call-by-reference');
    expect(summary.terminalPairDiagnosticNotes).toEqual([
      'Attempted Windows headless session reset via LabVIEWCLI CloseLabVIEW after call-by-reference diagnosis, then retried the pair once.'
    ]);
  });
});
