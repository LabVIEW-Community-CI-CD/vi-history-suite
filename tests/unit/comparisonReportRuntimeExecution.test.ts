import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  buildStagedRevisionPlan,
} from '../../src/reporting/comparisonReportPlan';
import {
  classifyLabviewCliDiagnosticText,
  classifySelectedTreeMaterializeError,
  SELECTED_TREE_MATERIALIZE_LONG_PATH_DIAGNOSTIC,
  buildDefaultRunCommand,
  normalizeComparisonProcessError,
  parseWindowsTasklistCsv,
  observeWindowsRuntimeProcesses,
  observeWindowsTcpListeners,
  executeComparisonReport,
  materializeSelectedRevisionTreeWithGit,
  parseSubmoduleGitlinks,
  inferLabviewBitnessFromExecutablePath,
  inferLabviewYearFromExecutablePath,
  inferLinuxLabviewVersionFromExecutablePath,
  resolveLinuxLabviewTcpSettings,
  resolveWindowsLabviewTcpSettingsForLabviewPath,
  buildLinuxLabviewIniCandidatePaths,
  buildLinuxHostNativeShortPathLayout,
  buildLinuxHostNativeShortPathCommandPlan,
  shouldUseLinuxHostNativeShortPathStaging,
  rewriteLabviewCliArgsForLinuxContainerWorkspace,
  buildLinuxContainerCommandPlan,
  buildWindowsContainerCommandPlan,
  buildWindowsInteropCommandPlan,
  rewriteLvcompareArgsForContainerWorkspace,
  rewriteLvcompareArgsForLinuxContainerWorkspace,
  normalizeWindowsInteropPath,
  normalizeWindowsInteropExecutable,
  resolveHostReadableDiagnosticPath,
  resolveMappedRuntimeDiagnosticPath,
  parseLabviewCliDiagnosticLogPath,
  runComparisonCommandPlanWithObservation,
  prepareWindowsContainerExecutionContext,
  prepareLinuxContainerExecutionContext,
  resolveEffectiveCommandTimeoutMs,
  LINUX_HOST_NATIVE_HEADLESS_OPT_IN_DEFAULT_TIMEOUT_MS
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

function createLinuxContainerReadyRecord(): ComparisonReportPacketRecord {
  const record = createReadyRecord();
  record.runtimeSelection = {
    ...record.runtimeSelection,
    platform: 'linux',
    bitness: 'x64',
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
  return record;
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
        materializeSelectedRevisionTree: vi.fn().mockResolvedValue(undefined),
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
        materializeSelectedRevisionTree: vi.fn().mockResolvedValue(undefined),
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

  it('rejects a stale generated report on a timed-out execution with retained evidence (VHS-REQ-147 criterion 5)', async () => {
    // Criterion 5 covers "timed-out OR failed" executions; the failed branch is
    // asserted above. A timed-out run must also reject a pre-existing stale
    // report so a regression dropping the timeout branch of the identity check
    // fails closed.
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
          exitCode: 124,
          stdout: 'command stdout',
          stderr: '',
          timedOut: true,
          timeoutMs: 120000
        }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        enforceWindowsHostPreflight: false,
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('command-timed-out');
    expect(result.record.runtimeExecution.reportExists).toBe(false);
    expect(result.record.runtimeExecution.diagnosticNotes).toContain(
      `Generated comparison report did not reference the current staged revisions (${record.stagedRevisionPlan.leftFilename}, ${record.stagedRevisionPlan.rightFilename}) and was discarded as stale output.`
    );
    expect(removePath).toHaveBeenCalled();
  });

  it('copies Linux container reports back with canonical staged names and retained asset directories (VHS-REQ-148.1, VHS-REQ-156.10)', async () => {
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
    const aliasReportPath = `${record.artifactPlan.reportDirectory}/container-out/diff-report-foo_bar.vi.html`;
    const aliasAssetsPath = `${record.artifactPlan.reportDirectory}/container-out/diff-report-foo_bar.vi_files`;
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

  it('mounts Linux container output under container-out so it cannot pollute the retained report path (VHS-REQ-156.10)', async () => {
    const record = createReadyRecord();
    record.stagedRevisionPlan = buildStagedRevisionPlan({
      stagingDirectory: record.artifactPlan.stagingDirectory,
      fullFilename: record.artifactPlan.fullFilename,
      leftRevisionId: record.baseHash,
      rightRevisionId: record.selectedHash
    });
    record.runtimeSelection = {
      ...record.runtimeSelection,
      platform: 'linux',
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
    const containerOutDirectory = `${record.artifactPlan.reportDirectory}/container-out`;
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'CreateComparisonReport operation succeeded.\n',
      stderr: ''
    });

    await executeComparisonReport(
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
        chmod: vi.fn().mockResolvedValue(undefined) as never,
        readdir: vi.fn().mockResolvedValue([]) as never,
        readFile: vi.fn().mockResolvedValue('') as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand,
        nowIso: vi.fn().mockReturnValue('2026-05-28T10:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(3000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'linux'
      }
    );

    expect(runCommand).toHaveBeenCalled();
    const dockerPlan = runCommand.mock.calls[0][0] as { executable: string; args: string[] };
    expect(dockerPlan.executable).toBe('docker');
    // The bind mount targets the isolated container-out directory, never the
    // canonical retained report directory, so a root-owned container run can
    // never collide with the host-native report path.
    expect(dockerPlan.args).toEqual(
      expect.arrayContaining([`${containerOutDirectory}:/workspace`])
    );
    expect(dockerPlan.args).not.toEqual(
      expect.arrayContaining([`${record.artifactPlan.reportDirectory}:/workspace`])
    );
  });

  it('reports copy-back filesystem failures as report-finalize-failed rather than command-spawn-failed (VHS-REQ-156.9)', async () => {
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
    const aliasReportPath = `${record.artifactPlan.reportDirectory}/container-out/diff-report-foo_bar.vi.html`;
    const aliasAssetsPath = `${record.artifactPlan.reportDirectory}/container-out/diff-report-foo_bar.vi_files`;
    const eaccesError = Object.assign(
      new Error("EACCES: permission denied, unlink '.../diff-report-foo bar.vi_files/support/style.css'"),
      { code: 'EACCES' }
    );
    const copyDirectory = vi.fn().mockRejectedValue(eaccesError);
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
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        copyDirectory: copyDirectory as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
        chmod: vi.fn().mockResolvedValue(undefined) as never,
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
        nowIso: vi.fn().mockReturnValue('2026-05-28T10:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(3000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.reportExists).toBe(false);
    expect(result.record.runtimeExecution.failureReason).toBe('report-finalize-failed');
    expect(result.record.runtimeExecution.failureReason).not.toBe('command-spawn-failed');
    expect(result.record.runtimeExecution.diagnosticNotes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('copying it into the retained report directory failed')
      ])
    );
  });

  it('adds a cross-ownership remediation note when copy-back fails with EPERM (foreign-owned stale output) (VHS-REQ-156.9)', async () => {
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
    const aliasReportPath = `${record.artifactPlan.reportDirectory}/container-out/diff-report-foo_bar.vi.html`;
    const aliasAssetsPath = `${record.artifactPlan.reportDirectory}/container-out/diff-report-foo_bar.vi_files`;
    const canonicalAssetsPath = `${record.artifactPlan.reportDirectory}/diff-report-foo bar.vi_files`;
    // Removal of the foreign-owned destination keeps failing with EPERM even
    // after the chmod retry, mimicking root-owned files a non-root process
    // cannot reset.
    const removePath = vi.fn(async (target: string) => {
      if (target === canonicalAssetsPath) {
        throw Object.assign(new Error('EPERM: operation not permitted, rmdir'), { code: 'EPERM' });
      }
      return undefined;
    });
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
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
        removePath: removePath as never,
        unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
        chmod: vi.fn().mockResolvedValue(undefined) as never,
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
        nowIso: vi.fn().mockReturnValue('2026-05-28T10:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(3000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('report-finalize-failed');
    expect(result.record.runtimeExecution.diagnosticNotes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('prior containerized LabVIEW run owned by a different user')
      ])
    );
    expect(result.record.runtimeExecution.diagnosticNotes).toEqual(
      expect.arrayContaining([expect.stringContaining(record.artifactPlan.reportFilePath)])
    );
  });

  it('retries report-asset removal after chmod when the destination tree is read-only (EACCES) (VHS-REQ-156.9)', async () => {
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
    const aliasReportPath = `${record.artifactPlan.reportDirectory}/container-out/diff-report-foo_bar.vi.html`;
    const aliasAssetsPath = `${record.artifactPlan.reportDirectory}/container-out/diff-report-foo_bar.vi_files`;
    const canonicalAssetsPath = `${record.artifactPlan.reportDirectory}/diff-report-foo bar.vi_files`;
    const eaccesPaths = new Set<string>();
    const removePath = vi.fn(async (target: string) => {
      if (target === canonicalAssetsPath && !eaccesPaths.has(target)) {
        eaccesPaths.add(target);
        throw Object.assign(new Error('EACCES: permission denied, rmdir'), { code: 'EACCES' });
      }
      return undefined;
    });
    const chmod = vi.fn().mockResolvedValue(undefined);
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
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
        removePath: removePath as never,
        unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
        chmod: chmod as never,
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
        nowIso: vi.fn().mockReturnValue('2026-05-28T10:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(3000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecution.state).toBe('succeeded');
    expect(result.record.runtimeExecution.reportExists).toBe(true);
    expect(chmod).toHaveBeenCalled();
    // The EACCES path is removed twice: once it throws, once after chmod succeeds.
    expect(
      removePath.mock.calls.filter(([target]) => target === canonicalAssetsPath).length
    ).toBeGreaterThanOrEqual(2);
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

  it('passes a resolved non-default VI Server port to the LabVIEW CLI on a successful host-native compare (VHS-REQ-623.6)', async () => {
    // Real-hardware peer: the maintainer Windows runner hosts LabVIEW installs on
    // non-default VI Server ports. This asserts the resolved server.tcp.port flows
    // all the way into the launched CreateComparisonReport invocation (-PortNumber)
    // on the SUCCESS path, not only into the settings parser (VHS-REQ-623).
    const record = createReadyRecord();
    record.runtimeSelection.allowExistingWindowsHostRuntime = true;
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'CreateComparisonReport operation succeeded.',
      stderr: ''
    });
    const observeWindowsProcesses = vi.fn().mockResolvedValue({
      capturedAt: '2026-05-16T18:00:00.000Z',
      hostPlatform: 'win32',
      runtimePlatform: 'win32',
      trigger: 'preflight',
      observedProcesses: [],
      observedProcessNames: [],
      labviewProcessObserved: false,
      labviewCliProcessObserved: false,
      lvcompareProcessObserved: false
    });
    const observeWindowsTcpListeners = vi.fn().mockResolvedValue([]);

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
        readFile: vi
          .fn()
          .mockResolvedValue('server.tcp.enabled=True\nserver.tcp.port=3380\n') as never,
        pathExists: vi.fn(async (filePath: string) =>
          typeof filePath === 'string' && filePath.endsWith(record.artifactPlan.reportFilename)
        ),
        runCommand,
        nowIso: vi.fn().mockReturnValue('2026-05-16T18:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32',
        enforceWindowsHostPreflight: true,
        observeWindowsProcesses,
        observeWindowsTcpListeners,
        disableDiagnostics: true
      }
    );

    expect(result.record.runtimeExecution.state).toBe('succeeded');
    expect(result.record.runtimeExecution.blockedReason).toBeUndefined();
    expect(observeWindowsProcesses).not.toHaveBeenCalled();

    const launchedArgs = result.record.runtimeExecution.args ?? [];
    const portFlagIndex = launchedArgs.findIndex(
      (argument) => argument.toLowerCase() === '-portnumber'
    );
    expect(portFlagIndex).toBeGreaterThanOrEqual(0);
    expect(launchedArgs[portFlagIndex + 1]).toBe('3380');

    // The resolved non-default port reached the actual launched command plan.
    const launchedPlan = runCommand.mock.calls[0]?.[0] as { args: string[] } | undefined;
    expect(launchedPlan?.args).toContain('-PortNumber');
    expect(launchedPlan?.args).toContain('3380');
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

  it('reclassifies a nonzero exit as labview-host-bitness-conflict when exit snapshot shows different-bitness LabVIEW (VHS-REQ-621.3, VHS-REQ-658.1)', async () => {
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

  it('keeps a nonzero exit as command-exited-nonzero when exit snapshot shows matching-bitness LabVIEW (VHS-REQ-621.3)', async () => {
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

  it('keeps a nonzero exit as command-exited-nonzero when exit snapshot has unknown-bitness LabVIEW (VHS-REQ-621.3)', async () => {
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
    record.runtimeSelection.requestedLabviewVersion = '2026';
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
        readFile: vi.fn(async (filePath: string) => {
          if (typeof filePath === 'string' && filePath.endsWith('labview.conf')) {
            return 'server.tcp.enabled=True\nserver.tcp.port=3363\n';
          }
          return 'Recursive load during LEIF load!';
        }) as never,
        pathExists: vi.fn(async (filePath: string) =>
          typeof filePath === 'string' && filePath.endsWith(record.artifactPlan.reportFilename)
        ),
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

  it('suppresses the benign recursive-load diagnosticReason when a headless Linux run still succeeds', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.platform = 'linux';
    record.runtimeSelection.bitness = 'x64';
    record.runtimeSelection.provider = 'host-native';
    record.runtimeSelection.executionMode = 'host-only';
    record.runtimeSelection.requestedProvider = 'host';
    record.runtimeSelection.requestedLabviewVersion = '2026';
    // Headless was requested, so the recursive-load LVStatus.txt line is captured
    // even though LabVIEW recovered and CreateComparisonReport succeeded.
    record.runtimeSelection.headlessRequested = true;
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
        readFile: vi.fn(async (filePath: string) => {
          if (typeof filePath === 'string' && filePath.endsWith('labview.conf')) {
            return 'server.tcp.enabled=True\nserver.tcp.port=3363\n';
          }
          return 'Recursive load during LEIF load!';
        }) as never,
        pathExists: vi.fn(async (filePath: string) =>
          typeof filePath === 'string' && filePath.endsWith(record.artifactPlan.reportFilename)
        ),
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

    // The run succeeded, so no failure-implying diagnosticReason should leak even
    // though the benign recursive-load line was observed and captured.
    expect(result.record.runtimeExecution.state).toBe('succeeded');
    expect(result.record.runtimeExecution.failureReason).toBeUndefined();
    expect(result.record.runtimeExecution.diagnosticReason).toBeUndefined();
    expect(readdir).toHaveBeenCalled();
  });

  it('routes a SUCCEEDED linux-container run to its own container-temp diagnostics, not host /tmp (Refs #270)', async () => {
    // Regression for issue #270: on a Linux host running the linux-container
    // provider, captureLinuxHeadlessDiagnostics() must read the container's mapped
    // container-temp (diagnosticPathMapping.hostRoot), never host /tmp. Otherwise a
    // PRIOR host-native headless run's stale /tmp/lvrt_*_headless_*_cur.txt bleeds in
    // and a false "Failed to initialize headless" note contaminates a passing run.
    const record = createLinuxContainerReadyRecord();
    const reportDirectory = record.artifactPlan.reportDirectory;
    const containerTempDirectory = `${reportDirectory}/container-out/container-temp`;
    const containerReportPath = `${reportDirectory}/container-out/${record.artifactPlan.reportFilename}`;
    const containerStatusLog = `${containerTempDirectory}/LVStatus.txt`;
    const staleHostHeadlessLog = '/tmp/lvrt_26.1.1f1_headless_sergio_cur.txt';

    const readdir = vi.fn(async (dir: string) => {
      if (dir === '/tmp') {
        // PRIOR host-native run's stale init-failure log left behind in host /tmp.
        return ['lvrt_26.1.1f1_headless_sergio_cur.txt'];
      }
      if (dir === containerTempDirectory) {
        // The container's OWN clean status log for this run.
        return ['LVStatus.txt'];
      }
      return [];
    });
    const readFile = vi.fn(async (filePath: string) => {
      if (filePath === staleHostHeadlessLog) {
        return 'Failed to initialize headless LabVIEW.';
      }
      if (filePath === containerStatusLog) {
        return 'LabVIEW 2026 started successfully in the headless container.';
      }
      return '';
    });
    const pathExists = vi.fn(async (filePath: string) =>
      filePath === containerReportPath ||
      filePath === containerStatusLog ||
      filePath === staleHostHeadlessLog
    );

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
        chmod: vi.fn().mockResolvedValue(undefined) as never,
        readdir: readdir as never,
        readFile: readFile as never,
        pathExists: pathExists as never,
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: 'CreateComparisonReport operation succeeded.\n',
          stderr: ''
        }),
        nowIso: vi.fn().mockReturnValue('2026-06-07T03:50:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'linux'
      }
    );

    expect(result.record.runtimeExecution.state).toBe('succeeded');
    // (a) the stale host /tmp init-failure note must NOT contaminate a passing run.
    expect(result.record.runtimeExecution.diagnosticNotes ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining('Failed to initialize headless')])
    );
    expect(result.record.runtimeExecution.diagnosticReason).toBeUndefined();
    // (b) the container still captures its OWN container-temp LVStatus.txt.
    expect(result.record.runtimeExecution.headlessDiagnosticArtifactPaths).toEqual([
      path.join(reportDirectory, 'headless-diagnostics', 'LVStatus.txt')
    ]);
    // The container run must read the mapped container-temp and never host /tmp.
    expect(readdir).toHaveBeenCalledWith(containerTempDirectory);
    expect(readdir).not.toHaveBeenCalledWith('/tmp');
  });

  it('still classifies a genuine host-native headless init failure with #269 guidance (no regression) (VHS-REQ-156.4)', async () => {
    // A real host-native headless bring-up failure (issue #269) must still be
    // classified and surfaced. The #270 fix only stops contamination of PASSING
    // container runs; it must not suppress a genuine host-native failure signal.
    const record = createReadyRecord();
    record.runtimeSelection.platform = 'linux';
    record.runtimeSelection.bitness = 'x64';
    record.runtimeSelection.provider = 'host-native';
    record.runtimeSelection.executionMode = 'host-only';
    record.runtimeSelection.requestedProvider = 'host';
    record.runtimeSelection.requestedLabviewVersion = '2026';
    record.runtimeSelection.headlessRequested = true;
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
    const headlessLog = '/tmp/lvrt_26.1.1f1_headless_sergio_cur.txt';
    const readdir = vi.fn(async (dir: string) =>
      dir === '/tmp' ? ['lvrt_26.1.1f1_headless_sergio_cur.txt'] : []
    );
    const readFile = vi.fn(async (filePath: string) => {
      if (typeof filePath === 'string' && filePath.endsWith('labview.conf')) {
        return 'server.tcp.enabled=True\nserver.tcp.port=3363\n';
      }
      if (filePath === headlessLog) {
        return 'Failed to initialize headless LabVIEW.';
      }
      return '';
    });
    // The report is never generated (headless never came up), so the run fails.
    const pathExists = vi.fn(async (filePath: string) => filePath === headlessLog);

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
        readFile: readFile as never,
        pathExists: pathExists as never,
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: 'CreateComparisonReport operation succeeded.',
          stderr: ''
        }),
        nowIso: vi.fn().mockReturnValue('2026-06-07T03:43:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'linux'
      }
    );

    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.diagnosticReason).toBe('linux-headless-init-failed');
    expect(result.record.runtimeExecution.diagnosticNotes ?? []).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Failed to initialize headless LabVIEW.')
      ])
    );
    expect(result.record.runtimeExecution.diagnosticNotes?.join('\n')).toContain(
      'LV_RTE_LINUX_HEADLESS=0'
    );
  });

  it('bounds the host-native headless opt-in so an indefinite init-failure hang is classified deterministically (issue #269)', async () => {
    // Issue #269 deeper finding: production wires no commandTimeoutMs, so on a build
    // with a broken HeadlessManager the -Headless CLI hangs forever during VI load and
    // the post-process headless classifier never fires. The fix applies a default bound
    // ONLY to the Linux host-native headless opt-in, converting the stall into a
    // deterministic command-timed-out failure that still carries the
    // linux-headless-init-failed diagnostic. This test omits commandTimeoutMs entirely
    // (matching the production action) and proves the default bound is propagated.
    const record = createReadyRecord();
    record.runtimeSelection.platform = 'linux';
    record.runtimeSelection.bitness = 'x64';
    record.runtimeSelection.provider = 'host-native';
    record.runtimeSelection.executionMode = 'host-only';
    record.runtimeSelection.requestedProvider = 'host';
    record.runtimeSelection.requestedLabviewVersion = '2026';
    record.runtimeSelection.headlessRequested = true;
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
    const headlessLog = '/tmp/lvrt_26.1.1f1_headless_sergio_cur.txt';
    const readdir = vi.fn(async (dir: string) =>
      dir === '/tmp' ? ['lvrt_26.1.1f1_headless_sergio_cur.txt'] : []
    );
    const readFile = vi.fn(async (filePath: string) => {
      if (typeof filePath === 'string' && filePath.endsWith('labview.conf')) {
        return 'server.tcp.enabled=True\nserver.tcp.port=3363\n';
      }
      if (filePath === headlessLog) {
        return 'Failed to initialize headless LabVIEW.';
      }
      return '';
    });
    const pathExists = vi.fn(async (filePath: string) => filePath === headlessLog);
    // The bounded CLI is SIGKILLed; the result reports timedOut WITHOUT a timeoutMs
    // field so the surfaced note must fall back to the propagated effective bound.
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 124,
      signal: 'SIGKILL',
      stdout: '',
      stderr: 'comparison-command timed out\n',
      timedOut: true
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
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
        readdir: readdir as never,
        readFile: readFile as never,
        pathExists: pathExists as never,
        runCommand,
        nowIso: vi.fn().mockReturnValue('2026-06-07T03:43:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'linux'
        // commandTimeoutMs deliberately omitted to mirror the production action.
      }
    );

    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('command-timed-out');
    expect(result.record.runtimeExecution.diagnosticReason).toBe('linux-headless-init-failed');
    // The surfaced timeout note reflects the default bound (not "the configured"),
    // proving the host-native headless opt-in is no longer unbounded in production.
    expect(result.record.runtimeExecution.diagnosticNotes ?? []).toEqual(
      expect.arrayContaining([
        `Comparison-report runtime timed out after ${String(
          LINUX_HOST_NATIVE_HEADLESS_OPT_IN_DEFAULT_TIMEOUT_MS
        )}ms.`
      ])
    );
    expect(result.record.runtimeExecution.diagnosticNotes?.join('\n')).toContain(
      'LV_RTE_LINUX_HEADLESS=0'
    );
  });

  it('gates the headless-init note on a SUCCEEDED headless run so a stale init-failure log cannot leak (Refs #270)', async () => {
    // Defense-in-depth half of issue #270: even when the headless capture yields an
    // init-failure note, a SUCCEEDED run must not surface it (the note is gated on
    // success exactly like diagnosticReason). This isolates the success-gating from
    // the source-routing fix by exercising the host-native /tmp read directly.
    const record = createReadyRecord();
    record.runtimeSelection.platform = 'linux';
    record.runtimeSelection.bitness = 'x64';
    record.runtimeSelection.provider = 'host-native';
    record.runtimeSelection.executionMode = 'host-only';
    record.runtimeSelection.requestedProvider = 'host';
    record.runtimeSelection.requestedLabviewVersion = '2026';
    record.runtimeSelection.headlessRequested = true;
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
    const staleHeadlessLog = '/tmp/lvrt_26.1.1f1_headless_sergio_cur.txt';
    const readdir = vi.fn(async (dir: string) =>
      dir === '/tmp' ? ['lvrt_26.1.1f1_headless_sergio_cur.txt'] : []
    );
    const readFile = vi.fn(async (filePath: string) => {
      if (typeof filePath === 'string' && filePath.endsWith('labview.conf')) {
        return 'server.tcp.enabled=True\nserver.tcp.port=3363\n';
      }
      if (filePath === staleHeadlessLog) {
        return 'Failed to initialize headless LabVIEW.';
      }
      return '';
    });
    const pathExists = vi.fn(async (filePath: string) =>
      filePath === staleHeadlessLog ||
      (typeof filePath === 'string' && filePath.endsWith(record.artifactPlan.reportFilename))
    );

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
        readFile: readFile as never,
        pathExists: pathExists as never,
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: 'CreateComparisonReport operation succeeded.',
          stderr: ''
        }),
        nowIso: vi.fn().mockReturnValue('2026-06-07T03:50:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'linux'
      }
    );

    expect(result.record.runtimeExecution.state).toBe('succeeded');
    expect(result.record.runtimeExecution.failureReason).toBeUndefined();
    expect(result.record.runtimeExecution.diagnosticReason).toBeUndefined();
    // The init-failure note describes a bring-up failure and must be gated on success.
    expect(result.record.runtimeExecution.diagnosticNotes ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining('Failed to initialize headless')])
    );
    // But the headless log was still captured as evidence (artifact retained).
    expect(result.record.runtimeExecution.headlessDiagnosticArtifactPaths).toEqual([
      path.join(record.artifactPlan.reportDirectory, 'headless-diagnostics', 'lvrt_26.1.1f1_headless_sergio_cur.txt')
    ]);
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

  it('classifies CreateComparisonReport file permission errors (LabVIEW error 8) from stderr (VHS-REQ-156.5)', () => {
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
    it('retains all evidence fields when execution fails with nonzero exit code (VHS-REQ-148.2, VHS-REQ-658.1)', async () => {
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

    it('fails closed when report is missing even with exit code 0 (VHS-REQ-148.3)', async () => {
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

describe('resolveEffectiveCommandTimeoutMs (VHS-REQ-156, issue #269)', () => {
  function createLinuxHostNativeRecord(overrides: {
    provider?: 'host-native' | 'linux-container';
    engine?: 'labview-cli' | 'lvcompare';
    headlessRequested?: boolean;
  }): ComparisonReportPacketRecord {
    const record = createReadyRecord();
    record.runtimeSelection.platform = 'linux';
    record.runtimeSelection.bitness = 'x64';
    record.runtimeSelection.provider = overrides.provider ?? 'host-native';
    record.runtimeSelection.engine = overrides.engine ?? 'labview-cli';
    if (typeof overrides.headlessRequested === 'boolean') {
      record.runtimeSelection.headlessRequested = overrides.headlessRequested;
    }
    return record;
  }

  const headlessPlan = {
    executable: 'LabVIEWCLI',
    args: ['-OperationName', 'CreateComparisonReport', '-Headless']
  };
  const nonHeadlessPlan = {
    executable: 'LabVIEWCLI',
    args: ['-OperationName', 'CreateComparisonReport']
  };

  it('defaults the Linux host-native headless opt-in (headlessRequested flag) to the bounded timeout', () => {
    const record = createLinuxHostNativeRecord({ headlessRequested: true });
    expect(
      resolveEffectiveCommandTimeoutMs({ record, commandPlan: nonHeadlessPlan })
    ).toBe(LINUX_HOST_NATIVE_HEADLESS_OPT_IN_DEFAULT_TIMEOUT_MS);
  });

  it('defaults the env-var opt-in (-Headless in command plan, flag unset) to the bounded timeout', () => {
    const record = createLinuxHostNativeRecord({ headlessRequested: false });
    expect(
      resolveEffectiveCommandTimeoutMs({ record, commandPlan: headlessPlan })
    ).toBe(LINUX_HOST_NATIVE_HEADLESS_OPT_IN_DEFAULT_TIMEOUT_MS);
  });

  it('leaves the safe non-headless Linux host-native default unbounded', () => {
    const record = createLinuxHostNativeRecord({ headlessRequested: false });
    expect(
      resolveEffectiveCommandTimeoutMs({ record, commandPlan: nonHeadlessPlan })
    ).toBeUndefined();
  });

  it('leaves the Linux container provider unbounded even with -Headless (working bundled image)', () => {
    const record = createLinuxHostNativeRecord({ provider: 'linux-container' });
    expect(
      resolveEffectiveCommandTimeoutMs({ record, commandPlan: headlessPlan })
    ).toBeUndefined();
  });

  it('leaves the lvcompare engine unbounded (does not connect to LabVIEW headless)', () => {
    const record = createLinuxHostNativeRecord({ engine: 'lvcompare', headlessRequested: true });
    expect(
      resolveEffectiveCommandTimeoutMs({ record, commandPlan: headlessPlan })
    ).toBeUndefined();
  });

  it('leaves Windows host-native headless unbounded (not the broken Linux surface)', () => {
    const record = createReadyRecord();
    record.runtimeSelection.headlessRequested = true;
    expect(
      resolveEffectiveCommandTimeoutMs({ record, commandPlan: headlessPlan })
    ).toBeUndefined();
  });

  it('honors an explicitly configured timeout over the default bound (validation harness wins)', () => {
    const record = createLinuxHostNativeRecord({ headlessRequested: true });
    expect(
      resolveEffectiveCommandTimeoutMs({
        record,
        commandPlan: headlessPlan,
        configuredTimeoutMs: 120000
      })
    ).toBe(120000);
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

describe('inferLabviewBitnessFromExecutablePath (VHS-REQ-621.1, VHS-REQ-636.4)', () => {
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

describe('inferLabviewYearFromExecutablePath (VHS-REQ-636.4)', () => {
  it('extracts the year from a canonical Windows LabVIEW path', () => {
    expect(
      inferLabviewYearFromExecutablePath(
        'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
      )
    ).toBe('2026');
  });

  it('extracts the year from a Program Files (x86) path', () => {
    expect(
      inferLabviewYearFromExecutablePath(
        'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2024\\LabVIEW.exe'
      )
    ).toBe('2024');
  });

  it('extracts the year from a forward-slash path', () => {
    expect(
      inferLabviewYearFromExecutablePath(
        'C:/Program Files/National Instruments/LabVIEW 2030/LabVIEW.exe'
      )
    ).toBe('2030');
  });

  it('returns undefined when no plausible year is present', () => {
    expect(
      inferLabviewYearFromExecutablePath('D:\\Tools\\LabVIEW\\LabVIEW.exe')
    ).toBeUndefined();
  });

  it('returns undefined for missing or empty input', () => {
    expect(inferLabviewYearFromExecutablePath(undefined)).toBeUndefined();
    expect(inferLabviewYearFromExecutablePath('')).toBeUndefined();
    expect(inferLabviewYearFromExecutablePath('   ')).toBeUndefined();
  });
});

describe('resolveLinuxLabviewTcpSettings (VHS-REQ-156)', () => {
  function createLinuxRecord(): ComparisonReportPacketRecord {
    const record = createReadyRecord();
    record.runtimeSelection.platform = 'linux';
    record.runtimeSelection.bitness = 'x64';
    record.runtimeSelection.provider = 'host-native';
    record.runtimeSelection.engine = 'labview-cli';
    record.runtimeSelection.requestedLabviewVersion = '2026';
    return record;
  }

  it('builds candidate paths under ~/natinst/.config and /etc/natinst', () => {
    const candidates = buildLinuxLabviewIniCandidatePaths({
      homeDir: '/home/sergio',
      requestedLabviewVersion: '2026',
      bitness: 'x64'
    });
    expect(candidates).toContain('/home/sergio/natinst/.config/LabVIEW-2026/labview.conf');
    expect(candidates).toContain('/home/sergio/natinst/.config/LabVIEW-2026-64/labview.conf');
    expect(candidates).toContain('/etc/natinst/LabVIEW-2026/labview.conf');
  });

  it('returns viServerTcpEnabled=true and the explicit port when labview.conf enables TCP', async () => {
    const settings = await resolveLinuxLabviewTcpSettings(createLinuxRecord(), {
      readFile: vi.fn().mockResolvedValue(
        'server.tcp.access="+localhost"\nserver.tcp.enabled=True\nserver.tcp.port=3363\n'
      ) as never,
      homeDir: () => '/home/sergio'
    });
    expect(settings.viServerTcpEnabled).toBe(true);
    expect(settings.labviewTcpPort).toBe(3363);
    expect(settings.labviewIniPath).toBe('/home/sergio/natinst/.config/LabVIEW-2026/labview.conf');
  });

  it('defaults to port 3363 when TCP is enabled but server.tcp.port is omitted', async () => {
    const settings = await resolveLinuxLabviewTcpSettings(createLinuxRecord(), {
      readFile: vi.fn().mockResolvedValue('server.tcp.enabled=True\n') as never,
      homeDir: () => '/home/sergio'
    });
    expect(settings.viServerTcpEnabled).toBe(true);
    expect(settings.labviewTcpPort).toBe(3363);
  });

  it('flags VI Server TCP disabled when server.tcp.enabled=False', async () => {
    const settings = await resolveLinuxLabviewTcpSettings(createLinuxRecord(), {
      readFile: vi.fn().mockResolvedValue('server.tcp.enabled=False\n') as never,
      homeDir: () => '/home/sergio'
    });
    expect(settings.viServerTcpEnabled).toBe(false);
    expect(settings.notes.join(' ')).toMatch(/server\.tcp\.enabled=False/);
  });

  it('flags VI Server TCP disabled when labview.conf has no server.tcp.enabled key (Linux default)', async () => {
    const settings = await resolveLinuxLabviewTcpSettings(createLinuxRecord(), {
      readFile: vi.fn().mockResolvedValue('LoadAddOns=False\n') as never,
      homeDir: () => '/home/sergio'
    });
    expect(settings.viServerTcpEnabled).toBe(false);
    expect(settings.notes.join(' ')).toMatch(/server\.tcp\.enabled is missing/);
  });

  it('returns viServerTcpEnabled=unknown when no candidate file is readable', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const settings = await resolveLinuxLabviewTcpSettings(createLinuxRecord(), {
      readFile: vi.fn().mockRejectedValue(enoent) as never,
      homeDir: () => '/home/sergio'
    });
    expect(settings.viServerTcpEnabled).toBe('unknown');
    expect(settings.inspectedCandidatePaths.length).toBeGreaterThan(0);
  });

  it('skips resolution for non-linux runtime selections', async () => {
    const record = createReadyRecord();
    const settings = await resolveLinuxLabviewTcpSettings(record, {
      readFile: vi.fn() as never,
      homeDir: () => '/home/sergio'
    });
    expect(settings.viServerTcpEnabled).toBe('unknown');
    expect(settings.inspectedCandidatePaths).toEqual([]);
  });

  it('infers requestedLabviewVersion from labviewExe path when not explicitly set', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.platform = 'linux';
    record.runtimeSelection.bitness = 'x64';
    record.runtimeSelection.provider = 'host-native';
    record.runtimeSelection.engine = 'labview-cli';
    record.runtimeSelection.requestedLabviewVersion = undefined;
    record.runtimeSelection.labviewExe = {
      kind: 'labview-exe',
      path: '/usr/local/natinst/LabVIEW-2026-64/labview',
      source: 'configured',
      exists: true,
      bitness: 'x64'
    };

    const readFile = vi.fn(async (filePath: string) => {
      if (typeof filePath === 'string' && filePath.endsWith('LabVIEW-2026-64/labview.conf')) {
        return 'server.tcp.enabled=True\nserver.tcp.port=3363\n';
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const settings = await resolveLinuxLabviewTcpSettings(record, {
      readFile: readFile as never,
      homeDir: () => '/home/sergio'
    });
    expect(settings.viServerTcpEnabled).toBe(true);
    expect(settings.labviewTcpPort).toBe(3363);
    expect(settings.labviewIniPath).toMatch(/LabVIEW-2026-64\/labview\.conf$/);
  });
});

describe('inferLinuxLabviewVersionFromExecutablePath (VHS-REQ-156)', () => {
  it('extracts the year from a 64-bit install path', () => {
    expect(
      inferLinuxLabviewVersionFromExecutablePath('/usr/local/natinst/LabVIEW-2026-64/labview')
    ).toBe('2026');
  });

  it('extracts the year from a 32-bit install path', () => {
    expect(
      inferLinuxLabviewVersionFromExecutablePath('/usr/local/natinst/LabVIEW-2025-32/labview')
    ).toBe('2025');
  });

  it('extracts the year from a version-only directory', () => {
    expect(
      inferLinuxLabviewVersionFromExecutablePath('/opt/natinst/LabVIEW-2024/labview')
    ).toBe('2024');
  });

  it('returns undefined for non-canonical paths', () => {
    expect(inferLinuxLabviewVersionFromExecutablePath('/usr/local/bin/labview')).toBeUndefined();
    expect(inferLinuxLabviewVersionFromExecutablePath(undefined)).toBeUndefined();
    expect(inferLinuxLabviewVersionFromExecutablePath('')).toBeUndefined();
  });
});

describe('Linux host-native VI Server TCP preflight (VHS-REQ-156)', () => {
  it('blocks execution with linux-vi-server-tcp-disabled when labview.conf disables VI Server TCP', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.platform = 'linux';
    record.runtimeSelection.bitness = 'x64';
    record.runtimeSelection.provider = 'host-native';
    record.runtimeSelection.executionMode = 'host-only';
    record.runtimeSelection.requestedProvider = 'host';
    record.runtimeSelection.requestedLabviewVersion = '2026';
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

    const runCommand = vi.fn();
    const writePacketRecord = vi.fn().mockResolvedValue(undefined);
    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
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
        readFile: vi.fn(async (filePath: string) => {
          if (typeof filePath === 'string' && filePath.endsWith('labview.conf')) {
            return 'server.tcp.enabled=False\n';
          }
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        }) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: runCommand as never,
        nowIso: vi.fn().mockReturnValue('2026-06-02T18:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord,
        processPlatform: 'linux'
      }
    );

    expect(runCommand).not.toHaveBeenCalled();
    expect(result.record.runtimeExecution.state).toBe('not-available');
    expect(result.record.runtimeExecution.blockedReason).toBe('linux-vi-server-tcp-disabled');
    expect(result.record.runtimeExecution.diagnosticReason).toBe('linux-vi-server-tcp-disabled');
    expect(result.record.runtimeExecution.labviewIniPath).toMatch(/labview\.conf$/);
    expect(result.record.runtimeExecution.diagnosticNotes?.join(' ')).toMatch(
      /VI Server/i
    );
  });

  it('blocks execution with linux-vi-server-tcp-disabled when no labview.conf candidate is readable', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.platform = 'linux';
    record.runtimeSelection.bitness = 'x64';
    record.runtimeSelection.provider = 'host-native';
    record.runtimeSelection.executionMode = 'host-only';
    record.runtimeSelection.requestedProvider = 'host';
    record.runtimeSelection.requestedLabviewVersion = '2026';
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

    const runCommand = vi.fn();
    const writePacketRecord = vi.fn().mockResolvedValue(undefined);
    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
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
        readFile: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: runCommand as never,
        nowIso: vi.fn().mockReturnValue('2026-06-02T18:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord,
        processPlatform: 'linux'
      }
    );

    expect(runCommand).not.toHaveBeenCalled();
    expect(result.record.runtimeExecution.state).toBe('not-available');
    expect(result.record.runtimeExecution.blockedReason).toBe('linux-vi-server-tcp-disabled');
    expect(result.record.runtimeExecution.diagnosticNotes?.join(' ')).toMatch(
      /No readable Linux LabVIEW config/
    );
  });
});

describe('Windows host-native VI Server TCP preflight (VHS-REQ-623)', () => {
  it('blocks execution with windows-vi-server-tcp-disabled when LabVIEW.ini sets server.tcp.enabled=False (VHS-REQ-623.2)', async () => {
    const record = createReadyRecord();
    // createReadyRecord() defaults to platform='win32', host-native, labview-cli;
    // labviewExe.path = 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe'
    const expectedIniPath =
      'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.ini';

    const runCommand = vi.fn();
    const writePacketRecord = vi.fn().mockResolvedValue(undefined);
    const result = await executeComparisonReport(
      { record, repositoryRoot: 'C:\\workspace\\repo' },
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
        readFile: vi.fn(async (filePath: string) => {
          if (typeof filePath === 'string' && filePath.endsWith('LabVIEW.ini')) {
            // VHS-REQ-623: LabVIEW.ini commonly writes VI Server values quoted
            // (e.g. server.tcp.enabled="FALSE"). Use the quoted form here so a
            // future regression in the parser regex (matching only unquoted
            // values) is caught by this test.
            return 'server.tcp.enabled="FALSE"\nserver.tcp.port="3363"\n';
          }
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        }) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: runCommand as never,
        nowIso: vi.fn().mockReturnValue('2026-06-03T18:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord,
        processPlatform: 'win32'
      }
    );

    expect(runCommand).not.toHaveBeenCalled();
    expect(result.record.runtimeExecution.state).toBe('not-available');
    expect(result.record.runtimeExecution.blockedReason).toBe('windows-vi-server-tcp-disabled');
    expect(result.record.runtimeExecution.diagnosticReason).toBe('windows-vi-server-tcp-disabled');
    expect(result.record.runtimeExecution.labviewIniPath).toBe(expectedIniPath);
    expect(result.record.runtimeExecution.diagnosticNotes?.join(' ')).toMatch(
      /server\.tcp\.enabled=False/
    );
    expect(result.record.runtimeExecution.diagnosticNotes?.join(' ')).toMatch(/VI Server/i);
  });
});

describe('resolveWindowsLabviewTcpSettingsForLabviewPath (VHS-REQ-623.1)', () => {
  const labviewPath = 'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe';
  const expectedIniPath = 'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.ini';

  it('returns viServerTcpEnabled=true and the explicit port for quoted enabled values', async () => {
    const settings = await resolveWindowsLabviewTcpSettingsForLabviewPath(labviewPath, {
      readFile: vi.fn().mockResolvedValue('server.tcp.enabled="TRUE"\nserver.tcp.port="3363"\n') as never,
      processPlatform: 'win32'
    });
    expect(settings.viServerTcpEnabled).toBe(true);
    expect(settings.labviewTcpPort).toBe(3363);
    expect(settings.labviewIniPath).toBe(expectedIniPath);
  });

  it('returns viServerTcpEnabled=true and the explicit port for unquoted enabled values', async () => {
    const settings = await resolveWindowsLabviewTcpSettingsForLabviewPath(labviewPath, {
      readFile: vi.fn().mockResolvedValue('server.tcp.enabled=True\nserver.tcp.port=3380\n') as never,
      processPlatform: 'win32'
    });
    expect(settings.viServerTcpEnabled).toBe(true);
    expect(settings.labviewTcpPort).toBe(3380);
  });

  it('defaults viServerTcpEnabled=true (Windows default-on) when server.tcp.enabled is absent', async () => {
    const settings = await resolveWindowsLabviewTcpSettingsForLabviewPath(labviewPath, {
      readFile: vi.fn().mockResolvedValue('LoadAddOns=False\n') as never,
      processPlatform: 'win32'
    });
    expect(settings.viServerTcpEnabled).toBe(true);
    expect(settings.labviewTcpPort).toBe(3363);
  });

  it('defaults the port to 3363 when TCP is enabled but server.tcp.port is omitted', async () => {
    const settings = await resolveWindowsLabviewTcpSettingsForLabviewPath(labviewPath, {
      readFile: vi.fn().mockResolvedValue('server.tcp.enabled=True\n') as never,
      processPlatform: 'win32'
    });
    expect(settings.viServerTcpEnabled).toBe(true);
    expect(settings.labviewTcpPort).toBe(3363);
  });

  it('flags viServerTcpEnabled=false for the quoted disabled form', async () => {
    const settings = await resolveWindowsLabviewTcpSettingsForLabviewPath(labviewPath, {
      readFile: vi.fn().mockResolvedValue('server.tcp.enabled="FALSE"\n') as never,
      processPlatform: 'win32'
    });
    expect(settings.viServerTcpEnabled).toBe(false);
    expect(settings.notes.join(' ')).toMatch(/server\.tcp\.enabled=False/);
    expect(settings.notes.join(' ')).toMatch(/VI Server/i);
  });

  it('flags viServerTcpEnabled=false for the unquoted disabled form', async () => {
    const settings = await resolveWindowsLabviewTcpSettingsForLabviewPath(labviewPath, {
      readFile: vi.fn().mockResolvedValue('server.tcp.enabled=false\n') as never,
      processPlatform: 'win32'
    });
    expect(settings.viServerTcpEnabled).toBe(false);
  });

  it('returns viServerTcpEnabled=unknown when the LabVIEW.ini is not readable', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const settings = await resolveWindowsLabviewTcpSettingsForLabviewPath(labviewPath, {
      readFile: vi.fn().mockRejectedValue(enoent) as never,
      processPlatform: 'win32'
    });
    expect(settings.viServerTcpEnabled).toBe('unknown');
    expect(settings.labviewTcpPort).toBeUndefined();
    expect(settings.notes.join(' ')).toMatch(/not readable/);
  });
});

describe('Linux host-native short-path staging (VHS-REQ-156)', () => {
  function makeLinuxHostNativeRecord() {
    const record = createReadyRecord();
    record.runtimeSelection.platform = 'linux';
    record.runtimeSelection.bitness = 'x64';
    record.runtimeSelection.provider = 'host-native';
    record.runtimeSelection.executionMode = 'host-only';
    record.runtimeSelection.requestedProvider = 'host';
    record.runtimeSelection.requestedLabviewVersion = '2026';
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
    return record;
  }

  it('shouldUseLinuxHostNativeShortPathStaging returns true for linux host-native deep workspaceStorage paths (VHS-REQ-156.8)', () => {
    const record = makeLinuxHostNativeRecord();
    expect(shouldUseLinuxHostNativeShortPathStaging(record, 'linux', {})).toBe(true);
  });

  it('shouldUseLinuxHostNativeShortPathStaging returns false on non-linux host', () => {
    const record = makeLinuxHostNativeRecord();
    expect(shouldUseLinuxHostNativeShortPathStaging(record, 'win32', {})).toBe(false);
    expect(shouldUseLinuxHostNativeShortPathStaging(record, 'darwin', {})).toBe(false);
  });

  it('shouldUseLinuxHostNativeShortPathStaging returns false for non host-native providers', () => {
    const record = makeLinuxHostNativeRecord();
    record.runtimeSelection.provider = 'linux-container';
    expect(shouldUseLinuxHostNativeShortPathStaging(record, 'linux', {})).toBe(false);
  });

  it('shouldUseLinuxHostNativeShortPathStaging returns false when LVIE_LINUX_DISABLE_RUNTIME_TMPDIR=1 (VHS-REQ-156.8)', () => {
    const record = makeLinuxHostNativeRecord();
    expect(
      shouldUseLinuxHostNativeShortPathStaging(record, 'linux', {
        LVIE_LINUX_DISABLE_RUNTIME_TMPDIR: '1'
      })
    ).toBe(false);
  });

  it('shouldUseLinuxHostNativeShortPathStaging returns false when staging already lives under the tmp root (VHS-REQ-156.8)', () => {
    const record = makeLinuxHostNativeRecord();
    record.artifactPlan.reportDirectory = '/tmp/vi-history-suite-runtime/repoid123456/fileid123456';
    expect(
      shouldUseLinuxHostNativeShortPathStaging(record, 'linux', {
        LVIE_LINUX_RUNTIME_TMPDIR: '/tmp/vi-history-suite-runtime'
      })
    ).toBe(false);
  });

  it('shouldUseLinuxHostNativeShortPathStaging returns true when reportDir only shares a prefix with the tmp root (VHS-REQ-156.8)', () => {
    // /tmp/vi-history-suite-runtime-old/... must not be treated as inside /tmp/vi-history-suite-runtime.
    const record = makeLinuxHostNativeRecord();
    record.artifactPlan.reportDirectory =
      '/tmp/vi-history-suite-runtime-old/repoid123456/fileid123456';
    expect(
      shouldUseLinuxHostNativeShortPathStaging(record, 'linux', {
        LVIE_LINUX_RUNTIME_TMPDIR: '/tmp/vi-history-suite-runtime'
      })
    ).toBe(true);
  });

  it('buildLinuxHostNativeShortPathLayout uses LVIE_LINUX_RUNTIME_TMPDIR when set (VHS-REQ-156.8)', () => {
    const record = makeLinuxHostNativeRecord();
    const layout = buildLinuxHostNativeShortPathLayout(record, {
      LVIE_LINUX_RUNTIME_TMPDIR: '/tmp/lvie-runtime'
    });
    expect(layout.reportDirectory).toBe('/tmp/lvie-runtime/repoid123456/fileid123456');
    expect(layout.stagingDirectory).toBe('/tmp/lvie-runtime/repoid123456/fileid123456/staging');
    expect(layout.leftFilePath).toBe(
      '/tmp/lvie-runtime/repoid123456/fileid123456/staging/left-111111112222-foo.vi'
    );
    expect(layout.rightFilePath).toBe(
      '/tmp/lvie-runtime/repoid123456/fileid123456/staging/right-abcdef123456-foo.vi'
    );
    expect(layout.reportFilePath).toBe(
      '/tmp/lvie-runtime/repoid123456/fileid123456/diff-report-foo.vi.html'
    );
  });

  it('buildLinuxHostNativeShortPathCommandPlan rewrites -VI1, -VI2, -ReportPath and preserves -LabVIEWPath (VHS-REQ-156.8)', () => {
    const record = makeLinuxHostNativeRecord();
    const layout = buildLinuxHostNativeShortPathLayout(record, {
      LVIE_LINUX_RUNTIME_TMPDIR: '/tmp/lvie-runtime'
    });
    const rewritten = buildLinuxHostNativeShortPathCommandPlan(
      record,
      {
        executable: '/usr/local/bin/LabVIEWCLI',
        args: [
          '-LogToConsole',
          'TRUE',
          '-OperationName',
          'CreateComparisonReport',
          '-VI1',
          '/workspace/.storage/reports/repoid123456/fileid123456/staging/left-111111112222-foo.vi',
          '-VI2',
          '/workspace/.storage/reports/repoid123456/fileid123456/staging/right-abcdef123456-foo.vi',
          '-ReportType',
          'HTML',
          '-ReportPath',
          '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
          '-LabVIEWPath',
          '/usr/local/natinst/LabVIEW-2026-64/labview'
        ]
      },
      layout
    );
    expect(rewritten?.executable).toBe('/usr/local/bin/LabVIEWCLI');
    expect(rewritten?.args).toContain(layout.leftFilePath);
    expect(rewritten?.args).toContain(layout.rightFilePath);
    expect(rewritten?.args).toContain(layout.reportFilePath);
    expect(rewritten?.args).toContain('/usr/local/natinst/LabVIEW-2026-64/labview');
    expect(rewritten?.args).not.toContain(
      '/workspace/.storage/reports/repoid123456/fileid123456/staging/left-111111112222-foo.vi'
    );
    expect(rewritten?.args).not.toContain(
      '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html'
    );
  });

  it('rewriteLabviewCliArgsForLinuxContainerWorkspace targets labviewprofull headless under the container workspace (VHS-REQ-657.1)', () => {
    const rewritten = rewriteLabviewCliArgsForLinuxContainerWorkspace(
      [
        '-LogToConsole',
        'TRUE',
        '-OperationName',
        'CreateComparisonReport',
        '-VI1',
        '/host/staging/left-111111112222-foo.vi',
        '-VI2',
        '/host/staging/right-abcdef123456-foo.vi',
        '-ReportType',
        'HTML',
        '-ReportPath',
        '/host/diff-report-foo.vi.html',
        '-LabVIEWPath',
        '/usr/local/natinst/LabVIEW-2026-64/labview'
      ],
      {
        containerWorkspaceRoot: '/workspace',
        leftFilename: 'left-111111112222-foo.vi',
        rightFilename: 'right-abcdef123456-foo.vi',
        reportFilename: 'diff-report-foo.vi.html'
      }
    );

    expect(rewritten).toBeDefined();
    // VI and report paths are remapped under the container workspace mount.
    expect(rewritten).toContain('/workspace/staging/left-111111112222-foo.vi');
    expect(rewritten).toContain('/workspace/staging/right-abcdef123456-foo.vi');
    expect(rewritten).toContain('/workspace/diff-report-foo.vi.html');
    // NI's canonical container compare (vidiff.sh) uses the Professional binary
    // plus -Headless; the inbound plain `labview` -LabVIEWPath is replaced.
    const labviewPathIndex = rewritten?.indexOf('-LabVIEWPath') ?? -1;
    expect(labviewPathIndex).toBeGreaterThanOrEqual(0);
    expect(rewritten?.[labviewPathIndex + 1]).toBe(
      '/usr/local/natinst/LabVIEW-2026-64/labviewprofull'
    );
    expect(rewritten).toContain('-Headless');
    expect(rewritten).not.toContain('/usr/local/natinst/LabVIEW-2026-64/labview');
  });

  it('rewriteLabviewCliArgsForLinuxContainerWorkspace targets the image labview without -Headless for 2025 Q3 (VHS-REQ-657.2)', () => {
    const rewritten = rewriteLabviewCliArgsForLinuxContainerWorkspace(
      [
        '-OperationName',
        'CreateComparisonReport',
        '-VI1',
        '/host/staging/left-111111112222-foo.vi',
        '-VI2',
        '/host/staging/right-abcdef123456-foo.vi',
        '-ReportType',
        'HTML',
        '-ReportPath',
        '/host/diff-report-foo.vi.html',
        '-LabVIEWPath',
        '/usr/local/natinst/LabVIEW-2026-64/labview'
      ],
      {
        containerWorkspaceRoot: '/workspace',
        leftFilename: 'left-111111112222-foo.vi',
        rightFilename: 'right-abcdef123456-foo.vi',
        reportFilename: 'diff-report-foo.vi.html',
        containerLabviewPath: '/usr/local/natinst/LabVIEW-2025-64/labview',
        headlessMode: 'enable-cicd-env'
      }
    );

    expect(rewritten).toBeDefined();
    const labviewPathIndex = rewritten?.indexOf('-LabVIEWPath') ?? -1;
    expect(labviewPathIndex).toBeGreaterThanOrEqual(0);
    expect(rewritten?.[labviewPathIndex + 1]).toBe('/usr/local/natinst/LabVIEW-2025-64/labview');
    // LabVIEW 2025 Q3 engages CI/CD headless via the env toggle, never -Headless.
    expect(rewritten).not.toContain('-Headless');
    expect(rewritten).not.toContain('/usr/local/natinst/LabVIEW-2026-64/labviewprofull');
  });

  it('buildLinuxContainerCommandPlan derives the 2025 Q3 invocation from the image (VHS-REQ-657.2)', () => {
    const record = createReadyRecord();
    record.runtimeSelection = {
      ...record.runtimeSelection,
      platform: 'linux',
      containerRuntimePlatform: 'linux',
      provider: 'linux-container',
      engine: 'labview-cli'
    };

    const plan = buildLinuxContainerCommandPlan(
      record,
      {
        executable: '/usr/local/bin/LabVIEWCLI',
        args: [
          '-OperationName',
          'CreateComparisonReport',
          '-VI1',
          '/host/staging/left-111111112222-foo.vi',
          '-VI2',
          '/host/staging/right-abcdef123456-foo.vi',
          '-ReportType',
          'htmlsinglefile',
          '-ReportPath',
          '/host/diff-report-foo.vi.html'
        ]
      },
      {
        hostReportDirectory: '/host/report',
        hostTempDirectory: '/host/report/container-temp',
        containerWorkspaceRoot: '/workspace',
        containerImage: 'nationalinstruments/labview:2025q3-linux',
        processPlatform: 'linux'
      }
    );

    expect(plan).toBeDefined();
    expect(plan?.args).toContain('nationalinstruments/labview:2025q3-linux');
    const script = plan?.args[plan.args.length - 1] ?? '';
    expect(script).toContain('export EnableCICDFeaturesForLabVIEW=TRUE');
    expect(script).toContain('/usr/local/natinst/LabVIEW-2025-64/labview');
    expect(script).not.toContain('/usr/local/natinst/LabVIEW-2026-64/labviewprofull');
    expect(script).not.toContain('-Headless');
  });

  it('buildLinuxContainerCommandPlan keeps 2026 labviewprofull + -Headless without the CI/CD env (VHS-REQ-657.1)', () => {
    const record = createReadyRecord();
    record.runtimeSelection = {
      ...record.runtimeSelection,
      platform: 'linux',
      containerRuntimePlatform: 'linux',
      provider: 'linux-container',
      engine: 'labview-cli'
    };

    const plan = buildLinuxContainerCommandPlan(
      record,
      {
        executable: '/usr/local/bin/LabVIEWCLI',
        args: [
          '-OperationName',
          'CreateComparisonReport',
          '-VI1',
          '/host/staging/left-111111112222-foo.vi',
          '-VI2',
          '/host/staging/right-abcdef123456-foo.vi',
          '-ReportType',
          'htmlsinglefile',
          '-ReportPath',
          '/host/diff-report-foo.vi.html'
        ]
      },
      {
        hostReportDirectory: '/host/report',
        hostTempDirectory: '/host/report/container-temp',
        containerWorkspaceRoot: '/workspace',
        containerImage: 'nationalinstruments/labview:2026q1-linux',
        processPlatform: 'linux'
      }
    );

    expect(plan).toBeDefined();
    const script = plan?.args[plan.args.length - 1] ?? '';
    expect(script).toContain('/usr/local/natinst/LabVIEW-2026-64/labviewprofull');
    expect(script).toContain('-Headless');
    expect(script).not.toContain('EnableCICDFeaturesForLabVIEW');
  });

  it('buildLinuxContainerCommandPlan retries once on -350000 and hardens the LabVIEW .conf (VHS-REQ-148)', () => {
    const record = createReadyRecord();
    record.runtimeSelection = {
      ...record.runtimeSelection,
      platform: 'linux',
      containerRuntimePlatform: 'linux',
      provider: 'linux-container',
      engine: 'labview-cli'
    };

    const plan = buildLinuxContainerCommandPlan(
      record,
      {
        executable: '/usr/local/bin/LabVIEWCLI',
        args: [
          '-OperationName',
          'CreateComparisonReport',
          '-VI1',
          '/host/staging/left-111111112222-foo.vi',
          '-VI2',
          '/host/staging/right-abcdef123456-foo.vi',
          '-ReportType',
          'htmlsinglefile',
          '-ReportPath',
          '/host/diff-report-foo.vi.html'
        ]
      },
      {
        hostReportDirectory: '/host/report',
        hostTempDirectory: '/host/report/container-temp',
        containerWorkspaceRoot: '/workspace',
        containerImage: 'nationalinstruments/labview:2026q1-linux',
        processPlatform: 'linux'
      }
    );

    expect(plan).toBeDefined();
    const script = plan?.args[plan.args.length - 1] ?? '';
    // Retry loop guards against the cold-launch VI Server connect failure.
    expect(script).toContain('max_attempts=2');
    expect(script).toContain('-350000');
    expect(script).toContain('failed to establish a connection with LabVIEW');
    expect(script).toContain('"$cli_path" "${args[@]}" 2>"$err_file"');
    // Connect-window hardening targets the per-version LabVIEW .conf the launched
    // headless LabVIEW reads.
    expect(script).toContain('harden_conf');
    expect(script).toContain('${HOME:-/root}/natinst/.config/LabVIEW-${lv_year}');
    expect(script).toContain('OpenAppReferenceTimeoutInSecond');
    expect(script).toContain('AfterLaunchOpenAppReferenceTimeoutInSecond');
    expect(script).toContain('open_app_timeout=180');
  });

  it('buildLinuxContainerCommandPlan honors a configured cliConnectTimeoutSeconds (VHS-REQ-148)', () => {
    const record = createReadyRecord();
    record.runtimeSelection = {
      ...record.runtimeSelection,
      platform: 'linux',
      containerRuntimePlatform: 'linux',
      provider: 'linux-container',
      engine: 'labview-cli'
    };

    const plan = buildLinuxContainerCommandPlan(
      record,
      {
        executable: '/usr/local/bin/LabVIEWCLI',
        args: [
          '-OperationName',
          'CreateComparisonReport',
          '-VI1',
          '/host/staging/left-111111112222-foo.vi',
          '-VI2',
          '/host/staging/right-abcdef123456-foo.vi',
          '-ReportType',
          'htmlsinglefile',
          '-ReportPath',
          '/host/diff-report-foo.vi.html'
        ]
      },
      {
        hostReportDirectory: '/host/report',
        hostTempDirectory: '/host/report/container-temp',
        containerWorkspaceRoot: '/workspace',
        containerImage: 'nationalinstruments/labview:2026q1-linux',
        processPlatform: 'linux',
        cliConnectTimeoutSeconds: 300
      }
    );

    const script = plan?.args[plan.args.length - 1] ?? '';
    expect(script).toContain('open_app_timeout=300');
    expect(script).toContain('after_launch_timeout=300');
  });

  it('buildLinuxContainerCommandPlan invokes docker directly on a Windows host and preserves bash script quoting (#583)', () => {
    const record = createReadyRecord();
    // Real-world shape from the failing run: a Windows host running Docker in
    // Linux-container mode (host platform win32, container runtime linux).
    record.runtimeSelection = {
      ...record.runtimeSelection,
      platform: 'win32',
      containerRuntimePlatform: 'linux',
      provider: 'linux-container',
      engine: 'labview-cli'
    };

    const plan = buildLinuxContainerCommandPlan(
      record,
      {
        executable: '/usr/local/bin/LabVIEWCLI',
        args: [
          '-OperationName',
          'CreateComparisonReport',
          '-VI1',
          '/host/staging/left-111111112222-foo.vi',
          '-VI2',
          '/host/staging/right-abcdef123456-foo.vi',
          '-ReportType',
          'htmlsinglefile',
          '-ReportPath',
          '/host/diff-report-foo.vi.html'
        ]
      },
      {
        hostReportDirectory: 'C:\\host\\report',
        hostTempDirectory: 'C:\\host\\report\\container-temp',
        containerWorkspaceRoot: '/workspace',
        containerImage: 'nationalinstruments/labview:2026q1-linux',
        processPlatform: 'win32'
      }
    );

    expect(plan).toBeDefined();
    // The plan must spawn `docker` directly, NOT wrap the command in a host
    // `powershell.exe -EncodedCommand` string (which strips the inline bash
    // script's quotes and produced an unparseable script in #583).
    expect(plan?.executable).toBe('docker');
    expect(plan?.executable).not.toBe('powershell.exe');
    expect(plan?.args).not.toContain('-EncodedCommand');
    expect(plan?.args).not.toContain('-NoProfile');

    // The Windows bind mount and the `bash -lc <script>` tail are passed as
    // discrete argv elements, so the script survives as one argument.
    expect(plan?.args).toContain('run');
    expect(plan?.args).toContain('--rm');
    expect(plan?.args).toContain('-v');
    expect(plan?.args).toContain('C:\\host\\report:/workspace');
    expect(plan?.args).toContain('nationalinstruments/labview:2026q1-linux');
    expect(plan?.args[plan.args.length - 2]).toBe('-lc');

    // The single trailing script argument keeps every quote that PowerShell had
    // stripped: the .conf hardening helpers and the CLI invocation are intact.
    const script = plan?.args[plan.args.length - 1] ?? '';
    expect(script).toContain('grep -qE "^[[:space:]]*${conf_key}=" "$conf_file"');
    expect(script).toContain('"$(dirname "$conf_file")"');
    expect(script).toContain('"$cli_path" "${args[@]}" 2>"$err_file"');
    expect(script).toContain('harden_conf');
  });

  it('executes LabVIEWCLI against tmp short-path staging, copies report back, and cleans up (VHS-REQ-156.8)', async () => {
    const record = makeLinuxHostNativeRecord();
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const copyFile = vi.fn().mockResolvedValue(undefined);
    const removePath = vi.fn().mockResolvedValue(undefined);
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'CreateComparisonReport operation succeeded.',
      stderr: ''
    });
    const tmpRoot = '/tmp/lvie-runtime-test';
    const expectedTmpReportPath = `${tmpRoot}/repoid123456/fileid123456/diff-report-foo.vi.html`;

    process.env.LVIE_LINUX_RUNTIME_TMPDIR = tmpRoot;
    try {
      const result = await executeComparisonReport(
        { record, repositoryRoot: '/workspace/repo' },
        {
          readRevisionBlob: vi
            .fn()
            .mockResolvedValueOnce(Buffer.from('left'))
            .mockResolvedValueOnce(Buffer.from('right')),
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile: writeFile as never,
          copyFile: copyFile as never,
          copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
          removePath: removePath as never,
          unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
          readdir: vi.fn().mockResolvedValue([]) as never,
          readFile: vi.fn(async (filePath: string) => {
            if (typeof filePath === 'string' && filePath.endsWith('labview.conf')) {
              return 'server.tcp.enabled=True\nserver.tcp.port=3363\n';
            }
            return '';
          }) as never,
          pathExists: vi.fn(async (filePath: string) =>
            typeof filePath === 'string' && filePath.endsWith(record.artifactPlan.reportFilename)
          ),
          runCommand: runCommand as never,
          nowIso: vi.fn().mockReturnValue('2026-06-02T18:00:00.000Z'),
          nowMs: vi.fn().mockReturnValue(1000),
          writePacketRecord: vi.fn().mockResolvedValue(undefined),
          processPlatform: 'linux'
        }
      );

      expect(result.record.runtimeExecution.state).toBe('succeeded');
      const issuedArgs = runCommand.mock.calls[0]?.[0]?.args ?? [];
      expect(issuedArgs).toContain(expectedTmpReportPath);
      expect(issuedArgs).toContain(`${tmpRoot}/repoid123456/fileid123456/staging/left-111111112222-foo.vi`);
      expect(copyFile).toHaveBeenCalledWith(
        expectedTmpReportPath,
        record.artifactPlan.reportFilePath
      );
      expect(removePath).toHaveBeenCalledWith(
        `${tmpRoot}/repoid123456/fileid123456`,
        expect.objectContaining({ recursive: true, force: true })
      );
      const notes = result.record.runtimeExecution.diagnosticNotes ?? [];
      expect(notes.some((note) => /short-path|path-table corruption|workspaceStorage/i.test(note))).toBe(true);
      // VHS-REQ-156 (#292): the packet discloses that host-native LabVIEW stays
      // resident after the run so it is not mistaken for a leak.
      expect(notes.some((note) => /stays running|reuse the warm session|quit LabVIEW/i.test(note))).toBe(true);
    } finally {
      delete process.env.LVIE_LINUX_RUNTIME_TMPDIR;
    }
  });

  it('materializes the dependency tree into the short-path staging dir, not the retained report dir (VHS-REQ-624)', async () => {
    const record = makeLinuxHostNativeRecord();
    record.preflight.normalizedRelativePath = 'Source/Sub/foo.vi';
    record.artifactPlan.normalizedRelativePath = 'Source/Sub/foo.vi';
    record.preflight.left.resolvedRelativePath = 'Source/Sub/foo.vi';
    record.preflight.right.resolvedRelativePath = 'Source/Sub/foo.vi';
    record.stagedRevisionPlan = buildStagedRevisionPlan({
      stagingDirectory: record.artifactPlan.stagingDirectory,
      fullFilename: record.artifactPlan.fullFilename,
      leftRevisionId: record.baseHash,
      rightRevisionId: record.selectedHash,
      normalizedRelativePath: 'Source/Sub/foo.vi'
    });

    const materializeSelectedRevisionTree = vi.fn().mockResolvedValue(undefined);
    const tmpRoot = '/tmp/lvie-runtime-test';
    const expectedShortPathStagingDir = `${tmpRoot}/repoid123456/fileid123456/staging`;

    process.env.LVIE_LINUX_RUNTIME_TMPDIR = tmpRoot;
    try {
      const result = await executeComparisonReport(
        { record, repositoryRoot: '/workspace/repo' },
        {
          readRevisionBlob: vi
            .fn()
            .mockResolvedValueOnce(Buffer.from('base'))
            .mockResolvedValueOnce(Buffer.from('selected')),
          materializeSelectedRevisionTree,
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile: vi.fn().mockResolvedValue(undefined) as never,
          copyFile: vi.fn().mockResolvedValue(undefined) as never,
          copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
          removePath: vi.fn().mockResolvedValue(undefined) as never,
          unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
          readdir: vi.fn().mockResolvedValue([]) as never,
          readFile: vi.fn(async (filePath: string) => {
            if (typeof filePath === 'string' && filePath.endsWith('labview.conf')) {
              return 'server.tcp.enabled=True\nserver.tcp.port=3363\n';
            }
            return '';
          }) as never,
          pathExists: vi.fn(async (filePath: string) =>
            typeof filePath === 'string' && filePath.endsWith(record.artifactPlan.reportFilename)
          ),
          runCommand: vi.fn().mockResolvedValue({
            exitCode: 0,
            stdout: 'CreateComparisonReport operation succeeded.',
            stderr: ''
          }) as never,
          nowIso: vi.fn().mockReturnValue('2026-06-02T18:00:00.000Z'),
          nowMs: vi.fn().mockReturnValue(1000),
          writePacketRecord: vi.fn().mockResolvedValue(undefined),
          processPlatform: 'linux'
        }
      );

      // The fix: the tree is materialized into the SHORT-PATH staging dir that the
      // run actually executes against, not the retained report directory.
      expect(materializeSelectedRevisionTree).toHaveBeenCalledTimes(1);
      expect(materializeSelectedRevisionTree).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryRoot: '/workspace/repo',
          revisionId: record.selectedHash,
          destinationRoot: expectedShortPathStagingDir
        })
      );
      // It must NOT materialize into the retained report/staging directory.
      const retainedStagingDir = record.artifactPlan.stagingDirectory;
      for (const call of materializeSelectedRevisionTree.mock.calls) {
        expect(call[0].destinationRoot).not.toBe(retainedStagingDir);
      }
      expect(result.record.runtimeExecution.materializedTree).toMatchObject({
        revisionId: record.selectedHash,
        root: expectedShortPathStagingDir
      });
      expect(result.record.runtimeExecution.state).toBe('succeeded');
    } finally {
      delete process.env.LVIE_LINUX_RUNTIME_TMPDIR;
    }
  });
});

describe('newest-revision tree staging (VHS-REQ-624)', () => {
  function createNestedReadyRecord(): ComparisonReportPacketRecord {
    const record = createReadyRecord();
    record.preflight.normalizedRelativePath = 'Source/Sub/foo.vi';
    record.artifactPlan.normalizedRelativePath = 'Source/Sub/foo.vi';
    record.preflight.left.resolvedRelativePath = 'Source/Sub/foo.vi';
    record.preflight.left.blobSpecifier = '1111111122222222:Source/Sub/foo.vi';
    record.preflight.right.resolvedRelativePath = 'Source/Sub/foo.vi';
    record.preflight.right.blobSpecifier = 'abcdef1234567890:Source/Sub/foo.vi';
    record.stagedRevisionPlan = buildStagedRevisionPlan({
      stagingDirectory: record.artifactPlan.stagingDirectory,
      fullFilename: record.artifactPlan.fullFilename,
      leftRevisionId: record.baseHash,
      rightRevisionId: record.selectedHash,
      normalizedRelativePath: 'Source/Sub/foo.vi'
    });
    return record;
  }

  it('materializes one selected-revision tree and stages both VIs at repo-relative depth (VHS-REQ-624.1, VHS-REQ-624.4, VHS-REQ-624.5)', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const materializeSelectedRevisionTree = vi.fn().mockResolvedValue(undefined);
    const record = createNestedReadyRecord();
    const plan = record.stagedRevisionPlan;

    await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('base-blob'))
          .mockResolvedValueOnce(Buffer.from('selected-blob')),
        materializeSelectedRevisionTree,
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: writeFile as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    // Exactly one tree, pinned to the selected (newest) revision, into the staging root.
    expect(materializeSelectedRevisionTree).toHaveBeenCalledTimes(1);
    expect(materializeSelectedRevisionTree).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryRoot: '/workspace/repo',
        revisionId: record.selectedHash,
        destinationRoot: plan.treeRoot
      })
    );
    // Both renamed VIs live under the same tree root at the VI's relative depth.
    // Normalize separators so the containment check holds on win32 hosts, where
    // path.join yields backslashes while the staging-root string keeps forward slashes.
    const toPosix = (value: string): string => value.replace(/\\/g, '/');
    expect(plan.relativeDirectory).toBe('Source/Sub');
    expect(toPosix(plan.leftFilePath).startsWith(toPosix(plan.treeRoot as string))).toBe(true);
    expect(toPosix(plan.rightFilePath).startsWith(toPosix(plan.treeRoot as string))).toBe(true);
    expect(plan.leftFilePath).toContain('Source');
    // Base blob -> left filename; selected blob -> right filename.
    expect(writeFile).toHaveBeenCalledWith(plan.leftFilePath, Buffer.from('base-blob'));
    expect(writeFile).toHaveBeenCalledWith(plan.rightFilePath, Buffer.from('selected-blob'));
  });

  it('prunes the retained materialized tree back to the two staged VIs on win32 host-native', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const removePath = vi.fn().mockResolvedValue(undefined);
    const materializeSelectedRevisionTree = vi.fn().mockResolvedValue(undefined);
    const record = createNestedReadyRecord();
    const plan = record.stagedRevisionPlan;

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('base-blob'))
          .mockResolvedValueOnce(Buffer.from('selected-blob')),
        materializeSelectedRevisionTree,
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: writeFile as never,
        removePath: removePath as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32',
        // #540: this test exercises the staging/prune path through runCommand, not
        // the Windows host preflight (which has its own tests). The preflight
        // defaults to the real process.platform and process observer, so on a
        // Windows maintainer host with LabVIEW running it would block before
        // runCommand and fail this test. Disable it to keep the test hermetic.
        enforceWindowsHostPreflight: false
      }
    );

    // After the run, the whole-repo tree in the retained staging dir is removed...
    expect(removePath).toHaveBeenCalledWith(
      plan.treeRoot,
      expect.objectContaining({ recursive: true, force: true })
    );
    // ...and the two staged VIs are re-written so retained evidence keeps only them.
    const leftWrites = writeFile.mock.calls.filter(
      (call) => call[0] === plan.leftFilePath && Buffer.isBuffer(call[1]) && call[1].equals(Buffer.from('base-blob'))
    );
    const rightWrites = writeFile.mock.calls.filter(
      (call) => call[0] === plan.rightFilePath && Buffer.isBuffer(call[1]) && call[1].equals(Buffer.from('selected-blob'))
    );
    // Written once during staging and once during prune re-stage.
    expect(leftWrites.length).toBeGreaterThanOrEqual(2);
    expect(rightWrites.length).toBeGreaterThanOrEqual(2);
    expect(result.record.runtimeExecution.state).toBe('succeeded');
    expect(result.record.runtimeExecution.materializedTree?.revisionId).toBe(record.selectedHash);
  });

  it('does not prune when materialization is skipped (no materializer injected)', async () => {
    const removePath = vi.fn().mockResolvedValue(undefined);
    const record = createNestedReadyRecord();
    const plan = record.stagedRevisionPlan;

    await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('base-blob'))
          .mockResolvedValueOnce(Buffer.from('selected-blob')),
        // no materializeSelectedRevisionTree -> staging stays flat, nothing to prune
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        removePath: removePath as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(removePath).not.toHaveBeenCalledWith(
      plan.treeRoot,
      expect.objectContaining({ recursive: true, force: true })
    );
  });

  it('fails closed with a retained reason when the selected-revision tree cannot be materialized (VHS-REQ-624.6)', async () => {
    const runCommand = vi.fn();
    const record = createNestedReadyRecord();

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      {
        readRevisionBlob: vi.fn().mockResolvedValue(Buffer.from('vi')),
        materializeSelectedRevisionTree: vi.fn().mockRejectedValue(new Error('partial-clone')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand,
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(runCommand).not.toHaveBeenCalled();
    expect(result.record.runtimeExecution).toMatchObject({
      state: 'failed',
      attempted: false,
      failureReason: 'selected-tree-materialize-failed'
    });
  });

  it('surfaces an actionable long-path diagnostic when a deep storage root trips MAX_PATH (#303)', async () => {
    const runCommand = vi.fn();
    const record = createNestedReadyRecord();

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      {
        readRevisionBlob: vi.fn().mockResolvedValue(Buffer.from('vi')),
        materializeSelectedRevisionTree: vi
          .fn()
          .mockRejectedValue(
            new Error(
              'git -C /workspace/repo -c core.longpaths=true --work-tree /deep checkout-index -a -f exited 1: ' +
                'error: unable to create file resource/plugins/NIIconEditor/Class/FakedArray/ToMoreSpecificClass/ClusterRef_2_DisplayTemplatesRef.vi: Filename too long'
            )
          ),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand,
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(runCommand).not.toHaveBeenCalled();
    // The stable failure reason is retained for existing classifiers/auto-filer.
    expect(result.record.runtimeExecution.failureReason).toBe('selected-tree-materialize-failed');
    // A more specific, actionable diagnostic is attached on top of it.
    expect(result.record.runtimeExecution.diagnosticReason).toBe(
      SELECTED_TREE_MATERIALIZE_LONG_PATH_DIAGNOSTIC
    );
    expect(result.record.runtimeExecution.diagnosticNotes?.join(' ')).toMatch(/MAX_PATH/);
  });

  it('stages and runs a dependency-free root VI without regression', async () => {
    const runCommand = vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' });
    const record = createReadyRecord();
    record.stagedRevisionPlan = buildStagedRevisionPlan({
      stagingDirectory: record.artifactPlan.stagingDirectory,
      fullFilename: record.artifactPlan.fullFilename,
      leftRevisionId: record.baseHash,
      rightRevisionId: record.selectedHash,
      normalizedRelativePath: record.artifactPlan.normalizedRelativePath
    });

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('base'))
          .mockResolvedValueOnce(Buffer.from('selected')),
        materializeSelectedRevisionTree: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand,
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32',
        // #540: this test exercises the staging path through runCommand, not the
        // Windows host preflight (which has its own tests). The preflight defaults
        // to the real process.platform and process observer, so on a Windows
        // maintainer host with LabVIEW running it would block before runCommand
        // and fail this test. Disable it to keep the test hermetic.
        enforceWindowsHostPreflight: false
      }
    );

    expect(record.stagedRevisionPlan.relativeDirectory).toBe('');
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(result.record.stagedRevisionPlan.leftFilename).toBe('left-111111112222-foo.vi');
    expect(result.record.stagedRevisionPlan.rightFilename).toBe('right-abcdef123456-foo.vi');
  });

  it('materializes the selected tree into the linux-container workspace and mounts it', async () => {
    const record = createReadyRecord();
    record.stagedRevisionPlan = buildStagedRevisionPlan({
      stagingDirectory: record.artifactPlan.stagingDirectory,
      fullFilename: record.artifactPlan.fullFilename,
      leftRevisionId: record.baseHash,
      rightRevisionId: record.selectedHash,
      normalizedRelativePath: record.artifactPlan.normalizedRelativePath
    });
    record.runtimeSelection = {
      ...record.runtimeSelection,
      platform: 'linux',
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

    const materializeSelectedRevisionTree = vi.fn().mockResolvedValue(undefined);
    const expectedContainerStagingDir = `${record.artifactPlan.reportDirectory}/container-out/staging`;
    let capturedDockerArgs: string[] = [];

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('base'))
          .mockResolvedValueOnce(Buffer.from('selected')),
        materializeSelectedRevisionTree,
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        readdir: vi.fn().mockResolvedValue([]) as never,
        readFile: vi.fn().mockResolvedValue('') as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand: vi.fn(async (plan: { args: string[] }) => {
          capturedDockerArgs = plan.args;
          return { exitCode: 0, stdout: 'CreateComparisonReport operation succeeded.\n', stderr: '' };
        }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'linux'
      }
    );

    // One materialization, pinned to the selected revision, into the container staging dir.
    expect(materializeSelectedRevisionTree).toHaveBeenCalledTimes(1);
    expect(materializeSelectedRevisionTree).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryRoot: '/workspace/repo',
        revisionId: record.selectedHash,
        destinationRoot: expectedContainerStagingDir
      })
    );
    // Docker mounts the container-out tree and the VI args resolve inside /workspace/staging.
    expect(capturedDockerArgs.join(' ')).toContain('/workspace/staging/');
    expect(result.record.runtimeExecution.materializedTree).toMatchObject({
      revisionId: record.selectedHash,
      root: expectedContainerStagingDir
    });
  });

  it('does not let a traversal/absolute relative path escape the staging directory (security)', () => {
    // VHS-REQ-624 security: deriveRelativeDirectory must reject unsafe paths so the
    // staged VIs never land outside the staging root.
    for (const unsafe of [
      '../../../etc/passwd/main.vi',
      '/etc/cron.d/main.vi',
      'C:/Windows/system32/main.vi',
      'a/../../b/main.vi'
    ]) {
      const plan = buildStagedRevisionPlan({
        stagingDirectory: '/workspace/.storage/reports/repoid/fileid/staging',
        fullFilename: 'main.vi',
        leftRevisionId: '1111111122222222',
        rightRevisionId: 'abcdef1234567890',
        normalizedRelativePath: unsafe
      });

      expect(plan.relativeDirectory).toBe('');
      expect(plan.leftFilePath).toBe(
        path.join(
          '/workspace/.storage/reports/repoid/fileid/staging',
          'left-111111112222-main.vi'
        )
      );
      expect(plan.leftFilePath).not.toContain('..');
      expect(plan.rightFilePath).not.toContain('..');
    }
  });

  it('materializes the dependency tree for linux-container on a Windows interop host', async () => {
    const record = createReadyRecord();
    record.stagedRevisionPlan = buildStagedRevisionPlan({
      stagingDirectory: record.artifactPlan.stagingDirectory,
      fullFilename: record.artifactPlan.fullFilename,
      leftRevisionId: record.baseHash,
      rightRevisionId: record.selectedHash,
      normalizedRelativePath: record.artifactPlan.normalizedRelativePath
    });
    record.runtimeSelection = {
      ...record.runtimeSelection,
      platform: 'win32',
      containerRuntimePlatform: 'linux',
      provider: 'linux-container',
      containerImage: 'nationalinstruments/labview:2026q1-linux',
      containerImageAvailable: true,
      containerAcquisitionState: 'not-required'
    };

    const materializeSelectedRevisionTree = vi.fn().mockResolvedValue(undefined);

    const result = await executeComparisonReport(
      { record, repositoryRoot: 'C:\\repo', interopWorkspaceRoot: 'C:\\interop' },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('base'))
          .mockResolvedValueOnce(Buffer.from('selected')),
        materializeSelectedRevisionTree,
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        readdir: vi.fn().mockResolvedValue([]) as never,
        readFile: vi.fn().mockResolvedValue('') as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: 'CreateComparisonReport operation succeeded.\n',
          stderr: ''
        }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    // The interop branch now materializes the dependency tree into the bind-mounted
    // interop staging directory (was a documented gap before VHS-REQ-624 completion).
    expect(materializeSelectedRevisionTree).toHaveBeenCalledTimes(1);
    expect(materializeSelectedRevisionTree).toHaveBeenCalledWith(
      expect.objectContaining({ repositoryRoot: 'C:\\repo', revisionId: record.selectedHash })
    );
    expect(result.record.runtimeExecution.materializedTree?.revisionId).toBe(record.selectedHash);
  });

  it('materializes the dependency tree for the windows-container provider', async () => {
    const record = createWindowsContainerReadyRecord();
    record.stagedRevisionPlan = buildStagedRevisionPlan({
      stagingDirectory: record.artifactPlan.stagingDirectory,
      fullFilename: record.artifactPlan.fullFilename,
      leftRevisionId: record.baseHash,
      rightRevisionId: record.selectedHash,
      normalizedRelativePath: record.artifactPlan.normalizedRelativePath
    });

    const materializeSelectedRevisionTree = vi.fn().mockResolvedValue(undefined);

    const result = await executeComparisonReport(
      { record, repositoryRoot: 'C:\\repo' },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('base'))
          .mockResolvedValueOnce(Buffer.from('selected')),
        materializeSelectedRevisionTree,
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        readdir: vi.fn().mockResolvedValue([]) as never,
        readFile: vi.fn().mockResolvedValue('') as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: 'CreateComparisonReport operation succeeded.\n',
          stderr: ''
        }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(materializeSelectedRevisionTree).toHaveBeenCalledTimes(1);
    expect(materializeSelectedRevisionTree).toHaveBeenCalledWith(
      expect.objectContaining({ repositoryRoot: 'C:\\repo', revisionId: record.selectedHash })
    );
    expect(result.record.runtimeExecution.materializedTree?.revisionId).toBe(record.selectedHash);
  });
});

