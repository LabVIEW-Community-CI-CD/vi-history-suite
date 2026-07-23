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
  classifyRuntimeFailure,
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
  inferSupportedLabviewYearFromExecutablePath,
  inferLinuxLabviewVersionFromExecutablePath,
  resolveLinuxLabviewTcpSettings,
  resolveWindowsLabviewTcpSettings,
  resolveWindowsLabviewTcpSettingsForLabviewPath,
  buildLinuxLabviewIniCandidatePaths,
  buildLinuxHostNativeShortPathLayout,
  buildLinuxHostNativeShortPathCommandPlan,
  shouldUseLinuxHostNativeShortPathStaging,
  rewriteLabviewCliArgsForLinuxContainerWorkspace,
  buildLinuxContainerCommandPlan,
  buildWindowsContainerCommandPlan,
  buildWindowsInteropCommandPlan,
  buildWindowsHostNativeHeadlessCommandPlan,
  buildWindowsContainerLabviewCliScript,
  shouldWrapWindowsHostNativeHeadless,
  buildLinuxContainerLabviewCliScript,
  rewriteLvcompareArgsForContainerWorkspace,
  rewriteLvcompareArgsForLinuxContainerWorkspace,
  normalizeWindowsInteropPath,
  normalizeWindowsInteropExecutable,
  resolveHostReadableDiagnosticPath,
  resolveMappedRuntimeDiagnosticPath,
  parseLabviewCliDiagnosticLogPath,
  runComparisonCommandPlanWithObservation,
  runComparisonCommandPlan,
  prepareWindowsContainerExecutionContext,
  prepareLinuxContainerExecutionContext,
  resolveEffectiveCommandTimeoutMs,
  appendLabviewCliPortNumberArg,
  rewriteLabviewCliArgsForContainerWorkspace,
  buildLinuxContainerBindMountVisibilityNote,
  deriveWorktreeSnapshotIdentity,
  buildWorktreeSnapshotProvenanceNote,
  deriveComparedWorktreeSnapshotId,
  extractCommandOptionValue,
  LINUX_HOST_NATIVE_HEADLESS_OPT_IN_DEFAULT_TIMEOUT_MS,
  pathExistsForReport,
  defaultNowIso,
  defaultNowMs
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

  it('stages each revision from its resolved historical relative path when the VI moved (VHS-REQ-147.1, VHS-REQ-147.3)', async () => {
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

  it('retains deterministic staged filenames that embed revision identity even when the VI moved (VHS-REQ-147.2, VHS-REQ-147.3)', async () => {
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

  it('fails closed with a retained reason when left blob staging fails (VHS-REQ-147.4)', async () => {
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

  it('fails closed with a retained reason when right blob staging fails (VHS-REQ-147.4)', async () => {
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

  it('rejects stale generated reports with retained evidence explaining the staged filename mismatch (VHS-REQ-147.5)', async () => {
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

  it('rejects a stale generated report on a timed-out execution with retained evidence (VHS-REQ-147.5)', async () => {
    // VHS-REQ-147.5 covers "timed-out OR failed" executions; the failed branch is
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

  it('reclassifies a nonzero exit as labview-host-bitness-conflict when exit snapshot shows different-bitness LabVIEW (VHS-REQ-621.3, VHS-REQ-636.9, VHS-REQ-658.1)', async () => {
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

  it('does not run the recursive-load CloseLabVIEW reset for env-toggle Linux container images (VHS-REQ-657.4)', async () => {
    const record = createLinuxContainerReadyRecord();
    record.runtimeSelection.containerImage = 'nationalinstruments/labview:2025q3-linux';
    const reportDirectory = record.artifactPlan.reportDirectory;
    const containerTempDirectory = `${reportDirectory}/container-out/container-temp`;
    const containerStatusLog = `${containerTempDirectory}/LVStatus.txt`;
    const readdir = vi.fn(async (dir: string) =>
      dir === containerTempDirectory ? ['LVStatus.txt'] : []
    );
    const readFile = vi.fn(async (filePath: string) => {
      if (filePath === containerStatusLog) {
        return 'Recursive load during LEIF load! loading /tmp/GSW_MainPanel.vi';
      }
      return '';
    });
    const pathExists = vi.fn(async (filePath: string) => filePath === containerStatusLog);
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: 'LabVIEWCLI operation failed with error.',
      stderr: 'CreateComparisonReport operation failed.'
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
        chmod: vi.fn().mockResolvedValue(undefined) as never,
        readdir: readdir as never,
        readFile: readFile as never,
        pathExists: pathExists as never,
        runCommand,
        nowIso: vi.fn().mockReturnValue('2026-06-07T03:51:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'linux'
      }
    );

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.diagnosticReason).toBe('linux-headless-recursive-load');
    expect(result.record.runtimeExecution.headlessSessionResetExecutable).toBeUndefined();
    expect(result.record.runtimeExecution.diagnosticNotes ?? []).not.toContain(
      'Attempted Linux headless session reset via LabVIEWCLI CloseLabVIEW after recursive-load diagnosis, then retried the pair once.'
    );
  });

  it('lets headless init failure win over stderr and skips recursive-load retry (VHS-REQ-156.4, VHS-REQ-156.6)', async () => {
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
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: 'LabVIEWCLI operation failed with error.',
      stderr: [
        'Using LabVIEW: "/usr/local/natinst/LabVIEW-2026-64/labview"',
        'LabVIEW: (Hex 0x8) File permission error.',
        'CreateComparisonReport operation failed.'
      ].join('\n')
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
      }
    );

    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.diagnosticReason).toBe('linux-headless-init-failed');
    expect(result.record.runtimeExecution.diagnosticReason).not.toBe(
      'labview-cli-create-report-permission-error'
    );
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(result.record.runtimeExecution.headlessSessionResetExecutable).toBeUndefined();
    expect(result.record.runtimeExecution.diagnosticNotes ?? []).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Failed to initialize headless LabVIEW.')
      ])
    );
    expect(result.record.runtimeExecution.diagnosticNotes?.join('\n')).toContain(
      'switch to the Linux container provider'
    );
  });

  it('surfaces a Linux recursive-load headless failure on the single attempt without a CloseLabVIEW retry (VHS-REQ-156.6)', async () => {
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
        return 'Recursive load during LEIF load! loading /tmp/GSW_MainPanel.vi';
      }
      return '';
    });
    const pathExists = vi.fn(async (filePath: string) => filePath === headlessLog);
    // Single-cycle: one attempt, no CloseLabVIEW session-reset, no retry.
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: 'LabVIEWCLI operation failed with error.',
      stderr: [
        'Using LabVIEW: "/usr/local/natinst/LabVIEW-2026-64/labview"',
        'LabVIEW: (Hex 0x8) File permission error.',
        'CreateComparisonReport operation failed.'
      ].join('\n')
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
        nowIso: vi.fn().mockReturnValue('2026-06-07T03:44:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'linux'
      }
    );

    // Only the single CreateComparisonReport attempt runs — no CloseLabVIEW reset.
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(
      runCommand.mock.calls.every(
        (call) => !(call[0]?.args ?? []).includes('CloseLabVIEW')
      )
    ).toBe(true);
    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.headlessSessionResetExecutable).toBeUndefined();
    expect(result.record.runtimeExecution.headlessSessionResetExitCode).toBeUndefined();
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
      'switch to the Linux container provider'
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

  it('surfaces a windows-container call-by-reference failure on the single attempt without a containerized CloseLabVIEW retry', async () => {
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
    // Single-cycle: one attempt, no containerized CloseLabVIEW reset, no retry.
    const runCommand = vi.fn().mockResolvedValue({
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

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(result.record.runtimeExecution.diagnosticReason).toBe('labview-cli-call-by-reference');
    expect(result.record.runtimeExecution.headlessSessionResetExecutable).toBeUndefined();
    expect(result.record.runtimeExecution.headlessSessionResetExitCode).toBeUndefined();
  });

  it('surfaces a Windows host-native cold-launch -350000 VI Server connect race on the single attempt (VHS-REQ-148.7)', async () => {
    // createReadyRecord() is already win32 / host-native / labview-cli.
    const record = createReadyRecord();
    const readFile = vi.fn(async (filePath: string) => {
      if (typeof filePath === 'string' && filePath.endsWith('LabVIEW.ini')) {
        return 'server.tcp.enabled=True\r\nserver.tcp.port=3364\r\n';
      }
      return '';
    });
    const pathExists = vi.fn(async () => false);
    // Single-cycle: one attempt. The cold-launch -350000 connect race is surfaced
    // as a genuine failure — there is NO retry against a now-resident LabVIEW.
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout:
        'LabVIEWCLI started logging in file:  C:\\Temp\\lv.log\nLabVIEW launched successfully.',
      stderr: [
        'Error code : -350000',
        'Error message : LabVIEW CLI: (Hex 0xFFFAA8D0) The CLI for LabVIEW failed to establish a connection with LabVIEW.',
        'An error occurred while running the LabVIEW CLI.'
      ].join('\r\n')
    });

    const result = await executeComparisonReport(
      { record, repositoryRoot: 'C:\\workspace\\repo' },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        materializeSelectedRevisionTree: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
        readdir: vi.fn().mockResolvedValue([]) as never,
        readFile: readFile as never,
        pathExists: pathExists as never,
        runCommand,
        nowIso: vi.fn().mockReturnValue('2026-07-15T09:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32',
        // Deterministic regardless of host: bypass the Windows host-surface
        // preflight (which observes real processes/TCP on a win32 dev host) so the
        // test exercises only the single-attempt classification downstream of it.
        enforceWindowsHostPreflight: false
      }
    );

    // Exactly one compare attempt, and no CloseLabVIEW.
    expect(runCommand).toHaveBeenCalledTimes(1);
    const plan = runCommand.mock.calls[0]?.[0] as { executable: string; args: string[] };
    expect(plan.executable).toBe(record.runtimeSelection.labviewCli?.path);
    expect(plan.args).toEqual(
      expect.arrayContaining(['-OperationName', 'CreateComparisonReport'])
    );
    // The VI Server port stays derived from the selected install's LabVIEW.ini.
    expect(plan.args).toEqual(expect.arrayContaining(['-PortNumber', '3364']));
    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.reportExists).toBe(false);
    expect(result.record.runtimeExecution.headlessSessionResetExecutable).toBeUndefined();
    expect(result.record.runtimeExecution.diagnosticNotes ?? []).not.toContain(
      'Windows host-native cold-launch retry: the first attempt launched LabVIEW but the VI Server was not ready within the LabVIEW CLI connect window (-350000). Retried once against the now-resident LabVIEW on the same derived VI Server port.'
    );
  });

  it('does not cold-launch retry a Windows host-native failure that is not the -350000 connect race (VHS-REQ-148.7)', async () => {
    const record = createReadyRecord();
    const readFile = vi.fn(async (filePath: string) => {
      if (typeof filePath === 'string' && filePath.endsWith('LabVIEW.ini')) {
        return 'server.tcp.enabled=True\r\nserver.tcp.port=3364\r\n';
      }
      return '';
    });
    const pathExists = vi.fn(async () => false);
    // A generic non-connection failure must not trigger the cold-launch retry.
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'Error code : 1055\r\nError message : Object reference is invalid.\r\n'
    });

    const result = await executeComparisonReport(
      { record, repositoryRoot: 'C:\\workspace\\repo' },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        materializeSelectedRevisionTree: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
        readdir: vi.fn().mockResolvedValue([]) as never,
        readFile: readFile as never,
        pathExists: pathExists as never,
        runCommand,
        nowIso: vi.fn().mockReturnValue('2026-07-15T09:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32',
        enforceWindowsHostPreflight: false
      }
    );

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.diagnosticNotes ?? []).not.toContain(
      'Windows host-native cold-launch retry: the first attempt launched LabVIEW but the VI Server was not ready within the LabVIEW CLI connect window (-350000). Retried once against the now-resident LabVIEW on the same derived VI Server port.'
    );
  });

  it('classifies a Windows host-native -350000 as the connection failure on the single attempt (VHS-REQ-148.7)', async () => {
    // createReadyRecord() is already win32 / host-native / labview-cli.
    const record = createReadyRecord();
    const readFile = vi.fn(async (filePath: string) => {
      if (typeof filePath === 'string' && filePath.endsWith('LabVIEW.ini')) {
        return 'server.tcp.enabled=True\r\nserver.tcp.port=3364\r\n';
      }
      return '';
    });
    const pathExists = vi.fn(async () => false);
    // Single-cycle: one attempt with the -350000 connect race. Its result is
    // authoritative — no second attempt against a resident LabVIEW.
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: 'LabVIEWCLI started logging in file:  C:\\Temp\\lv.log\nLabVIEW launched successfully.',
      stderr: [
        'Error code : -350000',
        'Error message : LabVIEW CLI: (Hex 0xFFFAA8D0) The CLI for LabVIEW failed to establish a connection with LabVIEW.',
        'An error occurred while running the LabVIEW CLI.'
      ].join('\r\n')
    });

    const result = await executeComparisonReport(
      { record, repositoryRoot: 'C:\\workspace\\repo' },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('left'))
          .mockResolvedValueOnce(Buffer.from('right')),
        materializeSelectedRevisionTree: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
        readdir: vi.fn().mockResolvedValue([]) as never,
        readFile: readFile as never,
        pathExists: pathExists as never,
        runCommand,
        nowIso: vi.fn().mockReturnValue('2026-07-15T09:00:00.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(2000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32',
        enforceWindowsHostPreflight: false
      }
    );

    // A single attempt; the -350000 result is authoritative.
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.reportExists).toBe(false);
    expect(result.record.runtimeExecution.durationMs).toBe(1000);
    expect(result.record.runtimeExecution.diagnosticNotes ?? []).not.toContain(
      'Windows host-native cold-launch retry: the first attempt launched LabVIEW but the VI Server was not ready within the LabVIEW CLI connect window (-350000). Retried once against the now-resident LabVIEW on the same derived VI Server port.'
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

describe('inferLabviewYearFromExecutablePath (VHS-REQ-636.4, VHS-REQ-637.1)', () => {
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
        'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2025\\LabVIEW.exe'
      )
    ).toBe('2025');
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

  it('leaves years outside the supported host range to callers that need raw extraction', () => {
    expect(
      inferLabviewYearFromExecutablePath(
        'C:\\Program Files\\National Instruments\\LabVIEW 2024\\LabVIEW.exe'
      )
    ).toBe('2024');
    expect(
      inferLabviewYearFromExecutablePath(
        'C:\\Program Files\\National Instruments\\LabVIEW 2031\\LabVIEW.exe'
      )
    ).toBe('2031');
  });

  it('returns undefined for missing or empty input', () => {
    expect(inferLabviewYearFromExecutablePath(undefined)).toBeUndefined();
    expect(inferLabviewYearFromExecutablePath('')).toBeUndefined();
    expect(inferLabviewYearFromExecutablePath('   ')).toBeUndefined();
  });
});

