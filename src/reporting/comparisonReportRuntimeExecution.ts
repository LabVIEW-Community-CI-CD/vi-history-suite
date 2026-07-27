import { execFile, ExecFileException, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { joinPreservingExplicitPathStyle } from '../support/pathStyle';
import {
  parseWindowsTasklistCsv,
  isObservedRuntimeProcessName,
  isExactObservedRuntimeProcessName
} from './runtime/windowsTasklistParsing';
export { parseWindowsTasklistCsv } from './runtime/windowsTasklistParsing';
import { isSafeRelativeSubpath } from './runtime/safeRelativeSubpath';
import { appendCancellationMessage } from './runtime/cancellationMessage';
import { subscribeToCancellation } from './runtime/cancellationSubscription';
import {
  shouldCaptureLinuxHeadlessDiagnostics
} from './runtime/linuxHeadlessPredicates';
import { buildWindowsContainerDirectCommandScript } from './runtime/windowsContainerDirectCommandScript';
import {
  describeObservedRuntimeProcesses,
  describeObservedWindowsTcpListeners
} from './runtime/windowsRuntimeObservationFormatting';
import {
  extractErrorCode,
  normalizeComparisonProcessError
} from './runtime/comparisonProcessErrorNormalization';
export { normalizeComparisonProcessError } from './runtime/comparisonProcessErrorNormalization';
import {
  inferLabviewBitnessFromExecutablePath,
  inferSupportedLabviewYearFromExecutablePath
} from './runtime/labviewExecutablePathInference';
export {
  inferLabviewBitnessFromExecutablePath,
  inferLabviewYearFromExecutablePath,
  inferSupportedLabviewYearFromExecutablePath
} from './runtime/labviewExecutablePathInference';
import {
  normalizeWindowsInteropPath,
  resolveHostReadableWindowsPath
} from './runtime/windowsInteropPaths';
export {
  normalizeWindowsInteropPath,
  normalizeWindowsInteropExecutable,
  resolveHostReadableWindowsPath
} from './runtime/windowsInteropPaths';
import {
  resolveWindowsPowerShellHostExecutable,
  encodeWindowsPowerShellScript,
  quotePowerShellLiteral,
  quoteBashLiteral,
  buildBashArrayLiteral
} from './runtime/shellScriptEncoding';
import { parseWindowsContainerRuntimeFacts } from './runtime/windowsContainerRuntimeFacts';
import {
  resolveWindowsSystem32Executable,
  parseWindowsNetstatListeners
} from './runtime/windowsNetstatListeners';
import {
  parseLabviewCliDiagnosticLogPath,
  resolveHostReadableDiagnosticPath,
  classifyLabviewCliDiagnosticText,
  type RuntimeDiagnosticPathMapping
} from './runtime/labviewCliDiagnostics';
export {
  parseLabviewCliDiagnosticLogPath,
  resolveHostReadableDiagnosticPath,
  resolveMappedRuntimeDiagnosticPath,
  classifyLabviewCliDiagnosticText
} from './runtime/labviewCliDiagnostics';
import {
  mergeDiagnosticNotes,
  buildProcessObservationNotes,
  buildLinuxContainerBindMountVisibilityNote,
  extractCommandOptionValue
} from './runtime/diagnosticNotes';
export {
  buildLinuxContainerBindMountVisibilityNote,
  extractCommandOptionValue
} from './runtime/diagnosticNotes';
import { parseSubmoduleGitlinks } from './runtime/submoduleGitlinkParsing';
export { parseSubmoduleGitlinks } from './runtime/submoduleGitlinkParsing';
import { appendLabviewCliPortNumberArg } from './runtime/labviewCliPortArg';
export { appendLabviewCliPortNumberArg } from './runtime/labviewCliPortArg';
import { buildWindowsInteropLayout } from './runtime/windowsInteropLayout';
import {
  shouldUseLinuxHostNativeShortPathStaging,
  buildLinuxHostNativeShortPathLayout
} from './runtime/linuxHostNativeStaging';
export {
  shouldUseLinuxHostNativeShortPathStaging,
  buildLinuxHostNativeShortPathLayout
} from './runtime/linuxHostNativeStaging';
import {
  posixDirname,
  buildReportAssetsDirectoryPath
} from './runtime/runtimePathHelpers';
import {
  classifyRuntimeFailure,
  classifyCancelledRuntimeFailure,
  classifyTimedOutRuntimeDiagnostic
} from './runtime/runtimeFailureClassification';
export { classifyRuntimeFailure } from './runtime/runtimeFailureClassification';
import {
  buildLinuxContainerRuntimeFilenameAlias,
  applyRuntimeTextReplacements,
  type RuntimeTextReplacement
} from './runtime/runtimeTextReplacements';
import { selectDiagnosticReason } from './runtime/selectDiagnosticReason';
import { nowIso } from '../support/clock';
import { ComparisonCommandPlan, ComparisonReportOptions } from './comparisonReportPlan';
import {
  LEFT_TREE_SUBDIRECTORY,
  RIGHT_TREE_SUBDIRECTORY
} from './comparisonReportPlan';
import {
  buildLinuxHostNativeShortPathCommandPlan,
  buildWindowsInteropCommandPlan
} from './runtime/interopCommandPlanBuilders';
export {
  buildLinuxHostNativeShortPathCommandPlan,
  buildWindowsInteropCommandPlan
} from './runtime/interopCommandPlanBuilders';
import {
  resolveEffectiveRuntimePlatform
} from './runtime/runtimeSelectionPredicates';
import {
  WINDOWS_CONTAINER_WORKSPACE_ROOT,
  WINDOWS_CONTAINER_TEMP_ROOT,
  LINUX_CONTAINER_WORKSPACE_ROOT,
  LINUX_CONTAINER_TEMP_ROOT,
  LINUX_CONTAINER_LABVIEW_EXECUTABLE
} from './runtime/containerLaunchConstants';
import {
  buildWindowsHostNativeHeadlessCommandPlan,
  buildWindowsContainerLabviewCliScript,
  shouldWrapWindowsHostNativeHeadless
} from './runtime/headlessLaunchScriptBuilders';
export {
  buildWindowsHostNativeHeadlessCommandPlan,
  buildWindowsContainerLabviewCliScript,
  shouldWrapWindowsHostNativeHeadless
} from './runtime/headlessLaunchScriptBuilders';
import {
  buildLinuxContainerLabviewCliScript,
  buildLinuxContainerDirectCommandScript
} from './runtime/linuxContainerLaunchScriptBuilders';
export {
  buildLinuxContainerLabviewCliScript
} from './runtime/linuxContainerLaunchScriptBuilders';
import { resolveEffectiveCommandTimeoutMs } from './runtime/effectiveCommandTimeout';
export {
  resolveEffectiveCommandTimeoutMs,
  LINUX_HOST_NATIVE_HEADLESS_OPT_IN_DEFAULT_TIMEOUT_MS
} from './runtime/effectiveCommandTimeout';
import { buildComparisonReportExecutionPlan } from './comparisonReportExecutionPlan';
import {
  ComparisonReportPacketRecord,
  ComparisonReportRuntimeExecution,
  writeComparisonReportPacketRecord
} from './comparisonReportPacket';
import { runComparisonPreviewPipeline } from './comparisonPreviewPipeline';
import {
  STAGED_VI_PREVIEW_VALIDATION_FAILED,
  toPipelineCycleRecords,
  type StagedViPreviewValidator
} from './comparisonPreviewPipelineIntegration';
import { buildComparisonRuntimeDoctorSummary } from './comparisonRuntimeDoctor';
import { readRevisionBlob } from './comparisonReportPreflight';
import { isWorktreeRevision } from '../git/gitCli';
import {
  buildWorktreeSnapshotProvenanceNote,
  deriveComparedWorktreeSnapshotId
} from './comparisonReportRuntimeExecutionWorktreeSnapshot';

export {
  buildWorktreeSnapshotProvenanceNote,
  deriveComparedWorktreeSnapshotId,
  deriveWorktreeSnapshotIdentity
} from './comparisonReportRuntimeExecutionWorktreeSnapshot';
import {
  buildLinuxLabviewIniCandidatePaths,
  inferLinuxLabviewVersionFromExecutablePath
} from './runtime/linuxLabviewConfigPaths';

export {
  buildLinuxLabviewIniCandidatePaths,
  inferLinuxLabviewVersionFromExecutablePath
} from './runtime/linuxLabviewConfigPaths';
import {
  rewriteLabviewCliArgsForContainerWorkspace,
  rewriteLvcompareArgsForContainerWorkspace,
  rewriteLvcompareArgsForLinuxContainerWorkspace
} from './runtime/containerWorkspaceArgRewrite';

export {
  rewriteLabviewCliArgsForContainerWorkspace,
  rewriteLvcompareArgsForContainerWorkspace,
  rewriteLvcompareArgsForLinuxContainerWorkspace
} from './runtime/containerWorkspaceArgRewrite';
import { classifySelectedTreeMaterializeError } from './runtime/selectedTreeMaterializeErrorClassification';

export {
  classifySelectedTreeMaterializeError,
  SELECTED_TREE_MATERIALIZE_LONG_PATH_DIAGNOSTIC,
  type SelectedTreeMaterializeErrorClassification
} from './runtime/selectedTreeMaterializeErrorClassification';
import {
  createDiagnosticsRecorder,
  DiagnosticsRecorder,
  noopDiagnosticsRecorder
} from './diagnostics/diagnosticsRecorder';
import {
  applyLabVIEWCliIniHardening,
  LabVIEWCliIniHardeningResult
} from './runtime/labviewCliIni';
import {
  resolveLinuxContainerLabviewProfile,
  type LinuxContainerHeadlessMode
} from '../tooling/containerImageCatalog';

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
  /**
   * VHS-REQ-624: materializes the selected (newest) revision's tree so staged VIs
   * resolve in-repo dependencies at load time. There is no built-in default: when
   * this dependency is omitted, tree materialization is skipped (staging stays
   * flat). Wired by the production action and used by the host-native, Windows
   * container, and Linux container providers.
   */
  materializeSelectedRevisionTree?: MaterializeSelectedRevisionTree;
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
  copyFile?: typeof fs.copyFile;
  copyDirectory?: typeof fs.cp;
  removePath?: typeof fs.rm;
  unlinkFile?: typeof fs.unlink;
  chmod?: typeof fs.chmod;
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
  /**
   * Optional diagnostics recorder. When omitted, a default recorder is
   * constructed using the same fs/observation deps. Pass `noopDiagnosticsRecorder()`
   * from tests to disable diagnostics emission.
   */
  diagnosticsRecorder?: DiagnosticsRecorder;
  /** When true, suppress the default diagnostics recorder construction. */
  disableDiagnostics?: boolean;
  /**
   * VHS-REQ-148: optional override for the LabVIEWCLI.ini connect-window hardening helper.
   * When omitted, the default helper is used. Pass a noop in tests to skip filesystem touches.
   */
  applyLabviewCliIniHardening?: typeof applyLabVIEWCliIniHardening;
  /**
   * VHS-REQ-148: requested value (in seconds) for `OpenAppReferenceTimeoutInSecond` and
   * `AfterLaunchOpenAppReferenceTimeoutInSecond`. When undefined, the helper is not invoked
   * and the existing NI default applies.
   */
  cliConnectTimeoutSeconds?: number;
  /**
   * VHS-REQ-645: user-configurable comparison report flags (format + difference-
   * suppression filters) read from `viHistorySuite.report.*`. When omitted, the
   * execution plan keeps the shipped defaults (single-file HTML, compare
   * everything).
   */
  reportOptions?: ComparisonReportOptions;
  /**
   * VHS-REQ-699: staged-VI preview validator that renders a preview of each
   * staged VI (PREVIEW_LEFT, PREVIEW_RIGHT) before the CreateComparisonReport
   * cycle so a staged VI that cannot load short-circuits the fragile comparison
   * with an actionable `staged-vi-preview-validation-failed` signal. Following the
   * `materializeSelectedRevisionTree` pattern there is no built-in default: when
   * omitted, the preview-validation pipeline is skipped and the comparison runs
   * directly. The production action wires the real renderer so the pipeline is
   * always-on across providers.
   */
  renderStagedViPreview?: StagedViPreviewValidator;
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

export type ObservedLabviewBitness = 'x86' | 'x64' | 'unknown';

export interface RuntimeProcessObservation {
  capturedAt: string;
  hostPlatform: NodeJS.Platform;
  runtimePlatform: string;
  trigger: 'preflight' | 'cli-log-banner' | 'process-spawn' | 'process-exit' | 'pre-launch-baseline';
  observedProcesses: RuntimeObservedProcess[];
  observedProcessNames: string[];
  labviewProcessObserved: boolean;
  labviewCliProcessObserved: boolean;
  lvcompareProcessObserved: boolean;
  /**
   * VHS-REQ-621: bitness of the first observed `LabVIEW.exe` running on the
   * Windows host, inferred from its executable path. `undefined` when no
   * LabVIEW.exe is running or when the path probe was skipped/failed.
   */
  labviewProcessBitness?: ObservedLabviewBitness;
  /**
   * VHS-REQ-637: major LabVIEW version (year) inferred from the observed
   * `LabVIEW.exe` path. `undefined` when no supported year can be parsed.
   */
  labviewProcessYear?: string;
  /**
   * Path of the first observed LabVIEW.exe that the bitness probe inspected.
   * Captured so doctor notes can name the offending install precisely.
   */
  labviewProcessExecutablePath?: string;
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
  /**
   * VHS-REQ-623: tri-state mirroring `LinuxLabviewTcpSettings.viServerTcpEnabled`.
   * `true` when `server.tcp.enabled=True` is parsed or the key is absent in a
   * readable ini (Windows LabVIEW defaults VI Server TCP on, opposite of NI
   * Linux). `false` only when the key is parsed as explicitly `False`.
   * `'unknown'` when the ini is not readable; absent/undefined when the
   * runtime selection is not Windows host-native LabVIEWCLI.
   */
  viServerTcpEnabled?: boolean | 'unknown';
  notes: string[];
}

export interface LinuxLabviewTcpSettings {
  labviewIniPath?: string;
  labviewTcpPort?: number;
  /**
   * VHS-REQ-156: tri-state. `true` when `server.tcp.enabled=True` was found,
   * `false` when the key was explicitly disabled or the file was readable but
   * lacked any TCP keys (NI Linux defaults VI Server TCP off), `'unknown'`
   * when no candidate config file was readable.
   */
  viServerTcpEnabled: boolean | 'unknown';
  inspectedCandidatePaths: string[];
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
  /**
   * VHS-REQ-621: optional override used by tests to resolve the executable
   * path for a given LabVIEW.exe pid. Returns `undefined` to indicate the
   * path could not be determined (e.g. access denied, process exited).
   */
  resolveWindowsLabviewExecutablePath?: (
    pid: number,
    hostPlatform: NodeJS.Platform
  ) => Promise<string | undefined>;
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
  const plan = buildComparisonReportExecutionPlan(options.record, deps.reportOptions);
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const copyFile = deps.copyFile ?? fs.copyFile;
  const copyDirectory = deps.copyDirectory ?? fs.cp;
  const removePath = deps.removePath ?? fs.rm;
  const unlinkFile = deps.unlinkFile ?? fs.unlink;
  const chmod = deps.chmod ?? fs.chmod;
  const readFile = deps.readFile ?? fs.readFile;
  const pathExists = deps.pathExists ?? pathExistsForReport;
  const processPlatform = deps.processPlatform ?? process.platform;
  const enforceWindowsHostPreflight =
    deps.enforceWindowsHostPreflight ?? process.platform === 'win32';
  const observeWindowsProcesses = deps.observeWindowsProcesses ?? observeWindowsRuntimeProcesses;
  const observeWindowsTcpListenersFn =
    deps.observeWindowsTcpListeners ?? observeWindowsTcpListeners;
  // VHS-REQ-156 (issue #269): bound the Linux host-native headless opt-in so a
  // broken HeadlessManager cannot hang indefinitely without surfacing the
  // linux-headless-init-failed diagnostic. An explicitly configured timeout always
  // wins; all other paths stay unbounded as before.
  const effectiveCommandTimeoutMs = resolveEffectiveCommandTimeoutMs({
    record: options.record,
    commandPlan: plan.commandPlan,
    configuredTimeoutMs: deps.commandTimeoutMs
  });
  const runCommand =
    deps.runCommand ??
    buildDefaultRunCommand({
      provider: plan.provider,
      processPlatform,
      runtimePlatform: resolveEffectiveRuntimePlatform(options.record.runtimeSelection),
      observeWindowsProcesses,
      engine: options.record.runtimeSelection.engine,
      timeoutMs: effectiveCommandTimeoutMs,
      cancellationToken: options.cancellationToken
    });
  const nowIso = deps.nowIso ?? defaultNowIso;
  const nowMs = deps.nowMs ?? defaultNowMs;
  const writePacketRecord = deps.writePacketRecord ?? writeComparisonReportPacketRecord;

  const diagnosticsRecorder: DiagnosticsRecorder =
    deps.diagnosticsRecorder ??
    (deps.disableDiagnostics
      ? noopDiagnosticsRecorder()
      : createDiagnosticsRecorder({
          mkdir,
          writeFile,
          readFile,
          processPlatform,
          nowIso,
          observeWindowsProcesses,
          observeWindowsTcpListeners: observeWindowsTcpListenersFn
        }));

  // VHS-REQ-148: harden NI LabVIEWCLI.ini connect-window keys before recording the environment
  // fingerprint so the resulting fingerprint reflects the values actually used by the upcoming
  // CreateComparisonReport invocation. Host-native + labview-cli only; container path embeds its
  // own ini work in the PowerShell script and is not touched here.
  let cliConnectTimeoutHardening: LabVIEWCliIniHardeningResult | undefined;
  if (
    processPlatform === 'win32' &&
    options.record.runtimeSelection.provider === 'host-native' &&
    options.record.runtimeSelection.engine === 'labview-cli' &&
    typeof deps.cliConnectTimeoutSeconds === 'number'
  ) {
    const harden = deps.applyLabviewCliIniHardening ?? applyLabVIEWCliIniHardening;
    try {
      cliConnectTimeoutHardening = await harden({
        requestedValueSeconds: deps.cliConnectTimeoutSeconds
      });
    } catch {
      cliConnectTimeoutHardening = {
        applied: false,
        requestedValue: deps.cliConnectTimeoutSeconds,
        reason: 'write-failed'
      };
    }
  }

  await diagnosticsRecorder.recordEnvironmentFingerprint(options.record, {
    cliConnectTimeoutHardening
  });

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
        materializeSelectedRevisionTree: deps.materializeSelectedRevisionTree,
        mkdir,
        writeFile,
        copyFile,
        copyDirectory,
        removePath,
        unlinkFile,
        chmod,
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
        commandTimeoutMs: effectiveCommandTimeoutMs,
        diagnosticsRecorder,
        cliConnectTimeoutSeconds: deps.cliConnectTimeoutSeconds,
        renderStagedViPreview: deps.renderStagedViPreview
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
  if (cliConnectTimeoutHardening) {
    updatedRecord.runtimeExecution.cliConnectTimeoutHardening = {
      applied: cliConnectTimeoutHardening.applied,
      requestedValue: cliConnectTimeoutHardening.requestedValue,
      ...(cliConnectTimeoutHardening.reason
        ? { reason: cliConnectTimeoutHardening.reason }
        : {})
    };
  }
  updatedRecord.runtimeExecution.doctorSummaryLines = buildComparisonRuntimeDoctorSummary(updatedRecord);
  await writePacketRecord(updatedRecord, {
    mkdir,
    writeFile
  });

  if (
    updatedRecord.runtimeExecution.state === 'failed' &&
    updatedRecord.runtimeExecution.attempted &&
    updatedRecord.runtimeExecution.failureReason
  ) {
    await diagnosticsRecorder.recordFailureClassification(updatedRecord, 1, {
      failureReason: updatedRecord.runtimeExecution.failureReason,
      diagnosticReason: updatedRecord.runtimeExecution.diagnosticReason,
      exitCode: updatedRecord.runtimeExecution.exitCode,
      signal: updatedRecord.runtimeExecution.signal,
      durationMs: updatedRecord.runtimeExecution.durationMs,
      artifactPaths: {
        stdout: updatedRecord.runtimeExecution.stdoutFilePath,
        stderr: updatedRecord.runtimeExecution.stderrFilePath,
        diagnosticLog: updatedRecord.runtimeExecution.diagnosticLogArtifactPath,
        processObservation: updatedRecord.runtimeExecution.processObservationArtifactPath
      }
    });
  }

  await diagnosticsRecorder.flushManifest(updatedRecord);

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



export interface MaterializeSelectedRevisionTreeOptions {
  repositoryRoot: string;
  revisionId: string;
  destinationRoot: string;
  pathspec: string;
}

export type MaterializeSelectedRevisionTree = (
  options: MaterializeSelectedRevisionTreeOptions
) => Promise<void>;

/**
 * VHS-REQ-624: runs a single git invocation to completion, resolving on a clean
 * exit and rejecting with captured stderr otherwise. Injected by unit tests so
 * the materializer's command sequence stays deterministically assertable.
 */
export type RunGitToCompletion = (
  args: string[],
  options: { env: NodeJS.ProcessEnv }
) => Promise<void>;

export interface SubmoduleGitlink {
  /** Repository-relative POSIX path of the submodule within its parent tree. */
  path: string;
  /** Pinned commit recorded for the submodule at the parent revision. */
  revisionId: string;
}

export type ListSubmoduleGitlinks = (options: {
  workingDirectory: string;
  revisionId: string;
}) => Promise<SubmoduleGitlink[]>;

export interface MaterializeSelectedRevisionTreeDeps {
  runGit?: RunGitToCompletion;
  /**
   * VHS-REQ-624 (#283): enumerates the submodule gitlinks recorded at a revision
   * so their contents can be materialized beside the staged VIs. Defaults to a
   * `git ls-tree` reader; injected by unit tests so enumeration stays
   * deterministic.
   */
  listSubmoduleGitlinks?: ListSubmoduleGitlinks;
  mkdtemp?: typeof fs.mkdtemp;
  removePath?: typeof fs.rm;
  tmpdir?: () => string;
}

/** VHS-REQ-624 (#283): cap recursion so a pathological submodule graph cannot loop. */
const MAX_SUBMODULE_RECURSION_DEPTH = 10;

/**
 * VHS-REQ-624: default selected-revision tree materializer. Faithfully
 * reproduces every file tracked at the selected revision into
 * `destinationRoot` so the staged VIs resolve their in-repo dependencies at
 * load time. It populates an isolated temporary index with
 * `git read-tree <revision>` and then `git checkout-index -a -f` against an
 * alternate work tree. Unlike `git archive`, `checkout-index` mirrors the full
 * tracked tree: files excluded from archives via `.gitattributes export-ignore`
 * are still materialized, so in-repo dependencies under export-ignored paths
 * resolve instead of rendering as whiteboxes.
 *
 * VHS-REQ-624 (#283): `checkout-index` materializes only the superproject's own
 * blobs, so after the superproject tree is reproduced this recurses into each
 * submodule gitlink recorded at the revision and materializes the submodule's
 * pinned tree at its repo-relative location (and into nested submodules).
 * Superproject materialization stays fail-closed; submodule materialization is
 * best-effort, so an uninitialized or otherwise unavailable submodule never
 * fails the comparison — it simply stays absent as it did before.
 *
 * Used by the host-native and container providers; wired at the production
 * action call site and injectable for deterministic unit tests.
 */
export async function materializeSelectedRevisionTreeWithGit(
  options: MaterializeSelectedRevisionTreeOptions,
  deps: MaterializeSelectedRevisionTreeDeps = {}
): Promise<void> {
  const runGit = deps.runGit ?? spawnGitToCompletion;
  const mkdtemp = deps.mkdtemp ?? fs.mkdtemp;
  const removePath = deps.removePath ?? fs.rm;
  const tmpdir = deps.tmpdir ?? os.tmpdir;
  const listSubmoduleGitlinks = deps.listSubmoduleGitlinks ?? spawnGitListSubmoduleGitlinks;
  // VHS-REQ-641: the working-tree sentinel is not a git revision. Materialize the
  // HEAD tree as the dependency context so the loose, uncommitted VI resolves its
  // in-repo siblings; the uncommitted VI bytes themselves are staged separately
  // by the disk-aware blob reader.
  const revisionId = isWorktreeRevision(options.revisionId) ? 'HEAD' : options.revisionId;

  // Fail closed: the superproject tree must materialize for the comparison to be
  // meaningful.
  await checkoutRevisionIntoWorkTree({
    sourceWorkingDirectory: options.repositoryRoot,
    revisionId,
    destinationRoot: options.destinationRoot,
    runGit,
    mkdtemp,
    removePath,
    tmpdir
  });

  // Best effort: materialize submodule contents beside the staged VIs so
  // dependencies tracked through submodules resolve at load time (#283).
  await materializeSubmoduleTreesBestEffort({
    sourceWorkingDirectory: options.repositoryRoot,
    revisionId,
    destinationRoot: options.destinationRoot,
    runGit,
    mkdtemp,
    removePath,
    tmpdir,
    listSubmoduleGitlinks,
    depth: 0
  });
}

interface CheckoutRevisionIntoWorkTreeParams {
  sourceWorkingDirectory: string;
  revisionId: string;
  destinationRoot: string;
  runGit: RunGitToCompletion;
  mkdtemp: typeof fs.mkdtemp;
  removePath: typeof fs.rm;
  tmpdir: () => string;
}

/**
 * VHS-REQ-624: reproduce a single revision's tracked tree into a work tree via a
 * throwaway temporary index (`read-tree` then `checkout-index`). The temporary
 * index is always removed, and `GIT_INDEX_FILE` is absolute because git runs
 * with the source repository as its working directory.
 */
async function checkoutRevisionIntoWorkTree(
  params: CheckoutRevisionIntoWorkTreeParams
): Promise<void> {
  // Reconstruct the tree through an isolated temporary index so it never
  // disturbs the source repository's real index.
  const indexParent = await params.mkdtemp(path.join(params.tmpdir(), 'vihs-stage-index-'));
  const indexFile = path.join(indexParent, 'index');
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };

  try {
    // Populate the temp index with the revision's full tree.
    await params.runGit(
      ['-C', params.sourceWorkingDirectory, 'read-tree', params.revisionId],
      { env }
    );
    // Check out every tracked entry into the destination work tree.
    // `checkout-index` creates the directory structure and does not apply the
    // archive-only `export-ignore` attribute, so the materialized tree mirrors
    // the repository at the revision.
    // VHS-REQ-624 (#303): enable `core.longpaths` so deep destination roots (for
    // example a deep Windows workspaceStorage path) do not trip the Win32
    // MAX_PATH (260) limit and fail materialization with "Filename too long".
    await params.runGit(
      [
        '-C',
        params.sourceWorkingDirectory,
        '-c',
        'core.longpaths=true',
        '--work-tree',
        params.destinationRoot,
        'checkout-index',
        '-a',
        '-f'
      ],
      { env }
    );
  } finally {
    try {
      await params.removePath(indexParent, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup of the temporary index; ignore failures.
    }
  }
}

interface MaterializeSubmoduleTreesParams extends CheckoutRevisionIntoWorkTreeParams {
  listSubmoduleGitlinks: ListSubmoduleGitlinks;
  depth: number;
}

/**
 * VHS-REQ-624 (#283): materialize the contents of every submodule recorded at
 * `revisionId` into the destination, recursing into nested submodules. Each
 * submodule is best-effort: when its objects are unavailable (for example an
 * uninitialized submodule) the checkout is skipped rather than failing the
 * whole comparison. Submodule paths are validated as plain relative subpaths so
 * a crafted tree entry cannot escape the destination root.
 */
async function materializeSubmoduleTreesBestEffort(
  params: MaterializeSubmoduleTreesParams
): Promise<void> {
  if (params.depth >= MAX_SUBMODULE_RECURSION_DEPTH) {
    return;
  }

  let gitlinks: SubmoduleGitlink[];
  try {
    gitlinks = await params.listSubmoduleGitlinks({
      workingDirectory: params.sourceWorkingDirectory,
      revisionId: params.revisionId
    });
  } catch {
    // Enumeration failed (for example a git error); leave the superproject tree
    // as already materialized.
    return;
  }

  for (const gitlink of gitlinks) {
    if (!isSafeRelativeSubpath(gitlink.path)) {
      continue;
    }
    const segments = gitlink.path.split('/').filter((segment) => segment.length > 0);
    const submoduleSource = joinPreservingExplicitPathStyle(
      params.sourceWorkingDirectory,
      ...segments
    );
    const submoduleDestination = joinPreservingExplicitPathStyle(
      params.destinationRoot,
      ...segments
    );

    try {
      await checkoutRevisionIntoWorkTree({
        sourceWorkingDirectory: submoduleSource,
        revisionId: gitlink.revisionId,
        destinationRoot: submoduleDestination,
        runGit: params.runGit,
        mkdtemp: params.mkdtemp,
        removePath: params.removePath,
        tmpdir: params.tmpdir
      });
    } catch {
      // Submodule objects unavailable (e.g. not initialized); skip it.
      continue;
    }

    // Recurse so submodules-of-submodules are materialized too.
    await materializeSubmoduleTreesBestEffort({
      ...params,
      sourceWorkingDirectory: submoduleSource,
      revisionId: gitlink.revisionId,
      destinationRoot: submoduleDestination,
      depth: params.depth + 1
    });
  }
}

function spawnGitToCompletion(
  args: string[],
  options: { env: NodeJS.ProcessEnv }
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error): void => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    const child = spawn('git', args, { windowsHide: true, env: options.env });
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', fail);
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      if (code !== 0) {
        fail(new Error(`git ${args.join(' ')} exited ${code}: ${stderr.trim()}`));
        return;
      }
      settled = true;
      resolve();
    });
  });
}

