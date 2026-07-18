import * as path from 'node:path';

import { ComparisonCommandPlan } from '../comparisonReportPlan';
import {
  buildLabviewCliPrintToSingleFileHtmlPlan,
  buildLinuxContainerViPreviewCommandPlan,
  buildWindowsContainerViPreviewCommandPlan,
  VI_PREVIEW_RETRY_DELAY_SECONDS,
  VI_PREVIEW_STARTUP_RETRY_COUNT
} from './viPreviewCommandPlan';

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
   * Optional delay between host-native cold-launch retries (milliseconds).
   * Injected in tests so retries do not actually wait; defaults to a real timer.
   */
  sleep?: (milliseconds: number) => Promise<void>;
}

/**
 * Cold-launch VI Server connectivity failure signature, shared with the
 * container retry scripts (`buildLinuxContainerViPreviewScript` /
 * `buildWindowsContainerViPreviewScript`) and the comparison-runtime classifier:
 * LabVIEWCLI exits nonzero because it could not connect to the just-launched
 * headless LabVIEW's VI Server (`-350000`/`-350051`). An immediate warm retry
 * usually succeeds once LabVIEW finishes coming up.
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

const defaultViPreviewSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

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
      headless: runtime.headless ?? false
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
 * Executes a single-VI preview render and classifies the outcome. For the
 * host-native provider a cold-launch VI Server connectivity failure
 * (`-350000`/`-350051`) is retried up to `VI_PREVIEW_STARTUP_RETRY_COUNT` times
 * (the container providers retry in-script). A nonzero exit that still carries
 * the connectivity signature is `failed` with `labview-cli-connection-failed`;
 * a nonzero exit carrying the operation-class load signature (LabVIEW error
 * 1125) is `labview-preview-operation-load-failed` (the selected LabVIEW is
 * likely too old); any other nonzero exit is `command-exited-nonzero`; a zero
 * exit that leaves no output document is `preview-output-not-produced`;
 * otherwise the produced HTML path is returned as `rendered`.
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

  // The container providers retry the cold-launch `-350000` VI Server race
  // inside their bash/PowerShell scripts, so a single `runCommand` already
  // covers them. Host-native runs LabVIEWCLI directly with no shell wrapper, so
  // the orchestrator applies the same retry budget here: rerun on the
  // connectivity signature until the just-launched LabVIEW's VI Server is
  // reachable (a warm retry after a slow cold launch).
  const maxAttempts =
    options.runtime.provider === 'host-native'
      ? Math.max(1, 1 + VI_PREVIEW_STARTUP_RETRY_COUNT)
      : 1;
  const sleep = deps.sleep ?? defaultViPreviewSleep;

  let run: RunViPreviewCommandResult = { exitCode: 0, stdout: '', stderr: '' };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    run = await deps.runCommand(commandPlan);
    if (run.exitCode === 0) {
      break;
    }
    if (attempt < maxAttempts && isViPreviewConnectivityFailure(run)) {
      await sleep(VI_PREVIEW_RETRY_DELAY_SECONDS * 1000);
      continue;
    }
    break;
  }

  if (run.exitCode !== 0) {
    return {
      outcome: 'failed',
      failureReason: classifyViPreviewFailureReason(run),
      commandPlan,
      exitCode: run.exitCode,
      stdout: run.stdout,
      stderr: run.stderr
    };
  }

  if (!(await deps.pathExists(reportFilePath))) {
    return {
      outcome: 'failed',
      failureReason: 'preview-output-not-produced',
      commandPlan,
      exitCode: run.exitCode,
      stdout: run.stdout,
      stderr: run.stderr
    };
  }

  return {
    outcome: 'rendered',
    reportFilePath,
    commandPlan,
    exitCode: run.exitCode,
    stdout: run.stdout,
    stderr: run.stderr
  };
}
