import * as path from 'node:path';

import { ComparisonCommandPlan } from '../comparisonReportPlan';
import {
  buildLabviewCliPrintToSingleFileHtmlPlan,
  buildLinuxContainerViPreviewCommandPlan,
  buildWindowsContainerViPreviewCommandPlan
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
  | 'command-exited-nonzero'
  | 'preview-output-not-produced';

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
 * Executes a single-VI preview render and classifies the outcome. A nonzero
 * exit is `failed` with `command-exited-nonzero`; a zero exit that leaves no
 * output document is `failed` with `preview-output-not-produced`; otherwise the
 * produced HTML path is returned as `rendered`.
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
  const run = await deps.runCommand(commandPlan);

  if (run.exitCode !== 0) {
    return {
      outcome: 'failed',
      failureReason: 'command-exited-nonzero',
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
