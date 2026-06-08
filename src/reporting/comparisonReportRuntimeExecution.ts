import { execFile, ExecFileException, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
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
import {
  createDiagnosticsRecorder,
  DiagnosticsRecorder,
  noopDiagnosticsRecorder
} from './diagnostics/diagnosticsRecorder';
import {
  applyLabVIEWCliIniHardening,
  LABVIEW_CLI_INI_AFTER_LAUNCH_KEY,
  LABVIEW_CLI_INI_OPEN_APP_KEY,
  LabVIEWCliIniHardeningResult
} from './runtime/labviewCliIni';

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

/**
 * VHS-REQ-156 (issue #269): default command bound (ms) applied only to the Linux
 * host-native headless OPT-IN path (`LV_RTE_LINUX_HEADLESS=1`). On LabVIEW builds
 * with a broken `HeadlessManager` (e.g. 2026 26.1.1f1, which logs "Failed to
 * initialize headless LabVIEW." every 10s and never binds a session) the
 * `-Headless` CLI hangs indefinitely during VI load. The production action wires
 * no `commandTimeoutMs`, so without this bound the post-process headless classifier
 * never fires and the operator sees an unbounded stall. Bounding the opt-in path
 * converts the stall into a deterministic `command-timed-out` failure that still
 * carries the `linux-headless-init-failed` diagnostic and remediation guidance.
 *
 * The value is well above the 180s (`DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS`)
 * app-reference connect window so a legitimately slow-but-working headless run on
 * a healthy build is never killed prematurely; it matches the existing
 * `DEFAULT_GIT_TIMEOUT_MS` convention. The safe non-headless default (no
 * `-Headless`) and the working Linux container provider stay unbounded.
 */
export const LINUX_HOST_NATIVE_HEADLESS_OPT_IN_DEFAULT_TIMEOUT_MS = 300000;

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
        cliConnectTimeoutSeconds: deps.cliConnectTimeoutSeconds
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

  // Fail closed: the superproject tree must materialize for the comparison to be
  // meaningful.
  await checkoutRevisionIntoWorkTree({
    sourceWorkingDirectory: options.repositoryRoot,
    revisionId: options.revisionId,
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
    revisionId: options.revisionId,
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
    await params.runGit(
      [
        '-C',
        params.sourceWorkingDirectory,
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

/**
 * VHS-REQ-624 (#283): only accept plain relative subpaths for submodule
 * destinations. Absolute paths, drive prefixes, and `.`/`..` segments are
 * rejected so a tree entry can never resolve outside the staging destination.
 */
function isSafeRelativeSubpath(candidate: string): boolean {
  if (!candidate || candidate.startsWith('/') || /^[A-Za-z]:/.test(candidate)) {
    return false;
  }
  return candidate
    .split('/')
    .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
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
 * VHS-REQ-624 (#283): parse NUL-delimited `git ls-tree -r -z` output and return
 * only the submodule gitlink entries (mode `160000`, type `commit`). Each record
 * is `<mode> <type> <object>\t<path>`; the path is kept verbatim (POSIX,
 * unquoted) because `-z` disables path quoting.
 */
export function parseSubmoduleGitlinks(lsTreeOutput: string): SubmoduleGitlink[] {
  const entries: SubmoduleGitlink[] = [];
  for (const record of lsTreeOutput.split('\0')) {
    if (!record) {
      continue;
    }
    const tabIndex = record.indexOf('\t');
    if (tabIndex < 0) {
      continue;
    }
    const metadata = record.slice(0, tabIndex).split(' ');
    const entryPath = record.slice(tabIndex + 1);
    if (metadata.length < 3) {
      continue;
    }
    const [mode, type, object] = metadata;
    if (mode === '160000' && type === 'commit' && object) {
      entries.push({ path: entryPath, revisionId: object });
    }
  }
  return entries;
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
  leftBlob: Buffer,
  rightBlob: Buffer
): Promise<void> {
  const treeRoot = record.stagedRevisionPlan.treeRoot;
  if (!treeRoot) {
    return;
  }

  try {
    await deps.removePath(treeRoot, { recursive: true, force: true });
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
  }
): Promise<ComparisonReportRuntimeExecution> {
  await deps.mkdir(record.artifactPlan.reportDirectory, { recursive: true });
  await deps.mkdir(record.artifactPlan.stagingDirectory, { recursive: true });

  // VHS-REQ-624: for the host-native provider, materialize the selected (newest)
  // revision's tree once so both staged VIs resolve in-repo dependencies at load
  // time. Fail closed before reading blobs or invoking the runtime when the tree
  // cannot be materialized. Container/interop providers re-stage from in-memory
  // buffers and do not use this tree. The Linux short-path staging redirect owns
  // its own materialization into a cleaned tmp directory, so skip it here to
  // avoid writing the tree into the retained report directory uselessly.
  const stagedPlan = record.stagedRevisionPlan;
  let materializedTree: ComparisonReportRuntimeExecution['materializedTree'];
  if (
    record.runtimeSelection.provider === 'host-native' &&
    deps.materializeSelectedRevisionTree &&
    stagedPlan.treeRoot &&
    stagedPlan.treeRevisionId &&
    !shouldUseLinuxHostNativeShortPathStaging(record, deps.processPlatform)
  ) {
    const pathspec = stagedPlan.materializedPathspec?.trim() || '.';
    try {
      await deps.materializeSelectedRevisionTree({
        repositoryRoot,
        revisionId: stagedPlan.treeRevisionId,
        destinationRoot: stagedPlan.treeRoot,
        pathspec
      });
      materializedTree = {
        root: stagedPlan.treeRoot,
        revisionId: stagedPlan.treeRevisionId,
        pathspec
      };
    } catch {
      return {
        state: 'failed',
        attempted: false,
        reportExists: false,
        failureReason: 'selected-tree-materialize-failed',
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
      await pruneRetainedMaterializedTree(record, deps, leftBlob, rightBlob);
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
    return executionResult;
  } finally {
    await cleanupPreparedExecutionContext(executionContext, deps.removePath);
    // VHS-REQ-624: when the tree was materialized into the retained staging
    // directory (win32 host-native / Linux opt-out), prune it back to the two
    // staged VIs so retained storage does not grow by the repository size per run.
    if (materializedTree) {
      await pruneRetainedMaterializedTree(record, deps, leftBlob, rightBlob);
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
  const effectivePortFromIni =
    windowsLabviewTcpSettings.labviewTcpPort ?? linuxLabviewTcpSettings.labviewTcpPort;
  const effectiveExecutionContext: PreparedExecutionContext = {
    ...executionContext,
    commandPlan: {
      executable: executionContext.commandPlan.executable,
      args: appendLabviewCliPortNumberArg(
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

  const initialResult = await executeAttempt(1);
  if (deps.diagnosticsRecorder) {
    await deps.diagnosticsRecorder.archiveAttemptArtifacts(record, 1);
  }
  if (shouldAttemptLinuxHeadlessRecovery(record, initialResult)) {
    const recovery = await attemptLabviewCliHeadlessSessionReset(
      'Linux',
      record,
      deps,
      effectiveExecutionContext,
      windowsLabviewTcpSettings.labviewTcpPort
    );
    const retriedResult = await executeAttempt(2);
    if (deps.diagnosticsRecorder) {
      await deps.diagnosticsRecorder.archiveAttemptArtifacts(record, 2);
    }
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
    const retriedResult = await executeAttempt(2);
    if (deps.diagnosticsRecorder) {
      await deps.diagnosticsRecorder.archiveAttemptArtifacts(record, 2);
    }
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
  // Notes derived from the Linux headless status logs (LVStatus.txt / lvrt headless
  // logs). Kept separate from `notes` so the caller can gate them on run success
  // exactly like the headless diagnosticReason — a successful run must never surface
  // a headless bring-up failure note (see issue #270).
  headlessNotes?: string[];
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
// Linux containers run LabVIEW as root, so anything written into the bind-mounted
// workspace lands on the host owned by root. Confine that root-owned output to a
// dedicated subdirectory of the retained report directory so the host-native
// provider's canonical report path only ever contains user-owned files and never
// collides with a prior container run's root-owned artifacts.
const LINUX_CONTAINER_OUTPUT_DIRNAME = 'container-out';
// NI's official LabVIEW container images bundle the full Professional IDE under
// `labviewprofull`. NI's own canonical CreateComparisonReport script
// (`vidiff.sh` in ni/labview-for-containers) invokes `-LabVIEWPath .../labviewprofull`
// with `-Headless`; the plain `labview` binary fails to fully engage headless mode
// inside the container (recursive GSW LEIF load). Use the Professional binary so the
// container provider can complete a comparison report.
const LINUX_CONTAINER_LABVIEW_EXECUTABLE = '/usr/local/natinst/LabVIEW-2026-64/labviewprofull';
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

const DEFAULT_LINUX_LABVIEW_TCP_PORT = 3363;

export function buildLinuxLabviewIniCandidatePaths(options: {
  homeDir: string;
  requestedLabviewVersion?: string;
  bitness?: string;
}): string[] {
  const homeDir = options.homeDir;
  const versionTokens = new Set<string>();
  const requested = options.requestedLabviewVersion?.trim();
  if (requested) {
    versionTokens.add(requested);
    if (options.bitness === 'x64') {
      versionTokens.add(`${requested}-64`);
    } else if (options.bitness === 'x86') {
      versionTokens.add(`${requested}-32`);
    } else {
      versionTokens.add(`${requested}-64`);
    }
  }

  const candidates: string[] = [];
  for (const token of versionTokens) {
    candidates.push(path.posix.join(homeDir, 'natinst', '.config', `LabVIEW-${token}`, 'labview.conf'));
    candidates.push(path.posix.join(homeDir, '.config', 'natinst', `LabVIEW-${token}`, 'labview.conf'));
    candidates.push(path.posix.join('/etc', 'natinst', `LabVIEW-${token}`, 'labview.conf'));
  }
  // Generic fallback when the version is unknown — caller can iterate via deps.readdir if desired.
  return [...new Set(candidates)];
}

/**
 * VHS-REQ-156: Infer the LabVIEW year token (e.g. `2026`) from a Linux
 * `labviewExe.path` like `/usr/local/natinst/LabVIEW-2026-64/labview` so the
 * labview.conf preflight can locate the config when `requestedLabviewVersion`
 * was not explicitly set on the runtime selection. Returns `undefined` when
 * the directory segment does not match the canonical `LabVIEW-<year>[-bits]`
 * shape.
 */
export function inferLinuxLabviewVersionFromExecutablePath(
  executablePath: string | undefined
): string | undefined {
  if (!executablePath) {
    return undefined;
  }
  const segments = executablePath.split('/').filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const match = segments[index].match(/^LabVIEW-(\d{4})(?:-(?:32|64))?$/u);
    if (match) {
      return match[1];
    }
  }
  return undefined;
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

    const labviewTcpPort = portMatch
      ? Number.parseInt(portMatch[1], 10)
      : DEFAULT_LINUX_LABVIEW_TCP_PORT;

    return {
      labviewIniPath: candidate,
      labviewTcpPort,
      viServerTcpEnabled: true,
      inspectedCandidatePaths: candidates,
      notes: [
        `Derived VI Server TCP port ${String(labviewTcpPort)} from ${candidate} and passed it explicitly to LabVIEWCLI.`
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
    record.runtimeSelection.engine !== 'labview-cli' ||
    linuxLabviewTcpSettings.viServerTcpEnabled === true
  ) {
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
    commandArgs?: string[];
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

  const headlessDiagnostics = shouldCaptureLinuxHeadlessDiagnostics(record, deps.commandArgs)
    ? await captureLinuxHeadlessDiagnostics(record, {
        pathExists: deps.pathExists,
        copyFile: deps.copyFile,
        readFile: deps.readFile,
        readdir: deps.readdir ?? fs.readdir,
        mkdir: deps.mkdir,
        removePath: deps.removePath ?? fs.rm,
        processPlatform: deps.processPlatform,
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

// linux-headless-init-failed is terminal (no retry can help) and linux-headless-recursive-load
// is the trigger for the headless-session recovery retry. Either headless reason must win when
// observed in LVStatus.txt / lvrt headless logs, even if stderr or the LabVIEW CLI diagnostic
// log carry a more specific post-failure reason.
function selectDiagnosticReason(
  headlessReason: string | undefined,
  ...otherReasons: Array<string | undefined>
): string | undefined {
  if (
    headlessReason === 'linux-headless-init-failed' ||
    headlessReason === 'linux-headless-recursive-load'
  ) {
    return headlessReason;
  }
  for (const reason of otherReasons) {
    if (reason) {
      return reason;
    }
  }
  return headlessReason;
}

function shouldCaptureLinuxHeadlessDiagnostics(
  record: ComparisonReportPacketRecord,
  commandArgs: string[] | undefined
): boolean {
  return (
    resolveEffectiveRuntimePlatform(record.runtimeSelection) === 'linux' &&
    record.runtimeSelection.engine === 'labview-cli' &&
    (record.runtimeSelection.provider === 'linux-container' ||
      record.runtimeSelection.headlessRequested === true ||
      isHeadlessLabviewCliExecution(commandArgs))
  );
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
    wasWindowsHeadlessLabviewCliExecutionRequested(record, execution)
  );
}

function wasWindowsHeadlessLabviewCliExecutionRequested(
  record: ComparisonReportPacketRecord,
  execution: ComparisonReportRuntimeExecution
): boolean {
  return (
    record.runtimeSelection.provider === 'windows-container' ||
    record.runtimeSelection.headlessRequested === true ||
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

/**
 * VHS-REQ-156 (issue #269): the Linux host-native headless OPT-IN path is the only
 * surface that can hang indefinitely on a broken `HeadlessManager`. The env-var
 * opt-in (`LV_RTE_LINUX_HEADLESS=1`) is reflected as `-Headless` in the resolved
 * command plan even when `headlessRequested` was not persisted, so detect both the
 * persisted flag and the actual `-Headless` argument. The linux-container provider
 * is deliberately excluded: its bundled image initializes headless mode correctly
 * and must stay unbounded.
 */
function isLinuxHostNativeHeadlessOptIn(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan | undefined
): boolean {
  return (
    resolveEffectiveRuntimePlatform(record.runtimeSelection) === 'linux' &&
    record.runtimeSelection.engine === 'labview-cli' &&
    record.runtimeSelection.provider === 'host-native' &&
    (record.runtimeSelection.headlessRequested === true ||
      isHeadlessLabviewCliExecution(commandPlan?.args))
  );
}

/**
 * VHS-REQ-156 (issue #269): resolve the effective command timeout (ms). An
 * explicitly configured `commandTimeoutMs` always wins (e.g. a validation harness
 * bound). Otherwise the Linux host-native headless opt-in receives a default bound
 * so a broken HeadlessManager surfaces `linux-headless-init-failed` deterministically
 * instead of stalling forever. All other paths (non-headless default, container
 * providers, non-Linux, non-CLI) stay unbounded by returning `undefined`.
 */
export function resolveEffectiveCommandTimeoutMs(options: {
  record: ComparisonReportPacketRecord;
  commandPlan: ComparisonCommandPlan | undefined;
  configuredTimeoutMs?: number;
}): number | undefined {
  if (typeof options.configuredTimeoutMs === 'number') {
    return options.configuredTimeoutMs;
  }
  if (isLinuxHostNativeHeadlessOptIn(options.record, options.commandPlan)) {
    return LINUX_HOST_NATIVE_HEADLESS_OPT_IN_DEFAULT_TIMEOUT_MS;
  }
  return undefined;
}

async function attemptLabviewCliHeadlessSessionReset(
  platformLabel: 'Linux' | 'Windows',
  record: ComparisonReportPacketRecord,
  deps: {
    runCommand: (commandPlan: ComparisonCommandPlan) => Promise<RunCommandResult>;
    nowMs: () => number;
    mkdir: typeof fs.mkdir;
    writeFile: typeof fs.writeFile;
    cliConnectTimeoutSeconds?: number;
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
  const windowsContainerImage =
    record.runtimeSelection.containerImage?.trim() ||
    record.runtimeSelection.windowsContainerImage?.trim();
  const linuxContainerImage = record.runtimeSelection.containerImage?.trim();
  const closeCommandPlan =
    record.runtimeSelection.provider === 'windows-container' && windowsContainerImage
      ? buildWindowsContainerCommandPlan(record, baseCloseCommandPlan, {
          hostReportDirectory:
            normalizeWindowsInteropPath(path.dirname(executionContext.reportFilePath)) ??
            path.win32.dirname(executionContext.reportFilePath),
          hostTempDirectory:
            normalizeWindowsInteropPath(
              executionContext.diagnosticPathMapping?.hostRoot ??
                path.join(path.dirname(executionContext.reportFilePath), 'container-temp')
            ) ??
            path.win32.join(path.win32.dirname(executionContext.reportFilePath), 'container-temp'),
          containerWorkspaceRoot: WINDOWS_CONTAINER_WORKSPACE_ROOT,
          containerImage: windowsContainerImage,
          processPlatform: executionContext.reportFilePath.includes('\\') ? 'win32' : 'linux',
          cliConnectTimeoutSeconds: deps.cliConnectTimeoutSeconds
        }) ?? baseCloseCommandPlan
      : record.runtimeSelection.provider === 'linux-container' && linuxContainerImage
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

  // A genuine host-native Linux run leaves its LabVIEW headless logs in the host
  // /tmp. A linux-container run, even on a Linux host, writes them under the mapped
  // container-temp (diagnosticPathMapping.hostRoot) exactly like the windows-container
  // provider. Reading host /tmp for a container run would let a PRIOR host-native
  // run's stale /tmp/lvrt_*_headless_*_cur.txt bleed into the container run's
  // diagnostics, so only the host-native provider may read /tmp (see issue #270).
  const sourceRoot =
    deps.processPlatform === 'linux' && record.runtimeSelection.provider !== 'linux-container'
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

    if (/Failed to initialize headless LabVIEW\./i.test(diagnosticText)) {
      reason = 'linux-headless-init-failed';
      notes.push(
        'Retained Linux headless log reported "Failed to initialize headless LabVIEW." Headless mode is unusable on this LabVIEW build; set LV_RTE_LINUX_HEADLESS=0 to opt out, or switch to the Linux container provider.'
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

/**
 * VHS-REQ-156: Linux host-native short-path staging.
 *
 * LabVIEW 2026 (26.1.1f1) on Linux logs `Possible path leak, unable to purge elements
 * of base #0` and fails CreateComparisonReport with LabVIEW error 8 (file permission)
 * when staged VIs / report paths live under deep, dot-prefixed paths such as
 * `~/.config/Code/User/workspaceStorage/<hash>/<extension>/reports/...`. Mirroring
 * the staged inputs under a short tmpdir avoids the path-table corruption.
 */
export function shouldUseLinuxHostNativeShortPathStaging(
  record: ComparisonReportPacketRecord,
  processPlatform: NodeJS.Platform,
  processEnv: NodeJS.ProcessEnv = process.env
): boolean {
  if (processPlatform !== 'linux') {
    return false;
  }
  if (record.runtimeSelection.platform !== 'linux') {
    return false;
  }
  if (record.runtimeSelection.provider !== 'host-native') {
    return false;
  }
  if (processEnv.LVIE_LINUX_DISABLE_RUNTIME_TMPDIR === '1') {
    return false;
  }
  const tmpRoot = resolveLinuxRuntimeTmpRoot(processEnv);
  const reportDir = record.artifactPlan.reportDirectory;
  if (typeof reportDir === 'string' && isPathInsideDirectory(reportDir, tmpRoot)) {
    return false;
  }
  return true;
}

function isPathInsideDirectory(candidate: string, directory: string): boolean {
  // Use path.posix on Linux short-path staging where both inputs are POSIX strings.
  const normalizedDir = path.posix.normalize(directory).replace(/\/+$/u, '');
  const normalizedCandidate = path.posix.normalize(candidate);
  if (normalizedCandidate === normalizedDir) {
    return true;
  }
  return normalizedCandidate.startsWith(`${normalizedDir}/`);
}

function resolveLinuxRuntimeTmpRoot(processEnv: NodeJS.ProcessEnv): string {
  const override = processEnv.LVIE_LINUX_RUNTIME_TMPDIR?.trim();
  if (override) {
    return override;
  }
  return path.join(os.tmpdir(), 'vi-history-suite-runtime');
}

export function buildLinuxHostNativeShortPathLayout(
  record: ComparisonReportPacketRecord,
  processEnv: NodeJS.ProcessEnv = process.env
): WindowsInteropLayout {
  const baseDir = resolveLinuxRuntimeTmpRoot(processEnv);
  const reportDirectory = path.posix.join(
    baseDir,
    record.artifactPlan.repoId,
    record.artifactPlan.fileId
  );
  const stagingDirectory = path.posix.join(reportDirectory, 'staging');
  return {
    reportDirectory,
    stagingDirectory,
    leftFilePath: path.posix.join(stagingDirectory, record.stagedRevisionPlan.leftFilename),
    rightFilePath: path.posix.join(stagingDirectory, record.stagedRevisionPlan.rightFilename),
    reportFilePath: path.posix.join(reportDirectory, record.artifactPlan.reportFilename)
  };
}

export function buildLinuxHostNativeShortPathCommandPlan(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan,
  layout: WindowsInteropLayout
): ComparisonCommandPlan | undefined {
  if (record.runtimeSelection.engine === 'labview-cli') {
    const args: string[] = [];
    for (let index = 0; index < commandPlan.args.length; index += 1) {
      const current = commandPlan.args[index];
      if (current === '-VI1' || current === '-vi1') {
        args.push(current, layout.leftFilePath);
        index += 1;
        continue;
      }
      if (current === '-VI2' || current === '-vi2') {
        args.push(current, layout.rightFilePath);
        index += 1;
        continue;
      }
      if (current === '-ReportPath' || current === '-reportPath') {
        args.push(current, layout.reportFilePath);
        index += 1;
        continue;
      }
      args.push(current);
    }
    return {
      executable: commandPlan.executable,
      args
    };
  }

  if (record.runtimeSelection.engine === 'lvcompare') {
    if (commandPlan.args.length < 2) {
      return undefined;
    }
    const args = [layout.leftFilePath, layout.rightFilePath, ...commandPlan.args.slice(2)];
    return {
      executable: commandPlan.executable,
      args
    };
  }

  return undefined;
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
    leftFilePath: joinPreservingExplicitPathStyle(hostLayout.stagingDirectory, relativeDirectory, leftFilename),
    rightFilePath: joinPreservingExplicitPathStyle(hostLayout.stagingDirectory, relativeDirectory, rightFilename),
    reportFilePath: joinPreservingExplicitPathStyle(hostLayout.reportDirectory, reportFilename),
    reportIdentityFilenames: [leftFilename, rightFilename],
    reportTextReplacements: replacements
  };
}

function joinPreservingExplicitPathStyle(rootPath: string, ...segments: string[]): string {
  if (rootPath.startsWith('/')) {
    return path.posix.join(rootPath, ...segments.map((segment) => segment.replace(/\\/g, '/')));
  }

  return path.join(rootPath, ...segments);
}

function posixDirname(filePath: string): string {
  if (filePath.startsWith('/')) {
    return path.posix.dirname(filePath);
  }

  return path.dirname(filePath);
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
 * the selected (newest) revision's tree first when a materializer + repository root
 * are supplied so in-repo dependencies sit beside the staged VIs. Shared by the
 * host-interop and Linux-host container branches and the Windows container path so
 * every external provider gets dependency-aware staging. Fails closed when the tree
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

  let relativeDirectory = '';
  let materializedTree: ComparisonReportRuntimeExecution['materializedTree'];
  if (
    deps.materializeSelectedRevisionTree &&
    deps.repositoryRoot &&
    record.stagedRevisionPlan.treeRevisionId
  ) {
    relativeDirectory = record.stagedRevisionPlan.relativeDirectory ?? '';
    const pathspec = record.stagedRevisionPlan.materializedPathspec?.trim() || '.';
    try {
      await deps.materializeSelectedRevisionTree({
        repositoryRoot: deps.repositoryRoot,
        revisionId: record.stagedRevisionPlan.treeRevisionId,
        destinationRoot: stagingDirectory,
        pathspec
      });
      materializedTree = {
        root: stagingDirectory,
        revisionId: record.stagedRevisionPlan.treeRevisionId,
        pathspec
      };
    } catch {
      return {
        outcome: 'blocked',
        failureReason: 'selected-tree-materialize-failed',
        relativeDirectory: '',
        leftFilePath: joinPreservingExplicitPathStyle(
          stagingDirectory,
          record.stagedRevisionPlan.leftFilename
        ),
        rightFilePath: joinPreservingExplicitPathStyle(
          stagingDirectory,
          record.stagedRevisionPlan.rightFilename
        )
      };
    }
  }

  const leftFilePath = joinPreservingExplicitPathStyle(
    stagingDirectory,
    relativeDirectory,
    record.stagedRevisionPlan.leftFilename
  );
  const rightFilePath = joinPreservingExplicitPathStyle(
    stagingDirectory,
    relativeDirectory,
    record.stagedRevisionPlan.rightFilename
  );
  await deps.mkdir(posixDirname(leftFilePath), { recursive: true });
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

  // VHS-REQ-624: when a dependency tree is materialized, the staged VIs live at
  // their repo-relative depth inside the staging mount. Prefix the VI filenames
  // with that depth (Windows-style backslash separators inside the container).
  const relativeDirectory = (options.relativeDirectory ?? '')
    .replace(/^[\\/]+|[\\/]+$/g, '')
    .replace(/\//g, '\\');
  const containerLeftFilename = relativeDirectory
    ? `${relativeDirectory}\\${record.stagedRevisionPlan.leftFilename}`
    : record.stagedRevisionPlan.leftFilename;
  const containerRightFilename = relativeDirectory
    ? `${relativeDirectory}\\${record.stagedRevisionPlan.rightFilename}`
    : record.stagedRevisionPlan.rightFilename;

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
  }
): ComparisonCommandPlan | undefined {
  if (!record.runtimeSelection.engine) {
    return undefined;
  }

  // VHS-REQ-624: when the selected-revision tree is materialized, the staged VIs
  // live at their repo-relative depth inside /workspace/staging so in-repo
  // dependencies resolve at load time. Prefix the VI filenames with that depth.
  const relativeDirectory = options.relativeDirectory?.replace(/^\/+|\/+$/g, '') ?? '';
  const baseLeftFilename = options.leftFilename ?? record.stagedRevisionPlan.leftFilename;
  const baseRightFilename = options.rightFilename ?? record.stagedRevisionPlan.rightFilename;
  const containerLeftFilename = relativeDirectory
    ? `${relativeDirectory}/${baseLeftFilename}`
    : baseLeftFilename;
  const containerRightFilename = relativeDirectory
    ? `${relativeDirectory}/${baseRightFilename}`
    : baseRightFilename;

  const containerArgs =
    record.runtimeSelection.engine === 'labview-cli'
      ? rewriteLabviewCliArgsForLinuxContainerWorkspace(commandPlan.args, {
          containerWorkspaceRoot: options.containerWorkspaceRoot,
          leftFilename: containerLeftFilename,
          rightFilename: containerRightFilename,
          reportFilename: options.reportFilename ?? record.artifactPlan.reportFilename,
          labviewPath: record.runtimeSelection.labviewExe?.path
        })
      : rewriteLvcompareArgsForLinuxContainerWorkspace(commandPlan.args, {
          containerWorkspaceRoot: options.containerWorkspaceRoot,
          leftFilename: containerLeftFilename,
          rightFilename: containerRightFilename,
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

  rewritten.push('-LabVIEWPath', LINUX_CONTAINER_LABVIEW_EXECUTABLE);
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
  labviewPath?: string,
  cliConnectTimeoutSeconds?: number
): string {
  const openAppTimeout =
    typeof cliConnectTimeoutSeconds === 'number' && Number.isInteger(cliConnectTimeoutSeconds) && cliConnectTimeoutSeconds > 0
      ? cliConnectTimeoutSeconds
      : WINDOWS_CONTAINER_OPEN_APP_TIMEOUT_SECONDS;
  const afterLaunchTimeout =
    typeof cliConnectTimeoutSeconds === 'number' && Number.isInteger(cliConnectTimeoutSeconds) && cliConnectTimeoutSeconds > 0
      ? cliConnectTimeoutSeconds
      : WINDOWS_CONTAINER_AFTER_LAUNCH_TIMEOUT_SECONDS;
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
    `  Set-IniToken -Path $cliIni -Key '${LABVIEW_CLI_INI_OPEN_APP_KEY}' -Value '${openAppTimeout}'`,
    `  Set-IniToken -Path $cliIni -Key '${LABVIEW_CLI_INI_AFTER_LAUNCH_KEY}' -Value '${afterLaunchTimeout}'`,
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
  const connectedToLabview = /Connection established with LabVIEW at port number \d+\./i.test(
    diagnosticText
  );
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

  if (/VI is password protected\./i.test(diagnosticText)) {
    notes.push(
      connectedToLabview
        ? 'LabVIEW CLI connected to LabVIEW before CreateComparisonReport failed because one or both selected VI revisions are password protected.'
        : 'LabVIEW CLI could not generate a comparison report because one or both selected VI revisions are password protected.'
    );
    return {
      reason: 'labview-cli-vi-password-protected',
      notes: connectedToLabview ? notes : appendLaunchConfirmationNote(notes, launchSucceeded)
    };
  }

  if (
    connectedToLabview &&
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

  if (
    /\(Hex 0x8\) File permission error\./i.test(diagnosticText) &&
    /CreateComparisonReport operation failed\./i.test(diagnosticText)
  ) {
    notes.push(
      launchSucceeded
        ? 'LabVIEW CLI launched LabVIEW successfully but CreateComparisonReport returned LabVIEW error 8 (File permission error) while writing the report.'
        : 'LabVIEW CLI reported CreateComparisonReport returned LabVIEW error 8 (File permission error).'
    );
    return {
      reason: 'labview-cli-create-report-permission-error',
      notes: appendLaunchConfirmationNote(notes, launchSucceeded)
    };
  }

  if (/CreateComparisonReport operation succeeded\./i.test(diagnosticText)) {
    notes.push('LabVIEW CLI reported that CreateComparisonReport operation succeeded.');
    return {
      notes
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
  selectedBitness?: 'x86' | 'x64';
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
        notes: ['LVCompare exited 0 without generating the report file.']
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

    // VHS-REQ-621: Race-condition fallback. Preflight may have admitted a
    // host runtime that became contaminated by a different-bitness LabVIEW
    // launched between preflight and process-exit. Reclassify so the user
    // sees the actionable bitness-conflict diagnostic instead of the generic
    // nonzero exit message.
    if (
      options.selectedBitness &&
      options.exitProcessObservation?.labviewProcessObserved === true &&
      options.exitProcessObservation.labviewProcessBitness &&
      options.exitProcessObservation.labviewProcessBitness !== 'unknown' &&
      options.exitProcessObservation.labviewProcessBitness !== options.selectedBitness
    ) {
      const observed = options.exitProcessObservation.labviewProcessBitness;
      return {
        reason: 'labview-host-bitness-conflict',
        notes: [
          `LabVIEW ${observed} was running at the retained process-exit snapshot while comparison-report execution targeted LabVIEW ${options.selectedBitness}; LabVIEW refuses to start a second instance at a different bitness, which is consistent with the observed nonzero exit.`
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

function classifyCancelledRuntimeFailure(options: {
  engine?: 'labview-cli' | 'lvcompare';
  diagnosticReason?: string;
}): {
  reason: string;
  notes: string[];
} {
  if (
    options.engine === 'labview-cli' &&
    options.diagnosticReason === 'labview-cli-call-by-reference'
  ) {
    return {
      reason: 'command-exited-nonzero',
      notes: [
        'Comparison-report runtime retained a LabVIEW CLI Error 66 / Call By Reference failure before a cancellation-shaped transport exit was observed.'
      ]
    };
  }

  return {
    reason: 'command-cancelled',
    notes: ['Comparison-report runtime was cancelled before completion.']
  };
}

function classifyTimedOutRuntimeDiagnostic(options: {
  engine?: 'labview-cli' | 'lvcompare';
  processObservation?: RuntimeProcessObservation;
  exitProcessObservation?: RuntimeProcessObservation;
}): {
  reason?: string;
  notes: string[];
} {
  if (
    options.engine !== 'labview-cli' ||
    options.processObservation?.trigger !== 'cli-log-banner' ||
    !options.processObservation.labviewCliProcessObserved ||
    options.processObservation.labviewProcessObserved
  ) {
    return {
      notes: []
    };
  }

  if (
    options.exitProcessObservation?.trigger === 'process-exit' &&
    !options.exitProcessObservation.labviewProcessObserved &&
    !options.exitProcessObservation.labviewCliProcessObserved &&
    !options.exitProcessObservation.lvcompareProcessObserved
  ) {
    return {
      reason: 'labview-cli-timeout-no-labview-through-exit',
      notes: [
        'LabVIEW CLI timed out without generating a report; at the retained cli-log-banner snapshot, LabVIEWCLI.exe was observed while LabVIEW.exe was not observed, and no LabVIEW-related processes remained at the retained process-exit snapshot.'
      ]
    };
  }

  return {
    reason: 'labview-cli-timeout-no-labview-at-banner-snapshot',
    notes: [
      'LabVIEW CLI timed out without generating a report; at the retained cli-log-banner snapshot, LabVIEWCLI.exe was observed while LabVIEW.exe was not observed.'
    ]
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

  const labviewProcess = observedProcesses.find((processInfo) =>
    isExactObservedRuntimeProcessName(processInfo.imageName, 'LabVIEW.exe')
  );
  let labviewProcessBitness: ObservedLabviewBitness | undefined;
  let labviewProcessExecutablePath: string | undefined;
  if (labviewProcess) {
    try {
      const resolver =
        deps.resolveWindowsLabviewExecutablePath ?? resolveWindowsLabviewExecutablePath;
      labviewProcessExecutablePath = await resolver(labviewProcess.pid, options.hostPlatform);
      labviewProcessBitness = inferLabviewBitnessFromExecutablePath(labviewProcessExecutablePath);
    } catch {
      labviewProcessBitness = undefined;
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
    labviewProcessExecutablePath
  };
}

/**
 * VHS-REQ-621: Infer LabVIEW.exe bitness from its filesystem path. The Windows
 * installer for LabVIEW always lands x86 under `Program Files (x86)\National
 * Instruments\...` and x64 under `Program Files\National Instruments\...`. This
 * pattern is the same canonical-path discipline used by the runtime locator's
 * documented scan paths, so reuse it instead of probing PE headers.
 */
export function inferLabviewBitnessFromExecutablePath(
  executablePath: string | undefined
): ObservedLabviewBitness | undefined {
  if (typeof executablePath !== 'string' || executablePath.trim().length === 0) {
    return undefined;
  }
  const normalized = executablePath.toLowerCase().replace(/\//g, '\\');
  if (normalized.includes('\\program files (x86)\\')) {
    return 'x86';
  }
  if (normalized.includes('\\program files\\')) {
    return 'x64';
  }
  return 'unknown';
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

function extractErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object') {
    const code = (error as NodeJS.ErrnoException).code;
    if (typeof code === 'string') {
      return code;
    }
  }
  return undefined;
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
