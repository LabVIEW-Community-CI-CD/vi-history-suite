import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import {
  buildStagedRevisionPlan,
} from '../../src/reporting/comparisonReportPlan';
import {
  classifyLabviewCliDiagnosticText,
  executeComparisonReport,
  inferLabviewBitnessFromExecutablePath,
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
    record.stagedRevisionPlan = buildStagedRevisionPlan({
      stagingDirectory: record.artifactPlan.stagingDirectory,
      fullFilename: record.artifactPlan.fullFilename,
      leftRevisionId: record.baseHash,
      rightRevisionId: record.selectedHash
    });

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

  it('retains deterministic staged filenames that embed revision identity even when the VI moved', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const record = createReadyRecord();
    record.preflight.left.resolvedRelativePath = 'Examples/foo.vi';
    record.preflight.left.blobSpecifier = '1111111122222222:Examples/foo.vi';
    record.preflight.right.resolvedRelativePath = 'Source/Examples/foo.vi';
    record.preflight.right.blobSpecifier = 'abcdef1234567890:Source/Examples/foo.vi';
    record.preflight.normalizedRelativePath = 'Source/Examples/foo.vi';
    record.artifactPlan.normalizedRelativePath = 'Source/Examples/foo.vi';
    record.stagedRevisionPlan = buildStagedRevisionPlan({
      stagingDirectory: record.artifactPlan.stagingDirectory,
      fullFilename: record.artifactPlan.fullFilename,
      leftRevisionId: record.baseHash,
      rightRevisionId: record.selectedHash
    });

    const result = await executeComparisonReport(
      {
        record,
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left-blob-content'))
          .mockResolvedValueOnce(Buffer.from('right-blob-content')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: writeFile as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: 'command stdout',
          stderr: ''
        }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    const leftStagedPath = record.stagedRevisionPlan.leftFilePath;
    const rightStagedPath = record.stagedRevisionPlan.rightFilePath;
    expect(leftStagedPath).toContain('left-111111112222');
    expect(rightStagedPath).toContain('right-abcdef123456');
    expect(writeFile).toHaveBeenCalledWith(leftStagedPath, Buffer.from('left-blob-content'));
    expect(writeFile).toHaveBeenCalledWith(rightStagedPath, Buffer.from('right-blob-content'));
    expect(result.record.stagedRevisionPlan.leftFilename).toBe('left-111111112222-foo.vi');
    expect(result.record.stagedRevisionPlan.rightFilename).toBe('right-abcdef123456-foo.vi');
  });

  it('fails closed with a retained reason when left blob staging fails', async () => {
    const record = createReadyRecord();
    const readRevisionBlob = vi.fn().mockRejectedValueOnce(new Error('blob-not-found'));

    const result = await executeComparisonReport(
      {
        record,
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob,
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: '',
          stderr: ''
        }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.attempted).toBe(false);
    expect(result.record.runtimeExecution.failureReason).toBe('left-stage-blob-write-failed');
    expect(result.record.runtimeExecution.reportExists).toBe(false);
  });

  it('fails closed with a retained reason when right blob staging fails', async () => {
    const record = createReadyRecord();
    const readRevisionBlob = vi
      .fn()
      .mockResolvedValueOnce(Buffer.from('left-blob-content'))
      .mockRejectedValueOnce(new Error('blob-not-found'));

    const result = await executeComparisonReport(
      {
        record,
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob,
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: '',
          stderr: ''
        }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.attempted).toBe(false);
    expect(result.record.runtimeExecution.failureReason).toBe('right-stage-blob-write-failed');
    expect(result.record.runtimeExecution.reportExists).toBe(false);
  });

  it('rejects stale generated reports with retained evidence explaining the staged filename mismatch', async () => {
    const record = createReadyRecord();
    const pathExists = vi.fn(async (filePath: string) => filePath === record.artifactPlan.reportFilePath);
    const readFile = vi.fn().mockResolvedValue(
      '<html>Report for old-left.vi and old-right.vi</html>'
    );
    const removePath = vi.fn().mockResolvedValue(undefined);

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
        removePath: removePath as never,
        unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
        readdir: vi.fn().mockResolvedValue([]) as never,
        readFile: readFile as never,
        pathExists,
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 1,
          stdout: 'CreateComparisonReport operation failed.',
          stderr: ''
        }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        enforceWindowsHostPreflight: false,
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.reportExists).toBe(false);
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      `Generated comparison report did not reference the current staged revisions (${record.stagedRevisionPlan.leftFilename}, ${record.stagedRevisionPlan.rightFilename}) and was discarded as stale output.`
    );
    expect(removePath).toHaveBeenCalled();
  });

  it('copies Linux container reports back with canonical staged names and retained asset directories', async () => {
    const record = createReadyRecord();
    record.artifactPlan.fullFilename = 'foo bar.vi';
    record.artifactPlan.reportFilename = 'diff-report-foo bar.vi.html';
    record.artifactPlan.reportFilePath = `${record.artifactPlan.reportDirectory}/diff-report-foo bar.vi.html`;
    record.stagedRevisionPlan = buildStagedRevisionPlan({
      stagingDirectory: record.artifactPlan.stagingDirectory,
      fullFilename: record.artifactPlan.fullFilename,
      leftRevisionId: record.baseHash,
      rightRevisionId: record.selectedHash
    });
    record.runtimeSelection = {
      ...record.runtimeSelection,
      platform: 'win32',
      containerRuntimePlatform: 'linux',
      provider: 'linux-container',
      containerImage: 'nationalinstruments/labview:2026q1-linux',
      containerImageAvailable: true,
      containerAcquisitionState: 'not-required',
      labviewExe: {
        kind: 'labview-exe',
        path: '/usr/local/natinst/LabVIEW-2026-64/labview',
        source: 'scan',
        exists: true,
        bitness: 'x64'
      },
      labviewCli: {
        kind: 'labview-cli',
        path: '/usr/local/bin/LabVIEWCLI',
        source: 'scan',
        exists: true,
        bitness: 'x64'
      }
    };
    const aliasReportPath = `${record.artifactPlan.reportDirectory}/diff-report-foo_bar.vi.html`;
    const aliasAssetsPath = `${record.artifactPlan.reportDirectory}/diff-report-foo_bar.vi_files`;
    const canonicalAssetsPath = `${record.artifactPlan.reportDirectory}/diff-report-foo bar.vi_files`;
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const copyDirectory = vi.fn().mockResolvedValue(undefined);
    const readFile = vi.fn(async (filePath: string) => {
      if (filePath === aliasReportPath) {
        return [
          record.stagedRevisionPlan.leftFilename.replaceAll(' ', '_'),
          record.stagedRevisionPlan.rightFilename.replaceAll(' ', '_'),
          'diff-report-foo_bar.vi_files'
        ].join('\n');
      }
      return '';
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
        writeFile: writeFile as never,
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        copyDirectory: copyDirectory as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
        readdir: vi.fn().mockResolvedValue([]) as never,
        readFile: readFile as never,
        pathExists: vi.fn(async (filePath: string) =>
          filePath === aliasReportPath || filePath === aliasAssetsPath
        ),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: 'CreateComparisonReport operation succeeded.\n',
          stderr: ''
        }),
        nowIso: vi
          .fn()
          .mockReturnValueOnce('2026-05-28T10:00:00.000Z')
          .mockReturnValueOnce('2026-05-28T10:00:02.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(3000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecution.state).toBe('succeeded');
    expect(result.record.runtimeExecution.reportExists).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(
      record.artifactPlan.reportFilePath,
      expect.stringContaining(record.stagedRevisionPlan.leftFilename),
      'utf8'
    );
    expect(writeFile).toHaveBeenCalledWith(
      record.artifactPlan.reportFilePath,
      expect.not.stringContaining(record.stagedRevisionPlan.leftFilename.replaceAll(' ', '_')),
      'utf8'
    );
    expect(copyDirectory).toHaveBeenCalledWith(aliasAssetsPath, canonicalAssetsPath, {
      recursive: true,
      force: true
    });
  });

  it('skips the clean-host Windows preflight when installed-user host compare admits an existing LabVIEW session', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.allowExistingWindowsHostRuntime = true;
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'command stdout',
      stderr: ''
    });
    const observeWindowsProcesses = vi.fn().mockResolvedValue({
      capturedAt: '2026-05-11T12:00:00.000Z',
      hostPlatform: 'win32',
      runtimePlatform: 'win32',
      trigger: 'preflight',
      observedProcesses: [
        {
          imageName: 'LabVIEW.exe',
          pid: 7320
        }
      ],
      observedProcessNames: ['LabVIEW.exe'],
      labviewProcessObserved: true,
      labviewCliProcessObserved: false,
      lvcompareProcessObserved: false
    });
    const observeWindowsTcpListeners = vi.fn().mockResolvedValue([
      {
        localAddress: '0.0.0.0',
        localPort: 3363,
        pid: 7320,
        processName: 'LabVIEW.exe'
      }
    ]);

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
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
        readdir: vi.fn().mockResolvedValue([]) as never,
        readFile: vi.fn().mockResolvedValue('server.tcp.enabled=True\nserver.tcp.port=3363\n') as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand,
        nowIso: vi
          .fn()
          .mockReturnValueOnce('2026-05-11T12:00:00.000Z')
          .mockReturnValueOnce('2026-05-11T12:00:03.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(4000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32',
        enforceWindowsHostPreflight: true,
        observeWindowsProcesses,
        observeWindowsTcpListeners,
        disableDiagnostics: true
      }
    );

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(observeWindowsProcesses).not.toHaveBeenCalled();
    expect(observeWindowsTcpListeners).not.toHaveBeenCalled();
    expect(result.record.runtimeExecution.attempted).toBe(true);
    expect(result.record.runtimeExecution.blockedReason).toBeUndefined();
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
        enforceWindowsHostPreflight: false,
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

  it('reclassifies a nonzero exit as labview-host-bitness-conflict when exit snapshot shows different-bitness LabVIEW (VHS-REQ-621)', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.bitness = 'x86';
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
          exitCode: 1,
          stdout: 'launch failed',
          stderr: 'failed to launch',
          exitProcessObservation: {
            capturedAt: '2026-05-31T12:00:01.000Z',
            trigger: 'process-exit',
            observedProcesses: [
              { imageName: 'LabVIEW.exe', pid: 1234 }
            ],
            observedProcessNames: ['LabVIEW.exe'],
            labviewProcessObserved: true,
            labviewCliProcessObserved: false,
            lvcompareProcessObserved: false,
            labviewProcessBitness: 'x64',
            labviewProcessExecutablePath:
              'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
          }
        }),
        nowIso: vi
          .fn()
          .mockReturnValueOnce('2026-05-31T12:00:00.000Z')
          .mockReturnValueOnce('2026-05-31T12:00:01.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(2000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        enforceWindowsHostPreflight: false,
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecution.failureReason).toBe('labview-host-bitness-conflict');
    expect(result.record.runtimeExecution.diagnosticNotes?.join('\n')).toContain(
      'LabVIEW x64 was running at the retained process-exit snapshot'
    );
    expect(result.record.runtimeExecution.diagnosticNotes?.join('\n')).toContain(
      'comparison-report execution targeted LabVIEW x86'
    );
  });

  it('keeps a nonzero exit as command-exited-nonzero when exit snapshot shows matching-bitness LabVIEW (VHS-REQ-621)', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.bitness = 'x64';
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
          exitCode: 1,
          stdout: '',
          stderr: 'other error',
          exitProcessObservation: {
            capturedAt: '2026-05-31T12:00:01.000Z',
            trigger: 'process-exit',
            observedProcesses: [{ imageName: 'LabVIEW.exe', pid: 4242 }],
            observedProcessNames: ['LabVIEW.exe'],
            labviewProcessObserved: true,
            labviewCliProcessObserved: false,
            lvcompareProcessObserved: false,
            labviewProcessBitness: 'x64',
            labviewProcessExecutablePath:
              'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
          }
        }),
        nowIso: vi
          .fn()
          .mockReturnValueOnce('2026-05-31T12:00:00.000Z')
          .mockReturnValueOnce('2026-05-31T12:00:01.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(2000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        enforceWindowsHostPreflight: false,
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecution.failureReason).toBe('command-exited-nonzero');
  });

  it('keeps a nonzero exit as command-exited-nonzero when exit snapshot has unknown-bitness LabVIEW (VHS-REQ-621)', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.bitness = 'x64';
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
          exitCode: 1,
          stdout: '',
          stderr: 'launch fail',
          exitProcessObservation: {
            capturedAt: '2026-05-31T12:00:01.000Z',
            trigger: 'process-exit',
            observedProcesses: [{ imageName: 'LabVIEW.exe', pid: 7777 }],
            observedProcessNames: ['LabVIEW.exe'],
            labviewProcessObserved: true,
            labviewCliProcessObserved: false,
            lvcompareProcessObserved: false,
            labviewProcessBitness: 'unknown'
          }
        }),
        nowIso: vi
          .fn()
          .mockReturnValueOnce('2026-05-31T12:00:00.000Z')
          .mockReturnValueOnce('2026-05-31T12:00:01.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(2000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        enforceWindowsHostPreflight: false,
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecution.failureReason).toBe('command-exited-nonzero');
  });

  it('does not attach stale Linux headless diagnostics to a non-headless host success', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.platform = 'linux';
    record.runtimeSelection.bitness = 'x64';
    record.runtimeSelection.provider = 'host-native';
    record.runtimeSelection.executionMode = 'host-only';
    record.runtimeSelection.requestedProvider = 'host';
    record.runtimeSelection.labviewExe = {
      kind: 'labview-exe',
      path: '/usr/local/natinst/LabVIEW-2026-64/labview',
      source: 'configured',
      exists: true,
      bitness: 'x64'
    };
    record.runtimeSelection.labviewCli = {
      kind: 'labview-cli',
      path: '/usr/local/bin/LabVIEWCLI',
      source: 'configured',
      exists: true,
      bitness: 'x64'
    };
    const readdir = vi.fn().mockResolvedValue([
      'LVStatus.txt',
      'lvrt_26.1.1f1_headless_sergio_cur.txt'
    ]);

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
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
        readdir: readdir as never,
        readFile: vi.fn().mockResolvedValue('Recursive load during LEIF load!') as never,
        pathExists: vi.fn(async (filePath: string) => filePath === record.artifactPlan.reportFilePath),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: 'CreateComparisonReport operation succeeded.',
          stderr: ''
        }),
        nowIso: vi.fn().mockReturnValue('2026-05-16T18:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'linux'
      }
    );

    expect(result.record.runtimeExecution.state).toBe('succeeded');
    expect(result.record.runtimeExecution.args).not.toContain('-Headless');
    expect(result.record.runtimeExecution.diagnosticReason).toBeUndefined();
    expect(result.record.runtimeExecution.headlessDiagnosticArtifactPaths).toEqual([]);
    expect(readdir).not.toHaveBeenCalled();
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

  it('classifies CreateComparisonReport file permission errors (LabVIEW error 8) from stderr', () => {
    const result = classifyLabviewCliDiagnosticText(
      [
        'Using LabVIEW: "/usr/local/natinst/LabVIEW-2026-64/labview"',
        'LabVIEW launched successfully.',
        'Operation output:',
        'LabVIEW: (Hex 0x8) File permission error.',
        'CreateComparisonReport operation failed.'
      ].join('\n'),
      '/usr/local/natinst/LabVIEW-2026-64/labview'
    );

    expect(result.reason).toBe('labview-cli-create-report-permission-error');
    expect(result.notes.some((note) => /CreateComparisonReport returned LabVIEW error 8/i.test(note))).toBe(true);
  });

  it('does not retain a false failure note when LabVIEW CLI reports CreateComparisonReport success', () => {
    const result = classifyLabviewCliDiagnosticText(
      [
        'Using LabVIEW: "C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe"',
        'LabVIEW launched successfully.',
        'Connection established with LabVIEW.',
        'Operation output:',
        'Report can be found at C:\\proof\\diff-report-lv_icon.vi.html',
        'CreateComparisonReport operation succeeded.'
      ].join('\r\n'),
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    );

    expect(result.reason).toBeUndefined();
    expect(result.notes).toContain(
      'LabVIEW CLI reported that CreateComparisonReport operation succeeded.'
    );
    expect(result.notes).not.toContain(
      'LabVIEW CLI reported that LabVIEW launched successfully before the operation failed.'
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

  describe('failed execution evidence retention (VHS-REQ-148)', () => {
    it('retains all evidence fields when execution fails with nonzero exit code', async () => {
      const record = createReadyRecord();
      const writeFile = vi.fn().mockResolvedValue(undefined);

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
          writeFile: writeFile as never,
          pathExists: vi.fn().mockResolvedValue(false),
          runCommand: vi.fn().mockResolvedValue({
            exitCode: 42,
            stdout: 'LabVIEWCLI operation failed with error.\n',
            stderr: 'Unexpected runtime error.\n'
          }),
          nowIso: vi
            .fn()
            .mockReturnValueOnce('2026-05-25T10:00:00.000Z')
            .mockReturnValueOnce('2026-05-25T10:00:05.000Z'),
          nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(6000),
          writePacketRecord: vi.fn().mockResolvedValue(undefined),
          enforceWindowsHostPreflight: false,
          processPlatform: 'win32'
        }
      );

      expect(result.record.runtimeExecution.state).toBe('failed');
      expect(result.record.runtimeExecution.exitCode).toBe(42);
      expect(result.record.runtimeExecution.durationMs).toBe(5000);
      expect(result.record.runtimeExecution.failureReason).toBe('command-exited-nonzero');
      expect(result.record.runtimeExecution.reportExists).toBe(false);
      expect(result.record.runtimeExecution.stdoutFilePath).toBeDefined();
      expect(result.record.runtimeExecution.stderrFilePath).toBeDefined();
      expect(result.record.runtimeExecution.attempted).toBe(true);
    });

    it('retains blocked reason when execution is blocked before attempt', async () => {
      const record = createReadyRecord();
      record.runtimeSelection.provider = 'unavailable';
      record.runtimeSelection.blockedReason = 'labview-exe-not-found';
      record.reportStatus = 'blocked-runtime';

      const result = await executeComparisonReport(
        {
          record,
          repositoryRoot: '/workspace/repo'
        },
        {
          readRevisionBlob: vi.fn(),
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile: vi.fn().mockResolvedValue(undefined) as never,
          pathExists: vi.fn().mockResolvedValue(false),
          runCommand: vi.fn(),
          nowIso: vi.fn().mockReturnValue('2026-05-25T10:00:00.000Z'),
          nowMs: vi.fn().mockReturnValue(1000),
          writePacketRecord: vi.fn().mockResolvedValue(undefined),
          processPlatform: 'win32'
        }
      );

      expect(result.record.runtimeExecution.state).toBe('not-available');
      expect(result.record.runtimeExecution.attempted).toBe(false);
      expect(result.record.runtimeExecution.blockedReason).toBeDefined();
      expect(result.record.runtimeExecution.reportExists).toBe(false);
    });

    it('fails closed when report is missing even with exit code 0', async () => {
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
            exitCode: 0,
            stdout: 'CreateComparisonReport operation succeeded.\n',
            stderr: ''
          }),
          nowIso: vi.fn().mockReturnValue('2026-05-25T10:00:00.000Z'),
          nowMs: vi.fn().mockReturnValue(1000),
          writePacketRecord: vi.fn().mockResolvedValue(undefined),
          enforceWindowsHostPreflight: false,
          processPlatform: 'win32'
        }
      );

      // Key requirement: fails closed even with successful exit
      expect(result.record.runtimeExecution.state).toBe('failed');
      expect(result.record.runtimeExecution.exitCode).toBe(0);
      expect(result.record.runtimeExecution.reportExists).toBe(false);
      expect(result.record.runtimeExecution.failureReason).toBe('report-file-not-generated');
    });

    it('retains doctor summary lines with execution evidence', async () => {
      const record = createReadyRecord();
      const writePacketRecord = vi.fn().mockResolvedValue(undefined);

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
            exitCode: 1,
            stdout: 'CreateComparisonReport operation failed.\n',
            stderr: ''
          }),
          nowIso: vi.fn().mockReturnValue('2026-05-25T10:00:00.000Z'),
          nowMs: vi.fn().mockReturnValue(1000),
          writePacketRecord,
          processPlatform: 'win32'
        }
      );

      expect(result.record.runtimeExecution.doctorSummaryLines).toBeDefined();
      expect(result.record.runtimeExecution.doctorSummaryLines?.length).toBeGreaterThan(0);
      expect(writePacketRecord).toHaveBeenCalled();
    });
  });
});