describe('comparisonReportRuntimeExecution fail-closed branch coverage (VHS-REQ-148, VHS-REQ-156, VHS-REQ-624)', () => {
  const containerCommandPlan = { executable: 'docker', args: ['run'] };

  function containerBuilderDeps(processPlatform: NodeJS.Platform) {
    return {
      mkdir: vi.fn().mockResolvedValue(undefined) as never,
      writeFile: vi.fn().mockResolvedValue(undefined) as never,
      processPlatform,
      leftBlob: Buffer.from('left'),
      rightBlob: Buffer.from('right')
    };
  }

  it('blocks the Windows container context when no container image is configured', async () => {
    const record = createWindowsContainerReadyRecord();
    record.runtimeSelection.containerImage = '';
    record.runtimeSelection.windowsContainerImage = undefined;

    const context = await prepareWindowsContainerExecutionContext(
      record,
      containerCommandPlan,
      undefined,
      containerBuilderDeps('win32')
    );

    expect(context.outcome).toBe('blocked');
    expect(context.failureReason).toBe('container-image-unavailable');
  });

  it('blocks the Windows container context when the interop workspace root is unavailable', async () => {
    const record = createWindowsContainerReadyRecord();

    const context = await prepareWindowsContainerExecutionContext(
      record,
      containerCommandPlan,
      undefined,
      containerBuilderDeps('linux')
    );

    expect(context.outcome).toBe('blocked');
    expect(context.failureReason).toBe('windows-interop-root-unavailable');
  });

  it('blocks the Linux container context when no container image is configured', async () => {
    const record = createWindowsContainerReadyRecord();
    record.runtimeSelection.provider = 'linux-container';
    record.runtimeSelection.containerImage = '';
    record.runtimeSelection.windowsContainerImage = undefined;

    const context = await prepareLinuxContainerExecutionContext(
      record,
      containerCommandPlan,
      undefined,
      containerBuilderDeps('linux')
    );

    expect(context.outcome).toBe('blocked');
    expect(context.failureReason).toBe('container-image-unavailable');
  });

  it('fails closed end-to-end when the Windows container provider has no image', async () => {
    const record = createWindowsContainerReadyRecord();
    record.runtimeSelection.containerImage = '';
    record.runtimeSelection.windowsContainerImage = undefined;

    const result = await executeComparisonReport(
      { record, repositoryRoot: 'C:\\repo' },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn(),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.attempted).toBe(false);
    expect(result.record.runtimeExecution.failureReason).toBe('container-image-unavailable');
  });

  it('reports command-spawn-failed when the runtime command throws before finalization', async () => {
    const record = createReadyRecord();

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockRejectedValue(new Error('spawn ENOENT')),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32',
        enforceWindowsHostPreflight: false
      }
    );

    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('command-spawn-failed');
  });

  it('reclassifies a -350000 LabVIEW CLI exit as labview-cli-connection-failed (VHS-REQ-658.1)', async () => {
    const record = createReadyRecord();

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 1,
          stdout: '',
          stderr: 'LabVIEWCLI connection failure. Error code: -350000'
        }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32',
        enforceWindowsHostPreflight: false
      }
    );

    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('labview-cli-connection-failed');
  });

  it('reclassifies a 0x465 "File version is later" LabVIEW CLI exit as labview-vi-version-too-new (VHS-REQ-658.1)', async () => {
    const record = createReadyRecord();

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 1125,
          stdout: '',
          stderr:
            'Operation output: \nLabVIEW: (Hex 0x465) File version is later than the current LabVIEW version.\nCreateComparisonReport operation failed.'
        }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32',
        enforceWindowsHostPreflight: false
      }
    );

    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('labview-vi-version-too-new');
  });

  it('classifies an LVCompare exit-zero-without-report as lvcompare-exited-zero-without-report', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.engine = 'lvcompare';
    record.runtimeSelection.lvCompare = {
      kind: 'lvcompare',
      path: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe',
      source: 'configured',
      exists: true
    };

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32',
        enforceWindowsHostPreflight: false
      }
    );

    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.failureReason).toBe('lvcompare-exited-zero-without-report');
  });

  it('fails closed end-to-end when the Linux container provider has no image', async () => {
    const record = createWindowsContainerReadyRecord();
    record.runtimeSelection.provider = 'linux-container';
    record.runtimeSelection.containerImage = '';
    record.runtimeSelection.windowsContainerImage = undefined;

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn(),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'linux'
      }
    );

    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.attempted).toBe(false);
    expect(result.record.runtimeExecution.failureReason).toBe('container-image-unavailable');
  });
});

