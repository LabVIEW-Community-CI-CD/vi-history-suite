import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import type { ViPreviewCache } from '../reporting/viPreview/viPreviewCache';
import {
  buildLinuxContainerExecViPreviewCommandPlan,
  buildLinuxContainerSessionHardenScript,
  buildLinuxContainerSessionStartArgs,
  buildWindowsContainerExecViPreviewCommandPlan,
  buildWindowsContainerSessionHardenCommandPlan,
  buildWindowsContainerSessionStartArgs
} from '../reporting/viPreview/viPreviewCommandPlan';
import {
  renderViPreviewForFile,
  type RenderViPreviewForFileResult
} from '../reporting/viPreview/viPreviewFileRender';
import type { ViPreviewExecutionResult } from '../reporting/viPreview/viPreviewExecution';
import {
  selectLaunchedLabviewPid,
  type ViPreviewSessionProvider
} from '../reporting/viPreview/viPreviewSessionRuntime';
import { buildViPreviewRenderDeps } from './viPreviewRenderHost';
import { runExecFileText } from '../tooling/execFileText';

/**
 * VHS-REQ-659: warm LabVIEW container session for fast preview rendering.
 *
 * Starts one detached container whose LabVIEW stays resident between renders, so
 * the first render pays the cold launch (~30s) and every subsequent `docker
 * exec` render connects to the live VI Server in seconds. The shared workspace
 * root is bind-mounted once; each render stages into a fresh subdirectory under
 * it (reusing `renderViPreviewForFile`'s staging + cache) and runs via a
 * `docker exec` executor. The container and its scratch are removed on dispose.
 *
 * This is VS Code-independent host glue (child_process + fs) so it can be
 * reused by both the editor and the background warmer.
 */

const EXEC_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BUFFER_BYTES = 16 * 1024 * 1024;

const execFileAsync = promisify(execFile);

export interface ViPreviewSession {
  renderVi(viFilePath: string): Promise<RenderViPreviewForFileResult>;
  dispose(): Promise<void>;
}

export interface StartViPreviewSessionOptions {
  /** Session provider. Defaults to linux-container. */
  provider?: ViPreviewSessionProvider;
  operationDirectory: string;
  cache?: ViPreviewCache;
  connectTimeoutSeconds?: number;
  /** Container image (container providers). */
  containerImage?: string;
  /** In-container LabVIEW executable (container providers). */
  containerLabviewPath?: string;
  /** Host LabVIEWCLI executable (host-native). */
  labviewCliPath?: string;
  /** Host `-LabVIEWPath` value (host-native). */
  labviewExePath?: string;
  /** VI Server port (host-native). */
  portNumber?: number;
}

async function docker(
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return runExecFileText('docker', args, {
    timeoutMs: EXEC_TIMEOUT_MS,
    maxBufferBytes: MAX_BUFFER_BYTES
  });
}