describe('cliConnectTimeoutSeconds hardening invocation (VHS-REQ-148)', () => {
  function createBlockedRecord(overrides: {
    platform: 'win32' | 'linux' | 'darwin';
    provider: 'host-native' | 'windows-container' | 'linux-container';
    engine: 'labview-cli' | 'lvcompare';
  }): ComparisonReportPacketRecord {
    const record = createReadyRecord();
    record.reportStatus = 'blocked-runtime';
    record.runtimeSelection.platform = overrides.platform;
    record.runtimeSelection.provider = overrides.provider;
    record.runtimeSelection.engine = overrides.engine;
    return record;
  }

  async function runWith(deps: {
    processPlatform: NodeJS.Platform;
    record: ComparisonReportPacketRecord;
    cliConnectTimeoutSeconds?: number;
  }) {
    const harden = vi.fn().mockResolvedValue({ applied: true, requestedValue: 180 });
    const writePacketRecord = vi.fn().mockResolvedValue(undefined);
    await executeComparisonReport(
      { record: deps.record, repositoryRoot: '/workspace/repo' },
      {
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
        readFile: vi.fn().mockResolvedValue('') as never,
        readdir: vi.fn().mockResolvedValue([]) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
        nowIso: vi.fn().mockReturnValue('2026-06-02T08:30:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord,
        processPlatform: deps.processPlatform,
        enforceWindowsHostPreflight: false,
        disableDiagnostics: true,
        applyLabviewCliIniHardening: harden as never,
        cliConnectTimeoutSeconds: deps.cliConnectTimeoutSeconds
      }
    );
    return { harden };
  }

  it('invokes the helper exactly once on win32 + host-native + labview-cli', async () => {
    const record = createBlockedRecord({
      platform: 'win32',
      provider: 'host-native',
      engine: 'labview-cli'
    });
    const { harden } = await runWith({
      processPlatform: 'win32',
      record,
      cliConnectTimeoutSeconds: 180
    });
    expect(harden).toHaveBeenCalledTimes(1);
    expect(harden).toHaveBeenCalledWith({ requestedValueSeconds: 180 });
  });

  it('does not invoke the helper for the lvcompare engine', async () => {
    const record = createBlockedRecord({
      platform: 'win32',
      provider: 'host-native',
      engine: 'lvcompare'
    });
    const { harden } = await runWith({
      processPlatform: 'win32',
      record,
      cliConnectTimeoutSeconds: 180
    });
    expect(harden).not.toHaveBeenCalled();
  });

  it('does not invoke the helper for the windows-container provider', async () => {
    const record = createBlockedRecord({
      platform: 'win32',
      provider: 'windows-container',
      engine: 'labview-cli'
    });
    const { harden } = await runWith({
      processPlatform: 'win32',
      record,
      cliConnectTimeoutSeconds: 180
    });
    expect(harden).not.toHaveBeenCalled();
  });

  it('does not invoke the helper on non-Windows hosts', async () => {
    const record = createBlockedRecord({
      platform: 'linux',
      provider: 'host-native',
      engine: 'labview-cli'
    });
    const { harden } = await runWith({
      processPlatform: 'linux',
      record,
      cliConnectTimeoutSeconds: 180
    });
    expect(harden).not.toHaveBeenCalled();
  });

  it('does not invoke the helper when cliConnectTimeoutSeconds is undefined', async () => {
    const record = createBlockedRecord({
      platform: 'win32',
      provider: 'host-native',
      engine: 'labview-cli'
    });
    const { harden } = await runWith({
      processPlatform: 'win32',
      record,
      cliConnectTimeoutSeconds: undefined
    });
    expect(harden).not.toHaveBeenCalled();
  });

  it('attaches a compact hardening summary to runtimeExecution on the persisted record', async () => {
    const record = createBlockedRecord({
      platform: 'win32',
      provider: 'host-native',
      engine: 'labview-cli'
    });
    const harden = vi.fn().mockResolvedValue({ applied: true, requestedValue: 180 });
    const writePacketRecord = vi.fn().mockResolvedValue(undefined);
    await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      {
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
        readFile: vi.fn().mockResolvedValue('') as never,
        readdir: vi.fn().mockResolvedValue([]) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
        nowIso: vi.fn().mockReturnValue('2026-06-02T08:30:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord,
        processPlatform: 'win32',
        enforceWindowsHostPreflight: false,
        disableDiagnostics: true,
        applyLabviewCliIniHardening: harden as never,
        cliConnectTimeoutSeconds: 180
      }
    );
    expect(writePacketRecord).toHaveBeenCalledTimes(1);
    const persisted = writePacketRecord.mock.calls[0][0] as ComparisonReportPacketRecord;
    expect(persisted.runtimeExecution.cliConnectTimeoutHardening).toEqual({
      applied: true,
      requestedValue: 180
    });
  });

  it('preserves the reason in the compact hardening summary when hardening did not apply', async () => {
    const record = createBlockedRecord({
      platform: 'win32',
      provider: 'host-native',
      engine: 'labview-cli'
    });
    const harden = vi
      .fn()
      .mockResolvedValue({ applied: false, requestedValue: 180, reason: 'no-candidate' });
    const writePacketRecord = vi.fn().mockResolvedValue(undefined);
    await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      {
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
        readFile: vi.fn().mockResolvedValue('') as never,
        readdir: vi.fn().mockResolvedValue([]) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
        nowIso: vi.fn().mockReturnValue('2026-06-02T08:30:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord,
        processPlatform: 'win32',
        enforceWindowsHostPreflight: false,
        disableDiagnostics: true,
        applyLabviewCliIniHardening: harden as never,
        cliConnectTimeoutSeconds: 180
      }
    );
    const persisted = writePacketRecord.mock.calls[0][0] as ComparisonReportPacketRecord;
    expect(persisted.runtimeExecution.cliConnectTimeoutHardening).toEqual({
      applied: false,
      requestedValue: 180,
      reason: 'no-candidate'
    });
  });

  it('omits cliConnectTimeoutHardening from runtimeExecution when the helper is not invoked', async () => {
    const record = createBlockedRecord({
      platform: 'linux',
      provider: 'host-native',
      engine: 'labview-cli'
    });
    const writePacketRecord = vi.fn().mockResolvedValue(undefined);
    await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      {
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
        readFile: vi.fn().mockResolvedValue('') as never,
        readdir: vi.fn().mockResolvedValue([]) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
        nowIso: vi.fn().mockReturnValue('2026-06-02T08:30:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord,
        processPlatform: 'linux',
        enforceWindowsHostPreflight: false,
        disableDiagnostics: true,
        cliConnectTimeoutSeconds: 180
      }
    );
    const persisted = writePacketRecord.mock.calls[0][0] as ComparisonReportPacketRecord;
    expect(persisted.runtimeExecution.cliConnectTimeoutHardening).toBeUndefined();
  });
});

describe('inferLabviewBitnessFromExecutablePath (VHS-REQ-621)', () => {
  it('returns x86 when path is under Program Files (x86)', () => {
    expect(
      inferLabviewBitnessFromExecutablePath(
        'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
      )
    ).toBe('x86');
  });

  it('returns x64 when path is under Program Files (without x86 suffix)', () => {
    expect(
      inferLabviewBitnessFromExecutablePath(
        'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
      )
    ).toBe('x64');
  });

  it('returns unknown for a non-canonical install path', () => {
    expect(
      inferLabviewBitnessFromExecutablePath('D:\\Tools\\LabVIEW\\LabVIEW.exe')
    ).toBe('unknown');
  });

  it('returns undefined for missing or empty input', () => {
    expect(inferLabviewBitnessFromExecutablePath(undefined)).toBeUndefined();
    expect(inferLabviewBitnessFromExecutablePath('')).toBeUndefined();
    expect(inferLabviewBitnessFromExecutablePath('   ')).toBeUndefined();
  });

  it('normalizes forward slashes before classifying', () => {
    expect(
      inferLabviewBitnessFromExecutablePath(
        'C:/Program Files (x86)/National Instruments/LabVIEW 2026/LabVIEW.exe'
      )
    ).toBe('x86');
  });
});
