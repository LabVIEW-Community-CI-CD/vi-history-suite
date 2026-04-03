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
import { readRevisionBlob } from './comparisonReportPreflight';

export interface ExecuteComparisonReportOptions {
  record: ComparisonReportPacketRecord;
  repositoryRoot: string;
  interopWorkspaceRoot?: string;
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
  readFile?: typeof fs.readFile;
  pathExists?: (filePath: string) => Promise<boolean>;
  runCommand?: (commandPlan: ComparisonCommandPlan) => Promise<RunCommandResult>;
  nowIso?: () => string;
  nowMs?: () => number;
  writePacketRecord?: typeof writeComparisonReportPacketRecord;
  processPlatform?: NodeJS.Platform;
  observeWindowsProcesses?: (
    options: ObserveWindowsProcessesOptions
  ) => Promise<RuntimeProcessObservation | undefined>;
}

export interface RunCommandResult {
  exitCode: number;
  signal?: string;
  stdout: string;
  stderr: string;
  processObservation?: RuntimeProcessObservation;
  exitProcessObservation?: RuntimeProcessObservation;
}

export interface RunComparisonCommandPlanDeps {
  execFileImpl?: typeof execFile;
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
  trigger: 'cli-log-banner' | 'process-exit';
  observedProcesses: RuntimeObservedProcess[];
  observedProcessNames: string[];
  labviewProcessObserved: boolean;
  labviewCliProcessObserved: boolean;
  lvcompareProcessObserved: boolean;
}

export interface ObserveWindowsProcessesOptions {
  hostPlatform: NodeJS.Platform;
  runtimePlatform: string;
  trigger: RuntimeProcessObservation['trigger'];
}

export interface ObserveWindowsProcessesDeps {
  execFileImpl?: typeof execFile;
  nowIso?: () => string;
}

export interface RunComparisonCommandPlanWithObservationDeps {
  spawnImpl?: typeof spawn;
  observeWindowsProcesses?: (
    options: ObserveWindowsProcessesOptions
  ) => Promise<RuntimeProcessObservation | undefined>;
  hostPlatform?: NodeJS.Platform;
  runtimePlatform?: string;
}