describe('classifySelectedTreeMaterializeError (VHS-REQ-624 #303)', () => {
  it('classifies a git Win32 "Filename too long" error as a long-path diagnostic', () => {
    const result = classifySelectedTreeMaterializeError(
      new Error(
        'git --work-tree /deep checkout-index -a -f exited 1: ' +
          'error: unable to create file a/b/c.vi: Filename too long'
      )
    );
    expect(result.diagnosticReason).toBe(SELECTED_TREE_MATERIALIZE_LONG_PATH_DIAGNOSTIC);
    expect(result.diagnosticNotes?.length).toBeGreaterThan(0);
    expect(result.diagnosticNotes?.join(' ')).toMatch(/core\.longpaths/);
  });

  it('also matches the POSIX "File name too long" spelling', () => {
    const result = classifySelectedTreeMaterializeError(
      new Error('checkout-index failed: File name too long')
    );
    expect(result.diagnosticReason).toBe(SELECTED_TREE_MATERIALIZE_LONG_PATH_DIAGNOSTIC);
  });

  it('returns an empty classification for an unrelated materialize failure', () => {
    expect(classifySelectedTreeMaterializeError(new Error('partial-clone'))).toEqual({});
  });

  it('tolerates a non-Error value without throwing', () => {
    expect(classifySelectedTreeMaterializeError('Filename too long')).toEqual({
      diagnosticReason: SELECTED_TREE_MATERIALIZE_LONG_PATH_DIAGNOSTIC,
      diagnosticNotes: expect.arrayContaining([expect.any(String)])
    });
    expect(classifySelectedTreeMaterializeError(undefined)).toEqual({});
  });
});

