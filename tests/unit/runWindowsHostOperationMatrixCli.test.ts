import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import {
  buildWindowsHostOperationMatrixCases,
  getWindowsHostOperationMatrixUsage,
  parseWindowsHostOperationMatrixArgs,
  runWindowsForegroundLabviewCliCommand,
  runWindowsHostOperationMatrixCli
} from '../../src/cli/runWindowsHostOperationMatrix';

describe('runWindowsHostOperationMatrixCli', () => {
  it('runs the foreground PowerShell LabVIEWCLI path and captures operation output', async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      pid: number;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = 4321;
    const spawnImpl = vi.fn().mockImplementation(() => {
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from('Using LabVIEW\r\nMassCompile operation succeeded.\r\n'));
        child.emit('close', 0);
      });
      return child as never;
    });

    await expect(
      runWindowsForegroundLabviewCliCommand('C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe', [
        '-OperationName',
        'MassCompile',
        '-LabVIEWPath',
        'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
        '-Help',
        '-PortNumber',
        '3363'
      ], {
        spawnImpl: spawnImpl as never,
        observationWindowMs: 50
      })
    ).resolves.toEqual({
      exitCode: 0,
      stdout: 'Using LabVIEW\r\nMassCompile operation succeeded.\r\n',
      stderr: ''
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        expect.stringContaining("& 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe' @argList")
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
  });

  it('fails closed when the foreground PowerShell LabVIEWCLI path exceeds the observation window', async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      pid: number;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = 9876;
    const spawnImpl = vi.fn().mockImplementation(() => {
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from('partial'));
      });
      return child as never;
    });
    const terminateProcessTree = vi.fn().mockResolvedValue(undefined);

    await expect(
      runWindowsForegroundLabviewCliCommand('C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe', [
        '-OperationName',
        'MassCompile'
      ], {
        spawnImpl: spawnImpl as never,
        terminateProcessTree,
        observationWindowMs: 1
      })
    ).resolves.toEqual({
      exitCode: -1,
      stdout: 'partial',
      stderr: 'Windows host operation matrix observation window expired after 1 ms.'
    });

    expect(terminateProcessTree).toHaveBeenCalledWith(9876);
  });

  it('parses defaults and builds the governed 2026 host matrix cases', () => {
    const parsed = parseWindowsHostOperationMatrixArgs([], '/tmp/vi-history-suite');
    expect(parsed.helpRequested).toBe(false);
    expect(parsed.operation).toBe('all');
    expect(parsed.bitness).toBe('all');
    expect(parsed.sessionState).toBe('cold');
    expect(parsed.labviewCliPath).toContain('LabVIEW CLI\\LabVIEWCLI.exe');
    expect(parsed.x86LabviewExePath).toContain('Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe');
    expect(parsed.x64LabviewExePath).toContain('Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe');
    expect(parsed.additionalOperationDirectory).toBe('/tmp/labview-ci-cd/actions/VICompareTooling');
    expect(getWindowsHostOperationMatrixUsage()).toContain('runGovernedProof host-operation-matrix');

    const cases = buildWindowsHostOperationMatrixCases({
      ...parsed,
      operation: 'all',
      bitness: 'x86'
    });

    expect(cases.find((entry) => entry.operation === 'CloseLabVIEW')).toMatchObject({
      executionMode: 'run',
      bitness: 'x86',
      sessionState: 'cold'
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
    const readFile = vi.fn().mockResolvedValue('server.tcp.enabled=true\n');

    await expect(
      runWindowsHostOperationMatrixCli(
        ['--operation', 'CloseLabVIEW', '--bitness', 'x64'],
        {
          repoRoot: '/tmp/vi-history-suite',
          mkdir,
          readFile: readFile as never,
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
      expect.arrayContaining(['-OperationName', 'CloseLabVIEW', '-Headless', '-PortNumber', '3363'])
    );
    expect(writeFile).toHaveBeenCalledWith(
      '/tmp/vi-history-suite/.cache/governed-proof/windows-host-operation-matrix/2026-04-06T12-00-00-000Z/CloseLabVIEW-x64-cold.stdout.txt',
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

  it('retains a warm-headless case separately and accepts the expected prelaunched LabVIEW surface', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const readFile = vi.fn().mockResolvedValue('server.tcp.enabled=true\n');
    const inspectRuntimeSurface = vi
      .fn()
      .mockResolvedValueOnce({
        capturedAt: '2026-04-06T12:00:00.000Z',
        processes: [],
        processNames: []
      })
      .mockResolvedValueOnce({
        capturedAt: '2026-04-06T12:00:01.000Z',
        processes: [
          {
            processName: 'LabVIEW',
            pid: 101,
            path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
          }
        ],
        processNames: ['LabVIEW']
      })
      .mockResolvedValueOnce({
        capturedAt: '2026-04-06T12:00:02.000Z',
        processes: [
          {
            processName: 'LabVIEW',
            pid: 101,
            path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
          }
        ],
        processNames: ['LabVIEW']
      })
      .mockResolvedValueOnce({
        capturedAt: '2026-04-06T12:00:03.000Z',
        processes: [],
        processNames: []
      });

    await expect(
      runWindowsHostOperationMatrixCli(
        ['--operation', 'MassCompile', '--bitness', 'x64', '--session-state', 'warm-headless'],
        {
          repoRoot: '/tmp/vi-history-suite',
          mkdir: vi.fn().mockResolvedValue(undefined),
          readFile: readFile as never,
          writeFile,
          nowIso: () => '2026-04-06T12:00:00.000Z',
          stdout: { write() {} },
          inspectRuntimeSurface,
          cleanupRuntimeSurface: vi.fn().mockResolvedValue(undefined),
          launchHeadlessLabview: vi.fn().mockResolvedValue(101),
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
            stdout: 'usage ok',
            stderr: ''
          })
        }
      )
    ).resolves.toBe('pass');

    expect(writeFile).toHaveBeenCalledWith(
      '/tmp/vi-history-suite/.cache/governed-proof/windows-host-operation-matrix/latest-run.json',
      expect.stringContaining('"sessionState": "warm-headless"'),
      'utf8'
    );
    expect(writeFile).toHaveBeenCalledWith(
      '/tmp/vi-history-suite/.cache/governed-proof/windows-host-operation-matrix/latest-run.json',
      expect.stringContaining('"status": "succeeded"'),
      'utf8'
    );
    expect(writeFile).toHaveBeenCalledWith(
      '/tmp/vi-history-suite/.cache/governed-proof/windows-host-operation-matrix/latest-run.json',
      expect.stringContaining('"labviewTcpPort": 3363'),
      'utf8'
    );
  });

  it('fails closed when the additional operation directory is absent for PrintToSingleFileHtml', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);

    await expect(
      runWindowsHostOperationMatrixCli(
        ['--operation', 'PrintToSingleFileHtml', '--bitness', 'x64', '--session-state', 'warm-headless'],
        {
          repoRoot: '/tmp/vi-history-suite',
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile,
          pathExists: vi.fn().mockResolvedValue(false),
          readFile: vi.fn().mockResolvedValue('server.tcp.enabled=true\n') as never,
          nowIso: () => '2026-04-06T12:00:00.000Z',
          stdout: { write() {} },
          inspectRuntimeSurface: vi
            .fn()
            .mockResolvedValueOnce({
              capturedAt: '2026-04-06T12:00:00.000Z',
              processes: [],
              processNames: []
            }),
          cleanupRuntimeSurface: vi.fn().mockResolvedValue(undefined),
          listInstalledOperations: vi.fn().mockResolvedValue([
            'CloseLabVIEW',
            'CreateComparisonReport',
            'ExecuteBuildSpec',
            'MassCompile',
            'RunUnitTests',
            'RunVI',
            'RunVIAnalyzer'
          ]),
          runLabviewCliCommand: vi.fn()
        }
      )
    ).resolves.toBe('pass');

    expect(writeFile).toHaveBeenCalledWith(
      '/tmp/vi-history-suite/.cache/governed-proof/windows-host-operation-matrix/latest-run.json',
      expect.stringContaining('"blockedReason": "missing-additional-operation-directory"'),
      'utf8'
    );
  });

  it('fails closed when a case leaves the post-run host surface hot', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const cleanupRuntimeSurface = vi.fn().mockResolvedValue(undefined);
    const readFile = vi.fn().mockResolvedValue('server.tcp.port=3364\nserver.tcp.enabled=true\n');
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
          readFile: readFile as never,
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
    expect(writeFile).toHaveBeenCalledWith(
      '/tmp/vi-history-suite/.cache/governed-proof/windows-host-operation-matrix/latest-run.json',
      expect.stringContaining('"labviewTcpPort": 3364'),
      'utf8'
    );
  });
});