/**
 * VHS-REQ-624 (#283): default submodule enumerator. Reads gitlink entries from
 * `git ls-tree -r -z <revision>` (NUL-delimited so paths containing spaces stay
 * intact) and returns each submodule's path and pinned commit.
 */
function spawnGitListSubmoduleGitlinks(options: {
  workingDirectory: string;
  revisionId: string;
}): Promise<SubmoduleGitlink[]> {
  return new Promise<SubmoduleGitlink[]>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error): void => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    const child = spawn(
      'git',
      ['-C', options.workingDirectory, 'ls-tree', '-r', '-z', options.revisionId],
      { windowsHide: true }
    );
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', fail);
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      if (code !== 0) {
        fail(new Error(`git ls-tree exited ${code}: ${stderr.trim()}`));
        return;
      }
      settled = true;
      resolve(parseSubmoduleGitlinks(stdout));
    });
  });
}

/**
 * VHS-REQ-624 / VHS-REQ-147: after a host-native run that materialized the
 * selected-revision tree directly into the retained staging directory (the
 * win32 host-native path, and the Linux opt-out path), remove the materialized
 * dependency tree but re-stage the two compared VIs so retained evidence keeps
 * only the deterministic staged inputs, not the whole repository. The Linux
 * short-path and container providers already stage into ephemeral directories
 * cleaned via `cleanupPaths`, so they do not use this helper.
 */
