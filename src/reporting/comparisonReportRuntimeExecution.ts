import { execFile, ExecFileException, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { ComparisonCommandPlan } from './comparisonReportPlan';
import { buildComparisonReportExecutionPlan } from './comparisonReportExecutionPlan';
import {
  ComparisonReportPacketRecord,
  ComparisonReportRuntimeExecution,
  writeComparisonReportPacketRecord
} from './comparisonReportPacket';
import { buildComparisonRuntimeDoctorSummary } from './comparisonRuntimeDoctor';
import { readRevisionBlob } from './comparisonReportPreflight';

export interface ExecuteComparisonReportOptions {
  record: ComparisonReportPacketRecord;
  repositoryRoot: string;
  interopWorkspaceRoot?: string;
  cancellationToken?: ComparisonRuntimeCancellationToken;
}

export interface ExecuteComparisonReportResult {
  record: ComparisonReportPacketRecord;
  packetFilePath: string;
  reportFilePath: string;
  metadataFilePath: string;
}

export interface ComparisonReportRuntimeExecutionDeps {
  readRevisionBlob?: typeof readRevisionBlob;
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
  copyFile?: typeof fs.copyFile;
  copyDirectory?: typeof fs.cp;
  removePath?: typeof fs.rm;
  unlinkFile?: typeof fs.unlink;
  readFile?: typeof fs.readFile;
  readdir?: typeof fs.readdir;
  pathExists?: (filePath: string) => Promise<boolean>;
  runCommand?: (commandPlan: ComparisonCommandPlan) => Promise<RunCommandResult>;
  nowIso?: () => string;
  nowMs?: () => number;
  writePacketRecord?: typeof writeComparisonReportPacketRecord;
  processPlatform?: NodeJS.Platform;
  observeWindowsProcesses?: (
    options: ObserveWindowsProcessesOptions
  ) => Promise<RuntimeProcessObservation | undefined>;
  observeWindowsTcpListeners?: (
    options: ObserveWindowsTcpListenersOptions
  ) => Promise<WindowsTcpListenerObservation[]>;
  enforceWindowsHostPreflight?: boolean;
  commandTimeoutMs?: number;
}

export interface ComparisonRuntimeCancellationToken {
  isCancellationRequested: boolean;
  onCancellationRequested?: (
    listener: () => unknown,
    thisArgs?: unknown,
    disposables?: { dispose(): unknown }[]
  ) => { dispose(): unknown } | undefined;
}

export interface BuildDefaultRunCommandOptions {
  provider: 'host-native' | 'windows-container' | 'linux-container' | undefined;
  processPlatform: NodeJS.Platform;
  runtimePlatform: ComparisonReportPacketRecord['runtimeSelection']['platform'];
  engine: ComparisonReportPacketRecord['runtimeSelection']['engine'];
  timeoutMs?: number;
  cancellationToken?: ComparisonRuntimeCancellationToken;
  observeWindowsProcesses?: (
    options: ObserveWindowsProcessesOptions
  ) => Promise<RuntimeProcessObservation | undefined>;
  runComparisonCommandPlanImpl?: typeof runComparisonCommandPlan;
  runComparisonCommandPlanWithObservationImpl?: typeof runComparisonCommandPlanWithObservation;
}

export interface RunCommandResult {
  exitCode: number;
  signal?: string;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  cancelled?: boolean;
  timeoutMs?: number;
  processObservation?: RuntimeProcessObservation;
  exitProcessObservation?: RuntimeProcessObservation;
}

export interface RunComparisonCommandPlanDeps {
  execFileImpl?: typeof execFile;
  timeoutMs?: number;
  hostPlatform?: NodeJS.Platform;
  cancellationToken?: ComparisonRuntimeCancellationToken;
  terminateProcessTree?: (pid: number, hostPlatform: NodeJS.Platform) => Promise<void>;
}

export interface RuntimeObservedProcess {
  imageName: string;
  pid: number;
  sessionName?: string;
  sessionNumber?: number;
  memUsage?: string;
}

export interface RuntimeProcessObservation {
  capturedAt: string;
  hostPlatform: NodeJS.Platform;
  runtimePlatform: string;
  trigger: 'preflight' | 'cli-log-banner' | 'process-spawn' | 'process-exit';
  observedProcesses: RuntimeObservedProcess[];
  observedProcessNames: string[];
  labviewProcessObserved: boolean;
  labviewCliProcessObserved: boolean;
  lvcompareProcessObserved: boolean;
}

export interface WindowsTcpListenerObservation {
  localAddress: string;
  localPort: number;
  pid: number;
  processName?: string;
}

export interface WindowsLabviewTcpSettings {
  labviewIniPath?: string;
  labviewTcpPort?: number;
  notes: string[];
}

interface WindowsContainerRuntimeFacts {
  labviewIniPath?: string;
  labviewTcpPort?: number;
  notes: string[];
}

export interface ObserveWindowsProcessesOptions {
  hostPlatform: NodeJS.Platform;
  runtimePlatform: string;
  trigger: RuntimeProcessObservation['trigger'];
}

export interface ObserveWindowsTcpListenersOptions {
  hostPlatform: NodeJS.Platform;
  runtimePlatform: string;
  localPorts: number[];
}

export interface ObserveWindowsProcessesDeps {
  execFileImpl?: typeof execFile;
  nowIso?: () => string;
}

export interface ObserveWindowsTcpListenersDeps {
  execFileImpl?: typeof execFile;
}

export interface RunComparisonCommandPlanWithObservationDeps {
  spawnImpl?: typeof spawn;
  observeWindowsProcesses?: (
    options: ObserveWindowsProcessesOptions
  ) => Promise<RuntimeProcessObservation | undefined>;
  hostPlatform?: NodeJS.Platform;
  runtimePlatform?: string;
  engine?: 'labview-cli' | 'lvcompare';
  timeoutMs?: number;
  cancellationToken?: ComparisonRuntimeCancellationToken;
  terminateProcessTree?: (pid: number, hostPlatform: NodeJS.Platform) => Promise<void>;
}

export async function executeComparisonReport(
  options: ExecuteComparisonReportOptions,
  deps: ComparisonReportRuntimeExecutionDeps = {}
): Promise<ExecuteComparisonReportResult> {
  const plan = buildComparisonReportExecutionPlan(options.record);
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const copyFile = deps.copyFile ?? fs.copyFile;
  const copyDirectory = deps.copyDirectory ?? fs.cp;
  const removePath = deps.removePath ?? fs.rm;
  const unlinkFile = deps.unlinkFile ?? fs.unlink;
  const readFile = deps.readFile ?? fs.readFile;
  const pathExists = deps.pathExists ?? pathExistsForReport;
  const processPlatform = deps.processPlatform ?? process.platform;
  const enforceWindowsHostPreflight =
    deps.enforceWindowsHostPreflight ?? process.platform === 'win32';
  const observeWindowsProcesses = deps.observeWindowsProcesses ?? observeWindowsRuntimeProcesses;
  const observeWindowsTcpListenersFn =
    deps.observeWindowsTcpListeners ?? observeWindowsTcpListeners;
  const runCommand =
    deps.runCommand ??
    buildDefaultRunCommand({
      provider: plan.provider,
      processPlatform,
      runtimePlatform: resolveEffectiveRuntimePlatform(options.record.runtimeSelection),
      observeWindowsProcesses,
      engine: options.record.runtimeSelection.engine,
      timeoutMs: deps.commandTimeoutMs,
      cancellationToken: options.cancellationToken
    });
  const nowIso = deps.nowIso ?? defaultNowIso;
  const nowMs = deps.nowMs ?? defaultNowMs;
  const writePacketRecord = deps.writePacketRecord ?? writeComparisonReportPacketRecord;

  let runtimeExecution: ComparisonReportRuntimeExecution;

  if (plan.outcome === 'blocked' || !plan.commandPlan) {
    runtimeExecution = {
      state: options.record.reportStatus === 'blocked-runtime' ? 'not-available' : 'failed',
      attempted: false,
      reportExists: false,
      blockedReason: plan.blockedReason,
      failureReason:
        options.record.reportStatus === 'blocked-runtime' ? undefined : 'execution-plan-blocked',
      stdoutFilePath: options.record.artifactPlan.runtimeStdoutFilePath,
      stderrFilePath: options.record.artifactPlan.runtimeStderrFilePath
    };
  } else {
    runtimeExecution = await runHostNativeExecution(
      options.record,
      options.repositoryRoot,
      plan.commandPlan,
      options.interopWorkspaceRoot,
      {
        readBlob: deps.readRevisionBlob ?? readRevisionBlob,
        mkdir,
        writeFile,
        copyFile,
        copyDirectory,
        removePath,
        unlinkFile,
        readFile,
        readdir: deps.readdir ?? fs.readdir,
        pathExists,
        runCommand,
        nowIso,
        nowMs,
        processPlatform,
        enforceWindowsHostPreflight,
        observeWindowsProcesses,
        observeWindowsTcpListeners: observeWindowsTcpListenersFn,
        commandTimeoutMs: deps.commandTimeoutMs
      }
    );
  }

  const updatedRecord: ComparisonReportPacketRecord = {
    ...options.record,
    runtimeExecutionState: runtimeExecution.state,
    runtimeExecution: {
      ...runtimeExecution
    }
  };
  updatedRecord.runtimeExecution.doctorSummaryLines = buildComparisonRuntimeDoctorSummary(updatedRecord);
  await writePacketRecord(updatedRecord, {
    mkdir,
    writeFile
  });

  return {
    record: updatedRecord,
    packetFilePath: updatedRecord.artifactPlan.packetFilePath,
    reportFilePath: updatedRecord.artifactPlan.reportFilePath,
    metadataFilePath: updatedRecord.artifactPlan.metadataFilePath
  };
}

export function buildDefaultRunCommand(
  options: BuildDefaultRunCommandOptions
): (commandPlan: ComparisonCommandPlan) => Promise<RunCommandResult> {
  const observeWindowsProcesses = options.observeWindowsProcesses ?? observeWindowsRuntimeProcesses;
  const runWithoutObservation = options.runComparisonCommandPlanImpl ?? runComparisonCommandPlan;
  const runWithObservation =
    options.runComparisonCommandPlanWithObservationImpl ??
    runComparisonCommandPlanWithObservation;

  return (commandPlan: ComparisonCommandPlan) =>
    options.provider === 'windows-container' || options.provider === 'linux-container'
      ? runWithoutObservation(commandPlan, {
          timeoutMs: options.timeoutMs,
          hostPlatform: options.processPlatform,
          cancellationToken: options.cancellationToken
        })
      : runWithObservation(commandPlan, {
          hostPlatform: options.processPlatform,
          runtimePlatform: options.runtimePlatform,
          observeWindowsProcesses,
          engine: options.engine,
          timeoutMs: options.timeoutMs,
          cancellationToken: options.cancellationToken
        });
}

function subscribeToCancellation(
  cancellationToken: ComparisonRuntimeCancellationToken | undefined,
  listener: () => void
): () => void {
  if (!cancellationToken?.onCancellationRequested) {
    return () => undefined;
  }

  const disposable = cancellationToken.onCancellationRequested(listener);
  return () => {
    disposable?.dispose?.();
  };
}

async function terminateWindowsProcessTree(
  pid: number,
  _hostPlatform?: NodeJS.Platform
): Promise<void> {
  await new Promise<void>((resolve) => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {
      resolve();
    });
  });
}

function appendCancellationMessage(stderr: string): string {
  if (/comparison-command cancelled by user/iu.test(stderr)) {
    return stderr;
  }

  return `${stderr}comparison-command cancelled by user\n`;
}