describe('inferSupportedLabviewYearFromExecutablePath (VHS-REQ-637.1)', () => {
  it('returns undefined for years outside the supported host range', () => {
    expect(
      inferSupportedLabviewYearFromExecutablePath(
        'C:\\Program Files\\National Instruments\\LabVIEW 2024\\LabVIEW.exe'
      )
    ).toBeUndefined();
    expect(
      inferSupportedLabviewYearFromExecutablePath(
        'C:\\Program Files\\National Instruments\\LabVIEW 2031\\LabVIEW.exe'
      )
    ).toBeUndefined();
  });

  it('returns supported host years', () => {
    expect(
      inferSupportedLabviewYearFromExecutablePath(
        'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
      )
    ).toBe('2026');
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

  it('builds candidate paths under ~/natinst/.config and /etc/natinst (VHS-REQ-156.7)', () => {
    const candidates = buildLinuxLabviewIniCandidatePaths({
      homeDir: '/home/sergio',
      requestedLabviewVersion: '2026',
      bitness: 'x64'
    });
    expect(candidates).toContain('/home/sergio/natinst/.config/LabVIEW-2026/labview.conf');
    expect(candidates).toContain('/home/sergio/natinst/.config/LabVIEW-2026-64/labview.conf');
    expect(candidates).toContain('/etc/natinst/LabVIEW-2026/labview.conf');
  });

  it('returns viServerTcpEnabled=true and the explicit port when labview.conf enables TCP (VHS-REQ-156.7)', async () => {
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

  it('fails closed with no resolved port (no fabricated default) when TCP is enabled but server.tcp.port is omitted (VHS-REQ-156.7, VHS-REQ-156.11)', async () => {
    const settings = await resolveLinuxLabviewTcpSettings(createLinuxRecord(), {
      readFile: vi.fn().mockResolvedValue('server.tcp.enabled=True\n') as never,
      homeDir: () => '/home/sergio'
    });
    expect(settings.viServerTcpEnabled).toBe(true);
    expect(settings.labviewTcpPort).toBeUndefined();
    expect(settings.notes.join(' ')).toMatch(/does not declare server\.tcp\.port/);
  });

  it('flags VI Server TCP disabled when server.tcp.enabled=False (VHS-REQ-156.7)', async () => {
    const settings = await resolveLinuxLabviewTcpSettings(createLinuxRecord(), {
      readFile: vi.fn().mockResolvedValue('server.tcp.enabled=False\n') as never,
      homeDir: () => '/home/sergio'
    });
    expect(settings.viServerTcpEnabled).toBe(false);
    expect(settings.notes.join(' ')).toMatch(/server\.tcp\.enabled=False/);
  });

  it('flags VI Server TCP disabled when labview.conf has no server.tcp.enabled key (Linux default) (VHS-REQ-156.7)', async () => {
    const settings = await resolveLinuxLabviewTcpSettings(createLinuxRecord(), {
      readFile: vi.fn().mockResolvedValue('LoadAddOns=False\n') as never,
      homeDir: () => '/home/sergio'
    });
    expect(settings.viServerTcpEnabled).toBe(false);
    expect(settings.notes.join(' ')).toMatch(/server\.tcp\.enabled is missing/);
  });

  it('returns viServerTcpEnabled=unknown when no candidate file is readable (VHS-REQ-156.7)', async () => {
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

  it('infers requestedLabviewVersion from labviewExe path when not explicitly set (VHS-REQ-156.7)', async () => {
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
  it('blocks execution with linux-vi-server-tcp-disabled when labview.conf disables VI Server TCP (VHS-REQ-156.7)', async () => {
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

  it('blocks execution with linux-vi-server-tcp-port-unknown when TCP is enabled but no server.tcp.port is declared (VHS-REQ-156.11)', async () => {
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
            return 'server.tcp.enabled=True\n';
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
    expect(result.record.runtimeExecution.blockedReason).toBe('linux-vi-server-tcp-port-unknown');
    expect(result.record.runtimeExecution.diagnosticReason).toBe('linux-vi-server-tcp-port-unknown');
    expect(result.record.runtimeExecution.labviewTcpPort).toBeUndefined();
    expect(result.record.runtimeExecution.labviewIniPath).toMatch(/labview\.conf$/);
    expect(result.record.runtimeExecution.diagnosticNotes?.join(' ')).toMatch(
      /does not declare server\.tcp\.port/
    );
  });

  it('blocks execution with linux-vi-server-tcp-disabled when no labview.conf candidate is readable (VHS-REQ-156.7)', async () => {
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
  it('blocks execution with windows-vi-server-tcp-disabled before Windows process contamination checks when LabVIEW.ini sets server.tcp.enabled=False (VHS-REQ-623.2, VHS-REQ-623.4)', async () => {
    const record = createReadyRecord();
    // createReadyRecord() defaults to platform='win32', host-native, labview-cli;
    // labviewExe.path = 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe'
    const expectedIniPath =
      'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.ini';

    const runCommand = vi.fn();
    const observeWindowsProcesses = vi.fn().mockResolvedValue({
      capturedAt: '2026-06-03T18:00:00.000Z',
      hostPlatform: 'win32',
      runtimePlatform: 'win32',
      trigger: 'preflight',
      observedProcesses: [],
      observedProcessNames: [],
      labviewProcessObserved: true,
      labviewCliProcessObserved: false,
      lvcompareProcessObserved: false,
      labviewProcessBitness: 'x64',
      labviewProcessExecutablePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe'
    });
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
        processPlatform: 'win32',
        enforceWindowsHostPreflight: true,
        observeWindowsProcesses,
        observeWindowsTcpListeners: vi.fn().mockResolvedValue([])
      }
    );

    expect(runCommand).not.toHaveBeenCalled();
    expect(observeWindowsProcesses).not.toHaveBeenCalled();
    expect(result.record.runtimeExecution.state).toBe('not-available');
    expect(result.record.runtimeExecution.blockedReason).toBe('windows-vi-server-tcp-disabled');
    expect(result.record.runtimeExecution.diagnosticReason).toBe('windows-vi-server-tcp-disabled');
    expect(result.record.runtimeExecution.labviewIniPath).toBe(expectedIniPath);
    expect(result.record.runtimeExecution.diagnosticNotes?.join(' ')).toMatch(
      /server\.tcp\.enabled=False/
    );
    expect(result.record.runtimeExecution.diagnosticNotes?.join(' ')).toMatch(/VI Server/i);
  });

  it('proceeds unchanged when LabVIEW.ini is unreadable because Windows defaults VI Server TCP on (VHS-REQ-623.3)', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.allowExistingWindowsHostRuntime = true;
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'CreateComparisonReport operation succeeded.',
      stderr: ''
    });
    const readFile = vi.fn(async (filePath: string) => {
      if (filePath.endsWith('LabVIEW.ini')) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return `${record.stagedRevisionPlan.leftFilename}\n${record.stagedRevisionPlan.rightFilename}\n`;
    });

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
        readFile: readFile as never,
        pathExists: vi.fn(async (filePath: string) =>
          typeof filePath === 'string' && filePath.endsWith(record.artifactPlan.reportFilename)
        ),
        runCommand,
        nowIso: vi.fn().mockReturnValue('2026-06-03T18:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32',
        enforceWindowsHostPreflight: true,
        observeWindowsProcesses: vi.fn().mockResolvedValue(undefined),
        observeWindowsTcpListeners: vi.fn().mockResolvedValue([])
      }
    );

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(result.record.runtimeExecution.state).toBe('succeeded');
    expect(result.record.runtimeExecution.blockedReason).toBeUndefined();
    expect(result.record.runtimeExecution.labviewIniPath).toContain('LabVIEW.ini');
    expect(result.record.runtimeExecution.diagnosticNotes?.join(' ')).toMatch(/not readable/);
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

  it('buildLinuxContainerCommandPlan runs the CLI once (single-cycle) and hardens the LabVIEW .conf (VHS-REQ-148)', () => {
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
    // Single-cycle: the CLI runs exactly once, no cold-launch retry loop.
    expect(script).not.toContain('max_attempts');
    expect(script).not.toContain('retry_delay');
    expect(script).toContain('retryAttempts=1');
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

  it('materializes one selected-revision tree and stages both VIs at repo-relative depth (VHS-REQ-624.1, VHS-REQ-624.4, VHS-REQ-624.5, VHS-REQ-624.9)', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const materializeSelectedRevisionTree = vi.fn().mockResolvedValue(undefined);
    const writePacketRecord = vi.fn().mockResolvedValue(undefined);
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
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord,
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
    const materializedTree = {
      root: plan.treeRoot as string,
      revisionId: record.selectedHash,
      pathspec: '.'
    };
    expect(result.record.runtimeExecution.materializedTree).toEqual(materializedTree);
    const retainedRecord = writePacketRecord.mock.calls[0]?.[0];
    expect(retainedRecord?.stagedRevisionPlan).toMatchObject({
      leftFilename: plan.leftFilename,
      rightFilename: plan.rightFilename
    });
    expect(retainedRecord?.runtimeExecution.materializedTree).toEqual(materializedTree);
  });

  it('stages working-tree bytes only into retained staging paths (VHS-REQ-641.5)', async () => {
    const readRevisionBlob = vi
      .fn()
      .mockResolvedValueOnce(Buffer.from('base-blob'))
      .mockResolvedValueOnce(Buffer.from('worktree-blob'));
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const materializeSelectedRevisionTree = vi.fn().mockResolvedValue(undefined);
    const record = createNestedReadyRecord();
    record.selectedHash = 'WORKTREE';
    record.baseHash = 'c3';
    record.preflight.left.revisionId = 'c3';
    record.preflight.left.resolvedRelativePath = 'Source/Sub/foo.vi';
    record.preflight.right.revisionId = 'WORKTREE';
    record.preflight.right.resolvedRelativePath = 'Source/Sub/foo.vi';
    record.stagedRevisionPlan = buildStagedRevisionPlan({
      stagingDirectory: record.artifactPlan.stagingDirectory,
      fullFilename: record.artifactPlan.fullFilename,
      leftRevisionId: record.baseHash,
      rightRevisionId: record.selectedHash,
      normalizedRelativePath: 'Source/Sub/foo.vi'
    });

    await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      {
        readRevisionBlob,
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

    expect(readRevisionBlob).toHaveBeenNthCalledWith(1, '/workspace/repo', 'c3', 'Source/Sub/foo.vi');
    expect(readRevisionBlob).toHaveBeenNthCalledWith(
      2,
      '/workspace/repo',
      'WORKTREE',
      'Source/Sub/foo.vi'
    );
    expect(materializeSelectedRevisionTree).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryRoot: '/workspace/repo',
        revisionId: 'WORKTREE',
        destinationRoot: record.stagedRevisionPlan.treeRoot
      })
    );
    const writeTargets = writeFile.mock.calls.map((call) => String(call[0]).replace(/\\/g, '/'));
    expect(writeTargets).toContain(record.stagedRevisionPlan.leftFilePath.replace(/\\/g, '/'));
    expect(writeTargets).toContain(record.stagedRevisionPlan.rightFilePath.replace(/\\/g, '/'));
    expect(writeTargets.some((target) => target.startsWith('/workspace/repo/'))).toBe(false);
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

  it('reclassifies a -350000 LabVIEW CLI exit as labview-cli-connection-failed (VHS-REQ-630.3, VHS-REQ-658.1)', async () => {
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

  it('classifies an LVCompare exit-zero-without-report as lvcompare-exited-zero-without-report without applying the LabVIEWCLI VI Server preflight (VHS-REQ-623.5)', async () => {
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
        readFile: vi.fn().mockResolvedValue('server.tcp.enabled=False\n') as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
        nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32',
        enforceWindowsHostPreflight: true,
        observeWindowsProcesses: vi.fn().mockResolvedValue(undefined),
        observeWindowsTcpListeners: vi.fn().mockResolvedValue([])
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

  it('uses HEAD as the dependency context when materializing the working-tree sentinel (VHS-REQ-641.3)', async () => {
    const calls: Array<{ args: string[]; env: NodeJS.ProcessEnv }> = [];
    const runGit = vi.fn(async (args: string[], opts: { env: NodeJS.ProcessEnv }) => {
      calls.push({ args, env: opts.env });
    });
    const removePath = vi.fn().mockResolvedValue(undefined);
    const mkdtemp = vi.fn().mockResolvedValue('/tmp/vihs-stage-index-WORKTREE');
    const tmpdir = vi.fn().mockReturnValue('/tmp');
    const listSubmoduleGitlinks = vi.fn().mockResolvedValue([]);

    await materializeSelectedRevisionTreeWithGit(
      {
        repositoryRoot: '/workspace/repo',
        revisionId: 'WORKTREE',
        destinationRoot: '/stage/dest',
        pathspec: '.'
      },
      {
        runGit,
        mkdtemp: mkdtemp as never,
        removePath: removePath as never,
        tmpdir,
        listSubmoduleGitlinks
      }
    );

    expect(calls[0].args).toEqual(['-C', '/workspace/repo', 'read-tree', 'HEAD']);
    expect(calls[1].args).toContain('/stage/dest');
    expect(listSubmoduleGitlinks).toHaveBeenCalledWith({
      workingDirectory: '/workspace/repo',
      revisionId: 'HEAD'
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

  it('parses tasklist output and infers LabVIEW.exe bitness and year on a win32 host (VHS-REQ-621.1, VHS-REQ-637.1)', async () => {
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
    expect(observation?.labviewProcessYear).toBe('2026');
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

describe('classifyRuntimeFailure log-only and bitness-guard arms (VHS-REQ-621)', () => {
  const LOG_ONLY_STDOUT = 'LabVIEWCLI started logging in file: C:\\temp\\vihs\\diag.log';

  function observation(
    trigger: RuntimeProcessObservation['trigger'],
    overrides: Partial<RuntimeProcessObservation> = {}
  ): RuntimeProcessObservation {
    return {
      capturedAt: '2026-07-15T00:00:00.000Z',
      hostPlatform: 'win32',
      runtimePlatform: 'win32',
      trigger,
      observedProcesses: [],
      observedProcessNames: [],
      labviewProcessObserved: false,
      labviewCliProcessObserved: true,
      lvcompareProcessObserved: false,
      ...overrides
    };
  }

  it('classifies a log-only CLI failure with LabVIEW absent through exit as labview-cli-log-only-no-labview-through-exit', () => {
    const result = classifyRuntimeFailure({
      engine: 'labview-cli',
      exitCode: 1,
      reportExists: false,
      stdout: LOG_ONLY_STDOUT,
      stderr: '',
      processObservation: observation('cli-log-banner'),
      exitProcessObservation: observation('process-exit')
    });

    expect(result.reason).toBe('labview-cli-log-only-no-labview-through-exit');
    expect(result.notes.join(' ')).toContain('cli-log-banner and process-exit snapshots');
  });

  it('classifies a log-only CLI failure observed only at the banner snapshot as labview-cli-log-only-no-labview-at-banner-snapshot', () => {
    const result = classifyRuntimeFailure({
      engine: 'labview-cli',
      exitCode: 1,
      reportExists: false,
      stdout: LOG_ONLY_STDOUT,
      stderr: '',
      // Banner snapshot qualifies, but the exit snapshot does not observe the CLI,
      // so the through-exit arm is not taken and this falls to the banner arm.
      processObservation: observation('cli-log-banner'),
      exitProcessObservation: observation('process-exit', { labviewCliProcessObserved: false })
    });

    expect(result.reason).toBe('labview-cli-log-only-no-labview-at-banner-snapshot');
    expect(result.notes.join(' ')).toContain('cli-log-banner snapshot');
  });

  it('falls back to labview-cli-exited-nonzero-log-only-no-report when no qualifying snapshot exists', () => {
    const result = classifyRuntimeFailure({
      engine: 'labview-cli',
      exitCode: 1,
      reportExists: false,
      stdout: LOG_ONLY_STDOUT,
      stderr: '',
      // No process observations at all -> neither log-only snapshot arm qualifies.
      processObservation: undefined,
      exitProcessObservation: undefined
    });

    expect(result.reason).toBe('labview-cli-exited-nonzero-log-only-no-report');
    expect(result.notes.join(' ')).toContain('only advertised the diagnostic log path');
  });

  it('does not rewrite to labview-host-bitness-conflict when no LabVIEW.exe was observed (VHS-REQ-621 guard)', () => {
    const result = classifyRuntimeFailure({
      engine: 'labview-cli',
      exitCode: 1,
      reportExists: false,
      selectedBitness: 'x86',
      // Non-log-only stdout so the CLI log-only block is skipped and the generic
      // nonzero arm is reached; the exit snapshot carries a mismatched bitness but
      // labviewProcessObserved is false, so the conflict guard must NOT fire.
      stdout: '',
      stderr: 'some unrelated failure',
      exitProcessObservation: observation('process-exit', {
        labviewProcessObserved: false,
        labviewProcessBitness: 'x64'
      })
    });

    expect(result.reason).toBe('command-exited-nonzero');
    expect(result.notes).toEqual([]);
  });
});

describe('appendLabviewCliPortNumberArg (VHS-REQ-621)', () => {
  it('returns an unchanged copy when the port is undefined', () => {
    const args = ['-VI1', 'a.vi'];
    const result = appendLabviewCliPortNumberArg(args, undefined);

    expect(result).toEqual(['-VI1', 'a.vi']);
    // The helper must not mutate the caller's array.
    expect(result).not.toBe(args);
  });

  it('returns an unchanged copy for a zero or negative port', () => {
    expect(appendLabviewCliPortNumberArg(['-x'], 0)).toEqual(['-x']);
    expect(appendLabviewCliPortNumberArg(['-x'], -3363)).toEqual(['-x']);
  });

  it('returns an unchanged copy for a non-integer port', () => {
    expect(appendLabviewCliPortNumberArg(['-x'], 3363.5)).toEqual(['-x']);
  });

  it('appends -PortNumber and the value when no port arg is present', () => {
    expect(appendLabviewCliPortNumberArg(['-VI1', 'a.vi'], 3363)).toEqual([
      '-VI1',
      'a.vi',
      '-PortNumber',
      '3363'
    ]);
  });

  it('replaces the value of an existing case-insensitive -portnumber arg in place', () => {
    const result = appendLabviewCliPortNumberArg(
      ['-VI1', 'a.vi', '-portnumber', '1111'],
      3363
    );

    expect(result).toEqual(['-VI1', 'a.vi', '-portnumber', '3363']);
    // No duplicate -PortNumber flag is appended.
    expect(result.filter((token) => token.toLowerCase() === '-portnumber')).toHaveLength(1);
  });
});

describe('rewriteLabviewCliArgsForContainerWorkspace (VHS-REQ-621)', () => {
  const options = {
    containerWorkspaceRoot: 'C:\\ws',
    leftFilename: 'left.vi',
    rightFilename: 'right.vi',
    reportFilename: 'report.html'
  };

  it('rewrites -VI1/-VI2/-ReportPath to container staging and report paths', () => {
    const result = rewriteLabviewCliArgsForContainerWorkspace(
      ['-VI1', 'host-left.vi', '-VI2', 'host-right.vi', '-ReportPath', 'host-report.html'],
      options
    );

    expect(result).toEqual([
      '-VI1',
      'C:\\ws\\staging\\left.vi',
      '-VI2',
      'C:\\ws\\staging\\right.vi',
      '-ReportPath',
      'C:\\ws\\report.html',
      '-Headless'
    ]);
  });

  it('honors the lowercase -vi1/-vi2/-reportPath aliases', () => {
    const result = rewriteLabviewCliArgsForContainerWorkspace(
      ['-vi1', 'x.vi', '-vi2', 'y.vi', '-reportPath', 'r.html'],
      options
    );

    expect(result).toEqual([
      '-vi1',
      'C:\\ws\\staging\\left.vi',
      '-vi2',
      'C:\\ws\\staging\\right.vi',
      '-reportPath',
      'C:\\ws\\report.html',
      '-Headless'
    ]);
  });

  it('drops any incoming -LabVIEWPath flag and its value', () => {
    const result = rewriteLabviewCliArgsForContainerWorkspace(
      ['-LabVIEWPath', 'C:\\host\\LabVIEW.exe', '-VI1', 'a.vi'],
      options
    );

    expect(result).not.toContain('C:\\host\\LabVIEW.exe');
    expect(result).toEqual(['-VI1', 'C:\\ws\\staging\\left.vi', '-Headless']);
  });

  it('re-appends a trimmed -LabVIEWPath when provided in options', () => {
    const result = rewriteLabviewCliArgsForContainerWorkspace(['-VI1', 'a.vi'], {
      ...options,
      labviewPath: '  C:\\lv\\LabVIEW.exe  '
    });

    expect(result).toEqual([
      '-VI1',
      'C:\\ws\\staging\\left.vi',
      '-LabVIEWPath',
      'C:\\lv\\LabVIEW.exe',
      '-Headless'
    ]);
  });

  it('does not append -LabVIEWPath for a blank labviewPath option', () => {
    const result = rewriteLabviewCliArgsForContainerWorkspace(['-VI1', 'a.vi'], {
      ...options,
      labviewPath: '   '
    });

    expect(result).not.toContain('-LabVIEWPath');
  });

  it('drops -c and an incoming -Headless (with its value) then re-appends a single -Headless', () => {
    const result = rewriteLabviewCliArgsForContainerWorkspace(
      ['-c', '-Headless', 'true', '-VI1', 'a.vi'],
      options
    );

    expect(result).not.toContain('-c');
    expect(result).not.toContain('true');
    expect(result.filter((token) => token === '-Headless')).toHaveLength(1);
    // -Headless is always the final token.
    expect(result[result.length - 1]).toBe('-Headless');
  });

  it('leaves an incoming -Headless with no following value intact (single re-append)', () => {
    const result = rewriteLabviewCliArgsForContainerWorkspace(['-VI1', 'a.vi', '-Headless'], options);

    expect(result.filter((token) => token === '-Headless')).toHaveLength(1);
  });

  it('preserves unrelated passthrough arguments in order', () => {
    const result = rewriteLabviewCliArgsForContainerWorkspace(
      ['-OperationName', 'CreateComparisonReport', '-VI1', 'a.vi'],
      options
    );

    expect(result.slice(0, 2)).toEqual(['-OperationName', 'CreateComparisonReport']);
  });
});

describe('observeWindowsTcpListeners netstat/tasklist observation (VHS-REQ-621, VHS-REQ-623)', () => {
  // Fake execFile(file, args, options, callback) that answers netstat and
  // tasklist from canned stdout keyed on the first argument flag.
  function fakeExecFile(outputs: { netstat: string; tasklist: string }) {
    return vi.fn(
      (
        _file: string,
        args: readonly string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string) => void
      ) => {
        const stdout = args[0] === '-nao' ? outputs.netstat : outputs.tasklist;
        callback(null, stdout);
      }
    );
  }

  it('returns [] without spawning a process for a non-win32 runtime platform', async () => {
    const execFileImpl = vi.fn();
    const result = await observeWindowsTcpListeners(
      { hostPlatform: 'linux', runtimePlatform: 'linux', localPorts: [3363] },
      { execFileImpl: execFileImpl as never }
    );

    expect(result).toEqual([]);
    expect(execFileImpl).not.toHaveBeenCalled();
  });

  it('returns [] without spawning a process when no valid local ports are requested', async () => {
    const execFileImpl = vi.fn();
    const result = await observeWindowsTcpListeners(
      { hostPlatform: 'win32', runtimePlatform: 'win32', localPorts: [0, -1] },
      { execFileImpl: execFileImpl as never }
    );

    expect(result).toEqual([]);
    expect(execFileImpl).not.toHaveBeenCalled();
  });

  it('parses netstat listeners, filters to requested ports, and joins PIDs to image names', async () => {
    const execFileImpl = fakeExecFile({
      netstat: [
        '  Proto  Local Address          Foreign Address        State           PID',
        '  TCP    0.0.0.0:3363           0.0.0.0:0              LISTENING       1234',
        // A listener on an unrequested port is excluded.
        '  TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       9999',
        // Non-LISTENING rows are ignored.
        '  TCP    0.0.0.0:5555           10.0.0.1:52000        ESTABLISHED     4321'
      ].join('\r\n'),
      tasklist: '"LabVIEW.exe","1234","Console","1","500 K"'
    });

    const result = await observeWindowsTcpListeners(
      { hostPlatform: 'win32', runtimePlatform: 'win32', localPorts: [3363] },
      { execFileImpl: execFileImpl as never }
    );

    expect(result).toEqual([
      { localAddress: '0.0.0.0', localPort: 3363, pid: 1234, processName: 'LabVIEW.exe' }
    ]);
  });

  it('leaves processName undefined when no tasklist row matches the listener PID', async () => {
    const execFileImpl = fakeExecFile({
      netstat: '  TCP    127.0.0.1:3363         0.0.0.0:0              LISTENING       4242',
      // Tasklist has a different PID, so the join misses.
      tasklist: '"Other.exe","1111","Console","1","10 K"'
    });

    const result = await observeWindowsTcpListeners(
      { hostPlatform: 'win32', runtimePlatform: 'win32', localPorts: [3363] },
      { execFileImpl: execFileImpl as never }
    );

    expect(result).toEqual([
      { localAddress: '127.0.0.1', localPort: 3363, pid: 4242, processName: undefined }
    ]);
  });

  it('returns [] when no LISTENING row matches a requested port (tasklist not queried)', async () => {
    const execFileImpl = fakeExecFile({
      netstat: '  TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       9999',
      tasklist: '"ShouldNotBeRead.exe","9999","Console","1","1 K"'
    });

    const result = await observeWindowsTcpListeners(
      { hostPlatform: 'win32', runtimePlatform: 'win32', localPorts: [3363] },
      { execFileImpl: execFileImpl as never }
    );

    expect(result).toEqual([]);
    // Only the netstat probe ran; tasklist is skipped when there are no listeners.
    expect(execFileImpl).toHaveBeenCalledTimes(1);
  });

  it('resolves the WSL system32 path when the host platform is not win32', async () => {
    const seen: string[] = [];
    const execFileImpl = vi.fn(
      (
        file: string,
        args: readonly string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string) => void
      ) => {
        seen.push(file);
        callback(null, args[0] === '-nao' ? '' : '');
      }
    );

    await observeWindowsTcpListeners(
      // runtimePlatform win32 (a Windows container/interop run) but the host is Linux (WSL bridge).
      { hostPlatform: 'linux', runtimePlatform: 'win32', localPorts: [3363] },
      { execFileImpl: execFileImpl as never }
    );

    expect(seen[0]).toBe('/mnt/c/Windows/System32/netstat.exe');
  });
});

describe('buildLinuxContainerBindMountVisibilityNote (VHS-REQ-663)', () => {
  const HOME = '/home/dev';

  // VHS-REQ-663.1: the helper returns a note only under the container +
  // invalid-vi-path + outside-home conditions, and undefined otherwise.
  // VHS-REQ-663.2: the note names the path/home, snap-Docker confinement, and both remediations.
  it('returns an actionable note when a linux-container invalid-vi-path failure bind-mounts outside $HOME (VHS-REQ-663.1, VHS-REQ-663.2)', () => {
    const note = buildLinuxContainerBindMountVisibilityNote({
      provider: 'linux-container',
      diagnosticReason: 'labview-cli-invalid-vi-path',
      hostBindMountPath: '/tmp/vihs-compare-abc/reports/x/y',
      homeDir: HOME
    });

    expect(note).toBeDefined();
    expect(note).toContain('/tmp/vihs-compare-abc/reports/x/y');
    expect(note).toContain('outside your home directory /home/dev');
    expect(note).toContain('Snap-packaged Docker');
    expect(note).toContain('snap connect docker:removable-media');
  });
  it('matches on the failureReason arm as well as diagnosticReason (VHS-REQ-663.1)', () => {
    const note = buildLinuxContainerBindMountVisibilityNote({
      provider: 'linux-container',
      failureReason: 'labview-cli-invalid-vi-path',
      hostBindMountPath: '/mnt/data/reports/x',
      homeDir: HOME
    });
    expect(note).toBeDefined();
  });

  it('returns undefined when the bind-mount source is inside $HOME (VHS-REQ-663.1)', () => {
    expect(
      buildLinuxContainerBindMountVisibilityNote({
        provider: 'linux-container',
        diagnosticReason: 'labview-cli-invalid-vi-path',
        hostBindMountPath: '/home/dev/.config/Code/User/workspaceStorage/x/reports/y',
        homeDir: HOME
      })
    ).toBeUndefined();
  });

  it('returns undefined for a non-container provider (VHS-REQ-663.1)', () => {
    expect(
      buildLinuxContainerBindMountVisibilityNote({
        provider: 'host-native',
        diagnosticReason: 'labview-cli-invalid-vi-path',
        hostBindMountPath: '/tmp/reports/y',
        homeDir: HOME
      })
    ).toBeUndefined();
  });

  it('returns undefined when the failure is not an invalid-vi-path signature (VHS-REQ-663.1)', () => {
    expect(
      buildLinuxContainerBindMountVisibilityNote({
        provider: 'linux-container',
        diagnosticReason: 'labview-cli-connection-failed',
        failureReason: 'command-exited-nonzero',
        hostBindMountPath: '/tmp/reports/y',
        homeDir: HOME
      })
    ).toBeUndefined();
  });

  it('returns undefined when the host path or home directory is missing (VHS-REQ-663.1)', () => {
    expect(
      buildLinuxContainerBindMountVisibilityNote({
        provider: 'linux-container',
        diagnosticReason: 'labview-cli-invalid-vi-path',
        hostBindMountPath: '   ',
        homeDir: HOME
      })
    ).toBeUndefined();
    expect(
      buildLinuxContainerBindMountVisibilityNote({
        provider: 'linux-container',
        diagnosticReason: 'labview-cli-invalid-vi-path',
        hostBindMountPath: '/tmp/reports/y',
        homeDir: undefined
      })
    ).toBeUndefined();
  });

  it('executeComparisonReport appends the bind-mount visibility note to a failed linux-container run (VHS-REQ-663.3)', async () => {
    const record = createLinuxContainerReadyRecord();
    // The fixture report directory (/workspace/.storage/...) is outside any real
    // home directory, so the note fires deterministically regardless of CI $HOME.
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
        readFile: vi.fn().mockResolvedValue('') as never,
        // No generated report exists -> the run fails.
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 1,
          stdout: '',
          stderr:
            'Error: VI 1 path invalid or does not exist: /workspace/staging/right-abcdef123456-foo.vi'
        }),
        nowIso: vi
          .fn()
          .mockReturnValueOnce('2026-05-28T10:00:00.000Z')
          .mockReturnValueOnce('2026-05-28T10:00:02.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(3000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'linux'
      }
    );

    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.diagnosticReason).toBe('labview-cli-invalid-vi-path');
    const notes = result.record.runtimeExecution.diagnosticNotes ?? [];
    expect(notes.some((note) => note.includes('Snap-packaged Docker'))).toBe(true);
    expect(notes.some((note) => note.includes('outside your home directory'))).toBe(true);
  });
});

describe('working-tree snapshot provenance (VHS-REQ-641.6)', () => {
  it('deriveWorktreeSnapshotIdentity is a stable 16-hex content hash', () => {
    const a = deriveWorktreeSnapshotIdentity(Buffer.from('vi-bytes-one'));
    const b = deriveWorktreeSnapshotIdentity(Buffer.from('vi-bytes-one'));
    const c = deriveWorktreeSnapshotIdentity(Buffer.from('vi-bytes-two'));

    expect(a).toMatch(/^[0-9a-f]{16}$/);
    // Same bytes -> same identity (idempotent); different bytes -> different.
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('names the selected working-tree snapshot identity from the right (selected) bytes', () => {
    const note = buildWorktreeSnapshotProvenanceNote({
      selectedHash: 'WORKTREE',
      baseHash: 'abcdef1234567890',
      normalizedRelativePath: 'src/Widget.vi',
      leftBytes: Buffer.from('base'),
      rightBytes: Buffer.from('uncommitted-widget')
    });

    expect(note).toBeDefined();
    expect(note).toContain('src/Widget.vi');
    expect(note).toContain(deriveWorktreeSnapshotIdentity(Buffer.from('uncommitted-widget')));
    expect(note).toContain('not retained in the dashboard');
  });

  it('uses the left (base) bytes when the base side is the working-tree sentinel', () => {
    const note = buildWorktreeSnapshotProvenanceNote({
      selectedHash: 'abcdef1234567890',
      baseHash: 'WORKTREE',
      normalizedRelativePath: 'src/Widget.vi',
      leftBytes: Buffer.from('uncommitted-base'),
      rightBytes: Buffer.from('selected')
    });

    expect(note).toContain(deriveWorktreeSnapshotIdentity(Buffer.from('uncommitted-base')));
  });

  it('returns undefined for a committed pair (no working-tree side)', () => {
    expect(
      buildWorktreeSnapshotProvenanceNote({
        selectedHash: 'aaaaaaaaaaaa',
        baseHash: 'bbbbbbbbbbbb',
        normalizedRelativePath: 'src/Widget.vi',
        leftBytes: Buffer.from('base'),
        rightBytes: Buffer.from('selected')
      })
    ).toBeUndefined();
  });

  it('executeComparisonReport attaches the provenance note for a working-tree comparison', async () => {
    const record = createReadyRecord();
    record.selectedHash = 'WORKTREE';
    record.stagedRevisionPlan = buildStagedRevisionPlan({
      stagingDirectory: record.artifactPlan.stagingDirectory,
      fullFilename: record.artifactPlan.fullFilename,
      leftRevisionId: record.baseHash,
      rightRevisionId: 'WORKTREE'
    });
    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      {
        readRevisionBlob: vi
          .fn()
          .mockResolvedValueOnce(Buffer.from('base-bytes'))
          .mockResolvedValueOnce(Buffer.from('uncommitted-on-disk-bytes')),
        materializeSelectedRevisionTree: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        copyFile: vi.fn().mockResolvedValue(undefined) as never,
        copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
        removePath: vi.fn().mockResolvedValue(undefined) as never,
        unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
        readdir: vi.fn().mockResolvedValue([]) as never,
        readFile: vi.fn().mockResolvedValue('') as never,
        pathExists: vi.fn().mockResolvedValue(false),
        runCommand: vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'boom' }),
        nowIso: vi.fn().mockReturnValue('2026-07-15T00:00:00.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(3000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    const notes = result.record.runtimeExecution.diagnosticNotes ?? [];
    const expectedIdentity = deriveWorktreeSnapshotIdentity(
      Buffer.from('uncommitted-on-disk-bytes')
    );
    expect(notes.some((note) => note.includes('uncommitted working-tree snapshot'))).toBe(true);
    expect(notes.some((note) => note.includes(expectedIdentity))).toBe(true);
    // VHS-REQ-641.7: the content-addressed identity is also surfaced as a
    // structured field so the archive seam can content-address the pair-ID.
    expect(result.record.runtimeExecution.worktreeSnapshotId).toBe(expectedIdentity);
  });

  it('deriveComparedWorktreeSnapshotId resolves the sentinel side and skips committed pairs (VHS-REQ-641.7)', () => {
    // Selected side is the working tree -> use the right (selected) bytes.
    expect(
      deriveComparedWorktreeSnapshotId({
        selectedHash: 'WORKTREE',
        baseHash: 'abcdef1234567890',
        leftBytes: Buffer.from('base'),
        rightBytes: Buffer.from('uncommitted-widget')
      })
    ).toBe(deriveWorktreeSnapshotIdentity(Buffer.from('uncommitted-widget')));
    // Base side is the working tree -> use the left (base) bytes.
    expect(
      deriveComparedWorktreeSnapshotId({
        selectedHash: 'abcdef1234567890',
        baseHash: 'WORKTREE',
        leftBytes: Buffer.from('uncommitted-base'),
        rightBytes: Buffer.from('selected')
      })
    ).toBe(deriveWorktreeSnapshotIdentity(Buffer.from('uncommitted-base')));
    // Committed pair -> no snapshot identity.
    expect(
      deriveComparedWorktreeSnapshotId({
        selectedHash: 'aaaaaaaaaaaa',
        baseHash: 'bbbbbbbbbbbb',
        leftBytes: Buffer.from('base'),
        rightBytes: Buffer.from('selected')
      })
    ).toBeUndefined();
  });
});

describe('comparison-runtime execution primitives (VHS-REQ-621)', () => {
  function makeFakeChild(pid = 4321) {
    const stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn(), destroy: vi.fn() });
    const stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn(), destroy: vi.fn() });
    const child = Object.assign(new EventEmitter(), { stdout, stderr, pid, kill: vi.fn() });
    return { child, stdout, stderr };
  }

  function makeCancellationToken() {
    const listeners: Array<() => void> = [];
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: (listener: () => void) => {
        listeners.push(listener);
        return { dispose: vi.fn() };
      }
    };
    return { token, fire: () => listeners.forEach((listener) => listener()) };
  }

  describe('runComparisonCommandPlanWithObservation', () => {
    it('kills the process tree and reports a timeout after timeoutMs elapses (VHS-REQ-621)', async () => {
      vi.useFakeTimers();
      try {
        const { child } = makeFakeChild(4321);
        const terminateProcessTree = vi.fn().mockResolvedValue(undefined);
        const resultPromise = runComparisonCommandPlanWithObservation(
          { executable: 'LabVIEWCLI', args: ['-OperationName', 'CreateComparisonReport'] },
          {
            spawnImpl: (() => child) as never,
            hostPlatform: 'win32',
            runtimePlatform: 'win32',
            engine: 'labview-cli',
            timeoutMs: 5000,
            terminateProcessTree,
            observeWindowsProcesses: vi.fn().mockResolvedValue(undefined)
          }
        );
        child.emit('spawn');
        vi.advanceTimersByTime(5000);
        expect(child.kill).toHaveBeenCalledWith('SIGKILL');
        expect(terminateProcessTree).toHaveBeenCalledWith(4321, 'win32');
        child.emit('exit', null, 'SIGKILL');
        const result = await resultPromise;
        expect(result.timedOut).toBe(true);
        expect(result.exitCode).toBe(124);
        expect(result.stderr).toContain('timed out after 5000ms');
      } finally {
        vi.useRealTimers();
      }
    });

    it('reports a cancelled outcome when the cancellation token fires (VHS-REQ-621)', async () => {
      const { child } = makeFakeChild(0);
      const { token, fire } = makeCancellationToken();
      const resultPromise = runComparisonCommandPlanWithObservation(
        { executable: 'LabVIEWCLI', args: [] },
        {
          spawnImpl: (() => child) as never,
          hostPlatform: 'linux',
          runtimePlatform: 'linux',
          engine: 'labview-cli',
          cancellationToken: token as never,
          observeWindowsProcesses: vi.fn().mockResolvedValue(undefined)
        }
      );
      child.emit('spawn');
      fire();
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      child.emit('exit', null, 'SIGKILL');
      const result = await resultPromise;
      expect(result.cancelled).toBe(true);
      expect(result.exitCode).toBe(130);
      expect(result.stderr).toContain('comparison-command cancelled by user');
    });

    it('terminates immediately when the token is already cancelled at spawn (VHS-REQ-621)', async () => {
      const { child } = makeFakeChild();
      const token = {
        isCancellationRequested: true,
        onCancellationRequested: () => ({ dispose: vi.fn() })
      };
      const resultPromise = runComparisonCommandPlanWithObservation(
        { executable: 'LabVIEWCLI', args: [] },
        {
          spawnImpl: (() => child) as never,
          hostPlatform: 'linux',
          runtimePlatform: 'linux',
          engine: 'labview-cli',
          cancellationToken: token as never,
          observeWindowsProcesses: vi.fn().mockResolvedValue(undefined)
        }
      );
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      child.emit('exit', null, 'SIGKILL');
      const result = await resultPromise;
      expect(result.cancelled).toBe(true);
      expect(result.exitCode).toBe(130);
    });

    it('rejects when the child process emits an error (VHS-REQ-621)', async () => {
      const { child } = makeFakeChild();
      const resultPromise = runComparisonCommandPlanWithObservation(
        { executable: 'LabVIEWCLI', args: [] },
        {
          spawnImpl: (() => child) as never,
          hostPlatform: 'linux',
          runtimePlatform: 'linux',
          engine: 'labview-cli',
          observeWindowsProcesses: vi.fn().mockResolvedValue(undefined)
        }
      );
      child.emit('spawn');
      child.emit('error', new Error('spawn ENOENT'));
      await expect(resultPromise).rejects.toThrow('spawn ENOENT');
    });

    it('rejects when the process closes with no exit code, timeout, or cancellation (VHS-REQ-621)', async () => {
      const { child } = makeFakeChild();
      const resultPromise = runComparisonCommandPlanWithObservation(
        { executable: 'LabVIEWCLI', args: [] },
        {
          spawnImpl: (() => child) as never,
          hostPlatform: 'linux',
          runtimePlatform: 'linux',
          engine: 'labview-cli',
          observeWindowsProcesses: vi.fn().mockResolvedValue(undefined)
        }
      );
      child.emit('spawn');
      child.emit('exit', null, null);
      await expect(resultPromise).rejects.toThrow('comparison-command-closed-without-exit-code');
    });

    it('captures process-spawn and process-exit observations for the lvcompare engine (VHS-REQ-621)', async () => {
      const { child } = makeFakeChild();
      const bannerObservation = { observedProcessNames: ['LVCompare.exe'], trigger: 'process-spawn' };
      const exitObservation = { observedProcessNames: [], trigger: 'process-exit' };
      const observeWindowsProcesses = vi
        .fn()
        .mockResolvedValueOnce(bannerObservation)
        .mockResolvedValueOnce(exitObservation);
      const resultPromise = runComparisonCommandPlanWithObservation(
        { executable: 'LVCompare', args: ['left.vi', 'right.vi'] },
        {
          spawnImpl: (() => child) as never,
          hostPlatform: 'win32',
          runtimePlatform: 'win32',
          engine: 'lvcompare',
          observeWindowsProcesses: observeWindowsProcesses as never
        }
      );
      child.emit('spawn');
      child.emit('exit', 0, null);
      const result = await resultPromise;
      expect(observeWindowsProcesses).toHaveBeenCalledTimes(2);
      expect(observeWindowsProcesses.mock.calls[0][0].trigger).toBe('process-spawn');
      expect(observeWindowsProcesses.mock.calls[1][0].trigger).toBe('process-exit');
      expect(result.processObservation).toBe(bannerObservation);
      expect(result.exitProcessObservation).toBe(exitObservation);
    });

    it('rejects when runtime process observation fails (VHS-REQ-621)', async () => {
      const { child } = makeFakeChild();
      const resultPromise = runComparisonCommandPlanWithObservation(
        { executable: 'LVCompare', args: ['left.vi', 'right.vi'] },
        {
          spawnImpl: (() => child) as never,
          hostPlatform: 'win32',
          runtimePlatform: 'win32',
          engine: 'lvcompare',
          observeWindowsProcesses: vi.fn().mockRejectedValue(new Error('tasklist failed')) as never
        }
      );
      child.emit('spawn');
      child.emit('exit', 0, null);
      await expect(resultPromise).rejects.toThrow('tasklist failed');
    });
  });

  describe('runComparisonCommandPlan (execFile)', () => {
    it('resolves exit code 0 on a successful run (VHS-REQ-621)', async () => {
      const execFileImpl = vi.fn((_exe, _args, _opts, cb) => {
        cb(null, 'operation succeeded', '');
        return { pid: 1, kill: vi.fn() };
      });
      const result = await runComparisonCommandPlan(
        { executable: 'LVCompare', args: [] },
        { execFileImpl: execFileImpl as never }
      );
      expect(result).toMatchObject({ exitCode: 0, stdout: 'operation succeeded', stderr: '' });
    });

    it('maps a numeric execError code to the exit code (VHS-REQ-621)', async () => {
      const execError = Object.assign(new Error('CLI failed'), { code: 66 });
      const execFileImpl = vi.fn((_exe, _args, _opts, cb) => {
        cb(execError, 'stdout-text', 'stderr-text');
        return { pid: 1, kill: vi.fn() };
      });
      const result = await runComparisonCommandPlan(
        { executable: 'LVCompare', args: [] },
        { execFileImpl: execFileImpl as never }
      );
      expect(result).toMatchObject({ exitCode: 66, stdout: 'stdout-text', stderr: 'stderr-text' });
    });

    it('rejects when execError has no numeric code and is not a timeout/cancel (VHS-REQ-621)', async () => {
      const execError = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
      const execFileImpl = vi.fn((_exe, _args, _opts, cb) => {
        cb(execError, '', '');
        return { pid: 1, kill: vi.fn() };
      });
      await expect(
        runComparisonCommandPlan(
          { executable: 'LVCompare', args: [] },
          { execFileImpl: execFileImpl as never }
        )
      ).rejects.toThrow('spawn ENOENT');
    });

    it('reports a timeout when execFile is killed by its timeout (VHS-REQ-621)', async () => {
      const execError = Object.assign(new Error('Command failed: timed out'), {
        killed: true,
        signal: 'SIGKILL'
      });
      const execFileImpl = vi.fn((_exe, _args, _opts, cb) => {
        cb(execError, 'so', 'se');
        return { pid: 1, kill: vi.fn() };
      });
      const result = await runComparisonCommandPlan(
        { executable: 'LVCompare', args: [] },
        { execFileImpl: execFileImpl as never, timeoutMs: 1000 }
      );
      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(124);
      expect(result.timeoutMs).toBe(1000);
    });

    it('resolves exit code 130 with a cancellation note when cancelled (VHS-REQ-621)', async () => {
      let capturedCallback: ((error: unknown, stdout: string, stderr: string) => void) | undefined;
      const kill = vi.fn();
      const execFileImpl = vi.fn((_exe, _args, _opts, cb) => {
        capturedCallback = cb;
        return { pid: 5, kill };
      });
      const { token, fire } = makeCancellationToken();
      const resultPromise = runComparisonCommandPlan(
        { executable: 'LVCompare', args: [] },
        { execFileImpl: execFileImpl as never, cancellationToken: token as never, hostPlatform: 'linux' }
      );
      fire();
      expect(kill).toHaveBeenCalledWith('SIGKILL');
      capturedCallback?.(null, 'so', 'se');
      const result = await resultPromise;
      expect(result.cancelled).toBe(true);
      expect(result.exitCode).toBe(130);
      expect(result.stderr).toContain('comparison-command cancelled by user');
    });

    it('invokes terminateProcessTree on a win32 cancellation (VHS-REQ-621)', async () => {
      let capturedCallback: ((error: unknown, stdout: string, stderr: string) => void) | undefined;
      const execFileImpl = vi.fn((_exe, _args, _opts, cb) => {
        capturedCallback = cb;
        return { pid: 7, kill: vi.fn() };
      });
      const terminateProcessTree = vi.fn().mockResolvedValue(undefined);
      const { token, fire } = makeCancellationToken();
      const resultPromise = runComparisonCommandPlan(
        { executable: 'LVCompare', args: [] },
        {
          execFileImpl: execFileImpl as never,
          cancellationToken: token as never,
          hostPlatform: 'win32',
          terminateProcessTree
        }
      );
      fire();
      expect(terminateProcessTree).toHaveBeenCalledWith(7, 'win32');
      capturedCallback?.(null, 'so', 'se');
      const result = await resultPromise;
      expect(result.cancelled).toBe(true);
      expect(result.exitCode).toBe(130);
    });

    it('falls back to empty stdout/stderr on a successful run with undefined output (VHS-REQ-621)', async () => {
      const execFileImpl = vi.fn((_e, _a, _o, cb) => {
        cb(null, undefined, undefined);
        return { pid: 1, kill: vi.fn() };
      });
      const result = await runComparisonCommandPlan(
        { executable: 'LVCompare', args: [] },
        { execFileImpl: execFileImpl as never }
      );
      expect(result).toMatchObject({ exitCode: 0, stdout: '', stderr: '' });
    });

    it('falls back to empty output on a cancelled run whose callback reports no error (VHS-REQ-621)', async () => {
      let cb: ((error: unknown, stdout?: string, stderr?: string) => void) | undefined;
      const execFileImpl = vi.fn((_e, _a, _o, captured) => {
        cb = captured;
        return { pid: 3, kill: vi.fn() };
      });
      const { token, fire } = makeCancellationToken();
      const resultPromise = runComparisonCommandPlan(
        { executable: 'LVCompare', args: [] },
        { execFileImpl: execFileImpl as never, cancellationToken: token as never, hostPlatform: 'linux' }
      );
      fire();
      cb?.(null, undefined, undefined);
      const result = await resultPromise;
      expect(result.cancelled).toBe(true);
      expect(result.exitCode).toBe(130);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('comparison-command cancelled by user');
    });

    it('falls back to empty output on a cancelled run whose callback reports an error (VHS-REQ-621)', async () => {
      let cb: ((error: unknown, stdout?: string, stderr?: string) => void) | undefined;
      const execFileImpl = vi.fn((_e, _a, _o, captured) => {
        cb = captured;
        return { pid: 4, kill: vi.fn() };
      });
      const { token, fire } = makeCancellationToken();
      const resultPromise = runComparisonCommandPlan(
        { executable: 'LVCompare', args: [] },
        { execFileImpl: execFileImpl as never, cancellationToken: token as never, hostPlatform: 'linux' }
      );
      fire();
      // No timeoutMs -> not a timeout; cancelled + error takes the cancelled branch
      // with the `String(stdout ?? execError.stdout ?? '')` fallbacks.
      cb?.(Object.assign(new Error('killed'), { code: 'ESRCH' }), undefined, undefined);
      const result = await resultPromise;
      expect(result.cancelled).toBe(true);
      expect(result.exitCode).toBe(130);
      expect(result.stdout).toBe('');
    });

    it('reports a timeout via the killed SIGKILL signal with undefined output (VHS-REQ-621)', async () => {
      const execError = Object.assign(new Error('killed'), { killed: true, signal: 'SIGKILL' });
      const execFileImpl = vi.fn((_e, _a, _o, cb) => {
        cb(execError, undefined, undefined);
        return { pid: 1, kill: vi.fn() };
      });
      const result = await runComparisonCommandPlan(
        { executable: 'LVCompare', args: [] },
        { execFileImpl: execFileImpl as never, timeoutMs: 2000 }
      );
      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(124);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });

    it('reports a timeout via the "timed out" message with a numeric code (VHS-REQ-621)', async () => {
      // signal is not SIGKILL, so the message regex classifies the timeout, and a
      // numeric code is echoed instead of the 124 fallback.
      const execError = Object.assign(new Error('Command failed: timed out'), {
        killed: true,
        signal: 'SIGTERM',
        code: 77
      });
      const execFileImpl = vi.fn((_e, _a, _o, cb) => {
        cb(execError, 'partial', 'warn');
        return { pid: 1, kill: vi.fn() };
      });
      const result = await runComparisonCommandPlan(
        { executable: 'LVCompare', args: [] },
        { execFileImpl: execFileImpl as never, timeoutMs: 2000 }
      );
      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(77);
    });

    it('echoes a numeric exit code with empty output when stdout/stderr are undefined (VHS-REQ-621)', async () => {
      const execError = Object.assign(new Error('nonzero'), { code: 5, signal: 'SIGTERM' });
      const execFileImpl = vi.fn((_e, _a, _o, cb) => {
        cb(execError, undefined, undefined);
        return { pid: 1, kill: vi.fn() };
      });
      const result = await runComparisonCommandPlan(
        { executable: 'LVCompare', args: [] },
        { execFileImpl: execFileImpl as never }
      );
      expect(result).toMatchObject({ exitCode: 5, stdout: '', stderr: '' });
    });
  });
});

describe('extractCommandOptionValue (VHS-REQ-621)', () => {
  it('returns the trimmed value following the option flag', () => {
    expect(extractCommandOptionValue(['-PortNumber', ' 3363 ', '-o'], '-PortNumber')).toBe('3363');
  });

  it('returns the first match when the option appears more than once', () => {
    expect(
      extractCommandOptionValue(['-VI1', 'first.vi', '-VI1', 'second.vi'], '-VI1')
    ).toBe('first.vi');
  });

  it('returns undefined when the option is missing', () => {
    expect(extractCommandOptionValue(['-o', '-c'], '-PortNumber')).toBeUndefined();
  });

  it('returns undefined when the option is the last argument (no value follows)', () => {
    expect(extractCommandOptionValue(['-o', '-PortNumber'], '-PortNumber')).toBeUndefined();
  });

  it('returns undefined when the following value is blank', () => {
    expect(extractCommandOptionValue(['-PortNumber', '   ', '-o'], '-PortNumber')).toBeUndefined();
  });

  it('returns undefined for an empty argument list', () => {
    expect(extractCommandOptionValue([], '-PortNumber')).toBeUndefined();
  });
});

describe('buildWindowsHostNativeHeadlessCommandPlan (VHS-REQ-665)', () => {
  function decode(plan: { executable: string; args: string[] } | undefined): string {
    const idx = plan?.args.indexOf('-EncodedCommand') ?? -1;
    if (!plan || idx < 0) {
      return '';
    }
    return Buffer.from(plan.args[idx + 1], 'base64').toString('utf16le');
  }

  const bareCli = {
    executable: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
    args: [
      '-LogToConsole',
      'TRUE',
      '-OperationName',
      'CreateComparisonReport',
      '-VI1',
      'C:\\stage\\left-foo.vi',
      '-VI2',
      'C:\\stage\\right-foo.vi',
      '-ReportType',
      'htmlsinglefile',
      '-ReportPath',
      'C:\\stage\\diff-report-foo.vi.html'
    ]
  };

  it('wraps the bare CLI in a local powershell -EncodedCommand headless launch script (VHS-REQ-665.1)', () => {
    const plan = buildWindowsHostNativeHeadlessCommandPlan(createReadyRecord(), bareCli, 'win32', 60);
    expect(plan?.executable).toBe('powershell.exe');
    expect(plan?.args.slice(0, 2)).toEqual(['-NoProfile', '-EncodedCommand']);

    const script = decode(plan);
    // Prelaunches the configured x86 LabVIEW headless before the CLI connects.
    expect(script).toContain('--headless');
    expect(script).toContain('LabVIEW 2026 Q1\\LabVIEW.exe');
    // Tunes the connect window to the explicit cliConnectTimeoutSeconds (60).
    expect(script).toContain("Set-IniToken -Path $cliIni -Key 'OpenAppReferenceTimeoutInSecond' -Value '60'");
    expect(script).toContain(
      "Set-IniToken -Path $cliIni -Key 'AfterLaunchOpenAppReferenceTimeoutInSecond' -Value '60'"
    );
    // Single-cycle: the CLI runs exactly once, no cold-launch retry loop.
    expect(script).not.toContain('$maxAttempts');
    expect(script).not.toContain('$isStartupConnectivity');
    expect(script).toContain('retryAttempts=1');
    // Carries a host-native provenance meta tag distinct from the container one.
    expect(script).toContain('[vi-history-suite-hostnative-meta]');
    expect(script).not.toContain('[vi-history-suite-container-meta]');
    // Runs the original bare CLI executable + args verbatim.
    expect(script).toContain('LabVIEWCLI.exe');
    expect(script).toContain('CreateComparisonReport');
  });

  it('falls back to the host-native default connect window when no timeout is given (VHS-REQ-665.2)', () => {
    const script = decode(buildWindowsHostNativeHeadlessCommandPlan(createReadyRecord(), bareCli, 'win32'));
    expect(script).toContain("Set-IniToken -Path $cliIni -Key 'OpenAppReferenceTimeoutInSecond' -Value '120'");
    expect(script).toContain('openTimeout=120;afterLaunchTimeout=120');
  });

  it('does not pin $env:TEMP (uses the ambient temp, unlike the container path) (VHS-REQ-665.2)', () => {
    const script = decode(buildWindowsHostNativeHeadlessCommandPlan(createReadyRecord(), bareCli, 'win32'));
    expect(script).not.toContain('$env:TEMP =');
  });

  it('returns undefined for a non-labview-cli engine (VHS-REQ-665.1)', () => {
    const record = createReadyRecord();
    const lvcompareRecord = {
      ...record,
      runtimeSelection: { ...record.runtimeSelection, engine: 'lvcompare' as const }
    };
    expect(
      buildWindowsHostNativeHeadlessCommandPlan(lvcompareRecord, bareCli, 'win32')
    ).toBeUndefined();
  });

  it('returns undefined when no PowerShell host resolves for the platform (VHS-REQ-665.1)', () => {
    // darwin has no PowerShell host executable, so the builder leaves the caller's
    // bare command plan unchanged instead of producing a headless wrap.
    expect(
      buildWindowsHostNativeHeadlessCommandPlan(createReadyRecord(), bareCli, 'darwin')
    ).toBeUndefined();
  });

  it('omits the prelaunch path expression when the record has no LabVIEW exe (VHS-REQ-665.2)', () => {
    const record = createReadyRecord();
    const noExeRecord = {
      ...record,
      runtimeSelection: { ...record.runtimeSelection, labviewExe: undefined }
    };
    const script = decode(buildWindowsHostNativeHeadlessCommandPlan(noExeRecord, bareCli, 'win32'));
    expect(script).toContain('$labviewPath = $null');
  });

  it('only wraps when the LV_RTE_WIN_HOSTNATIVE_HEADLESS toggle is set (VHS-REQ-665.3)', () => {
    // The exported builder is unconditional; the gating lives in
    // prepareExecutionContext, which only invokes it when processPlatform and the
    // effective runtime platform are win32 AND the opt-in env toggle equals '1'.
    // Guard the toggle contract here so the opt-in default-off posture is pinned.
    const previous = process.env.LV_RTE_WIN_HOSTNATIVE_HEADLESS;
    try {
      delete process.env.LV_RTE_WIN_HOSTNATIVE_HEADLESS;
      expect(process.env.LV_RTE_WIN_HOSTNATIVE_HEADLESS === '1').toBe(false);
      process.env.LV_RTE_WIN_HOSTNATIVE_HEADLESS = '1';
      expect(process.env.LV_RTE_WIN_HOSTNATIVE_HEADLESS === '1').toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.LV_RTE_WIN_HOSTNATIVE_HEADLESS;
      } else {
        process.env.LV_RTE_WIN_HOSTNATIVE_HEADLESS = previous;
      }
    }
  });

  it('keeps windows-container launch script output byte-identical via the shared builder (VHS-REQ-665.4)', () => {
    // The host-native path factored the launch script into a shared builder. The
    // windows-container provider must keep its exact prior output: TEMP pinned to
    // the container temp root and the container provenance meta tag.
    const containerScript = buildWindowsContainerLabviewCliScript(
      'C:\\NI\\LabVIEWCLI.exe',
      ['-OperationName', 'CreateComparisonReport', '-VI1', 'a', '-VI2', 'b'],
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      180
    );
    expect(containerScript).toContain('[vi-history-suite-container-meta]');
    expect(containerScript).not.toContain('[vi-history-suite-hostnative-meta]');
    expect(containerScript).toContain('$env:TEMP =');
    expect(containerScript).toContain('openTimeout=180;afterLaunchTimeout=180');
    expect(containerScript).toContain('--headless');
  });
});

describe('shouldWrapWindowsHostNativeHeadless gate (VHS-REQ-665.3)', () => {
  it('wraps only when processPlatform=win32, effective platform=win32, and the toggle is 1', () => {
    expect(shouldWrapWindowsHostNativeHeadless('win32', 'win32', '1')).toBe(true);
  });

  it('does not wrap when processPlatform is not win32', () => {
    expect(shouldWrapWindowsHostNativeHeadless('linux', 'win32', '1')).toBe(false);
    expect(shouldWrapWindowsHostNativeHeadless('darwin', 'win32', '1')).toBe(false);
  });

  it('does not wrap when the effective runtime platform is not win32', () => {
    expect(shouldWrapWindowsHostNativeHeadless('win32', 'linux', '1')).toBe(false);
    expect(shouldWrapWindowsHostNativeHeadless('win32', 'darwin', '1')).toBe(false);
  });

  it('does not wrap when the opt-in toggle is absent or not exactly "1"', () => {
    expect(shouldWrapWindowsHostNativeHeadless('win32', 'win32', undefined)).toBe(false);
    expect(shouldWrapWindowsHostNativeHeadless('win32', 'win32', '')).toBe(false);
    expect(shouldWrapWindowsHostNativeHeadless('win32', 'win32', '0')).toBe(false);
    expect(shouldWrapWindowsHostNativeHeadless('win32', 'win32', 'true')).toBe(false);
  });
});
// -----------------------------------------------------------------------------
// Coupled-extraction characterization (VHS-REQ-624 / VHS-REQ-156 / VHS-REQ-665):
// byte-identical locks on the command-plan and launch-script builders that are
// slated to move into sibling modules. These snapshots must stay IDENTICAL
// across the behavior-preserving extraction PRs; any diff is a real regression.
// -----------------------------------------------------------------------------
describe('coupled-extraction builder characterization (byte-identical)', () => {
  const interopLayout = {
    reportDirectory: 'C:\\interop\\reports\\r\\f',
    stagingDirectory: 'C:\\interop\\reports\\r\\f\\staging',
    leftFilePath: 'C:\\interop\\reports\\r\\f\\staging\\left-foo.vi',
    rightFilePath: 'C:\\interop\\reports\\r\\f\\staging\\right-foo.vi',
    reportFilePath: 'C:\\interop\\reports\\r\\f\\diff-report-foo.vi.html'
  };

  const linuxShortPathLayout = {
    reportDirectory: '/tmp/lvie-runtime/repoid123456/fileid123456',
    stagingDirectory: '/tmp/lvie-runtime/repoid123456/fileid123456/staging',
    leftFilePath: '/tmp/lvie-runtime/repoid123456/fileid123456/staging/left-foo.vi',
    rightFilePath: '/tmp/lvie-runtime/repoid123456/fileid123456/staging/right-foo.vi',
    reportFilePath: '/tmp/lvie-runtime/repoid123456/fileid123456/diff-report-foo.vi.html'
  };

  const labviewCliArgs = [
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
  ];

  it('buildWindowsInteropCommandPlan output is byte-identical', () => {
    expect(
      buildWindowsInteropCommandPlan(
        createReadyRecord(),
        { executable: 'C:\\NI\\LabVIEWCLI.exe', args: [...labviewCliArgs] },
        interopLayout
      )
    ).toMatchInlineSnapshot(`
      {
        "args": [
          "-OperationName",
          "CreateComparisonReport",
          "-VI1",
          "C:\\interop\\reports\\r\\f\\staging\\left-foo.vi",
          "-VI2",
          "C:\\interop\\reports\\r\\f\\staging\\right-foo.vi",
          "-ReportPath",
          "C:\\interop\\reports\\r\\f\\diff-report-foo.vi.html",
          "-LabVIEWPath",
          "C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe",
        ],
        "executable": "/mnt/c/NI/LabVIEWCLI.exe",
      }
    `);
  });

  it('buildLinuxHostNativeShortPathCommandPlan output is byte-identical', () => {
    expect(
      buildLinuxHostNativeShortPathCommandPlan(
        createReadyRecord(),
        {
          executable: '/usr/local/bin/LabVIEWCLI',
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
            '/usr/local/natinst/LabVIEW-2026-64/labview'
          ]
        },
        linuxShortPathLayout
      )
    ).toMatchInlineSnapshot(`
      {
        "args": [
          "-OperationName",
          "CreateComparisonReport",
          "-VI1",
          "/tmp/lvie-runtime/repoid123456/fileid123456/staging/left-foo.vi",
          "-VI2",
          "/tmp/lvie-runtime/repoid123456/fileid123456/staging/right-foo.vi",
          "-ReportPath",
          "/tmp/lvie-runtime/repoid123456/fileid123456/diff-report-foo.vi.html",
          "-LabVIEWPath",
          "/usr/local/natinst/LabVIEW-2026-64/labview",
        ],
        "executable": "/usr/local/bin/LabVIEWCLI",
      }
    `);
  });

  it('buildWindowsHostNativeHeadlessCommandPlan output is byte-identical', () => {
    expect(
      buildWindowsHostNativeHeadlessCommandPlan(
        createReadyRecord(),
        { executable: 'C:\\NI\\LabVIEWCLI.exe', args: [...labviewCliArgs] },
        'win32',
        60
      )
    ).toMatchInlineSnapshot(`
      {
        "args": [
          "-NoProfile",
          "-EncodedCommand",
          "JABFAHIAcgBvAHIAQQBjAHQAaQBvAG4AUAByAGUAZgBlAHIAZQBuAGMAZQAgAD0AIAAnAFMAdABvAHAAJwAKACQAUAByAG8AZwByAGUAcwBzAFAAcgBlAGYAZQByAGUAbgBjAGUAIAA9ACAAJwBTAGkAbABlAG4AdABsAHkAQwBvAG4AdABpAG4AdQBlACcACgBmAHUAbgBjAHQAaQBvAG4AIABTAGUAdAAtAEkAbgBpAFQAbwBrAGUAbgAgAHsACgAgACAAcABhAHIAYQBtACgAWwBzAHQAcgBpAG4AZwBdACQAUABhAHQAaAAsACAAWwBzAHQAcgBpAG4AZwBdACQASwBlAHkALAAgAFsAcwB0AHIAaQBuAGcAXQAkAFYAYQBsAHUAZQApAAoAIAAgAGkAZgAgACgALQBuAG8AdAAgACgAVABlAHMAdAAtAFAAYQB0AGgAIAAtAEwAaQB0AGUAcgBhAGwAUABhAHQAaAAgACQAUABhAHQAaAAgAC0AUABhAHQAaABUAHkAcABlACAATABlAGEAZgApACkAIAB7ACAAcgBlAHQAdQByAG4AIAB9AAoAIAAgACQAYwBvAG4AdABlAG4AdAAgAD0AIABHAGUAdAAtAEMAbwBuAHQAZQBuAHQAIAAtAEwAaQB0AGUAcgBhAGwAUABhAHQAaAAgACQAUABhAHQAaAAgAC0AUgBhAHcAIAAtAEUAcgByAG8AcgBBAGMAdABpAG8AbgAgAFMAaQBsAGUAbgB0AGwAeQBDAG8AbgB0AGkAbgB1AGUACgAgACAAaQBmACAAKAAkAG4AdQBsAGwAIAAtAGUAcQAgACQAYwBvAG4AdABlAG4AdAApACAAewAgACQAYwBvAG4AdABlAG4AdAAgAD0AIAAnACcAIAB9AAoAIAAgAGkAZgAgACgAJABjAG8AbgB0AGUAbgB0ACAALQBtAGEAdABjAGgAIAAoACIAKAA/AG0AKQBeAFwAcwAqAHsAMAB9AFwAcwAqAD0AIgAgAC0AZgAgAFsAcgBlAGcAZQB4AF0AOgA6AEUAcwBjAGEAcABlACgAJABLAGUAeQApACkAKQAgAHsACgAgACAAIAAgACQAdQBwAGQAYQB0AGUAZAAgAD0AIABbAHIAZQBnAGUAeABdADoAOgBSAGUAcABsAGEAYwBlACgAJABjAG8AbgB0AGUAbgB0ACwAIAAoACIAKAA/AG0AKQBeAFwAcwAqAHsAMAB9AFwAcwAqAD0ALgAqACQAIgAgAC0AZgAgAFsAcgBlAGcAZQB4AF0AOgA6AEUAcwBjAGEAcABlACgAJABLAGUAeQApACkALAAgACgAIgB7ADAAfQA9AHsAMQB9ACIAIAAtAGYAIAAkAEsAZQB5ACwAIAAkAFYAYQBsAHUAZQApACkACgAgACAAfQAgAGUAbABzAGUAIAB7AAoAIAAgACAAIAAkAHUAcABkAGEAdABlAGQAIAA9ACAAKAAkAGMAbwBuAHQAZQBuAHQALgBUAHIAaQBtAEUAbgBkACgAKQAgACsAIABbAEUAbgB2AGkAcgBvAG4AbQBlAG4AdABdADoAOgBOAGUAdwBMAGkAbgBlACAAKwAgACgAIgB7ADAAfQA9AHsAMQB9ACIAIAAtAGYAIAAkAEsAZQB5ACwAIAAkAFYAYQBsAHUAZQApACAAKwAgAFsARQBuAHYAaQByAG8AbgBtAGUAbgB0AF0AOgA6AE4AZQB3AEwAaQBuAGUAKQAKACAAIAB9AAoAIAAgAFMAZQB0AC0AQwBvAG4AdABlAG4AdAAgAC0ATABpAHQAZQByAGEAbABQAGEAdABoACAAJABQAGEAdABoACAALQBWAGEAbAB1AGUAIAAkAHUAcABkAGEAdABlAGQAIAAtAEUAbgBjAG8AZABpAG4AZwAgAHUAdABmADgACgB9AAoAJABjAGwAaQBQAGEAdABoACAAPQAgACcAQwA6AFwATgBJAFwATABhAGIAVgBJAEUAVwBDAEwASQAuAGUAeABlACcACgAkAGwAYQBiAHYAaQBlAHcAUABhAHQAaAAgAD0AIAAnAEMAOgBcAFAAcgBvAGcAcgBhAG0AIABGAGkAbABlAHMAIAAoAHgAOAA2ACkAXABOAGEAdABpAG8AbgBhAGwAIABJAG4AcwB0AHIAdQBtAGUAbgB0AHMAXABMAGEAYgBWAEkARQBXACAAMgAwADIANgAgAFEAMQBcAEwAYQBiAFYASQBFAFcALgBlAHgAZQAnAAoAJABhAHIAZwBzACAAPQAgAEAAKAAnAC0ATwBwAGUAcgBhAHQAaQBvAG4ATgBhAG0AZQAnACwAIAAnAEMAcgBlAGEAdABlAEMAbwBtAHAAYQByAGkAcwBvAG4AUgBlAHAAbwByAHQAJwAsACAAJwAtAFYASQAxACcALAAgACcALwBoAG8AcwB0AC8AcwB0AGEAZwBpAG4AZwAvAGwAZQBmAHQALQBmAG8AbwAuAHYAaQAnACwAIAAnAC0AVgBJADIAJwAsACAAJwAvAGgAbwBzAHQALwBzAHQAYQBnAGkAbgBnAC8AcgBpAGcAaAB0AC0AZgBvAG8ALgB2AGkAJwAsACAAJwAtAFIAZQBwAG8AcgB0AFAAYQB0AGgAJwAsACAAJwAvAGgAbwBzAHQALwBkAGkAZgBmAC0AcgBlAHAAbwByAHQALQBmAG8AbwAuAHYAaQAuAGgAdABtAGwAJwAsACAAJwAtAEwAYQBiAFYASQBFAFcAUABhAHQAaAAnACwAIAAnAEMAOgBcAFAAcgBvAGcAcgBhAG0AIABGAGkAbABlAHMAXABOAGEAdABpAG8AbgBhAGwAIABJAG4AcwB0AHIAdQBtAGUAbgB0AHMAXABMAGEAYgBWAEkARQBXACAAMgAwADIANgBcAEwAYQBiAFYASQBFAFcALgBlAHgAZQAnACkACgAkAGMAbABpAEkAbgBpAEMAYQBuAGQAaQBkAGEAdABlAHMAIAA9ACAAQAAoACcAQwA6AFwAUAByAG8AZwByAGEAbQBEAGEAdABhAFwATgBhAHQAaQBvAG4AYQBsACAASQBuAHMAdAByAHUAbQBlAG4AdABzAFwATABhAGIAVgBJAEUAVwAgAEMATABJAFwATABhAGIAVgBJAEUAVwBDAEwASQAuAGkAbgBpACcALAAgACcAQwA6AFwAUAByAG8AZwByAGEAbQBEAGEAdABhAFwATgBhAHQAaQBvAG4AYQBsACAASQBuAHMAdAByAHUAbQBlAG4AdABzAFwATABhAGIAVgBJAEUAVwBDAEwASQBcAEwAYQBiAFYASQBFAFcAQwBMAEkALgBpAG4AaQAnACwAIAAnAEMAOgBcAFAAcgBvAGcAcgBhAG0AIABGAGkAbABlAHMAXABOAGEAdABpAG8AbgBhAGwAIABJAG4AcwB0AHIAdQBtAGUAbgB0AHMAXABTAGgAYQByAGUAZABcAEwAYQBiAFYASQBFAFcAIABDAEwASQBcAEwAYQBiAFYASQBFAFcAQwBMAEkALgBpAG4AaQAnACwAIAAnAEMAOgBcAFAAcgBvAGcAcgBhAG0AIABGAGkAbABlAHMAIAAoAHgAOAA2ACkAXABOAGEAdABpAG8AbgBhAGwAIABJAG4AcwB0AHIAdQBtAGUAbgB0AHMAXABTAGgAYQByAGUAZABcAEwAYQBiAFYASQBFAFcAIABDAEwASQBcAEwAYQBiAFYASQBFAFcAQwBMAEkALgBpAG4AaQAnACkACgAkAGMAbABpAEkAbgBpACAAPQAgACQAYwBsAGkASQBuAGkAQwBhAG4AZABpAGQAYQB0AGUAcwAgAHwAIABXAGgAZQByAGUALQBPAGIAagBlAGMAdAAgAHsAIABUAGUAcwB0AC0AUABhAHQAaAAgAC0ATABpAHQAZQByAGEAbABQAGEAdABoACAAJABfACAAfQAgAHwAIABTAGUAbABlAGMAdAAtAE8AYgBqAGUAYwB0ACAALQBGAGkAcgBzAHQAIAAxAAoAaQBmACAAKAAkAGMAbABpAEkAbgBpACkAIAB7AAoAIAAgAFMAZQB0AC0ASQBuAGkAVABvAGsAZQBuACAALQBQAGEAdABoACAAJABjAGwAaQBJAG4AaQAgAC0ASwBlAHkAIAAnAE8AcABlAG4AQQBwAHAAUgBlAGYAZQByAGUAbgBjAGUAVABpAG0AZQBvAHUAdABJAG4AUwBlAGMAbwBuAGQAJwAgAC0AVgBhAGwAdQBlACAAJwA2ADAAJwAKACAAIABTAGUAdAAtAEkAbgBpAFQAbwBrAGUAbgAgAC0AUABhAHQAaAAgACQAYwBsAGkASQBuAGkAIAAtAEsAZQB5ACAAJwBBAGYAdABlAHIATABhAHUAbgBjAGgATwBwAGUAbgBBAHAAcABSAGUAZgBlAHIAZQBuAGMAZQBUAGkAbQBlAG8AdQB0AEkAbgBTAGUAYwBvAG4AZAAnACAALQBWAGEAbAB1AGUAIAAnADYAMAAnAAoAfQAKACQAcAByAGUAbABhAHUAbgBjAGgAQQB0AHQAZQBtAHAAdABlAGQAIAA9ACAAJABmAGEAbABzAGUACgBpAGYAIAAoAC0AbgBvAHQAIABbAHMAdAByAGkAbgBnAF0AOgA6AEkAcwBOAHUAbABsAE8AcgBXAGgAaQB0AGUAUwBwAGEAYwBlACgAWwBzAHQAcgBpAG4AZwBdACQAbABhAGIAdgBpAGUAdwBQAGEAdABoACkAIAAtAGEAbgBkACAAKABUAGUAcwB0AC0AUABhAHQAaAAgAC0ATABpAHQAZQByAGEAbABQAGEAdABoACAAJABsAGEAYgB2AGkAZQB3AFAAYQB0AGgAKQApACAAewAKACAAIAAkAHAAcgBlAGwAYQB1AG4AYwBoAEEAdAB0AGUAbQBwAHQAZQBkACAAPQAgACQAdAByAHUAZQAKACAAIABTAHQAYQByAHQALQBQAHIAbwBjAGUAcwBzACAALQBGAGkAbABlAFAAYQB0AGgAIAAkAGwAYQBiAHYAaQBlAHcAUABhAHQAaAAgAC0AQQByAGcAdQBtAGUAbgB0AEwAaQBzAHQAIAAnAC0ALQBoAGUAYQBkAGwAZQBzAHMAJwAgAC0AVwBpAG4AZABvAHcAUwB0AHkAbABlACAASABpAGQAZABlAG4AIAB8ACAATwB1AHQALQBOAHUAbABsAAoAIAAgAFMAdABhAHIAdAAtAFMAbABlAGUAcAAgAC0AUwBlAGMAbwBuAGQAcwAgADIANQAKAH0ACgAkAGwAYQBzAHQARQB4AGkAdAAgAD0AIAAxAAoAJABsAGEAcwB0AE8AdQB0AHAAdQB0AFQAZQB4AHQAIAA9ACAAJwAnAAoAJABwAHIAZQB2AGkAbwB1AHMARQByAHIAbwByAEEAYwB0AGkAbwBuAFAAcgBlAGYAZQByAGUAbgBjAGUAIAA9ACAAJABFAHIAcgBvAHIAQQBjAHQAaQBvAG4AUAByAGUAZgBlAHIAZQBuAGMAZQAKACQARQByAHIAbwByAEEAYwB0AGkAbwBuAFAAcgBlAGYAZQByAGUAbgBjAGUAIAA9ACAAJwBDAG8AbgB0AGkAbgB1AGUAJwAKAHQAcgB5ACAAewAKACAAIAAkAG8AdQB0AHAAdQB0ACAAPQAgAEAAKAAmACAAJABjAGwAaQBQAGEAdABoACAAQABhAHIAZwBzACAAMgA+ACYAMQApAAoAIAAgACQAbABhAHMAdABFAHgAaQB0ACAAPQAgAFsAaQBuAHQAXQAkAEwAQQBTAFQARQBYAEkAVABDAE8ARABFAAoAfQAgAGYAaQBuAGEAbABsAHkAIAB7AAoAIAAgACQARQByAHIAbwByAEEAYwB0AGkAbwBuAFAAcgBlAGYAZQByAGUAbgBjAGUAIAA9ACAAJABwAHIAZQB2AGkAbwB1AHMARQByAHIAbwByAEEAYwB0AGkAbwBuAFAAcgBlAGYAZQByAGUAbgBjAGUACgB9AAoAJABvAHUAdABwAHUAdAAgAHwAIABGAG8AcgBFAGEAYwBoAC0ATwBiAGoAZQBjAHQAIAB7ACAAaQBmACAAKAAtAG4AbwB0ACAAWwBzAHQAcgBpAG4AZwBdADoAOgBJAHMATgB1AGwAbABPAHIAVwBoAGkAdABlAFMAcABhAGMAZQAoAFsAcwB0AHIAaQBuAGcAXQAkAF8AKQApACAAewAgAFcAcgBpAHQAZQAtAE8AdQB0AHAAdQB0ACAAJABfACAAfQAgAH0ACgAkAGwAYQBzAHQATwB1AHQAcAB1AHQAVABlAHgAdAAgAD0AIABAACgAJABvAHUAdABwAHUAdAAgAHwAIABGAG8AcgBFAGEAYwBoAC0ATwBiAGoAZQBjAHQAIAB7ACAAWwBzAHQAcgBpAG4AZwBdACQAXwAgAH0AKQAgAC0AagBvAGkAbgAgAFsARQBuAHYAaQByAG8AbgBtAGUAbgB0AF0AOgA6AE4AZQB3AEwAaQBuAGUACgAkAGMAbwBuAG4AZQBjAHQAZQBkAFAAbwByAHQAIAA9ACAAJwAnAAoAaQBmACAAKAAkAGwAYQBzAHQATwB1AHQAcAB1AHQAVABlAHgAdAAgAC0AbQBhAHQAYwBoACAAJwBDAG8AbgBuAGUAYwB0AGkAbwBuACAAZQBzAHQAYQBiAGwAaQBzAGgAZQBkACAAdwBpAHQAaAAgAEwAYQBiAFYASQBFAFcAIABhAHQAIABwAG8AcgB0ACAAbgB1AG0AYgBlAHIAIAAoAFsAMAAtADkAXQArACkAXAAuACcAKQAgAHsACgAgACAAJABjAG8AbgBuAGUAYwB0AGUAZABQAG8AcgB0ACAAPQAgACQATQBhAHQAYwBoAGUAcwBbADEAXQAKAH0ACgBXAHIAaQB0AGUALQBPAHUAdABwAHUAdAAgACgAJwBbAHYAaQAtAGgAaQBzAHQAbwByAHkALQBzAHUAaQB0AGUALQBoAG8AcwB0AG4AYQB0AGkAdgBlAC0AbQBlAHQAYQBdAHIAZQB0AHIAeQBBAHQAdABlAG0AcAB0AHMAPQAxADsAcAByAGUAbABhAHUAbgBjAGgAQQB0AHQAZQBtAHAAdABlAGQAPQB7ADAAfQA7AGkAbgBpAFAAYQB0AGgAPQB7ADEAfQA7AGMAbwBuAG4AZQBjAHQAZQBkAFAAbwByAHQAPQB7ADIAfQA7AG8AcABlAG4AVABpAG0AZQBvAHUAdAA9ADEAMgAwADsAYQBmAHQAZQByAEwAYQB1AG4AYwBoAFQAaQBtAGUAbwB1AHQAPQAxADIAMAAnACAALQBmACAAKAAkACgAaQBmACAAKAAkAHAAcgBlAGwAYQB1AG4AYwBoAEEAdAB0AGUAbQBwAHQAZQBkACkAIAB7ACAAMQAgAH0AIABlAGwAcwBlACAAewAgADAAIAB9ACkAKQAsACAAJABjAGwAaQBJAG4AaQAsACAAJABjAG8AbgBuAGUAYwB0AGUAZABQAG8AcgB0ACkACgBlAHgAaQB0ACAAJABsAGEAcwB0AEUAeABpAHQA",
        ],
        "executable": "powershell.exe",
      }
    `);
  });

  it('buildWindowsContainerLabviewCliScript output is byte-identical', () => {
    expect(
      buildWindowsContainerLabviewCliScript(
        'C:\\NI\\LabVIEWCLI.exe',
        ['-OperationName', 'CreateComparisonReport', '-VI1', 'a', '-VI2', 'b'],
        'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
        180
      )
    ).toMatchInlineSnapshot(`
      "$ErrorActionPreference = 'Stop'
      $ProgressPreference = 'SilentlyContinue'
      function Set-IniToken {
        param([string]$Path, [string]$Key, [string]$Value)
        if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
        $content = Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue
        if ($null -eq $content) { $content = '' }
        if ($content -match ("(?m)^\\s*{0}\\s*=" -f [regex]::Escape($Key))) {
          $updated = [regex]::Replace($content, ("(?m)^\\s*{0}\\s*=.*$" -f [regex]::Escape($Key)), ("{0}={1}" -f $Key, $Value))
        } else {
          $updated = ($content.TrimEnd() + [Environment]::NewLine + ("{0}={1}" -f $Key, $Value) + [Environment]::NewLine)
        }
        Set-Content -LiteralPath $Path -Value $updated -Encoding utf8
      }
      $env:TEMP = 'C:\\vi-history-suite\\container-temp'
      $env:TMP = $env:TEMP
      $cliPath = 'C:\\NI\\LabVIEWCLI.exe'
      $labviewPath = 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
      $args = @('-OperationName', 'CreateComparisonReport', '-VI1', 'a', '-VI2', 'b')
      $cliIniCandidates = @('C:\\ProgramData\\National Instruments\\LabVIEW CLI\\LabVIEWCLI.ini', 'C:\\ProgramData\\National Instruments\\LabVIEWCLI\\LabVIEWCLI.ini', 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.ini', 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.ini')
      $cliIni = $cliIniCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
      if ($cliIni) {
        Set-IniToken -Path $cliIni -Key 'OpenAppReferenceTimeoutInSecond' -Value '180'
        Set-IniToken -Path $cliIni -Key 'AfterLaunchOpenAppReferenceTimeoutInSecond' -Value '180'
      }
      $prelaunchAttempted = $false
      if (-not [string]::IsNullOrWhiteSpace([string]$labviewPath) -and (Test-Path -LiteralPath $labviewPath)) {
        $prelaunchAttempted = $true
        Start-Process -FilePath $labviewPath -ArgumentList '--headless' -WindowStyle Hidden | Out-Null
        Start-Sleep -Seconds 8
      }
      $lastExit = 1
      $lastOutputText = ''
      $previousErrorActionPreference = $ErrorActionPreference
      $ErrorActionPreference = 'Continue'
      try {
        $output = @(& $cliPath @args 2>&1)
        $lastExit = [int]$LASTEXITCODE
      } finally {
        $ErrorActionPreference = $previousErrorActionPreference
      }
      $output | ForEach-Object { if (-not [string]::IsNullOrWhiteSpace([string]$_)) { Write-Output $_ } }
      $lastOutputText = @($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
      $connectedPort = ''
      if ($lastOutputText -match 'Connection established with LabVIEW at port number ([0-9]+)\\.') {
        $connectedPort = $Matches[1]
      }
      Write-Output ('[vi-history-suite-container-meta]retryAttempts=1;prelaunchAttempted={0};iniPath={1};connectedPort={2};openTimeout=180;afterLaunchTimeout=180' -f ($(if ($prelaunchAttempted) { 1 } else { 0 })), $cliIni, $connectedPort)
      exit $lastExit"
    `);
  });

  it('buildLinuxContainerLabviewCliScript output is byte-identical', () => {
    expect(
      buildLinuxContainerLabviewCliScript(
        'labviewcli',
        ['-OperationName', 'CreateComparisonReport', '-VI1', 'a', '-VI2', 'b'],
        'cli-headless',
        {
          labviewExecutablePath: '/usr/local/natinst/LabVIEW-2026-64/labview',
          connectTimeoutSeconds: 120
        }
      )
    ).toMatchInlineSnapshot(`
      "set -euo pipefail
      mkdir -p '/workspace/container-temp' /tmp/natinst
      printf '1\\n' > '/tmp/natinst/LVContainer.txt'
      export TEMP='/workspace/container-temp'
      export TMP='/workspace/container-temp'
      export TMPDIR='/workspace/container-temp'
      cli_path='labviewcli'
      args=('-OperationName' 'CreateComparisonReport' '-VI1' 'a' '-VI2' 'b')
      lv_exe='/usr/local/natinst/LabVIEW-2026-64/labview'
      open_app_timeout=120
      after_launch_timeout=120
      err_file='/workspace/container-temp/vihs-cli-stderr.txt'
      set_conf_key() {
        conf_file="$1"; conf_key="$2"; conf_value="$3"
        mkdir -p "$(dirname "$conf_file")" 2>/dev/null || return 0
        if [ -f "$conf_file" ] && grep -qE "^[[:space:]]*\${conf_key}=" "$conf_file" 2>/dev/null; then
          sed -i -E "s|^[[:space:]]*\${conf_key}=.*|\${conf_key}=\${conf_value}|" "$conf_file" 2>/dev/null || true
        else
          printf "%s=%s\\n" "$conf_key" "$conf_value" >> "$conf_file" 2>/dev/null || true
        fi
      }
      harden_conf() {
        lv_dir="$(dirname "$lv_exe")"
        lv_base="$(basename "$lv_dir")"
        lv_year="$(printf "%s" "$lv_base" | sed -E "s/^LabVIEW-([0-9]+).*/\\1/")"
        [ -n "$lv_year" ] || return 0
        conf_dir="\${HOME:-/root}/natinst/.config/LabVIEW-\${lv_year}"
        exe_base="$(basename "$lv_exe")"
        for conf in "\${conf_dir}/\${exe_base}.conf" "\${conf_dir}/labview.conf"; do
          set_conf_key "$conf" "server.tcp.enabled" "True"
          set_conf_key "$conf" "unattended" "True"
          set_conf_key "$conf" "OpenAppReferenceTimeoutInSecond" "$open_app_timeout"
          set_conf_key "$conf" "AfterLaunchOpenAppReferenceTimeoutInSecond" "$after_launch_timeout"
        done
      }
      harden_conf || true
      set +e
      "$cli_path" "\${args[@]}" 2>"$err_file"
      rc=$?
      set -e
      cat "$err_file" >&2 2>/dev/null || true
      printf '[vi-history-suite-container-meta]retryAttempts=1;openTimeout=%s;afterLaunchTimeout=%s\\n' "$open_app_timeout" "$after_launch_timeout"
      exit $rc"
    `);
  });
});

describe('staged-VI preview pipeline in host-native execution (VHS-REQ-699)', () => {
  function baseStagedPreviewDeps(
    record: ComparisonReportPacketRecord,
    overrides: Record<string, unknown> = {}
  ) {
    return {
      readRevisionBlob: vi.fn().mockResolvedValue(Buffer.from('content')),
      materializeSelectedRevisionTree: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined) as never,
      copyFile: vi.fn().mockResolvedValue(undefined) as never,
      copyDirectory: vi.fn().mockResolvedValue(undefined) as never,
      removePath: vi.fn().mockResolvedValue(undefined) as never,
      unlinkFile: vi.fn().mockResolvedValue(undefined) as never,
      chmod: vi.fn().mockResolvedValue(undefined) as never,
      readdir: vi.fn().mockResolvedValue([]) as never,
      readFile: vi.fn().mockResolvedValue('') as never,
      runCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: 'CreateComparisonReport operation succeeded.\n',
        stderr: ''
      }),
      nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
      nowMs: vi.fn().mockReturnValue(1000),
      writePacketRecord: vi.fn().mockResolvedValue(undefined),
      observeWindowsProcesses: vi.fn().mockResolvedValue(undefined),
      observeWindowsTcpListeners: vi.fn().mockResolvedValue([]),
      enforceWindowsHostPreflight: false,
      disableDiagnostics: true,
      processPlatform: 'win32' as NodeJS.Platform,
      ...overrides
    };
  }

  it('runs the comparison after both staged previews validate, attaching pipeline cycles', async () => {
    const record = createReadyRecord();
    const staged = record.stagedRevisionPlan;
    // Both staged inputs present -> STAGING reports already-staged and both
    // previews render, so VALIDATION admits and the COMPARISON cycle runs.
    // metadata present but report absent -> a failed comparison whose unstage
    // still removes the staged files and retains the metadata.
    const pathExists = vi.fn(async (filePath: string) =>
      filePath === staged.leftFilePath ||
      filePath === staged.rightFilePath ||
      filePath === record.artifactPlan.metadataFilePath
    );
    const renderStagedViPreview = vi.fn(async () => ({ rendered: true, html: '<html>ok</html>' }));

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      baseStagedPreviewDeps(record, { pathExists, renderStagedViPreview })
    );

    expect(renderStagedViPreview).toHaveBeenCalledTimes(2);
    expect(result.record.runtimeExecution.attempted).toBe(true);
    expect(Array.isArray(result.record.runtimeExecution.pipelineCycles)).toBe(true);
  });

  it('short-circuits the comparison when the left staged preview fails validation', async () => {
    const record = createReadyRecord();
    const staged = record.stagedRevisionPlan;
    const pathExists = vi.fn(
      async (filePath: string) =>
        filePath === staged.leftFilePath || filePath === staged.rightFilePath
    );
    const renderStagedViPreview = vi.fn(async ({ side }: { side: 'left' | 'right' }) =>
      side === 'left'
        ? { rendered: false, failureReason: 'left-preview-load-failed' }
        : { rendered: true }
    );
    const runCommand = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      baseStagedPreviewDeps(record, { pathExists, renderStagedViPreview, runCommand })
    );

    expect(runCommand).not.toHaveBeenCalled();
    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.attempted).toBe(false);
    expect(result.record.runtimeExecution.failureReason).toBe('staged-vi-preview-validation-failed');
    expect(result.record.runtimeExecution.diagnosticNotes?.[0]).toContain('left');
    expect(Array.isArray(result.record.runtimeExecution.pipelineCycles)).toBe(true);
  });

  it('short-circuits the comparison when the right staged preview fails validation', async () => {
    const record = createReadyRecord();
    const staged = record.stagedRevisionPlan;
    const pathExists = vi.fn(
      async (filePath: string) =>
        filePath === staged.leftFilePath || filePath === staged.rightFilePath
    );
    const renderStagedViPreview = vi.fn(async ({ side }: { side: 'left' | 'right' }) =>
      side === 'right'
        ? { rendered: false, failureReason: 'right-preview-load-failed' }
        : { rendered: true }
    );
    const runCommand = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      baseStagedPreviewDeps(record, { pathExists, renderStagedViPreview, runCommand })
    );

    expect(runCommand).not.toHaveBeenCalled();
    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.diagnosticNotes?.[0]).toContain('right');
  });

  it('fails closed before any preview when a staged input is missing', async () => {
    const record = createReadyRecord();
    const staged = record.stagedRevisionPlan;
    // Left staged input absent at pipeline STAGING -> previews skipped, comparison rejected.
    const pathExists = vi.fn(async (filePath: string) => filePath === staged.rightFilePath);
    const renderStagedViPreview = vi.fn(async () => ({ rendered: true }));

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      baseStagedPreviewDeps(record, { pathExists, renderStagedViPreview })
    );

    expect(renderStagedViPreview).not.toHaveBeenCalled();
    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.attempted).toBe(false);
    expect(result.record.runtimeExecution.diagnosticNotes?.[0]).toContain('not available');
  });

  it('fails closed when the right staged input is missing at pipeline staging', async () => {
    const record = createReadyRecord();
    const staged = record.stagedRevisionPlan;
    // Only the left staged input is present -> STAGING reports the right side missing.
    const pathExists = vi.fn(async (filePath: string) => filePath === staged.leftFilePath);
    const renderStagedViPreview = vi.fn(async () => ({ rendered: true }));

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      baseStagedPreviewDeps(record, { pathExists, renderStagedViPreview })
    );

    expect(renderStagedViPreview).not.toHaveBeenCalled();
    expect(result.record.runtimeExecution.state).toBe('failed');
    expect(result.record.runtimeExecution.attempted).toBe(false);
  });

  it('completes and retains the report when both previews validate and the report is generated', async () => {
    const record = createReadyRecord();
    const staged = record.stagedRevisionPlan;
    // Everything present: staged pair, generated report, and metadata -> the
    // comparison succeeds (exit 0, report exists) and unstaging removes the staged
    // files while retaining the report + metadata.
    const pathExists = vi.fn(async () => true);
    const renderStagedViPreview = vi.fn(async () => ({ rendered: true, html: '<html>ok</html>' }));
    const removePath = vi.fn().mockResolvedValue(undefined);

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      baseStagedPreviewDeps(record, { pathExists, renderStagedViPreview, removePath })
    );

    expect(result.record.runtimeExecution.state).toBe('succeeded');
    expect(result.record.runtimeExecution.reportExists).toBe(true);
    expect(Array.isArray(result.record.runtimeExecution.pipelineCycles)).toBe(true);
    expect(removePath).toHaveBeenCalledWith(staged.leftFilePath, { recursive: true, force: true });
  });

  it('quiesces stray runtime processes before the comparison, ignoring non-integer pids', async () => {
    const record = createReadyRecord();
    // A LabVIEW.exe with a non-integer pid is filtered out before termination, and
    // a non-LabVIEW process is filtered out by name; neither triggers a kill, so no
    // real process tree is touched.
    const observeWindowsProcesses = vi.fn().mockResolvedValue({
      observedProcesses: [
        { imageName: 'LabVIEW.exe', pid: Number.NaN },
        { imageName: 'chrome.exe', pid: 5 }
      ]
    });
    const pathExists = vi.fn(async () => true);
    const renderStagedViPreview = vi.fn(async () => ({ rendered: true }));

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      baseStagedPreviewDeps(record, { pathExists, renderStagedViPreview, observeWindowsProcesses })
    );

    expect(observeWindowsProcesses).toHaveBeenCalled();
    expect(result.record.runtimeExecution.state).toBe('succeeded');
  });

  it('records a partial unstage when removing a staged input fails', async () => {
    const record = createReadyRecord();
    const staged = record.stagedRevisionPlan;
    const pathExists = vi.fn(async () => true);
    const renderStagedViPreview = vi.fn(async () => ({ rendered: true }));
    // Removing the left staged file fails while the right succeeds -> the unstage
    // boundary records a partial cleanup without failing the succeeded comparison.
    const removePath = vi.fn(async (target: string) => {
      if (target === staged.leftFilePath) {
        throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      }
      return undefined;
    });

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      baseStagedPreviewDeps(record, { pathExists, renderStagedViPreview, removePath })
    );

    expect(result.record.runtimeExecution.state).toBe('succeeded');
    expect(removePath).toHaveBeenCalledWith(staged.leftFilePath, { recursive: true, force: true });
  });
});

