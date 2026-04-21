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

const WINDOWS_LABVIEW_CLI_PATH =
  'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe';
const WINDOWS_LABVIEW_EXE_PATH =
  'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
const WINDOWS_REPO_ROOT = 'D:\\tmp\\vi-history-suite';

describe('runHarnessDashboardSmokeCli', () => {
  it('parses deterministic dashboard smoke args', () => {
    expect(parseHarnessDashboardSmokeArgs([])).toEqual({
      harnessId: 'HARNESS-VHS-001',
      strictRsrcHeader: false,
      helpRequested: false,
      runtimePlatform: undefined,
      bitness: undefined,
      labviewCliPath: undefined,
      labviewExePath: undefined,
      dashboardCommitWindow: undefined
    });

    expect(
      parseHarnessDashboardSmokeArgs([
        '--harness-id',
        'HARNESS-VHS-999',
        '--strict-rsrc-header',
        '--platform',
        'win32',
        '--bitness',
        'x86',
        '--labview-cli-path',
        WINDOWS_LABVIEW_CLI_PATH,
        '--labview-exe-path',
        WINDOWS_LABVIEW_EXE_PATH,
        '--dashboard-commit-window',
        '4'
      ])
    ).toEqual({
      harnessId: 'HARNESS-VHS-999',
      strictRsrcHeader: true,
      helpRequested: false,
      runtimePlatform: 'win32',
      bitness: 'x86',
      labviewCliPath: WINDOWS_LABVIEW_CLI_PATH,
      labviewExePath: WINDOWS_LABVIEW_EXE_PATH,
      dashboardCommitWindow: 4
    });

    expect(() => parseHarnessDashboardSmokeArgs(['--dashboard-commit-window', '2'])).toThrow(
      /Unsupported value for --dashboard-commit-window/
    );
    expect(() => parseHarnessDashboardSmokeArgs(['--platform', 'weird'])).toThrow(
      /Unsupported value for --platform/
    );
    expect(() => parseHarnessDashboardSmokeArgs(['--bitness', 'bad'])).toThrow(
      /Unsupported value for --bitness/
    );
    expect(() => parseHarnessDashboardSmokeArgs(['--labview-cli-path'])).toThrow(
      /Missing value for --labview-cli-path/
    );
    expect(() => parseHarnessDashboardSmokeArgs(['--labview-exe-path'])).toThrow(
      /Missing value for --labview-exe-path/
    );
    expect(() =>
      parseHarnessDashboardSmokeArgs([
        '--platform',
        'win32',
        '--labview-exe-path',
        WINDOWS_LABVIEW_EXE_PATH
      ])
    ).toThrow(/Canonical CreateComparisonReport proof-admission overrides require both --labview-cli-path and --labview-exe-path/);
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
        dashboardEtaAccuracyFilePath:
          '/tmp/reports/HARNESS-VHS-001/workspace-storage/dashboards/repo/file/window/dashboard-pair-eta-accuracy.json',
        dashboardEtaAccuracyRecord: {
          recordedAt: '2026-04-03T00:00:00.000Z',
          stage: 'pair-preparation',
          preparedPairCount: 2,
          etaEligiblePairCount: 2,
          measuredPairCount: 1,
          unmeasuredPairCount: 1,
          excludedPairCount: 0,
          meanAbsoluteErrorSeconds: 6,
          maxAbsoluteErrorSeconds: 6,
          meanSignedErrorSeconds: 6,
          meanAbsolutePercentageError: 33.333,
          samples: []
        },
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
          WINDOWS_LABVIEW_CLI_PATH,
          '--labview-exe-path',
          WINDOWS_LABVIEW_EXE_PATH
        ],
        {
          repoRoot: WINDOWS_REPO_ROOT,
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
      cloneRoot: 'D:\\tmp\\vi-history-suite\\.cache\\harnesses',
      reportRoot: 'D:\\tmp\\vi-history-suite\\.cache\\harness-reports',
      strictRsrcHeader: false,
      runtimePlatform: 'win32',
      dashboardCommitWindow: 4,
      runtimeSettings: {
        bitness: undefined,
        labviewCliPath: WINDOWS_LABVIEW_CLI_PATH,
        labviewExePath: WINDOWS_LABVIEW_EXE_PATH
      }
    });
    expect(writes.join('')).toContain('Harness dashboard smoke completed for HARNESS-VHS-001');
    expect(writes.join('')).toContain('Dashboard completeness: complete');
    expect(writes.join('')).toContain('Dashboard metadata pairs: 2');
    expect(writes.join('')).toContain('Dashboard ETA accuracy: measured=1/2');
  });

  it('fails closed on missing explicit runtime paths on the canonical Windows host', async () => {
    const runner = vi.fn();

    await expect(
      runHarnessDashboardSmokeCli(
        [
          '--platform',
          'win32',
          '--labview-cli-path',
          WINDOWS_LABVIEW_CLI_PATH,
          '--labview-exe-path',
          WINDOWS_LABVIEW_EXE_PATH
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

  it('supports help, exit codes, and rejects direct legacy main execution', async () => {
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
      maybeRunHarnessDashboardSmokeCliAsMain(
        [],
        unrelatedMain,
        unrelatedCurrent,
        {},
        processLike,
        { write(text: string) { stderrWrites.push(text); return true; } }
      )
    ).toBe(false);

    const sharedModule = {} as NodeModule;
    expect(
      maybeRunHarnessDashboardSmokeCliAsMain(
        [],
        sharedModule,
        sharedModule,
        {},
        processLike,
        { write(text: string) { stderrWrites.push(text); return true; } }
      )
    ).toBe(true);
    expect(processLike.exitCode).toBe(1);
    expect(stderrWrites.join('')).toContain('single public proof entrypoint');
    expect(stderrWrites.join('')).toContain('npm run proof:run -- dashboard-smoke');
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
            dashboardEtaAccuracyFilePath: undefined,
            dashboardEtaAccuracyRecord: undefined,
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
      'Dashboard metadata pairs: 2',
      'Dashboard ETA accuracy: not-retained'
    ]);
  });
});