async function runHostNativeExecution(
  record: ComparisonReportPacketRecord,
  repositoryRoot: string,
  commandPlan: ComparisonCommandPlan,
  interopWorkspaceRoot: string | undefined,
  deps: {
    readBlob: typeof readRevisionBlob;
    mkdir: typeof fs.mkdir;
    writeFile: typeof fs.writeFile;
    copyFile: typeof fs.copyFile;
    copyDirectory: typeof fs.cp;
    removePath: typeof fs.rm;
    unlinkFile: typeof fs.unlink;
    readFile: typeof fs.readFile;
    readdir: typeof fs.readdir;
    pathExists: (filePath: string) => Promise<boolean>;
    runCommand: (commandPlan: ComparisonCommandPlan) => Promise<RunCommandResult>;
    nowIso: () => string;
    nowMs: () => number;
    processPlatform: NodeJS.Platform;
    enforceWindowsHostPreflight: boolean;
    observeWindowsProcesses: (
      options: ObserveWindowsProcessesOptions
    ) => Promise<RuntimeProcessObservation | undefined>;
    observeWindowsTcpListeners: (
      options: ObserveWindowsTcpListenersOptions
    ) => Promise<WindowsTcpListenerObservation[]>;
    commandTimeoutMs?: number;
  }
): Promise<ComparisonReportRuntimeExecution> {
  await deps.mkdir(record.artifactPlan.reportDirectory, { recursive: true });
  await deps.mkdir(record.artifactPlan.stagingDirectory, { recursive: true });

  let leftBlob: Buffer;
  try {
    leftBlob = await deps.readBlob(
      repositoryRoot,
      record.preflight.left.revisionId,
      record.preflight.normalizedRelativePath
    );
    await deps.writeFile(record.stagedRevisionPlan.leftFilePath, leftBlob);
  } catch {
    return {
      state: 'failed',
      attempted: false,
      reportExists: false,
      failureReason: 'left-stage-blob-write-failed',
      executable: commandPlan.executable,
      args: commandPlan.args,
      stdoutFilePath: record.artifactPlan.runtimeStdoutFilePath,
      stderrFilePath: record.artifactPlan.runtimeStderrFilePath
    };
  }

  let rightBlob: Buffer;
  try {
    rightBlob = await deps.readBlob(
      repositoryRoot,
      record.preflight.right.revisionId,
      record.preflight.normalizedRelativePath
    );
    await deps.writeFile(record.stagedRevisionPlan.rightFilePath, rightBlob);
  } catch {
    return {
      state: 'failed',
      attempted: false,
      reportExists: false,
      failureReason: 'right-stage-blob-write-failed',
      executable: commandPlan.executable,
      args: commandPlan.args,
      stdoutFilePath: record.artifactPlan.runtimeStdoutFilePath,
      stderrFilePath: record.artifactPlan.runtimeStderrFilePath
    };
  }

  const executionContext = await prepareExecutionContext(record, commandPlan, interopWorkspaceRoot, {
    mkdir: deps.mkdir,
    writeFile: deps.writeFile,
    processPlatform: deps.processPlatform,
    leftBlob,
    rightBlob
  });

  if (executionContext.outcome === 'blocked') {
    return {
      state: 'failed',
      attempted: false,
      reportExists: false,
      failureReason: executionContext.failureReason,
      executable: commandPlan.executable,
      args: commandPlan.args,
      stdoutFilePath: record.artifactPlan.runtimeStdoutFilePath,
      stderrFilePath: record.artifactPlan.runtimeStderrFilePath
    };
  }

  const windowsLabviewTcpSettings = await resolveWindowsLabviewTcpSettings(
    record,
    executionContext.commandPlan,
    {
      readFile: deps.readFile,
      processPlatform: deps.processPlatform
    }
  );
  const effectiveExecutionContext: PreparedExecutionContext = {
    ...executionContext,
    commandPlan: {
      executable: executionContext.commandPlan.executable,
      args: appendLabviewCliPortNumberArg(
        executionContext.commandPlan.args,
        windowsLabviewTcpSettings.labviewTcpPort
      )
    }
  };
  const windowsHostSurfacePreflight = await preflightWindowsHostRuntimeSurface(
    record,
    effectiveExecutionContext.commandPlan,
    windowsLabviewTcpSettings,
    {
      enforceWindowsHostPreflight: deps.enforceWindowsHostPreflight,
      processPlatform: deps.processPlatform,
      observeWindowsProcesses: deps.observeWindowsProcesses,
      observeWindowsTcpListeners: deps.observeWindowsTcpListeners,
      writeFile: deps.writeFile,
      mkdir: deps.mkdir,
      unlinkFile: deps.unlinkFile,
      pathExists: deps.pathExists
    }
  );
  if (windowsHostSurfacePreflight) {
    return windowsHostSurfacePreflight.blockedExecution;
  }

  const executeAttempt = async (): Promise<ComparisonReportRuntimeExecution> => {
    await clearStaleExecutedReportArtifacts(record, effectiveExecutionContext, {
      removePath: deps.removePath
    });

    const startedAt = deps.nowIso();
    const startedMs = deps.nowMs();

    try {
      const commandResult = await deps.runCommand(effectiveExecutionContext.commandPlan);
      const completedAt = deps.nowIso();
      const durationMs = Math.max(0, deps.nowMs() - startedMs);
      await deps.writeFile(record.artifactPlan.runtimeStdoutFilePath, commandResult.stdout, 'utf8');
      await deps.writeFile(record.artifactPlan.runtimeStderrFilePath, commandResult.stderr, 'utf8');
      const windowsContainerRuntimeFacts =
        record.runtimeSelection.provider === 'windows-container'
          ? parseWindowsContainerRuntimeFacts(commandResult.stdout)
          : {
              notes: []
            };
      const processObservation = await persistRuntimeProcessObservation(record, commandResult, {
        writeFile: deps.writeFile,
        mkdir: deps.mkdir,
        unlinkFile: deps.unlinkFile,
        pathExists: deps.pathExists
      });
      const diagnostics = await captureRuntimeDiagnostics(record, commandResult.stdout, {
        stderr: commandResult.stderr,
        pathExists: deps.pathExists,
        copyFile: deps.copyFile,
        unlinkFile: deps.unlinkFile,
        readFile: deps.readFile,
        readdir: deps.readdir,
        mkdir: deps.mkdir,
        removePath: deps.removePath,
        processPlatform: deps.processPlatform,
        expectedLabviewPath:
          extractCommandOptionValue(effectiveExecutionContext.commandPlan.args, '-LabVIEWPath') ??
          record.runtimeSelection.labviewExe?.path,
        diagnosticPathMapping: executionContext.diagnosticPathMapping
      });
      const finalizedReport = await finalizeExecutedReport(
        record,
        effectiveExecutionContext,
        {
          validateIdentity: commandResult.timedOut || commandResult.exitCode !== 0
        },
        {
          pathExists: deps.pathExists,
          copyFile: deps.copyFile,
          copyDirectory: deps.copyDirectory,
          removePath: deps.removePath,
          readFile: deps.readFile,
          writeFile: deps.writeFile,
          mkdir: deps.mkdir
        }
      );
      const reportExists = finalizedReport.reportExists;
      const succeeded =
        !commandResult.timedOut &&
        !commandResult.cancelled &&
        commandResult.exitCode === 0 &&
        reportExists;
      const failureClassification = commandResult.cancelled
        ? {
            reason: 'command-cancelled',
            notes: ['Comparison-report runtime was cancelled before completion.']
          }
        : commandResult.timedOut
        ? {
            reason: 'command-timed-out',
            notes: [
              `Comparison-report runtime timed out after ${String(
                commandResult.timeoutMs ?? deps.commandTimeoutMs ?? 'the governed'
              )}ms.`
            ]
          }
        : classifyRuntimeFailure({
            engine: record.runtimeSelection.engine,
            exitCode: commandResult.exitCode,
            reportExists,
            stdout: commandResult.stdout,
            stderr: commandResult.stderr,
            processObservation: processObservation?.bannerSnapshot,
            exitProcessObservation: processObservation?.exitSnapshot
          });
      const retainedLabviewIniPath =
        windowsContainerRuntimeFacts.labviewIniPath ?? windowsLabviewTcpSettings.labviewIniPath;
      const retainedLabviewTcpPort =
        windowsContainerRuntimeFacts.labviewTcpPort ?? windowsLabviewTcpSettings.labviewTcpPort;
      const diagnosticNotes = mergeDiagnosticNotes(
        buildProcessObservationNotes(processObservation),
        windowsLabviewTcpSettings.notes,
        windowsContainerRuntimeFacts.notes,
        diagnostics.notes,
        finalizedReport.validationNotes,
        failureClassification.notes
      );

      return {
        state: succeeded ? 'succeeded' : 'failed',
        attempted: true,
        reportExists,
        failureReason: succeeded ? undefined : failureClassification.reason,
        diagnosticReason: diagnostics.reason,
        diagnosticNotes,
        diagnosticLogSourcePath: diagnostics.sourcePath,
        diagnosticLogArtifactPath: diagnostics.artifactPath,
        labviewIniPath: retainedLabviewIniPath,
        labviewTcpPort: retainedLabviewTcpPort,
        headlessDiagnosticArtifactPaths: diagnostics.headlessArtifactPaths,
        executable: effectiveExecutionContext.commandPlan.executable,
        args: effectiveExecutionContext.commandPlan.args,
        startedAt,
        completedAt,
        durationMs,
        exitCode: commandResult.exitCode,
        signal: commandResult.signal,
        stdoutFilePath: record.artifactPlan.runtimeStdoutFilePath,
        stderrFilePath: record.artifactPlan.runtimeStderrFilePath,
        processObservationArtifactPath: processObservation?.artifactPath,
        processObservationCapturedAt:
          processObservation?.bannerSnapshot?.capturedAt ?? processObservation?.exitSnapshot?.capturedAt,
        processObservationTrigger:
          processObservation?.bannerSnapshot?.trigger ?? processObservation?.exitSnapshot?.trigger,
        observedProcessNames:
          processObservation?.bannerSnapshot?.observedProcessNames ??
          processObservation?.exitSnapshot?.observedProcessNames,
        labviewProcessObserved:
          processObservation?.bannerSnapshot?.labviewProcessObserved ??
          processObservation?.exitSnapshot?.labviewProcessObserved,
        labviewCliProcessObserved:
          processObservation?.bannerSnapshot?.labviewCliProcessObserved ??
          processObservation?.exitSnapshot?.labviewCliProcessObserved,
        lvcompareProcessObserved:
          processObservation?.bannerSnapshot?.lvcompareProcessObserved ??
          processObservation?.exitSnapshot?.lvcompareProcessObserved,
        exitProcessObservationCapturedAt: processObservation?.exitSnapshot?.capturedAt,
        exitProcessObservationTrigger: processObservation?.exitSnapshot?.trigger,
        exitObservedProcessNames: processObservation?.exitSnapshot?.observedProcessNames,
        labviewProcessObservedAtExit: processObservation?.exitSnapshot?.labviewProcessObserved,
        labviewCliProcessObservedAtExit: processObservation?.exitSnapshot?.labviewCliProcessObserved,
        lvcompareProcessObservedAtExit: processObservation?.exitSnapshot?.lvcompareProcessObserved
      };
    } catch (error) {
      const completedAt = deps.nowIso();
      const durationMs = Math.max(0, deps.nowMs() - startedMs);
      const processError = normalizeComparisonProcessError(error);
      await deps.writeFile(record.artifactPlan.runtimeStdoutFilePath, processError.stdout, 'utf8');
      await deps.writeFile(record.artifactPlan.runtimeStderrFilePath, processError.stderr, 'utf8');
      const diagnostics = await captureRuntimeDiagnostics(record, processError.stdout, {
        stderr: processError.stderr,
        pathExists: deps.pathExists,
        copyFile: deps.copyFile,
        unlinkFile: deps.unlinkFile,
        readFile: deps.readFile,
        readdir: deps.readdir,
        mkdir: deps.mkdir,
        removePath: deps.removePath,
        processPlatform: deps.processPlatform,
        expectedLabviewPath:
          extractCommandOptionValue(effectiveExecutionContext.commandPlan.args, '-LabVIEWPath') ??
          record.runtimeSelection.labviewExe?.path
      });

      return {
        state: 'failed',
        attempted: true,
        reportExists: false,
        failureReason: 'command-spawn-failed',
        diagnosticReason: diagnostics.reason,
        diagnosticNotes: mergeDiagnosticNotes(windowsLabviewTcpSettings.notes, diagnostics.notes),
        diagnosticLogSourcePath: diagnostics.sourcePath,
        diagnosticLogArtifactPath: diagnostics.artifactPath,
        labviewIniPath: windowsLabviewTcpSettings.labviewIniPath,
        labviewTcpPort: windowsLabviewTcpSettings.labviewTcpPort,
        headlessDiagnosticArtifactPaths: diagnostics.headlessArtifactPaths,
        executable: effectiveExecutionContext.commandPlan.executable,
        args: effectiveExecutionContext.commandPlan.args,
        startedAt,
        completedAt,
        durationMs,
        signal: processError.signal,
        stdoutFilePath: record.artifactPlan.runtimeStdoutFilePath,
        stderrFilePath: record.artifactPlan.runtimeStderrFilePath
      };
    }
  };

  const initialResult = await executeAttempt();
  if (shouldAttemptLinuxHeadlessRecovery(record, initialResult)) {
    const recovery = await attemptLabviewCliHeadlessSessionReset(
      'Linux',
      record,
      deps,
      effectiveExecutionContext,
      windowsLabviewTcpSettings.labviewTcpPort
    );
    const retriedResult = await executeAttempt();
    return buildRecoveredExecutionResult(
      initialResult,
      recovery,
      retriedResult,
      LINUX_HEADLESS_RECOVERY_NOTE
    );
  }

  if (shouldAttemptWindowsHeadlessRecovery(record, initialResult)) {
    const recovery = await attemptLabviewCliHeadlessSessionReset(
      'Windows',
      record,
      deps,
      effectiveExecutionContext,
      initialResult.labviewTcpPort ?? windowsLabviewTcpSettings.labviewTcpPort
    );
    const retriedResult = await executeAttempt();
    return buildRecoveredExecutionResult(
      initialResult,
      recovery,
      retriedResult,
      WINDOWS_HEADLESS_RECOVERY_NOTE
    );
  }

  return initialResult;
}

async function persistRuntimeProcessObservation(
  record: ComparisonReportPacketRecord,
  commandResult: RunCommandResult,
  deps: {
    writeFile: typeof fs.writeFile;
    mkdir: typeof fs.mkdir;
    unlinkFile: typeof fs.unlink;
    pathExists: (filePath: string) => Promise<boolean>;
  }
): Promise<
  | {
      artifactPath: string;
      bannerSnapshot?: RuntimeProcessObservation;
      exitSnapshot?: RuntimeProcessObservation;
    }
  | undefined
> {
  if (!commandResult.processObservation && !commandResult.exitProcessObservation) {
    if (await deps.pathExists(record.artifactPlan.runtimeProcessObservationFilePath)) {
      try {
        await deps.unlinkFile(record.artifactPlan.runtimeProcessObservationFilePath);
      } catch {
        // Preserve deterministic execution results even if stale cleanup fails.
      }
    }
    return undefined;
  }

  await deps.mkdir(path.dirname(record.artifactPlan.runtimeProcessObservationFilePath), {
    recursive: true
  });
  await deps.writeFile(
    record.artifactPlan.runtimeProcessObservationFilePath,
    JSON.stringify(
      {
        bannerSnapshot: commandResult.processObservation,
        exitSnapshot: commandResult.exitProcessObservation
      },
      null,
      2
    ),
    'utf8'
  );

  return {
    artifactPath: record.artifactPlan.runtimeProcessObservationFilePath,
    bannerSnapshot: commandResult.processObservation,
    exitSnapshot: commandResult.exitProcessObservation
  };
}

async function persistRuntimePreflightObservation(
  record: ComparisonReportPacketRecord,
  options: {
    processObservation?: RuntimeProcessObservation;
    listenerObservations: WindowsTcpListenerObservation[];
    writeFile: typeof fs.writeFile;
    mkdir: typeof fs.mkdir;
    unlinkFile: typeof fs.unlink;
    pathExists: (filePath: string) => Promise<boolean>;
  }
): Promise<string | undefined> {
  if (!options.processObservation && options.listenerObservations.length === 0) {
    if (await options.pathExists(record.artifactPlan.runtimeProcessObservationFilePath)) {
      try {
        await options.unlinkFile(record.artifactPlan.runtimeProcessObservationFilePath);
      } catch {
        // Preserve deterministic execution results even if stale cleanup fails.
      }
    }
    return undefined;
  }

  await options.mkdir(path.dirname(record.artifactPlan.runtimeProcessObservationFilePath), {
    recursive: true
  });
  await options.writeFile(
    record.artifactPlan.runtimeProcessObservationFilePath,
    JSON.stringify(
      {
        preflightSnapshot: options.processObservation,
        preflightTcpListeners: options.listenerObservations
      },
      null,
      2
    ),
    'utf8'
  );

  return record.artifactPlan.runtimeProcessObservationFilePath;
}

interface CapturedRuntimeDiagnostics {
  reason?: string;
  notes: string[];
  sourcePath?: string;
  artifactPath?: string;
  headlessArtifactPaths?: string[];
}

interface RuntimeDiagnosticPathMapping {
  runtimeRoot: string;
  hostRoot: string;
}

interface RuntimeTextReplacement {
  from: string;
  to: string;
}

const WINDOWS_CONTAINER_WORKSPACE_ROOT = 'C:\\vi-history-suite';
const WINDOWS_CONTAINER_TEMP_ROOT = `${WINDOWS_CONTAINER_WORKSPACE_ROOT}\\container-temp`;
const LINUX_CONTAINER_WORKSPACE_ROOT = '/workspace';
const LINUX_CONTAINER_TEMP_ROOT = `${LINUX_CONTAINER_WORKSPACE_ROOT}/container-temp`;
const WINDOWS_CONTAINER_OPEN_APP_TIMEOUT_SECONDS = 180;
const WINDOWS_CONTAINER_AFTER_LAUNCH_TIMEOUT_SECONDS = 180;
const WINDOWS_CONTAINER_PRELAUNCH_WAIT_SECONDS = 8;
const WINDOWS_CONTAINER_STARTUP_RETRY_COUNT = 1;
const WINDOWS_CONTAINER_RETRY_DELAY_SECONDS = 8;
const LINUX_HEADLESS_RECOVERY_NOTE =
  'Attempted Linux headless session reset via LabVIEWCLI CloseLabVIEW after recursive-load diagnosis, then retried the pair once.';