describe('runComparisonCommandPlan / clock / fs primitives (VHS-REQ-621)', () => {
  function makeCancellationToken() {
    const listeners: Array<() => void> = [];
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: (listener: () => void) => {
        listeners.push(listener);
        return { dispose: vi.fn() };
      }
    };
    return { token, fire: () => listeners.forEach((listener) => listener()) };
  }

  it('resolves exit code 130 when cancelled and the callback later reports an error', async () => {
    let capturedCallback:
      | ((error: unknown, stdout: string, stderr: string) => void)
      | undefined;
    const execFileImpl = vi.fn((_exe, _args, _opts, cb) => {
      capturedCallback = cb;
      return { pid: 9, kill: vi.fn() };
    });
    const { token, fire } = makeCancellationToken();
    const resultPromise = runComparisonCommandPlan(
      { executable: 'LVCompare', args: [] },
      { execFileImpl: execFileImpl as never, cancellationToken: token as never, hostPlatform: 'linux' }
    );
    fire();
    capturedCallback?.(
      Object.assign(new Error('killed after cancel'), { code: 'ESRCH', signal: 'SIGTERM' }),
      'out',
      'err'
    );
    const result = await resultPromise;
    expect(result.cancelled).toBe(true);
    expect(result.exitCode).toBe(130);
    expect(result.signal).toBe('SIGTERM');
  });

  it('maps a timeout carrying a numeric code and signal to the reported exit code', async () => {
    const execError = Object.assign(new Error('Command failed'), {
      killed: true,
      signal: 'SIGKILL',
      code: 137
    });
    const execFileImpl = vi.fn((_exe, _args, _opts, cb) => {
      cb(execError, 'o', 'e');
      return { pid: 1, kill: vi.fn() };
    });
    const result = await runComparisonCommandPlan(
      { executable: 'LVCompare', args: [] },
      { execFileImpl: execFileImpl as never, timeoutMs: 500 }
    );
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(137);
    expect(result.signal).toBe('SIGKILL');
  });

  it('treats a killed process whose message says "timed out" (non-SIGKILL) as a timeout', async () => {
    const execError = Object.assign(new Error('Command failed: timed out after 500ms'), {
      killed: true,
      signal: 'SIGTERM'
    });
    const execFileImpl = vi.fn((_exe, _args, _opts, cb) => {
      cb(execError, '', '');
      return { pid: 1, kill: vi.fn() };
    });
    const result = await runComparisonCommandPlan(
      { executable: 'LVCompare', args: [] },
      { execFileImpl: execFileImpl as never, timeoutMs: 500 }
    );
    expect(result.timedOut).toBe(true);
  });

  it('reports filesystem presence for real paths (pathExistsForReport)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-path-exists-'));
    const file = path.join(dir, 'present.txt');
    try {
      await fs.writeFile(file, 'x', 'utf8');
      expect(await pathExistsForReport(file)).toBe(true);
      expect(await pathExistsForReport(path.join(dir, 'absent.txt'))).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('exposes default clock primitives (defaultNowMs / defaultNowIso)', () => {
    expect(typeof defaultNowMs()).toBe('number');
    expect(defaultNowMs()).toBeGreaterThan(0);
    expect(typeof defaultNowIso()).toBe('string');
    expect(defaultNowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('linux-container CLI arg rewrite direct branches (VHS-REQ-624, VHS-REQ-657)', () => {
  it('rewrites lowercase flags, drops -LabVIEWPath/-c, consumes a -Headless value, and honors a non-headless profile', () => {
    const rewritten = rewriteLabviewCliArgsForLinuxContainerWorkspace(
      [
        '-vi1',
        'orig-left.vi',
        '-vi2',
        'orig-right.vi',
        '-reportPath',
        'orig.html',
        '-LabVIEWPath',
        'C:/orig/LabVIEW',
        '-Headless',
        'true',
        '-c',
        '-Keep'
      ],
      {
        containerWorkspaceRoot: '/workspace',
        leftFilename: 'L.vi',
        rightFilename: 'R.vi',
        reportFilename: 'report.html',
        containerLabviewPath: '/opt/labview/labviewprofull',
        headlessMode: 'enable-cicd-env'
      }
    );
    expect(rewritten).toContain('/workspace/staging/L.vi');
    expect(rewritten).toContain('/workspace/staging/R.vi');
    expect(rewritten).toContain('/workspace/report.html');
    expect(rewritten).toContain('-Keep');
    // The passed -LabVIEWPath value is dropped in favor of the container path.
    expect(rewritten).toContain('/opt/labview/labviewprofull');
    expect(rewritten).not.toContain('C:/orig/LabVIEW');
    // The -Headless value 'true' is consumed (not re-emitted).
    expect(rewritten).not.toContain('true');
    // The enable-cicd-env profile does NOT append -Headless.
    expect(rewritten).not.toContain('-Headless');
  });

  it('leaves a dash flag after -Headless unconsumed, defaults the container LabVIEW path, and appends -Headless for cli-headless', () => {
    const rewritten = rewriteLabviewCliArgsForLinuxContainerWorkspace(
      ['-VI1', 'orig-left.vi', '-Headless', '-VI2', 'orig-right.vi'],
      {
        containerWorkspaceRoot: '/workspace',
        leftFilename: 'L.vi',
        rightFilename: 'R.vi',
        reportFilename: 'report.html'
      }
    );
    // -Headless followed by the '-VI2' flag: the flag is still processed as a VI arg.
    expect(rewritten).toContain('/workspace/staging/R.vi');
    // The default container LabVIEW executable is appended when no override is supplied.
    expect(rewritten).toContain('-LabVIEWPath');
    // The default (cli-headless) profile appends -Headless.
    expect(rewritten).toContain('-Headless');
  });
});

describe('windows-container command plan relative-directory staging (VHS-REQ-624)', () => {
  it('prefixes staged VI filenames with the materialized relative directory', () => {
    const record = createWindowsContainerReadyRecord();
    record.runtimeSelection.engine = 'lvcompare';
    const plan = buildWindowsContainerCommandPlan(
      record,
      { executable: 'LVCompare.exe', args: ['left.vi', 'right.vi', '-nobdcosm'] },
      {
        hostReportDirectory: 'C:\\host\\reports\\r\\f',
        hostTempDirectory: 'C:\\host\\reports\\r\\f\\container-temp',
        containerWorkspaceRoot: 'C:\\workspace',
        containerImage: 'nationalinstruments/labview:2026q1-windows',
        processPlatform: 'win32',
        relativeDirectory: '/Source/SubVIs/'
      }
    );
    expect(plan?.executable).toBe('powershell.exe');
    expect(plan?.args).toContain('-EncodedCommand');
  });
});

describe('runComparisonCommandPlanWithObservation cli-log-banner trigger (VHS-REQ-621)', () => {
  it('starts a cli-log-banner observation when the LabVIEWCLI diagnostic banner appears on stdout', async () => {
    const stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn(), destroy: vi.fn() });
    const stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn(), destroy: vi.fn() });
    const child = Object.assign(new EventEmitter(), { stdout, stderr, pid: 8080, kill: vi.fn() });
    const bannerObservation = { observedProcessNames: ['LabVIEW.exe'], trigger: 'cli-log-banner' };
    const exitObservation = { observedProcessNames: [], trigger: 'process-exit' };
    const observeWindowsProcesses = vi
      .fn()
      .mockResolvedValueOnce(bannerObservation)
      .mockResolvedValueOnce(exitObservation);

    const resultPromise = runComparisonCommandPlanWithObservation(
      { executable: 'LabVIEWCLI', args: ['-OperationName', 'CreateComparisonReport'] },
      {
        spawnImpl: (() => child) as never,
        hostPlatform: 'win32',
        runtimePlatform: 'win32',
        // labview-cli does NOT observe on spawn; the banner on stdout is what starts it.
        engine: 'labview-cli',
        observeWindowsProcesses: observeWindowsProcesses as never
      }
    );

    child.emit('spawn');
    stdout.emit('data', 'LabVIEWCLI started logging in file: C:\\Temp\\LabVIEWCLI.log\r\n');
    child.emit('exit', 0, null);

    const result = await resultPromise;
    expect(observeWindowsProcesses.mock.calls[0][0].trigger).toBe('cli-log-banner');
    expect(result.processObservation).toBe(bannerObservation);
    expect(result.exitProcessObservation).toBe(exitObservation);
  });
});