async function pruneRetainedMaterializedTree(
  record: ComparisonReportPacketRecord,
  deps: {
    removePath: typeof fs.rm;
    mkdir: typeof fs.mkdir;
    writeFile: typeof fs.writeFile;
  },
  leftTreeRoot: string,
  rightTreeRoot: string,
  leftBlob: Buffer,
  rightBlob: Buffer
): Promise<void> {
  // Both per-revision tree roots are always present here: this runs only after a
  // successful two-tree materialization (the caller guards on `materializedTree`,
  // which is set only when both roots and revision ids resolved), so the roots are
  // passed in as definite paths rather than re-derived from the optional plan.
  try {
    await deps.removePath(leftTreeRoot, { recursive: true, force: true });
    await deps.removePath(rightTreeRoot, { recursive: true, force: true });
    await deps.mkdir(path.dirname(record.stagedRevisionPlan.leftFilePath), { recursive: true });
    await deps.writeFile(record.stagedRevisionPlan.leftFilePath, leftBlob);
    await deps.mkdir(path.dirname(record.stagedRevisionPlan.rightFilePath), { recursive: true });
    await deps.writeFile(record.stagedRevisionPlan.rightFilePath, rightBlob);
  } catch {
    // Preserve the deterministic execution result even if cleanup cannot complete.
  }
}

async function runHostNativeExecution(
  record: ComparisonReportPacketRecord,
  repositoryRoot: string,
  commandPlan: ComparisonCommandPlan,
  interopWorkspaceRoot: string | undefined,
  deps: {
    readBlob: typeof readRevisionBlob;
    materializeSelectedRevisionTree?: MaterializeSelectedRevisionTree;
    mkdir: typeof fs.mkdir;
    writeFile: typeof fs.writeFile;
    copyFile: typeof fs.copyFile;
    copyDirectory: typeof fs.cp;
    removePath: typeof fs.rm;
    unlinkFile: typeof fs.unlink;
    chmod: typeof fs.chmod;
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
    diagnosticsRecorder?: DiagnosticsRecorder;
    cliConnectTimeoutSeconds?: number;
    renderStagedViPreview?: StagedViPreviewValidator;
  }
): Promise<ComparisonReportRuntimeExecution> {
  await deps.mkdir(record.artifactPlan.reportDirectory, { recursive: true });
  await deps.mkdir(record.artifactPlan.stagingDirectory, { recursive: true });

  // VHS-REQ-624: for the host-native provider, materialize BOTH revisions'
  // surrounding trees separately (base -> left tree, selected -> right tree) so
  // each staged VI resolves the in-repo dependencies as they existed at that
  // VI's revision. Fail closed before reading blobs or invoking the runtime when
  // either tree cannot be materialized. Container/interop providers re-stage from
  // in-memory buffers via stageSelectedRevisionTreeIntoDirectory. The Linux
  // short-path staging redirect owns its own materialization into a cleaned tmp
  // directory, so skip it here to avoid writing the trees into the retained
  // report directory uselessly.
  const stagedPlan = record.stagedRevisionPlan;
  let materializedTree: ComparisonReportRuntimeExecution['materializedTree'];
  if (
    record.runtimeSelection.provider === 'host-native' &&
    deps.materializeSelectedRevisionTree &&
    stagedPlan.leftTreeRoot &&
    stagedPlan.rightTreeRoot &&
    stagedPlan.leftTreeRevisionId &&
    stagedPlan.rightTreeRevisionId &&
    !shouldUseLinuxHostNativeShortPathStaging(record, deps.processPlatform)
  ) {
    const pathspec = stagedPlan.materializedPathspec?.trim() || '.';
    try {
      // `git checkout-index --work-tree <root>` only creates the subdirectories
      // beneath an existing work-tree root, so both per-revision tree roots must
      // exist before materializing into them; otherwise git fails closed with
      // "this operation must be run in a work tree".
      await deps.mkdir(stagedPlan.leftTreeRoot, { recursive: true });
      await deps.mkdir(stagedPlan.rightTreeRoot, { recursive: true });
      await deps.materializeSelectedRevisionTree({
        repositoryRoot,
        revisionId: stagedPlan.leftTreeRevisionId,
        destinationRoot: stagedPlan.leftTreeRoot,
        pathspec
      });
      await deps.materializeSelectedRevisionTree({
        repositoryRoot,
        revisionId: stagedPlan.rightTreeRevisionId,
        destinationRoot: stagedPlan.rightTreeRoot,
        pathspec
      });
      materializedTree = {
        left: {
          root: stagedPlan.leftTreeRoot,
          revisionId: stagedPlan.leftTreeRevisionId,
          pathspec
        },
        right: {
          root: stagedPlan.rightTreeRoot,
          revisionId: stagedPlan.rightTreeRevisionId,
          pathspec
        }
      };
    } catch (error) {
      // VHS-REQ-624 (#303): keep the stable failure reason but attach an
      // actionable diagnostic when the cause is a recognized Win32 long-path
      // violation, so a deep storage root surfaces a self-explanatory reason.
      const classification = classifySelectedTreeMaterializeError(error);
      return {
        state: 'failed',
        attempted: false,
        reportExists: false,
        failureReason: 'selected-tree-materialize-failed',
        ...(classification.diagnosticReason
          ? { diagnosticReason: classification.diagnosticReason }
          : {}),
        ...(classification.diagnosticNotes
          ? { diagnosticNotes: classification.diagnosticNotes }
          : {}),
        executable: commandPlan.executable,
        args: commandPlan.args,
        stdoutFilePath: record.artifactPlan.runtimeStdoutFilePath,
        stderrFilePath: record.artifactPlan.runtimeStderrFilePath
      };
    }
  }

  let leftBlob: Buffer;
  try {
    leftBlob = await deps.readBlob(
      repositoryRoot,
      record.preflight.left.revisionId,
      record.preflight.left.resolvedRelativePath ?? record.preflight.normalizedRelativePath
    );
    await deps.mkdir(path.dirname(record.stagedRevisionPlan.leftFilePath), { recursive: true });
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
      record.preflight.right.resolvedRelativePath ?? record.preflight.normalizedRelativePath
    );
    await deps.mkdir(path.dirname(record.stagedRevisionPlan.rightFilePath), { recursive: true });
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
    rightBlob,
    cliConnectTimeoutSeconds: deps.cliConnectTimeoutSeconds,
    repositoryRoot,
    materializeSelectedRevisionTree: deps.materializeSelectedRevisionTree
  });

  if (executionContext.outcome === 'blocked') {
    await cleanupPreparedExecutionContext(executionContext, deps.removePath);
    if (materializedTree) {
      await pruneRetainedMaterializedTree(
        record,
        deps,
        materializedTree.left.root,
        materializedTree.right.root,
        leftBlob,
        rightBlob
      );
    }
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

  try {
    const executionResult = await runHostNativeExecutionWithContext(
      record,
      commandPlan,
      executionContext,
      deps
    );
    if (materializedTree) {
      executionResult.materializedTree = materializedTree;
    } else if (executionContext.materializedTree) {
      executionResult.materializedTree = executionContext.materializedTree;
    }
    // VHS-REQ-641: when a working-tree (uncommitted) side was compared, record the
    // content-addressed identity of the staged snapshot as provenance so the
    // retained evidence names which on-disk bytes were used. Additive only; does
    // not affect retention (working-tree pairs remain unarchived, issue #1366).
    const worktreeSnapshotNote = buildWorktreeSnapshotProvenanceNote({
      selectedHash: record.selectedHash,
      baseHash: record.baseHash,
      normalizedRelativePath:
        record.preflight.normalizedRelativePath ?? record.artifactPlan.normalizedRelativePath,
      leftBytes: leftBlob,
      rightBytes: rightBlob
    });
    if (worktreeSnapshotNote) {
      executionResult.diagnosticNotes = [
        ...(executionResult.diagnosticNotes ?? []),
        worktreeSnapshotNote
      ];
    }
    // VHS-REQ-641 (Phase 3): surface the content-addressed snapshot identity on
    // the execution result so the archive seam can content-address the retained
    // pair-ID for a working-tree comparison (issue #1366).
    const worktreeSnapshotId = deriveComparedWorktreeSnapshotId({
      selectedHash: record.selectedHash,
      baseHash: record.baseHash,
      leftBytes: leftBlob,
      rightBytes: rightBlob
    });
    if (worktreeSnapshotId) {
      executionResult.worktreeSnapshotId = worktreeSnapshotId;
    }
    return executionResult;
  } finally {
    await cleanupPreparedExecutionContext(executionContext, deps.removePath);
    // VHS-REQ-624: when the tree was materialized into the retained staging
    // directory (win32 host-native / Linux opt-out), prune it back to the two
    // staged VIs so retained storage does not grow by the repository size per run.
    // VHS-REQ-699: when the single-pass pipeline is wired (validator present), its
    // UNSTAGING state OWNS this cleanup — it removes the whole staging directory
    // (pair + tree) and enumerates the real artifacts — so skip the legacy prune
    // (which would re-write the pair back and undo UNSTAGING).
    if (materializedTree && !deps.renderStagedViPreview) {
      await pruneRetainedMaterializedTree(
        record,
        deps,
        materializedTree.left.root,
        materializedTree.right.root,
        leftBlob,
        rightBlob
      );
    }
  }
}