const WINDOWS_HEADLESS_RECOVERY_NOTE =
  'Attempted Windows headless session reset via LabVIEWCLI CloseLabVIEW after call-by-reference diagnosis, then retried the pair once.';
const HEADLESS_SESSION_RESET_STDOUT_FILENAME = 'headless-session-reset-stdout.txt';
const HEADLESS_SESSION_RESET_STDERR_FILENAME = 'headless-session-reset-stderr.txt';
const DEFAULT_WINDOWS_LABVIEW_TCP_PORT = 3363;

function resolveEffectiveRuntimePlatform(
  selection: ComparisonReportPacketRecord['runtimeSelection']
): ComparisonReportPacketRecord['runtimeSelection']['platform'] {
  return selection.containerRuntimePlatform ?? selection.platform;
}

export async function resolveWindowsLabviewTcpSettings(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan,
  deps: {
    readFile: typeof fs.readFile;
    processPlatform: NodeJS.Platform;
  }
): Promise<WindowsLabviewTcpSettings> {
  if (
    record.runtimeSelection.platform !== 'win32' ||
    record.runtimeSelection.engine !== 'labview-cli' ||
    record.runtimeSelection.provider !== 'host-native'
  ) {
    return { notes: [] };
  }

  const labviewPath = extractCommandOptionValue(commandPlan.args, '-LabVIEWPath')?.trim();
  if (!labviewPath) {
    return { notes: [] };
  }

  return resolveWindowsLabviewTcpSettingsForLabviewPath(labviewPath, {
    readFile: deps.readFile,
    processPlatform: deps.processPlatform
  });
}

export async function resolveWindowsLabviewTcpSettingsForLabviewPath(
  labviewPath: string,
  deps: {
    readFile: typeof fs.readFile;
    processPlatform?: NodeJS.Platform;
  }
): Promise<WindowsLabviewTcpSettings> {
  const labviewIniPath = path.win32.join(path.win32.dirname(labviewPath), 'LabVIEW.ini');
  const hostReadableLabviewIniPath =
    resolveHostReadableWindowsPath(labviewIniPath, deps.processPlatform ?? process.platform) ??
    labviewIniPath;
  let iniText: string;
  try {
    iniText = await deps.readFile(hostReadableLabviewIniPath, 'utf8');
  } catch {
    return {
      labviewIniPath,
      notes: [
        `Selected LabVIEW.ini was not readable at ${labviewIniPath}, so VI Server port derivation remained implicit.`
      ]
    };
  }

  const enabledMatch = iniText.match(/^\s*server\.tcp\.enabled\s*=\s*(true|false)\s*$/im);
  const portMatch = iniText.match(/^\s*server\.tcp\.port\s*=\s*(\d+)\s*$/im);
  const tcpEnabled = enabledMatch ? enabledMatch[1].toLowerCase() === 'true' : true;
  if (!tcpEnabled) {
    return {
      labviewIniPath,
      notes: [
        `Selected LabVIEW.ini at ${labviewIniPath} disables VI Server TCP, so no explicit -PortNumber was derived.`
      ]
    };
  }

  const labviewTcpPort = portMatch
    ? Number.parseInt(portMatch[1], 10)
    : DEFAULT_WINDOWS_LABVIEW_TCP_PORT;

  return {
    labviewIniPath,
    labviewTcpPort,
    notes: [
      `Derived VI Server TCP port ${String(labviewTcpPort)} from ${labviewIniPath} and passed it explicitly to LabVIEW CLI.`
    ]
  };
}

export function appendLabviewCliPortNumberArg(
  args: string[],
  labviewTcpPort: number | undefined
): string[] {
  if (!Number.isInteger(labviewTcpPort) || (labviewTcpPort ?? 0) <= 0) {
    return [...args];
  }

  const existingPortIndex = args.findIndex((argument) => argument.toLowerCase() === '-portnumber');
  if (existingPortIndex >= 0) {
    const updated = [...args];
    updated[existingPortIndex + 1] = String(labviewTcpPort);
    return updated;
  }

  return [...args, '-PortNumber', String(labviewTcpPort)];
}

async function preflightWindowsHostRuntimeSurface(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan,
  windowsLabviewTcpSettings: WindowsLabviewTcpSettings,
  deps: {
    enforceWindowsHostPreflight: boolean;
    processPlatform: NodeJS.Platform;
    observeWindowsProcesses: (
      options: ObserveWindowsProcessesOptions
    ) => Promise<RuntimeProcessObservation | undefined>;
    observeWindowsTcpListeners: (
      options: ObserveWindowsTcpListenersOptions
    ) => Promise<WindowsTcpListenerObservation[]>;
    writeFile: typeof fs.writeFile;
    mkdir: typeof fs.mkdir;
    unlinkFile: typeof fs.unlink;
    pathExists: (filePath: string) => Promise<boolean>;
  }
): Promise<
  | {
      blockedExecution: ComparisonReportRuntimeExecution;
    }
  | undefined
> {
  if (
    !deps.enforceWindowsHostPreflight ||
    record.runtimeSelection.platform !== 'win32' ||
    record.runtimeSelection.provider !== 'host-native'
  ) {
    return undefined;
  }

  const processObservation = await deps.observeWindowsProcesses({
    hostPlatform: deps.processPlatform,
    runtimePlatform: record.runtimeSelection.platform,
    trigger: 'preflight'
  });
  const listenerObservations = await deps.observeWindowsTcpListeners({
    hostPlatform: deps.processPlatform,
    runtimePlatform: record.runtimeSelection.platform,
    localPorts:
      Number.isInteger(windowsLabviewTcpSettings.labviewTcpPort) &&
      (windowsLabviewTcpSettings.labviewTcpPort ?? 0) > 0
        ? [windowsLabviewTcpSettings.labviewTcpPort as number]
        : []
  });

  const diagnosticNotes = mergeDiagnosticNotes(
    windowsLabviewTcpSettings.notes,
    processObservation?.observedProcesses.length
      ? [
          `Windows host preflight observed existing runtime processes before launch: ${describeObservedRuntimeProcesses(
            processObservation.observedProcesses
          )}.`
        ]
      : [],
    listenerObservations.length
      ? [
          `Windows host preflight observed an existing TCP listener on the governed VI Server port before launch: ${describeObservedWindowsTcpListeners(
            listenerObservations
          )}.`
        ]
      : []
  );

  if (diagnosticNotes.length === windowsLabviewTcpSettings.notes.length) {
    return undefined;
  }

  const processObservationArtifactPath = await persistRuntimePreflightObservation(record, {
    processObservation,
    listenerObservations,
    writeFile: deps.writeFile,
    mkdir: deps.mkdir,
    unlinkFile: deps.unlinkFile,
    pathExists: deps.pathExists
  });

  return {
    blockedExecution: {
      state: 'not-available',
      attempted: false,
      reportExists: false,
      blockedReason: 'windows-host-runtime-surface-contaminated',
      diagnosticNotes,
      labviewIniPath: windowsLabviewTcpSettings.labviewIniPath,
      labviewTcpPort: windowsLabviewTcpSettings.labviewTcpPort,
      executable: commandPlan.executable,
      args: commandPlan.args,
      stdoutFilePath: record.artifactPlan.runtimeStdoutFilePath,
      stderrFilePath: record.artifactPlan.runtimeStderrFilePath,
      processObservationArtifactPath,
      processObservationCapturedAt: processObservation?.capturedAt,
      processObservationTrigger: processObservation?.trigger,
      observedProcessNames: processObservation?.observedProcessNames,
      labviewProcessObserved: processObservation?.labviewProcessObserved,
      labviewCliProcessObserved: processObservation?.labviewCliProcessObserved,
      lvcompareProcessObserved: processObservation?.lvcompareProcessObserved
    }
  };
}

function describeObservedRuntimeProcesses(processes: RuntimeObservedProcess[]): string {
  const descriptions = [...new Map(
    processes.map((processInfo) => [
      `${processInfo.imageName}:${String(processInfo.pid)}`,
      `${processInfo.imageName} (pid ${String(processInfo.pid)})`
    ])
  ).values()];
  return descriptions.join(' | ');
}

function describeObservedWindowsTcpListeners(listeners: WindowsTcpListenerObservation[]): string {
  return listeners
    .map((listener) =>
      `${listener.processName ?? `pid ${String(listener.pid)}`} listening on ${listener.localAddress}:${String(
        listener.localPort
      )}`
    )
    .join(' | ');
}

async function captureRuntimeDiagnostics(
  record: ComparisonReportPacketRecord,
  stdout: string,
  deps: {
    stderr: string;
    pathExists: (filePath: string) => Promise<boolean>;
    copyFile: typeof fs.copyFile;
    unlinkFile: typeof fs.unlink;
    readFile: typeof fs.readFile;
    readdir?: typeof fs.readdir;
    mkdir: typeof fs.mkdir;
    removePath?: typeof fs.rm;
    processPlatform: NodeJS.Platform;
    expectedLabviewPath?: string;
    diagnosticPathMapping?: RuntimeDiagnosticPathMapping;
  }
): Promise<CapturedRuntimeDiagnostics> {
  const clearStaleArtifactIfPresent = async (): Promise<void> => {
    if (!(await deps.pathExists(record.artifactPlan.runtimeDiagnosticLogFilePath))) {
      return;
    }

    try {
      await deps.unlinkFile(record.artifactPlan.runtimeDiagnosticLogFilePath);
    } catch {
      // Preserve deterministic execution results even if stale cleanup fails.
    }
  };

  const headlessDiagnostics = await captureLinuxHeadlessDiagnostics(record, {
    pathExists: deps.pathExists,
    copyFile: deps.copyFile,
    readFile: deps.readFile,
    readdir: deps.readdir ?? fs.readdir,
    mkdir: deps.mkdir,
    removePath: deps.removePath ?? fs.rm,
    processPlatform: deps.processPlatform,
    diagnosticPathMapping: deps.diagnosticPathMapping
  });
  const stderrClassification = classifyLabviewCliDiagnosticText(deps.stderr, deps.expectedLabviewPath);

  const diagnosticLogSourcePath = parseLabviewCliDiagnosticLogPath(stdout);
  if (!diagnosticLogSourcePath) {
    await clearStaleArtifactIfPresent();
    return {
      reason: stderrClassification.reason ?? headlessDiagnostics.reason,
      notes: mergeDiagnosticNotes(stderrClassification.notes, headlessDiagnostics.notes),
      headlessArtifactPaths: headlessDiagnostics.artifactPaths
    };
  }

  const hostReadablePath = resolveHostReadableDiagnosticPath(
    diagnosticLogSourcePath,
    deps.processPlatform,
    deps.diagnosticPathMapping
  );
  if (!hostReadablePath || !(await deps.pathExists(hostReadablePath))) {
    await clearStaleArtifactIfPresent();
    return {
      notes: mergeDiagnosticNotes(
        stderrClassification.notes,
        ['LabVIEW CLI reported a diagnostic log path, but the log file was not readable from the active host.'],
        headlessDiagnostics.notes
      ),
      sourcePath: diagnosticLogSourcePath,
      reason:
        stderrClassification.reason ??
        headlessDiagnostics.reason ??
        'runtime-diagnostic-log-unreadable',
      headlessArtifactPaths: headlessDiagnostics.artifactPaths
    };
  }

  await deps.mkdir(path.dirname(record.artifactPlan.runtimeDiagnosticLogFilePath), { recursive: true });
  await deps.copyFile(hostReadablePath, record.artifactPlan.runtimeDiagnosticLogFilePath);
  const diagnosticText = await deps.readFile(hostReadablePath, 'utf8');
  const classification = classifyLabviewCliDiagnosticText(diagnosticText, deps.expectedLabviewPath);

  return {
    reason: stderrClassification.reason ?? classification.reason ?? headlessDiagnostics.reason,
    notes: mergeDiagnosticNotes(stderrClassification.notes, classification.notes, headlessDiagnostics.notes),
    sourcePath: diagnosticLogSourcePath,
    artifactPath: record.artifactPlan.runtimeDiagnosticLogFilePath,
    headlessArtifactPaths: headlessDiagnostics.artifactPaths
  };
}

function shouldAttemptLinuxHeadlessRecovery(
  record: ComparisonReportPacketRecord,
  execution: ComparisonReportRuntimeExecution
): boolean {
  return (
    resolveEffectiveRuntimePlatform(record.runtimeSelection) === 'linux' &&
    record.runtimeSelection.engine === 'labview-cli' &&
    execution.state === 'failed' &&
    execution.diagnosticReason === 'linux-headless-recursive-load'
  );
}

function shouldAttemptWindowsHeadlessRecovery(
  record: ComparisonReportPacketRecord,
  execution: ComparisonReportRuntimeExecution
): boolean {
  return (
    record.runtimeSelection.platform === 'win32' &&
    record.runtimeSelection.engine === 'labview-cli' &&
    execution.state === 'failed' &&
    execution.diagnosticReason === 'labview-cli-call-by-reference' &&
    isHeadlessLabviewCliExecution(execution.args)
  );
}

function isHeadlessLabviewCliExecution(args: string[] | undefined): boolean {
  if (!args || args.length === 0) {
    return false;
  }

  const headlessIndex = args.findIndex((argument) => argument.toLowerCase() === '-headless');
  return headlessIndex >= 0;
}

async function attemptLabviewCliHeadlessSessionReset(
  platformLabel: 'Linux' | 'Windows',
  record: ComparisonReportPacketRecord,
  deps: {
    runCommand: (commandPlan: ComparisonCommandPlan) => Promise<RunCommandResult>;
    nowMs: () => number;
    mkdir: typeof fs.mkdir;
    writeFile: typeof fs.writeFile;
  },
  executionContext: PreparedExecutionContext,
  labviewTcpPort?: number
): Promise<{
  notes: string[];
  durationMs: number;
  executable: string;
  args: string[];
  exitCode?: number;
  stdoutFilePath: string;
  stderrFilePath: string;
}> {
  const startedMs = deps.nowMs();
  const baseCloseCommandPlan = buildLabviewCliCloseLabviewCommandPlan(
    record.runtimeSelection.labviewCli?.path ?? 'LabVIEWCLI',
    record.runtimeSelection.labviewExe?.path,
    labviewTcpPort
  );
  const linuxContainerImage = record.runtimeSelection.containerImage?.trim();
  const closeCommandPlan =
    record.runtimeSelection.provider === 'linux-container' && linuxContainerImage
      ? buildLinuxContainerCommandPlan(record, baseCloseCommandPlan, {
          hostReportDirectory: path.dirname(executionContext.reportFilePath),
          hostTempDirectory:
            executionContext.diagnosticPathMapping?.hostRoot ??
            path.join(path.dirname(executionContext.reportFilePath), 'container-temp'),
          containerWorkspaceRoot: LINUX_CONTAINER_WORKSPACE_ROOT,
          containerImage: linuxContainerImage,
          processPlatform: executionContext.reportFilePath.includes('\\') ? 'win32' : 'linux'
        }) ?? baseCloseCommandPlan
      : baseCloseCommandPlan;
  const stdoutFilePath = path.join(
    record.artifactPlan.reportDirectory,
    HEADLESS_SESSION_RESET_STDOUT_FILENAME
  );
  const stderrFilePath = path.join(
    record.artifactPlan.reportDirectory,
    HEADLESS_SESSION_RESET_STDERR_FILENAME
  );

  try {
    const result = await deps.runCommand(closeCommandPlan);
    const durationMs = Math.max(0, deps.nowMs() - startedMs);
    await deps.mkdir(record.artifactPlan.reportDirectory, { recursive: true });
    await deps.writeFile(stdoutFilePath, result.stdout, 'utf8');
    await deps.writeFile(stderrFilePath, result.stderr, 'utf8');
    if (result.exitCode === 0) {
      return {
        notes: [
          `${platformLabel} headless session reset via LabVIEWCLI CloseLabVIEW succeeded in ${String(
            durationMs
          )}ms before retry.`
        ],
        durationMs,
        executable: closeCommandPlan.executable,
        args: closeCommandPlan.args,
        exitCode: result.exitCode,
        stdoutFilePath,
        stderrFilePath
      };
    }

    return {
      notes: [
        `${platformLabel} headless session reset via LabVIEWCLI CloseLabVIEW exited with code ${String(
          result.exitCode
        )} before retry.`
      ],
      durationMs,
      executable: closeCommandPlan.executable,
      args: closeCommandPlan.args,
      exitCode: result.exitCode,
      stdoutFilePath,
      stderrFilePath
    };
  } catch (error) {
    const durationMs = Math.max(0, deps.nowMs() - startedMs);
    const message = error instanceof Error ? error.message : String(error);
    return {
      notes: [
        `${platformLabel} headless session reset via LabVIEWCLI CloseLabVIEW failed before retry: ${message}.`
      ],
      durationMs,
      executable: closeCommandPlan.executable,
      args: closeCommandPlan.args,
      stdoutFilePath,
      stderrFilePath
    };
  }
}