describe('materializeSelectedRevisionTreeWithGit (VHS-REQ-624)', () => {
  async function createTempGitRepo(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-materialize-repo-'));
    execFileSync('git', ['-C', root, 'init', '-q'], { stdio: 'pipe' });
    execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com'], { stdio: 'pipe' });
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Test'], { stdio: 'pipe' });
    execFileSync('git', ['-C', root, 'config', 'commit.gpgsign', 'false'], { stdio: 'pipe' });
    return root;
  }

  it('faithfully materializes every tracked file at the revision, including export-ignored in-repo dependencies (VHS-REQ-624.2)', async () => {
    const repoRoot = await createTempGitRepo();
    const destinationRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-materialize-dest-'));
    try {
      // Top-level compared VI.
      await fs.writeFile(path.join(repoRoot, 'lv_icon.vi'), 'top');
      // Nested in-repo dependency with a space in the filename.
      const controlsDir = path.join(repoRoot, 'resource', 'plugins', 'NIIconEditor', 'Controls');
      await fs.mkdir(controlsDir, { recursive: true });
      await fs.writeFile(path.join(controlsDir, 'References Cluster.ctl'), 'ctl');
      // An in-repo dependency that `git archive` would silently drop via export-ignore.
      await fs.writeFile(path.join(repoRoot, 'EXPORT_IGNORED.vi'), 'dep');
      await fs.writeFile(path.join(repoRoot, '.gitattributes'), 'EXPORT_IGNORED.vi export-ignore\n');
      execFileSync('git', ['-C', repoRoot, 'add', '-A'], { stdio: 'pipe' });
      execFileSync('git', ['-C', repoRoot, 'commit', '-qm', 'seed'], { stdio: 'pipe' });
      const revisionId = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { stdio: 'pipe' })
        .toString()
        .trim();

      await materializeSelectedRevisionTreeWithGit({
        repositoryRoot: repoRoot,
        revisionId,
        destinationRoot,
        pathspec: '.'
      });

      // The export-ignored in-repo dependency must be present. This is the bug:
      // with the prior `git archive` implementation it was dropped, leaving the
      // relocated VI unable to resolve it (LabVIEW renders a whitebox).
      await expect(fs.access(path.join(destinationRoot, 'EXPORT_IGNORED.vi'))).resolves.toBeUndefined();
      // The nested, space-containing dependency and the compared VI itself are present too.
      await expect(
        fs.access(
          path.join(
            destinationRoot,
            'resource',
            'plugins',
            'NIIconEditor',
            'Controls',
            'References Cluster.ctl'
          )
        )
      ).resolves.toBeUndefined();
      await expect(fs.access(path.join(destinationRoot, 'lv_icon.vi'))).resolves.toBeUndefined();
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
      await fs.rm(destinationRoot, { recursive: true, force: true });
    }
  });

  it('fails closed when the selected revision cannot be read', async () => {
    const repoRoot = await createTempGitRepo();
    const destinationRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-materialize-dest-'));
    try {
      // No commits exist, so reading an arbitrary revision must reject rather
      // than silently producing an empty staged tree.
      await expect(
        materializeSelectedRevisionTreeWithGit({
          repositoryRoot: repoRoot,
          revisionId: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          destinationRoot,
          pathspec: '.'
        })
      ).rejects.toThrow();
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
      await fs.rm(destinationRoot, { recursive: true, force: true });
    }
  });

  it('reconstructs through an isolated temp index (read-tree then checkout-index) and removes it', async () => {
    const calls: Array<{ args: string[]; env: NodeJS.ProcessEnv }> = [];
    const runGit = vi.fn(async (args: string[], opts: { env: NodeJS.ProcessEnv }) => {
      calls.push({ args, env: opts.env });
    });
    const removePath = vi.fn().mockResolvedValue(undefined);
    const mkdtemp = vi.fn().mockResolvedValue('/tmp/vihs-stage-index-AAAA');
    const tmpdir = vi.fn().mockReturnValue('/tmp');

    await materializeSelectedRevisionTreeWithGit(
      {
        repositoryRoot: '/workspace/repo',
        revisionId: 'abcdef1234567890',
        destinationRoot: '/stage/dest',
        pathspec: '.'
      },
      {
        runGit,
        mkdtemp: mkdtemp as never,
        removePath: removePath as never,
        tmpdir,
        // No submodules: keep the assertion focused on the superproject checkout.
        listSubmoduleGitlinks: vi.fn().mockResolvedValue([])
      }
    );

    expect(calls).toHaveLength(2);
    // The temp index is populated from the revision's full tree first.
    expect(calls[0].args).toEqual(['-C', '/workspace/repo', 'read-tree', 'abcdef1234567890']);
    // Then every tracked entry is checked out into the destination work tree.
    // VHS-REQ-624 (#303): `-c core.longpaths=true` keeps deep destination roots
    // from tripping the Win32 MAX_PATH limit during checkout-index.
    expect(calls[1].args).toEqual([
      '-C',
      '/workspace/repo',
      '-c',
      'core.longpaths=true',
      '--work-tree',
      '/stage/dest',
      'checkout-index',
      '-a',
      '-f'
    ]);
    // Both git steps share the isolated temporary index via GIT_INDEX_FILE.
    const expectedIndex = path.join('/tmp/vihs-stage-index-AAAA', 'index');
    expect(calls[0].env.GIT_INDEX_FILE).toBe(expectedIndex);
    expect(calls[1].env.GIT_INDEX_FILE).toBe(expectedIndex);
    // The temporary index is cleaned up afterward.
    expect(removePath).toHaveBeenCalledWith('/tmp/vihs-stage-index-AAAA', {
      recursive: true,
      force: true
    });
  });

  it('cleans up the temporary index even when a git step fails', async () => {
    const runGit = vi.fn(async () => {
      throw new Error('read-tree boom');
    });
    const removePath = vi.fn().mockResolvedValue(undefined);
    const mkdtemp = vi.fn().mockResolvedValue('/tmp/vihs-stage-index-BBBB');
    const tmpdir = vi.fn().mockReturnValue('/tmp');

    await expect(
      materializeSelectedRevisionTreeWithGit(
        {
          repositoryRoot: '/r',
          revisionId: 'rev',
          destinationRoot: '/d',
          pathspec: '.'
        },
        { runGit, mkdtemp: mkdtemp as never, removePath: removePath as never, tmpdir }
      )
    ).rejects.toThrow('read-tree boom');

    // checkout-index is never attempted once read-tree fails ...
    expect(runGit).toHaveBeenCalledTimes(1);
    // ... but the temporary index is still removed.
    expect(removePath).toHaveBeenCalledWith('/tmp/vihs-stage-index-BBBB', {
      recursive: true,
      force: true
    });
  });

  it('materializes submodule contents beside the superproject tree (#283) (VHS-REQ-624.3)', async () => {
    const subRepo = await createTempGitRepo();
    const superRepo = await createTempGitRepo();
    const destinationRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-materialize-dest-'));
    try {
      // Submodule source repo carries a control dependency (space in the name).
      const subControls = path.join(subRepo, 'Controls');
      await fs.mkdir(subControls, { recursive: true });
      await fs.writeFile(path.join(subControls, 'Shared Cluster.ctl'), 'subctl');
      execFileSync('git', ['-C', subRepo, 'add', '-A'], { stdio: 'pipe' });
      execFileSync('git', ['-C', subRepo, 'commit', '-qm', 'sub'], { stdio: 'pipe' });

      // Superproject embeds the submodule plus a top-level VI.
      await fs.writeFile(path.join(superRepo, 'lv_icon.vi'), 'top');
      execFileSync(
        'git',
        [
          '-C',
          superRepo,
          '-c',
          'protocol.file.allow=always',
          'submodule',
          'add',
          '-q',
          subRepo,
          'vendor/reuse'
        ],
        { stdio: 'pipe' }
      );
      execFileSync('git', ['-C', superRepo, 'add', '-A'], { stdio: 'pipe' });
      execFileSync('git', ['-C', superRepo, 'commit', '-qm', 'super'], { stdio: 'pipe' });
      const revisionId = execFileSync('git', ['-C', superRepo, 'rev-parse', 'HEAD'], {
        stdio: 'pipe'
      })
        .toString()
        .trim();

      await materializeSelectedRevisionTreeWithGit({
        repositoryRoot: superRepo,
        revisionId,
        destinationRoot,
        pathspec: '.'
      });

      // The submodule's tracked dependency is materialized at its repo-relative
      // path, so a VI that depends on it resolves it instead of whiteboxing.
      // Previously only the superproject's own blobs were checked out (#283).
      await expect(
        fs.access(path.join(destinationRoot, 'vendor', 'reuse', 'Controls', 'Shared Cluster.ctl'))
      ).resolves.toBeUndefined();
      await expect(fs.access(path.join(destinationRoot, 'lv_icon.vi'))).resolves.toBeUndefined();
    } finally {
      await fs.rm(subRepo, { recursive: true, force: true });
      await fs.rm(superRepo, { recursive: true, force: true });
      await fs.rm(destinationRoot, { recursive: true, force: true });
    }
  });

  it('attempts each submodule but skips unavailable ones without failing the comparison (#283) (VHS-REQ-624.3)', async () => {
    const calls: string[][] = [];
    const runGit = vi.fn(async (args: string[]) => {
      calls.push(args);
      const contextIndex = args.indexOf('-C');
      const context = contextIndex >= 0 ? args[contextIndex + 1] : '';
      // The submodule's objects are unavailable: its read-tree rejects.
      if (context.includes('vendor/reuse')) {
        throw new Error('submodule objects unavailable');
      }
    });
    const listSubmoduleGitlinks = vi
      .fn()
      .mockResolvedValue([{ path: 'vendor/reuse', revisionId: 'f0f0f0f0f0f0f0f0' }]);
    const removePath = vi.fn().mockResolvedValue(undefined);
    const mkdtemp = vi.fn().mockResolvedValue('/tmp/vihs-stage-index-CCCC');
    const tmpdir = vi.fn().mockReturnValue('/tmp');

    await expect(
      materializeSelectedRevisionTreeWithGit(
        {
          repositoryRoot: '/workspace/repo',
          revisionId: 'abcdef1234567890',
          destinationRoot: '/stage/dest',
          pathspec: '.'
        },
        {
          runGit,
          listSubmoduleGitlinks,
          mkdtemp: mkdtemp as never,
          removePath: removePath as never,
          tmpdir
        }
      )
    ).resolves.toBeUndefined();

    // Superproject fully checked out.
    expect(calls).toContainEqual(['-C', '/workspace/repo', 'read-tree', 'abcdef1234567890']);
    expect(calls).toContainEqual([
      '-C',
      '/workspace/repo',
      '-c',
      'core.longpaths=true',
      '--work-tree',
      '/stage/dest',
      'checkout-index',
      '-a',
      '-f'
    ]);
    // The submodule checkout was attempted at its repo-relative source.
    const submoduleSource = path.posix.join('/workspace/repo', 'vendor', 'reuse');
    expect(calls).toContainEqual(['-C', submoduleSource, 'read-tree', 'f0f0f0f0f0f0f0f0']);
    // The failed submodule's temporary index is still cleaned up.
    expect(removePath).toHaveBeenCalled();
  });

  it('leaves the superproject tree intact when submodule enumeration fails (#283)', async () => {
    const calls: string[][] = [];
    const runGit = vi.fn(async (args: string[]) => {
      calls.push(args);
    });
    const listSubmoduleGitlinks = vi.fn().mockRejectedValue(new Error('ls-tree boom'));
    const removePath = vi.fn().mockResolvedValue(undefined);
    const mkdtemp = vi.fn().mockResolvedValue('/tmp/vihs-stage-index-DDDD');
    const tmpdir = vi.fn().mockReturnValue('/tmp');

    await expect(
      materializeSelectedRevisionTreeWithGit(
        {
          repositoryRoot: '/workspace/repo',
          revisionId: 'abcdef1234567890',
          destinationRoot: '/stage/dest',
          pathspec: '.'
        },
        {
          runGit,
          listSubmoduleGitlinks,
          mkdtemp: mkdtemp as never,
          removePath: removePath as never,
          tmpdir
        }
      )
    ).resolves.toBeUndefined();

    // Superproject checkout completed (read-tree + checkout-index) before the
    // enumeration was attempted; no further git ran after enumeration failed.
    expect(calls).toHaveLength(2);
    expect(listSubmoduleGitlinks).toHaveBeenCalledTimes(1);
  });

  it('ignores submodule gitlinks with unsafe paths (#283)', async () => {
    const calls: string[][] = [];
    const runGit = vi.fn(async (args: string[]) => {
      calls.push(args);
    });
    const listSubmoduleGitlinks = vi.fn().mockResolvedValue([
      { path: '../escape', revisionId: 'aaaaaaaaaaaaaaaa' },
      { path: '/abs/evil', revisionId: 'bbbbbbbbbbbbbbbb' },
      { path: '', revisionId: 'cccccccccccccccc' }
    ]);
    const removePath = vi.fn().mockResolvedValue(undefined);
    const mkdtemp = vi.fn().mockResolvedValue('/tmp/vihs-stage-index-EEEE');
    const tmpdir = vi.fn().mockReturnValue('/tmp');

    await expect(
      materializeSelectedRevisionTreeWithGit(
        {
          repositoryRoot: '/workspace/repo',
          revisionId: 'abcdef1234567890',
          destinationRoot: '/stage/dest',
          pathspec: '.'
        },
        {
          runGit,
          listSubmoduleGitlinks,
          mkdtemp: mkdtemp as never,
          removePath: removePath as never,
          tmpdir
        }
      )
    ).resolves.toBeUndefined();

    // Only the superproject was checked out; no unsafe path was acted on.
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call).not.toContain('aaaaaaaaaaaaaaaa');
      expect(call).not.toContain('bbbbbbbbbbbbbbbb');
      expect(call).not.toContain('cccccccccccccccc');
    }
  });

  it('parseSubmoduleGitlinks returns only gitlink entries from NUL-delimited ls-tree output', () => {
    const output =
      [
        '100644 blob 1111111111111111111111111111111111111111\t.gitmodules',
        '100644 blob 2222222222222222222222222222222222222222\tlv_icon.vi',
        '160000 commit 3333333333333333333333333333333333333333\tvendor/reuse',
        '160000 commit 4444444444444444444444444444444444444444\tdeps/with space/mod'
      ].join('\0') + '\0';

    expect(parseSubmoduleGitlinks(output)).toEqual([
      { path: 'vendor/reuse', revisionId: '3333333333333333333333333333333333333333' },
      { path: 'deps/with space/mod', revisionId: '4444444444444444444444444444444444444444' }
    ]);
  });

  it('parseSubmoduleGitlinks tolerates empty output', () => {
    expect(parseSubmoduleGitlinks('')).toEqual([]);
  });

  it('parseSubmoduleGitlinks skips records without a tab or with truncated metadata (VHS-REQ-624)', () => {
    const output =
      [
        'no-tab-record-should-be-skipped',
        '100644\tmetadata-has-only-one-field',
        '160000 commit deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\tvendor/mod'
      ].join('\0') + '\0';

    expect(parseSubmoduleGitlinks(output)).toEqual([
      { path: 'vendor/mod', revisionId: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }
    ]);
  });

  it('parseSubmoduleGitlinks ignores gitlink entries with a non-commit type or empty object (VHS-REQ-624)', () => {
    const output =
      [
        // mode 160000 but tree type -> not a submodule commit gitlink.
        '160000 tree 5555555555555555555555555555555555555555\tnot-a-commit',
        // mode 160000 commit but empty object field -> rejected.
        '160000 commit \tempty-object'
      ].join('\0') + '\0';

    expect(parseSubmoduleGitlinks(output)).toEqual([]);
  });
});

