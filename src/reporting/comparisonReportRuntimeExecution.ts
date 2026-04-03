import { execFile, ExecFileException } from 'node:child_process';
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
}

export interface RunCommandResult {
  exitCode: number;
  signal?: string;
  stdout: string;
  stderr: string;
}

export interface RunComparisonCommandPlanDeps {
  execFileImpl?: typeof execFile;
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
  const runCommand = deps.runCommand ?? runComparisonCommandPlan;
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
        processPlatform: deps.processPlatform ?? process.platform
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

    return {
      state: succeeded ? 'succeeded' : 'failed',
      attempted: true,
      reportExists,
      failureReason: succeeded
        ? undefined
        : commandResult.exitCode !== 0
          ? 'command-exited-nonzero'
          : 'report-file-not-generated',
      diagnosticReason: diagnostics.reason,
      diagnosticNotes: diagnostics.notes,
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
      stderrFilePath: record.artifactPlan.runtimeStderrFilePath
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
        notes
      };
    }

    if (normalizedExpectedPath && normalizedExpectedPath !== normalizedActualPath) {
      notes.push(
        `LabVIEW CLI ignored the explicit -LabVIEWPath selection and used a different last-used LabVIEW instead: ${actualLabviewPath}.`
      );
      notes.push(`Intended explicit LabVIEW path: ${expectedLabviewPath}.`);
      return {
        reason: 'labview-path-ignored-last-used-diverged-selection',
        notes
      };
    }

    notes.push(
      `LabVIEW CLI ignored the explicit -LabVIEWPath selection and used the last-used LabVIEW instead: ${actualLabviewPath}.`
    );
    return {
      reason: 'labview-path-ignored-last-used-default',
      notes
    };
  }

  if (/LabVIEW launched successfully\./i.test(diagnosticText)) {
    notes.push('LabVIEW CLI reported that LabVIEW launched successfully before the operation failed.');
  }

  return {
    notes
  };
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