function buildRecoveredExecutionResult(
  initialResult: ComparisonReportRuntimeExecution,
  recovery: {
    notes: string[];
    durationMs: number;
    executable: string;
    args: string[];
    exitCode?: number;
    stdoutFilePath: string;
    stderrFilePath: string;
  },
  retriedResult: ComparisonReportRuntimeExecution,
  recoveryNote: string
): ComparisonReportRuntimeExecution {
  return {
    ...retriedResult,
    startedAt: initialResult.startedAt ?? retriedResult.startedAt,
    durationMs:
      (initialResult.durationMs ?? 0) +
      recovery.durationMs +
      (retriedResult.durationMs ?? 0),
    diagnosticNotes: mergeDiagnosticNotes(
      retriedResult.diagnosticNotes,
      [recoveryNote],
      recovery.notes
    ),
    headlessSessionResetExecutable: recovery.executable,
    headlessSessionResetArgs: recovery.args,
    headlessSessionResetExitCode: recovery.exitCode,
    headlessSessionResetStdoutFilePath: recovery.stdoutFilePath,
    headlessSessionResetStderrFilePath: recovery.stderrFilePath
  };
}

function buildLabviewCliCloseLabviewCommandPlan(
  executable: string,
  labviewPath?: string,
  labviewTcpPort?: number
): ComparisonCommandPlan {
  const args = ['-LogToConsole', 'TRUE', '-OperationName', 'CloseLabVIEW'];
  if (labviewPath?.trim()) {
    args.push('-LabVIEWPath', labviewPath.trim());
  }
  if (Number.isInteger(labviewTcpPort) && (labviewTcpPort ?? 0) > 0) {
    args.push('-PortNumber', String(labviewTcpPort));
  }
  args.push('-Headless');

  return {
    executable,
    args
  };
}

async function captureLinuxHeadlessDiagnostics(
  record: ComparisonReportPacketRecord,
  deps: {
    pathExists: (filePath: string) => Promise<boolean>;
    copyFile: typeof fs.copyFile;
    readFile: typeof fs.readFile;
    readdir: typeof fs.readdir;
    mkdir: typeof fs.mkdir;
    removePath: typeof fs.rm;
    processPlatform: NodeJS.Platform;
    diagnosticPathMapping?: RuntimeDiagnosticPathMapping;
  }
): Promise<{
  reason?: string;
  notes: string[];
  artifactPaths: string[];
}> {
  const effectiveRuntimePlatform = resolveEffectiveRuntimePlatform(record.runtimeSelection);
  if (effectiveRuntimePlatform !== 'linux') {
    return {
      notes: [],
      artifactPaths: []
    };
  }

  const sourceRoot =
    deps.processPlatform === 'linux'
      ? '/tmp'
      : deps.diagnosticPathMapping?.hostRoot ?? path.join(record.artifactPlan.reportDirectory, 'container-temp');
  const artifactRoot = path.join(record.artifactPlan.reportDirectory, 'headless-diagnostics');
  try {
    await deps.removePath(artifactRoot, {
      recursive: true,
      force: true
    });
  } catch {
    // Preserve deterministic execution results even if stale cleanup fails.
  }

  let entryNames: string[] = [];
  try {
    entryNames = (await deps.readdir(sourceRoot)) as unknown as string[];
  } catch {
    return {
      notes: [],
      artifactPaths: []
    };
  }

  const selectedNames = entryNames
    .filter(
      (name) =>
        name === 'LVStatus.txt' ||
        /^(labview|lvrt)_.+_headless_.+_cur\.txt$/i.test(name)
    )
    .sort((left, right) => left.localeCompare(right));

  if (selectedNames.length === 0) {
    return {
      notes: [],
      artifactPaths: []
    };
  }

  const artifactPaths: string[] = [];
  const notes: string[] = [];
  let reason: string | undefined;

  await deps.mkdir(artifactRoot, { recursive: true });
  for (const name of selectedNames) {
    const sourcePath = path.posix.join(sourceRoot, name);
    if (!(await deps.pathExists(sourcePath))) {
      continue;
    }

    const artifactPath = path.join(artifactRoot, name);
    await deps.copyFile(sourcePath, artifactPath);
    artifactPaths.push(artifactPath);

    let diagnosticText = '';
    try {
      diagnosticText = await deps.readFile(sourcePath, 'utf8');
    } catch {
      continue;
    }

    if (/Recursive load during LEIF load!/i.test(diagnosticText)) {
      reason = reason ?? 'linux-headless-recursive-load';
      const mainPanelMatch = diagnosticText.match(/loading ([^\r\n]+GSW_MainPanel\.vi)/i);
      notes.push(
        mainPanelMatch
          ? `Retained Linux headless status reported a recursive LEIF load while opening ${mainPanelMatch[1]}.`
          : 'Retained Linux headless status reported a recursive LEIF load.'
      );
    }
  }

  return {
    reason,
    notes,
    artifactPaths
  };
}

export interface PreparedExecutionContext {
  outcome: 'ready' | 'blocked';
  commandPlan: ComparisonCommandPlan;
  reportFilePath: string;
  failureReason?: string;
  diagnosticPathMapping?: RuntimeDiagnosticPathMapping;
  reportIdentityFilenames?: string[];
  reportTextReplacements?: RuntimeTextReplacement[];
}

async function prepareExecutionContext(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan,
  interopWorkspaceRoot: string | undefined,
  deps: {
    mkdir: typeof fs.mkdir;
    writeFile: typeof fs.writeFile;
    processPlatform: NodeJS.Platform;
    leftBlob: Buffer;
    rightBlob: Buffer;
  }
): Promise<PreparedExecutionContext> {
  if (record.runtimeSelection.provider === 'windows-container') {
    return prepareWindowsContainerExecutionContext(record, commandPlan, interopWorkspaceRoot, deps);
  }

  if (record.runtimeSelection.provider === 'linux-container') {
    return prepareLinuxContainerExecutionContext(record, commandPlan, interopWorkspaceRoot, deps);
  }

  if (!requiresWindowsInterop(resolveEffectiveRuntimePlatform(record.runtimeSelection), deps.processPlatform)) {
    return {
      outcome: 'ready',
      commandPlan,
      reportFilePath: record.artifactPlan.reportFilePath
    };
  }

  if (!interopWorkspaceRoot?.trim()) {
    return {
      outcome: 'blocked',
      commandPlan,
      reportFilePath: record.artifactPlan.reportFilePath,
      failureReason: 'windows-interop-root-unavailable'
    };
  }

  const interopLayout = buildWindowsInteropLayout(record, interopWorkspaceRoot);
  await deps.mkdir(interopLayout.reportDirectory, { recursive: true });
  await deps.mkdir(interopLayout.stagingDirectory, { recursive: true });
  await deps.writeFile(interopLayout.leftFilePath, deps.leftBlob);
  await deps.writeFile(interopLayout.rightFilePath, deps.rightBlob);

  const interopCommandPlan = buildWindowsInteropCommandPlan(record, commandPlan, interopLayout);
  if (!interopCommandPlan) {
    return {
      outcome: 'blocked',
      commandPlan,
      reportFilePath: record.artifactPlan.reportFilePath,
      failureReason: 'windows-path-normalization-failed'
    };
  }

  return {
    outcome: 'ready',
    commandPlan: interopCommandPlan,
    reportFilePath: interopLayout.reportFilePath
  };
}

async function finalizeExecutedReport(
  record: ComparisonReportPacketRecord,
  executionContext: PreparedExecutionContext,
  options: {
    validateIdentity: boolean;
  },
  deps: {
    pathExists: (filePath: string) => Promise<boolean>;
    copyFile: typeof fs.copyFile;
    copyDirectory: typeof fs.cp;
    removePath: typeof fs.rm;
    readFile: typeof fs.readFile;
    writeFile: typeof fs.writeFile;
    mkdir: typeof fs.mkdir;
  }
): Promise<{
  reportExists: boolean;
  validationNotes: string[];
}> {
  const executedReportExists = await deps.pathExists(executionContext.reportFilePath);
  if (!executedReportExists) {
    return {
      reportExists: false,
      validationNotes: []
    };
  }

  if (options.validateIdentity) {
    const validationNotes = await validateExecutedReportIdentity(record, executionContext.reportFilePath, {
      readFile: deps.readFile,
      expectedFilenames:
        executionContext.reportIdentityFilenames ?? [
          record.stagedRevisionPlan.leftFilename,
          record.stagedRevisionPlan.rightFilename
        ]
    });
    if (validationNotes.length > 0) {
      await clearStaleExecutedReportArtifacts(record, executionContext, {
        removePath: deps.removePath
      });
      return {
        reportExists: false,
        validationNotes
      };
    }
  }

  if (executionContext.reportFilePath === record.artifactPlan.reportFilePath) {
    return {
      reportExists: true,
      validationNotes: []
    };
  }

  await deps.mkdir(path.dirname(record.artifactPlan.reportFilePath), { recursive: true });
  if (executionContext.reportTextReplacements && executionContext.reportTextReplacements.length > 0) {
    try {
      const reportText = await deps.readFile(executionContext.reportFilePath, 'utf8');
      await deps.writeFile(
        record.artifactPlan.reportFilePath,
        applyRuntimeTextReplacements(reportText, executionContext.reportTextReplacements),
        'utf8'
      );
    } catch {
      await deps.copyFile(executionContext.reportFilePath, record.artifactPlan.reportFilePath);
    }
  } else {
    await deps.copyFile(executionContext.reportFilePath, record.artifactPlan.reportFilePath);
  }
  await copyReportAssetsDirectory(executionContext.reportFilePath, record.artifactPlan.reportFilePath, {
    pathExists: deps.pathExists,
    copyDirectory: deps.copyDirectory,
    mkdir: deps.mkdir
  });
  return {
    reportExists: true,
    validationNotes: []
  };
}

async function clearStaleExecutedReportArtifacts(
  record: ComparisonReportPacketRecord,
  executionContext: PreparedExecutionContext,
  deps: {
    removePath: typeof fs.rm;
  }
): Promise<void> {
  const reportPaths = new Set([
    executionContext.reportFilePath,
    record.artifactPlan.reportFilePath
  ]);

  for (const reportFilePath of reportPaths) {
    for (const targetPath of [reportFilePath, buildReportAssetsDirectoryPath(reportFilePath)]) {
      try {
        await deps.removePath(targetPath, {
          recursive: true,
          force: true
        });
      } catch {
        // Fail closed on the subsequent existence checks even if stale cleanup cannot complete.
      }
    }
  }
}

async function validateExecutedReportIdentity(
  record: ComparisonReportPacketRecord,
  reportFilePath: string,
  deps: {
    readFile: typeof fs.readFile;
    expectedFilenames: string[];
  }
): Promise<string[]> {
  let reportText: string;
  try {
    reportText = await deps.readFile(reportFilePath, 'utf8');
  } catch {
    return [
      'Generated comparison report could not be read back for staged-file validation and was discarded.'
    ];
  }

  const expectedFilenames = deps.expectedFilenames;
  const missingFilenames = expectedFilenames.filter((filename) => !reportText.includes(filename));
  if (missingFilenames.length === 0) {
    return [];
  }

  return [
    `Generated comparison report did not reference the current staged revisions (${expectedFilenames.join(', ')}) and was discarded as stale output.`
  ];
}

interface WindowsInteropLayout {
  reportDirectory: string;
  stagingDirectory: string;
  leftFilePath: string;
  rightFilePath: string;
  reportFilePath: string;
}

interface LinuxContainerWorkspaceLayout {
  reportDirectory: string;
  stagingDirectory: string;
  leftFilename: string;
  rightFilename: string;
  reportFilename: string;
  leftFilePath: string;
  rightFilePath: string;
  reportFilePath: string;
  reportIdentityFilenames: string[];
  reportTextReplacements: RuntimeTextReplacement[];
}

function buildWindowsInteropLayout(
  record: ComparisonReportPacketRecord,
  interopWorkspaceRoot: string
): WindowsInteropLayout {
  const reportDirectory = path.join(
    interopWorkspaceRoot,
    'reports',
    record.artifactPlan.repoId,
    record.artifactPlan.fileId
  );
  const stagingDirectory = path.join(reportDirectory, 'staging');
  return {
    reportDirectory,
    stagingDirectory,
    leftFilePath: path.join(stagingDirectory, record.stagedRevisionPlan.leftFilename),
    rightFilePath: path.join(stagingDirectory, record.stagedRevisionPlan.rightFilename),
    reportFilePath: path.join(reportDirectory, record.artifactPlan.reportFilename)
  };
}