async function runHostNativeExecutionWithContext(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan,
  executionContext: PreparedExecutionContext,
  deps: {
    readBlob: typeof readRevisionBlob;
    mkdir: typeof fs.mkdir;
    writeFile: typeof fs.writeFile;
    copyFile: typeof fs.copyFile;
    copyDirectory: typeof fs.cp;
    removePath: typeof fs.rm;
    unlinkFile: typeof fs.unlink;
    chmod: typeof fs.chmod;
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
    diagnosticsRecorder?: DiagnosticsRecorder;
    cliConnectTimeoutSeconds?: number;
    renderStagedViPreview?: StagedViPreviewValidator;
  }
): Promise<ComparisonReportRuntimeExecution> {
  const windowsLabviewTcpSettings = await resolveWindowsLabviewTcpSettings(
    record,
    executionContext.commandPlan,
    {
      readFile: deps.readFile,
      processPlatform: deps.processPlatform
    }
  );
  const linuxLabviewTcpSettings = await resolveLinuxLabviewTcpSettings(record, {
    readFile: deps.readFile
  });
  // VHS-REQ-706: Passing -PortNumber to LabVIEWCLI on the Linux host-native
  // comparison path triggers a GSW recursive load (exit 157). A reversible
  // single-variable toggle (same warm session and staged trees, back-to-back)
  // proved -PortNumber itself is the trigger there, independent of the staging
  // method or the port value. On that path we omit -PortNumber and let
  // LabVIEWCLI auto-connect to the running VI Server. Windows host-native and
  // container paths still pass the resolved port (VHS-REQ-631); they do not
  // exercise this failing attach path.
  const isLinuxHostNativeLabviewCli =
    record.runtimeSelection.platform === 'linux' &&
    record.runtimeSelection.engine === 'labview-cli' &&
    record.runtimeSelection.provider === 'host-native';
  const effectivePortFromIni =
    windowsLabviewTcpSettings.labviewTcpPort ?? linuxLabviewTcpSettings.labviewTcpPort;
  const effectiveExecutionContext: PreparedExecutionContext = {
    ...executionContext,
    commandPlan: {
      executable: executionContext.commandPlan.executable,
      args: isLinuxHostNativeLabviewCli
        ? [...executionContext.commandPlan.args]
        : appendLabviewCliPortNumberArg(
            executionContext.commandPlan.args,
            effectivePortFromIni
          )
    }
  };
  const linuxHostSurfacePreflight = preflightLinuxHostRuntimeSurface(
    record,
    effectiveExecutionContext.commandPlan,
    linuxLabviewTcpSettings
  );
  if (linuxHostSurfacePreflight) {
    return linuxHostSurfacePreflight.blockedExecution;
  }
  const windowsViServerTcpDisabledPreflight = preflightWindowsHostViServerTcpDisabled(
    record,
    effectiveExecutionContext.commandPlan,
    windowsLabviewTcpSettings
  );
  if (windowsViServerTcpDisabledPreflight) {
    return windowsViServerTcpDisabledPreflight.blockedExecution;
  }
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

  const executeAttempt = async (
    attemptIndex = 1
  ): Promise<ComparisonReportRuntimeExecution> => {
    await clearStaleExecutedReportArtifacts(record, effectiveExecutionContext, {
      removePath: deps.removePath,
      chmod: deps.chmod,
      readdir: deps.readdir
    });

    if (deps.diagnosticsRecorder) {
      await deps.diagnosticsRecorder.recordPreLaunchBaseline(record, attemptIndex, {
        requestedTcpPort: windowsLabviewTcpSettings.labviewTcpPort
      });
    }

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
        runFailed: commandResult.timedOut || commandResult.exitCode !== 0,
        commandArgs: effectiveExecutionContext.commandPlan.args,
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
          chmod: deps.chmod,
          readdir: deps.readdir,
          readFile: deps.readFile,
          writeFile: deps.writeFile,
          mkdir: deps.mkdir
        }
      ).catch((finalizeError: unknown) => {
        // The CreateComparisonReport command itself completed; only the copy of
        // the LabVIEW-generated report into the retained report directory threw
        // (for example a stale read-only `<report>_files/support` tree that
        // could not be overwritten). Surface this as a distinct
        // report-finalize-failed outcome instead of misclassifying it as a
        // command-spawn-failed launch error.
        throw new ReportFinalizationError(
          normalizeComparisonProcessError(finalizeError).stderr,
          extractErrorCode(finalizeError)
        );
      });
      const reportExists = finalizedReport.reportExists;
      const succeeded =
        !commandResult.timedOut &&
        !commandResult.cancelled &&
        commandResult.exitCode === 0 &&
        reportExists;
      const failureClassification = commandResult.cancelled
        ? classifyCancelledRuntimeFailure({
            engine: record.runtimeSelection.engine,
            diagnosticReason: diagnostics.reason
          })
        : commandResult.timedOut
        ? {
            reason: 'command-timed-out',
            notes: [
              `Comparison-report runtime timed out after ${String(
                commandResult.timeoutMs ?? deps.commandTimeoutMs ?? 'the configured'
              )}ms.`
            ]
          }
        : classifyRuntimeFailure({
            engine: record.runtimeSelection.engine,
            exitCode: commandResult.exitCode,
            reportExists,
            selectedBitness: record.runtimeSelection.bitness,
            stdout: commandResult.stdout,
            stderr: commandResult.stderr,
            processObservation: processObservation?.bannerSnapshot,
            exitProcessObservation: processObservation?.exitSnapshot
          });
      const timeoutDiagnostic = commandResult.timedOut
        ? classifyTimedOutRuntimeDiagnostic({
            engine: record.runtimeSelection.engine,
            processObservation: processObservation?.bannerSnapshot,
            exitProcessObservation: processObservation?.exitSnapshot
          })
        : {
            notes: []
          };
      const retainedLabviewIniPath =
        windowsContainerRuntimeFacts.labviewIniPath ??
        windowsLabviewTcpSettings.labviewIniPath ??
        linuxLabviewTcpSettings.labviewIniPath;
      const retainedLabviewTcpPort =
        windowsContainerRuntimeFacts.labviewTcpPort ??
        windowsLabviewTcpSettings.labviewTcpPort ??
        linuxLabviewTcpSettings.labviewTcpPort;
      const diagnosticNotes = mergeDiagnosticNotes(
        buildProcessObservationNotes(processObservation),
        windowsLabviewTcpSettings.notes,
        linuxLabviewTcpSettings.notes,
        windowsContainerRuntimeFacts.notes,
        diagnostics.notes,
        // Headless bring-up notes describe a failure to initialize LabVIEW headless.
        // Gate them on success exactly like diagnosticReason so a stale or residual
        // headless log can never contaminate a passing run's evidence (issue #270).
        // Only the headless notes are gated here; process-observation, TCP,
        // container-fact, timeout, preparation, and failure-classification notes are
        // always retained.
        succeeded ? [] : (diagnostics.headlessNotes ?? []),
        timeoutDiagnostic.notes,
        finalizedReport.validationNotes,
        failureClassification.notes,
        // VHS-REQ-623: when a Linux container compare fails with an invalid-VI-path
        // signature and the bind-mount source is outside $HOME, name the likely
        // snap-Docker confinement cause instead of leaving the opaque path error.
        succeeded
          ? []
          : [
              buildLinuxContainerBindMountVisibilityNote({
                provider: record.runtimeSelection.provider,
                diagnosticReason: diagnostics.reason,
                failureReason: failureClassification.reason,
                hostBindMountPath: record.artifactPlan.reportDirectory,
                homeDir: os.homedir()
              })
            ].filter((note): note is string => Boolean(note)),
        executionContext.preparationNotes
      );

      return {
        state: succeeded ? 'succeeded' : 'failed',
        attempted: true,
        reportExists,
        failureReason: succeeded ? undefined : failureClassification.reason,
        diagnosticReason: succeeded ? undefined : (diagnostics.reason ?? timeoutDiagnostic.reason),
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
        // Issue #2513: the catch path is a spawn/finalize error, not a LabVIEW
        // execution that wrote a relevant this-run LVStatus (a genuine recursion
        // failure returns a non-zero exit code, not a thrown error), so the
        // persistent-global LVStatus is stale here and is not captured.
        runFailed: false,
        commandArgs: effectiveExecutionContext.commandPlan.args,
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

      // CreateComparisonReport succeeded but copying the generated report into
      // the retained directory failed: keep this distinct from launch failures
      // so troubleshooting points at filesystem permissions, not the CLI.
      const isFinalizeFailure = error instanceof ReportFinalizationError;
      const finalizeErrorCode = isFinalizeFailure ? error.code : undefined;
      const failureNote = isFinalizeFailure
        ? [
            `LabVIEW generated the comparison report, but copying it into the retained report directory failed: ${
              processError.stderr.trim() || 'unknown filesystem error'
            }.`,
            ...((finalizeErrorCode === 'EPERM' || finalizeErrorCode === 'EACCES'
              ? [
                  `The retained report directory still could not be cleared after a permission reset, which usually means it contains files left by a prior containerized LabVIEW run owned by a different user (often root). Remove the stale output and rerun: rm -rf "${record.artifactPlan.reportFilePath}" "${buildReportAssetsDirectoryPath(
                    record.artifactPlan.reportFilePath
                  )}" (prefix with sudo if the files are owned by root).`
                ]
              : []) as string[])
          ]
        : [];

      return {
        state: 'failed',
        attempted: true,
        reportExists: false,
        failureReason: isFinalizeFailure ? 'report-finalize-failed' : 'command-spawn-failed',
        diagnosticReason: diagnostics.reason,
        diagnosticNotes: mergeDiagnosticNotes(
          windowsLabviewTcpSettings.notes,
          linuxLabviewTcpSettings.notes,
          diagnostics.notes,
          // This branch is always a failure (command-spawn or report-finalize), so the
          // headless bring-up notes are retained rather than gated (issue #270).
          diagnostics.headlessNotes ?? [],
          executionContext.preparationNotes,
          failureNote
        ),
        diagnosticLogSourcePath: diagnostics.sourcePath,
        diagnosticLogArtifactPath: diagnostics.artifactPath,
        labviewIniPath:
          windowsLabviewTcpSettings.labviewIniPath ?? linuxLabviewTcpSettings.labviewIniPath,
        labviewTcpPort:
          windowsLabviewTcpSettings.labviewTcpPort ?? linuxLabviewTcpSettings.labviewTcpPort,
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

  // VHS-REQ-699: single-pass comparison-preview pipeline (state machine). When a
  // staged-VI preview validator is wired (always-on in production across
  // providers), run the pass as explicit states so every state's input/output is
  // inspectable: STAGING (idempotent — verify the pair the outer path already
  // materialized), PREVIEW_LEFT / PREVIEW_RIGHT (load-validate each staged VI),
  // VALIDATION (admit only when both rendered), COMPARISON (the single compare
  // attempt), and UNSTAGING (idempotent, always-run, diagnostic status). A
  // validation rejection short-circuits (skips) the fragile CreateComparisonReport
  // and surfaces an actionable `staged-vi-preview-validation-failed` signal. When
  // no validator is wired, the comparison runs directly as before. Either way the
  // comparison itself remains a single attempt (no retry).
  if (deps.renderStagedViPreview) {
    const validator = deps.renderStagedViPreview;
    const stagedPair = {
      leftPath: record.stagedRevisionPlan.leftFilePath,
      rightPath: record.stagedRevisionPlan.rightFilePath
    };
    let comparisonExecution: ComparisonReportRuntimeExecution | undefined;
    const pipeline = await runComparisonPreviewPipeline({
      // STAGING is idempotent: the left/right VIs were already materialized on
      // disk before this seam, so verify their presence and report already-staged
      // (a fresh materialize would be a `staged` outcome). A missing staged input
      // fails closed before any LabVIEW launch.
      stageInputs: async () => {
        const [leftOk, rightOk] = await Promise.all([
          deps.pathExists(stagedPair.leftPath),
          deps.pathExists(stagedPair.rightPath)
        ]);
        if (leftOk && rightOk) {
          return { outcome: 'already-staged', staged: stagedPair };
        }
        return {
          outcome: 'failed',
          failureReason: !leftOk ? 'left-staged-input-missing' : 'right-staged-input-missing'
        };
      },
      renderStagedPreview: (side, staged) =>
        validator({
          side,
          viFilePath: side === 'left' ? staged.leftPath : staged.rightPath,
          record
        }),
      // Host-native LabVIEW is single-instance per bitness: the two preview
      // renders leave a LabVIEW process alive that the COMPARISON cold-launch then
      // contends with for VI Server port 3363 (-350000 labview-cli-connection-
      // failed). Container providers are process-isolated per `docker run`, so no
      // orphan survives and no quiesce is needed — inject the teardown ONLY for a
      // host-native win32 runtime. Best-effort by construction (the pipeline
      // swallows a quiesce throw), so a failed teardown never masks the compare.
      quiesceRuntimeBeforeComparison:
        record.runtimeSelection.provider === 'host-native' && deps.processPlatform === 'win32'
          ? async () => {
              const observation = await deps.observeWindowsProcesses({
                hostPlatform: deps.processPlatform,
                runtimePlatform: 'win32',
                trigger: 'pre-launch-baseline'
              });
              const pids = (observation?.observedProcesses ?? [])
                .filter((proc: RuntimeObservedProcess) => /^LabVIEW\.exe$/i.test(proc.imageName))
                .map((proc: RuntimeObservedProcess) => proc.pid)
                .filter((pid: number): pid is number => Number.isInteger(pid));
              for (const pid of pids) {
                await terminateWindowsProcessTree(pid, deps.processPlatform);
              }
            }
          : undefined,
      runComparison: async () => {
        comparisonExecution = await executeAttempt(1);
        if (deps.diagnosticsRecorder) {
          await deps.diagnosticsRecorder.archiveAttemptArtifacts(record, 1);
        }
        const succeeded =
          comparisonExecution.state === 'succeeded' && comparisonExecution.reportExists;
        return {
          succeeded,
          failureReason: succeeded ? undefined : comparisonExecution.failureReason
        };
      },
      // UNSTAGING (idempotent, diagnostic, and now the cleanup OWNER): remove the
      // staged inputs the pass operated on and enumerate the real artifacts. The
      // reported artifacts are the concrete staged VI FILES (left/right) — the
      // meaningful, stable evidence: once removed they stay gone. The `staging/`
      // directory (which now holds both per-side revision trees) is ALSO removed
      // to clear the materialized dependency trees (VHS-REQ-624 storage bloat),
      // but the directory itself is NOT reported as a removed artifact because
      // report finalization may re-create it empty; reporting a path that
      // reappears would be misleading. The generated report
      // and its metadata are siblings under the report directory and are always
      // retained. The transient per-preview workspaces are removed by the preview
      // renderer itself. (When the validator is wired the outer finally defers its
      // retained-tree prune to this state.)
      unstageInputs: async () => {
        const stagingDir = record.artifactPlan.stagingDirectory;
        // The staged VI files are the reported artifacts; stat each so removedPaths
        // reflects files that actually existed at unstage time.
        const stagedFiles = [stagedPair.leftPath, stagedPair.rightPath].filter(
          (value): value is string => typeof value === 'string' && value.length > 0
        );
        const existingFiles: string[] = [];
        for (const file of stagedFiles) {
          if (await deps.pathExists(file)) {
            existingFiles.push(file);
          }
        }
        const removed: string[] = [];
        const failed: string[] = [];
        for (const file of existingFiles) {
          try {
            await deps.removePath(file, { recursive: true, force: true });
            removed.push(file);
          } catch {
            failed.push(file);
          }
        }
        // Clear the staging directory (materialized dependency tree) for cleanup;
        // best-effort, not reported (it may be re-created empty by finalization).
        if (typeof stagingDir === 'string' && stagingDir.length > 0) {
          try {
            await deps.removePath(stagingDir, { recursive: true, force: true });
          } catch {
            // Non-fatal: file-level removal above is the reported cleanup.
          }
        }
        // Retained artifacts: only report the report/metadata that actually exist
        // on disk. On a FAILED comparison no report is produced, so the report
        // path must not be claimed as retained (Windows verification caught this).
        const retainedCandidates = [
          record.artifactPlan.reportFilePath,
          record.artifactPlan.metadataFilePath
        ].filter((value): value is string => typeof value === 'string' && value.length > 0);
        const retainedPaths: string[] = [];
        for (const candidate of retainedCandidates) {
          if (await deps.pathExists(candidate)) {
            retainedPaths.push(candidate);
          }
        }
        const status =
          existingFiles.length === 0
            ? ('already-clean' as const)
            : failed.length === 0
              ? ('removed' as const)
              : removed.length > 0
                ? ('partial' as const)
                : ('failed' as const);
        return {
          status,
          removedPaths: removed,
          retainedPaths,
          failureReason: failed.length > 0 ? `unstage-remove-failed: ${failed.join(', ')}` : undefined
        };
      }
    });
    const pipelineCycles = toPipelineCycleRecords(pipeline);
    if (comparisonExecution) {
      // The comparison cycle ran (both previews validated); attach per-state
      // pipeline evidence to the verbatim single-attempt result.
      comparisonExecution.pipelineCycles = pipelineCycles;
      return comparisonExecution;
    }
    // VALIDATION rejected the comparison: a staged VI failed to render a preview
    // (or a staged input was missing), so the comparison was never invoked.
    // Surface the actionable failure carrying the per-state evidence.
    const rejectedSide = pipeline.validation.rejectedSide;
    const rejectionReason = pipeline.failureReason ?? STAGED_VI_PREVIEW_VALIDATION_FAILED;
    const failedReason =
      rejectedSide === 'left'
        ? pipeline.previewLeft.failureReason
        : rejectedSide === 'right'
          ? pipeline.previewRight.failureReason
          : pipeline.staging.failureReason;
    const diagnosticNote = rejectedSide
      ? `Staged ${rejectedSide} VI failed its preview-load validation before the comparison cycle (${failedReason ?? 'preview-render-failed'}); the CreateComparisonReport cycle was skipped.`
      : `Staged comparison inputs were not available before the comparison cycle (${failedReason ?? rejectionReason}); the CreateComparisonReport cycle was skipped.`;
    return {
      state: 'failed',
      attempted: false,
      reportExists: false,
      failureReason: rejectionReason,
      diagnosticNotes: [diagnosticNote],
      executable: commandPlan.executable,
      args: commandPlan.args,
      stdoutFilePath: record.artifactPlan.runtimeStdoutFilePath,
      stderrFilePath: record.artifactPlan.runtimeStderrFilePath,
      pipelineCycles
    };
  }

  const initialResult = await executeAttempt(1);
  if (deps.diagnosticsRecorder) {
    await deps.diagnosticsRecorder.archiveAttemptArtifacts(record, 1);
  }

  // Single-cycle timed loop: the comparison runs exactly one attempt and returns
  // its result verbatim — there is NO recovery retry (Linux/Windows headless
  // session reset, Windows cold-launch). A failure (headless init failure, cold
  // launch -350000, permission error, timeout) is surfaced as a genuine result so
  // an upstream problem is caught deterministically rather than masked by a
  // second attempt that changes timing and outcome run-to-run.
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
  // Notes derived from the Linux headless status logs (LVStatus.txt / lvrt headless
  // logs). Kept separate from `notes` so the caller can gate them on run success
  // exactly like the headless diagnosticReason — a successful run must never surface
  // a headless bring-up failure note (see issue #270).
  headlessNotes?: string[];
  sourcePath?: string;
  artifactPath?: string;
  headlessArtifactPaths?: string[];
}

// Linux containers run LabVIEW as root, so anything written into the bind-mounted
// workspace lands on the host owned by root. Confine that root-owned output to a
// dedicated subdirectory of the retained report directory so the host-native
// provider's canonical report path only ever contains user-owned files and never
// collides with a prior container run's root-owned artifacts.
const LINUX_CONTAINER_OUTPUT_DIRNAME = 'container-out';
const DEFAULT_WINDOWS_LABVIEW_TCP_PORT = 3363;

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
      viServerTcpEnabled: 'unknown',
      notes: [
        `Selected LabVIEW.ini was not readable at ${labviewIniPath}, so VI Server port derivation remained implicit.`
      ]
    };
  }

  // VHS-REQ-623: LabVIEW.ini commonly stores VI Server values in quoted form
  // (e.g. server.tcp.enabled="FALSE", server.tcp.port="3363"). Accept optional
  // surrounding double quotes so the preflight does not silently fall through
  // to the default-on branch when LabVIEW writes quoted values.
  const enabledMatch = iniText.match(
    /^\s*server\.tcp\.enabled\s*=\s*"?(true|false)"?\s*$/im
  );
  const portMatch = iniText.match(/^\s*server\.tcp\.port\s*=\s*"?(\d+)"?\s*$/im);
  const tcpEnabled = enabledMatch ? enabledMatch[1].toLowerCase() === 'true' : true;
  if (!tcpEnabled) {
    return {
      labviewIniPath,
      viServerTcpEnabled: false,
      notes: [
        `Selected LabVIEW.ini at ${labviewIniPath} sets server.tcp.enabled=False, which prevents LabVIEWCLI from connecting to LabVIEW. Enable VI Server in Tools \u2192 Options \u2192 VI Server.`
      ]
    };
  }

  const labviewTcpPort = portMatch
    ? Number.parseInt(portMatch[1], 10)
    : DEFAULT_WINDOWS_LABVIEW_TCP_PORT;

  return {
    labviewIniPath,
    labviewTcpPort,
    viServerTcpEnabled: true,
    notes: [
      `Derived VI Server TCP port ${String(labviewTcpPort)} from ${labviewIniPath} and passed it explicitly to LabVIEW CLI.`
    ]
  };
}

