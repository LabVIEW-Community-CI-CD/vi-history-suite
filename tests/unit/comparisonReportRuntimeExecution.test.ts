import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import {
  classifyLabviewCliDiagnosticText,
  executeComparisonReport,
  runComparisonCommandPlanWithObservation
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
      bitness: 'x86',
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

function createWindowsContainerReadyRecord(): ComparisonReportPacketRecord {
  const reportDirectory = 'C:\\workspace\\.storage\\reports\\repoid123456\\fileid123456';
  const stagingDirectory = `${reportDirectory}\\staging`;

  return {
    ...createReadyRecord(),
    artifactPlan: {
      ...createReadyRecord().artifactPlan,
      reportDirectory,
      stagingDirectory,
      reportFilePath: `${reportDirectory}\\diff-report-foo.vi.html`,
      packetFilePath: `${reportDirectory}\\report-packet.html`,
      metadataFilePath: `${reportDirectory}\\report-metadata.json`,
      runtimeStdoutFilePath: `${reportDirectory}\\runtime-stdout.txt`,
      runtimeStderrFilePath: `${reportDirectory}\\runtime-stderr.txt`,
      runtimeDiagnosticLogFilePath: `${reportDirectory}\\runtime-diagnostic-log.txt`,
      runtimeProcessObservationFilePath: `${reportDirectory}\\runtime-process-observation.json`,
      allowedLocalRootPaths: ['C:\\workspace\\.storage', 'C:\\workspace\\.storage\\reports\\repoid123456']
    },
    stagedRevisionPlan: {
      leftFilename: 'left-111111112222-foo.vi',
      leftFilePath: `${stagingDirectory}\\left-111111112222-foo.vi`,
      rightFilename: 'right-abcdef123456-foo.vi',
      rightFilePath: `${stagingDirectory}\\right-abcdef123456-foo.vi`
    },
    runtimeSelection: {
      ...createReadyRecord().runtimeSelection,
      bitness: 'x64',
      provider: 'windows-container',
      executionMode: 'auto',
      containerImage: 'nationalinstruments/labview:2026q1-windows',
      labviewExe: {
        kind: 'labview-exe',
        path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
        source: 'configured',
        exists: true,
        bitness: 'x64'
      },
      labviewCli: {
        kind: 'labview-cli',
        path: 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        source: 'configured',
        exists: true,
        bitness: 'x86'
      }
    },
    runtimeExecution: {
      ...createReadyRecord().runtimeExecution,
      stdoutFilePath: `${reportDirectory}\\runtime-stdout.txt`,
      stderrFilePath: `${reportDirectory}\\runtime-stderr.txt`
    }
  };
}

describe('comparisonReportRuntimeExecution', () => {
  it('settles observed host commands on process exit even when LabVIEW keeps stdio open', async () => {
    const stdout = Object.assign(new EventEmitter(), {
      setEncoding: vi.fn(),
      destroy: vi.fn()
    });
    const stderr = Object.assign(new EventEmitter(), {
      setEncoding: vi.fn(),
      destroy: vi.fn()
    });
    const child = Object.assign(new EventEmitter(), {
      stdout,
      stderr,
      pid: 4242,
      kill: vi.fn()
    });
    const spawnImpl = vi.fn(() => child);

    const resultPromise = runComparisonCommandPlanWithObservation(
      {
        executable: '/usr/local/bin/LabVIEWCLI',
        args: ['-OperationName', 'CreateComparisonReport']
      },
      {
        spawnImpl: spawnImpl as never,
        hostPlatform: 'linux',
        runtimePlatform: 'linux',
        engine: 'labview-cli',
        observeWindowsProcesses: vi.fn().mockResolvedValue(undefined)
      }
    );

    child.emit('spawn');
    stdout.emit('data', 'CreateComparisonReport operation succeeded.\n');
    child.emit('exit', 0, null);

    await expect(resultPromise).resolves.toMatchObject({
      exitCode: 0,
      stdout: 'CreateComparisonReport operation succeeded.\n'
    });
    expect(stdout.destroy).toHaveBeenCalledTimes(1);
    expect(stderr.destroy).toHaveBeenCalledTimes(1);
  });

  it('stages each revision from its resolved historical relative path when the VI moved', async () => {
    const readRevisionBlob = vi
      .fn()
      .mockResolvedValueOnce(Buffer.from('left'))
      .mockResolvedValueOnce(Buffer.from('right'));
    const record = createReadyRecord();
    record.preflight.left.resolvedRelativePath = 'Examples/foo.vi';
    record.preflight.left.blobSpecifier = '1111111122222222:Examples/foo.vi';
    record.preflight.right.resolvedRelativePath = 'Source/Examples/foo.vi';
    record.preflight.right.blobSpecifier = 'abcdef1234567890:Source/Examples/foo.vi';
    record.preflight.normalizedRelativePath = 'Source/Examples/foo.vi';
    record.artifactPlan.normalizedRelativePath = 'Source/Examples/foo.vi';

    await executeComparisonReport(
      {
        record,
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob,
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: 'command stdout',
          stderr: ''
        }),
        nowIso: vi.fn().mockReturnValueOnce('2026-04-02T01:00:00.000Z').mockReturnValueOnce('2026-04-02T01:00:03.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(4000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(readRevisionBlob).toHaveBeenNthCalledWith(
      1,
      '/workspace/repo',
      '1111111122222222',
      'Examples/foo.vi'
    );
    expect(readRevisionBlob).toHaveBeenNthCalledWith(
      2,
      '/workspace/repo',
      'abcdef1234567890',
      'Source/Examples/foo.vi'
    );
  });

  it('retains a bounded host timeout diagnostic when LabVIEWCLI is observed without LabVIEW through exit', async () => {
    const record = createReadyRecord();
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
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 124,
          stdout: 'command stdout',
          stderr: '',
          timedOut: true,
          timeoutMs: 120000,
          processObservation: {
            capturedAt: '2026-04-19T21:00:01.000Z',
            trigger: 'cli-log-banner',
            observedProcesses: [
              {
                imageName: 'LabVIEWCLI.exe',
                pid: 4242
              }
            ],
            observedProcessNames: ['LabVIEWCLI.exe'],
            labviewProcessObserved: false,
            labviewCliProcessObserved: true,
            lvcompareProcessObserved: false
          },
          exitProcessObservation: {
            capturedAt: '2026-04-19T21:02:01.000Z',
            trigger: 'process-exit',
            observedProcesses: [],
            observedProcessNames: [],
            labviewProcessObserved: false,
            labviewCliProcessObserved: false,
            lvcompareProcessObserved: false
          }
        }),
        nowIso: vi
          .fn()
          .mockReturnValueOnce('2026-04-19T21:00:00.000Z')
          .mockReturnValueOnce('2026-04-19T21:02:01.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(121000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecution.failureReason).toBe('command-timed-out');
    expect(result.record.runtimeExecution.diagnosticReason).toBe(
      'labview-cli-timeout-no-labview-through-exit'
    );
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      'Comparison-report runtime timed out after 120000ms.'
    );
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      'LabVIEW CLI timed out without generating a report; at the retained cli-log-banner snapshot, LabVIEWCLI.exe was observed while LabVIEW.exe was not observed, and no LabVIEW-related processes remained at the retained process-exit snapshot.'
    );
    expect(result.record.runtimeExecution.observedProcessNames).toEqual(['LabVIEWCLI.exe']);
    expect(result.record.runtimeExecution.exitObservedProcessNames).toEqual([]);
  });

  it('classifies password-protected CreateComparisonReport failures from retained LabVIEW CLI diagnostics', () => {
    const result = classifyLabviewCliDiagnosticText(
      [
        'Using LabVIEW: "C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe"',
        'Connection established with LabVIEW at port number 3363.',
        'Operation output:',
        'LabVIEW: (Hex 0x410) VI is password protected.',
        'CreateComparisonReport operation failed.'
      ].join('\r\n'),
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    );

    expect(result.reason).toBe('labview-cli-vi-password-protected');
    expect(result.notes).toContain(
      'LabVIEW CLI connected to LabVIEW before CreateComparisonReport failed because one or both selected VI revisions are password protected.'
    );
  });

  it('retries windows-container call-by-reference failures through containerized CloseLabVIEW and retains the normalized failure reason', async () => {
    const record = createWindowsContainerReadyRecord();
    const diagnosticLogPath =
      'C:\\workspace\\.storage\\reports\\repoid123456\\fileid123456\\container-temp\\lvtemporary_123.log';
    const matchesDiagnosticLogPath = (filePath: string) =>
      filePath.replaceAll('/', '\\') === diagnosticLogPath;
    const diagnosticText = [
      'Using LabVIEW: "C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe"',
      'Connection established with LabVIEW at port number 3363.',
      'Error code : 66',
      'Error message : Call By Reference in RunExecuteOperationVI.vi->RunOperationCore.vi->RunOperation.vi->RunOperation.vi.ProxyCaller',
      'An error occurred while running the LabVIEW CLI.'
    ].join('\r\n');
    const runtimeStdout = [
      'LabVIEWCLI started logging in file:  C:\\vi-history-suite\\container-temp\\lvtemporary_123.log',
      'Using LabVIEW: "C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe"',
      'Connection established with LabVIEW at port number 3363.',
      '[vi-history-suite-container-meta]retryAttempts=1;prelaunchAttempted=1;iniPath=C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.ini;connectedPort=3363;openTimeout=180;afterLaunchTimeout=180.'
    ].join('\n');
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({
        exitCode: 130,
        signal: 'SIGKILL',
        stdout: runtimeStdout,
        stderr: 'comparison-command cancelled by user\n',
        cancelled: true
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'close ok',
        stderr: ''
      })
      .mockResolvedValueOnce({
        exitCode: 130,
        signal: 'SIGKILL',
        stdout: runtimeStdout,
        stderr: 'comparison-command cancelled by user\n',
        cancelled: true
      });
    const pathExists = vi.fn(async (filePath: string) => matchesDiagnosticLogPath(filePath));
    const readFile = vi.fn(async (filePath: string) => {
      if (matchesDiagnosticLogPath(filePath)) {
        return diagnosticText;
      }
      throw new Error(`Unexpected read: ${filePath}`);
    });

    const result = await executeComparisonReport(
      {
        record,
        repositoryRoot: 'C:\\workspace\\repo'
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
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
        readdir: vi.fn().mockResolvedValue([]) as never,
        readFile: readFile as never,
        pathExists,
        runCommand,
        nowIso: vi.fn().mockReturnValue('2026-04-19T22:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(runCommand).toHaveBeenCalledTimes(3);
    expect(runCommand.mock.calls[1]?.[0]).toMatchObject({
      executable: 'powershell.exe'
    });
    expect(result.record.runtimeExecution.failureReason).toBe('command-exited-nonzero');
    expect(result.record.runtimeExecution.diagnosticReason).toBe('labview-cli-call-by-reference');
    expect(result.record.runtimeExecution.headlessSessionResetExecutable).toBe('powershell.exe');
    expect(result.record.runtimeExecution.headlessSessionResetExitCode).toBe(0);
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      'Attempted Windows headless session reset via LabVIEWCLI CloseLabVIEW after call-by-reference diagnosis, then retried the pair once.'
    );
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      'Comparison-report runtime retained a LabVIEW CLI Error 66 / Call By Reference failure before a cancellation-shaped transport exit was observed.'
    );
  });
});