describe('classifyLabviewCliDiagnosticText additional reasons (VHS-REQ-148, VHS-REQ-621)', () => {
  it('classifies rejected VI paths as labview-cli-invalid-vi-path', () => {
    const result = classifyLabviewCliDiagnosticText(
      [
        'Operation output:',
        'The supplied path invalid or does not exist: C:\\staging\\left-foo.vi',
        'CreateComparisonReport operation failed.'
      ].join('\r\n')
    );

    expect(result.reason).toBe('labview-cli-invalid-vi-path');
    expect(result.notes.some((note) => /rejected one or more supplied paths/i.test(note))).toBe(true);
    // launchSucceeded is false here, so the launch-confirmation caveat is appended.
    expect(result.notes).toContain(
      'The retained LabVIEW CLI diagnostic log did not report successful LabVIEW launch before exit.'
    );
  });

  it('classifies an ignored -LabVIEWPath whose last-used LabVIEW matched the selection', () => {
    const labviewPath = 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
    const result = classifyLabviewCliDiagnosticText(
      [
        '"LabVIEWPath" command line argument is not passed. ' +
          `Using last used LabVIEW: "${labviewPath}"`,
        'LabVIEW launched successfully.'
      ].join('\r\n'),
      labviewPath
    );

    expect(result.reason).toBe('labview-path-ignored-last-used-matched-selection');
    expect(result.notes.some((note) => /matched the intended executable/i.test(note))).toBe(true);
  });

  it('classifies an ignored -LabVIEWPath that diverged from the selection', () => {
    const result = classifyLabviewCliDiagnosticText(
      [
        '"LabVIEWPath" command line argument is not passed. ' +
          'Using last used LabVIEW: "C:\\Program Files (x86)\\National Instruments\\LabVIEW 2024\\LabVIEW.exe"',
        'LabVIEW launched successfully.'
      ].join('\r\n'),
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    );

    expect(result.reason).toBe('labview-path-ignored-last-used-diverged-selection');
    expect(result.notes.some((note) => /Intended explicit LabVIEW path/i.test(note))).toBe(true);
  });

  it('classifies an ignored -LabVIEWPath with no intended selection as the default variant', () => {
    const result = classifyLabviewCliDiagnosticText(
      '"LabVIEWPath" command line argument is not passed. ' +
        'Using last used LabVIEW: "C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe"'
    );

    expect(result.reason).toBe('labview-path-ignored-last-used-default');
    expect(
      result.notes.some((note) => /used the last-used LabVIEW instead/i.test(note))
    ).toBe(true);
  });

  it('classifies password-protected VIs without a VI Server connection using the pre-connection note', () => {
    const result = classifyLabviewCliDiagnosticText(
      [
        'Operation output:',
        'LabVIEW: (Hex 0x410) VI is password protected.',
        'CreateComparisonReport operation failed.'
      ].join('\r\n')
    );

    expect(result.reason).toBe('labview-cli-vi-password-protected');
    expect(result.notes).toContain(
      'LabVIEW CLI could not generate a comparison report because one or both selected VI revisions are password protected.'
    );
    expect(result.notes).toContain(
      'The retained LabVIEW CLI diagnostic log did not report successful LabVIEW launch before exit.'
    );
  });

  it('classifies Error 66 / Call By Reference after a VI Server connection', () => {
    const result = classifyLabviewCliDiagnosticText(
      [
        'LabVIEW launched successfully.',
        'Connection established with LabVIEW at port number 3363.',
        'Error code : 66',
        'Call By Reference Node failed.'
      ].join('\r\n')
    );

    expect(result.reason).toBe('labview-cli-call-by-reference');
    expect(
      result.notes.some((note) => /VI Server connection before failing with Error 66/i.test(note))
    ).toBe(true);
  });

  it('retains only the launch-success note when no failure signature matched', () => {
    const result = classifyLabviewCliDiagnosticText('LabVIEW launched successfully.');

    expect(result.reason).toBeUndefined();
    expect(result.notes).toContain(
      'LabVIEW CLI reported that LabVIEW launched successfully before the operation failed.'
    );
  });
});