describe('executeComparisonReport default dependency evaluation on the blocked path (VHS-REQ-621)', () => {
  it('evaluates the default fs/runtime/clock dependencies without injection on a blocked plan', async () => {
    // A blocked plan short-circuits before any spawn/fs work, so calling with only
    // disableDiagnostics + a no-op packet writer lets every other `deps.X ?? default`
    // fall through to its production default (fs.mkdir, pathExists, process.platform,
    // buildDefaultRunCommand, defaultNowIso/defaultNowMs, ...) without touching the
    // real filesystem or launching a process.
    const record = createReadyRecord();
    record.runtimeSelection.provider = 'unavailable';
    record.runtimeSelection.blockedReason = 'labview-exe-not-found';
    record.reportStatus = 'blocked-runtime';

    const writePacketRecord = vi.fn().mockResolvedValue(undefined);
    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      { disableDiagnostics: true, writePacketRecord }
    );

    expect(result.record.runtimeExecution.state).toBe('not-available');
    expect(result.record.runtimeExecution.attempted).toBe(false);
    expect(result.record.runtimeExecution.reportExists).toBe(false);
    // The blocked path still finalizes the packet exactly once.
    expect(writePacketRecord).toHaveBeenCalledTimes(1);
  });

  it('finalizes a blocked packet through the default packet writer with injected fs no-ops', async () => {
    const record = createReadyRecord();
    record.runtimeSelection.provider = 'unavailable';
    record.runtimeSelection.blockedReason = 'labview-exe-not-found';
    record.reportStatus = 'blocked-runtime';

    const mkdir = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);
    // writePacketRecord omitted -> the default writeComparisonReportPacketRecord
    // runs against the injected fs no-ops (hermetic), covering the default writer
    // fall-through without touching the real filesystem.
    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      { disableDiagnostics: true, mkdir, writeFile: writeFile as never }
    );

    expect(result.record.runtimeExecution.state).toBe('not-available');
    expect(writeFile).toHaveBeenCalled();
  });
});