export async function resolveLinuxLabviewTcpSettings(
  record: ComparisonReportPacketRecord,
  deps: {
    readFile: typeof fs.readFile;
    processPlatform?: NodeJS.Platform;
    homeDir?: () => string;
  }
): Promise<LinuxLabviewTcpSettings> {
  if (
    record.runtimeSelection.platform !== 'linux' ||
    record.runtimeSelection.engine !== 'labview-cli' ||
    record.runtimeSelection.provider !== 'host-native'
  ) {
    return { viServerTcpEnabled: 'unknown', inspectedCandidatePaths: [], notes: [] };
  }

  const homeDir = (deps.homeDir ?? os.homedir)();
  const requestedLabviewVersion =
    record.runtimeSelection.requestedLabviewVersion ??
    inferLinuxLabviewVersionFromExecutablePath(record.runtimeSelection.labviewExe?.path);
  const candidates = buildLinuxLabviewIniCandidatePaths({
    homeDir,
    requestedLabviewVersion,
    bitness: record.runtimeSelection.bitness
  });

  for (const candidate of candidates) {
    let iniText: string;
    try {
      iniText = await deps.readFile(candidate, 'utf8');
    } catch {
      continue;
    }

    const enabledMatch = iniText.match(/^\s*server\.tcp\.enabled\s*=\s*(true|false)\s*$/im);
    const portMatch = iniText.match(/^\s*server\.tcp\.port\s*=\s*(\d+)\s*$/im);

    if (!enabledMatch) {
      // Linux LabVIEW ships with VI Server TCP off; absence of the key means disabled.
      return {
        labviewIniPath: candidate,
        viServerTcpEnabled: false,
        inspectedCandidatePaths: candidates,
        notes: [
          `Linux LabVIEW config at ${candidate} does not enable VI Server TCP/IP (server.tcp.enabled is missing). LabVIEWCLI cannot connect to LabVIEW until VI Server is enabled in Tools \u2192 Options \u2192 VI Server.`
        ]
      };
    }

    const tcpEnabled = enabledMatch[1].toLowerCase() === 'true';
    if (!tcpEnabled) {
      return {
        labviewIniPath: candidate,
        viServerTcpEnabled: false,
        inspectedCandidatePaths: candidates,
        notes: [
          `Linux LabVIEW config at ${candidate} sets server.tcp.enabled=False, which prevents LabVIEWCLI from connecting to LabVIEW. Enable VI Server in Tools \u2192 Options \u2192 VI Server.`
        ]
      };
    }

    if (!portMatch) {
      // VHS-REQ-156/VHS-REQ-706: VI Server TCP is enabled but no explicit
      // server.tcp.port is declared. The Linux host-native comparison does not
      // pass -PortNumber (LabVIEWCLI auto-connects to the running VI Server), so
      // a declared port is not required; execution proceeds.
      return {
        labviewIniPath: candidate,
        viServerTcpEnabled: true,
        inspectedCandidatePaths: candidates,
        notes: [
          `Linux LabVIEW config at ${candidate} enables VI Server TCP (server.tcp.enabled=True) but does not declare server.tcp.port. On Linux host-native the runtime does not pass -PortNumber (LabVIEWCLI auto-connects to the running VI Server), so a declared port is not required; execution proceeds.`
        ]
      };
    }

    const labviewTcpPort = Number.parseInt(portMatch[1], 10);

    return {
      labviewIniPath: candidate,
      labviewTcpPort,
      viServerTcpEnabled: true,
      inspectedCandidatePaths: candidates,
      notes: [
        `Derived VI Server TCP port ${String(labviewTcpPort)} from ${candidate}. On Linux host-native, -PortNumber is intentionally omitted so LabVIEWCLI auto-connects to the running VI Server; passing -PortNumber triggers a GSW recursive load (VHS-REQ-706).`
      ]
    };
  }

  return {
    viServerTcpEnabled: 'unknown',
    inspectedCandidatePaths: candidates,
    notes: [
      `No readable Linux LabVIEW config was found in any of: ${candidates.join(', ')}. VI Server TCP/IP status could not be verified before launch.`
    ]
  };
}

function preflightLinuxHostRuntimeSurface(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan,
  linuxLabviewTcpSettings: LinuxLabviewTcpSettings
): { blockedExecution: ComparisonReportRuntimeExecution } | undefined {
  if (
    record.runtimeSelection.platform !== 'linux' ||
    record.runtimeSelection.provider !== 'host-native' ||
    record.runtimeSelection.engine !== 'labview-cli'
  ) {
    return undefined;
  }

  if (linuxLabviewTcpSettings.viServerTcpEnabled === true) {
    // VHS-REQ-156/VHS-REQ-706: VI Server TCP is enabled. The Linux host-native
    // comparison does not pass -PortNumber to LabVIEWCLI (that triggers a GSW
    // recursive load, exit 157), so LabVIEWCLI auto-connects to the running VI
    // Server and a declared server.tcp.port is not required to proceed. The
    // prior linux-vi-server-tcp-port-unknown fail-closed block is retired
    // because the runtime no longer supplies a port at all.
    return undefined;
  }

  return {
    blockedExecution: {
      state: 'not-available',
      attempted: false,
      reportExists: false,
      blockedReason: 'linux-vi-server-tcp-disabled',
      diagnosticReason: 'linux-vi-server-tcp-disabled',
      diagnosticNotes: linuxLabviewTcpSettings.notes,
      labviewIniPath: linuxLabviewTcpSettings.labviewIniPath,
      labviewTcpPort: linuxLabviewTcpSettings.labviewTcpPort,
      executable: commandPlan.executable,
      args: commandPlan.args,
      stdoutFilePath: record.artifactPlan.runtimeStdoutFilePath,
      stderrFilePath: record.artifactPlan.runtimeStderrFilePath
    }
  };
}

/**
 * VHS-REQ-623: Block Windows host-native LabVIEWCLI runs when the selected
 * `LabVIEW.ini` explicitly disables VI Server TCP. Mirrors
 * `preflightLinuxHostRuntimeSurface` but only fires on the explicit-`False`
 * signal because Windows LabVIEW defaults VI Server TCP on (absent key or
 * unreadable ini preserves prior implicit-enabled behavior).
 */
