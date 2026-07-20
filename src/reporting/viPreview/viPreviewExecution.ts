import * as path from 'node:path';

import { ComparisonCommandPlan } from '../comparisonReportPlan';
import {
  buildLabviewCliPrintToSingleFileHtmlPlan,
  buildLinuxContainerViPreviewCommandPlan,
  buildWindowsContainerViPreviewCommandPlan
} from './viPreviewCommandPlan';
import {
  localViServerLockKey,
  sharedLocalViServerAcquisitionLock
} from '../runtime/localViServerAcquisitionLock';
import {
  createCycleMeter,
  CycleMeasurement,
  CycleMeter
} from '../runtime/cycleMeter';

/**
 * VHS-REQ-659: single-VI preview execution orchestration.
 *
 * Selects the host-native, Linux-container, or Windows-container preview command
 * plan from the resolved runtime selection, runs it through an injected command
 * runner, and classifies the outcome. The staged VI and the produced HTML both
 * live in a caller-provided workspace directory (for the containers this
 * directory is bind-mounted at the container workspace root). Filesystem and
 * process boundaries are injected so the orchestrator stays deterministically
 * unit-testable without a LabVIEW runtime or Docker (reporting orchestration
 * guardrails: separated stages, dependency-injected boundaries, explicit
 * outcomes).
 */

export type ViPreviewProvider = 'host-native' | 'linux-container' | 'windows-container';

export interface ViPreviewRuntimeSelection {
  provider: ViPreviewProvider;
  /** Host-native LabVIEWCLI executable path. Required for `host-native`. */
  labviewCliPath?: string;
  /** Host-native `-LabVIEWPath` value (optional). */
  labviewExePath?: string;
  /** Emit `-Headless` for host-native runs (default false). */
  headless?: boolean;
  /** VI Server port passed to LabVIEWCLI. */
  portNumber?: number;
  /** LabVIEW container image reference. Required for `linux-container`. */
  containerImage?: string;
  /** In-container LabVIEW executable (image-derived). */
  containerLabviewPath?: string;
  /** VI Server connect window (seconds) for container runs. */
  connectTimeoutSeconds?: number;
  /**
   * Host PowerShell executable that launches `docker run` for a
   * `windows-container` render (resolved from the host platform). Required for
   * the Windows container provider; when absent the render is blocked.
   */
  windowsPowerShellHostExecutable?: string;
}

export interface ExecuteViPreviewOptions {
  runtime: ViPreviewRuntimeSelection;
  /**
   * Host directory that already contains the staged VI and receives the output
   * HTML. For the Linux container this directory is mounted at the container
   * workspace root.
   */
  workspaceDirectory: string;
  /** Staged VI filename relative to `workspaceDirectory`. */
  viFilename: string;
  /** Output HTML filename relative to `workspaceDirectory`. */
  outputFilename: string;
  /** Host directory that contains the `PrintToSingleFileHtml/` operation folder. */
  operationDirectory: string;
}

export type ViPreviewFailureReason =
  | 'unsupported-runtime-provider'
  | 'labview-cli-selection-incomplete'
  | 'container-image-unavailable'
  | 'windows-powershell-host-unavailable'
  | 'labview-cli-connection-failed'
  | 'labview-preview-operation-load-failed'
  | 'command-exited-nonzero'
  | 'preview-output-not-produced'
  | 'preview-cache-miss';

export interface ViPreviewExecutionResult {
  outcome: 'rendered' | 'blocked' | 'failed';
  reportFilePath?: string;
  failureReason?: ViPreviewFailureReason;
  commandPlan?: ComparisonCommandPlan;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  /**
   * VHS-REQ-669: timing of the single render cycle when the LabVIEWCLI command
   * was actually run. Absent for `blocked` results (no cycle executed).
   */
  cycle?: CycleMeasurement;
}

export interface RunViPreviewCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ViPreviewExecutionDeps {
  runCommand: (plan: ComparisonCommandPlan) => Promise<RunViPreviewCommandResult>;
  pathExists: (filePath: string) => Promise<boolean>;
  /**
   * VHS-REQ-669: acquires a serialization slot for a local VI Server endpoint
   * before a host-native LabVIEWCLI launch and returns a release function, so
   * concurrent host-native launches against the same local VI Server take turns
   * instead of contending. Container/docker runs never acquire a slot. Defaults
   * to the process-wide shared lock; injected in tests.
   */
  acquireLocalViServerSlot?: (key: string) => Promise<() => void>;
  /**
   * VHS-REQ-669: optional cycle meter used to measure this render cycle's
   * duration, index, and inter-cycle latency. When omitted a per-call meter is
   * used so the result still carries the single cycle's duration/outcome
   * (cycleIndex 1, no inter-cycle gap). Inject a shared meter across renders to
   * measure back-to-back cycle latency.
   */
  cycleMeter?: CycleMeter;
}

