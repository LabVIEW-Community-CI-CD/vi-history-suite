import { describe, expect, it, vi } from 'vitest';

import {
  applyHarnessDashboardSmokeCliExitCode,
  formatHarnessDashboardSmokeSuccess,
  getHarnessDashboardSmokeUsage,
  maybeRunHarnessDashboardSmokeCliAsMain,
  parseHarnessDashboardSmokeArgs,
  runHarnessDashboardSmokeCli,
  runHarnessDashboardSmokeCliMain
} from '../../src/cli/runHarnessDashboardSmoke';

describe('runHarnessDashboardSmokeCli', () => {
  it('parses deterministic dashboard smoke args', () => {
    expect(parseHarnessDashboardSmokeArgs([])).toEqual({
      harnessId: 'HARNESS-VHS-001',
      strictRsrcHeader: false,
      helpRequested: false,
      runtimePlatform: undefined,
      runtimeEngineOverride: undefined,
      preferBitness: undefined,
      labviewCliPath: undefined,
      labviewExePath: undefined,
      lvComparePath: undefined,
      dashboardCommitWindow: undefined
    });

    expect(
      parseHarnessDashboardSmokeArgs([
        '--harness-id',
        'HARNESS-VHS-999',
        '--strict-rsrc-header',
        '--platform',
        'win32',
        '--engine',
        'lvcompare',
        '--prefer-bitness',
        'x64',
        '--labview-exe-path',
        'C:\\LabVIEW.exe',
        '--lvcompare-path',
        'C:\\LVCompare.exe',
        '--dashboard-commit-window',
        '4'
      ])
    ).toEqual({
      harnessId: 'HARNESS-VHS-999',
      strictRsrcHeader: true,
      helpRequested: false,
      runtimePlatform: 'win32',
      runtimeEngineOverride: 'lvcompare',
      preferBitness: 'x64',
      labviewCliPath: undefined,
      labviewExePath: 'C:\\LabVIEW.exe',
      lvComparePath: 'C:\\LVCompare.exe',
      dashboardCommitWindow: 4
    });

    expect(() => parseHarnessDashboardSmokeArgs(['--dashboard-commit-window', '2'])).toThrow(
      /Unsupported value for --dashboard-commit-window/
    );
    expect(() => parseHarnessDashboardSmokeArgs(['--platform', 'weird'])).toThrow(
      /Unsupported value for --platform/
    );
    expect(() => parseHarnessDashboardSmokeArgs(['--engine', 'weird'])).toThrow(
      /Unsupported value for --engine/
    );
    expect(() => parseHarnessDashboardSmokeArgs(['--prefer-bitness', 'bad'])).toThrow(
      /Unsupported value for --prefer-bitness/
    );
    expect(() => parseHarnessDashboardSmokeArgs(['--labview-cli-path'])).toThrow(
      /Missing value for --labview-cli-path/
    );
    expect(() => parseHarnessDashboardSmokeArgs(['--labview-exe-path'])).toThrow(
      /Missing value for --labview-exe-path/
    );
    expect(() => parseHarnessDashboardSmokeArgs(['--lvcompare-path'])).toThrow(
      /Missing value for --lvcompare-path/
    );
    expect(getHarnessDashboardSmokeUsage()).toContain('--dashboard-commit-window');
  });

  it('prints the deterministic dashboard smoke success summary', async () => {
    const writes: string[] = [];
    const runner = vi.fn().mockResolvedValue({
      report: {
        harnessId: 'HARNESS-VHS-001',
        repositoryUrl: 'https://github.com/ni/labview-icon-editor',
        cloneDirectory: '/tmp/harness',
        targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        head: 'abcdef1234567890',
        generatedAt: '2026-04-03T00:00:00.000Z',
        eligible: true,
        signature: 'LVIN',
        dashboardCommitWindow: 3,
        comparePairCount: 2,
        dashboardFilePath: '/tmp/dashboard.html',
        dashboardJsonFilePath: '/tmp/dashboard.json',
        dashboardWindowCompletenessState: 'complete',
        dashboardArchivedPairCount: 2,
        dashboardMissingPairCount: 0,
        dashboardGeneratedReportCount: 2,
        dashboardMetadataPairCount: 2,
        dashboardOverviewImageCount: 4,
        dashboardDetailItemCount: 8,
        dashboardProviderSummaries: [],
        pairSummaries: []
      },
      reportJsonPath: '/tmp/reports/HARNESS-VHS-001/dashboard-smoke.json',
      reportMarkdownPath: '/tmp/reports/HARNESS-VHS-001/dashboard-smoke.md',
      reportHtmlPath: '/tmp/reports/HARNESS-VHS-001/dashboard-smoke.html'
    });

    await expect(
      runHarnessDashboardSmokeCli(
        [
          '--platform',
          'win32',
          '--dashboard-commit-window',
          '4',
          '--labview-cli-path',
          'C:\\LabVIEWCLI.exe',
          '--labview-exe-path',
          'C:\\LabVIEW.exe',
          '--lvcompare-path',
          'C:\\LVCompare.exe'
        ],
        {
          repoRoot: '/tmp/vi-history-suite',
          runner,
          stdout: {
            write(text: string) {
              writes.push(text);
            }
          }
        }
      )
    ).resolves.toBe('pass');

    expect(runner).toHaveBeenCalledWith('HARNESS-VHS-001', {
      cloneRoot: '/tmp/vi-history-suite/.cache/harnesses',
      reportRoot: '/tmp/vi-history-suite/.cache/harness-reports',
      strictRsrcHeader: false,
      runtimePlatform: 'win32',
      runtimeEngineOverride: undefined,
      dashboardCommitWindow: 4,
      runtimeSettings: {
        preferBitness: undefined,
        labviewCliPath: 'C:\\LabVIEWCLI.exe',
        labviewExePath: 'C:\\LabVIEW.exe',
        lvComparePath: 'C:\\LVCompare.exe'
      }
    });
    expect(writes.join('')).toContain('Harness dashboard smoke completed for HARNESS-VHS-001');
    expect(writes.join('')).toContain('Dashboard completeness: complete');
    expect(writes.join('')).toContain('Dashboard metadata pairs: 2');
  });

  it('supports help, exit codes, and main-module execution', async () => {
    const writes: string[] = [];
    const stderrWrites: string[] = [];
    const processLike: { exitCode?: number } = {};

    await expect(
      runHarnessDashboardSmokeCli(['--help'], {
        stdout: { write(text: string) { writes.push(text); } }
      })
    ).resolves.toBe('help');
    expect(writes.join('')).toContain('Usage: runHarnessDashboardSmoke');

    await expect(
      runHarnessDashboardSmokeCliMain(
        ['--unknown-flag'],
        {},
        { write(text: string) { stderrWrites.push(text); return true; } }
      )
    ).resolves.toBe(1);
    expect(stderrWrites).toEqual([expect.stringContaining('Unknown argument: --unknown-flag')]);

    expect(applyHarnessDashboardSmokeCliExitCode(3, processLike)).toBe(3);
    expect(processLike.exitCode).toBe(3);

    const unrelatedMain = {} as NodeModule;
    const unrelatedCurrent = {} as NodeModule;
    expect(
      maybeRunHarnessDashboardSmokeCliAsMain([], unrelatedMain, unrelatedCurrent, {}, processLike)
    ).toBe(false);

    const sharedModule = {} as NodeModule;
    expect(
      maybeRunHarnessDashboardSmokeCliAsMain(
        [],
        sharedModule,
        sharedModule,
        {
          repoRoot: '/tmp/vi-history-suite',
          runner: async () => ({
            report: {
              harnessId: 'HARNESS-VHS-001',
              repositoryUrl: 'https://github.com/ni/labview-icon-editor',
              cloneDirectory: '/tmp/harness',
              targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
              head: 'abcdef1234567890',
              generatedAt: '2026-04-03T00:00:00.000Z',
              eligible: true,
              signature: 'LVIN',
              dashboardCommitWindow: 3,
              comparePairCount: 2,
              dashboardFilePath: '/tmp/dashboard.html',
              dashboardJsonFilePath: '/tmp/dashboard.json',
              dashboardWindowCompletenessState: 'complete',
              dashboardArchivedPairCount: 2,
              dashboardMissingPairCount: 0,
              dashboardGeneratedReportCount: 2,
              dashboardMetadataPairCount: 2,
              dashboardOverviewImageCount: 4,
              dashboardDetailItemCount: 8,
              dashboardProviderSummaries: [],
              pairSummaries: []
            },
            reportJsonPath: '/tmp/reports/HARNESS-VHS-001/dashboard-smoke.json',
            reportMarkdownPath: '/tmp/reports/HARNESS-VHS-001/dashboard-smoke.md',
            reportHtmlPath: '/tmp/reports/HARNESS-VHS-001/dashboard-smoke.html'
          }),
          stdout: { write() {} }
        },
        processLike
      )
    ).toBe(true);

    await new Promise((resolve) => setImmediate(resolve));
    expect(processLike.exitCode).toBe(0);
  });

  it('formats the dashboard smoke success output in a stable order', () => {
    expect(
      formatHarnessDashboardSmokeSuccess(
        {
          report: {
            harnessId: 'HARNESS-VHS-001',
            repositoryUrl: 'https://github.com/ni/labview-icon-editor',
            cloneDirectory: '/tmp/harness',
            targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            head: 'abcdef1234567890',
            generatedAt: '2026-04-03T00:00:00.000Z',
            eligible: true,
            signature: 'LVIN',
            dashboardCommitWindow: 3,
            comparePairCount: 2,
            dashboardFilePath: '/tmp/dashboard.html',
            dashboardJsonFilePath: '/tmp/dashboard.json',
            dashboardWindowCompletenessState: 'complete',
            dashboardArchivedPairCount: 2,
            dashboardMissingPairCount: 0,
            dashboardGeneratedReportCount: 2,
            dashboardMetadataPairCount: 2,
            dashboardOverviewImageCount: 4,
            dashboardDetailItemCount: 8,
            dashboardProviderSummaries: [],
            pairSummaries: []
          },
          reportJsonPath: '/tmp/reports/HARNESS-VHS-001/dashboard-smoke.json',
          reportMarkdownPath: '/tmp/reports/HARNESS-VHS-001/dashboard-smoke.md',
          reportHtmlPath: '/tmp/reports/HARNESS-VHS-001/dashboard-smoke.html'
        },
        'HARNESS-VHS-001'
      )
    ).toEqual([
      'Harness dashboard smoke completed for HARNESS-VHS-001',
      'JSON: /tmp/reports/HARNESS-VHS-001/dashboard-smoke.json',
      'Markdown: /tmp/reports/HARNESS-VHS-001/dashboard-smoke.md',
      'HTML: /tmp/reports/HARNESS-VHS-001/dashboard-smoke.html',
      'Dashboard completeness: complete',
      'Dashboard archived pairs: 2',
      'Dashboard metadata pairs: 2'
    ]);
  });
});