export async function executeComparisonReport(
  options: ExecuteComparisonReportOptions,
  deps: ComparisonReportRuntimeExecutionDeps = {}
): Promise<ExecuteComparisonReportResult> {
  const plan = buildComparisonReportExecutionPlan(options.record);
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const copyFile = deps.copyFile ?? fs.copyFile;
  const readFile = deps.readFile ?? fs.readFile;
  const pathExists = deps.pathExists ?? pathExistsForReport;
  const processPlatform = deps.processPlatform ?? process.platform;
  const observeWindowsProcesses = deps.observeWindowsProcesses ?? observeWindowsRuntimeProcesses;
  const runCommand =
    deps.runCommand ??
    ((commandPlan: ComparisonCommandPlan) =>
      runComparisonCommandPlanWithObservation(commandPlan, {
        hostPlatform: processPlatform,
        runtimePlatform: options.record.runtimeSelection.platform,
        observeWindowsProcesses
      }));
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
        readFile,
        pathExists,
        runCommand,
        nowIso,
        nowMs,
        processPlatform
      }
    );
  }

  const updatedRecord: ComparisonReportPacketRecord = {
    ...options.record,
    runtimeExecutionState: runtimeExecution.state,
    runtimeExecution
  };
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
    readFile: typeof fs.readFile;
    pathExists: (filePath: string) => Promise<boolean>;
    runCommand: (commandPlan: ComparisonCommandPlan) => Promise<RunCommandResult>;
    nowIso: () => string;
    nowMs: () => number;
    processPlatform: NodeJS.Platform;
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

  const startedAt = deps.nowIso();
  const startedMs = deps.nowMs();

  try {
    const commandResult = await deps.runCommand(executionContext.commandPlan);
    const completedAt = deps.nowIso();
    const durationMs = Math.max(0, deps.nowMs() - startedMs);
    await deps.writeFile(record.artifactPlan.runtimeStdoutFilePath, commandResult.stdout, 'utf8');
    await deps.writeFile(record.artifactPlan.runtimeStderrFilePath, commandResult.stderr, 'utf8');
    const processObservation = await persistRuntimeProcessObservation(record, commandResult, {
      writeFile: deps.writeFile,
      mkdir: deps.mkdir
    });
    const diagnostics = await captureRuntimeDiagnostics(record, commandResult.stdout, {
      pathExists: deps.pathExists,
      copyFile: deps.copyFile,
      readFile: deps.readFile,
      mkdir: deps.mkdir,
      processPlatform: deps.processPlatform,
      expectedLabviewPath: extractCommandOptionValue(executionContext.commandPlan.args, '-LabVIEWPath')
    });
    const reportExists = await finalizeExecutedReport(
      record,
      executionContext,
      {
        pathExists: deps.pathExists,
        copyFile: deps.copyFile,
        mkdir: deps.mkdir
      }
    );
    const succeeded = commandResult.exitCode === 0 && reportExists;
    const failureClassification = classifyRuntimeFailure({
      engine: record.runtimeSelection.engine,
      exitCode: commandResult.exitCode,
      reportExists,
      stdout: commandResult.stdout,
      stderr: commandResult.stderr,
      processObservation: processObservation?.bannerSnapshot,
      exitProcessObservation: processObservation?.exitSnapshot
    });
    const diagnosticNotes = mergeDiagnosticNotes(
      buildProcessObservationNotes(processObservation),
      diagnostics.notes,
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
      executable: executionContext.commandPlan.executable,
      args: executionContext.commandPlan.args,
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
        processObservation?.exitSnapshot?.lvcompareProcessObserved
    };
  } catch (error) {
    const completedAt = deps.nowIso();
    const durationMs = Math.max(0, deps.nowMs() - startedMs);
    const processError = normalizeComparisonProcessError(error);
    await deps.writeFile(record.artifactPlan.runtimeStdoutFilePath, processError.stdout, 'utf8');
    await deps.writeFile(record.artifactPlan.runtimeStderrFilePath, processError.stderr, 'utf8');
    const diagnostics = await captureRuntimeDiagnostics(record, processError.stdout, {
      pathExists: deps.pathExists,
      copyFile: deps.copyFile,
      readFile: deps.readFile,
      mkdir: deps.mkdir,
      processPlatform: deps.processPlatform,
      expectedLabviewPath: extractCommandOptionValue(executionContext.commandPlan.args, '-LabVIEWPath')
    });

    return {
      state: 'failed',
      attempted: true,
      reportExists: false,
      failureReason: 'command-spawn-failed',
      diagnosticReason: diagnostics.reason,
      diagnosticNotes: diagnostics.notes,
      diagnosticLogSourcePath: diagnostics.sourcePath,
      diagnosticLogArtifactPath: diagnostics.artifactPath,
      executable: executionContext.commandPlan.executable,
      args: executionContext.commandPlan.args,
      startedAt,
      completedAt,
      durationMs,
      signal: processError.signal,
      stdoutFilePath: record.artifactPlan.runtimeStdoutFilePath,
      stderrFilePath: record.artifactPlan.runtimeStderrFilePath
    };
  }
}

