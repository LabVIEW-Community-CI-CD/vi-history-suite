import { describe, expect, it, vi } from 'vitest';

import {
  applyHarnessReportSmokeCliExitCode,
  formatHarnessReportSmokeSuccess,
  getHarnessReportSmokeUsage,
  maybeRunHarnessReportSmokeCliAsMain,
  parseHarnessReportSmokeArgs,
  runHarnessReportSmokeCli,
  runHarnessReportSmokeCliMain
} from '../../src/cli/runHarnessReportSmoke';

describe('runHarnessReportSmokeCli', () => {
  it('parses deterministic runtime override flags and help', () => {
    expect(parseHarnessReportSmokeArgs([])).toEqual({
      harnessId: 'HARNESS-VHS-001',
      strictRsrcHeader: false,
      helpRequested: false,
      runtimePlatform: undefined,
      preferBitness: undefined,
      labviewCliPath: undefined,
      labviewExePath: undefined,
      lvComparePath: undefined
    });

    expect(
      parseHarnessReportSmokeArgs([
        '--harness-id',
        'HARNESS-VHS-001',
        '--strict-rsrc-header',
        '--platform',
        'win32',
        '--prefer-bitness',
        'x86',
        '--labview-cli-path',
        'C:\\LabVIEWCLI.exe',
        '--labview-exe-path',
        'C:\\LabVIEW.exe',
        '--lvcompare-path',
        'C:\\LVCompare.exe'
      ])
    ).toEqual({
      harnessId: 'HARNESS-VHS-001',
      strictRsrcHeader: true,
      helpRequested: false,
      runtimePlatform: 'win32',
      preferBitness: 'x86',
      labviewCliPath: 'C:\\LabVIEWCLI.exe',
      labviewExePath: 'C:\\LabVIEW.exe',
      lvComparePath: 'C:\\LVCompare.exe'
    });

    expect(parseHarnessReportSmokeArgs(['--help'])).toEqual({
      harnessId: 'HARNESS-VHS-001',
      strictRsrcHeader: false,
      helpRequested: true,
      runtimePlatform: undefined,
      preferBitness: undefined,
      labviewCliPath: undefined,
      labviewExePath: undefined,
      lvComparePath: undefined
    });

    expect(() => parseHarnessReportSmokeArgs(['--platform', 'weird'])).toThrow(
      /Unsupported value for --platform/
    );
    expect(() => parseHarnessReportSmokeArgs(['--prefer-bitness', 'bad'])).toThrow(
      /Unsupported value for --prefer-bitness/
    );
    expect(() => parseHarnessReportSmokeArgs(['--labview-cli-path'])).toThrow(
      /Missing value for --labview-cli-path/
    );
    expect(getHarnessReportSmokeUsage()).toContain('--labview-cli-path');
  });

  it('prints the deterministic report-smoke success summary and forwards runtime overrides', async () => {
    const writes: string[] = [];
    const runner = vi.fn().mockResolvedValue({
      report: {
        harnessId: 'HARNESS-VHS-001',
        repositoryUrl: 'https://github.com/ni/labview-icon-editor',
        cloneDirectory: '/tmp/harness',
        targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        head: 'abcdef1234567890',
        generatedAt: '2026-04-03T00:00:00.000Z',
        selectedHash: 'abcdef1234567890',
        baseHash: '1111111122222222',
        comparePairAvailable: true,
        eligible: true,
        signature: 'LVIN',
        reportStatus: 'blocked-runtime',
        runtimeExecutionState: 'not-available',
        runtimeProvider: 'unavailable',
        runtimeBlockedReason: 'comparison-tool-not-found',
        generatedReportExists: false
      },
      reportJsonPath: '/tmp/reports/HARNESS-VHS-001/comparison-report-smoke.json',
      reportMarkdownPath: '/tmp/reports/HARNESS-VHS-001/comparison-report-smoke.md',
      reportHtmlPath: '/tmp/reports/HARNESS-VHS-001/comparison-report-smoke.html'
    });

    await expect(
      runHarnessReportSmokeCli(
        [
          '--platform',
          'win32',
          '--prefer-bitness',
          'x64',
          '--labview-cli-path',
          'C:\\LabVIEWCLI.exe'
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
      runtimeSettings: {
        preferBitness: 'x64',
        labviewCliPath: 'C:\\LabVIEWCLI.exe',
        labviewExePath: undefined,
        lvComparePath: undefined
      }
    });
    expect(writes.join('')).toContain('Harness report smoke completed for HARNESS-VHS-001');
    expect(writes.join('')).toContain('Report status: blocked-runtime');
    expect(writes.join('')).toContain('Runtime execution: not-available');
  });

  it('supports help and process-style exit codes', async () => {
    const writes: string[] = [];
    const stderrWrites: string[] = [];
    const runner = vi.fn();

    await expect(
      runHarnessReportSmokeCli(['--help'], {
        runner,
        stdout: {
          write(text: string) {
            writes.push(text);
          }
        }
      })
    ).resolves.toBe('help');
    expect(runner).not.toHaveBeenCalled();
    expect(writes.join('')).toContain('Usage: runHarnessReportSmoke');

    await expect(
      runHarnessReportSmokeCliMain(
        ['--unknown-flag'],
        { stdout: { write() {} } },
        {
          write(text: string) {
            stderrWrites.push(text);
            return true;
          }
        }
      )
    ).resolves.toBe(1);
    expect(stderrWrites).toEqual([expect.stringContaining('Unknown argument: --unknown-flag')]);
  });

  it('formats the report-smoke success output in a stable order', () => {
    expect(
      formatHarnessReportSmokeSuccess(
        {
          report: {
            harnessId: 'HARNESS-VHS-001',
            repositoryUrl: 'https://github.com/ni/labview-icon-editor',
            cloneDirectory: '/tmp/harness',
            targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            head: 'abcdef1234567890',
            generatedAt: '2026-04-03T00:00:00.000Z',
            selectedHash: 'abcdef1234567890',
            baseHash: '1111111122222222',
            comparePairAvailable: true,
            eligible: true,
            signature: 'LVIN',
            reportStatus: 'ready-for-runtime',
            runtimeExecutionState: 'succeeded',
            runtimeProvider: 'host-native',
            runtimeEngine: 'labview-cli',
            generatedReportExists: true
          },
          reportJsonPath: '/tmp/reports/HARNESS-VHS-001/comparison-report-smoke.json',
          reportMarkdownPath: '/tmp/reports/HARNESS-VHS-001/comparison-report-smoke.md',
          reportHtmlPath: '/tmp/reports/HARNESS-VHS-001/comparison-report-smoke.html'
        },
        'HARNESS-VHS-001'
      )
    ).toEqual([
      'Harness report smoke completed for HARNESS-VHS-001',
      'JSON: /tmp/reports/HARNESS-VHS-001/comparison-report-smoke.json',
      'Markdown: /tmp/reports/HARNESS-VHS-001/comparison-report-smoke.md',
      'HTML: /tmp/reports/HARNESS-VHS-001/comparison-report-smoke.html',
      'Report status: ready-for-runtime',
      'Runtime execution: succeeded',
      'Generated report exists: yes'
    ]);
  });

  it('applies the retained report-smoke exit code and main-module branch', async () => {
    const processLike: { exitCode?: number } = {};
    expect(applyHarnessReportSmokeCliExitCode(4, processLike)).toBe(4);
    expect(processLike.exitCode).toBe(4);

    const stderrWrites: string[] = [];
    const stderr = {
      write(text: string) {
        stderrWrites.push(text);
        return true;
      }
    };
    const unrelatedMain = {} as NodeModule;
    const unrelatedCurrent = {} as NodeModule;
    expect(
      maybeRunHarnessReportSmokeCliAsMain([], unrelatedMain, unrelatedCurrent, {}, processLike, stderr)
    ).toBe(false);

    const sharedModule = {} as NodeModule;
    expect(
      maybeRunHarnessReportSmokeCliAsMain(
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
              selectedHash: 'abcdef1234567890',
              baseHash: '1111111122222222',
              comparePairAvailable: true,
              eligible: true,
              signature: 'LVIN',
              reportStatus: 'ready-for-runtime',
              runtimeExecutionState: 'succeeded',
              runtimeProvider: 'host-native',
              runtimeEngine: 'labview-cli',
              generatedReportExists: true
            },
            reportJsonPath: '/tmp/reports/HARNESS-VHS-001/comparison-report-smoke.json',
            reportMarkdownPath: '/tmp/reports/HARNESS-VHS-001/comparison-report-smoke.md',
            reportHtmlPath: '/tmp/reports/HARNESS-VHS-001/comparison-report-smoke.html'
          }),
          stdout: { write() {} }
        },
        processLike,
        stderr
      )
    ).toBe(true);

    await new Promise((resolve) => setImmediate(resolve));
    expect(processLike.exitCode).toBe(0);
    expect(stderrWrites).toEqual([]);
  });
});
