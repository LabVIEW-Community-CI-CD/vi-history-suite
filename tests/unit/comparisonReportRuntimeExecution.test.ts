import { afterEach, describe, expect, it, vi } from 'vitest';

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  classifyLabviewCliDiagnosticText,
  buildWindowsContainerLabviewCliScript,
  defaultNowIso,
  defaultNowMs,
  executeComparisonReport,
  extractCommandOptionValue,
  normalizeWindowsInteropExecutable,
  normalizeWindowsInteropPath,
  normalizeComparisonProcessError,
  observeWindowsRuntimeProcesses,
  parseLabviewCliDiagnosticLogPath,
  parseWindowsTasklistCsv,
  pathExistsForReport,
  resolveHostReadableDiagnosticPath,
  resolveMappedRuntimeDiagnosticPath,
  rewriteLabviewCliArgsForContainerWorkspace,
  rewriteLvcompareArgsForContainerWorkspace,
  requiresWindowsInterop,
  runComparisonCommandPlan,
  runComparisonCommandPlanWithObservation
} from '../../src/reporting/comparisonReportRuntimeExecution';
import { ComparisonReportPacketRecord } from '../../src/reporting/comparisonReportPacket';

function decodeWindowsEncodedCommand(value: string): string {
  return Buffer.from(value, 'base64').toString('utf16le');
}

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
    expect(result.record.runtimeExecution.processObservationCapturedAt).toBe(
      '2026-04-03T00:00:01.000Z'
    );
    expect(result.record.runtimeExecution.processObservationTrigger).toBe('cli-log-banner');
    expect(result.record.runtimeExecution.observedProcessNames).toEqual([
      'LabVIEWCLI.exe',
      'LabVIEW.exe'
    ]);
    expect(result.record.runtimeExecution.labviewProcessObserved).toBe(true);
    expect(result.record.runtimeExecution.labviewCliProcessObserved).toBe(true);
    expect(result.record.runtimeExecution.lvcompareProcessObserved).toBe(false);
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      'At the retained cli-log-banner snapshot (2026-04-03T00:00:01.000Z), observed LabVIEW-related processes: LabVIEWCLI.exe, LabVIEW.exe.'
    );
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      'At the retained cli-log-banner snapshot, LVCompare.exe was not observed.'
    );
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
        '-VI1',
        'C:\\Users\\sveld\\AppData\\Local\\Temp\\vi-history-suite-runtime\\reports\\repoid123456\\fileid123456\\staging\\left-111111112222-foo.vi',
        '-VI2',
        'C:\\Users\\sveld\\AppData\\Local\\Temp\\vi-history-suite-runtime\\reports\\repoid123456\\fileid123456\\staging\\right-abcdef123456-foo.vi',
        '-ReportType',
        'html',
        '-ReportPath',
        'C:\\Users\\sveld\\AppData\\Local\\Temp\\vi-history-suite-runtime\\reports\\repoid123456\\fileid123456\\diff-report-foo.vi.html',
        '-c',
        '-o'
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

  it('copies generated report asset directories back into the stored report root after interop execution', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'ok',
      stderr: ''
    });
    const copyFile = vi.fn().mockResolvedValue(undefined);
    const copyDirectory = vi.fn().mockResolvedValue(undefined);

    await executeComparisonReport(
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
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: copyFile as never,
        copyDirectory: copyDirectory as never,
        pathExists: vi.fn(async (filePath: string) =>
          filePath ===
            '/mnt/c/Users/sveld/AppData/Local/Temp/vi-history-suite-runtime/reports/repoid123456/fileid123456/diff-report-foo.vi.html' ||
          filePath ===
            '/mnt/c/Users/sveld/AppData/Local/Temp/vi-history-suite-runtime/reports/repoid123456/fileid123456/diff-report-foo.vi_files'
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

    expect(copyFile).toHaveBeenCalledWith(
      '/mnt/c/Users/sveld/AppData/Local/Temp/vi-history-suite-runtime/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html'
    );
    expect(copyDirectory).toHaveBeenCalledWith(
      '/mnt/c/Users/sveld/AppData/Local/Temp/vi-history-suite-runtime/reports/repoid123456/fileid123456/diff-report-foo.vi_files',
      '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi_files',
      {
        recursive: true,
        force: true
      }
    );
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

  it('fails closed when the windows-container provider is selected without an image', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.provider = 'windows-container';
    delete record.runtimeSelection.windowsContainerImage;

    const runCommand = vi.fn();

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
        runCommand,
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'linux'
      }
    );

    expect(result.record.runtimeExecutionState).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('windows-container-image-unavailable');
    expect(result.record.runtimeExecution.attempted).toBe(false);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('wraps the governed LabVIEW CLI command in the windows container provider from a non-Windows host', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.provider = 'windows-container';
    record.runtimeSelection.windowsContainerImage = 'nationalinstruments/labview:2026q1-windows';
    record.runtimeSelection.labviewExe = {
      kind: 'labview-exe',
      path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      source: 'scan',
      exists: true,
      bitness: 'x64'
    };
    record.runtimeSelection.labviewCli = {
      kind: 'labview-cli',
      path: 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      source: 'scan',
      exists: true,
      bitness: 'x86'
    };

    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: ''
    });

    await executeComparisonReport(
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
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
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

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        executable: '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
        args: expect.arrayContaining(['-NoProfile', '-EncodedCommand'])
      })
    );
    const encodedOuterCommand = runCommand.mock.calls[0]?.[0].args[2];
    expect(encodedOuterCommand).toMatch(/^[A-Za-z0-9+/=]+$/);
    const outerCommand = decodeWindowsEncodedCommand(encodedOuterCommand);
    expect(outerCommand).toContain("$ProgressPreference = 'SilentlyContinue'");
    expect(outerCommand).toContain("-e TEMP='C:\\vi-history-suite\\container-temp'");
    expect(outerCommand).toContain("-e TMP='C:\\vi-history-suite\\container-temp'");
    const innerEncodedCommandMatch = outerCommand.match(/-EncodedCommand ([A-Za-z0-9+/=]+)/);
    expect(innerEncodedCommandMatch?.[1]).toBeTruthy();
    const innerCommand = decodeWindowsEncodedCommand(innerEncodedCommandMatch![1]);
    expect(innerCommand).toContain("function Set-IniToken {");
    expect(innerCommand).toContain("$ProgressPreference = 'SilentlyContinue'");
    expect(innerCommand).toContain("Start-Process -FilePath $labviewPath -ArgumentList '--headless'");
    expect(innerCommand).toContain("Set-IniToken -Path $cliIni -Key 'OpenAppReferenceTimeoutInSecond' -Value '180'");
    expect(innerCommand).toContain("Set-IniToken -Path $cliIni -Key 'AfterLaunchOpenAppReferenceTimeoutInSecond' -Value '180'");
    expect(innerCommand).toContain("'-Headless', 'true'");
    expect(innerCommand).toContain("'-o'");
  });

  it('wraps the governed LabVIEW CLI command in the windows container provider from a native Windows host without interop staging', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.provider = 'windows-container';
    record.runtimeSelection.windowsContainerImage = 'nationalinstruments/labview:2026q1-windows';
    record.runtimeSelection.labviewExe = {
      kind: 'labview-exe',
      path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      source: 'scan',
      exists: true,
      bitness: 'x64'
    };
    record.runtimeSelection.labviewCli = {
      kind: 'labview-cli',
      path: 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      source: 'scan',
      exists: true,
      bitness: 'x86'
    };
    record.artifactPlan.reportDirectory =
      'C:\\Users\\sveld\\AppData\\Local\\vi-history-suite\\reports\\repoid123456\\fileid123456';
    record.artifactPlan.stagingDirectory =
      'C:\\Users\\sveld\\AppData\\Local\\vi-history-suite\\reports\\repoid123456\\fileid123456\\staging';
    record.artifactPlan.reportFilePath =
      'C:\\Users\\sveld\\AppData\\Local\\vi-history-suite\\reports\\repoid123456\\fileid123456\\diff-report-foo.vi.html';
    record.artifactPlan.packetFilePath =
      'C:\\Users\\sveld\\AppData\\Local\\vi-history-suite\\reports\\repoid123456\\fileid123456\\report-packet.html';
    record.artifactPlan.metadataFilePath =
      'C:\\Users\\sveld\\AppData\\Local\\vi-history-suite\\reports\\repoid123456\\fileid123456\\report-metadata.json';
    record.artifactPlan.runtimeStdoutFilePath =
      'C:\\Users\\sveld\\AppData\\Local\\vi-history-suite\\reports\\repoid123456\\fileid123456\\runtime-stdout.txt';
    record.artifactPlan.runtimeStderrFilePath =
      'C:\\Users\\sveld\\AppData\\Local\\vi-history-suite\\reports\\repoid123456\\fileid123456\\runtime-stderr.txt';
    record.artifactPlan.runtimeDiagnosticLogFilePath =
      'C:\\Users\\sveld\\AppData\\Local\\vi-history-suite\\reports\\repoid123456\\fileid123456\\runtime-diagnostic-log.txt';
    record.artifactPlan.runtimeProcessObservationFilePath =
      'C:\\Users\\sveld\\AppData\\Local\\vi-history-suite\\reports\\repoid123456\\fileid123456\\runtime-process-observation.json';
    record.stagedRevisionPlan.leftFilePath =
      'C:\\Users\\sveld\\AppData\\Local\\vi-history-suite\\reports\\repoid123456\\fileid123456\\staging\\left-111111112222-foo.vi';
    record.stagedRevisionPlan.rightFilePath =
      'C:\\Users\\sveld\\AppData\\Local\\vi-history-suite\\reports\\repoid123456\\fileid123456\\staging\\right-abcdef123456-foo.vi';

    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: ''
    });

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
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn(async (filePath: string) =>
          filePath ===
          'C:\\Users\\sveld\\AppData\\Local\\vi-history-suite\\reports\\repoid123456\\fileid123456\\diff-report-foo.vi.html'
        ),
        runCommand,
        nowIso: vi
          .fn()
          .mockReturnValueOnce('2026-04-02T01:00:00.000Z')
          .mockReturnValueOnce('2026-04-02T01:00:01.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(2000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecutionState).toBe('succeeded');
    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        executable: 'powershell.exe',
        args: expect.arrayContaining(['-NoProfile', '-EncodedCommand'])
      })
    );
    const encodedOuterCommand = runCommand.mock.calls[0]?.[0].args[2];
    const outerCommand = decodeWindowsEncodedCommand(encodedOuterCommand);
    expect(outerCommand).toContain(
      "docker run --rm -v 'C:\\Users\\sveld\\AppData\\Local\\vi-history-suite\\reports\\repoid123456\\fileid123456:C:\\vi-history-suite'"
    );
    expect(outerCommand).toContain("-e TEMP='C:\\vi-history-suite\\container-temp'");
    expect(outerCommand).toContain("-e TMP='C:\\vi-history-suite\\container-temp'");
  });

  it('copies container-local diagnostic logs back into governed storage for windows-container execution', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.provider = 'windows-container';
    record.runtimeSelection.windowsContainerImage = 'nationalinstruments/labview:2026q1-windows';
    record.runtimeSelection.labviewExe = {
      kind: 'labview-exe',
      path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      source: 'scan',
      exists: true,
      bitness: 'x64'
    };
    record.runtimeSelection.labviewCli = {
      kind: 'labview-cli',
      path: 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      source: 'scan',
      exists: true,
      bitness: 'x86'
    };

    const copyFile = vi.fn().mockResolvedValue(undefined);

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
        copyFile: copyFile as never,
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
        readFile: vi
          .fn()
          .mockResolvedValue(
            'Using LabVIEW: "C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe"\nConnection established with LabVIEW at port number 3363.\nCreateComparisonReport operation succeeded.\n'
          ) as never,
        pathExists: vi.fn(async (filePath: string) =>
          filePath ===
            '/mnt/c/Users/sveld/AppData/Local/Temp/vi-history-suite-runtime/reports/repoid123456/fileid123456/diff-report-foo.vi.html' ||
          filePath ===
            '/mnt/c/Users/sveld/AppData/Local/Temp/vi-history-suite-runtime/reports/repoid123456/fileid123456/container-temp/lvtemporary_123.log'
        ),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout:
            'LabVIEWCLI started logging in file:  C:\\vi-history-suite\\container-temp\\lvtemporary_123.log\r\nUsing LabVIEW: "C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe"\r\nConnection established with LabVIEW at port number 3363.\r\nCreateComparisonReport operation succeeded.\r\n',
          stderr: ''
        }),
        nowIso: vi
          .fn()
          .mockReturnValueOnce('2026-04-02T01:00:00.000Z')
          .mockReturnValueOnce('2026-04-02T01:00:03.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(4000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'linux'
      }
    );

    expect(copyFile).toHaveBeenCalledWith(
      '/mnt/c/Users/sveld/AppData/Local/Temp/vi-history-suite-runtime/reports/repoid123456/fileid123456/container-temp/lvtemporary_123.log',
      '/workspace/.storage/reports/repoid123456/fileid123456/runtime-diagnostic-log.txt'
    );
    expect(result.record.runtimeExecutionState).toBe('succeeded');
    expect(result.record.runtimeExecution.diagnosticLogSourcePath).toBe(
      'C:\\vi-history-suite\\container-temp\\lvtemporary_123.log'
    );
    expect(result.record.runtimeExecution.diagnosticLogArtifactPath).toBe(
      '/workspace/.storage/reports/repoid123456/fileid123456/runtime-diagnostic-log.txt'
    );
  });

  it('wraps lvcompare parity probes in the windows container provider from a non-Windows host', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.provider = 'windows-container';
    record.runtimeSelection.engine = 'lvcompare';
    record.runtimeSelection.windowsContainerImage = 'nationalinstruments/labview:2026q1-windows';
    record.runtimeSelection.labviewExe = {
      kind: 'labview-exe',
      path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      source: 'scan',
      exists: true,
      bitness: 'x64'
    };
    record.runtimeSelection.lvCompare = {
      kind: 'lvcompare',
      path: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe',
      source: 'scan',
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
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
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

    expect(result.record.runtimeExecutionState).toBe('succeeded');
    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        executable: '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
        args: expect.arrayContaining(['-NoProfile', '-EncodedCommand'])
      })
    );
    const encodedOuterCommand = runCommand.mock.calls[0]?.[0].args[2];
    const outerCommand = decodeWindowsEncodedCommand(encodedOuterCommand);
    expect(outerCommand).toContain(
      "docker run --rm -v 'C:\\Users\\sveld\\AppData\\Local\\Temp\\vi-history-suite-runtime\\reports\\repoid123456\\fileid123456:C:\\vi-history-suite'"
    );
    const innerEncodedCommandMatch = outerCommand.match(/-EncodedCommand ([A-Za-z0-9+/=]+)/);
    expect(innerEncodedCommandMatch?.[1]).toBeTruthy();
    const innerCommand = decodeWindowsEncodedCommand(innerEncodedCommandMatch![1]);
    expect(innerCommand).toContain(
      "$executable = 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe'"
    );
    expect(innerCommand).toContain(
      "'C:\\vi-history-suite\\staging\\left-111111112222-foo.vi', 'C:\\vi-history-suite\\staging\\right-abcdef123456-foo.vi', '-lvpath', 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'"
    );
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
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
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

  it('clears stale diagnostic-log artifacts and classifies lvcompare zero-exit no-report failures specifically', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.engine = 'lvcompare';
    record.runtimeSelection.lvCompare = {
      kind: 'lvcompare',
      path: '/mnt/c/Program Files (x86)/National Instruments/Shared/LabVIEW Compare/LVCompare.exe',
      source: 'configured',
      exists: true
    };

    const unlinkFile = vi.fn().mockResolvedValue(undefined);

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
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        unlinkFile: unlinkFile as never,
        pathExists: vi.fn(async (filePath: string) =>
          filePath === '/workspace/.storage/reports/repoid123456/fileid123456/runtime-diagnostic-log.txt'
        ),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: '',
          stderr: ''
        }),
        nowIso: vi
          .fn()
          .mockReturnValueOnce('2026-04-02T01:00:00.000Z')
          .mockReturnValueOnce('2026-04-02T01:00:05.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(6000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(unlinkFile).toHaveBeenCalledWith(
      '/workspace/.storage/reports/repoid123456/fileid123456/runtime-diagnostic-log.txt'
    );
    expect(result.record.runtimeExecution.failureReason).toBe(
      'lvcompare-exited-zero-without-report'
    );
    expect(result.record.runtimeExecution.diagnosticLogSourcePath).toBeUndefined();
    expect(result.record.runtimeExecution.diagnosticLogArtifactPath).toBeUndefined();
    expect(result.record.runtimeExecution.diagnosticNotes).toEqual([
      'LVCompare exited 0 without generating the governed report file.'
    ]);
  });

  it('fails closed when interop path normalization cannot map the selected tool arguments', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.labviewCli = {
      kind: 'labview-cli',
      path: '/home/sveld/not-a-windows-path/LabVIEWCLI.exe',
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
    expect(normalizeWindowsInteropPath('   ')).toBeUndefined();
    expect(
      normalizeWindowsInteropExecutable('C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe')
    ).toBe('/mnt/c/Program Files/National Instruments/Shared/LabVIEW CLI/LabVIEWCLI.exe');
    expect(
      normalizeWindowsInteropExecutable('/mnt/c/Program Files/National Instruments/Shared/LabVIEW CLI/LabVIEWCLI.exe')
    ).toBe('/mnt/c/Program Files/National Instruments/Shared/LabVIEW CLI/LabVIEWCLI.exe');
    expect(normalizeWindowsInteropExecutable('LabVIEWCLI')).toBeUndefined();
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
    expect(
      classifyLabviewCliDiagnosticText(
        '"LabVIEWPath" command line argument is not passed. Using last used LabVIEW: "C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.exe"',
        '   '
      )
    ).toEqual({
      reason: 'labview-path-ignored-last-used-default',
      notes: [
        'LabVIEW CLI ignored the explicit -LabVIEWPath selection and used the last-used LabVIEW instead: C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.exe.',
        'The retained LabVIEW CLI diagnostic log did not report successful LabVIEW launch before exit.'
      ]
    });
    expect(requiresWindowsInterop('win32', 'linux')).toBe(true);
    expect(requiresWindowsInterop('win32', 'win32')).toBe(false);
    expect(requiresWindowsInterop('linux', 'linux')).toBe(false);
  });

  it('maps runtime diagnostic logs only when they remain under the governed runtime root', () => {
    expect(
      resolveHostReadableDiagnosticPath(
        'C:\\vi-history-suite\\container-temp\\logs\\lvtemporary_123.log',
        'linux',
        {
          runtimeRoot: 'C:\\vi-history-suite\\container-temp',
          hostRoot: '/workspace/.interop/container-temp'
        }
      )
    ).toBe('/workspace/.interop/container-temp/logs/lvtemporary_123.log');

    expect(
      resolveHostReadableDiagnosticPath(
        'C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log',
        'linux',
        {
          runtimeRoot: 'C:\\vi-history-suite\\container-temp',
          hostRoot: '/workspace/.interop/container-temp'
        }
      )
    ).toBeUndefined();
  });

  it('fails closed for unmapped or non-normalizable diagnostic-path inputs', () => {
    expect(resolveMappedRuntimeDiagnosticPath('C:\\temp\\lvtemporary_123.log')).toBeUndefined();
    expect(
      resolveMappedRuntimeDiagnosticPath('   ', {
        runtimeRoot: 'C:\\vi-history-suite\\container-temp',
        hostRoot: '/workspace/.interop/container-temp'
      })
    ).toBeUndefined();
    expect(
      resolveMappedRuntimeDiagnosticPath('C:\\vi-history-suite\\container-temp\\logs\\lvtemporary_123.log', {
        runtimeRoot: '   ',
        hostRoot: '/workspace/.interop/container-temp'
      })
    ).toBeUndefined();
  });

  it('ignores blank command-option values when extracting governed runtime overrides', () => {
    expect(
      extractCommandOptionValue(
        ['-OperationName', 'CreateComparisonReport', '-LabVIEWPath', '   ', '-Headless', 'true'],
        '-LabVIEWPath'
      )
    ).toBeUndefined();
    expect(
      extractCommandOptionValue(
        ['-OperationName', 'CreateComparisonReport', '-LabVIEWPath', 'C:\\LabVIEW\\LabVIEW.exe'],
        '-LabVIEWPath'
      )
    ).toBe('C:\\LabVIEW\\LabVIEW.exe');
  });

  it('nulls the governed LabVIEW path in the container CLI script when no usable path is provided', () => {
    expect(
      buildWindowsContainerLabviewCliScript(
        'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        ['-OperationName', 'CreateComparisonReport'],
        '   '
      )
    ).toContain('$labviewPath = $null');
    expect(
      buildWindowsContainerLabviewCliScript(
        'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        ['-OperationName', 'CreateComparisonReport'],
        'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe'
      )
    ).toContain(
      "$labviewPath = 'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe'"
    );
  });

  it('retains an explicit launch-success note when the NI diagnostic log confirms LabVIEW launched', () => {
    expect(
      classifyLabviewCliDiagnosticText(
        'LabVIEW launched successfully.\nThe operation failed later.',
        'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe'
      )
    ).toEqual({
      notes: ['LabVIEW CLI reported that LabVIEW launched successfully before the operation failed.']
    });
  });

  it('rewrites container LabVIEW CLI args with governed LabVIEWPath and forced headless execution', () => {
    expect(
      rewriteLabviewCliArgsForContainerWorkspace(
        [
          '-OperationName',
          'CreateComparisonReport',
          '-VI1',
          'C:\\old\\left.vi',
          '-VI2',
          'C:\\old\\right.vi',
          '-ReportPath',
          'C:\\old\\report.html',
          '-LabVIEWPath',
          'C:\\Wrong\\LabVIEW.exe',
          '-Headless',
          'false',
          '-c',
          '-o',
          '-description',
          'hello'
        ],
        {
          containerWorkspaceRoot: 'C:\\vi-history-suite',
          leftFilename: 'left.vi',
          rightFilename: 'right.vi',
          reportFilename: 'diff-report.vi.html',
          labviewPath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
        }
      )
    ).toEqual([
      '-OperationName',
      'CreateComparisonReport',
      '-VI1',
      'C:\\vi-history-suite\\staging\\left.vi',
      '-VI2',
      'C:\\vi-history-suite\\staging\\right.vi',
      '-ReportPath',
      'C:\\vi-history-suite\\diff-report.vi.html',
      '-o',
      '-description',
      'hello',
      '-LabVIEWPath',
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      '-Headless',
      'true'
    ]);
  });

  it('rewrites container LVCompare args only when both staged VI paths are present and preserves comparison flags', () => {
    expect(
      rewriteLvcompareArgsForContainerWorkspace(
        ['left.vi'],
        {
          containerWorkspaceRoot: 'C:\\vi-history-suite',
          leftFilename: 'left.vi',
          rightFilename: 'right.vi',
          labviewPath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
        }
      )
    ).toBeUndefined();

    expect(
      rewriteLvcompareArgsForContainerWorkspace(
        [
          'C:\\old\\left.vi',
          'C:\\old\\right.vi',
          '-lvpath',
          'C:\\Wrong\\LabVIEW.exe',
          '-nobdcosm',
          '-nofp'
        ],
        {
          containerWorkspaceRoot: 'C:\\vi-history-suite',
          leftFilename: 'left.vi',
          rightFilename: 'right.vi',
          labviewPath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
        }
      )
    ).toEqual([
      'C:\\vi-history-suite\\staging\\left.vi',
      'C:\\vi-history-suite\\staging\\right.vi',
      '-lvpath',
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      '-nobdcosm',
      '-nofp'
    ]);
  });

  it('parses Windows tasklist CSV and retains only observed LabVIEW runtime processes', async () => {
    await expect(
      observeWindowsRuntimeProcesses({
        hostPlatform: 'linux',
        runtimePlatform: 'linux',
        trigger: 'cli-log-banner'
      })
    ).resolves.toBeUndefined();

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
    expect(
      parseWindowsTasklistCsv(
        '"LabVIEW ""Quoted"".exe","44161","Console","1","10,240 K"\r\n' +
          '"bad-pid.exe","oops","Console","1","8,192 K"\r\n'
      )
    ).toEqual([
      {
        imageName: 'LabVIEW "Quoted".exe',
        pid: 44161,
        sessionName: 'Console',
        sessionNumber: 1,
        memUsage: '10,240 K'
      }
    ]);
    expect(parseWindowsTasklistCsv('"missing-columns-only"\r\n')).toEqual([]);

    const observation = await observeWindowsRuntimeProcesses(
      {
        hostPlatform: 'linux',
        runtimePlatform: 'win32',
        trigger: 'cli-log-banner'
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

    const execFileImpl = vi.fn(
      (
        file: string,
        _args: readonly string[] | undefined,
        _options:
          | { encoding: BufferEncoding; maxBuffer: number; windowsHide: boolean }
          | undefined,
        callback:
          | ((error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void)
          | undefined
      ) => {
        expect(file).toBe('tasklist');
        callback?.(new Error('tasklist-failed'), '', '');
      }
    );

    await expect(
      observeWindowsRuntimeProcesses(
        {
          hostPlatform: 'win32',
          runtimePlatform: 'win32',
          trigger: 'process-exit'
        },
        {
          execFileImpl: execFileImpl as never
        }
      )
    ).rejects.toThrow('tasklist-failed');
  });

  it('adds scoped observation notes when only LabVIEWCLI is seen at the retained snapshot', async () => {
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
          exitCode: 1,
          stdout: 'LabVIEWCLI started logging in file:  C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log\r\n',
          stderr: '',
          processObservation: {
            capturedAt: '2026-04-03T00:00:02.000Z',
            hostPlatform: 'linux',
            runtimePlatform: 'win32',
            trigger: 'cli-log-banner',
            observedProcesses: [{ imageName: 'LabVIEWCLI.exe', pid: 44152 }],
            observedProcessNames: ['LabVIEWCLI.exe'],
            labviewProcessObserved: false,
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
        processPlatform: 'win32',
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        readFile: vi.fn().mockResolvedValue(
          '"LabVIEWPath" command line argument is not passed. Using last used LabVIEW: "C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe"\n'
        ) as never
      }
    );

    expect(result.record.runtimeExecution.failureReason).toBe(
      'labview-cli-log-only-no-labview-at-banner-snapshot'
    );
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      'At the retained cli-log-banner snapshot (2026-04-03T00:00:02.000Z), observed LabVIEW-related processes: LabVIEWCLI.exe.'
    );
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      'At the retained cli-log-banner snapshot, LabVIEWCLI.exe was observed while LabVIEW.exe was not observed.'
    );
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      'At the retained cli-log-banner snapshot, LVCompare.exe was not observed.'
    );
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      'LabVIEW CLI exited nonzero without stderr and without generating a report; at the retained cli-log-banner snapshot, LabVIEWCLI.exe was observed while LabVIEW.exe was not observed.'
    );
  });

  it('retains explicit none notes when a governed process snapshot captured zero LabVIEW-related processes', async () => {
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
          exitCode: 1,
          stdout: 'LabVIEWCLI started logging in file:  C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log\r\n',
          stderr: '',
          processObservation: {
            capturedAt: '2026-04-03T00:00:02.000Z',
            hostPlatform: 'linux',
            runtimePlatform: 'win32',
            trigger: 'cli-log-banner',
            observedProcesses: [],
            observedProcessNames: [],
            labviewProcessObserved: false,
            labviewCliProcessObserved: false,
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

    expect(result.record.runtimeExecution.failureReason).toBe(
      'labview-cli-exited-nonzero-log-only-no-report'
    );
    expect(result.record.runtimeExecution.observedProcessNames).toEqual([]);
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      'At the retained cli-log-banner snapshot (2026-04-03T00:00:02.000Z), observed LabVIEW-related processes: none.'
    );
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      'At the retained cli-log-banner snapshot, LVCompare.exe was not observed.'
    );
  });

  it('classifies a stricter failure when LabVIEW stays absent through the retained exit snapshot', async () => {
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
          exitCode: 1,
          stdout: 'LabVIEWCLI started logging in file:  C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log\r\n',
          stderr: '',
          processObservation: {
            capturedAt: '2026-04-03T00:00:02.000Z',
            hostPlatform: 'linux',
            runtimePlatform: 'win32',
            trigger: 'cli-log-banner',
            observedProcesses: [{ imageName: 'LabVIEWCLI.exe', pid: 44152 }],
            observedProcessNames: ['LabVIEWCLI.exe'],
            labviewProcessObserved: false,
            labviewCliProcessObserved: true,
            lvcompareProcessObserved: false
          },
          exitProcessObservation: {
            capturedAt: '2026-04-03T00:00:03.000Z',
            hostPlatform: 'linux',
            runtimePlatform: 'win32',
            trigger: 'process-exit',
            observedProcesses: [{ imageName: 'LabVIEWCLI.exe', pid: 44152 }],
            observedProcessNames: ['LabVIEWCLI.exe'],
            labviewProcessObserved: false,
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
        processPlatform: 'win32',
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        readFile: vi.fn().mockResolvedValue(
          '"LabVIEWPath" command line argument is not passed. Using last used LabVIEW: "C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe"\n'
        ) as never
      }
    );

    expect(result.record.runtimeExecution.failureReason).toBe(
      'labview-cli-log-only-no-labview-through-exit'
    );
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      'At the retained process-exit snapshot (2026-04-03T00:00:03.000Z), observed LabVIEW-related processes: LabVIEWCLI.exe.'
    );
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      'At the retained process-exit snapshot, LabVIEWCLI.exe was observed while LabVIEW.exe was not observed.'
    );
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      'LabVIEW CLI exited nonzero without stderr and without generating a report; at the retained cli-log-banner and process-exit snapshots, LabVIEWCLI.exe was observed while LabVIEW.exe was not observed.'
    );
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

  it('captures process observations at the LabVIEW CLI banner and again at process exit', async () => {
    const bannerObservation = {
      capturedAt: '2026-04-03T00:00:01.000Z',
      hostPlatform: 'linux' as const,
      runtimePlatform: 'win32',
      trigger: 'cli-log-banner' as const,
      observedProcesses: [{ imageName: 'LabVIEWCLI.exe', pid: 44152 }],
      observedProcessNames: ['LabVIEWCLI.exe'],
      labviewProcessObserved: false,
      labviewCliProcessObserved: true,
      lvcompareProcessObserved: false
    };
    const exitObservation = {
      capturedAt: '2026-04-03T00:00:02.000Z',
      hostPlatform: 'linux' as const,
      runtimePlatform: 'win32',
      trigger: 'process-exit' as const,
      observedProcesses: [{ imageName: 'LabVIEWCLI.exe', pid: 44152 }],
      observedProcessNames: ['LabVIEWCLI.exe'],
      labviewProcessObserved: false,
      labviewCliProcessObserved: true,
      lvcompareProcessObserved: false
    };
    const observeWindowsProcesses = vi
      .fn()
      .mockResolvedValueOnce(bannerObservation)
      .mockResolvedValueOnce(exitObservation);

    const spawnImpl = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter & { setEncoding: (encoding: string) => void };
        stderr: EventEmitter & { setEncoding: (encoding: string) => void };
      };
      child.stdout = Object.assign(new EventEmitter(), {
        setEncoding: (_encoding: string) => undefined
      });
      child.stderr = Object.assign(new EventEmitter(), {
        setEncoding: (_encoding: string) => undefined
      });

      queueMicrotask(() => {
        child.stdout.emit(
          'data',
          'LabVIEWCLI started logging in file:  C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log\r\n'
        );
        child.stderr.emit('data', '');
        child.emit('close', 1, null);
      });

      return child as never;
    });

    await expect(
      runComparisonCommandPlanWithObservation(
        {
          executable: '/mnt/c/Program Files (x86)/National Instruments/Shared/LabVIEW CLI/LabVIEWCLI.exe',
          args: ['-OperationName', 'CreateComparisonReport']
        },
        {
          spawnImpl: spawnImpl as never,
          hostPlatform: 'linux',
          runtimePlatform: 'win32',
          observeWindowsProcesses
        }
      )
    ).resolves.toEqual({
      exitCode: 1,
      signal: undefined,
      stdout:
        'LabVIEWCLI started logging in file:  C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log\r\n',
      stderr: '',
      processObservation: bannerObservation,
      exitProcessObservation: exitObservation
    });
    expect(observeWindowsProcesses).toHaveBeenNthCalledWith(1, {
      hostPlatform: 'linux',
      runtimePlatform: 'win32',
      trigger: 'cli-log-banner'
    });
    expect(observeWindowsProcesses).toHaveBeenNthCalledWith(2, {
      hostPlatform: 'linux',
      runtimePlatform: 'win32',
      trigger: 'process-exit'
    });
  });

  it('captures the LabVIEW CLI banner observation only once even when stdout repeats the banner', async () => {
    const bannerObservation = {
      capturedAt: '2026-04-03T00:00:01.000Z',
      hostPlatform: 'linux' as const,
      runtimePlatform: 'win32',
      trigger: 'cli-log-banner' as const,
      observedProcesses: [{ imageName: 'LabVIEWCLI.exe', pid: 44152 }],
      observedProcessNames: ['LabVIEWCLI.exe'],
      labviewProcessObserved: false,
      labviewCliProcessObserved: true,
      lvcompareProcessObserved: false
    };
    const exitObservation = {
      capturedAt: '2026-04-03T00:00:02.000Z',
      hostPlatform: 'linux' as const,
      runtimePlatform: 'win32',
      trigger: 'process-exit' as const,
      observedProcesses: [],
      observedProcessNames: [],
      labviewProcessObserved: false,
      labviewCliProcessObserved: false,
      lvcompareProcessObserved: false
    };
    const observeWindowsProcesses = vi
      .fn()
      .mockResolvedValueOnce(bannerObservation)
      .mockResolvedValueOnce(exitObservation);

    const spawnImpl = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter & { setEncoding: (encoding: string) => void };
        stderr: EventEmitter & { setEncoding: (encoding: string) => void };
      };
      child.stdout = Object.assign(new EventEmitter(), {
        setEncoding: (_encoding: string) => undefined
      });
      child.stderr = Object.assign(new EventEmitter(), {
        setEncoding: (_encoding: string) => undefined
      });

      queueMicrotask(() => {
        child.stdout.emit(
          'data',
          'LabVIEWCLI started logging in file:  C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log\r\n'
        );
        child.stdout.emit(
          'data',
          'LabVIEWCLI started logging in file:  C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log\r\n'
        );
        child.emit('close', 1, null);
      });

      return child as never;
    });

    await expect(
      runComparisonCommandPlanWithObservation(
        {
          executable: '/mnt/c/Program Files (x86)/National Instruments/Shared/LabVIEW CLI/LabVIEWCLI.exe',
          args: ['-OperationName', 'CreateComparisonReport']
        },
        {
          spawnImpl: spawnImpl as never,
          hostPlatform: 'linux',
          runtimePlatform: 'win32',
          observeWindowsProcesses
        }
      )
    ).resolves.toEqual({
      exitCode: 1,
      signal: undefined,
      stdout:
        'LabVIEWCLI started logging in file:  C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log\r\n' +
        'LabVIEWCLI started logging in file:  C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log\r\n',
      stderr: '',
      processObservation: bannerObservation,
      exitProcessObservation: exitObservation
    });
    expect(observeWindowsProcesses).toHaveBeenCalledTimes(2);
  });

  it('captures process observations at process spawn and again at process exit for lvcompare', async () => {
    const spawnObservation = {
      capturedAt: '2026-04-03T00:00:01.000Z',
      hostPlatform: 'linux' as const,
      runtimePlatform: 'win32',
      trigger: 'process-spawn' as const,
      observedProcesses: [{ imageName: 'LVCompare.exe', pid: 55221 }],
      observedProcessNames: ['LVCompare.exe'],
      labviewProcessObserved: false,
      labviewCliProcessObserved: false,
      lvcompareProcessObserved: true
    };
    const exitObservation = {
      capturedAt: '2026-04-03T00:00:03.000Z',
      hostPlatform: 'linux' as const,
      runtimePlatform: 'win32',
      trigger: 'process-exit' as const,
      observedProcesses: [],
      observedProcessNames: [],
      labviewProcessObserved: false,
      labviewCliProcessObserved: false,
      lvcompareProcessObserved: false
    };
    const observeWindowsProcesses = vi
      .fn()
      .mockResolvedValueOnce(spawnObservation)
      .mockResolvedValueOnce(exitObservation);

    const spawnImpl = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter & { setEncoding: (encoding: string) => void };
        stderr: EventEmitter & { setEncoding: (encoding: string) => void };
      };
      child.stdout = Object.assign(new EventEmitter(), {
        setEncoding: (_encoding: string) => undefined
      });
      child.stderr = Object.assign(new EventEmitter(), {
        setEncoding: (_encoding: string) => undefined
      });

      queueMicrotask(() => {
        child.emit('spawn');
        child.emit('close', 0, null);
      });

      return child as never;
    });

    await expect(
      runComparisonCommandPlanWithObservation(
        {
          executable: '/mnt/c/Program Files (x86)/National Instruments/Shared/LabVIEW Compare/LVCompare.exe',
          args: ['left.vi', 'right.vi', '-lvpath', 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe']
        },
        {
          spawnImpl: spawnImpl as never,
          hostPlatform: 'linux',
          runtimePlatform: 'win32',
          engine: 'lvcompare',
          observeWindowsProcesses
        }
      )
    ).resolves.toEqual({
      exitCode: 0,
      signal: undefined,
      stdout: '',
      stderr: '',
      processObservation: spawnObservation,
      exitProcessObservation: exitObservation
    });
    expect(observeWindowsProcesses).toHaveBeenNthCalledWith(1, {
      hostPlatform: 'linux',
      runtimePlatform: 'win32',
      trigger: 'process-spawn'
    });
    expect(observeWindowsProcesses).toHaveBeenNthCalledWith(2, {
      hostPlatform: 'linux',
      runtimePlatform: 'win32',
      trigger: 'process-exit'
    });
  });

  it('does not start runtime observation when stdout never emits the LabVIEW CLI banner', async () => {
    const observeWindowsProcesses = vi.fn();
    const spawnImpl = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter & { setEncoding: (encoding: string) => void };
        stderr: EventEmitter & { setEncoding: (encoding: string) => void };
      };
      child.stdout = Object.assign(new EventEmitter(), {
        setEncoding: (_encoding: string) => undefined
      });
      child.stderr = Object.assign(new EventEmitter(), {
        setEncoding: (_encoding: string) => undefined
      });

      queueMicrotask(() => {
        child.stdout.emit('data', 'non-banner stdout\r\n');
        child.emit('close', 0, null);
      });

      return child as never;
    });

    await expect(
      runComparisonCommandPlanWithObservation(
        {
          executable: '/mnt/c/Program Files (x86)/National Instruments/Shared/LabVIEW CLI/LabVIEWCLI.exe',
          args: ['-OperationName', 'CreateComparisonReport']
        },
        {
          spawnImpl: spawnImpl as never,
          hostPlatform: 'linux',
          runtimePlatform: 'win32',
          observeWindowsProcesses
        }
      )
    ).resolves.toEqual({
      exitCode: 0,
      signal: undefined,
      stdout: 'non-banner stdout\r\n',
      stderr: '',
      processObservation: undefined,
      exitProcessObservation: undefined
    });
    expect(observeWindowsProcesses).not.toHaveBeenCalled();
  });

  it('fails closed when banner process observation capture errors', async () => {
    const spawnImpl = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter & { setEncoding: (encoding: string) => void };
        stderr: EventEmitter & { setEncoding: (encoding: string) => void };
      };
      child.stdout = Object.assign(new EventEmitter(), {
        setEncoding: (_encoding: string) => undefined
      });
      child.stderr = Object.assign(new EventEmitter(), {
        setEncoding: (_encoding: string) => undefined
      });

      queueMicrotask(() => {
        child.stdout.emit(
          'data',
          'LabVIEWCLI started logging in file:  C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log\r\n'
        );
        child.emit('close', 1, null);
      });

      return child as never;
    });

    await expect(
      runComparisonCommandPlanWithObservation(
        {
          executable: '/mnt/c/Program Files (x86)/National Instruments/Shared/LabVIEW CLI/LabVIEWCLI.exe',
          args: ['-OperationName', 'CreateComparisonReport']
        },
        {
          spawnImpl: spawnImpl as never,
          hostPlatform: 'linux',
          runtimePlatform: 'win32',
          observeWindowsProcesses: vi.fn().mockRejectedValue(new Error('banner-observation-failed'))
        }
      )
    ).rejects.toThrow('banner-observation-failed');
  });

  it('fails closed when lvcompare spawn observation capture errors', async () => {
    const spawnImpl = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter & { setEncoding: (encoding: string) => void };
        stderr: EventEmitter & { setEncoding: (encoding: string) => void };
      };
      child.stdout = Object.assign(new EventEmitter(), {
        setEncoding: (_encoding: string) => undefined
      });
      child.stderr = Object.assign(new EventEmitter(), {
        setEncoding: (_encoding: string) => undefined
      });

      queueMicrotask(() => {
        child.emit('spawn');
        child.emit('close', 0, null);
      });

      return child as never;
    });

    await expect(
      runComparisonCommandPlanWithObservation(
        {
          executable: '/mnt/c/Program Files (x86)/National Instruments/Shared/LabVIEW Compare/LVCompare.exe',
          args: ['left.vi', 'right.vi']
        },
        {
          spawnImpl: spawnImpl as never,
          hostPlatform: 'linux',
          runtimePlatform: 'win32',
          engine: 'lvcompare',
          observeWindowsProcesses: vi.fn().mockRejectedValue(new Error('spawn-observation-failed'))
        }
      )
    ).rejects.toThrow('spawn-observation-failed');
  });

  it('fails closed when the observed command closes without an exit code', async () => {
    const spawnImpl = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter & { setEncoding: (encoding: string) => void };
        stderr: EventEmitter & { setEncoding: (encoding: string) => void };
      };
      child.stdout = Object.assign(new EventEmitter(), {
        setEncoding: (_encoding: string) => undefined
      });
      child.stderr = Object.assign(new EventEmitter(), {
        setEncoding: (_encoding: string) => undefined
      });

      queueMicrotask(() => {
        child.emit('close', null, null);
      });

      return child as never;
    });

    await expect(
      runComparisonCommandPlanWithObservation(
        {
          executable: '/mnt/c/Program Files (x86)/National Instruments/Shared/LabVIEW CLI/LabVIEWCLI.exe',
          args: ['-OperationName', 'CreateComparisonReport']
        },
        {
          spawnImpl: spawnImpl as never,
          hostPlatform: 'linux',
          runtimePlatform: 'win32'
        }
      )
    ).rejects.toThrow('comparison-command-closed-without-exit-code');
  });

  it('fails closed when exit process observation capture errors after the banner snapshot', async () => {
    const spawnImpl = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter & { setEncoding: (encoding: string) => void };
        stderr: EventEmitter & { setEncoding: (encoding: string) => void };
      };
      child.stdout = Object.assign(new EventEmitter(), {
        setEncoding: (_encoding: string) => undefined
      });
      child.stderr = Object.assign(new EventEmitter(), {
        setEncoding: (_encoding: string) => undefined
      });

      queueMicrotask(() => {
        child.stdout.emit(
          'data',
          'LabVIEWCLI started logging in file:  C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log\r\n'
        );
        child.emit('close', 1, null);
      });

      return child as never;
    });
    const observeWindowsProcesses = vi
      .fn()
      .mockResolvedValueOnce({
        capturedAt: '2026-04-03T00:00:01.000Z',
        hostPlatform: 'linux' as const,
        runtimePlatform: 'win32',
        trigger: 'cli-log-banner' as const,
        observedProcesses: [{ imageName: 'LabVIEWCLI.exe', pid: 44152 }],
        observedProcessNames: ['LabVIEWCLI.exe'],
        labviewProcessObserved: false,
        labviewCliProcessObserved: true,
        lvcompareProcessObserved: false
      })
      .mockRejectedValueOnce(new Error('exit-observation-failed'));

    await expect(
      runComparisonCommandPlanWithObservation(
        {
          executable: '/mnt/c/Program Files (x86)/National Instruments/Shared/LabVIEW CLI/LabVIEWCLI.exe',
          args: ['-OperationName', 'CreateComparisonReport']
        },
        {
          spawnImpl: spawnImpl as never,
          hostPlatform: 'linux',
          runtimePlatform: 'win32',
          observeWindowsProcesses
        }
      )
    ).rejects.toThrow('exit-observation-failed');
  });

  it('fails with a container-command-build reason when a Windows container run has no supported PowerShell host', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.provider = 'windows-container';
    record.runtimeSelection.windowsContainerImage = 'nationalinstruments/labview:2026q1-windows';
    record.runtimeSelection.engine = 'labview-cli';

    const result = await executeComparisonReport(
      {
        record,
        repositoryRoot: '/workspace/repo',
        interopWorkspaceRoot: '/mnt/c/interop'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'darwin'
      }
    );

    expect(result.record.runtimeExecutionState).toBe('failed');
    expect(result.record.runtimeExecution.attempted).toBe(false);
    expect(result.record.runtimeExecution.failureReason).toBe(
      'windows-container-command-build-failed'
    );
    expect(result.record.runtimeExecution.doctorSummaryLines).toContain(
      'Selected provider=windows-container; engine=labview-cli; platform=win32; preferBitness=x86.'
    );
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