function preflightWindowsHostViServerTcpDisabled(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan,
  windowsLabviewTcpSettings: WindowsLabviewTcpSettings
): { blockedExecution: ComparisonReportRuntimeExecution } | undefined {
  if (
    record.runtimeSelection.platform !== 'win32' ||
    record.runtimeSelection.provider !== 'host-native' ||
    record.runtimeSelection.engine !== 'labview-cli' ||
    windowsLabviewTcpSettings.viServerTcpEnabled !== false
  ) {
    return undefined;
  }

  return {
    blockedExecution: {
      state: 'not-available',
      attempted: false,
      reportExists: false,
      blockedReason: 'windows-vi-server-tcp-disabled',
      diagnosticReason: 'windows-vi-server-tcp-disabled',
      diagnosticNotes: windowsLabviewTcpSettings.notes,
      labviewIniPath: windowsLabviewTcpSettings.labviewIniPath,
      labviewTcpPort: windowsLabviewTcpSettings.labviewTcpPort,
      executable: commandPlan.executable,
      args: commandPlan.args,
      stdoutFilePath: record.artifactPlan.runtimeStdoutFilePath,
      stderrFilePath: record.artifactPlan.runtimeStderrFilePath
    }
  };
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
    record.runtimeSelection.provider !== 'host-native' ||
    record.runtimeSelection.allowExistingWindowsHostRuntime === true
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
          `Windows host preflight observed an existing TCP listener on the configured VI Server port before launch: ${describeObservedWindowsTcpListeners(
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

async function captureRuntimeDiagnostics(
  record: ComparisonReportPacketRecord,
  stdout: string,
  deps: {
    stderr: string;
    commandArgs?: string[];
    pathExists: (filePath: string) => Promise<boolean>;
    copyFile: typeof fs.copyFile;
    unlinkFile: typeof fs.unlink;
    readFile: typeof fs.readFile;
    readdir?: typeof fs.readdir;
    mkdir: typeof fs.mkdir;
    removePath?: typeof fs.rm;
    processPlatform: NodeJS.Platform;
    runFailed: boolean;
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

  const headlessDiagnostics = shouldCaptureLinuxHeadlessDiagnostics(record, deps.commandArgs)
    ? await captureLinuxHeadlessDiagnostics(record, {
        pathExists: deps.pathExists,
        copyFile: deps.copyFile,
        readFile: deps.readFile,
        readdir: deps.readdir ?? fs.readdir,
        mkdir: deps.mkdir,
        removePath: deps.removePath ?? fs.rm,
        processPlatform: deps.processPlatform,
        runFailed: deps.runFailed,
        diagnosticPathMapping: deps.diagnosticPathMapping
      })
    : {
        notes: [],
        artifactPaths: []
      };
  const stderrClassification = classifyLabviewCliDiagnosticText(deps.stderr, deps.expectedLabviewPath);

  const diagnosticLogSourcePath = parseLabviewCliDiagnosticLogPath(stdout);
  if (!diagnosticLogSourcePath) {
    await clearStaleArtifactIfPresent();
    return {
      reason: selectDiagnosticReason(headlessDiagnostics.reason, stderrClassification.reason),
      notes: mergeDiagnosticNotes(stderrClassification.notes),
      headlessNotes: headlessDiagnostics.notes,
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
        ['LabVIEW CLI reported a diagnostic log path, but the log file was not readable from the active host.']
      ),
      headlessNotes: headlessDiagnostics.notes,
      sourcePath: diagnosticLogSourcePath,
      reason:
        selectDiagnosticReason(headlessDiagnostics.reason, stderrClassification.reason) ??
        'runtime-diagnostic-log-unreadable',
      headlessArtifactPaths: headlessDiagnostics.artifactPaths
    };
  }

  await deps.mkdir(path.dirname(record.artifactPlan.runtimeDiagnosticLogFilePath), { recursive: true });
  await deps.copyFile(hostReadablePath, record.artifactPlan.runtimeDiagnosticLogFilePath);
  const diagnosticText = await deps.readFile(hostReadablePath, 'utf8');
  const classification = classifyLabviewCliDiagnosticText(diagnosticText, deps.expectedLabviewPath);

  return {
    reason: selectDiagnosticReason(
      headlessDiagnostics.reason,
      stderrClassification.reason,
      classification.reason
    ),
    notes: mergeDiagnosticNotes(stderrClassification.notes, classification.notes),
    headlessNotes: headlessDiagnostics.notes,
    sourcePath: diagnosticLogSourcePath,
    artifactPath: record.artifactPlan.runtimeDiagnosticLogFilePath,
    headlessArtifactPaths: headlessDiagnostics.artifactPaths
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
    runFailed: boolean;
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

  // A genuine host-native Linux run leaves its LabVIEW headless logs in the host
  // /tmp. A linux-container run, even on a Linux host, writes them under the mapped
  // container-temp (diagnosticPathMapping.hostRoot) exactly like the windows-container
  // provider. Reading host /tmp for a container run would let a PRIOR host-native
  // run's stale /tmp/lvrt_*_headless_*_cur.txt bleed into the container run's
  // diagnostics, so only the host-native provider may read /tmp (see issue #270).
  const readsHostGlobalTmp =
    deps.processPlatform === 'linux' && record.runtimeSelection.provider !== 'linux-container';
  const sourceRoot = readsHostGlobalTmp
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
        // Issue #2513: on host-native Linux, LVStatus.txt is read from the shared
        // /tmp and is a persistent GLOBAL LabVIEW status file (not per-run) --
        // LabVIEW leaves the previous run's content in it, so on a SUCCESSFUL run
        // copying it would carry a STALE "Recursive load" line into this run's
        // diagnostics. On that path only capture it when this run's LabVIEW
        // execution failed (its content is then relevant). A linux-container run
        // reads its own ephemeral container-temp, whose LVStatus.txt is written
        // fresh each run, so it is always captured. The per-run lvrt/labview
        // *_cur.txt logs are freshly written each run and are always captured.
        (name === 'LVStatus.txt' && (deps.runFailed || !readsHostGlobalTmp)) ||
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

    if (/Failed to initialize headless LabVIEW\./i.test(diagnosticText)) {
      reason = 'linux-headless-init-failed';
      notes.push(
        'Retained Linux headless log reported "Failed to initialize headless LabVIEW." Headless mode is unusable on this LabVIEW build; switch to the Linux container provider, whose bundled LabVIEW image initializes headless mode correctly.'
      );
    } else if (/Recursive load during LEIF load!/i.test(diagnosticText)) {
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
  /**
   * VHS-REQ-156: directories to remove after execution completes (success or failure).
   * Used by the Linux host-native short-path staging workaround for the LabVIEW 2026
   * Linux path-table corruption that occurs when staged VIs/reports live under deep,
   * dot-prefixed workspaceStorage paths.
   */
  cleanupPaths?: string[];
  /** VHS-REQ-156: human-readable note describing why a path rewrite was applied. */
  preparationNotes?: string[];
  /**
   * VHS-REQ-624: manifest of the materialized selected-revision tree, when a
   * provider (currently the linux-container path) staged one during preparation.
   */
  materializedTree?: ComparisonReportRuntimeExecution['materializedTree'];
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
    cliConnectTimeoutSeconds?: number;
    repositoryRoot?: string;
    materializeSelectedRevisionTree?: MaterializeSelectedRevisionTree;
  }
): Promise<PreparedExecutionContext> {
  if (record.runtimeSelection.provider === 'windows-container') {
    return prepareWindowsContainerExecutionContext(record, commandPlan, interopWorkspaceRoot, deps);
  }

  if (record.runtimeSelection.provider === 'linux-container') {
    return prepareLinuxContainerExecutionContext(record, commandPlan, interopWorkspaceRoot, deps);
  }

  if (shouldUseLinuxHostNativeShortPathStaging(record, deps.processPlatform)) {
    return prepareLinuxHostNativeShortPathExecutionContext(record, commandPlan, deps);
  }

  if (!requiresWindowsInterop(resolveEffectiveRuntimePlatform(record.runtimeSelection), deps.processPlatform)) {
    // VHS-REQ-665: opt-in win32 host-native headless launch. When running natively
    // on Windows against host-native LabVIEW, the default bare CLI plan assumes an
    // already-running interactive-desktop LabVIEW; a non-interactive session (e.g.
    // Vagrant WinRM session 0) then fails with the -350000 VI Server connect error.
    // The opt-in wraps the CLI in the shared headless prelaunch script.
    const headlessCommandPlan =
      shouldWrapWindowsHostNativeHeadless(
        deps.processPlatform,
        resolveEffectiveRuntimePlatform(record.runtimeSelection),
        process.env.LV_RTE_WIN_HOSTNATIVE_HEADLESS
      )
        ? buildWindowsHostNativeHeadlessCommandPlan(
            record,
            commandPlan,
            deps.processPlatform,
            deps.cliConnectTimeoutSeconds
          )
        : undefined;

    return {
      outcome: 'ready',
      commandPlan: headlessCommandPlan ?? commandPlan,
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
    chmod: typeof fs.chmod;
    readdir: typeof fs.readdir;
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
        removePath: deps.removePath,
        chmod: deps.chmod,
        readdir: deps.readdir
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
    removePath: deps.removePath,
    chmod: deps.chmod,
    readdir: deps.readdir,
    mkdir: deps.mkdir
  });
  return {
    reportExists: true,
    validationNotes: []
  };
}

async function cleanupPreparedExecutionContext(
  executionContext: PreparedExecutionContext,
  removePath: typeof fs.rm
): Promise<void> {
  const cleanupPaths = executionContext.cleanupPaths;
  if (!cleanupPaths || cleanupPaths.length === 0) {
    return;
  }
  for (const targetPath of cleanupPaths) {
    try {
      await removePath(targetPath, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup; tmp dirs reclaimed on reboot if removal fails.
    }
  }
}

async function clearStaleExecutedReportArtifacts(
  record: ComparisonReportPacketRecord,
  executionContext: PreparedExecutionContext,
  deps: {
    removePath: typeof fs.rm;
    chmod: typeof fs.chmod;
    readdir: typeof fs.readdir;
  }
): Promise<void> {
  const reportPaths = new Set([
    executionContext.reportFilePath,
    record.artifactPlan.reportFilePath
  ]);

  for (const reportFilePath of reportPaths) {
    for (const targetPath of [reportFilePath, buildReportAssetsDirectoryPath(reportFilePath)]) {
      try {
        await forceRemovePathResilient(targetPath, {
          removePath: deps.removePath,
          chmod: deps.chmod,
          readdir: deps.readdir
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

export interface WindowsInteropLayout {
  reportDirectory: string;
  stagingDirectory: string;
  leftFilePath: string;
  rightFilePath: string;
  reportFilePath: string;
}

interface LinuxContainerWorkspaceLayout {
  reportDirectory: string;
  stagingDirectory: string;
  relativeDirectory: string;
  leftFilename: string;
  rightFilename: string;
  reportFilename: string;
  leftFilePath: string;
  rightFilePath: string;
  reportFilePath: string;
  reportIdentityFilenames: string[];
  reportTextReplacements: RuntimeTextReplacement[];
}

async function prepareLinuxHostNativeShortPathExecutionContext(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan,
  deps: {
    mkdir: typeof fs.mkdir;
    writeFile: typeof fs.writeFile;
    leftBlob: Buffer;
    rightBlob: Buffer;
    repositoryRoot?: string;
    materializeSelectedRevisionTree?: MaterializeSelectedRevisionTree;
  }
): Promise<PreparedExecutionContext> {
  const layout = buildLinuxHostNativeShortPathLayout(record);
  await deps.mkdir(layout.reportDirectory, { recursive: true });

  // VHS-REQ-624: materialize the selected-revision tree into the short-path
  // staging directory so Linux host-native comparisons resolve in-repo
  // dependencies at load time. The short tmp directory is removed via
  // cleanupPaths after the run, so the retained report directory keeps only the
  // two staged VIs (written separately as evidence) and the generated report.
  const staged = await stageSelectedRevisionTreeIntoDirectory(record, layout.stagingDirectory, deps);
  if (staged.outcome === 'blocked') {
    return {
      outcome: 'blocked',
      commandPlan,
      reportFilePath: record.artifactPlan.reportFilePath,
      failureReason: staged.failureReason,
      cleanupPaths: [layout.reportDirectory]
    };
  }

  const stagedLayout: WindowsInteropLayout = {
    ...layout,
    leftFilePath: staged.leftFilePath,
    rightFilePath: staged.rightFilePath
  };
  const rewritten = buildLinuxHostNativeShortPathCommandPlan(record, commandPlan, stagedLayout);
  if (!rewritten) {
    return {
      outcome: 'ready',
      commandPlan,
      reportFilePath: record.artifactPlan.reportFilePath,
      cleanupPaths: [layout.reportDirectory],
      materializedTree: staged.materializedTree
    };
  }

  return {
    outcome: 'ready',
    commandPlan: rewritten,
    reportFilePath: layout.reportFilePath,
    cleanupPaths: [layout.reportDirectory],
    materializedTree: staged.materializedTree,
    preparationNotes: [
      `Staged Linux host-native runtime inputs under ${layout.reportDirectory} to avoid LabVIEW 2026 Linux path-table corruption observed for deep workspaceStorage paths (set LVIE_LINUX_DISABLE_RUNTIME_TMPDIR=1 to opt out).`,
      'The host-native LabVIEW launched for this comparison stays running after it completes so later comparisons can reuse the warm session; quit LabVIEW from its window when you no longer need it.'
    ]
  };
}

function buildLinuxContainerWorkspaceLayout(
  record: ComparisonReportPacketRecord,
  hostLayout: WindowsInteropLayout,
  relativeDirectory = ''
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
    relativeDirectory,
    leftFilename,
    rightFilename,
    reportFilename,
    leftFilePath: joinPreservingExplicitPathStyle(
      hostLayout.stagingDirectory,
      LEFT_TREE_SUBDIRECTORY,
      relativeDirectory,
      leftFilename
    ),
    rightFilePath: joinPreservingExplicitPathStyle(
      hostLayout.stagingDirectory,
      RIGHT_TREE_SUBDIRECTORY,
      relativeDirectory,
      rightFilename
    ),
    reportFilePath: joinPreservingExplicitPathStyle(hostLayout.reportDirectory, reportFilename),
    reportIdentityFilenames: [leftFilename, rightFilename],
    reportTextReplacements: replacements
  };
}

interface StagedTreeResult {
  outcome: 'ready' | 'blocked';
  failureReason?: string;
  relativeDirectory: string;
  leftFilePath: string;
  rightFilePath: string;
  materializedTree?: ComparisonReportRuntimeExecution['materializedTree'];
}

/**
 * VHS-REQ-624: stage both compared VI blobs into `stagingDirectory`, materializing
 * EACH revision's surrounding tree separately (the base revision into a `left`
 * subtree and the selected revision into a `right` subtree) when a materializer +
 * repository root are supplied, so every VI's in-repo dependencies sit beside it
 * as they existed at that VI's own revision. Shared by the host-interop and
 * Linux-host container branches and the Windows container path so every external
 * provider gets per-revision dependency fidelity. Fails closed when either tree
 * cannot be materialized.
 */
async function stageSelectedRevisionTreeIntoDirectory(
  record: ComparisonReportPacketRecord,
  stagingDirectory: string,
  deps: {
    mkdir: typeof fs.mkdir;
    writeFile: typeof fs.writeFile;
    leftBlob: Buffer;
    rightBlob: Buffer;
    repositoryRoot?: string;
    materializeSelectedRevisionTree?: MaterializeSelectedRevisionTree;
  }
): Promise<StagedTreeResult> {
  await deps.mkdir(stagingDirectory, { recursive: true });

  const leftTreeRoot = joinPreservingExplicitPathStyle(stagingDirectory, LEFT_TREE_SUBDIRECTORY);
  const rightTreeRoot = joinPreservingExplicitPathStyle(stagingDirectory, RIGHT_TREE_SUBDIRECTORY);

  let relativeDirectory = '';
  let materializedTree: ComparisonReportRuntimeExecution['materializedTree'];
  if (
    deps.materializeSelectedRevisionTree &&
    deps.repositoryRoot &&
    record.stagedRevisionPlan.leftTreeRevisionId &&
    record.stagedRevisionPlan.rightTreeRevisionId
  ) {
    relativeDirectory = record.stagedRevisionPlan.relativeDirectory ?? '';
    const pathspec = record.stagedRevisionPlan.materializedPathspec?.trim() || '.';
    try {
      // `git checkout-index --work-tree <root>` only creates the subdirectories
      // beneath an existing work-tree root, so both per-revision tree roots must
      // exist before materializing into them; otherwise git fails closed with
      // "this operation must be run in a work tree".
      await deps.mkdir(leftTreeRoot, { recursive: true });
      await deps.mkdir(rightTreeRoot, { recursive: true });
      await deps.materializeSelectedRevisionTree({
        repositoryRoot: deps.repositoryRoot,
        revisionId: record.stagedRevisionPlan.leftTreeRevisionId,
        destinationRoot: leftTreeRoot,
        pathspec
      });
      await deps.materializeSelectedRevisionTree({
        repositoryRoot: deps.repositoryRoot,
        revisionId: record.stagedRevisionPlan.rightTreeRevisionId,
        destinationRoot: rightTreeRoot,
        pathspec
      });
      materializedTree = {
        left: {
          root: leftTreeRoot,
          revisionId: record.stagedRevisionPlan.leftTreeRevisionId,
          pathspec
        },
        right: {
          root: rightTreeRoot,
          revisionId: record.stagedRevisionPlan.rightTreeRevisionId,
          pathspec
        }
      };
    } catch {
      return {
        outcome: 'blocked',
        failureReason: 'selected-tree-materialize-failed',
        relativeDirectory: '',
        leftFilePath: joinPreservingExplicitPathStyle(
          leftTreeRoot,
          record.stagedRevisionPlan.leftFilename
        ),
        rightFilePath: joinPreservingExplicitPathStyle(
          rightTreeRoot,
          record.stagedRevisionPlan.rightFilename
        )
      };
    }
  }

  const leftFilePath = joinPreservingExplicitPathStyle(
    leftTreeRoot,
    relativeDirectory,
    record.stagedRevisionPlan.leftFilename
  );
  const rightFilePath = joinPreservingExplicitPathStyle(
    rightTreeRoot,
    relativeDirectory,
    record.stagedRevisionPlan.rightFilename
  );
  await deps.mkdir(posixDirname(leftFilePath), { recursive: true });
  await deps.mkdir(posixDirname(rightFilePath), { recursive: true });
  await deps.writeFile(leftFilePath, deps.leftBlob);
  await deps.writeFile(rightFilePath, deps.rightBlob);

  return {
    outcome: 'ready',
    relativeDirectory,
    leftFilePath,
    rightFilePath,
    materializedTree
  };
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
    cliConnectTimeoutSeconds?: number;
    repositoryRoot?: string;
    materializeSelectedRevisionTree?: MaterializeSelectedRevisionTree;
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

  // VHS-REQ-624: stage the selected-revision dependency tree for the Windows
  // container too, so in-repo dependencies resolve at load time. Empty relative
  // directory when the VI sits at the repository root.
  let containerRelativeDirectory = '';
  let materializedTree: ComparisonReportRuntimeExecution['materializedTree'];

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

    const interopLayout = buildWindowsInteropLayout(record, interopWorkspaceRoot);
    await deps.mkdir(interopLayout.reportDirectory, { recursive: true });
    const staged = await stageSelectedRevisionTreeIntoDirectory(
      record,
      interopLayout.stagingDirectory,
      deps
    );
    if (staged.outcome === 'blocked') {
      return {
        outcome: 'blocked',
        commandPlan,
        reportFilePath: record.artifactPlan.reportFilePath,
        failureReason: staged.failureReason
      };
    }
    containerRelativeDirectory = staged.relativeDirectory;
    materializedTree = staged.materializedTree;
    hostLayout = {
      ...interopLayout,
      leftFilePath: staged.leftFilePath,
      rightFilePath: staged.rightFilePath
    };
  } else {
    const staged = await stageSelectedRevisionTreeIntoDirectory(
      record,
      record.artifactPlan.stagingDirectory,
      deps
    );
    if (staged.outcome === 'blocked') {
      return {
        outcome: 'blocked',
        commandPlan,
        reportFilePath: record.artifactPlan.reportFilePath,
        failureReason: staged.failureReason
      };
    }
    containerRelativeDirectory = staged.relativeDirectory;
    materializedTree = staged.materializedTree;
    hostLayout = {
      reportDirectory: record.artifactPlan.reportDirectory,
      stagingDirectory: record.artifactPlan.stagingDirectory,
      leftFilePath: staged.leftFilePath,
      rightFilePath: staged.rightFilePath,
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

  const hostTempDirectory = joinPreservingExplicitPathStyle(
    hostLayout.reportDirectory,
    'container-temp'
  );
  const hostTempDirectoryWindows = path.win32.join(hostReportDirectory, 'container-temp');
  await deps.mkdir(hostTempDirectory, { recursive: true });

  const containerCommandPlan = buildWindowsContainerCommandPlan(record, commandPlan, {
    hostReportDirectory,
    hostTempDirectory: hostTempDirectoryWindows,
    containerWorkspaceRoot: WINDOWS_CONTAINER_WORKSPACE_ROOT,
    containerImage,
    processPlatform: deps.processPlatform,
    cliConnectTimeoutSeconds: deps.cliConnectTimeoutSeconds,
    relativeDirectory: containerRelativeDirectory
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
    },
    materializedTree
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
    cliConnectTimeoutSeconds?: number;
    repositoryRoot?: string;
    materializeSelectedRevisionTree?: MaterializeSelectedRevisionTree;
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

  // VHS-REQ-624: directory of the compared VI within the materialized tree. The
  // selected-revision tree is staged into the container staging directory (which
  // becomes the repo root inside the container at /workspace/staging) so the VIs
  // resolve in-repo dependencies at load time. Empty when the VI sits at the
  // repository root (e.g. the dependency test harness).
  let containerRelativeDirectory = '';
  let materializedTree: ComparisonReportRuntimeExecution['materializedTree'];

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

    // Linux container on a Windows/macOS host (Docker Desktop): stage into the
    // interop workspace so the bind mount carries the materialized dependency tree.
    const interopLayout = buildWindowsInteropLayout(record, interopWorkspaceRoot);
    await deps.mkdir(interopLayout.reportDirectory, { recursive: true });
    const staged = await stageSelectedRevisionTreeIntoDirectory(
      record,
      interopLayout.stagingDirectory,
      deps
    );
    if (staged.outcome === 'blocked') {
      return {
        outcome: 'blocked',
        commandPlan,
        reportFilePath: record.artifactPlan.reportFilePath,
        failureReason: staged.failureReason
      };
    }
    containerRelativeDirectory = staged.relativeDirectory;
    materializedTree = staged.materializedTree;
    hostLayout = {
      ...interopLayout,
      leftFilePath: staged.leftFilePath,
      rightFilePath: staged.rightFilePath
    };
  } else {
    // Linux container on a Linux host: isolate the root-owned container output in
    // a dedicated subdirectory so the retained, host-native report path is never
    // polluted with root-owned artifacts from a prior container run. The finished
    // report is copied back into the canonical report path by the host (this)
    // process during finalize, so the retained path stays user-owned.
    const containerOutputDirectory = joinPreservingExplicitPathStyle(
      record.artifactPlan.reportDirectory,
      LINUX_CONTAINER_OUTPUT_DIRNAME
    );
    const containerStagingDirectory = joinPreservingExplicitPathStyle(
      containerOutputDirectory,
      'staging'
    );

    // VHS-REQ-624: materialize the selected (newest) revision's tree into the
    // container staging directory so dependencies sit beside the staged VIs.
    const staged = await stageSelectedRevisionTreeIntoDirectory(
      record,
      containerStagingDirectory,
      deps
    );
    if (staged.outcome === 'blocked') {
      return {
        outcome: 'blocked',
        commandPlan,
        reportFilePath: record.artifactPlan.reportFilePath,
        failureReason: staged.failureReason
      };
    }
    containerRelativeDirectory = staged.relativeDirectory;
    materializedTree = staged.materializedTree;
    hostLayout = {
      reportDirectory: containerOutputDirectory,
      stagingDirectory: containerStagingDirectory,
      leftFilePath: staged.leftFilePath,
      rightFilePath: staged.rightFilePath,
      reportFilePath: joinPreservingExplicitPathStyle(
        containerOutputDirectory,
        record.artifactPlan.reportFilename
      )
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

  const hostTempDirectory = joinPreservingExplicitPathStyle(
    hostLayout.reportDirectory,
    'container-temp'
  );
  await deps.mkdir(hostTempDirectory, { recursive: true });
  const workspaceLayout = buildLinuxContainerWorkspaceLayout(record, hostLayout, containerRelativeDirectory);
  if (workspaceLayout.leftFilePath !== hostLayout.leftFilePath) {
    await deps.mkdir(posixDirname(workspaceLayout.leftFilePath), { recursive: true });
    await deps.writeFile(workspaceLayout.leftFilePath, deps.leftBlob);
  }
  if (workspaceLayout.rightFilePath !== hostLayout.rightFilePath) {
    await deps.mkdir(posixDirname(workspaceLayout.rightFilePath), { recursive: true });
    await deps.writeFile(workspaceLayout.rightFilePath, deps.rightBlob);
  }

  const containerCommandPlan = buildLinuxContainerCommandPlan(record, commandPlan, {
    hostReportDirectory,
    hostTempDirectory,
    containerWorkspaceRoot: LINUX_CONTAINER_WORKSPACE_ROOT,
    containerImage,
    processPlatform: deps.processPlatform,
    relativeDirectory: workspaceLayout.relativeDirectory,
    leftFilename: workspaceLayout.leftFilename,
    rightFilename: workspaceLayout.rightFilename,
    reportFilename: workspaceLayout.reportFilename,
    cliConnectTimeoutSeconds: deps.cliConnectTimeoutSeconds
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
    reportTextReplacements: workspaceLayout.reportTextReplacements,
    materializedTree
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
    cliConnectTimeoutSeconds?: number;
    relativeDirectory?: string;
  }
): ComparisonCommandPlan | undefined {
  if (!record.runtimeSelection.engine) {
    return undefined;
  }

  // VHS-REQ-624: each revision's tree is materialized into its own `left`/`right`
  // subtree of the staging mount, and each staged VI sits at its repo-relative
  // depth inside its OWN revision subtree. Prefix the VI filenames with the side
  // subtree + that depth (Windows-style backslash separators inside the container).
  const relativeDirectory = (options.relativeDirectory ?? '')
    .replace(/^[\\/]+|[\\/]+$/g, '')
    .replace(/\//g, '\\');
  const leftContainerDirectory = relativeDirectory
    ? `${LEFT_TREE_SUBDIRECTORY}\\${relativeDirectory}`
    : LEFT_TREE_SUBDIRECTORY;
  const rightContainerDirectory = relativeDirectory
    ? `${RIGHT_TREE_SUBDIRECTORY}\\${relativeDirectory}`
    : RIGHT_TREE_SUBDIRECTORY;
  const containerLeftFilename = `${leftContainerDirectory}\\${record.stagedRevisionPlan.leftFilename}`;
  const containerRightFilename = `${rightContainerDirectory}\\${record.stagedRevisionPlan.rightFilename}`;

  const containerArgs =
    record.runtimeSelection.engine === 'labview-cli'
      ? rewriteLabviewCliArgsForContainerWorkspace(commandPlan.args, {
          containerWorkspaceRoot: options.containerWorkspaceRoot,
          leftFilename: containerLeftFilename,
          rightFilename: containerRightFilename,
          reportFilename: record.artifactPlan.reportFilename,
          labviewPath: record.runtimeSelection.labviewExe?.path
        })
      : rewriteLvcompareArgsForContainerWorkspace(commandPlan.args, {
          containerWorkspaceRoot: options.containerWorkspaceRoot,
          leftFilename: containerLeftFilename,
          rightFilename: containerRightFilename,
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
            record.runtimeSelection.labviewExe?.path,
            options.cliConnectTimeoutSeconds
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
    relativeDirectory?: string;
    leftFilename?: string;
    rightFilename?: string;
    reportFilename?: string;
    cliConnectTimeoutSeconds?: number;
  }
): ComparisonCommandPlan | undefined {
  if (!record.runtimeSelection.engine) {
    return undefined;
  }

  // VHS-REQ-624: each revision's tree is materialized into its own `left`/`right`
  // subtree of /workspace/staging, and each staged VI sits at its repo-relative
  // depth inside its OWN revision subtree so in-repo dependencies resolve at load
  // time. Prefix the VI filenames with the side subtree + that depth.
  const relativeDirectory = options.relativeDirectory?.replace(/^\/+|\/+$/g, '') ?? '';
  const baseLeftFilename = options.leftFilename ?? record.stagedRevisionPlan.leftFilename;
  const baseRightFilename = options.rightFilename ?? record.stagedRevisionPlan.rightFilename;
  const leftContainerDirectory = relativeDirectory
    ? `${LEFT_TREE_SUBDIRECTORY}/${relativeDirectory}`
    : LEFT_TREE_SUBDIRECTORY;
  const rightContainerDirectory = relativeDirectory
    ? `${RIGHT_TREE_SUBDIRECTORY}/${relativeDirectory}`
    : RIGHT_TREE_SUBDIRECTORY;
  const containerLeftFilename = `${leftContainerDirectory}/${baseLeftFilename}`;
  const containerRightFilename = `${rightContainerDirectory}/${baseRightFilename}`;

  // VHS-REQ-657: derive the in-container LabVIEW executable and headless mechanism
  // from the selected image so older images (2025 Q3 and earlier) invoke the
  // plain `labview` binary with the EnableCICDFeaturesForLabVIEW env toggle instead
  // of `labviewprofull` + `-Headless` (which is valid only for 2026 Q1 and later).
  const labviewProfile = resolveLinuxContainerLabviewProfile(options.containerImage);

  const containerArgs =
    record.runtimeSelection.engine === 'labview-cli'
      ? rewriteLabviewCliArgsForLinuxContainerWorkspace(commandPlan.args, {
          containerWorkspaceRoot: options.containerWorkspaceRoot,
          leftFilename: containerLeftFilename,
          rightFilename: containerRightFilename,
          reportFilename: options.reportFilename ?? record.artifactPlan.reportFilename,
          labviewPath: record.runtimeSelection.labviewExe?.path,
          containerLabviewPath: labviewProfile.labviewCliPath,
          headlessMode: labviewProfile.headlessMode
        })
      : rewriteLvcompareArgsForLinuxContainerWorkspace(commandPlan.args, {
          containerWorkspaceRoot: options.containerWorkspaceRoot,
          leftFilename: containerLeftFilename,
          rightFilename: containerRightFilename,
          labviewPath: record.runtimeSelection.labviewExe?.path,
          containerLabviewPath: labviewProfile.lvcomparePath
        });
  if (!containerArgs) {
    return undefined;
  }

  const containerScript =
    record.runtimeSelection.engine === 'labview-cli'
      ? buildLinuxContainerLabviewCliScript(
          commandPlan.executable,
          containerArgs,
          labviewProfile.headlessMode,
          {
            labviewExecutablePath: labviewProfile.labviewCliPath,
            connectTimeoutSeconds: options.cliConnectTimeoutSeconds
          }
        )
      : buildLinuxContainerDirectCommandScript(
          commandPlan.executable,
          containerArgs,
          labviewProfile.headlessMode
        );

  // The Linux-container invocation is identical on every host platform, including
  // Windows: Node spawns `docker` shell-lessly (execFile/spawn with shell:false),
  // so the bash `-lc` script is delivered as a single argv element with its
  // quoting intact. On a Windows host this MUST NOT be wrapped in
  // `powershell.exe -EncodedCommand`: Windows PowerShell strips the embedded
  // quotes of the inline `-lc` argument when invoking the native `docker`
  // command, splitting the single script argument and corrupting it into an
  // unparseable bash script (#583). The `-e TEMP/TMP/TMPDIR` values are docker
  // flags consumed by the container, not host environment, so no host shell
  // context is required. The Windows-container provider keeps its own PowerShell
  // transport because it base64-encodes its inner command and is unaffected.
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

export function rewriteLabviewCliArgsForLinuxContainerWorkspace(
  args: string[],
  options: {
    containerWorkspaceRoot: string;
    leftFilename: string;
    rightFilename: string;
    reportFilename: string;
    labviewPath?: string;
    containerLabviewPath?: string;
    headlessMode?: LinuxContainerHeadlessMode;
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

  // VHS-REQ-657: target the image-derived LabVIEW executable, defaulting to the
  // LabVIEW 2026 `labviewprofull` fallback when no profile was supplied. Append
  // `-Headless` only for images that engage headless mode through the flag; 2025
  // Q3 and earlier instead receive `EnableCICDFeaturesForLabVIEW=TRUE` in the
  // container script, so passing `-Headless` there is invalid.
  rewritten.push('-LabVIEWPath', options.containerLabviewPath ?? LINUX_CONTAINER_LABVIEW_EXECUTABLE);
  if ((options.headlessMode ?? 'cli-headless') === 'cli-headless') {
    rewritten.push('-Headless');
  }

  return rewritten.length > 0 ? rewritten : undefined;
}

async function copyReportAssetsDirectory(
  sourceReportFilePath: string,
  destinationReportFilePath: string,
  deps: {
    pathExists: (filePath: string) => Promise<boolean>;
    copyDirectory: typeof fs.cp;
    removePath: typeof fs.rm;
    chmod: typeof fs.chmod;
    readdir: typeof fs.readdir;
    mkdir: typeof fs.mkdir;
  }
): Promise<void> {
  const sourceAssetsDirectory = buildReportAssetsDirectoryPath(sourceReportFilePath);
  if (!(await deps.pathExists(sourceAssetsDirectory))) {
    return;
  }

  const destinationAssetsDirectory = buildReportAssetsDirectoryPath(destinationReportFilePath);
  // LabVIEW emits the assets tree (including the read-only `support/` directory)
  // with restrictive permissions, so a prior run leaves a non-writable
  // destination. fs.cp with force tries to unlink the existing files, which
  // fails with EACCES because their parent directories are not writable. Clear
  // the destination resiliently first instead of relying on force-overwrite.
  await forceRemovePathResilient(destinationAssetsDirectory, {
    removePath: deps.removePath,
    chmod: deps.chmod,
    readdir: deps.readdir
  });
  await deps.mkdir(path.dirname(destinationAssetsDirectory), { recursive: true });
  await deps.copyDirectory(sourceAssetsDirectory, destinationAssetsDirectory, {
    recursive: true,
    force: true
  });
  // Normalize the copied tree to owner-writable so a subsequent run (or stale
  // cleanup) can replace it without hitting EACCES on the read-only directories
  // LabVIEW emits.
  await normalizeReportTreePermissions(destinationAssetsDirectory, {
    chmod: deps.chmod,
    readdir: deps.readdir
  });
}

/**
 * Recursively chmod a report subtree so directories are owner-writable/traversable
 * and files are owner-readable/writable. Best-effort: individual chmod failures
 * are ignored so callers can still attempt removal or copy.
 */
async function normalizeReportTreePermissions(
  targetPath: string,
  deps: {
    chmod: typeof fs.chmod;
    readdir: typeof fs.readdir;
  }
): Promise<void> {
  let entries: Array<{ name: string; isDirectory: () => boolean }>;
  try {
    entries = (await deps.readdir(targetPath, { withFileTypes: true })) as Array<{
      name: string;
      isDirectory: () => boolean;
    }>;
  } catch {
    // Not a readable directory (likely a leaf file); make it owner-writable.
    try {
      await deps.chmod(targetPath, 0o644);
    } catch {
      // Best-effort.
    }
    return;
  }

  try {
    await deps.chmod(targetPath, 0o755);
  } catch {
    // Best-effort.
  }

  for (const entry of entries) {
    const childPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      await normalizeReportTreePermissions(childPath, deps);
    } else {
      try {
        await deps.chmod(childPath, 0o644);
      } catch {
        // Best-effort.
      }
    }
  }
}

/**
 * Remove a path with `fs.rm({ recursive, force })`, retrying after normalizing
 * permissions if the first attempt fails with EACCES/EPERM. LabVIEW-generated
 * `<report>_files/support` directories are emitted read-only, which otherwise
 * blocks both stale cleanup and copy-back overwrite.
 */
async function forceRemovePathResilient(
  targetPath: string,
  deps: {
    removePath: typeof fs.rm;
    chmod: typeof fs.chmod;
    readdir: typeof fs.readdir;
  }
): Promise<void> {
  try {
    await deps.removePath(targetPath, { recursive: true, force: true });
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code !== 'EACCES' && code !== 'EPERM') {
      throw error;
    }
  }

  await normalizeReportTreePermissions(targetPath, {
    chmod: deps.chmod,
    readdir: deps.readdir
  });
  await deps.removePath(targetPath, { recursive: true, force: true });
}

// VHS-REQ-623: a Linux container comparison bind-mounts the host report directory
// into the container at /workspace. When that host path is OUTSIDE the user's home
// directory and Docker is the snap-packaged build (private mount namespace, only
// the `home` interface connected by default), the bind mount silently resolves to
// an empty tmpfs, so LabVIEWCLI reports `... path invalid or does not exist:
// /workspace/staging/...` even though the staged VIs exist on the host. The opaque
// path error hides the real cause. This pure helper returns an actionable
// remediation note for exactly that situation so the failure names the fix
// (keep report storage under $HOME, or connect the snap interface) instead of
// leaving the user to decode a generic path error. Returns undefined when the
// situation does not apply (non-container provider, non-invalid-path failure, or a
// bind-mount source already inside the home directory).
// VHS-REQ-621 / VHS-REQ-658: classify a nonzero/no-report runtime failure into an
// explicit, actionable reason. Exported for direct deterministic unit testing of
// its classification arms, consistent with the other exported helpers in this file.
export function requiresWindowsInterop(
  runtimePlatform: string,
  processPlatform: NodeJS.Platform = process.platform
): boolean {
  return runtimePlatform === 'win32' && processPlatform !== 'win32';
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

  const labviewProcess = observedProcesses.find((processInfo) =>
    isExactObservedRuntimeProcessName(processInfo.imageName, 'LabVIEW.exe')
  );
  let labviewProcessBitness: ObservedLabviewBitness | undefined;
  let labviewProcessYear: string | undefined;
  let labviewProcessExecutablePath: string | undefined;
  if (labviewProcess) {
    try {
      const resolver =
        deps.resolveWindowsLabviewExecutablePath ?? resolveWindowsLabviewExecutablePath;
      labviewProcessExecutablePath = await resolver(labviewProcess.pid, options.hostPlatform);
      labviewProcessBitness = inferLabviewBitnessFromExecutablePath(labviewProcessExecutablePath);
      labviewProcessYear = inferSupportedLabviewYearFromExecutablePath(labviewProcessExecutablePath);
    } catch {
      labviewProcessBitness = undefined;
      labviewProcessYear = undefined;
    }
  }

  return {
    capturedAt: (deps.nowIso ?? defaultNowIso)(),
    hostPlatform: options.hostPlatform,
    runtimePlatform: options.runtimePlatform,
    trigger: options.trigger,
    observedProcesses,
    observedProcessNames,
    labviewProcessObserved: Boolean(labviewProcess),
    labviewCliProcessObserved: observedProcesses.some((processInfo) =>
      isExactObservedRuntimeProcessName(processInfo.imageName, 'LabVIEWCLI.exe')
    ),
    lvcompareProcessObserved: observedProcesses.some((processInfo) =>
      isExactObservedRuntimeProcessName(processInfo.imageName, 'LVCompare.exe')
    ),
    labviewProcessBitness,
    labviewProcessYear,
    labviewProcessExecutablePath
  };
}

/**
 * VHS-REQ-621: Resolve the executable path for a Windows process id via
 * PowerShell. Returns `undefined` on any failure so the caller can record an
 * `unknown` bitness without throwing.
 */
async function resolveWindowsLabviewExecutablePath(
  pid: number,
  hostPlatform: NodeJS.Platform
): Promise<string | undefined> {
  if (hostPlatform !== 'win32' || !Number.isInteger(pid) || pid <= 0) {
    return undefined;
  }
  const powershell = path.win32.join(
    process.env.SYSTEMROOT ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  );
  return await new Promise<string | undefined>((resolve) => {
    execFile(
      powershell,
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `try { (Get-Process -Id ${pid} -ErrorAction Stop).Path } catch { '' }`
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 1024 * 1024
      },
      (error, stdout) => {
        if (error) {
          resolve(undefined);
          return;
        }
        const trimmed = String(stdout ?? '').trim();
        resolve(trimmed.length > 0 ? trimmed : undefined);
      }
    );
  });
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
    let settled = false;
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
    const settleFromExit = async (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      disposeCancellationSubscription();

      child.stdout?.destroy();
      child.stderr?.destroy();

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
    };

    child.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      disposeCancellationSubscription();
      reject(error);
    });
    child.on('exit', (exitCode, signal) => {
      void settleFromExit(exitCode, signal);
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

/**
 * Thrown when CreateComparisonReport completed but copying the generated report
 * into the retained report directory failed (for example an EACCES while
 * overwriting a stale read-only `<report>_files/support` tree). Lets the outer
 * handler report `report-finalize-failed` instead of `command-spawn-failed`.
 */
class ReportFinalizationError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ReportFinalizationError';
    this.code = code;
  }
}

export function defaultNowIso(): string {
  return nowIso();
}

export function defaultNowMs(): number {
  return Date.now();
}
