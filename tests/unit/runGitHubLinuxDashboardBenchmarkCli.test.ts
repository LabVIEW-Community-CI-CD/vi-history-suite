import { describe, expect, it, vi } from 'vitest';

import {
  applyGitHubLinuxDashboardBenchmarkCliExitCode,
  buildGitHubLinuxDashboardBenchmarkSummary,
  formatGitHubLinuxDashboardBenchmarkSuccess,
  getGitHubLinuxDashboardBenchmarkUsage,
  maybeRunGitHubLinuxDashboardBenchmarkCliAsMain,
  parseGitHubLinuxDashboardBenchmarkArgs,
  runGitHubLinuxDashboardBenchmarkCli,
  runGitHubLinuxDashboardBenchmarkCliMain
} from '../../src/cli/runGitHubLinuxDashboardBenchmark';

const LINUX_LABVIEW_EXE_PATH = '/usr/local/natinst/LabVIEW-2026Q1-64/labview';
const LINUX_LVCOMPARE_PATH = '/usr/local/bin/LVCompare';

describe('runGitHubLinuxDashboardBenchmarkCli', () => {
  it('parses deterministic benchmark args with a hosted canonical default and high-history window', () => {
    expect(parseGitHubLinuxDashboardBenchmarkArgs([])).toEqual({
      harnessId: 'HARNESS-VHS-001',
      dashboardCommitWindow: 1000,
      runtimeEngineOverride: undefined,
      labviewCliPath: undefined,
      labviewExePath: undefined,
      lvComparePath: undefined,
      strictRsrcHeader: false,
      helpRequested: false
    });

    expect(
      parseGitHubLinuxDashboardBenchmarkArgs([
        '--harness-id',
        'HARNESS-VHS-999',
        '--dashboard-commit-window',
        '139',
        '--engine',
        'lvcompare',
        '--labview-exe-path',
        LINUX_LABVIEW_EXE_PATH,
        '--lvcompare-path',
        LINUX_LVCOMPARE_PATH,
        '--strict-rsrc-header'
      ])
    ).toEqual({
      harnessId: 'HARNESS-VHS-999',
      dashboardCommitWindow: 139,
      runtimeEngineOverride: 'lvcompare',
      labviewCliPath: undefined,
      labviewExePath: LINUX_LABVIEW_EXE_PATH,
      lvComparePath: LINUX_LVCOMPARE_PATH,
      strictRsrcHeader: true,
      helpRequested: false
    });

    expect(() =>
      parseGitHubLinuxDashboardBenchmarkArgs(['--dashboard-commit-window', '2'])
    ).toThrow(/Unsupported value for --dashboard-commit-window/);
    expect(() => parseGitHubLinuxDashboardBenchmarkArgs(['--engine', 'weird'])).toThrow(
      /Unsupported value for --engine/
    );
    expect(() =>
      parseGitHubLinuxDashboardBenchmarkArgs(['--labview-exe-path', LINUX_LABVIEW_EXE_PATH])
    ).toThrow(/Canonical runtime overrides require --engine/);
    expect(() => parseGitHubLinuxDashboardBenchmarkArgs(['--labview-exe-path'])).toThrow(
      /Missing value for --labview-exe-path/
    );
    expect(getGitHubLinuxDashboardBenchmarkUsage()).toContain('Defaults to HARNESS-VHS-001');
    expect(getGitHubLinuxDashboardBenchmarkUsage()).toContain('Defaults to 1000');
  });

  it('writes a benchmark summary from the retained dashboard smoke result', async () => {
    const writes: string[] = [];
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const runner = vi.fn().mockImplementation(async (_harnessId, options) => {
      await options.reportProgress?.({
        message:
          'Preparing dashboard pair 7/137; est. 74m 17s left: Executing LabVIEW comparison runtime.'
      });
      return {
        report: {
          harnessId: 'HARNESS-VHS-001',
          repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
          cloneDirectory: '/tmp/harness',
          targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          head: 'abcdef1234567890',
          generatedAt: '2026-04-04T18:00:00.000Z',
          eligible: true,
          signature: 'LVIN',
          dashboardCommitWindow: 21,
          comparePairCount: 20,
          dashboardFilePath: '/tmp/dashboard.html',
          dashboardJsonFilePath: '/tmp/dashboard.json',
          dashboardWindowCompletenessState: 'complete',
          dashboardArchivedPairCount: 20,
          dashboardMissingPairCount: 0,
          dashboardGeneratedReportCount: 18,
          dashboardMetadataPairCount: 18,
          dashboardOverviewImageCount: 36,
          dashboardDetailItemCount: 72,
          dashboardProviderSummaries: [],
          completionState: 'completed',
          processedPairCount: 20,
          terminalPairIndex: undefined,
          terminalPairFailureReason: undefined,
          comparabilityState: 'comparable-to-windows-baseline',
          dashboardEtaAccuracyFilePath: '/tmp/dashboard-pair-eta-accuracy.json',
          dashboardEtaAccuracyRecord: {
            recordedAt: '2026-04-04T18:00:00.000Z',
            stage: 'pair-preparation',
            preparedPairCount: 20,
            etaEligiblePairCount: 18,
            measuredPairCount: 17,
            unmeasuredPairCount: 3,
            excludedPairCount: 2,
            meanAbsoluteErrorSeconds: 5.2,
            maxAbsoluteErrorSeconds: 17.3,
            meanSignedErrorSeconds: 1.1,
            meanAbsolutePercentageError: 12.8,
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
              runtimeEngine: 'lvcompare',
              runtimeFailureReason: undefined,
              runtimeDiagnosticReason: undefined,
              generatedReportExists: true,
              packetFilePath: '/tmp/packet-1.json',
              reportFilePath: '/tmp/report-1.html',
              metadataFilePath: '/tmp/metadata-1.json',
              runtimeStdoutPath: '/tmp/runtime-stdout-1.txt',
              runtimeStderrPath: '/tmp/runtime-stderr-1.txt',
              runtimeDiagnosticLogPath: undefined,
              runtimeProcessObservationPath: undefined,
              actualPreparationSeconds: 10,
              estimatedPreparationSeconds: 8,
              absoluteEtaErrorSeconds: 2,
              signedEtaErrorSeconds: 2
            },
            {
              pairIndex: 2,
              selectedHash: 'cccc',
              baseHash: 'dddd',
              reportStatus: 'blocked-runtime',
              runtimeExecutionState: 'not-available',
              runtimeProvider: 'host-native',
              runtimeEngine: 'lvcompare',
              runtimeFailureReason: undefined,
              runtimeDiagnosticReason: undefined,
              generatedReportExists: false,
              packetFilePath: '/tmp/packet-2.json',
              reportFilePath: '/tmp/report-2.html',
              metadataFilePath: '/tmp/metadata-2.json',
              runtimeStdoutPath: undefined,
              runtimeStderrPath: undefined,
              runtimeDiagnosticLogPath: undefined,
              runtimeProcessObservationPath: undefined,
              actualPreparationSeconds: 3
            },
            {
              pairIndex: 3,
              selectedHash: 'eeee',
              baseHash: 'ffff',
              reportStatus: 'ready-for-runtime',
              runtimeExecutionState: 'failed',
              runtimeProvider: 'host-native',
              runtimeEngine: 'lvcompare',
              runtimeFailureReason: 'command-exited-nonzero',
              runtimeDiagnosticReason: undefined,
              generatedReportExists: false,
              packetFilePath: '/tmp/packet-3.json',
              reportFilePath: '/tmp/report-3.html',
              metadataFilePath: '/tmp/metadata-3.json',
              runtimeStdoutPath: '/tmp/runtime-stdout-3.txt',
              runtimeStderrPath: '/tmp/runtime-stderr-3.txt',
              runtimeDiagnosticLogPath: '/tmp/runtime-diagnostic-3.txt',
              runtimeProcessObservationPath: '/tmp/runtime-process-observation-3.json',
              actualPreparationSeconds: 7
            }
          ]
        },
        reportJsonPath: '/tmp/reports/HARNESS-VHS-001/dashboard-smoke.json',
        reportMarkdownPath: '/tmp/reports/HARNESS-VHS-001/dashboard-smoke.md',
        reportHtmlPath: '/tmp/reports/HARNESS-VHS-001/dashboard-smoke.html'
      };
    });

    await expect(
      runGitHubLinuxDashboardBenchmarkCli([], {
        repoRoot: '/tmp/vi-history-suite',
        runner,
        mkdir,
        writeFile,
        now: (() => {
          const values = [
            new Date('2026-04-04T18:00:00.000Z'),
            new Date('2026-04-04T18:10:00.000Z')
          ];
          return () => values.shift() ?? new Date('2026-04-04T18:10:00.000Z');
        })(),
        stdout: {
          write(text: string) {
            writes.push(text);
          }
        }
      })
    ).resolves.toBe('pass');

    expect(runner).toHaveBeenCalledWith(
      'HARNESS-VHS-001',
      expect.objectContaining({
        cloneRoot: '/tmp/vi-history-suite/.cache/harnesses',
        reportRoot: '/tmp/vi-history-suite/.cache/harness-reports',
        strictRsrcHeader: false,
        runtimePlatform: 'linux',
        runtimeEngineOverride: undefined,
        dashboardCommitWindow: 1000,
        reportProgress: expect.any(Function),
        runtimeSettings: {
          labviewCliPath: undefined,
          labviewExePath: undefined,
          lvComparePath: undefined
        }
      })
    );
    expect(mkdir).toHaveBeenCalledWith(
      '/tmp/vi-history-suite/.cache/github-experiments/linux-dashboard-benchmark/HARNESS-VHS-001',
      { recursive: true }
    );
    expect(writeFile).toHaveBeenCalledTimes(5);
    expect(writeFile.mock.calls[0]?.[0]).toContain('latest-progress.json');
    expect(writeFile.mock.calls[0]?.[1]).toContain('"phase": "starting"');
    expect(writeFile.mock.calls[1]?.[0]).toContain('latest-progress.json');
    expect(writeFile.mock.calls[1]?.[1]).toContain('"phase": "running"');
    expect(writeFile.mock.calls[4]?.[0]).toContain('latest-progress.json');
    expect(writeFile.mock.calls[4]?.[1]).toContain('"phase": "completed"');
    expect(writes.join('')).toContain(
      'VIHS_PROGRESS: Preparing the Linux benchmark workspace for HARNESS-VHS-001.'
    );
    expect(writes.join('')).toContain(
      'VIHS_PROGRESS: Preparing dashboard pair 7/137; est. 74m 17s left: Executing LabVIEW comparison runtime.'
    );
    expect(writes.join('')).toContain(
      'GitHub Linux dashboard benchmark completed for HARNESS-VHS-001'
    );
    expect(writes.join('')).toContain('Target: Tooling/deployment/VIP_Pre-Install Custom Action.vi');
    expect(writes.join('')).toContain('Completion: completed (comparable-to-windows-baseline)');
    expect(writes.join('')).toContain('Pair outcomes: generated=18 blocked=1 failed=1 no-generated=0');
  });

  it('retains a failed progress receipt and partial summary when the benchmark stops on a runtime failure', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const runner = vi.fn().mockResolvedValue({
      report: {
        harnessId: 'HARNESS-VHS-002',
        repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        cloneDirectory: '/tmp/harness',
        targetRelativePath: 'resource/plugins/lv_icon.vi',
        head: 'abcdef1234567890',
        generatedAt: '2026-04-04T18:00:00.000Z',
        eligible: true,
        signature: 'LVIN',
        dashboardCommitWindow: 139,
        comparePairCount: 138,
        dashboardFilePath: '/tmp/dashboard.html',
        dashboardJsonFilePath: '/tmp/dashboard.json',
        dashboardWindowCompletenessState: 'partial',
        dashboardArchivedPairCount: 1,
        dashboardMissingPairCount: 137,
        dashboardGeneratedReportCount: 0,
        dashboardMetadataPairCount: 1,
        dashboardOverviewImageCount: 0,
        dashboardDetailItemCount: 1,
        dashboardProviderSummaries: [],
        dashboardEtaAccuracyFilePath: undefined,
        dashboardEtaAccuracyRecord: undefined,
        completionState: 'failed',
        processedPairCount: 1,
        terminalPairIndex: 1,
        terminalPairFailureReason: 'command-timed-out',
        comparabilityState: 'characterization-only',
        pairSummaries: [
          {
            pairIndex: 1,
            selectedHash: 'aaaa',
            baseHash: 'bbbb',
            reportStatus: 'ready-for-runtime',
            runtimeExecutionState: 'failed',
            runtimeProvider: 'host-native',
            runtimeEngine: 'lvcompare',
            runtimeFailureReason: 'command-timed-out',
            runtimeDiagnosticReason: undefined,
            generatedReportExists: false,
            packetFilePath: '/tmp/packet-1.json',
            reportFilePath: '/tmp/report-1.html',
            metadataFilePath: '/tmp/metadata-1.json',
            runtimeStdoutPath: '/tmp/runtime-stdout-1.txt',
            runtimeStderrPath: '/tmp/runtime-stderr-1.txt',
            runtimeDiagnosticLogPath: undefined,
            runtimeProcessObservationPath: undefined,
            actualPreparationSeconds: 120
          }
        ]
      },
      reportJsonPath: '/tmp/reports/HARNESS-VHS-002/dashboard-smoke.json',
      reportMarkdownPath: '/tmp/reports/HARNESS-VHS-002/dashboard-smoke.md',
      reportHtmlPath: '/tmp/reports/HARNESS-VHS-002/dashboard-smoke.html'
    });
    const writes: string[] = [];

    await expect(
      runGitHubLinuxDashboardBenchmarkCli([], {
        repoRoot: '/tmp/vi-history-suite',
        runner,
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile,
        pathExists: vi.fn().mockResolvedValue(false),
        now: () => new Date('2026-04-04T18:00:00.000Z'),
        stdout: {
          write(text: string) {
            writes.push(text);
          }
        }
      })
    ).rejects.toThrow('Linux benchmark failed at pair 1/138: command-timed-out.');

    expect(writeFile).toHaveBeenCalledTimes(5);
    const writtenPaths = writeFile.mock.calls.map((call) => String(call[0]));
    const writtenBodies = writeFile.mock.calls.map((call) => String(call[1]));
    expect(writtenPaths[0]).toContain('latest-progress.json');
    expect(writtenBodies[0]).toContain('"phase": "starting"');
    expect(writtenPaths.some((value) => value.endsWith('pair-failure-pair-0001.json'))).toBe(true);
    expect(writtenPaths.some((value) => value.endsWith('latest-summary.json'))).toBe(true);
    expect(writtenPaths.some((value) => /HARNESS-VHS-001\/2026-04-04-180000000\.json$/.test(value))).toBe(true);
    expect(
      writtenBodies.some((value) => value.includes('"completionState": "failed"'))
    ).toBe(true);
    expect(
      writtenBodies.some(
        (value) =>
          value.includes('"phase": "failed"') &&
          value.includes('Linux benchmark failed at pair 1/138: command-timed-out.')
      )
    ).toBe(true);
    expect(writes.join('')).toContain(
      'VIHS_PROGRESS: Preparing the Linux benchmark workspace for HARNESS-VHS-001.'
    );
    expect(writes.join('')).toContain(
      'VIHS_PROGRESS: Linux benchmark failed at pair 1/138: command-timed-out.'
    );
  });

  it('formats a stable summary packet, help, and main-module execution', async () => {
    const previousImageRef = process.env.VIHS_GITHUB_BENCHMARK_IMAGE_REF;
    const previousImageDigest = process.env.VIHS_GITHUB_BENCHMARK_IMAGE_DIGEST;
    const previousHeadlessProvider = process.env.VIHS_GITHUB_BENCHMARK_HEADLESS_DISPLAY_PROVIDER;
    process.env.VIHS_GITHUB_BENCHMARK_IMAGE_REF =
      'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/linux-dashboard-benchmark';
    process.env.VIHS_GITHUB_BENCHMARK_IMAGE_DIGEST = 'sha256:abc123';
    process.env.VIHS_GITHUB_BENCHMARK_HEADLESS_DISPLAY_PROVIDER = 'xvfb-run';

    try {
      const summary = buildGitHubLinuxDashboardBenchmarkSummary(
        {
          report: {
            harnessId: 'HARNESS-VHS-002',
            repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
            cloneDirectory: '/tmp/harness',
            targetRelativePath: 'resource/plugins/lv_icon.vi',
            head: 'abcdef1234567890',
            generatedAt: '2026-04-04T18:00:00.000Z',
            eligible: true,
            signature: 'LVIN',
            dashboardCommitWindow: 139,
            comparePairCount: 138,
            dashboardFilePath: '/tmp/dashboard.html',
            dashboardJsonFilePath: '/tmp/dashboard.json',
            dashboardWindowCompletenessState: 'complete',
            dashboardArchivedPairCount: 138,
            dashboardMissingPairCount: 0,
            dashboardGeneratedReportCount: 138,
            dashboardMetadataPairCount: 138,
            dashboardOverviewImageCount: 276,
            dashboardDetailItemCount: 552,
            dashboardProviderSummaries: [],
            dashboardEtaAccuracyFilePath: undefined,
            dashboardEtaAccuracyRecord: undefined,
            pairSummaries: [
              {
                selectedHash: 'aaaa',
                baseHash: 'bbbb',
                reportStatus: 'ready-for-runtime',
                runtimeExecutionState: 'succeeded',
                runtimeProvider: 'host-native',
                runtimeEngine: 'lvcompare',
                generatedReportExists: true,
                packetFilePath: '/tmp/packet.json',
                reportFilePath: '/tmp/report.html',
                metadataFilePath: '/tmp/metadata.json',
                actualPreparationSeconds: 12
              }
            ]
          },
          reportJsonPath: '/tmp/reports/HARNESS-VHS-002/dashboard-smoke.json',
          reportMarkdownPath: '/tmp/reports/HARNESS-VHS-002/dashboard-smoke.md',
          reportHtmlPath: '/tmp/reports/HARNESS-VHS-002/dashboard-smoke.html'
        },
        {
          startedAt: new Date('2026-04-04T18:00:00.000Z'),
          completedAt: new Date('2026-04-04T18:00:12.000Z'),
          benchmarkRoot: '/tmp/github-experiments/HARNESS-VHS-002',
          runtimeImage: 'nationalinstruments/labview:2026q1-linux'
        }
      );

      expect(summary.wallClockSeconds).toBe(12);
      expect(summary.totalPairPreparationSeconds).toBe(12);
      expect(summary.providerCounts).toEqual({ 'host-native': 1 });
      expect(summary.benchmarkImage).toEqual({
        reference:
          'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/linux-dashboard-benchmark',
        digest: 'sha256:abc123'
      });
      expect(summary.headlessDisplayProvider).toBe('xvfb-run');
      expect(formatGitHubLinuxDashboardBenchmarkSuccess(summary).join('\n')).toContain(
        'Runtime image: nationalinstruments/labview:2026q1-linux'
      );
      expect(formatGitHubLinuxDashboardBenchmarkSuccess(summary).join('\n')).toContain(
        'Benchmark image: ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/linux-dashboard-benchmark@sha256:abc123'
      );
      expect(formatGitHubLinuxDashboardBenchmarkSuccess(summary).join('\n')).toContain(
        'Headless display: xvfb-run'
      );
    } finally {
      if (previousImageRef === undefined) {
        delete process.env.VIHS_GITHUB_BENCHMARK_IMAGE_REF;
      } else {
        process.env.VIHS_GITHUB_BENCHMARK_IMAGE_REF = previousImageRef;
      }
      if (previousImageDigest === undefined) {
        delete process.env.VIHS_GITHUB_BENCHMARK_IMAGE_DIGEST;
      } else {
        process.env.VIHS_GITHUB_BENCHMARK_IMAGE_DIGEST = previousImageDigest;
      }
      if (previousHeadlessProvider === undefined) {
        delete process.env.VIHS_GITHUB_BENCHMARK_HEADLESS_DISPLAY_PROVIDER;
      } else {
        process.env.VIHS_GITHUB_BENCHMARK_HEADLESS_DISPLAY_PROVIDER = previousHeadlessProvider;
      }
    }

    const helpWrites: string[] = [];
    await expect(
      runGitHubLinuxDashboardBenchmarkCli(['--help'], {
        stdout: {
          write(text: string) {
            helpWrites.push(text);
          }
        }
      })
    ).resolves.toBe('help');
    expect(helpWrites.join('')).toContain('Usage: runGitHubLinuxDashboardBenchmark');

    const stderrWrites: string[] = [];
    await expect(
      runGitHubLinuxDashboardBenchmarkCliMain(
        ['--weird'],
        {},
        { write(text: string) { stderrWrites.push(text); return true; } }
      )
    ).resolves.toBe(1);
    expect(stderrWrites.join('')).toContain('Unknown argument: --weird');

    const processLike: { exitCode?: number } = {};
    expect(applyGitHubLinuxDashboardBenchmarkCliExitCode(4, processLike)).toBe(4);
    expect(processLike.exitCode).toBe(4);

    const unrelatedMain = {} as NodeModule;
    const unrelatedCurrent = {} as NodeModule;
    expect(
      maybeRunGitHubLinuxDashboardBenchmarkCliAsMain(
        [],
        unrelatedMain,
        unrelatedCurrent,
        {},
        processLike
      )
    ).toBe(false);

    const sharedModule = {} as NodeModule;
    expect(
      maybeRunGitHubLinuxDashboardBenchmarkCliAsMain(
        ['--help'],
        sharedModule,
        sharedModule,
        {
          stdout: { write() {} }
        },
        processLike
      )
    ).toBe(true);
  });
});