describe('normalizeWindowsInteropPath / normalizeWindowsInteropExecutable (VHS-REQ-624)', () => {
  it('normalizeWindowsInteropPath keeps drive-letter paths and coerces to backslashes', () => {
    expect(normalizeWindowsInteropPath('C:/workspace/staging/foo.vi')).toBe(
      'C:\\workspace\\staging\\foo.vi'
    );
  });

  it('normalizeWindowsInteropPath maps a /mnt WSL path to its drive-letter form', () => {
    expect(normalizeWindowsInteropPath('/mnt/d/workspace/foo.vi')).toBe('D:\\workspace\\foo.vi');
  });

  it('normalizeWindowsInteropPath returns the drive root for an empty /mnt tail', () => {
    expect(normalizeWindowsInteropPath('/mnt/c/')).toBe('C:\\');
  });

  it('normalizeWindowsInteropPath returns undefined for empty or unmappable input', () => {
    expect(normalizeWindowsInteropPath('   ')).toBeUndefined();
    expect(normalizeWindowsInteropPath('relative/without/drive')).toBeUndefined();
  });

  it('normalizeWindowsInteropExecutable passes /mnt paths through unchanged', () => {
    expect(normalizeWindowsInteropExecutable('/mnt/c/NI/LabVIEWCLI.exe')).toBe(
      '/mnt/c/NI/LabVIEWCLI.exe'
    );
  });

  it('normalizeWindowsInteropExecutable maps a drive-letter path to /mnt form', () => {
    expect(normalizeWindowsInteropExecutable('C:\\NI\\LabVIEWCLI.exe')).toBe(
      '/mnt/c/NI/LabVIEWCLI.exe'
    );
  });

  it('normalizeWindowsInteropExecutable returns undefined for empty or unmappable input', () => {
    expect(normalizeWindowsInteropExecutable('   ')).toBeUndefined();
    expect(normalizeWindowsInteropExecutable('relative-executable')).toBeUndefined();
  });
});