describe('comparisonReportRuntimeExecution helper branch coverage (VHS-REQ-624 / VHS-REQ-623)', () => {
  it('buildLinuxContainerCommandPlan returns undefined when the runtime selection has no engine', () => {
    const record = createReadyRecord();
    record.runtimeSelection = {
      ...record.runtimeSelection,
      platform: 'linux',
      provider: 'linux-container',
      engine: undefined
    };

    const plan = buildLinuxContainerCommandPlan(
      record,
      { executable: '/usr/local/bin/LabVIEWCLI', args: [] },
      {
        hostReportDirectory: '/host/report',
        hostTempDirectory: '/host/report/container-temp',
        containerWorkspaceRoot: '/workspace',
        containerImage: 'nationalinstruments/labview:2026q1-linux',
        processPlatform: 'linux'
      }
    );

    expect(plan).toBeUndefined();
  });

  it('buildLinuxContainerCommandPlan prefixes the materialized staged depth when a relativeDirectory is supplied (VHS-REQ-624)', () => {
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
        // A leading/trailing slash is trimmed; the depth is then prefixed onto the
        // container VI filenames (both left and right ternary truthy branches).
        relativeDirectory: '/nested/dir/'
      }
    );

    expect(plan).toBeDefined();
    const script = plan?.args[plan.args.length - 1] ?? '';
    expect(script).toContain('nested/dir/');
  });

  it('resolveWindowsLabviewTcpSettingsForLabviewPath uses the ambient process platform when none is supplied (VHS-REQ-623)', async () => {
    // processPlatform omitted -> the `deps.processPlatform ?? process.platform`
    // default is exercised; the injected readFile supplies the .ini regardless.
    const settings = await resolveWindowsLabviewTcpSettingsForLabviewPath(
      'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
      {
        readFile: vi
          .fn()
          .mockResolvedValue('server.tcp.enabled="TRUE"\nserver.tcp.port="3363"\n') as never
      }
    );

    expect(settings.viServerTcpEnabled).toBe(true);
    expect(settings.labviewTcpPort).toBe(3363);
  });
});