function buildLinuxContainerWorkspaceLayout(
  record: ComparisonReportPacketRecord,
  hostLayout: WindowsInteropLayout
): LinuxContainerWorkspaceLayout {
  const leftFilename = buildLinuxContainerRuntimeFilenameAlias(record.stagedRevisionPlan.leftFilename);
  const rightFilename = buildLinuxContainerRuntimeFilenameAlias(record.stagedRevisionPlan.rightFilename);
  const reportFilename = buildLinuxContainerRuntimeFilenameAlias(record.artifactPlan.reportFilename);
  const replacements: RuntimeTextReplacement[] = [];
  const aliasAssetsDirectory = buildReportAssetsDirectoryPath(reportFilename);
  const canonicalAssetsDirectory = buildReportAssetsDirectoryPath(record.artifactPlan.reportFilename);

  if (leftFilename !== record.stagedRevisionPlan.leftFilename) {
    replacements.push({
      from: leftFilename,
      to: record.stagedRevisionPlan.leftFilename
    });
  }
  if (rightFilename !== record.stagedRevisionPlan.rightFilename) {
    replacements.push({
      from: rightFilename,
      to: record.stagedRevisionPlan.rightFilename
    });
  }
  if (reportFilename !== record.artifactPlan.reportFilename) {
    replacements.push({
      from: reportFilename,
      to: record.artifactPlan.reportFilename
    });
  }
  if (aliasAssetsDirectory !== canonicalAssetsDirectory) {
    replacements.push({
      from: aliasAssetsDirectory,
      to: canonicalAssetsDirectory
    });
  }

  return {
    reportDirectory: hostLayout.reportDirectory,
    stagingDirectory: hostLayout.stagingDirectory,
    leftFilename,
    rightFilename,
    reportFilename,
    leftFilePath: path.join(hostLayout.stagingDirectory, leftFilename),
    rightFilePath: path.join(hostLayout.stagingDirectory, rightFilename),
    reportFilePath: path.join(hostLayout.reportDirectory, reportFilename),
    reportIdentityFilenames: [leftFilename, rightFilename],
    reportTextReplacements: replacements
  };
}

function buildLinuxContainerRuntimeFilenameAlias(filename: string): string {
  return filename.replace(/\s+/g, '_');
}

function applyRuntimeTextReplacements(
  reportText: string,
  replacements: RuntimeTextReplacement[]
): string {
  return [...replacements]
    .sort((left, right) => right.from.length - left.from.length)
    .reduce((updated, replacement) => updated.split(replacement.from).join(replacement.to), reportText);
}

export function buildWindowsInteropCommandPlan(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan,
  interopLayout: WindowsInteropLayout
): ComparisonCommandPlan | undefined {
  const executable = normalizeWindowsInteropExecutable(commandPlan.executable);
  if (!executable) {
    return undefined;
  }

  if (record.runtimeSelection.engine === 'labview-cli') {
    const args: string[] = [];
    for (let index = 0; index < commandPlan.args.length; index += 1) {
      const current = commandPlan.args[index];
      const next = commandPlan.args[index + 1];

      if (current === '-VI1' || current === '-vi1') {
        const leftFilePath = normalizeWindowsInteropPath(interopLayout.leftFilePath);
        if (!leftFilePath) {
          return undefined;
        }
        args.push(current, leftFilePath);
        index += 1;
        continue;
      }

      if (current === '-VI2' || current === '-vi2') {
        const rightFilePath = normalizeWindowsInteropPath(interopLayout.rightFilePath);
        if (!rightFilePath) {
          return undefined;
        }
        args.push(current, rightFilePath);
        index += 1;
        continue;
      }

      if (current === '-ReportPath' || current === '-reportPath') {
        const reportFilePath = normalizeWindowsInteropPath(interopLayout.reportFilePath);
        if (!reportFilePath) {
          return undefined;
        }
        args.push(current, reportFilePath);
        index += 1;
        continue;
      }

      if (current === '-LabVIEWPath') {
        const labviewPath = normalizeWindowsInteropPath(next ?? '');
        if (!labviewPath) {
          return undefined;
        }
        args.push(current, labviewPath);
        index += 1;
        continue;
      }

      args.push(current);
    }

    return {
      executable,
      args
    };
  }

  if (record.runtimeSelection.engine === 'lvcompare') {
    if (commandPlan.args.length < 2) {
      return undefined;
    }

    const leftFilePath = normalizeWindowsInteropPath(interopLayout.leftFilePath);
    const rightFilePath = normalizeWindowsInteropPath(interopLayout.rightFilePath);
    if (!leftFilePath || !rightFilePath) {
      return undefined;
    }

    const args = [
      leftFilePath,
      rightFilePath
    ];

    for (let index = 2; index < commandPlan.args.length; index += 1) {
      const current = commandPlan.args[index];
      const next = commandPlan.args[index + 1];
      if (current === '-lvpath') {
        const labviewPath = normalizeWindowsInteropPath(next ?? '');
        if (!labviewPath) {
          return undefined;
        }
        args.push(current, labviewPath);
        index += 1;
        continue;
      }

      args.push(current);
    }

    return {
      executable,
      args
    };
  }

  return undefined;
}

export async function prepareWindowsContainerExecutionContext(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan,
  interopWorkspaceRoot: string | undefined,
  deps: {
    mkdir: typeof fs.mkdir;
    writeFile: typeof fs.writeFile;
    processPlatform: NodeJS.Platform;
    leftBlob: Buffer;
    rightBlob: Buffer;
  }
): Promise<PreparedExecutionContext> {
  const containerImage =
    record.runtimeSelection.containerImage?.trim() ||
    record.runtimeSelection.windowsContainerImage?.trim();
  if (!containerImage) {
    return {
      outcome: 'blocked',
      commandPlan,
      reportFilePath: record.artifactPlan.reportFilePath,
      failureReason: 'container-image-unavailable'
    };
  }

  let hostLayout: WindowsInteropLayout;
  if (requiresWindowsInterop(record.runtimeSelection.platform, deps.processPlatform)) {
    if (!interopWorkspaceRoot?.trim()) {
      return {
        outcome: 'blocked',
        commandPlan,
        reportFilePath: record.artifactPlan.reportFilePath,
        failureReason: 'windows-interop-root-unavailable'
      };
    }

    hostLayout = buildWindowsInteropLayout(record, interopWorkspaceRoot);
    await deps.mkdir(hostLayout.reportDirectory, { recursive: true });
    await deps.mkdir(hostLayout.stagingDirectory, { recursive: true });
    await deps.writeFile(hostLayout.leftFilePath, deps.leftBlob);
    await deps.writeFile(hostLayout.rightFilePath, deps.rightBlob);
  } else {
    hostLayout = {
      reportDirectory: record.artifactPlan.reportDirectory,
      stagingDirectory: record.artifactPlan.stagingDirectory,
      leftFilePath: record.stagedRevisionPlan.leftFilePath,
      rightFilePath: record.stagedRevisionPlan.rightFilePath,
      reportFilePath: record.artifactPlan.reportFilePath
    };
  }

  const hostReportDirectory = normalizeWindowsInteropPath(hostLayout.reportDirectory);
  if (!hostReportDirectory) {
    return {
      outcome: 'blocked',
      commandPlan,
      reportFilePath: record.artifactPlan.reportFilePath,
      failureReason: 'windows-path-normalization-failed'
    };
  }

  const hostTempDirectory = path.join(hostLayout.reportDirectory, 'container-temp');
  const hostTempDirectoryWindows = path.win32.join(hostReportDirectory, 'container-temp');
  await deps.mkdir(hostTempDirectory, { recursive: true });

  const containerCommandPlan = buildWindowsContainerCommandPlan(record, commandPlan, {
    hostReportDirectory,
    hostTempDirectory: hostTempDirectoryWindows,
    containerWorkspaceRoot: WINDOWS_CONTAINER_WORKSPACE_ROOT,
    containerImage,
    processPlatform: deps.processPlatform
  });
  if (!containerCommandPlan) {
    return {
      outcome: 'blocked',
      commandPlan,
      reportFilePath: record.artifactPlan.reportFilePath,
      failureReason: 'container-command-build-failed'
    };
  }

  return {
    outcome: 'ready',
    commandPlan: containerCommandPlan,
    reportFilePath: hostLayout.reportFilePath,
    diagnosticPathMapping: {
      runtimeRoot: WINDOWS_CONTAINER_TEMP_ROOT,
      hostRoot: hostTempDirectory
    }
  };
}

export async function prepareLinuxContainerExecutionContext(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan,
  interopWorkspaceRoot: string | undefined,
  deps: {
    mkdir: typeof fs.mkdir;
    writeFile: typeof fs.writeFile;
    processPlatform: NodeJS.Platform;
    leftBlob: Buffer;
    rightBlob: Buffer;
  }
): Promise<PreparedExecutionContext> {
  const containerImage = record.runtimeSelection.containerImage?.trim();
  if (!containerImage) {
    return {
      outcome: 'blocked',
      commandPlan,
      reportFilePath: record.artifactPlan.reportFilePath,
      failureReason: 'container-image-unavailable'
    };
  }

  let hostLayout: WindowsInteropLayout;
  if (requiresWindowsInterop(resolveEffectiveRuntimePlatform(record.runtimeSelection), deps.processPlatform)) {
    if (!interopWorkspaceRoot?.trim()) {
      return {
        outcome: 'blocked',
        commandPlan,
        reportFilePath: record.artifactPlan.reportFilePath,
        failureReason: 'windows-interop-root-unavailable'
      };
    }

    hostLayout = buildWindowsInteropLayout(record, interopWorkspaceRoot);
    await deps.mkdir(hostLayout.reportDirectory, { recursive: true });
    await deps.mkdir(hostLayout.stagingDirectory, { recursive: true });
    await deps.writeFile(hostLayout.leftFilePath, deps.leftBlob);
    await deps.writeFile(hostLayout.rightFilePath, deps.rightBlob);
  } else {
    hostLayout = {
      reportDirectory: record.artifactPlan.reportDirectory,
      stagingDirectory: record.artifactPlan.stagingDirectory,
      leftFilePath: record.stagedRevisionPlan.leftFilePath,
      rightFilePath: record.stagedRevisionPlan.rightFilePath,
      reportFilePath: record.artifactPlan.reportFilePath
    };
  }

  const hostReportDirectory = requiresWindowsInterop(
    resolveEffectiveRuntimePlatform(record.runtimeSelection),
    deps.processPlatform
  )
    ? normalizeWindowsInteropPath(hostLayout.reportDirectory)
    : hostLayout.reportDirectory;
  if (!hostReportDirectory) {
    return {
      outcome: 'blocked',
      commandPlan,
      reportFilePath: record.artifactPlan.reportFilePath,
      failureReason: 'windows-path-normalization-failed'
    };
  }

  const hostTempDirectory = path.join(hostLayout.reportDirectory, 'container-temp');
  await deps.mkdir(hostTempDirectory, { recursive: true });
  const workspaceLayout = buildLinuxContainerWorkspaceLayout(record, hostLayout);
  if (workspaceLayout.leftFilePath !== hostLayout.leftFilePath) {
    await deps.writeFile(workspaceLayout.leftFilePath, deps.leftBlob);
  }
  if (workspaceLayout.rightFilePath !== hostLayout.rightFilePath) {
    await deps.writeFile(workspaceLayout.rightFilePath, deps.rightBlob);
  }

  const containerCommandPlan = buildLinuxContainerCommandPlan(record, commandPlan, {
    hostReportDirectory,
    hostTempDirectory,
    containerWorkspaceRoot: LINUX_CONTAINER_WORKSPACE_ROOT,
    containerImage,
    processPlatform: deps.processPlatform,
    leftFilename: workspaceLayout.leftFilename,
    rightFilename: workspaceLayout.rightFilename,
    reportFilename: workspaceLayout.reportFilename
  });
  if (!containerCommandPlan) {
    return {
      outcome: 'blocked',
      commandPlan,
      reportFilePath: record.artifactPlan.reportFilePath,
      failureReason: 'container-command-build-failed'
    };
  }

  return {
    outcome: 'ready',
    commandPlan: containerCommandPlan,
    reportFilePath: workspaceLayout.reportFilePath,
    diagnosticPathMapping: {
      runtimeRoot: LINUX_CONTAINER_TEMP_ROOT,
      hostRoot: hostTempDirectory
    },
    reportIdentityFilenames: workspaceLayout.reportIdentityFilenames,
    reportTextReplacements: workspaceLayout.reportTextReplacements
  };
}

export function buildWindowsContainerCommandPlan(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan,
  options: {
    hostReportDirectory: string;
    hostTempDirectory: string;
    containerWorkspaceRoot: string;
    containerImage: string;
    processPlatform: NodeJS.Platform;
  }
): ComparisonCommandPlan | undefined {
  if (!record.runtimeSelection.engine) {
    return undefined;
  }

  const containerArgs =
    record.runtimeSelection.engine === 'labview-cli'
      ? rewriteLabviewCliArgsForContainerWorkspace(commandPlan.args, {
          containerWorkspaceRoot: options.containerWorkspaceRoot,
          leftFilename: record.stagedRevisionPlan.leftFilename,
          rightFilename: record.stagedRevisionPlan.rightFilename,
          reportFilename: record.artifactPlan.reportFilename,
          labviewPath: record.runtimeSelection.labviewExe?.path
        })
      : rewriteLvcompareArgsForContainerWorkspace(commandPlan.args, {
          containerWorkspaceRoot: options.containerWorkspaceRoot,
          leftFilename: record.stagedRevisionPlan.leftFilename,
          rightFilename: record.stagedRevisionPlan.rightFilename,
          labviewPath: record.runtimeSelection.labviewExe?.path
        });
  if (!containerArgs) {
    return undefined;
  }

  const encodedContainerCommand =
    record.runtimeSelection.engine === 'labview-cli'
      ? encodeWindowsPowerShellScript(
          buildWindowsContainerLabviewCliScript(
            commandPlan.executable,
            containerArgs,
            record.runtimeSelection.labviewExe?.path
          )
        )
      : encodeWindowsPowerShellScript(
          buildWindowsContainerDirectCommandScript(commandPlan.executable, containerArgs)
        );
  const hostExecutable = resolveWindowsPowerShellHostExecutable(options.processPlatform);
  if (!hostExecutable) {
    return undefined;
  }
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    `docker run --rm -v ${quotePowerShellLiteral(
      `${options.hostReportDirectory}:${options.containerWorkspaceRoot}`
    )} -e TEMP=${quotePowerShellLiteral(WINDOWS_CONTAINER_TEMP_ROOT)} -e TMP=${quotePowerShellLiteral(
      WINDOWS_CONTAINER_TEMP_ROOT
    )} ${quotePowerShellLiteral(options.containerImage)} powershell -NoProfile -EncodedCommand ${encodedContainerCommand}`,
    'exit $LASTEXITCODE'
  ].join('; ');

  return {
    executable: hostExecutable,
    args: ['-NoProfile', '-EncodedCommand', encodeWindowsPowerShellScript(script)]
  };
}