describe('resolveHostReadableDiagnosticPath / resolveMappedRuntimeDiagnosticPath (VHS-REQ-148)', () => {
  it('resolveMappedRuntimeDiagnosticPath maps a runtime-root-relative path onto the host root', () => {
    const mapped = resolveMappedRuntimeDiagnosticPath('C:\\rt\\sub\\log.txt', {
      runtimeRoot: 'C:\\rt',
      hostRoot: '/host/temp'
    });
    // path.join is host-separator-sensitive, so derive the expectation the same way.
    expect(mapped).toBe(path.join('/host/temp', 'sub', 'log.txt'));
  });

  it('resolveMappedRuntimeDiagnosticPath returns undefined without a mapping or when outside the runtime root', () => {
    expect(resolveMappedRuntimeDiagnosticPath('C:\\rt\\log.txt')).toBeUndefined();
    expect(
      resolveMappedRuntimeDiagnosticPath('C:\\elsewhere\\log.txt', {
        runtimeRoot: 'C:\\rt',
        hostRoot: '/host/temp'
      })
    ).toBeUndefined();
  });

  it('resolveHostReadableDiagnosticPath prefers the mapped host path when a mapping is supplied', () => {
    const resolved = resolveHostReadableDiagnosticPath('C:\\rt\\sub\\log.txt', 'linux', {
      runtimeRoot: 'C:\\rt',
      hostRoot: '/host/temp'
    });
    expect(resolved).toBe(path.join('/host/temp', 'sub', 'log.txt'));
  });

  it('resolveHostReadableDiagnosticPath returns undefined when a mapping is present but the path is outside it', () => {
    expect(
      resolveHostReadableDiagnosticPath('C:\\elsewhere\\log.txt', 'linux', {
        runtimeRoot: 'C:\\rt',
        hostRoot: '/host/temp'
      })
    ).toBeUndefined();
  });

  it('resolveHostReadableDiagnosticPath returns the raw Windows path on a win32 host with no mapping', () => {
    expect(resolveHostReadableDiagnosticPath('C:\\logs\\diag.txt', 'win32')).toBe(
      'C:\\logs\\diag.txt'
    );
  });

  it('resolveHostReadableDiagnosticPath keeps an absolute POSIX path on a non-win32 host', () => {
    expect(resolveHostReadableDiagnosticPath('/tmp/diag.txt', 'linux')).toBe('/tmp/diag.txt');
  });

  it('resolveHostReadableDiagnosticPath maps a Windows path to /mnt form on a non-win32 host', () => {
    expect(resolveHostReadableDiagnosticPath('C:\\logs\\diag.txt', 'linux')).toBe(
      '/mnt/c/logs/diag.txt'
    );
  });
});

describe('buildWindowsInteropCommandPlan (VHS-REQ-624)', () => {
  const interopLayout = {
    reportDirectory: 'C:\\interop\\reports\\r\\f',
    stagingDirectory: 'C:\\interop\\reports\\r\\f\\staging',
    leftFilePath: 'C:\\interop\\reports\\r\\f\\staging\\left-foo.vi',
    rightFilePath: 'C:\\interop\\reports\\r\\f\\staging\\right-foo.vi',
    reportFilePath: 'C:\\interop\\reports\\r\\f\\diff-report-foo.vi.html'
  };

  it('rewrites a labview-cli plan and normalizes the executable to /mnt form', () => {
    const record = createReadyRecord();
    const plan = buildWindowsInteropCommandPlan(
      record,
      {
        executable: 'C:\\NI\\LabVIEWCLI.exe',
        args: [
          '-OperationName',
          'CreateComparisonReport',
          '-VI1',
          '/host/staging/left-foo.vi',
          '-VI2',
          '/host/staging/right-foo.vi',
          '-ReportPath',
          '/host/diff-report-foo.vi.html',
          '-LabVIEWPath',
          'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
        ]
      },
      interopLayout
    );

    expect(plan?.executable).toBe('/mnt/c/NI/LabVIEWCLI.exe');
    expect(plan?.args).toContain(interopLayout.leftFilePath);
    expect(plan?.args).toContain(interopLayout.rightFilePath);
    expect(plan?.args).toContain(interopLayout.reportFilePath);
    expect(plan?.args).toContain(
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    );
  });

  it('returns undefined when the executable cannot be normalized for interop', () => {
    const record = createReadyRecord();
    expect(
      buildWindowsInteropCommandPlan(
        record,
        { executable: 'relative-labviewcli', args: ['-VI1', 'x', '-VI2', 'y'] },
        interopLayout
      )
    ).toBeUndefined();
  });

  it('returns undefined when a staged VI path cannot be normalized', () => {
    const record = createReadyRecord();
    const plan = buildWindowsInteropCommandPlan(
      record,
      {
        executable: 'C:\\NI\\LabVIEWCLI.exe',
        args: ['-VI1', 'x', '-VI2', 'y']
      },
      { ...interopLayout, leftFilePath: 'relative-left.vi' }
    );
    expect(plan).toBeUndefined();
  });

  it('rewrites an lvcompare plan (left/right + -lvpath) and returns undefined for fewer than two args', () => {
    const record = createReadyRecord();
    record.runtimeSelection.engine = 'lvcompare';

    const plan = buildWindowsInteropCommandPlan(
      record,
      {
        executable: 'C:\\NI\\LVCompare.exe',
        args: [
          '/host/staging/left-foo.vi',
          '/host/staging/right-foo.vi',
          '-nobdcosm',
          '-lvpath',
          'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
        ]
      },
      interopLayout
    );
    expect(plan?.executable).toBe('/mnt/c/NI/LVCompare.exe');
    expect(plan?.args[0]).toBe(interopLayout.leftFilePath);
    expect(plan?.args[1]).toBe(interopLayout.rightFilePath);
    expect(plan?.args).toContain('-nobdcosm');
    expect(plan?.args).toContain('-lvpath');

    expect(
      buildWindowsInteropCommandPlan(
        record,
        { executable: 'C:\\NI\\LVCompare.exe', args: ['only-one'] },
        interopLayout
      )
    ).toBeUndefined();
  });

  it('returns undefined for an unrecognized engine', () => {
    const record = createReadyRecord();
    record.runtimeSelection.engine = undefined;
    expect(
      buildWindowsInteropCommandPlan(
        record,
        { executable: 'C:\\NI\\LabVIEWCLI.exe', args: ['-VI1', 'x', '-VI2', 'y'] },
        interopLayout
      )
    ).toBeUndefined();
  });
});

describe('rewriteLvcompareArgsForContainerWorkspace / ForLinuxContainerWorkspace (VHS-REQ-624, VHS-REQ-657)', () => {
  it('rewrites Windows-container lvcompare args and prefers the supplied labviewPath override', () => {
    const rewritten = rewriteLvcompareArgsForContainerWorkspace(
      ['/host/left-foo.vi', '/host/right-foo.vi', '-nobdcosm', '-lvpath', '/host/next-labview'],
      {
        containerWorkspaceRoot: 'C:\\workspace',
        leftFilename: 'left-foo.vi',
        rightFilename: 'right-foo.vi',
        labviewPath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
      }
    );
    expect(rewritten?.[0]).toBe('C:\\workspace\\staging\\left-foo.vi');
    expect(rewritten?.[1]).toBe('C:\\workspace\\staging\\right-foo.vi');
    expect(rewritten).toContain('-nobdcosm');
    expect(rewritten).toContain(
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    );
    expect(rewritten).not.toContain('/host/next-labview');
  });

  it('falls back to the next -lvpath token when no labviewPath override is supplied', () => {
    const rewritten = rewriteLvcompareArgsForContainerWorkspace(
      ['/host/left-foo.vi', '/host/right-foo.vi', '-lvpath', 'C:\\fallback\\LabVIEW.exe'],
      {
        containerWorkspaceRoot: 'C:\\workspace',
        leftFilename: 'left-foo.vi',
        rightFilename: 'right-foo.vi'
      }
    );
    expect(rewritten).toContain('C:\\fallback\\LabVIEW.exe');
  });

  it('returns undefined for fewer than two Windows-container lvcompare args', () => {
    expect(
      rewriteLvcompareArgsForContainerWorkspace(['only-one'], {
        containerWorkspaceRoot: 'C:\\workspace',
        leftFilename: 'left-foo.vi',
        rightFilename: 'right-foo.vi'
      })
    ).toBeUndefined();
  });

  it('rewrites Linux-container lvcompare args using the supplied containerLabviewPath', () => {
    const rewritten = rewriteLvcompareArgsForLinuxContainerWorkspace(
      ['/host/left-foo.vi', '/host/right-foo.vi', '-lvpath', '/host/native-labview'],
      {
        containerWorkspaceRoot: '/workspace',
        leftFilename: 'left-foo.vi',
        rightFilename: 'right-foo.vi',
        containerLabviewPath: '/usr/local/natinst/LabVIEW-2025-64/labview'
      }
    );
    expect(rewritten?.[0]).toBe('/workspace/staging/left-foo.vi');
    expect(rewritten?.[1]).toBe('/workspace/staging/right-foo.vi');
    expect(rewritten).toContain('/usr/local/natinst/LabVIEW-2025-64/labview');
  });

  it('defaults the Linux-container -lvpath to the LabVIEW 2026 fallback and returns undefined for short input', () => {
    const rewritten = rewriteLvcompareArgsForLinuxContainerWorkspace(
      ['/host/left-foo.vi', '/host/right-foo.vi', '-lvpath', '/host/native-labview'],
      {
        containerWorkspaceRoot: '/workspace',
        leftFilename: 'left-foo.vi',
        rightFilename: 'right-foo.vi'
      }
    );
    expect(rewritten).toContain('/usr/local/natinst/LabVIEW-2026-64/labview');

    expect(
      rewriteLvcompareArgsForLinuxContainerWorkspace(['only-one'], {
        containerWorkspaceRoot: '/workspace',
        leftFilename: 'left-foo.vi',
        rightFilename: 'right-foo.vi'
      })
    ).toBeUndefined();
  });
});

describe('buildLinuxHostNativeShortPathCommandPlan lvcompare + unknown engine (VHS-REQ-156)', () => {
  function makeLinuxHostNativeRecord(): ComparisonReportPacketRecord {
    const record = createReadyRecord();
    record.runtimeSelection.platform = 'linux';
    record.runtimeSelection.bitness = 'x64';
    record.runtimeSelection.provider = 'host-native';
    return record;
  }

  it('rewrites the first two lvcompare positional args to the short-path layout and preserves the rest', () => {
    const record = makeLinuxHostNativeRecord();
    record.runtimeSelection.engine = 'lvcompare';
    const layout = buildLinuxHostNativeShortPathLayout(record, {
      LVIE_LINUX_RUNTIME_TMPDIR: '/tmp/lvie-runtime'
    });

    const rewritten = buildLinuxHostNativeShortPathCommandPlan(
      record,
      {
        executable: '/usr/local/bin/LVCompare',
        args: ['/orig/left-foo.vi', '/orig/right-foo.vi', '-nobdcosm', '-nofppos']
      },
      layout
    );

    expect(rewritten?.executable).toBe('/usr/local/bin/LVCompare');
    expect(rewritten?.args[0]).toBe(layout.leftFilePath);
    expect(rewritten?.args[1]).toBe(layout.rightFilePath);
    expect(rewritten?.args.slice(2)).toEqual(['-nobdcosm', '-nofppos']);
  });

  it('returns undefined for fewer than two lvcompare args', () => {
    const record = makeLinuxHostNativeRecord();
    record.runtimeSelection.engine = 'lvcompare';
    const layout = buildLinuxHostNativeShortPathLayout(record, {
      LVIE_LINUX_RUNTIME_TMPDIR: '/tmp/lvie-runtime'
    });
    expect(
      buildLinuxHostNativeShortPathCommandPlan(
        record,
        { executable: '/usr/local/bin/LVCompare', args: ['only-one'] },
        layout
      )
    ).toBeUndefined();
  });

  it('returns undefined for an unrecognized engine', () => {
    const record = makeLinuxHostNativeRecord();
    record.runtimeSelection.engine = undefined;
    const layout = buildLinuxHostNativeShortPathLayout(record, {
      LVIE_LINUX_RUNTIME_TMPDIR: '/tmp/lvie-runtime'
    });
    expect(
      buildLinuxHostNativeShortPathCommandPlan(
        record,
        { executable: '/usr/local/bin/LabVIEWCLI', args: ['-VI1', 'x', '-VI2', 'y'] },
        layout
      )
    ).toBeUndefined();
  });
});