describe('comparisonReportRuntimeExecution helper branch coverage — lvcompare linux-container (VHS-REQ-657)', () => {
  function lvcompareContainerRecord(): ComparisonReportPacketRecord {
    const record = createReadyRecord();
    record.runtimeSelection = {
      ...record.runtimeSelection,
      platform: 'linux',
      containerRuntimePlatform: 'linux',
      provider: 'linux-container',
      engine: 'lvcompare'
    };
    return record;
  }

  it('builds a direct lvcompare container script for the lvcompare engine', () => {
    const plan = buildLinuxContainerCommandPlan(
      lvcompareContainerRecord(),
      {
        executable: 'LVCompare',
        args: ['/host/staging/left-foo.vi', '/host/staging/right-foo.vi', '-lvpath', '/host/native-labview']
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
    expect(plan?.executable).toBe('docker');
  });

  it('returns undefined when the lvcompare args cannot be rewritten for the container', () => {
    const plan = buildLinuxContainerCommandPlan(
      lvcompareContainerRecord(),
      // Fewer than two positional VI paths -> the rewrite fails -> plan is undefined.
      { executable: 'LVCompare', args: ['only-one'] },
      {
        hostReportDirectory: '/host/report',
        hostTempDirectory: '/host/report/container-temp',
        containerWorkspaceRoot: '/workspace',
        containerImage: 'nationalinstruments/labview:2026q1-linux',
        processPlatform: 'linux'
      }
    );

    expect(plan).toBeUndefined();
  });
});

describe('observeWindowsRuntimeProcesses / observeWindowsTcpListeners default + edge branches (VHS-REQ-621, VHS-REQ-623)', () => {
  function execFileCb(behavior: (executable: string) => { error?: unknown; stdout?: unknown }) {
    return ((executable: string, _args: string[], _options: unknown, callback: (error: unknown, stdout: unknown, stderr: string) => void) => {
      const { error, stdout } = behavior(executable);
      callback(error ?? null, stdout as never, '');
    }) as never;
  }

  it('coerces a null tasklist stdout to empty and reports no observed runtime processes', async () => {
    const observation = await observeWindowsRuntimeProcesses(
      { hostPlatform: 'win32', runtimePlatform: 'win32', trigger: 'process-exit' },
      { execFileImpl: execFileCb(() => ({ stdout: null })), nowIso: () => '2026-01-01T00:00:00.000Z' }
    );

    expect(observation?.observedProcesses).toEqual([]);
    expect(observation?.labviewProcessObserved).toBe(false);
  });

  it('resolves the executable path through the default resolver on a linux host without spawning', async () => {
    // A LabVIEW.exe row plus an omitted resolveWindowsLabviewExecutablePath exercises
    // the production default resolver; on a linux host it short-circuits to undefined
    // (no PowerShell subprocess).
    const observation = await observeWindowsRuntimeProcesses(
      { hostPlatform: 'linux', runtimePlatform: 'win32', trigger: 'cli-log-banner' },
      { execFileImpl: execFileCb(() => ({ stdout: '"LabVIEW.exe","4321","Console","1","100 K"' })) }
    );

    expect(observation?.labviewProcessObserved).toBe(true);
    expect(observation?.labviewProcessBitness).toBeUndefined();
    expect(observation?.labviewProcessExecutablePath).toBeUndefined();
  });

  it('short-circuits the default resolver for a non-positive pid on a win32 host without spawning', async () => {
    const observation = await observeWindowsRuntimeProcesses(
      { hostPlatform: 'win32', runtimePlatform: 'win32', trigger: 'process-spawn' },
      {
        execFileImpl: execFileCb(() => ({ stdout: '"LabVIEW.exe","0","Console","1","100 K"' })),
        nowIso: () => '2026-01-01T00:00:00.000Z'
      }
    );

    expect(observation?.labviewProcessObserved).toBe(true);
    expect(observation?.labviewProcessExecutablePath).toBeUndefined();
  });

  it('coerces a null netstat stdout to empty and returns no listeners', async () => {
    const listeners = await observeWindowsTcpListeners(
      { hostPlatform: 'win32', runtimePlatform: 'win32', localPorts: [3363] },
      { execFileImpl: execFileCb(() => ({ stdout: null })) }
    );

    expect(listeners).toEqual([]);
  });

  it('rejects when the tasklist lookup fails after a matching netstat listener is found', async () => {
    const execFileImpl = execFileCb((executable) =>
      String(executable).includes('netstat')
        ? { stdout: 'TCP    0.0.0.0:3363    0.0.0.0:0    LISTENING    4321' }
        : { error: new Error('tasklist failed') }
    );

    await expect(
      observeWindowsTcpListeners(
        { hostPlatform: 'win32', runtimePlatform: 'win32', localPorts: [3363] },
        { execFileImpl }
      )
    ).rejects.toThrow('tasklist failed');
  });

  it('coerces a null tasklist stdout to empty when mapping listener process owners', async () => {
    const execFileImpl = execFileCb((executable) =>
      String(executable).includes('netstat')
        ? { stdout: 'TCP    0.0.0.0:3363    0.0.0.0:0    LISTENING    4321' }
        : { stdout: null }
    );

    const listeners = await observeWindowsTcpListeners(
      { hostPlatform: 'win32', runtimePlatform: 'win32', localPorts: [3363] },
      { execFileImpl }
    );

    expect(listeners).toHaveLength(1);
    expect(listeners[0].processName).toBeUndefined();
  });
});

describe('runComparisonCommandPlanWithObservation default + guard branches (VHS-REQ-621)', () => {
  function makeObsChild() {
    const stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn(), destroy: vi.fn() });
    const stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn(), destroy: vi.fn() });
    const child = Object.assign(new EventEmitter(), { stdout, stderr, pid: 4242, kill: vi.fn() });
    return { child, stdout, stderr };
  }

  it('falls through to the default host/runtime platform and process observer when observation deps are omitted', async () => {
    const { child } = makeObsChild();
    const resultPromise = runComparisonCommandPlanWithObservation(
      { executable: 'LVCompare', args: [] },
      {
        spawnImpl: (() => child) as never,
        // engine lvcompare starts observation on spawn; host/runtime platform and the
        // observer are omitted so the defaults bind. On this non-win32 host the default
        // observer returns undefined without launching a process.
        engine: 'lvcompare'
      }
    );

    child.emit('spawn');
    child.emit('exit', 0, null);

    const result = await resultPromise;
    expect(result.exitCode).toBe(0);
    expect(result.processObservation).toBeUndefined();
    expect(result.exitProcessObservation).toBeUndefined();
  });

  it('does not restart observation when the CLI banner appears after a spawn-triggered start', async () => {
    const { child, stdout } = makeObsChild();
    const observeWindowsProcesses = vi
      .fn()
      .mockResolvedValue({ observedProcessNames: [], trigger: 'process-spawn' });

    const resultPromise = runComparisonCommandPlanWithObservation(
      { executable: 'LVCompare', args: [] },
      {
        spawnImpl: (() => child) as never,
        hostPlatform: 'win32',
        runtimePlatform: 'win32',
        engine: 'lvcompare',
        observeWindowsProcesses: observeWindowsProcesses as never
      }
    );

    child.emit('spawn');
    stdout.emit('data', 'LabVIEWCLI started logging in file: C:\\Temp\\x.log\r\n');
    child.emit('exit', 0, null);

    const result = await resultPromise;
    expect(result.exitCode).toBe(0);
    const spawnStarts = observeWindowsProcesses.mock.calls.filter((call) => call[0].trigger === 'process-spawn');
    expect(spawnStarts).toHaveLength(1);
  });

  it('ignores a repeated termination request under a doubled cancellation signal', async () => {
    const { child } = makeObsChild();
    const token = {
      isCancellationRequested: true,
      onCancellationRequested: (listener: () => void) => {
        listener();
        return { dispose: vi.fn() };
      }
    };

    const resultPromise = runComparisonCommandPlanWithObservation(
      { executable: 'LVCompare', args: [] },
      {
        spawnImpl: (() => child) as never,
        hostPlatform: 'linux',
        runtimePlatform: 'linux',
        cancellationToken: token as never
      }
    );

    child.emit('exit', null, null);

    const result = await resultPromise;
    expect(result.cancelled).toBe(true);
    expect(result.exitCode).toBe(130);
  });

  it('ignores a second exit event after the first settles', async () => {
    const { child } = makeObsChild();
    const resultPromise = runComparisonCommandPlanWithObservation(
      { executable: 'LVCompare', args: [] },
      { spawnImpl: (() => child) as never, hostPlatform: 'linux', runtimePlatform: 'linux' }
    );

    child.emit('exit', 0, null);
    child.emit('exit', 1, null);

    const result = await resultPromise;
    expect(result.exitCode).toBe(0);
  });

  it('ignores an error event after the process already exited', async () => {
    const { child } = makeObsChild();
    const resultPromise = runComparisonCommandPlanWithObservation(
      { executable: 'LVCompare', args: [] },
      { spawnImpl: (() => child) as never, hostPlatform: 'linux', runtimePlatform: 'linux' }
    );

    child.emit('exit', 0, null);
    child.emit('error', new Error('late error'));

    const result = await resultPromise;
    expect(result.exitCode).toBe(0);
  });

  it('clears the pending timeout when the process errors before timing out', async () => {
    const { child } = makeObsChild();
    const resultPromise = runComparisonCommandPlanWithObservation(
      { executable: 'LVCompare', args: [] },
      { spawnImpl: (() => child) as never, hostPlatform: 'linux', runtimePlatform: 'linux', timeoutMs: 100000 }
    );

    child.emit('error', new Error('spawn failed'));

    await expect(resultPromise).rejects.toThrow('spawn failed');
  });
});