/**
 * Cold-launch VI Server connectivity failure signature, shared with the
 * comparison-runtime classifier: LabVIEWCLI exits nonzero because it could not
 * connect to the just-launched headless LabVIEW's VI Server
 * (`-350000`/`-350051`). It is surfaced directly as a classified failure rather
 * than retried, so an upstream connectivity problem is caught genuinely instead
 * of being masked by a warm retry.
 */
const VI_PREVIEW_CONNECTIVITY_FAILURE_PATTERN =
  /-350000|-350051|failed to establish a connection with LabVIEW/i;

function isViPreviewConnectivityFailure(run: RunViPreviewCommandResult): boolean {
  if (run.exitCode === 0) {
    return false;
  }
  return (
    VI_PREVIEW_CONNECTIVITY_FAILURE_PATTERN.test(run.stderr) ||
    VI_PREVIEW_CONNECTIVITY_FAILURE_PATTERN.test(run.stdout)
  );
}

/**
 * Operation-class load failure signature: LabVIEWCLI exits nonzero with LabVIEW
 * error 1125 while loading the vendored `PrintToSingleFileHtml` operation class
 * (`Get LV Class Default Value.vi` / "attempted to load the class"). On the
 * preview path this almost always means the selected LabVIEW is too old to load
 * the (newer) operation class. Not transient, so it is never retried.
 */
const VI_PREVIEW_OPERATION_LOAD_ERROR_PATTERN = /error code\s*:\s*1125\b/i;
const VI_PREVIEW_OPERATION_LOAD_CONTEXT_PATTERN =
  /load the class|Get LV Class Default Value|PrintToSingleFileHtml\.lvclass/i;

function isViPreviewOperationLoadFailure(run: RunViPreviewCommandResult): boolean {
  if (run.exitCode === 0) {
    return false;
  }
  const text = `${run.stderr}\n${run.stdout}`;
  return (
    VI_PREVIEW_OPERATION_LOAD_ERROR_PATTERN.test(text) &&
    VI_PREVIEW_OPERATION_LOAD_CONTEXT_PATTERN.test(text)
  );
}

/**
 * Classifies a nonzero LabVIEWCLI preview exit: the cold-launch connectivity
 * signature (`-350000`) -> `labview-cli-connection-failed`; the operation-class
 * load signature (error 1125) -> `labview-preview-operation-load-failed` (the
 * selected LabVIEW is likely too old); otherwise `command-exited-nonzero`.
 */
function classifyViPreviewFailureReason(run: RunViPreviewCommandResult): ViPreviewFailureReason {
  if (isViPreviewConnectivityFailure(run)) {
    return 'labview-cli-connection-failed';
  }
  if (isViPreviewOperationLoadFailure(run)) {
    return 'labview-preview-operation-load-failed';
  }
  return 'command-exited-nonzero';
}

function blocked(
  failureReason: ViPreviewFailureReason,
  commandPlan?: ComparisonCommandPlan
): ViPreviewExecutionResult {
  return { outcome: 'blocked', failureReason, commandPlan };
}

/**
 * Builds the provider-appropriate command plan for a single-VI preview. Returns
 * a `blocked` result (no command plan) when the runtime selection is
 * incomplete for the chosen provider.
 */
export function buildViPreviewCommandPlan(
  options: ExecuteViPreviewOptions
): { outcome: 'ready'; commandPlan: ComparisonCommandPlan } | ViPreviewExecutionResult {
  const { runtime } = options;

  if (runtime.provider === 'host-native') {
    const labviewCliPath = runtime.labviewCliPath?.trim();
    if (!labviewCliPath) {
      return blocked('labview-cli-selection-incomplete');
    }

    const hostPlan = buildLabviewCliPrintToSingleFileHtmlPlan({
      viPath: path.join(options.workspaceDirectory, options.viFilename),
      outputHtmlPath: path.join(options.workspaceDirectory, options.outputFilename),
      additionalOperationDirectory: options.operationDirectory,
      labviewPath: runtime.labviewExePath,
      portNumber: runtime.portNumber,
      // LabVIEW preview rendering is ALWAYS headless, everywhere: the Docker/
      // container providers already force `-Headless`, and host-native must match
      // so the render never opens a LabVIEW GUI window (which orphans a process,
      // blocks a webview custom-editor capture, and diverges from how the
      // container image renders). Headless is mandatory for preview, not a
      // per-invocation choice. (VHS-REQ-659.)
      headless: true
    });

    return {
      outcome: 'ready',
      commandPlan: { executable: labviewCliPath, args: hostPlan.args }
    };
  }

  if (runtime.provider === 'linux-container') {
    const containerImage = runtime.containerImage?.trim();
    if (!containerImage) {
      return blocked('container-image-unavailable');
    }

    return {
      outcome: 'ready',
      commandPlan: buildLinuxContainerViPreviewCommandPlan({
        hostWorkspaceDirectory: options.workspaceDirectory,
        hostOperationDirectory: options.operationDirectory,
        containerImage,
        viFilename: options.viFilename,
        outputFilename: options.outputFilename,
        containerLabviewPath: runtime.containerLabviewPath,
        portNumber: runtime.portNumber,
        connectTimeoutSeconds: runtime.connectTimeoutSeconds
      })
    };
  }

  if (runtime.provider === 'windows-container') {
    const containerImage = runtime.containerImage?.trim();
    if (!containerImage) {
      return blocked('container-image-unavailable');
    }
    const hostPowerShellExecutable = runtime.windowsPowerShellHostExecutable?.trim();
    if (!hostPowerShellExecutable) {
      return blocked('windows-powershell-host-unavailable');
    }

    return {
      outcome: 'ready',
      commandPlan: buildWindowsContainerViPreviewCommandPlan({
        hostWorkspaceDirectory: options.workspaceDirectory,
        hostOperationDirectory: options.operationDirectory,
        containerImage,
        viFilename: options.viFilename,
        outputFilename: options.outputFilename,
        containerLabviewPath: runtime.containerLabviewPath,
        portNumber: runtime.portNumber,
        connectTimeoutSeconds: runtime.connectTimeoutSeconds,
        hostPowerShellExecutable
      })
    };
  }

  return blocked('unsupported-runtime-provider');
}