describe('prepareWindowsContainerExecutionContext ready + build failures (VHS-REQ-624)', () => {
  function containerDeps(processPlatform: NodeJS.Platform) {
    return {
      mkdir: vi.fn().mockResolvedValue(undefined) as never,
      writeFile: vi.fn().mockResolvedValue(undefined) as never,
      processPlatform,
      leftBlob: Buffer.from('left'),
      rightBlob: Buffer.from('right')
    };
  }

  const labviewCliCommandPlan = {
    executable: 'C:\\NI\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
    args: [
      '-OperationName',
      'CreateComparisonReport',
      '-VI1',
      'left.vi',
      '-VI2',
      'right.vi',
      '-ReportPath',
      'report.html'
    ]
  };

  it('produces a ready PowerShell-hosted container plan on a Windows host', async () => {
    const record = createWindowsContainerReadyRecord();

    const context = await prepareWindowsContainerExecutionContext(
      record,
      labviewCliCommandPlan,
      undefined,
      containerDeps('win32')
    );

    expect(context.outcome).toBe('ready');
    expect(context.commandPlan.executable).toBe('powershell.exe');
    expect(context.diagnosticPathMapping?.runtimeRoot).toBeTruthy();
  });

  it('blocks with container-command-build-failed when the lvcompare plan has too few args', async () => {
    const record = createWindowsContainerReadyRecord();
    record.runtimeSelection.engine = 'lvcompare';

    const context = await prepareWindowsContainerExecutionContext(
      record,
      { executable: 'C:\\NI\\LVCompare.exe', args: ['only-one'] },
      undefined,
      containerDeps('win32')
    );

    expect(context.outcome).toBe('blocked');
    expect(context.failureReason).toBe('container-command-build-failed');
  });

  it('blocks with selected-tree-materialize-failed when the tree materializer throws', async () => {
    const record = createWindowsContainerReadyRecord();
    record.stagedRevisionPlan.treeRevisionId = record.selectedHash;

    const context = await prepareWindowsContainerExecutionContext(
      record,
      labviewCliCommandPlan,
      undefined,
      {
        ...containerDeps('win32'),
        repositoryRoot: 'C:\\repo',
        materializeSelectedRevisionTree: vi.fn().mockRejectedValue(new Error('partial-clone')) as never
      }
    );

    expect(context.outcome).toBe('blocked');
    expect(context.failureReason).toBe('selected-tree-materialize-failed');
  });
});

describe('prepareLinuxContainerExecutionContext ready + build failures (VHS-REQ-624)', () => {
  function containerDeps(processPlatform: NodeJS.Platform) {
    return {
      mkdir: vi.fn().mockResolvedValue(undefined) as never,
      writeFile: vi.fn().mockResolvedValue(undefined) as never,
      processPlatform,
      leftBlob: Buffer.from('left'),
      rightBlob: Buffer.from('right')
    };
  }

  const labviewCliCommandPlan = {
    executable: '/usr/local/bin/LabVIEWCLI',
    args: [
      '-OperationName',
      'CreateComparisonReport',
      '-VI1',
      'left.vi',
      '-VI2',
      'right.vi',
      '-ReportPath',
      'report.html'
    ]
  };

  it('produces a ready docker-hosted container plan on a Linux host', async () => {
    const record = createLinuxContainerReadyRecord();

    const context = await prepareLinuxContainerExecutionContext(
      record,
      labviewCliCommandPlan,
      undefined,
      containerDeps('linux')
    );

    expect(context.outcome).toBe('ready');
    expect(context.commandPlan.executable).toBe('docker');
    expect(context.diagnosticPathMapping?.runtimeRoot).toBeTruthy();
  });

  it('blocks with container-command-build-failed when the lvcompare plan has too few args', async () => {
    const record = createLinuxContainerReadyRecord();
    record.runtimeSelection.engine = 'lvcompare';

    const context = await prepareLinuxContainerExecutionContext(
      record,
      { executable: '/usr/local/bin/LVCompare', args: ['only-one'] },
      undefined,
      containerDeps('linux')
    );

    expect(context.outcome).toBe('blocked');
    expect(context.failureReason).toBe('container-command-build-failed');
  });

  it('blocks with selected-tree-materialize-failed when the tree materializer throws', async () => {
    const record = createLinuxContainerReadyRecord();
    record.stagedRevisionPlan.treeRevisionId = record.selectedHash;

    const context = await prepareLinuxContainerExecutionContext(
      record,
      labviewCliCommandPlan,
      undefined,
      {
        ...containerDeps('linux'),
        repositoryRoot: '/workspace/repo',
        materializeSelectedRevisionTree: vi.fn().mockRejectedValue(new Error('partial-clone')) as never
      }
    );

    expect(context.outcome).toBe('blocked');
    expect(context.failureReason).toBe('selected-tree-materialize-failed');
  });
});

describe('buildWindowsContainerCommandPlan direct branches (VHS-REQ-624)', () => {
  const containerOptions = {
    hostReportDirectory: 'C:\\host\\reports\\r\\f',
    hostTempDirectory: 'C:\\host\\reports\\r\\f\\container-temp',
    containerWorkspaceRoot: 'C:\\workspace',
    containerImage: 'nationalinstruments/labview:2026q1-windows',
    processPlatform: 'win32' as NodeJS.Platform
  };

  it('builds a PowerShell-hosted docker plan for an lvcompare engine', () => {
    const record = createWindowsContainerReadyRecord();
    record.runtimeSelection.engine = 'lvcompare';

    const plan = buildWindowsContainerCommandPlan(
      record,
      { executable: 'LVCompare.exe', args: ['left.vi', 'right.vi', '-nobdcosm'] },
      containerOptions
    );

    expect(plan?.executable).toBe('powershell.exe');
    expect(plan?.args).toContain('-EncodedCommand');
  });

  it('returns undefined when the runtime selection has no engine', () => {
    const record = createWindowsContainerReadyRecord();
    record.runtimeSelection.engine = undefined;

    expect(
      buildWindowsContainerCommandPlan(
        record,
        { executable: 'LabVIEWCLI.exe', args: ['-VI1', 'left.vi', '-VI2', 'right.vi'] },
        containerOptions
      )
    ).toBeUndefined();
  });

  it('returns undefined when the host PowerShell executable cannot be resolved (darwin host)', () => {
    const record = createWindowsContainerReadyRecord();

    expect(
      buildWindowsContainerCommandPlan(
        record,
        {
          executable: 'LabVIEWCLI.exe',
          args: ['-VI1', 'left.vi', '-VI2', 'right.vi', '-ReportPath', 'report.html']
        },
        { ...containerOptions, processPlatform: 'darwin' as NodeJS.Platform }
      )
    ).toBeUndefined();
  });
});

describe('parseLabviewCliDiagnosticLogPath (VHS-REQ-148)', () => {
  it('extracts the trimmed diagnostic log path from the CLI banner line', () => {
    expect(
      parseLabviewCliDiagnosticLogPath(
        'LabVIEWCLI started logging in file: C:\\Users\\ci\\AppData\\Local\\Temp\\LabVIEWCLI.log  \r\nnext line'
      )
    ).toBe('C:\\Users\\ci\\AppData\\Local\\Temp\\LabVIEWCLI.log');
  });

  it('returns undefined when the banner line is absent', () => {
    expect(parseLabviewCliDiagnosticLogPath('no banner here')).toBeUndefined();
  });
});

describe('buildDefaultRunCommand provider routing (VHS-REQ-147)', () => {
  const commandPlan = { executable: 'LabVIEWCLI', args: ['-OperationName', 'CreateComparisonReport'] };

  it('routes container providers through the non-observing runner', async () => {
    const runWithoutObservation = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' });
    const runWithObservation = vi.fn();

    const run = buildDefaultRunCommand({
      provider: 'windows-container',
      processPlatform: 'win32',
      runtimePlatform: 'win32',
      engine: 'labview-cli',
      timeoutMs: 42000,
      runComparisonCommandPlanImpl: runWithoutObservation as never,
      runComparisonCommandPlanWithObservationImpl: runWithObservation as never
    });
    const result = await run(commandPlan);

    expect(result.exitCode).toBe(0);
    expect(runWithObservation).not.toHaveBeenCalled();
    expect(runWithoutObservation).toHaveBeenCalledWith(
      commandPlan,
      expect.objectContaining({ hostPlatform: 'win32', timeoutMs: 42000 })
    );
  });

  it('routes host-native providers through the observing runner', async () => {
    const runWithoutObservation = vi.fn();
    const runWithObservation = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' });

    const run = buildDefaultRunCommand({
      provider: 'host-native',
      processPlatform: 'linux',
      runtimePlatform: 'linux',
      engine: 'labview-cli',
      runComparisonCommandPlanImpl: runWithoutObservation as never,
      runComparisonCommandPlanWithObservationImpl: runWithObservation as never
    });
    await run(commandPlan);

    expect(runWithoutObservation).not.toHaveBeenCalled();
    expect(runWithObservation).toHaveBeenCalledWith(
      commandPlan,
      expect.objectContaining({
        hostPlatform: 'linux',
        runtimePlatform: 'linux',
        engine: 'labview-cli'
      })
    );
  });
});

describe('buildLinuxLabviewIniCandidatePaths bitness variants (VHS-REQ-156)', () => {
  it('adds the -32 suffixed candidate for an x86 bitness', () => {
    const candidates = buildLinuxLabviewIniCandidatePaths({
      homeDir: '/home/sergio',
      requestedLabviewVersion: '2026',
      bitness: 'x86'
    });
    expect(candidates).toContain('/home/sergio/natinst/.config/LabVIEW-2026-32/labview.conf');
    // The ~/.config/natinst/ candidate is emitted alongside the ~/natinst/.config one.
    expect(candidates).toContain('/home/sergio/.config/natinst/LabVIEW-2026/labview.conf');
  });

  it('defaults to the -64 suffixed candidate when bitness is unknown', () => {
    const candidates = buildLinuxLabviewIniCandidatePaths({
      homeDir: '/home/sergio',
      requestedLabviewVersion: '2026'
    });
    expect(candidates).toContain('/home/sergio/natinst/.config/LabVIEW-2026-64/labview.conf');
  });

  it('returns an empty list when no version token is supplied', () => {
    expect(buildLinuxLabviewIniCandidatePaths({ homeDir: '/home/sergio' })).toEqual([]);
  });
});

describe('parseWindowsTasklistCsv line parsing (VHS-REQ-621)', () => {
  it('parses valid rows (including escaped quotes) and drops malformed rows', () => {
    const stdout = [
      '"LabVIEW.exe","1234","Console","1","123,456 K"',
      // Escaped double-quote inside the image-name column exercises the "" branch.
      '"Odd""Name.exe","2222","Services","0","10 K"',
      // Fewer than two columns -> dropped.
      '"OnlyOneColumn"',
      // Non-numeric pid -> dropped.
      '"LabVIEWCLI.exe","not-a-pid","Console","1","5 K"'
    ].join('\r\n');

    const parsed = parseWindowsTasklistCsv(stdout);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ imageName: 'LabVIEW.exe', pid: 1234, sessionNumber: 1 });
    expect(parsed[1]).toMatchObject({ imageName: 'Odd"Name.exe', pid: 2222, sessionNumber: 0 });
  });

  it('returns an empty list for blank output', () => {
    expect(parseWindowsTasklistCsv('\r\n   \r\n')).toEqual([]);
  });
});

describe('normalizeComparisonProcessError (VHS-REQ-148)', () => {
  it('extracts stdout, stderr, and signal from a spawn-style error object', () => {
    expect(
      normalizeComparisonProcessError({
        stdout: 'partial stdout',
        stderr: 'boom',
        signal: 'SIGTERM'
      })
    ).toEqual({ stdout: 'partial stdout', stderr: 'boom', signal: 'SIGTERM' });
  });

  it('falls back to the message when stderr is absent on the error object', () => {
    expect(normalizeComparisonProcessError({ message: 'thrown message' })).toEqual({
      stdout: '',
      stderr: 'thrown message',
      signal: undefined
    });
  });

  it('coerces a non-object error into a stderr string', () => {
    expect(normalizeComparisonProcessError('plain string failure')).toEqual({
      stdout: '',
      stderr: 'plain string failure'
    });
  });
});

describe('observeWindowsRuntimeProcesses (VHS-REQ-621)', () => {
  const tasklistCsv = [
    '"LabVIEW.exe","111","Console","1","100,000 K"',
    '"LabVIEWCLI.exe","222","Console","1","50 K"',
    // Non-runtime process is filtered out of the observation.
    '"chrome.exe","333","Console","1","500 K"'
  ].join('\r\n');

  function execFileReturning(stdout: string) {
    return ((_executable: string, _args: string[], _options: unknown, callback: (error: unknown, stdout: string, stderr: string) => void) => {
      callback(null, stdout, '');
    }) as never;
  }

  it('returns undefined for a non-win32 runtime', async () => {
    const observation = await observeWindowsRuntimeProcesses({
      hostPlatform: 'linux',
      runtimePlatform: 'linux',
      trigger: 'cli-log-banner'
    });
    expect(observation).toBeUndefined();
  });

  it('parses tasklist output and infers LabVIEW.exe bitness on a win32 host (VHS-REQ-621.1)', async () => {
    const observation = await observeWindowsRuntimeProcesses(
      { hostPlatform: 'win32', runtimePlatform: 'win32', trigger: 'cli-log-banner' },
      {
        execFileImpl: execFileReturning(tasklistCsv),
        nowIso: () => '2026-04-02T00:00:00.000Z',
        resolveWindowsLabviewExecutablePath: vi
          .fn()
          .mockResolvedValue(
            'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
          )
      }
    );

    expect(observation?.labviewProcessObserved).toBe(true);
    expect(observation?.labviewCliProcessObserved).toBe(true);
    expect(observation?.lvcompareProcessObserved).toBe(false);
    expect(observation?.labviewProcessBitness).toBe('x64');
    expect(observation?.labviewProcessExecutablePath).toBe(
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    );
    expect(observation?.observedProcessNames).toEqual(
      expect.arrayContaining(['LabVIEW.exe', 'LabVIEWCLI.exe'])
    );
    expect(observation?.observedProcessNames).not.toContain('chrome.exe');
    expect(observation?.trigger).toBe('cli-log-banner');
    expect(observation?.capturedAt).toBe('2026-04-02T00:00:00.000Z');
  });

  it('records an unknown bitness when the executable-path resolver rejects (linux host)', async () => {
    const observation = await observeWindowsRuntimeProcesses(
      { hostPlatform: 'linux', runtimePlatform: 'win32', trigger: 'process-exit' },
      {
        execFileImpl: execFileReturning('"LabVIEW.exe","111","Console","1","100 K"'),
        resolveWindowsLabviewExecutablePath: vi.fn().mockRejectedValue(new Error('access denied'))
      }
    );

    expect(observation?.labviewProcessObserved).toBe(true);
    expect(observation?.labviewProcessBitness).toBeUndefined();
  });
});

describe('observeWindowsTcpListeners (VHS-REQ-623)', () => {
  it('returns an empty list for a non-win32 runtime or when no ports are requested', async () => {
    expect(
      await observeWindowsTcpListeners({
        hostPlatform: 'win32',
        runtimePlatform: 'linux',
        localPorts: [3363]
      })
    ).toEqual([]);
    expect(
      await observeWindowsTcpListeners({
        hostPlatform: 'win32',
        runtimePlatform: 'win32',
        localPorts: []
      })
    ).toEqual([]);
  });

  it('maps a matching netstat LISTENING row to its owning process name', async () => {
    const netstat = 'TCP    0.0.0.0:3363    0.0.0.0:0    LISTENING    4321';
    const tasklist = '"LabVIEW.exe","4321","Console","1","100 K"';
    const execFileImpl = ((executable: string, _args: string[], _options: unknown, callback: (error: unknown, stdout: string, stderr: string) => void) => {
      callback(null, String(executable).includes('netstat') ? netstat : tasklist, '');
    }) as never;

    const listeners = await observeWindowsTcpListeners(
      { hostPlatform: 'win32', runtimePlatform: 'win32', localPorts: [3363] },
      { execFileImpl }
    );

    expect(listeners).toHaveLength(1);
    expect(listeners[0]).toMatchObject({ localPort: 3363, pid: 4321, processName: 'LabVIEW.exe' });
  });

  it('returns an empty list when no netstat listener matches the requested port', async () => {
    const netstat = 'TCP    0.0.0.0:9999    0.0.0.0:0    LISTENING    4321';
    const execFileImpl = ((_executable: string, _args: string[], _options: unknown, callback: (error: unknown, stdout: string, stderr: string) => void) => {
      callback(null, netstat, '');
    }) as never;

    const listeners = await observeWindowsTcpListeners(
      { hostPlatform: 'win32', runtimePlatform: 'win32', localPorts: [3363] },
      { execFileImpl }
    );

    expect(listeners).toEqual([]);
  });
});

describe('prepareWindowsContainerExecutionContext interop staging (VHS-REQ-624)', () => {
  const labviewCliCommandPlan = {
    executable: 'C:\\NI\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
    args: [
      '-OperationName',
      'CreateComparisonReport',
      '-VI1',
      'left.vi',
      '-VI2',
      'right.vi',
      '-ReportPath',
      'report.html'
    ]
  };

  it('stages into the interop workspace and hosts the plan via WSL PowerShell for a Windows runtime on a non-Windows host', async () => {
    const record = createWindowsContainerReadyRecord();

    const context = await prepareWindowsContainerExecutionContext(
      record,
      labviewCliCommandPlan,
      'C:\\interop',
      {
        mkdir: vi.fn().mockResolvedValue(undefined) as never,
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        processPlatform: 'linux',
        leftBlob: Buffer.from('left'),
        rightBlob: Buffer.from('right')
      }
    );

    expect(context.outcome).toBe('ready');
    // The injected (non-win32) host platform selects the WSL-bridged PowerShell host.
    expect(context.commandPlan.executable).toBe(
      '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
    );
    expect(context.diagnosticPathMapping?.runtimeRoot).toBeTruthy();
  });
});