describe('runComparisonCommandPlan default + guard branches (VHS-REQ-621)', () => {
  it('defaults a missing signal to undefined on a numeric-code error result', async () => {
    const execFileImpl = vi.fn((_e: string, _a: string[], _o: unknown, cb: (error: unknown, stdout: string, stderr: string) => void) => {
      cb(Object.assign(new Error('boom'), { code: 2 }), 'o', 'e');
      return { pid: 1, kill: vi.fn() };
    });

    const result = await runComparisonCommandPlan(
      { executable: 'x', args: [] },
      { execFileImpl: execFileImpl as never, hostPlatform: 'linux' }
    );

    expect(result.exitCode).toBe(2);
    expect(result.signal).toBeUndefined();
  });

  it('defaults a missing signal to undefined on a timeout result', async () => {
    const execFileImpl = vi.fn((_e: string, _a: string[], _o: unknown, cb: (error: unknown, stdout: string, stderr: string) => void) => {
      cb(Object.assign(new Error('Command failed: timed out after 500ms'), { killed: true }), '', '');
      return { pid: 1, kill: vi.fn() };
    });

    const result = await runComparisonCommandPlan(
      { executable: 'x', args: [] },
      { execFileImpl: execFileImpl as never, timeoutMs: 500 }
    );

    expect(result.timedOut).toBe(true);
    expect(result.signal).toBeUndefined();
  });

  it('ignores a repeated termination request and honors an already-cancelled token', async () => {
    let capturedCallback: ((error: unknown, stdout: string, stderr: string) => void) | undefined;
    const kill = vi.fn();
    const execFileImpl = vi.fn((_e: string, _a: string[], _o: unknown, cb: (error: unknown, stdout: string, stderr: string) => void) => {
      capturedCallback = cb;
      return { pid: 7, kill };
    });
    const terminateProcessTree = vi.fn().mockResolvedValue(undefined);
    const token = {
      isCancellationRequested: true,
      onCancellationRequested: (listener: () => void) => {
        listener();
        return { dispose: vi.fn() };
      }
    };

    const resultPromise = runComparisonCommandPlan(
      { executable: 'LVCompare', args: [] },
      {
        execFileImpl: execFileImpl as never,
        cancellationToken: token as never,
        hostPlatform: 'win32',
        terminateProcessTree: terminateProcessTree as never
      }
    );

    capturedCallback?.(null, 'out', 'err');

    const result = await resultPromise;
    expect(result.cancelled).toBe(true);
    expect(result.exitCode).toBe(130);
    // The doubled cancellation signal requested termination exactly once.
    expect(terminateProcessTree).toHaveBeenCalledTimes(1);
  });
});

