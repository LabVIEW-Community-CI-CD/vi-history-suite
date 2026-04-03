import { afterEach, describe, expect, it, vi } from 'vitest';

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  classifyLabviewCliDiagnosticText,
  defaultNowIso,
  defaultNowMs,
  executeComparisonReport,
  normalizeWindowsInteropExecutable,
  normalizeWindowsInteropPath,
  normalizeComparisonProcessError,
  observeWindowsRuntimeProcesses,
  parseLabviewCliDiagnosticLogPath,
  parseWindowsTasklistCsv,
  pathExistsForReport,
  resolveHostReadableDiagnosticPath,
  requiresWindowsInterop,
  runComparisonCommandPlan
} from '../../src/reporting/comparisonReportRuntimeExecution';
import { ComparisonReportPacketRecord } from '../../src/reporting/comparisonReportPacket';

function createReadyRecord(): ComparisonReportPacketRecord {
  return {
    generatedAt: '2026-04-02T00:00:00.000Z',
    reportTitle: 'VI Comparison Report: foo.vi',
    reportStatus: 'ready-for-runtime',
    reportType: 'diff',
    selectedHash: 'abcdef1234567890',
    baseHash: '1111111122222222',
    artifactPlan: {
      repoId: 'repoid123456',
      fileId: 'fileid123456',
      reportType: 'diff',
      fullFilename: 'foo.vi',
      normalizedRelativePath: 'foo.vi',
      reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
      stagingDirectory: '/workspace/.storage/reports/repoid123456/fileid123456/staging',
      reportFilename: 'diff-report-foo.vi.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      packetFilename: 'report-packet.html',
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json',
      runtimeStdoutFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stdout.txt',
      runtimeStderrFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stderr.txt',
      runtimeDiagnosticLogFilePath:
        '/workspace/.storage/reports/repoid123456/fileid123456/runtime-diagnostic-log.txt',
      runtimeProcessObservationFilePath:
        '/workspace/.storage/reports/repoid123456/fileid123456/runtime-process-observation.json',
      allowedLocalRootPaths: [
        '/workspace/.storage',
        '/workspace/.storage/reports/repoid123456'
      ]
    },
    stagedRevisionPlan: {
      leftFilename: 'left-111111112222-foo.vi',
      leftFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/staging/left-111111112222-foo.vi',
      rightFilename: 'right-abcdef123456-foo.vi',
      rightFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/staging/right-abcdef123456-foo.vi'
    },
    preflight: {
      normalizedRelativePath: 'foo.vi',
      ready: true,
      left: {
        revisionId: '1111111122222222',
        blobSpecifier: '1111111122222222:foo.vi',
        signature: 'LVIN',
        isVi: true
      },
      right: {
        revisionId: 'abcdef1234567890',
        blobSpecifier: 'abcdef1234567890:foo.vi',
        signature: 'LVCC',
        isVi: true
      }
    },
    runtimeSelection: {
      platform: 'win32',
      preferBitness: 'x86',
      provider: 'host-native',
      engine: 'labview-cli',
      labviewExe: {
        kind: 'labview-exe',
        path: 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
        source: 'configured',
        exists: true,
        bitness: 'x86'
      },
      labviewCli: {
        kind: 'labview-cli',
        path: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        source: 'configured',
        exists: true,
        bitness: 'x64'
      },
      notes: [],
      registryQueryPlans: [],
      candidates: []
    },
    runtimeExecutionState: 'not-run',
    runtimeExecution: {
      state: 'not-run',
      attempted: false,
      reportExists: false,
      stdoutFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stdout.txt',
      stderrFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stderr.txt'
    }
  };
}