export function buildLinuxContainerCommandPlan(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan,
  options: {
    hostReportDirectory: string;
    hostTempDirectory: string;
    containerWorkspaceRoot: string;
    containerImage: string;
    processPlatform: NodeJS.Platform;
    leftFilename?: string;
    rightFilename?: string;
    reportFilename?: string;
  }
): ComparisonCommandPlan | undefined {
  if (!record.runtimeSelection.engine) {
    return undefined;
  }

  const containerArgs =
    record.runtimeSelection.engine === 'labview-cli'
      ? rewriteLabviewCliArgsForLinuxContainerWorkspace(commandPlan.args, {
          containerWorkspaceRoot: options.containerWorkspaceRoot,
          leftFilename: options.leftFilename ?? record.stagedRevisionPlan.leftFilename,
          rightFilename: options.rightFilename ?? record.stagedRevisionPlan.rightFilename,
          reportFilename: options.reportFilename ?? record.artifactPlan.reportFilename,
          labviewPath: record.runtimeSelection.labviewExe?.path
        })
      : rewriteLvcompareArgsForLinuxContainerWorkspace(commandPlan.args, {
          containerWorkspaceRoot: options.containerWorkspaceRoot,
          leftFilename: options.leftFilename ?? record.stagedRevisionPlan.leftFilename,
          rightFilename: options.rightFilename ?? record.stagedRevisionPlan.rightFilename,
          labviewPath: record.runtimeSelection.labviewExe?.path
        });
  if (!containerArgs) {
    return undefined;
  }

  const containerScript =
    record.runtimeSelection.engine === 'labview-cli'
      ? buildLinuxContainerLabviewCliScript(commandPlan.executable, containerArgs)
      : buildLinuxContainerDirectCommandScript(commandPlan.executable, containerArgs);

  if (options.processPlatform === 'linux' || options.processPlatform === 'darwin') {
    return {
      executable: 'docker',
      args: [
        'run',
        '--rm',
        '-v',
        `${options.hostReportDirectory}:${options.containerWorkspaceRoot}`,
        '-e',
        `TEMP=${LINUX_CONTAINER_TEMP_ROOT}`,
        '-e',
        `TMP=${LINUX_CONTAINER_TEMP_ROOT}`,
        '-e',
        `TMPDIR=${LINUX_CONTAINER_TEMP_ROOT}`,
        options.containerImage,
        'bash',
        '-lc',
        containerScript
      ]
    };
  }

  const hostExecutable = resolveWindowsPowerShellHostExecutable(options.processPlatform);
  if (!hostExecutable) {
    return undefined;
  }

  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    `docker run --rm -v ${quotePowerShellLiteral(
      `${options.hostReportDirectory}:${options.containerWorkspaceRoot}`
    )} -e TEMP=${quotePowerShellLiteral(LINUX_CONTAINER_TEMP_ROOT)} -e TMP=${quotePowerShellLiteral(
      LINUX_CONTAINER_TEMP_ROOT
    )} -e TMPDIR=${quotePowerShellLiteral(LINUX_CONTAINER_TEMP_ROOT)} ${quotePowerShellLiteral(
      options.containerImage
    )} bash -lc ${quotePowerShellLiteral(containerScript)}`,
    'exit $LASTEXITCODE'
  ].join('; ');

  return {
    executable: hostExecutable,
    args: ['-NoProfile', '-EncodedCommand', encodeWindowsPowerShellScript(script)]
  };
}

export function rewriteLabviewCliArgsForContainerWorkspace(
  args: string[],
  options: {
    containerWorkspaceRoot: string;
    leftFilename: string;
    rightFilename: string;
    reportFilename: string;
    labviewPath?: string;
  }
): string[] | undefined {
  const rewritten: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === '-VI1' || current === '-vi1') {
      rewritten.push(current, `${options.containerWorkspaceRoot}\\staging\\${options.leftFilename}`);
      index += 1;
      continue;
    }

    if (current === '-VI2' || current === '-vi2') {
      rewritten.push(current, `${options.containerWorkspaceRoot}\\staging\\${options.rightFilename}`);
      index += 1;
      continue;
    }

    if (current === '-ReportPath' || current === '-reportPath') {
      rewritten.push(current, `${options.containerWorkspaceRoot}\\${options.reportFilename}`);
      index += 1;
      continue;
    }

    if (current === '-LabVIEWPath') {
      index += 1;
      continue;
    }

    if (current === '-Headless') {
      const next = args[index + 1];
      if (next && !next.startsWith('-')) {
        index += 1;
      }
      continue;
    }

    if (current === '-c') {
      continue;
    }

    rewritten.push(current);
  }

  if (options.labviewPath?.trim()) {
    rewritten.push('-LabVIEWPath', options.labviewPath.trim());
  }
  rewritten.push('-Headless');

  return rewritten.length > 0 ? rewritten : undefined;
}

export function rewriteLabviewCliArgsForLinuxContainerWorkspace(
  args: string[],
  options: {
    containerWorkspaceRoot: string;
    leftFilename: string;
    rightFilename: string;
    reportFilename: string;
    labviewPath?: string;
  }
): string[] | undefined {
  const rewritten: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === '-VI1' || current === '-vi1') {
      rewritten.push(current, `${options.containerWorkspaceRoot}/staging/${options.leftFilename}`);
      index += 1;
      continue;
    }

    if (current === '-VI2' || current === '-vi2') {
      rewritten.push(current, `${options.containerWorkspaceRoot}/staging/${options.rightFilename}`);
      index += 1;
      continue;
    }

    if (current === '-ReportPath' || current === '-reportPath') {
      rewritten.push(current, `${options.containerWorkspaceRoot}/${options.reportFilename}`);
      index += 1;
      continue;
    }

    if (current === '-LabVIEWPath') {
      index += 1;
      continue;
    }

    if (current === '-Headless') {
      const next = args[index + 1];
      if (next && !next.startsWith('-')) {
        index += 1;
      }
      continue;
    }

    if (current === '-c') {
      continue;
    }

    rewritten.push(current);
  }

  rewritten.push('-LabVIEWPath', '/usr/local/natinst/LabVIEW-2026-64/labview');
  rewritten.push('-Headless');

  return rewritten.length > 0 ? rewritten : undefined;
}

function buildWindowsPowerShellArrayLiteral(values: string[]): string {
  return `@(${values.map((value) => quotePowerShellLiteral(value)).join(', ')})`;
}

function buildBashArrayLiteral(values: string[]): string {
  return `(${values.map((value) => quoteBashLiteral(value)).join(' ')})`;
}

export function buildWindowsContainerLabviewCliScript(
  executable: string,
  args: string[],
  labviewPath?: string
): string {
  const cliIniCandidates = [
    'C:\\ProgramData\\National Instruments\\LabVIEW CLI\\LabVIEWCLI.ini',
    'C:\\ProgramData\\National Instruments\\LabVIEWCLI\\LabVIEWCLI.ini',
    'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.ini',
    'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.ini'
  ];
  const effectiveLabviewPath = labviewPath?.trim();

  return [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    'function Set-IniToken {',
    '  param([string]$Path, [string]$Key, [string]$Value)',
    '  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }',
    "  $content = Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue",
    "  if ($null -eq $content) { $content = '' }",
    "  if ($content -match (\"(?m)^\\s*{0}\\s*=\" -f [regex]::Escape($Key))) {",
    '    $updated = [regex]::Replace($content, ("(?m)^\\s*{0}\\s*=.*$" -f [regex]::Escape($Key)), ("{0}={1}" -f $Key, $Value))',
    '  } else {',
    '    $updated = ($content.TrimEnd() + [Environment]::NewLine + ("{0}={1}" -f $Key, $Value) + [Environment]::NewLine)',
    '  }',
    "  Set-Content -LiteralPath $Path -Value $updated -Encoding utf8",
    '}',
    `$env:TEMP = ${quotePowerShellLiteral(WINDOWS_CONTAINER_TEMP_ROOT)}`,
    '$env:TMP = $env:TEMP',
    `$cliPath = ${quotePowerShellLiteral(executable)}`,
    effectiveLabviewPath
      ? `$labviewPath = ${quotePowerShellLiteral(effectiveLabviewPath)}`
      : '$labviewPath = $null',
    `$args = ${buildWindowsPowerShellArrayLiteral(args)}`,
    `$cliIniCandidates = ${buildWindowsPowerShellArrayLiteral(cliIniCandidates)}`,
    '$cliIni = $cliIniCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1',
    'if ($cliIni) {',
    `  Set-IniToken -Path $cliIni -Key 'OpenAppReferenceTimeoutInSecond' -Value '${WINDOWS_CONTAINER_OPEN_APP_TIMEOUT_SECONDS}'`,
    `  Set-IniToken -Path $cliIni -Key 'AfterLaunchOpenAppReferenceTimeoutInSecond' -Value '${WINDOWS_CONTAINER_AFTER_LAUNCH_TIMEOUT_SECONDS}'`,
    '}',
    '$prelaunchAttempted = $false',
    "if (-not [string]::IsNullOrWhiteSpace([string]$labviewPath) -and (Test-Path -LiteralPath $labviewPath)) {",
    '  $prelaunchAttempted = $true',
    "  Start-Process -FilePath $labviewPath -ArgumentList '--headless' -WindowStyle Hidden | Out-Null",
    `  Start-Sleep -Seconds ${WINDOWS_CONTAINER_PRELAUNCH_WAIT_SECONDS}`,
    '}',
    '$attempt = 0',
    '$maxAttempts = [Math]::Max(1, 1 + ' + WINDOWS_CONTAINER_STARTUP_RETRY_COUNT + ')',
    '$lastExit = 1',
    "$lastOutputText = ''",
    'while ($attempt -lt $maxAttempts) {',
    '  $attempt++',
    "  $previousErrorActionPreference = $ErrorActionPreference",
    "  $ErrorActionPreference = 'Continue'",
    '  try {',
    '    $output = @(& $cliPath @args 2>&1)',
    '    $lastExit = [int]$LASTEXITCODE',
    '  } finally {',
    '    $ErrorActionPreference = $previousErrorActionPreference',
    '  }',
    '  $output | ForEach-Object { if (-not [string]::IsNullOrWhiteSpace([string]$_)) { Write-Output $_ } }',
    "  $lastOutputText = @($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine",
    '  if ($lastExit -eq 0) { break }',
    "  $isStartupConnectivity = ($lastExit -in @(-350000, -350051) -or $lastOutputText -match '-350000' -or $lastOutputText -match '-350051' -or $lastOutputText -match '(?i)failed to establish a connection with LabVIEW')",
    '  if ($isStartupConnectivity -and $attempt -lt $maxAttempts) {',
    `    Start-Sleep -Seconds ${WINDOWS_CONTAINER_RETRY_DELAY_SECONDS}`,
    '    continue',
    '  }',
    '  break',
    '}',
    "$connectedPort = ''",
    "if ($lastOutputText -match 'Connection established with LabVIEW at port number ([0-9]+)\\.') {",
    '  $connectedPort = $Matches[1]',
    '}',
    `Write-Output ('[vi-history-suite-container-meta]retryAttempts={0};prelaunchAttempted={1};iniPath={2};connectedPort={3};openTimeout=${WINDOWS_CONTAINER_OPEN_APP_TIMEOUT_SECONDS};afterLaunchTimeout=${WINDOWS_CONTAINER_AFTER_LAUNCH_TIMEOUT_SECONDS}' -f $attempt, ($(if ($prelaunchAttempted) { 1 } else { 0 })), $cliIni, $connectedPort)`,
    'exit $lastExit'
  ].join('\n');
}

function buildWindowsContainerDirectCommandScript(executable: string, args: string[]): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    `$executable = ${quotePowerShellLiteral(executable)}`,
    `$args = ${buildWindowsPowerShellArrayLiteral(args)}`,
    "$previousErrorActionPreference = $ErrorActionPreference",
    "$ErrorActionPreference = 'Continue'",
    'try {',
    '  $output = @(& $executable @args 2>&1)',
    '} finally {',
    '  $ErrorActionPreference = $previousErrorActionPreference',
    '}',
    '$output | ForEach-Object { if (-not [string]::IsNullOrWhiteSpace([string]$_)) { Write-Output $_ } }',
    'exit $LASTEXITCODE'
  ].join('\n');
}

function buildLinuxContainerLabviewCliScript(executable: string, args: string[]): string {
  return [
    'set -euo pipefail',
    `mkdir -p ${quoteBashLiteral(LINUX_CONTAINER_TEMP_ROOT)} /tmp/natinst`,
    `printf '1\\n' > ${quoteBashLiteral('/tmp/natinst/LVContainer.txt')}`,
    `export TEMP=${quoteBashLiteral(LINUX_CONTAINER_TEMP_ROOT)}`,
    `export TMP=${quoteBashLiteral(LINUX_CONTAINER_TEMP_ROOT)}`,
    `export TMPDIR=${quoteBashLiteral(LINUX_CONTAINER_TEMP_ROOT)}`,
    `cli_path=${quoteBashLiteral(executable)}`,
    `args=${buildBashArrayLiteral(args)}`,
    '"$cli_path" "${args[@]}"'
  ].join('\n');
}

function buildLinuxContainerDirectCommandScript(executable: string, args: string[]): string {
  return [
    'set -euo pipefail',
    `mkdir -p ${quoteBashLiteral(LINUX_CONTAINER_TEMP_ROOT)} /tmp/natinst`,
    `printf '1\\n' > ${quoteBashLiteral('/tmp/natinst/LVContainer.txt')}`,
    `export TEMP=${quoteBashLiteral(LINUX_CONTAINER_TEMP_ROOT)}`,
    `export TMP=${quoteBashLiteral(LINUX_CONTAINER_TEMP_ROOT)}`,
    `export TMPDIR=${quoteBashLiteral(LINUX_CONTAINER_TEMP_ROOT)}`,
    `target=${quoteBashLiteral(executable)}`,
    `args=${buildBashArrayLiteral(args)}`,
    '"$target" "${args[@]}"'
  ].join('\n');
}

export function rewriteLvcompareArgsForContainerWorkspace(
  args: string[],
  options: {
    containerWorkspaceRoot: string;
    leftFilename: string;
    rightFilename: string;
    labviewPath?: string;
  }
): string[] | undefined {
  if (args.length < 2) {
    return undefined;
  }

  const rewritten = [
    `${options.containerWorkspaceRoot}\\staging\\${options.leftFilename}`,
    `${options.containerWorkspaceRoot}\\staging\\${options.rightFilename}`
  ];

  for (let index = 2; index < args.length; index += 1) {
    const current = args[index];
    if (current === '-lvpath') {
      rewritten.push(current, options.labviewPath ?? args[index + 1] ?? '');
      index += 1;
      continue;
    }

    rewritten.push(current);
  }

  return rewritten;
}

export function rewriteLvcompareArgsForLinuxContainerWorkspace(
  args: string[],
  options: {
    containerWorkspaceRoot: string;
    leftFilename: string;
    rightFilename: string;
    labviewPath?: string;
  }
): string[] | undefined {
  if (args.length < 2) {
    return undefined;
  }

  const rewritten = [
    `${options.containerWorkspaceRoot}/staging/${options.leftFilename}`,
    `${options.containerWorkspaceRoot}/staging/${options.rightFilename}`
  ];

  for (let index = 2; index < args.length; index += 1) {
    const current = args[index];
    if (current === '-lvpath') {
      rewritten.push(current, '/usr/local/natinst/LabVIEW-2026-64/labview');
      index += 1;
      continue;
    }

    rewritten.push(current);
  }

  return rewritten;
}

async function copyReportAssetsDirectory(
  sourceReportFilePath: string,
  destinationReportFilePath: string,
  deps: {
    pathExists: (filePath: string) => Promise<boolean>;
    copyDirectory: typeof fs.cp;
    mkdir: typeof fs.mkdir;
  }
): Promise<void> {
  const sourceAssetsDirectory = buildReportAssetsDirectoryPath(sourceReportFilePath);
  if (!(await deps.pathExists(sourceAssetsDirectory))) {
    return;
  }

  const destinationAssetsDirectory = buildReportAssetsDirectoryPath(destinationReportFilePath);
  await deps.mkdir(path.dirname(destinationAssetsDirectory), { recursive: true });
  await deps.copyDirectory(sourceAssetsDirectory, destinationAssetsDirectory, {
    recursive: true,
    force: true
  });
}

