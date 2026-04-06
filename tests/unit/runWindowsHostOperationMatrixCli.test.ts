import { describe, expect, it, vi } from 'vitest';

import {
  buildWindowsHostOperationMatrixCases,
  getWindowsHostOperationMatrixUsage,
  parseWindowsHostOperationMatrixArgs,
  runWindowsHostOperationMatrixCli
} from '../../src/cli/runWindowsHostOperationMatrix';

describe('runWindowsHostOperationMatrixCli', () => {
  it('parses defaults and builds the governed 2026 host matrix cases', () => {
    const parsed = parseWindowsHostOperationMatrixArgs([], '/tmp/vi-history-suite');
    expect(parsed.helpRequested).toBe(false);
    expect(parsed.operation).toBe('all');
    expect(parsed.bitness).toBe('all');
    expect(parsed.labviewCliPath).toContain('LabVIEW CLI\\LabVIEWCLI.exe');
    expect(parsed.x86LabviewExePath).toContain('Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe');
    expect(parsed.x64LabviewExePath).toContain('Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe');
    expect(parsed.additionalOperationDirectory).toBe('/tmp/linuxContainerDemo/VICompareTooling');
    expect(getWindowsHostOperationMatrixUsage()).toContain('runGovernedProof host-operation-matrix');

    const cases = buildWindowsHostOperationMatrixCases({
      ...parsed,
      operation: 'all',
      bitness: 'x86'
    });

    expect(cases.find((entry) => entry.operation === 'CloseLabVIEW')).toMatchObject({
      executionMode: 'run',
      bitness: 'x86'
    });
    expect(cases.find((entry) => entry.operation === 'CreateComparisonReport')).toMatchObject({
      executionMode: 'gated',
      blockedReason: 'createcomparisonreport-deferred-until-prerequisite-operations-complete'
    });
    expect(cases.find((entry) => entry.operation === 'PrintToSingleFileHtml')).toMatchObject({
      executionMode: 'help'
    });
  });

  it('runs one governed host operation case and retains JSON/Markdown evidence', async () => {
    const writes: string[] = [];
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const inspectRuntimeSurface = vi
      .fn()
      .mockResolvedValueOnce({
        capturedAt: '2026-04-06T12:00:00.000Z',
        processes: [],
        processNames: []
      })
      .mockResolvedValueOnce({
        capturedAt: '2026-04-06T12:00:02.000Z',
        processes: [],
        processNames: []
      });
    const runLabviewCliCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'ok',
      stderr: ''
    });
    const listInstalledOperations = vi.fn().mockResolvedValue([
      'CloseLabVIEW',
      'CreateComparisonReport',
      'ExecuteBuildSpec',
      'MassCompile',
      'RunUnitTests',
      'RunVI',
      'RunVIAnalyzer'
    ]);

    await expect(
      runWindowsHostOperationMatrixCli(
        ['--operation', 'CloseLabVIEW', '--bitness', 'x64'],
        {
          repoRoot: '/tmp/vi-history-suite',
          mkdir,
          writeFile,
          nowIso: () => '2026-04-06T12:00:00.000Z',
          stdout: {
            write(text: string) {
              writes.push(text);
            }
          },
          inspectRuntimeSurface,
          cleanupRuntimeSurface: vi.fn().mockResolvedValue(undefined),
          listInstalledOperations,
          runLabviewCliCommand
        }
      )
    ).resolves.toBe('pass');

    expect(listInstalledOperations).toHaveBeenCalledWith(
      'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\Operations'
    );
    expect(runLabviewCliCommand).toHaveBeenCalledWith(
      'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      expect.arrayContaining(['-OperationName', 'CloseLabVIEW', '-Headless'])
    );
    expect(writeFile).toHaveBeenCalledWith(
      '/tmp/vi-history-suite/.cache/governed-proof/windows-host-operation-matrix/2026-04-06T12-00-00-000Z/CloseLabVIEW-x64.stdout.txt',
      'ok',
      'utf8'
    );
    expect(writeFile).toHaveBeenCalledWith(
      '/tmp/vi-history-suite/.cache/governed-proof/windows-host-operation-matrix/latest-run.json',
      expect.stringContaining('"operation": "CloseLabVIEW"'),
      'utf8'
    );
    expect(writes.join('')).toContain('Windows host operation matrix completed.');
    expect(writes.join('')).toContain('Cases: 1');
    expect(writes.join('')).toContain('Failures or blocks: 0');
  });

  it('fails closed when a case leaves the post-run host surface hot', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const cleanupRuntimeSurface = vi.fn().mockResolvedValue(undefined);
    const inspectRuntimeSurface = vi
      .fn()
      .mockResolvedValueOnce({
        capturedAt: '2026-04-06T12:00:00.000Z',
        processes: [],
        processNames: []
      })
      .mockResolvedValueOnce({
        capturedAt: '2026-04-06T12:00:01.000Z',
        processes: [{ processName: 'LabVIEWCLI', pid: 42 }],
        processNames: ['LabVIEWCLI']
      })
      .mockResolvedValueOnce({
        capturedAt: '2026-04-06T12:00:02.000Z',
        processes: [],
        processNames: []
      });

    await expect(
      runWindowsHostOperationMatrixCli(
        ['--operation', 'CloseLabVIEW', '--bitness', 'x86'],
        {
          repoRoot: '/tmp/vi-history-suite',
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile,
          nowIso: () => '2026-04-06T12:00:00.000Z',
          stdout: { write() {} },
          inspectRuntimeSurface,
          cleanupRuntimeSurface,
          listInstalledOperations: vi.fn().mockResolvedValue([
            'CloseLabVIEW',
            'CreateComparisonReport',
            'ExecuteBuildSpec',
            'MassCompile',
            'RunUnitTests',
            'RunVI',
            'RunVIAnalyzer'
          ]),
          runLabviewCliCommand: vi.fn().mockResolvedValue({
            exitCode: 0,
            stdout: '',
            stderr: ''
          })
        }
      )
    ).resolves.toBe('pass');

    expect(cleanupRuntimeSurface).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(
      '/tmp/vi-history-suite/.cache/governed-proof/windows-host-operation-matrix/latest-run.json',
      expect.stringContaining('"blockedReason": "post-run-runtime-surface-contaminated"'),
      'utf8'
    );
  });
});
