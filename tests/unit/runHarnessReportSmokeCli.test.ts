import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  applyHarnessReportSmokeCliExitCode,
  cleanupWindowsHostRuntimeSurface,
  formatHarnessReportSmokeSuccess,
  getHarnessReportSmokeUsage,
  maybeRunHarnessReportSmokeCliAsMain,
  parseHarnessReportSmokeArgs,
  runHarnessReportSmokeCli,
  runHarnessReportSmokeCliMain
} from '../../src/cli/runHarnessReportSmoke';

const WINDOWS_LABVIEW_CLI_PATH =
  'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe';
const WINDOWS_LABVIEW_EXE_PATH =
  'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
const WINDOWS_X64_LABVIEW_EXE_PATH =
  'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
const FULL_SELECTED_HASH = 'abcdef1234567890abcdef1234567890abcdef12';
const FULL_BASE_HASH = '1111111122222222333333334444444455555555';

describe('runHarnessReportSmokeCli', () => {
  it('parses deterministic proof-admission flags and help', () => {
    expect(parseHarnessReportSmokeArgs([])).toEqual({
      harnessId: 'HARNESS-VHS-001',
      strictRsrcHeader: false,
      helpRequested: false,
      selectedHash: undefined,
      baseHash: undefined,
      runtimeExecutionTimeoutMs: undefined,
      runtimePlatform: undefined,
      executionMode: undefined,
      bitness: undefined,
      labviewCliPath: undefined,
      labviewExePath: undefined
    });

    expect(
      parseHarnessReportSmokeArgs([
        '--harness-id',
        'HARNESS-VHS-001',
        '--strict-rsrc-header',
        '--selected-hash',
        FULL_SELECTED_HASH,
        '--base-hash',
        FULL_BASE_HASH,
        '--runtime-timeout-ms',
        '120000',
        '--platform',
        'win32',
        '--execution-mode',
        'host-only',
        '--bitness',
        'x86',
        '--labview-cli-path',
        WINDOWS_LABVIEW_CLI_PATH,
        '--labview-exe-path',
        WINDOWS_LABVIEW_EXE_PATH
      ])
    ).toEqual({
      harnessId: 'HARNESS-VHS-001',
      strictRsrcHeader: true,
      helpRequested: false,
      selectedHash: FULL_SELECTED_HASH,
      baseHash: FULL_BASE_HASH,
      runtimeExecutionTimeoutMs: 120000,
      runtimePlatform: 'win32',
      executionMode: 'host-only',
      bitness: 'x86',
      labviewCliPath: WINDOWS_LABVIEW_CLI_PATH,
      labviewExePath: WINDOWS_LABVIEW_EXE_PATH
    });

    expect(parseHarnessReportSmokeArgs(['--help'])).toEqual({
      harnessId: 'HARNESS-VHS-001',
      strictRsrcHeader: false,
      helpRequested: true,
      selectedHash: undefined,
      baseHash: undefined,
      runtimeExecutionTimeoutMs: undefined,
      runtimePlatform: undefined,
      executionMode: undefined,
      bitness: undefined,
      labviewCliPath: undefined,
      labviewExePath: undefined
    });

    expect(() => parseHarnessReportSmokeArgs(['--platform', 'weird'])).toThrow(
      /Unsupported value for --platform/
    );
    expect(() => parseHarnessReportSmokeArgs(['--execution-mode', 'weird'])).toThrow(
      /Unsupported value for --execution-mode/
    );
    expect(() => parseHarnessReportSmokeArgs(['--bitness', 'bad'])).toThrow(
      /Unsupported value for --bitness/
    );
    expect(() => parseHarnessReportSmokeArgs(['--runtime-timeout-ms', '0'])).toThrow(
      /Unsupported value for --runtime-timeout-ms/
    );
    expect(() => parseHarnessReportSmokeArgs(['--base-hash', '1111'])).toThrow(
      /--base-hash requires --selected-hash/
    );
    expect(() => parseHarnessReportSmokeArgs(['--selected-hash', '1111'])).toThrow(
      /--selected-hash must be a full 40-character git hash/
    );
    expect(
      () =>
        parseHarnessReportSmokeArgs([
          '--selected-hash',
          FULL_SELECTED_HASH
        ])
    ).toThrow(/--selected-hash requires --base-hash/);
    expect(
      () =>
        parseHarnessReportSmokeArgs([
          '--platform',
          'linux',
          '--bitness',
          'x86'
        ])
    ).toThrow(/--bitness is only supported with --platform win32/);
    expect(
      () =>
        parseHarnessReportSmokeArgs([
          '--execution-mode',
          'host-only'
        ])
    ).toThrow(/Canonical proof-admission overrides require --platform/);
    expect(
      () =>
        parseHarnessReportSmokeArgs([
          '--labview-cli-path',
          WINDOWS_LABVIEW_CLI_PATH
        ])
    ).toThrow(/Canonical proof-admission overrides require --platform/);
    expect(
      () =>
        parseHarnessReportSmokeArgs([
          '--platform',
          'win32',
          '--labview-cli-path',
          WINDOWS_LABVIEW_CLI_PATH
        ])
    ).toThrow(/require both --labview-cli-path and --labview-exe-path/);
    expect(
      () =>
        parseHarnessReportSmokeArgs([
          '--platform',
          'win32',
          '--labview-cli-path',
          WINDOWS_LABVIEW_CLI_PATH,
          '--labview-exe-path',
          WINDOWS_X64_LABVIEW_EXE_PATH
        ])
    ).not.toThrow();
    expect(
      () =>
        parseHarnessReportSmokeArgs([
          '--platform',
          'win32',
          '--bitness',
          'x86',
          '--labview-cli-path',
          WINDOWS_LABVIEW_CLI_PATH,
          '--labview-exe-path',
          WINDOWS_X64_LABVIEW_EXE_PATH
        ])
    ).toThrow(/does not match --bitness x86/);
    expect(
      () =>
        parseHarnessReportSmokeArgs([
          '--platform',
          'win32',
          '--labview-cli-path',
          'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.txt',
          '--labview-exe-path',
          WINDOWS_LABVIEW_EXE_PATH
        ])
    ).toThrow(/must point to LabVIEWCLI.exe/);
    expect(() => parseHarnessReportSmokeArgs(['--labview-cli-path'])).toThrow(
      /Missing value for --labview-cli-path/
    );
    expect(getHarnessReportSmokeUsage()).toContain('--selected-hash');
    expect(getHarnessReportSmokeUsage()).toContain('--execution-mode');
    expect(getHarnessReportSmokeUsage()).toContain('--labview-cli-path');
    expect(getHarnessReportSmokeUsage()).toContain('Canonical diagnosis rules:');
    expect(getHarnessReportSmokeUsage()).toContain('proof-admission provider override');
  });

  it('prints the deterministic report-smoke success summary and forwards proof-admission overrides', async () => {
    const writes: string[] = [];
    const cleanupWindowsHostRuntimeSurface = vi.fn().mockResolvedValue(undefined);
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
          '--selected-hash',
          FULL_SELECTED_HASH,
          '--base-hash',
          FULL_BASE_HASH,
          '--runtime-timeout-ms',
          '120000',
          '--execution-mode',
          'host-only',
          '--bitness',
          'x86',
          '--labview-cli-path',
          WINDOWS_LABVIEW_CLI_PATH,
          '--labview-exe-path',
          WINDOWS_LABVIEW_EXE_PATH
        ],
        {
          repoRoot: '/tmp/vi-history-suite',
          runner,
          cleanupWindowsHostRuntimeSurface,
          stdout: {
            write(text: string) {
              writes.push(text);
            }
          }
        }
      )
    ).resolves.toBe('pass');

    expect(runner).toHaveBeenCalledWith('HARNESS-VHS-001', {
      cloneRoot: path.resolve('/tmp/vi-history-suite', '.cache', 'harnesses'),
      reportRoot: path.resolve('/tmp/vi-history-suite', '.cache', 'harness-reports'),
      strictRsrcHeader: false,
      selectedHash: FULL_SELECTED_HASH,
      baseHash: FULL_BASE_HASH,
      runtimeExecutionTimeoutMs: 120000,
      runtimePlatform: 'win32',
      runtimeSettings: {
        executionMode: 'host-only',
        bitness: 'x86',
        labviewCliPath: WINDOWS_LABVIEW_CLI_PATH,
        labviewExePath: WINDOWS_LABVIEW_EXE_PATH
      }
    });
    expect(cleanupWindowsHostRuntimeSurface).toHaveBeenCalledTimes(2);
    expect(cleanupWindowsHostRuntimeSurface).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        runtimePlatform: 'win32',
        executionMode: 'host-only'
      })
    );
    expect(cleanupWindowsHostRuntimeSurface).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        runtimePlatform: 'win32',
        executionMode: 'host-only'
      })
    );
    expect(writes.join('')).toContain('Harness report smoke completed for HARNESS-VHS-001');
    expect(writes.join('')).toContain('Report status: blocked-runtime');
    expect(writes.join('')).toContain('Runtime execution: not-available');
  });

  it('still performs post-run Windows host cleanup when the governed runner fails', async () => {
    const cleanupWindowsHostRuntimeSurface = vi.fn().mockResolvedValue(undefined);
    const runner = vi.fn().mockRejectedValue(new Error('runner failed'));

    await expect(
      runHarnessReportSmokeCli(
        [
          '--platform',
          'win32',
          '--execution-mode',
          'host-only',
          '--selected-hash',
          FULL_SELECTED_HASH,
          '--base-hash',
          FULL_BASE_HASH,
          '--labview-cli-path',
          WINDOWS_LABVIEW_CLI_PATH,
          '--labview-exe-path',
          WINDOWS_X64_LABVIEW_EXE_PATH
        ],
        {
          repoRoot: '/tmp/vi-history-suite',
          runner,
          cleanupWindowsHostRuntimeSurface
        }
      )
    ).rejects.toThrow('runner failed');

    expect(cleanupWindowsHostRuntimeSurface).toHaveBeenCalledTimes(2);
  });

  it('skips Windows host cleanup for docker-only proof runs', async () => {
    const cleanupWindowsHostRuntimeSurface = vi.fn().mockResolvedValue(undefined);
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
          '--execution-mode',
          'docker-only',
          '--selected-hash',
          FULL_SELECTED_HASH,
          '--base-hash',
          FULL_BASE_HASH
        ],
        {
          repoRoot: '/tmp/vi-history-suite',
          runner,
          cleanupWindowsHostRuntimeSurface,
          stdout: { write() {} }
        }
      )
    ).resolves.toBe('pass');

    expect(cleanupWindowsHostRuntimeSurface).not.toHaveBeenCalled();
  });

  it('fails closed on missing explicit runtime paths on the canonical Windows host', async () => {
    const runner = vi.fn();

    await expect(
      runHarnessReportSmokeCli(
        [
          '--platform',
          'win32',
          '--selected-hash',
          FULL_SELECTED_HASH,
          '--base-hash',
          FULL_BASE_HASH,
          '--bitness',
          'x64',
          '--labview-cli-path',
          'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
          '--labview-exe-path',
          WINDOWS_X64_LABVIEW_EXE_PATH
        ],
        {
          hostPlatform: 'win32',
          pathExists: (vi.fn(async (candidatePath: string) =>
            candidatePath !== 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
          ) as never),
          runner
        }
      )
    ).rejects.toThrow(/--labview-cli-path does not exist on the canonical Windows host/);

    expect(runner).not.toHaveBeenCalled();
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

  it('fails closed when Windows host runtime cleanup fails before proof execution', async () => {
    const cleanupWindowsHostRuntimeSurface = vi
      .fn()
      .mockRejectedValue(new Error('cleanup failed'));
    const runner = vi.fn();

    await expect(
      runHarnessReportSmokeCli(
        [
          '--platform',
          'win32',
          '--execution-mode',
          'host-only',
          '--selected-hash',
          FULL_SELECTED_HASH,
          '--base-hash',
          FULL_BASE_HASH,
          '--labview-cli-path',
          WINDOWS_LABVIEW_CLI_PATH,
          '--labview-exe-path',
          WINDOWS_X64_LABVIEW_EXE_PATH
        ],
        {
          repoRoot: '/tmp/vi-history-suite',
          runner,
          cleanupWindowsHostRuntimeSurface
        }
      )
    ).rejects.toThrow('cleanup failed');

    expect(runner).not.toHaveBeenCalled();
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

  it('applies the retained report-smoke exit code and rejects direct legacy main execution', () => {
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
        {},
        processLike,
        stderr
      )
    ).toBe(true);
    expect(processLike.exitCode).toBe(1);
    expect(stderrWrites.join('')).toContain('single public proof entrypoint');
    expect(stderrWrites.join('')).toContain('npm run proof:run -- report-smoke');
  });
});