function buildReportAssetsDirectoryPath(reportFilePath: string): string {
  return reportFilePath.replace(/\.html$/i, '') + '_files';
}

export function normalizeWindowsInteropPath(filePath: string): string | undefined {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
    return trimmed.replaceAll('/', '\\');
  }

  const match = trimmed.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (!match) {
    return undefined;
  }

  const [, driveLetter, tail] = match;
  const normalizedTail = tail
    .split('/')
    .filter((segment) => segment.length > 0)
    .join('\\');
  return normalizedTail.length > 0
    ? `${driveLetter.toUpperCase()}:\\${normalizedTail}`
    : `${driveLetter.toUpperCase()}:\\`;
}

export function normalizeWindowsInteropExecutable(filePath: string): string | undefined {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith('/mnt/')) {
    return trimmed;
  }

  const windowsPathMatch = trimmed.match(/^([A-Za-z]):[\\/](.*)$/);
  if (!windowsPathMatch) {
    return undefined;
  }

  const [, driveLetter, tail] = windowsPathMatch;
  const normalizedTail = tail.replaceAll('\\', '/');
  return `/mnt/${driveLetter.toLowerCase()}/${normalizedTail}`;
}

function resolveHostReadableWindowsPath(
  filePath: string,
  processPlatform: NodeJS.Platform = process.platform
): string | undefined {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return undefined;
  }

  if (processPlatform === 'win32') {
    return trimmed.replaceAll('/', '\\');
  }

  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  return normalizeWindowsInteropExecutable(trimmed);
}

export function parseLabviewCliDiagnosticLogPath(stdout: string): string | undefined {
  const match = stdout.match(/LabVIEWCLI started logging in file:\s*([^\r\n]+)/m);
  return match?.[1]?.trim();
}

function parseWindowsContainerRuntimeFacts(stdout: string): WindowsContainerRuntimeFacts {
  const notes: string[] = [];
  const metadata = parseWindowsContainerRuntimeMetadata(stdout);
  const labviewIniPath = normalizeOptionalRuntimeText(metadata.iniPath);
  const labviewTcpPort =
    parsePositiveInteger(metadata.connectedPort) ?? parseLabviewCliConnectedPort(stdout);
  const retryAttempts = parsePositiveInteger(metadata.retryAttempts);
  const openTimeoutSeconds = parsePositiveInteger(metadata.openTimeout);
  const afterLaunchTimeoutSeconds = parsePositiveInteger(metadata.afterLaunchTimeout);
  const prelaunchAttempted =
    metadata.prelaunchAttempted === '1'
      ? 'yes'
      : metadata.prelaunchAttempted === '0'
        ? 'no'
        : undefined;

  if (labviewIniPath) {
    notes.push(`Windows container runtime retained CLI ini path ${labviewIniPath}.`);
  }

  if (labviewTcpPort !== undefined) {
    notes.push(`Windows container LabVIEW CLI connected to VI Server port ${String(labviewTcpPort)}.`);
  }

  if (
    retryAttempts !== undefined ||
    prelaunchAttempted !== undefined ||
    openTimeoutSeconds !== undefined ||
    afterLaunchTimeoutSeconds !== undefined
  ) {
    const hardeningFacts: string[] = [];
    if (retryAttempts !== undefined) {
      hardeningFacts.push(`retryAttempts=${String(retryAttempts)}`);
    }
    if (prelaunchAttempted !== undefined) {
      hardeningFacts.push(`prelaunchAttempted=${prelaunchAttempted}`);
    }
    if (openTimeoutSeconds !== undefined) {
      hardeningFacts.push(`OpenAppReferenceTimeoutInSecond=${String(openTimeoutSeconds)}`);
    }
    if (afterLaunchTimeoutSeconds !== undefined) {
      hardeningFacts.push(
        `AfterLaunchOpenAppReferenceTimeoutInSecond=${String(afterLaunchTimeoutSeconds)}`
      );
    }
    notes.push(`Windows container startup hardening retained ${hardeningFacts.join(', ')}.`);
  }

  return {
    labviewIniPath,
    labviewTcpPort,
    notes
  };
}

function parseWindowsContainerRuntimeMetadata(stdout: string): Record<string, string> {
  const match = stdout.match(/\[vi-history-suite-container-meta\]([^\r\n]+)/i);
  if (!match) {
    return {};
  }

  const metadata: Record<string, string> = {};
  for (const segment of match[1].split(';')) {
    const separatorIndex = segment.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = segment.slice(0, separatorIndex).trim();
    const value = segment.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    metadata[key] = value;
  }

  return metadata;
}

function parseLabviewCliConnectedPort(stdout: string): number | undefined {
  const match = stdout.match(/Connection established with LabVIEW at port number ([0-9]+)\./i);
  return parsePositiveInteger(match?.[1]);
}

function normalizeOptionalRuntimeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^none$/i.test(trimmed) || /^null$/i.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function resolveHostReadableDiagnosticPath(
  diagnosticLogPath: string,
  processPlatform: NodeJS.Platform = process.platform,
  diagnosticPathMapping?: RuntimeDiagnosticPathMapping
): string | undefined {
  const trimmed = diagnosticLogPath.trim();
  const mappedContainerPath = resolveMappedRuntimeDiagnosticPath(diagnosticLogPath, diagnosticPathMapping);
  if (mappedContainerPath) {
    return mappedContainerPath;
  }

  if (diagnosticPathMapping) {
    return undefined;
  }

  if (processPlatform === 'win32') {
    return trimmed || undefined;
  }

  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  return normalizeWindowsInteropExecutable(trimmed);
}

export function resolveMappedRuntimeDiagnosticPath(
  diagnosticLogPath: string,
  diagnosticPathMapping?: RuntimeDiagnosticPathMapping
): string | undefined {
  if (!diagnosticPathMapping) {
    return undefined;
  }

  const normalizedRuntimeRoot = normalizeComparablePath(diagnosticPathMapping.runtimeRoot);
  const normalizedDiagnostic = normalizeComparablePath(diagnosticLogPath);
  if (!normalizedRuntimeRoot || !normalizedDiagnostic) {
    return undefined;
  }

  if (!normalizedDiagnostic.startsWith(normalizedRuntimeRoot)) {
    return undefined;
  }

  const relativeWindowsPath = diagnosticLogPath
    .trim()
    .slice(diagnosticPathMapping.runtimeRoot.length)
    .replace(/^[\\/]+/, '');
  const relativeSegments = relativeWindowsPath
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment.length > 0);

  return path.join(diagnosticPathMapping.hostRoot, ...relativeSegments);
}

export function classifyLabviewCliDiagnosticText(
  diagnosticText: string,
  expectedLabviewPath?: string
): {
  reason?: string;
  notes: string[];
} {
  const notes: string[] = [];
  const launchSucceeded = /LabVIEW launched successfully\./i.test(diagnosticText);
  const invalidPathLines = diagnosticText.match(/^.*path invalid or does not exist:\s*.+$/gim);
  if (invalidPathLines && invalidPathLines.length > 0) {
    notes.push(
      `LabVIEW CLI rejected one or more supplied paths: ${invalidPathLines
        .map((line) => line.trim())
        .join(' | ')}.`
    );
    return {
      reason: 'labview-cli-invalid-vi-path',
      notes: appendLaunchConfirmationNote(notes, launchSucceeded)
    };
  }
  const ignoredLabviewPathMatch = diagnosticText.match(
    /"LabVIEWPath" command line argument is not passed\.\s*Using last used LabVIEW:\s*"([^"]+)"/i
  );
  if (ignoredLabviewPathMatch) {
    const actualLabviewPath = ignoredLabviewPathMatch[1];
    const normalizedExpectedPath = normalizeComparablePath(expectedLabviewPath);
    const normalizedActualPath = normalizeComparablePath(actualLabviewPath);
    if (normalizedExpectedPath && normalizedExpectedPath === normalizedActualPath) {
      notes.push(
        `LabVIEW CLI ignored the explicit -LabVIEWPath selection, but the last-used LabVIEW matched the intended executable: ${actualLabviewPath}.`
      );
      return {
        reason: 'labview-path-ignored-last-used-matched-selection',
        notes: appendLaunchConfirmationNote(notes, launchSucceeded)
      };
    }

    if (normalizedExpectedPath && normalizedExpectedPath !== normalizedActualPath) {
      notes.push(
        `LabVIEW CLI ignored the explicit -LabVIEWPath selection and used a different last-used LabVIEW instead: ${actualLabviewPath}.`
      );
      notes.push(`Intended explicit LabVIEW path: ${expectedLabviewPath}.`);
      return {
        reason: 'labview-path-ignored-last-used-diverged-selection',
        notes: appendLaunchConfirmationNote(notes, launchSucceeded)
      };
    }

    notes.push(
      `LabVIEW CLI ignored the explicit -LabVIEWPath selection and used the last-used LabVIEW instead: ${actualLabviewPath}.`
    );
    return {
      reason: 'labview-path-ignored-last-used-default',
      notes: appendLaunchConfirmationNote(notes, launchSucceeded)
    };
  }

  if (
    /Connection established with LabVIEW at port number \d+\./i.test(diagnosticText) &&
    /Error code\s*:\s*66\b/i.test(diagnosticText) &&
    /Call By Reference/i.test(diagnosticText)
  ) {
    notes.push(
      'LabVIEW CLI established a VI Server connection before failing with Error 66 / Call By Reference.'
    );
    return {
      reason: 'labview-cli-call-by-reference',
      notes: appendLaunchConfirmationNote(notes, launchSucceeded)
    };
  }

  if (launchSucceeded) {
    notes.push('LabVIEW CLI reported that LabVIEW launched successfully before the operation failed.');
  }

  return {
    notes
  };
}

function appendLaunchConfirmationNote(notes: string[], launchSucceeded: boolean): string[] {
  if (!launchSucceeded) {
    notes.push('The retained LabVIEW CLI diagnostic log did not report successful LabVIEW launch before exit.');
  }

  return notes;
}

function classifyRuntimeFailure(options: {
  engine?: 'labview-cli' | 'lvcompare';
  exitCode: number;
  reportExists: boolean;
  stdout: string;
  stderr: string;
  processObservation?: RuntimeProcessObservation;
  exitProcessObservation?: RuntimeProcessObservation;
}): {
  reason: string;
  notes: string[];
} {
  if (options.exitCode === 0 && !options.reportExists) {
    if (options.engine === 'lvcompare') {
      return {
        reason: 'lvcompare-exited-zero-without-report',
        notes: ['LVCompare exited 0 without generating the governed report file.']
      };
    }

    return {
      reason: 'report-file-not-generated',
      notes: []
    };
  }

  if (
    options.exitCode !== 0 &&
    !options.reportExists &&
    options.engine === 'labview-cli' &&
    options.stderr.trim().length === 0 &&
    isLabviewCliLogOnlyStdout(options.stdout)
  ) {
    if (
      options.processObservation?.trigger === 'cli-log-banner' &&
      options.processObservation.labviewCliProcessObserved &&
      !options.processObservation.labviewProcessObserved &&
      options.exitProcessObservation?.trigger === 'process-exit' &&
      options.exitProcessObservation.labviewCliProcessObserved &&
      !options.exitProcessObservation.labviewProcessObserved
    ) {
      return {
        reason: 'labview-cli-log-only-no-labview-through-exit',
        notes: [
          'LabVIEW CLI exited nonzero without stderr and without generating a report; at the retained cli-log-banner and process-exit snapshots, LabVIEWCLI.exe was observed while LabVIEW.exe was not observed.'
        ]
      };
    }

    if (
      options.processObservation?.trigger === 'cli-log-banner' &&
      options.processObservation.labviewCliProcessObserved &&
      !options.processObservation.labviewProcessObserved
    ) {
      return {
        reason: 'labview-cli-log-only-no-labview-at-banner-snapshot',
        notes: [
          'LabVIEW CLI exited nonzero without stderr and without generating a report; at the retained cli-log-banner snapshot, LabVIEWCLI.exe was observed while LabVIEW.exe was not observed.'
        ]
      };
    }

    return {
      reason: 'labview-cli-exited-nonzero-log-only-no-report',
      notes: [
        'LabVIEW CLI exited nonzero without stderr and without generating a report; stdout only advertised the diagnostic log path.'
      ]
    };
  }

  if (options.exitCode !== 0) {
    if (options.engine === 'labview-cli' && /Error code\s*:\s*-350000\b/i.test(options.stderr)) {
      return {
        reason: 'labview-cli-connection-failed',
        notes: [
          'LabVIEW CLI launched or reused a headless LabVIEW session but failed to establish the required VI Server connection.'
        ]
      };
    }

    return {
      reason: 'command-exited-nonzero',
      notes: []
    };
  }

  return {
    reason: 'report-file-not-generated',
    notes: []
  };
}

function isLabviewCliLogOnlyStdout(stdout: string): boolean {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return (
    lines.length === 1 &&
    /^LabVIEWCLI started logging in file:\s*\S+/i.test(lines[0])
  );
}

function mergeDiagnosticNotes(...noteGroups: Array<string[] | undefined>): string[] {
  const merged: string[] = [];
  for (const noteGroup of noteGroups) {
    for (const note of noteGroup ?? []) {
      if (!merged.includes(note)) {
        merged.push(note);
      }
    }
  }

  return merged;
}

function buildProcessObservationNotes(
  observations:
    | {
        bannerSnapshot?: RuntimeProcessObservation;
        exitSnapshot?: RuntimeProcessObservation;
      }
    | undefined
): string[] {
  const notes: string[] = [];
  for (const observation of [observations?.bannerSnapshot, observations?.exitSnapshot]) {
    if (!observation) {
      continue;
    }

    const observedProcessNames =
      observation.observedProcessNames.length > 0
        ? observation.observedProcessNames.join(', ')
        : 'none';

    notes.push(
      `At the retained ${observation.trigger} snapshot (${observation.capturedAt}), observed LabVIEW-related processes: ${observedProcessNames}.`
    );

    if (observation.labviewCliProcessObserved && !observation.labviewProcessObserved) {
      notes.push(
        `At the retained ${observation.trigger} snapshot, LabVIEWCLI.exe was observed while LabVIEW.exe was not observed.`
      );
    }

    if (!observation.lvcompareProcessObserved) {
      notes.push(
        `At the retained ${observation.trigger} snapshot, LVCompare.exe was not observed.`
      );
    }
  }

  return notes;
}

export function extractCommandOptionValue(args: string[], optionName: string): string | undefined {
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === optionName) {
      const value = args[index + 1]?.trim();
      return value ? value : undefined;
    }
  }

  return undefined;
}

function normalizeComparablePath(filePath?: string): string | undefined {
  const trimmed = filePath?.trim();
  if (!trimmed) {
    return undefined;
  }

  const windowsPath = normalizeWindowsInteropPath(trimmed) ?? trimmed.replaceAll('/', '\\');
  return windowsPath.replaceAll('/', '\\').toLowerCase();
}