describe('executeComparisonReport full runtime path without a diagnostics recorder (VHS-REQ-148)', () => {
  function successDeps(overrides: Record<string, unknown> = {}) {
    return {
      disableDiagnostics: true,
      readRevisionBlob: vi
        .fn()
        .mockResolvedValueOnce(Buffer.from('left-blob'))
        .mockResolvedValueOnce(Buffer.from('right-blob')),
      materializeSelectedRevisionTree: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined) as never,
      pathExists: vi.fn().mockResolvedValue(true),
      removePath: vi.fn().mockResolvedValue(undefined),
      runCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: 'CreateComparisonReport operation succeeded.',
        stderr: ''
      }),
      nowIso: vi.fn().mockReturnValue('2026-04-02T01:00:00.000Z'),
      nowMs: vi.fn().mockReturnValue(1000),
      writePacketRecord: vi.fn().mockResolvedValue(undefined),
      processPlatform: 'win32' as NodeJS.Platform,
      ...overrides
    };
  }

  it('attempts and finalizes a successful comparison with diagnostics disabled', async () => {
    const record = createReadyRecord();

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      successDeps() as never
    );

    // The single attempt ran the command through the no-recorder runtime path.
    expect(result.record.runtimeExecution.attempted).toBe(true);
    expect(result.record.runtimeExecution.reportExists).toBe(true);
  });

  it('materializes the selected tree with the default pathspec and retains the materialized tree', async () => {
    const record = createReadyRecord();
    // A tree root + revision (and no explicit pathspec) drives the `|| '.'` default
    // pathspec and the materialized-tree retention branch.
    record.stagedRevisionPlan.treeRoot = record.artifactPlan.stagingDirectory;
    record.stagedRevisionPlan.treeRevisionId = record.selectedHash;
    const materializeSelectedRevisionTree = vi.fn().mockResolvedValue(undefined);

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      successDeps({ materializeSelectedRevisionTree }) as never
    );

    expect(materializeSelectedRevisionTree).toHaveBeenCalledWith(
      expect.objectContaining({ pathspec: '.' })
    );
    expect(result.record.runtimeExecution.materializedTree).toBeDefined();
  });

  it('records worktree snapshot provenance falling back to the artifact-plan relative path', async () => {
    const record = createReadyRecord();
    // A working-tree side produces a snapshot provenance note; clearing the
    // preflight relative path drives the artifact-plan fallback and the empty
    // diagnostic-notes spread.
    record.selectedHash = 'WORKTREE';
    (record.preflight as { normalizedRelativePath?: string }).normalizedRelativePath = undefined;

    const result = await executeComparisonReport(
      { record, repositoryRoot: '/workspace/repo' },
      successDeps() as never
    );

    expect(result.record.runtimeExecution.attempted).toBe(true);
    expect(result.record.runtimeExecution.diagnosticNotes?.some((note) => /snapshot/i.test(note))).toBe(true);
  });
});

describe('executeComparisonReport Windows host-surface contamination + tcp-settings helper (VHS-REQ-623)', () => {
  it('blocks with windows-host-runtime-surface-contaminated when existing processes and a listener are observed', async () => {
    const record = createReadyRecord();
    const runCommand = vi.fn();
    const observeWindowsProcesses = vi.fn().mockResolvedValue({
      capturedAt: '2026-06-03T18:00:00.000Z',
      hostPlatform: 'win32',
      runtimePlatform: 'win32',
      trigger: 'preflight',
      observedProcesses: [{ imageName: 'LabVIEW.exe', pid: 4321 }],
      observedProcessNames: ['LabVIEW.exe'],
      labviewProcessObserved: true,
      labviewCliProcessObserved: false,
      lvcompareProcessObserved: false,
      labviewProcessBitness: 'x64'
    });
    const observeWindowsTcpListeners = vi
      .fn()
      .mockResolvedValue([{ localPort: 3363, pid: 4321, processName: 'LabVIEW.exe' }]);

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
            // VI Server TCP enabled with a concrete port: the disabled-TCP preflight
            // passes, so the host-surface contamination check runs with a real port.
            return 'server.tcp.enabled="TRUE"\nserver.tcp.port="3363"\n';
          }
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        }) as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand: runCommand as never,
        nowIso: vi.fn().mockReturnValue('2026-06-03T18:00:00.000Z'),
        nowMs: vi.fn().mockReturnValue(1000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32',
        enforceWindowsHostPreflight: true,
        observeWindowsProcesses: observeWindowsProcesses as never,
        observeWindowsTcpListeners: observeWindowsTcpListeners as never
      }
    );

    expect(runCommand).not.toHaveBeenCalled();
    expect(observeWindowsProcesses).toHaveBeenCalled();
    expect(result.record.runtimeExecution.blockedReason).toBe('windows-host-runtime-surface-contaminated');
    expect(result.record.runtimeExecution.state).toBe('not-available');
  });

  it('returns empty tcp settings when the command plan carries no -LabVIEWPath argument', async () => {
    const record = createReadyRecord();

    const settings = await resolveWindowsLabviewTcpSettings(
      record,
      { executable: 'LabVIEWCLI', args: ['-OperationName', 'CreateComparisonReport'] },
      { readFile: vi.fn().mockRejectedValue(new Error('should not read')) as never, processPlatform: 'win32' }
    );

    expect(settings).toEqual({ notes: [] });
  });
});

describe('prepareWindowsContainerExecutionContext interop-host branches (VHS-REQ-624)', () => {
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
    args: ['-OperationName', 'CreateComparisonReport', '-VI1', 'left.vi', '-VI2', 'right.vi', '-ReportPath', 'report.html']
  };

  it('blocks when the interop workspace root is missing on a non-win32 host', async () => {
    const record = createWindowsContainerReadyRecord();

    const context = await prepareWindowsContainerExecutionContext(
      record,
      labviewCliCommandPlan,
      undefined,
      containerDeps('linux')
    );

    expect(context.outcome).toBe('blocked');
    expect(context.failureReason).toBe('windows-interop-root-unavailable');
  });

  it('blocks in the interop branch when tree materialization fails on a non-win32 host', async () => {
    const record = createWindowsContainerReadyRecord();
    record.stagedRevisionPlan.treeRevisionId = record.selectedHash;

    const context = await prepareWindowsContainerExecutionContext(
      record,
      labviewCliCommandPlan,
      '/interop/workspace',
      {
        ...containerDeps('linux'),
        repositoryRoot: 'C:\\repo',
        materializeSelectedRevisionTree: vi.fn().mockRejectedValue(new Error('partial-clone')) as never
      }
    );

    expect(context.outcome).toBe('blocked');
    expect(context.failureReason).toBe('selected-tree-materialize-failed');
  });
});