/** Starts a warm preview container session, hardening VI Server once up. */
export async function startViPreviewSession(
  options: StartViPreviewSessionOptions
): Promise<ViPreviewSession> {
  const provider: ViPreviewSessionProvider = options.provider ?? 'linux-container';
  if (provider === 'host-native') {
    return startHostViPreviewSession(options);
  }
  const containerImage = options.containerImage;
  if (!containerImage) {
    throw new Error('startViPreviewSession requires a containerImage for container providers');
  }
  const sessionRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-vi-preview-session-'));
  const containerName = `vihs-vi-preview-${randomBytes(6).toString('hex')}`;

  const started = await docker(
    provider === 'windows-container'
      ? buildWindowsContainerSessionStartArgs({
          containerName,
          containerImage,
          hostSessionRoot: sessionRoot,
          hostOperationDirectory: options.operationDirectory
        })
      : buildLinuxContainerSessionStartArgs({
          containerName,
          containerImage,
          hostSessionRoot: sessionRoot,
          hostOperationDirectory: options.operationDirectory
        })
  );
  if (started.exitCode !== 0) {
    await fs.rm(sessionRoot, { recursive: true, force: true }).catch(() => undefined);
    throw new Error(`Failed to start VI preview container session: ${started.stderr}`);
  }

  // Harden the VI Server config once for the whole session.
  await docker(
    provider === 'windows-container'
      ? buildWindowsContainerSessionHardenCommandPlan({
          containerName,
          connectTimeoutSeconds: options.connectTimeoutSeconds
        }).args
      : [
          'exec',
          containerName,
          'bash',
          '-lc',
          buildLinuxContainerSessionHardenScript({
            containerLabviewPath: options.containerLabviewPath,
            connectTimeoutSeconds: options.connectTimeoutSeconds
          })
        ]
  ).catch(() => undefined);

  const baseDeps = buildViPreviewRenderDeps(options.cache);
  let disposed = false;

  const execute = async (
    workspaceDirectory: string,
    viFilename: string,
    outputFilename: string
  ): Promise<ViPreviewExecutionResult> => {
    const commandPlan =
      provider === 'windows-container'
        ? buildWindowsContainerExecViPreviewCommandPlan({
            containerName,
            workspaceSubdirectory: path.basename(workspaceDirectory),
            viFilename,
            outputFilename,
            containerLabviewPath: options.containerLabviewPath
          })
        : buildLinuxContainerExecViPreviewCommandPlan({
            containerName,
            workspaceSubdirectory: path.basename(workspaceDirectory),
            viFilename,
            outputFilename,
            containerLabviewPath: options.containerLabviewPath,
            connectTimeoutSeconds: options.connectTimeoutSeconds
          });
    const run = await docker(commandPlan.args);
    const reportFilePath = path.join(workspaceDirectory, outputFilename);
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
    let produced = false;
    try {
      await fs.access(reportFilePath);
      produced = true;
    } catch {
      produced = false;
    }
    if (!produced) {
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
  };

  return {
    async renderVi(viFilePath: string): Promise<RenderViPreviewForFileResult> {
      return renderViPreviewForFile(
        {
          runtime: {
            provider,
            containerImage,
            containerLabviewPath: options.containerLabviewPath,
            connectTimeoutSeconds: options.connectTimeoutSeconds
          },
          viFilePath,
          operationDirectory: options.operationDirectory
        },
        {
          ...baseDeps,
          // Stage each render into a subdirectory of the bind-mounted session
          // root so the running container sees it without a new mount.
          createWorkspaceDirectory: () => fs.mkdtemp(path.join(sessionRoot, 'render-')),
          execute
        }
      );
    },
    async dispose(): Promise<void> {
      if (disposed) {
        return;
      }
      disposed = true;
      await docker(['rm', '-f', containerName]).catch(() => undefined);
      await fs.rm(sessionRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  };
}

// --- Host-native warm session (VHS-REQ-659) ------------------------------------
// A resident host LabVIEW warm session. LabVIEWCLI launches LabVIEW headless on
// the first render; that LabVIEW stays resident and every later render reuses it
// via VI Server (~7x faster than a cold launch). No container/keep-alive is
// needed. On dispose only the LabVIEW instances that appeared during this session
// are force-killed — a pre-existing user LabVIEW is never touched. PID tracking
// uses PowerShell, so this session is used on Windows hosts (see
// `toViPreviewSessionRuntime`); other hosts render per-invocation.

const HOST_PID_QUERY_TIMEOUT_MS = 30 * 1000;

/** Lists running host `LabVIEW.exe` PIDs (Windows). Returns `[]` on any failure. */
async function listHostLabviewPids(): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        '@(Get-Process LabVIEW -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }) -join ","'
      ],
      { timeout: HOST_PID_QUERY_TIMEOUT_MS, maxBuffer: MAX_BUFFER_BYTES }
    );
    return stdout
      .trim()
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

/** Force-kills the given PIDs (Windows). Best-effort. */
async function killHostPids(pids: readonly number[]): Promise<void> {
  if (pids.length === 0) {
    return;
  }
  await execFileAsync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Stop-Process -Id ${pids.join(',')} -Force -ErrorAction SilentlyContinue`
    ],
    { timeout: HOST_PID_QUERY_TIMEOUT_MS, maxBuffer: MAX_BUFFER_BYTES }
  ).catch(() => undefined);
}

async function startHostViPreviewSession(
  options: StartViPreviewSessionOptions
): Promise<ViPreviewSession> {
  const labviewCliPath = options.labviewCliPath?.trim();
  if (!labviewCliPath) {
    throw new Error('startViPreviewSession requires a labviewCliPath for the host-native provider');
  }
  // LabVIEW instances present before we start are the user's; never reclaim them.
  const basePids = await listHostLabviewPids();
  let firstRenderComplete = false;
  let launchedPid: number | undefined;
  const baseDeps = buildViPreviewRenderDeps(options.cache);
  let disposed = false;

  const runtime = {
    provider: 'host-native' as const,
    labviewCliPath,
    labviewExePath: options.labviewExePath,
    portNumber: options.portNumber,
    // A warm session renders headless so repeated interactive/background renders
    // never pop a LabVIEW GUI on the user's desktop.
    headless: true
  };

  return {
    async renderVi(viFilePath: string): Promise<RenderViPreviewForFileResult> {
      const result = await renderViPreviewForFile(
        { runtime, viFilePath, operationDirectory: options.operationDirectory },
        baseDeps
      );
      // Decide ownership exactly once, from the first render, and only reclaim a
      // LabVIEW we are certain LabVIEWCLI launched (see selectLaunchedLabviewPid):
      // none was running at session start AND exactly one new instance appeared.
      // Reusing a user's LabVIEW or any ambiguity (e.g. the user launched LabVIEW
      // concurrently or between renders) owns nothing, so dispose never
      // force-kills a process the user may have started.
      if (!firstRenderComplete) {
        firstRenderComplete = true;
        launchedPid = selectLaunchedLabviewPid(basePids, await listHostLabviewPids());
      }
      return result;
    },
    async dispose(): Promise<void> {
      if (disposed) {
        return;
      }
      disposed = true;
      if (launchedPid === undefined) {
        return;
      }
      const running = new Set(await listHostLabviewPids());
      if (running.has(launchedPid)) {
        await killHostPids([launchedPid]);
      }
    }
  };
}