function resolveWindowsPowerShellHostExecutable(
  processPlatform: NodeJS.Platform
): string | undefined {
  if (processPlatform === 'win32') {
    return 'powershell.exe';
  }

  if (processPlatform === 'linux') {
    return '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
  }

  return undefined;
}

function encodeWindowsPowerShellScript(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteBashLiteral(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

export function requiresWindowsInterop(
  runtimePlatform: string,
  processPlatform: NodeJS.Platform = process.platform
): boolean {
  return runtimePlatform === 'win32' && processPlatform !== 'win32';
}

export function parseWindowsTasklistCsv(stdout: string): RuntimeObservedProcess[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseWindowsTasklistCsvLine)
    .filter((entry): entry is RuntimeObservedProcess => Boolean(entry));
}

export async function observeWindowsRuntimeProcesses(
  options: ObserveWindowsProcessesOptions,
  deps: ObserveWindowsProcessesDeps = {}
): Promise<RuntimeProcessObservation | undefined> {
  if (options.runtimePlatform !== 'win32') {
    return undefined;
  }

  const executable = options.hostPlatform === 'win32'
    ? path.win32.join(process.env.SYSTEMROOT ?? 'C:\\Windows', 'System32', 'tasklist.exe')
    : '/mnt/c/Windows/System32/tasklist.exe';

  const stdout = await new Promise<string>((resolve, reject) => {
    (deps.execFileImpl ?? execFile)(
      executable,
      ['/FO', 'CSV', '/NH'],
      {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true
      },
      (error, capturedStdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(String(capturedStdout ?? ''));
      }
    );
  });

  const observedProcesses = parseWindowsTasklistCsv(stdout).filter((processInfo) =>
    isObservedRuntimeProcessName(processInfo.imageName)
  );
  const observedProcessNames = [...new Set(observedProcesses.map((processInfo) => processInfo.imageName))];

  return {
    capturedAt: (deps.nowIso ?? defaultNowIso)(),
    hostPlatform: options.hostPlatform,
    runtimePlatform: options.runtimePlatform,
    trigger: options.trigger,
    observedProcesses,
    observedProcessNames,
    labviewProcessObserved: observedProcesses.some((processInfo) =>
      isExactObservedRuntimeProcessName(processInfo.imageName, 'LabVIEW.exe')
    ),
    labviewCliProcessObserved: observedProcesses.some((processInfo) =>
      isExactObservedRuntimeProcessName(processInfo.imageName, 'LabVIEWCLI.exe')
    ),
    lvcompareProcessObserved: observedProcesses.some((processInfo) =>
      isExactObservedRuntimeProcessName(processInfo.imageName, 'LVCompare.exe')
    )
  };
}

export async function observeWindowsTcpListeners(
  options: ObserveWindowsTcpListenersOptions,
  deps: ObserveWindowsTcpListenersDeps = {}
): Promise<WindowsTcpListenerObservation[]> {
  if (options.runtimePlatform !== 'win32' || options.localPorts.length === 0) {
    return [];
  }

  const localPorts = [...new Set(options.localPorts.filter((port) => Number.isInteger(port) && port > 0))];
  if (localPorts.length === 0) {
    return [];
  }

  const netstatExecutable = resolveWindowsSystem32Executable(options.hostPlatform, 'netstat.exe');
  const tasklistExecutable = resolveWindowsSystem32Executable(options.hostPlatform, 'tasklist.exe');
  const execFileImpl = deps.execFileImpl ?? execFile;

  const netstatStdout = await new Promise<string>((resolve, reject) => {
    execFileImpl(
      netstatExecutable,
      ['-nao', '-p', 'TCP'],
      {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true
      },
      (error, capturedStdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(String(capturedStdout ?? ''));
      }
    );
  });

  const listeners = parseWindowsNetstatListeners(netstatStdout).filter((listener) =>
    localPorts.includes(listener.localPort)
  );
  if (listeners.length === 0) {
    return [];
  }

  const tasklistStdout = await new Promise<string>((resolve, reject) => {
    execFileImpl(
      tasklistExecutable,
      ['/FO', 'CSV', '/NH'],
      {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true
      },
      (error, capturedStdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(String(capturedStdout ?? ''));
      }
    );
  });

  const processNamesByPid = new Map<number, string>();
  for (const processInfo of parseWindowsTasklistCsv(tasklistStdout)) {
    processNamesByPid.set(processInfo.pid, processInfo.imageName);
  }

  return listeners.map((listener) => ({
    ...listener,
    processName: processNamesByPid.get(listener.pid)
  }));
}

function resolveWindowsSystem32Executable(hostPlatform: NodeJS.Platform, filename: string): string {
  return hostPlatform === 'win32'
    ? path.win32.join(process.env.SYSTEMROOT ?? 'C:\\Windows', 'System32', filename)
    : `/mnt/c/Windows/System32/${filename}`;
}

function parseWindowsNetstatListeners(stdout: string): WindowsTcpListenerObservation[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(/^TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i);
      if (!match) {
        return undefined;
      }

      const localPort = Number.parseInt(match[2], 10);
      const pid = Number.parseInt(match[3], 10);
      if (!Number.isInteger(localPort) || !Number.isInteger(pid)) {
        return undefined;
      }

      return {
        localAddress: match[1],
        localPort,
        pid
      } satisfies WindowsTcpListenerObservation;
    })
    .filter((listener): listener is WindowsTcpListenerObservation => Boolean(listener));
}

export function runComparisonCommandPlanWithObservation(
  commandPlan: ComparisonCommandPlan,
  deps: RunComparisonCommandPlanWithObservationDeps = {}
): Promise<RunCommandResult> {
  return new Promise((resolve, reject) => {
    const hostPlatform = deps.hostPlatform ?? process.platform;
    const child = (deps.spawnImpl ?? spawn)(commandPlan.executable, commandPlan.args, {
      windowsHide: true,
      shell: false
    });
    let stdout = '';
    let stderr = '';
    let observationPromise: Promise<void> | undefined;
    let processObservation: RuntimeProcessObservation | undefined;
    let exitObservationPromise: Promise<void> | undefined;
    let exitProcessObservation: RuntimeProcessObservation | undefined;
    let observationError: unknown;
    let observationStarted = false;
    let timedOut = false;
    let cancelled = false;
    let terminationRequested = false;
    const timeoutMs =
      typeof deps.timeoutMs === 'number' && deps.timeoutMs > 0
        ? deps.timeoutMs
        : undefined;
    const requestTermination = (reason: 'timeout' | 'cancelled') => {
      if (terminationRequested) {
        return;
      }

      terminationRequested = true;
      if (reason === 'cancelled') {
        cancelled = true;
        stderr = appendCancellationMessage(stderr);
      } else {
        timedOut = true;
        stderr += `comparison-command timed out after ${String(timeoutMs)}ms\n`;
      }

      if (hostPlatform === 'win32' && typeof child.pid === 'number' && child.pid > 0) {
        void (deps.terminateProcessTree ?? terminateWindowsProcessTree)(child.pid, hostPlatform).catch(
          () => undefined
        );
      }
      try {
        child.kill('SIGKILL');
      } catch {
        // Preserve fail-closed timeout and cancellation behavior even if the local kill throws.
      }
    };
    const disposeCancellationSubscription = subscribeToCancellation(
      deps.cancellationToken,
      () => requestTermination('cancelled')
    );
    const timeoutHandle =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            requestTermination('timeout');
          }, timeoutMs);

    if (deps.cancellationToken?.isCancellationRequested) {
      requestTermination('cancelled');
    }

    const startObservation = (trigger: RuntimeProcessObservation['trigger']) => {
      if (observationStarted) {
        return;
      }

      observationStarted = true;
      observationPromise = Promise.resolve(
        (deps.observeWindowsProcesses ?? observeWindowsRuntimeProcesses)({
          hostPlatform: deps.hostPlatform ?? process.platform,
          runtimePlatform: deps.runtimePlatform ?? process.platform,
          trigger
        })
      )
        .then((capturedObservation) => {
          processObservation = capturedObservation;
        })
        .catch((error) => {
          observationError = error;
        });
    };

    const maybeStartObservation = () => {
      if (!parseLabviewCliDiagnosticLogPath(stdout)) {
        return;
      }

      startObservation('cli-log-banner');
    };

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.on('spawn', () => {
      if (deps.engine === 'lvcompare') {
        startObservation('process-spawn');
      }
    });
    child.stdout?.on('data', (chunk: string | Buffer) => {
      stdout += String(chunk);
      maybeStartObservation();
    });
    child.stderr?.on('data', (chunk: string | Buffer) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      disposeCancellationSubscription();
      reject(error);
    });
    child.on('close', async (exitCode, signal) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      disposeCancellationSubscription();

      if (observationPromise) {
        await observationPromise;
      }

      if (observationStarted) {
        exitObservationPromise = Promise.resolve(
          (deps.observeWindowsProcesses ?? observeWindowsRuntimeProcesses)({
            hostPlatform: deps.hostPlatform ?? process.platform,
            runtimePlatform: deps.runtimePlatform ?? process.platform,
            trigger: 'process-exit'
          })
        )
          .then((capturedObservation) => {
            exitProcessObservation = capturedObservation;
          })
          .catch((error) => {
            observationError = error;
          });
      }

      if (exitObservationPromise) {
        await exitObservationPromise;
      }

      if (observationError) {
        reject(observationError);
        return;
      }

      if (!timedOut && !cancelled && typeof exitCode !== 'number') {
        reject(new Error('comparison-command-closed-without-exit-code'));
        return;
      }

      resolve({
        exitCode:
          typeof exitCode === 'number'
            ? exitCode
            : timedOut
              ? 124
              : cancelled
                ? 130
                : 124,
        signal: signal ?? undefined,
        stdout,
        stderr,
        timedOut,
        cancelled,
        timeoutMs,
        processObservation,
        exitProcessObservation
      });
    });
  });
}

export function pathExistsForReport(filePath: string): Promise<boolean> {
  return fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
}

export function runComparisonCommandPlan(
  commandPlan: ComparisonCommandPlan,
  deps: RunComparisonCommandPlanDeps = {}
): Promise<RunCommandResult> {
  return new Promise((resolve, reject) => {
    const hostPlatform = deps.hostPlatform ?? process.platform;
    let cancelled = false;
    let terminationRequested = false;
    let disposeCancellationSubscription: () => void = () => undefined;
    const child = (deps.execFileImpl ?? execFile)(
      commandPlan.executable,
      commandPlan.args,
      {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        timeout: deps.timeoutMs,
        killSignal: 'SIGKILL'
      },
      (error, stdout, stderr) => {
        disposeCancellationSubscription();
        if (!error) {
          if (cancelled) {
            resolve({
              exitCode: 130,
              signal: 'SIGKILL',
              stdout: stdout ?? '',
              stderr: appendCancellationMessage(stderr ?? ''),
              cancelled: true
            });
            return;
          }
          resolve({
            exitCode: 0,
            stdout: stdout ?? '',
            stderr: stderr ?? ''
          });
          return;
        }

        const execError = error as ExecFileException & {
          code?: string | number;
          stdout?: string;
          stderr?: string;
          signal?: string;
          killed?: boolean;
        };

        const timedOut =
          Boolean(deps.timeoutMs) &&
          execError.killed === true &&
          (execError.signal === 'SIGKILL' || /timed out/i.test(execError.message ?? ''));

        if (cancelled && !timedOut) {
          resolve({
            exitCode: 130,
            signal: execError.signal ?? 'SIGKILL',
            stdout: String(stdout ?? execError.stdout ?? ''),
            stderr: appendCancellationMessage(String(stderr ?? execError.stderr ?? '')),
            cancelled: true
          });
          return;
        }

        if (timedOut) {
          resolve({
            exitCode:
              typeof execError.code === 'number' ? execError.code : 124,
            signal: execError.signal ?? undefined,
            stdout: String(stdout ?? execError.stdout ?? ''),
            stderr: String(stderr ?? execError.stderr ?? ''),
            timedOut: true,
            timeoutMs: deps.timeoutMs
          });
          return;
        }

        if (typeof execError.code === 'number') {
          resolve({
            exitCode: execError.code,
            signal: execError.signal ?? undefined,
            stdout: String(stdout ?? execError.stdout ?? ''),
            stderr: String(stderr ?? execError.stderr ?? '')
          });
          return;
        }

        reject(error);
      }
    );
    const requestTermination = () => {
      if (terminationRequested) {
        return;
      }

      terminationRequested = true;
      cancelled = true;
      if (hostPlatform === 'win32' && typeof child.pid === 'number' && child.pid > 0) {
        void (deps.terminateProcessTree ?? terminateWindowsProcessTree)(child.pid, hostPlatform).catch(
          () => undefined
        );
      }
      try {
        child.kill('SIGKILL');
      } catch {
        // Preserve fail-closed cancellation behavior even if the local kill throws.
      }
    };
    disposeCancellationSubscription = subscribeToCancellation(deps.cancellationToken, requestTermination);
    if (deps.cancellationToken?.isCancellationRequested) {
      requestTermination();
    }
  });
}

export function normalizeComparisonProcessError(error: unknown): {
  stdout: string;
  stderr: string;
  signal?: string;
} {
  if (error && typeof error === 'object') {
    const maybeError = error as {
      stdout?: string;
      stderr?: string;
      signal?: string;
      message?: string;
    };

    return {
      stdout: String(maybeError.stdout ?? ''),
      stderr: String(maybeError.stderr ?? maybeError.message ?? ''),
      signal: maybeError.signal ?? undefined
    };
  }

  return {
    stdout: '',
    stderr: String(error ?? '')
  };
}

export function defaultNowIso(): string {
  return new Date().toISOString();
}

export function defaultNowMs(): number {
  return Date.now();
}

function parseWindowsTasklistCsvLine(line: string): RuntimeObservedProcess | undefined {
  const columns = parseCsvColumns(line);
  if (columns.length < 2) {
    return undefined;
  }

  const imageName = columns[0]?.trim();
  const pid = Number.parseInt(columns[1] ?? '', 10);
  if (!imageName || !Number.isFinite(pid)) {
    return undefined;
  }

  const sessionNumber = Number.parseInt((columns[3] ?? '').replaceAll(',', ''), 10);

  return {
    imageName,
    pid,
    sessionName: columns[2]?.trim() || undefined,
    sessionNumber: Number.isFinite(sessionNumber) ? sessionNumber : undefined,
    memUsage: columns[4]?.trim() || undefined
  };
}

function parseCsvColumns(line: string): string[] {
  const columns: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === ',' && !inQuotes) {
      columns.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  columns.push(current);
  return columns;
}

function isObservedRuntimeProcessName(imageName: string): boolean {
  return (
    isExactObservedRuntimeProcessName(imageName, 'LabVIEW.exe') ||
    isExactObservedRuntimeProcessName(imageName, 'LabVIEWCLI.exe') ||
    isExactObservedRuntimeProcessName(imageName, 'LVCompare.exe')
  );
}

function isExactObservedRuntimeProcessName(imageName: string, expected: string): boolean {
  return imageName.trim().toLowerCase() === expected.toLowerCase();
}