async function persistRuntimeProcessObservation(
  record: ComparisonReportPacketRecord,
  commandResult: RunCommandResult,
  deps: {
    writeFile: typeof fs.writeFile;
    mkdir: typeof fs.mkdir;
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

interface CapturedRuntimeDiagnostics {
  reason?: string;
  notes: string[];
  sourcePath?: string;
  artifactPath?: string;
}

async function captureRuntimeDiagnostics(
  record: ComparisonReportPacketRecord,
  stdout: string,
  deps: {
    pathExists: (filePath: string) => Promise<boolean>;
    copyFile: typeof fs.copyFile;
    readFile: typeof fs.readFile;
    mkdir: typeof fs.mkdir;
    processPlatform: NodeJS.Platform;
    expectedLabviewPath?: string;
  }
): Promise<CapturedRuntimeDiagnostics> {
  const diagnosticLogSourcePath = parseLabviewCliDiagnosticLogPath(stdout);
  if (!diagnosticLogSourcePath) {
    return {
      notes: [],
      artifactPath: record.artifactPlan.runtimeDiagnosticLogFilePath
    };
  }

  const hostReadablePath = resolveHostReadableDiagnosticPath(
    diagnosticLogSourcePath,
    deps.processPlatform
  );
  if (!hostReadablePath || !(await deps.pathExists(hostReadablePath))) {
    return {
      notes: ['LabVIEW CLI reported a diagnostic log path, but the log file was not readable from the active host.'],
      sourcePath: diagnosticLogSourcePath,
      artifactPath: record.artifactPlan.runtimeDiagnosticLogFilePath,
      reason: 'runtime-diagnostic-log-unreadable'
    };
  }

  await deps.mkdir(path.dirname(record.artifactPlan.runtimeDiagnosticLogFilePath), { recursive: true });
  await deps.copyFile(hostReadablePath, record.artifactPlan.runtimeDiagnosticLogFilePath);
  const diagnosticText = await deps.readFile(hostReadablePath, 'utf8');
  const classification = classifyLabviewCliDiagnosticText(diagnosticText, deps.expectedLabviewPath);

  return {
    reason: classification.reason,
    notes: classification.notes,
    sourcePath: diagnosticLogSourcePath,
    artifactPath: record.artifactPlan.runtimeDiagnosticLogFilePath
  };
}

interface PreparedExecutionContext {
  outcome: 'ready' | 'blocked';
  commandPlan: ComparisonCommandPlan;
  reportFilePath: string;
  failureReason?: string;
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
  if (!requiresWindowsInterop(record.runtimeSelection.platform, deps.processPlatform)) {
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
  deps: {
    pathExists: (filePath: string) => Promise<boolean>;
    copyFile: typeof fs.copyFile;
    mkdir: typeof fs.mkdir;
  }
): Promise<boolean> {
  const executedReportExists = await deps.pathExists(executionContext.reportFilePath);
  if (!executedReportExists) {
    return false;
  }

  if (executionContext.reportFilePath === record.artifactPlan.reportFilePath) {
    return true;
  }

  await deps.mkdir(path.dirname(record.artifactPlan.reportFilePath), { recursive: true });
  await deps.copyFile(executionContext.reportFilePath, record.artifactPlan.reportFilePath);
  return true;
}

interface WindowsInteropLayout {
  reportDirectory: string;
  stagingDirectory: string;
  leftFilePath: string;
  rightFilePath: string;
  reportFilePath: string;
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

function buildWindowsInteropCommandPlan(
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

      if (current === '-vi1') {
        const leftFilePath = normalizeWindowsInteropPath(interopLayout.leftFilePath);
        if (!leftFilePath) {
          return undefined;
        }
        args.push(current, leftFilePath);
        index += 1;
        continue;
      }

      if (current === '-vi2') {
        const rightFilePath = normalizeWindowsInteropPath(interopLayout.rightFilePath);
        if (!rightFilePath) {
          return undefined;
        }
        args.push(current, rightFilePath);
        index += 1;
        continue;
      }

      if (current === '-reportPath') {
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
    return trimmed;
  }

  const [, driveLetter, tail] = windowsPathMatch;
  const normalizedTail = tail.replaceAll('\\', '/');
  return `/mnt/${driveLetter.toLowerCase()}/${normalizedTail}`;
}

export function parseLabviewCliDiagnosticLogPath(stdout: string): string | undefined {
  const match = stdout.match(/LabVIEWCLI started logging in file:\s*([^\r\n]+)/m);
  return match?.[1]?.trim();
}

export function resolveHostReadableDiagnosticPath(
  diagnosticLogPath: string,
  processPlatform: NodeJS.Platform = process.platform
): string | undefined {
  if (processPlatform === 'win32') {
    return diagnosticLogPath.trim() || undefined;
  }

  return normalizeWindowsInteropExecutable(diagnosticLogPath);
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

function extractCommandOptionValue(args: string[], optionName: string): string | undefined {
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
    ? 'tasklist'
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

export function runComparisonCommandPlanWithObservation(
  commandPlan: ComparisonCommandPlan,
  deps: RunComparisonCommandPlanWithObservationDeps = {}
): Promise<RunCommandResult> {
  return new Promise((resolve, reject) => {
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

    const maybeStartObservation = () => {
      if (observationStarted || !parseLabviewCliDiagnosticLogPath(stdout)) {
        return;
      }

      observationStarted = true;
      observationPromise = Promise.resolve(
        (deps.observeWindowsProcesses ?? observeWindowsRuntimeProcesses)({
          hostPlatform: deps.hostPlatform ?? process.platform,
          runtimePlatform: deps.runtimePlatform ?? process.platform,
          trigger: 'cli-log-banner'
        })
      )
        .then((capturedObservation) => {
          processObservation = capturedObservation;
        })
        .catch((error) => {
          observationError = error;
        });
    };

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string | Buffer) => {
      stdout += String(chunk);
      maybeStartObservation();
    });
    child.stderr?.on('data', (chunk: string | Buffer) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', async (exitCode, signal) => {
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

      if (typeof exitCode !== 'number') {
        reject(new Error('comparison-command-closed-without-exit-code'));
        return;
      }

      resolve({
        exitCode,
        signal: signal ?? undefined,
        stdout,
        stderr,
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
    (deps.execFileImpl ?? execFile)(
      commandPlan.executable,
      commandPlan.args,
      {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (!error) {
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
        };

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