/**
 * Executes a single-VI preview render and classifies the outcome. The render is
 * a single-cycle timed loop: the command runs exactly once (host-native and
 * container providers alike) with no cold-launch retry. A nonzero exit carrying
 * the VI Server connectivity signature (`-350000`/`-350051`) is `failed` with
 * `labview-cli-connection-failed`; a nonzero exit carrying the operation-class
 * load signature (LabVIEW error 1125) is `labview-preview-operation-load-failed`
 * (the selected LabVIEW is likely too old); any other nonzero exit is
 * `command-exited-nonzero`; a zero exit that leaves no output document is
 * `preview-output-not-produced`; otherwise the produced HTML path is returned as
 * `rendered`.
 */
export async function executeViPreview(
  options: ExecuteViPreviewOptions,
  deps: ViPreviewExecutionDeps
): Promise<ViPreviewExecutionResult> {
  const planResult = buildViPreviewCommandPlan(options);
  if (planResult.outcome !== 'ready') {
    return planResult;
  }

  const { commandPlan } = planResult;
  const reportFilePath = path.join(options.workspaceDirectory, options.outputFilename);

  // The render runs the LabVIEWCLI command exactly once and surfaces its result
  // verbatim — there is no cold-launch retry. A VI Server connectivity failure
  // (`-350000`) is classified and returned as a genuine failure so an upstream
  // launch/connectivity problem is caught rather than masked by a warm retry.
  const isHostNative = options.runtime.provider === 'host-native';

  // VHS-REQ-669: serialize concurrent host-native launches that would contend
  // on the same local VI Server endpoint. Container/docker runs never acquire a
  // slot. The slot is released after the launch completes, success or failure.
  let releaseLocalViServerSlot: (() => void) | undefined;
  if (isHostNative) {
    const acquire =
      deps.acquireLocalViServerSlot ??
      ((key: string) => sharedLocalViServerAcquisitionLock.acquire(key));
    releaseLocalViServerSlot = await acquire(
      localViServerLockKey({
        provider: 'host-native',
        portNumber: options.runtime.portNumber
      })
    );
  }

  // VHS-REQ-669: measure this render as a single cycle (one attempt). The cycle
  // spans the LabVIEWCLI invocation itself (start → process close); the injected
  // meter (or a per-call meter) records its duration, index, and inter-cycle
  // latency.
  const cycleMeter = deps.cycleMeter ?? createCycleMeter();
  const cycleHandle = cycleMeter.startCycle();

  let run: RunViPreviewCommandResult = { exitCode: 0, stdout: '', stderr: '' };
  let cycle: CycleMeasurement;
  try {
    run = await deps.runCommand(commandPlan);
  } finally {
    releaseLocalViServerSlot?.();
  }
  const commandOutcome =
    run.exitCode === 0 ? 'command-succeeded' : classifyViPreviewFailureReason(run);
  cycle = cycleHandle.complete(commandOutcome);

  if (run.exitCode !== 0) {
    return {
      outcome: 'failed',
      failureReason: classifyViPreviewFailureReason(run),
      commandPlan,
      exitCode: run.exitCode,
      stdout: run.stdout,
      stderr: run.stderr,
      cycle
    };
  }

  if (!(await deps.pathExists(reportFilePath))) {
    return {
      outcome: 'failed',
      failureReason: 'preview-output-not-produced',
      commandPlan,
      exitCode: run.exitCode,
      stdout: run.stdout,
      stderr: run.stderr,
      cycle
    };
  }

  return {
    outcome: 'rendered',
    reportFilePath,
    commandPlan,
    exitCode: run.exitCode,
    stdout: run.stdout,
    stderr: run.stderr,
    cycle
  };
}