describe('comparisonReportRuntimeExecution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stages revision blobs, runs the governed command, and retains successful execution evidence', async () => {
    const writes: Array<{ filePath: string; value: string | Buffer }> = [];
    const writePacketRecord = vi.fn().mockResolvedValue(undefined);

    const result = await executeComparisonReport(
      {
        record: createReadyRecord(),
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn(async (filePath: string, value: string | Buffer) => {
          writes.push({ filePath, value });
        }) as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: 'command stdout',
          stderr: ''
        }),
        nowIso: vi.fn().mockReturnValueOnce('2026-04-02T01:00:00.000Z').mockReturnValueOnce('2026-04-02T01:00:03.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(4000),
        writePacketRecord,
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecutionState).toBe('succeeded');
    expect(result.record.runtimeExecution.reportExists).toBe(true);
    expect(result.record.runtimeExecution.durationMs).toBe(3000);
    expect(result.record.runtimeExecution.executable).toBe(
      'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
    );
    expect(writes).toEqual(
      expect.arrayContaining([
        {
          filePath:
            '/workspace/.storage/reports/repoid123456/fileid123456/staging/left-111111112222-foo.vi',
          value: Buffer.from('left')
        },
        {
          filePath:
            '/workspace/.storage/reports/repoid123456/fileid123456/staging/right-abcdef123456-foo.vi',
          value: Buffer.from('right')
        },
        {
          filePath:
            '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stdout.txt',
          value: 'command stdout'
        },
        {
          filePath:
            '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stderr.txt',
          value: ''
        }
      ])
    );
    expect(writePacketRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeExecutionState: 'succeeded'
      }),
      expect.any(Object)
    );
  });

  it('fails with an explicit reason when the governed command exits without generating the report file', async () => {
    const result = await executeComparisonReport(
      {
        record: createReadyRecord(),
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: '',
          stderr: ''
        }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1001),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecutionState).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('report-file-not-generated');
    expect(result.record.runtimeExecution.reportExists).toBe(false);
  });

  it('retains a command-exited-nonzero failure when the tool reports an error', async () => {
    const result = await executeComparisonReport(
      {
        record: createReadyRecord(),
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 2,
          stdout: '',
          stderr: 'tool failed'
        }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1005),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecutionState).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('command-exited-nonzero');
    expect(result.record.runtimeExecution.exitCode).toBe(2);
    expect(result.record.runtimeExecution.reportExists).toBe(true);
  });

  it('classifies a log-only nonzero LabVIEW CLI failure when no report is generated', async () => {
    const result = await executeComparisonReport(
      {
        record: createReadyRecord(),
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        readFile: vi.fn().mockResolvedValue(
          '"LabVIEWPath" command line argument is not passed. Using last used LabVIEW: "C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe"\n'
        ) as never,
        pathExists: vi.fn(async (filePath: string) =>
          filePath === 'C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_999.log'
        ),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 1,
          stdout:
            'LabVIEWCLI started logging in file:  C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_999.log\r\n',
          stderr: ''
        }),
        nowIso: vi
          .fn()
          .mockReturnValueOnce('2026-04-02T01:00:00.000Z')
          .mockReturnValueOnce('2026-04-02T01:00:02.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(3000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecution.failureReason).toBe(
      'labview-cli-exited-nonzero-log-only-no-report'
    );
    expect(result.record.runtimeExecution.reportExists).toBe(false);
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      'LabVIEW CLI exited nonzero without stderr and without generating a report; stdout only advertised the diagnostic log path.'
    );
  });

  it('retains a governed process-observation artifact when runtime execution captures it', async () => {
    const writes: Array<{ filePath: string; value: string | Buffer }> = [];

    const result = await executeComparisonReport(
      {
        record: createReadyRecord(),
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn(async (filePath: string, value: string | Buffer) => {
          writes.push({ filePath, value });
        }) as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: 'command stdout',
          stderr: '',
          processObservation: {
            capturedAt: '2026-04-03T00:00:01.000Z',
            hostPlatform: 'linux',
            runtimePlatform: 'win32',
            trigger: 'cli-log-banner',
            observedProcesses: [
              { imageName: 'LabVIEWCLI.exe', pid: 1234 },
              { imageName: 'LabVIEW.exe', pid: 5678 }
            ],
            observedProcessNames: ['LabVIEWCLI.exe', 'LabVIEW.exe'],
            labviewProcessObserved: true,
            labviewCliProcessObserved: true,
            lvcompareProcessObserved: false
          }
        }),
        nowIso: vi
          .fn()
          .mockReturnValueOnce('2026-04-02T01:00:00.000Z')
          .mockReturnValueOnce('2026-04-02T01:00:03.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(4000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecution.processObservationArtifactPath).toBe(
      '/workspace/.storage/reports/repoid123456/fileid123456/runtime-process-observation.json'
    );
    expect(result.record.runtimeExecution.observedProcessNames).toEqual([
      'LabVIEWCLI.exe',
      'LabVIEW.exe'
    ]);
    expect(result.record.runtimeExecution.labviewProcessObserved).toBe(true);
    expect(result.record.runtimeExecution.labviewCliProcessObserved).toBe(true);
    expect(result.record.runtimeExecution.lvcompareProcessObserved).toBe(false);
    expect(writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath:
            '/workspace/.storage/reports/repoid123456/fileid123456/runtime-process-observation.json'
        })
      ])
    );
  });

  it('fails closed before command launch when staging the left revision blob fails', async () => {
    const result = await executeComparisonReport(
      {
        record: createReadyRecord(),
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob: vi.fn().mockRejectedValue(new Error('missing blob')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn(),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecutionState).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('left-stage-blob-write-failed');
    expect(result.record.runtimeExecution.attempted).toBe(false);
  });

  it('retains blocked runtime state without attempting execution when the governed plan is unavailable', async () => {
    const record = createReadyRecord();
    record.reportStatus = 'blocked-runtime';
    record.runtimeSelection.provider = 'unavailable';
    record.runtimeSelection.blockedReason = 'comparison-tool-not-found';
    delete record.runtimeSelection.engine;

    const readRevisionBlob = vi.fn();
    const runCommand = vi.fn();

    const result = await executeComparisonReport(
      {
        record,
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob,
        runCommand,
        writePacketRecord: vi.fn().mockResolvedValue(undefined)
      }
    );

    expect(result.record.runtimeExecutionState).toBe('not-available');
    expect(result.record.runtimeExecution.attempted).toBe(false);
    expect(result.record.runtimeExecution.blockedReason).toBe('comparison-tool-not-found');
    expect(readRevisionBlob).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('retains a failed execution-plan-blocked state when preflight is blocked before runtime execution', async () => {
    const record = createReadyRecord();
    record.reportStatus = 'blocked-preflight';
    record.preflight.ready = false;
    record.preflight.blockedReason = 'right-blob-not-vi';

    const result = await executeComparisonReport(
      {
        record,
        repositoryRoot: '/workspace/repo'
      },
      {
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecutionState).toBe('failed');
    expect(result.record.runtimeExecution.attempted).toBe(false);
    expect(result.record.runtimeExecution.failureReason).toBe('execution-plan-blocked');
    expect(result.record.runtimeExecution.blockedReason).toBe('right-blob-not-vi');
  });

  it('fails closed before command launch when staging the right revision blob fails', async () => {
    const runCommand = vi.fn();
    const result = await executeComparisonReport(
      {
        record: createReadyRecord(),
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockRejectedValueOnce(new Error('missing blob')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand,
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecutionState).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('right-stage-blob-write-failed');
    expect(result.record.runtimeExecution.attempted).toBe(false);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('retains command-spawn-failed with normalized stdout and stderr when the tool cannot be launched', async () => {
    const result = await executeComparisonReport(
      {
        record: createReadyRecord(),
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockRejectedValue({
          stdout: 'partial stdout',
          stderr: 'spawn failed',
          signal: 'SIGTERM'
        }),
        nowIso: vi
          .fn()
          .mockReturnValueOnce('2026-04-02T01:00:00.000Z')
          .mockReturnValueOnce('2026-04-02T01:00:02.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(3000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecutionState).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('command-spawn-failed');
    expect(result.record.runtimeExecution.attempted).toBe(true);
    expect(result.record.runtimeExecution.signal).toBe('SIGTERM');
    expect(result.record.runtimeExecution.durationMs).toBe(2000);
  });

  it('captures and classifies the NI CLI diagnostic log when LabVIEWPath is ignored', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.labviewCli = {
      kind: 'labview-cli',
      path: 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      source: 'configured',
      exists: true,
      bitness: 'x86'
    };
    const copyFile = vi.fn().mockResolvedValue(undefined);

    const result = await executeComparisonReport(
      {
        record,
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: copyFile as never,
        readFile: vi.fn().mockResolvedValue(
          '"LabVIEWPath" command line argument is not passed. Using last used LabVIEW: "C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe"\nLabVIEW launched successfully.\n'
        ) as never,
        pathExists: vi.fn(async (filePath: string) =>
          filePath === 'C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log'
        ),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 1,
          stdout:
            'LabVIEWCLI started logging in file:  C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log\r\n',
          stderr: ''
        }),
        nowIso: vi
          .fn()
          .mockReturnValueOnce('2026-04-02T01:00:00.000Z')
          .mockReturnValueOnce('2026-04-02T01:00:02.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(3000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(copyFile).toHaveBeenCalledWith(
      'C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log',
      '/workspace/.storage/reports/repoid123456/fileid123456/runtime-diagnostic-log.txt'
    );
    expect(result.record.runtimeExecution.diagnosticReason).toBe(
      'labview-path-ignored-last-used-diverged-selection'
    );
    expect(result.record.runtimeExecution.diagnosticLogSourcePath).toBe(
      'C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log'
    );
    expect(result.record.runtimeExecution.diagnosticLogArtifactPath).toBe(
      '/workspace/.storage/reports/repoid123456/fileid123456/runtime-diagnostic-log.txt'
    );
    expect(result.record.runtimeExecution.diagnosticNotes).toEqual([
      'LabVIEW CLI ignored the explicit -LabVIEWPath selection and used a different last-used LabVIEW instead: C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe.',
      'Intended explicit LabVIEW path: C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe.',
      'LabVIEW CLI exited nonzero without stderr and without generating a report; stdout only advertised the diagnostic log path.'
    ]);
  });

  it('normalizes staged, report, and executable paths for win32 execution from a non-Windows host', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'ok',
      stderr: ''
    });
    const copyFile = vi.fn().mockResolvedValue(undefined);
    const writes: Array<{ filePath: string; value: string | Buffer }> = [];

    const result = await executeComparisonReport(
      {
        record: createReadyRecord(),
        repositoryRoot: '/workspace/repo',
        interopWorkspaceRoot: '/mnt/c/Users/sveld/AppData/Local/Temp/vi-history-suite-runtime'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn(async (filePath: string, value: string | Buffer) => {
          writes.push({ filePath, value });
        }) as never,
        copyFile: copyFile as never,
        pathExists: vi.fn(async (filePath: string) =>
          filePath ===
          '/mnt/c/Users/sveld/AppData/Local/Temp/vi-history-suite-runtime/reports/repoid123456/fileid123456/diff-report-foo.vi.html'
        ),
        runCommand,
        nowIso: vi
          .fn()
          .mockReturnValueOnce('2026-04-02T01:00:00.000Z')
          .mockReturnValueOnce('2026-04-02T01:00:01.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(2000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'linux'
      }
    );

    expect(runCommand).toHaveBeenCalledWith({
      executable: '/mnt/c/Program Files/National Instruments/Shared/LabVIEW CLI/LabVIEWCLI.exe',
      args: [
        '-OperationName',
        'CreateComparisonReport',
        '-vi1',
        'C:\\Users\\sveld\\AppData\\Local\\Temp\\vi-history-suite-runtime\\reports\\repoid123456\\fileid123456\\staging\\left-111111112222-foo.vi',
        '-vi2',
        'C:\\Users\\sveld\\AppData\\Local\\Temp\\vi-history-suite-runtime\\reports\\repoid123456\\fileid123456\\staging\\right-abcdef123456-foo.vi',
        '-reportType',
        'HTMLSingleFile',
        '-reportPath',
        'C:\\Users\\sveld\\AppData\\Local\\Temp\\vi-history-suite-runtime\\reports\\repoid123456\\fileid123456\\diff-report-foo.vi.html',
        '-c',
        '-o',
        '-d',
        '-Headless',
        '-LabVIEWPath',
        'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe'
      ]
    });
    expect(writes).toEqual(
      expect.arrayContaining([
        {
          filePath:
            '/mnt/c/Users/sveld/AppData/Local/Temp/vi-history-suite-runtime/reports/repoid123456/fileid123456/staging/left-111111112222-foo.vi',
          value: Buffer.from('left')
        },
        {
          filePath:
            '/mnt/c/Users/sveld/AppData/Local/Temp/vi-history-suite-runtime/reports/repoid123456/fileid123456/staging/right-abcdef123456-foo.vi',
          value: Buffer.from('right')
        }
      ])
    );
    expect(copyFile).toHaveBeenCalledWith(
      '/mnt/c/Users/sveld/AppData/Local/Temp/vi-history-suite-runtime/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html'
    );
    expect(result.record.runtimeExecutionState).toBe('succeeded');
  });

  it('fails closed when win32 execution from a non-Windows host has no interop workspace root', async () => {
    const runCommand = vi.fn();

    const result = await executeComparisonReport(
      {
        record: createReadyRecord(),
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand,
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'linux'
      }
    );

    expect(result.record.runtimeExecutionState).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('windows-interop-root-unavailable');
    expect(result.record.runtimeExecution.attempted).toBe(false);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('normalizes LVCompare arguments for win32 execution from a non-Windows host', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.engine = 'lvcompare';
    record.runtimeSelection.lvCompare = {
      kind: 'lvcompare',
      path: '/mnt/c/Program Files (x86)/National Instruments/Shared/LabVIEW Compare/LVCompare.exe',
      source: 'configured',
      exists: true
    };
    delete record.runtimeSelection.labviewCli;

    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: ''
    });

    const result = await executeComparisonReport(
      {
        record,
        repositoryRoot: '/workspace/repo',
        interopWorkspaceRoot: '/mnt/c/Users/sveld/AppData/Local/Temp/vi-history-suite-runtime'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand,
        nowIso: vi
          .fn()
          .mockReturnValueOnce('2026-04-02T01:00:00.000Z')
          .mockReturnValueOnce('2026-04-02T01:00:01.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(2000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'linux'
      }
    );

    expect(runCommand).toHaveBeenCalledWith({
      executable: '/mnt/c/Program Files (x86)/National Instruments/Shared/LabVIEW Compare/LVCompare.exe',
      args: [
        'C:\\Users\\sveld\\AppData\\Local\\Temp\\vi-history-suite-runtime\\reports\\repoid123456\\fileid123456\\staging\\left-111111112222-foo.vi',
        'C:\\Users\\sveld\\AppData\\Local\\Temp\\vi-history-suite-runtime\\reports\\repoid123456\\fileid123456\\staging\\right-abcdef123456-foo.vi',
        '-lvpath',
        'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe'
      ]
    });
    expect(result.record.runtimeExecutionState).toBe('succeeded');
  });

  it('fails closed when interop path normalization cannot map the selected tool arguments', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.labviewExe = {
      kind: 'labview-exe',
      path: '/home/sveld/not-a-windows-path/LabVIEW.exe',
      source: 'configured',
      exists: true,
      bitness: 'x86'
    };

    const result = await executeComparisonReport(
      {
        record,
        repositoryRoot: '/workspace/repo',
        interopWorkspaceRoot: '/mnt/c/Users/sveld/AppData/Local/Temp/vi-history-suite-runtime'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn(),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'linux'
      }
    );

    expect(result.record.runtimeExecutionState).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('windows-path-normalization-failed');
    expect(result.record.runtimeExecution.attempted).toBe(false);
  });

  it('runs a simple command plan and resolves nonzero exits without throwing', async () => {
    await expect(
      runComparisonCommandPlan({
        executable: process.execPath,
        args: ['-e', 'process.stdout.write("ok"); process.stderr.write("warn");']
      })
    ).resolves.toEqual({
      exitCode: 0,
      stdout: 'ok',
      stderr: 'warn'
    });

    await expect(
      runComparisonCommandPlan({
        executable: process.execPath,
        args: ['-e', 'process.stdout.write("x"); process.stderr.write("bad"); process.exit(3);']
      })
    ).resolves.toEqual({
      exitCode: 3,
      signal: undefined,
      stdout: 'x',
      stderr: 'bad'
    });
  });

  it('normalizes WSL-mounted paths into Windows-native paths and detects when interop is required', () => {
    expect(normalizeWindowsInteropPath('/mnt/c/Program Files/National Instruments/LabVIEW 2026/LabVIEW.exe')).toBe(
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    );
    expect(normalizeWindowsInteropPath('C:/Program Files/National Instruments/LabVIEW 2026/LabVIEW.exe')).toBe(
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    );
    expect(normalizeWindowsInteropPath('/mnt/c/')).toBe('C:\\');
    expect(normalizeWindowsInteropPath('/home/sveld/not-windows')).toBeUndefined();
    expect(
      normalizeWindowsInteropExecutable('C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe')
    ).toBe('/mnt/c/Program Files/National Instruments/Shared/LabVIEW CLI/LabVIEWCLI.exe');
    expect(
      normalizeWindowsInteropExecutable('/mnt/c/Program Files/National Instruments/Shared/LabVIEW CLI/LabVIEWCLI.exe')
    ).toBe('/mnt/c/Program Files/National Instruments/Shared/LabVIEW CLI/LabVIEWCLI.exe');
    expect(normalizeWindowsInteropExecutable('LabVIEWCLI')).toBe('LabVIEWCLI');
    expect(normalizeWindowsInteropExecutable('   ')).toBeUndefined();
    expect(
      parseLabviewCliDiagnosticLogPath(
        'LabVIEWCLI started logging in file:  C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log\r\n'
      )
    ).toBe('C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log');
    expect(
      resolveHostReadableDiagnosticPath(
        'C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log',
        'linux'
      )
    ).toBe('/mnt/c/Users/sveld/AppData/Local/Temp/lvtemporary_123.log');
    expect(
      classifyLabviewCliDiagnosticText(
        '"LabVIEWPath" command line argument is not passed. Using last used LabVIEW: "C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe"\nLabVIEW launched successfully.',
        'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe'
      )
    ).toEqual({
      reason: 'labview-path-ignored-last-used-matched-selection',
      notes: [
        'LabVIEW CLI ignored the explicit -LabVIEWPath selection, but the last-used LabVIEW matched the intended executable: C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe.'
      ]
    });
    expect(
      classifyLabviewCliDiagnosticText(
        '"LabVIEWPath" command line argument is not passed. Using last used LabVIEW: "C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.exe"',
        'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe'
      )
    ).toEqual({
      reason: 'labview-path-ignored-last-used-diverged-selection',
      notes: [
        'LabVIEW CLI ignored the explicit -LabVIEWPath selection and used a different last-used LabVIEW instead: C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.exe.',
        'Intended explicit LabVIEW path: C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe.',
        'The retained LabVIEW CLI diagnostic log did not report successful LabVIEW launch before exit.'
      ]
    });
    expect(requiresWindowsInterop('win32', 'linux')).toBe(true);
    expect(requiresWindowsInterop('win32', 'win32')).toBe(false);
    expect(requiresWindowsInterop('linux', 'linux')).toBe(false);
  });

  it('parses Windows tasklist CSV and retains only observed LabVIEW runtime processes', async () => {
    expect(
      parseWindowsTasklistCsv(
        '"LabVIEWCLI.exe","44152","Console","1","105,184 K"\r\n' +
          '"notepad.exe","111","Console","1","1,024 K"\r\n' +
          '"LabVIEW.exe","44160","Console","1","250,000 K"\r\n'
      )
    ).toEqual([
      {
        imageName: 'LabVIEWCLI.exe',
        pid: 44152,
        sessionName: 'Console',
        sessionNumber: 1,
        memUsage: '105,184 K'
      },
      {
        imageName: 'notepad.exe',
        pid: 111,
        sessionName: 'Console',
        sessionNumber: 1,
        memUsage: '1,024 K'
      },
      {
        imageName: 'LabVIEW.exe',
        pid: 44160,
        sessionName: 'Console',
        sessionNumber: 1,
        memUsage: '250,000 K'
      }
    ]);

    const observation = await observeWindowsRuntimeProcesses(
      {
        hostPlatform: 'linux',
        runtimePlatform: 'win32'
      },
      {
        nowIso: () => '2026-04-03T00:00:01.000Z',
        execFileImpl: vi.fn(
          (
            _file: string,
            _args: readonly string[] | undefined,
            _options:
              | { encoding: BufferEncoding; maxBuffer: number; windowsHide: boolean }
              | undefined,
            callback:
              | ((error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void)
              | undefined
          ) => {
            callback?.(
              null,
              '"LabVIEWCLI.exe","44152","Console","1","105,184 K"\r\n' +
                '"notepad.exe","111","Console","1","1,024 K"\r\n' +
                '"LabVIEW.exe","44160","Console","1","250,000 K"\r\n',
              ''
            );
          }
        ) as never
      }
    );

    expect(observation).toEqual({
      capturedAt: '2026-04-03T00:00:01.000Z',
      hostPlatform: 'linux',
      runtimePlatform: 'win32',
      trigger: 'cli-log-banner',
      observedProcesses: [
        {
          imageName: 'LabVIEWCLI.exe',
          pid: 44152,
          sessionName: 'Console',
          sessionNumber: 1,
          memUsage: '105,184 K'
        },
        {
          imageName: 'LabVIEW.exe',
          pid: 44160,
          sessionName: 'Console',
          sessionNumber: 1,
          memUsage: '250,000 K'
        }
      ],
      observedProcessNames: ['LabVIEWCLI.exe', 'LabVIEW.exe'],
      labviewProcessObserved: true,
      labviewCliProcessObserved: true,
      lvcompareProcessObserved: false
    });
  });

  it('rejects raw execFile failures when the process never returns a numeric exit code', async () => {
    const execFileImpl = vi.fn(
      (
        _file: string,
        _args: readonly string[] | undefined,
        _options:
          | { encoding: BufferEncoding; maxBuffer: number; windowsHide: boolean }
          | undefined,
        callback:
          | ((error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void)
          | undefined
      ) => {
        const error = Object.assign(new Error('spawn failed'), { code: 'ENOENT' });
        callback?.(error, '', '');
      }
    );

    await expect(
      runComparisonCommandPlan({
        executable: 'missing-command',
        args: []
      }, {
        execFileImpl: execFileImpl as never
      })
    ).rejects.toMatchObject({
      message: 'spawn failed',
      code: 'ENOENT'
    });
  });

  it('normalizes comparison-process errors and report-path existence using the default helpers', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-runtime-execution-'));
    const existingPath = path.join(tempRoot, 'report.html');
    await fs.writeFile(existingPath, '<html></html>');

    await expect(pathExistsForReport(existingPath)).resolves.toBe(true);
    await expect(pathExistsForReport(path.join(tempRoot, 'missing.html'))).resolves.toBe(false);

    expect(
      normalizeComparisonProcessError({
        stdout: 'a',
        stderr: 'b',
        signal: 'SIGKILL'
      })
    ).toEqual({
      stdout: 'a',
      stderr: 'b',
      signal: 'SIGKILL'
    });

    expect(normalizeComparisonProcessError('plain failure')).toEqual({
      stdout: '',
      stderr: 'plain failure'
    });

    expect(defaultNowIso()).toMatch(/^20\d\d-\d\d-\d\dT/);
    expect(defaultNowMs()).toBeTypeOf('number');

    await fs.rm(tempRoot, { recursive: true, force: true });
  });
});
