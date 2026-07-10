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
import { buildViPreviewRenderDeps } from './viPreviewRenderHost';

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

/** Container runtime that can host a warm preview session. */
export type ViPreviewSessionProvider = 'linux-container' | 'windows-container';

export interface StartViPreviewSessionOptions {
  containerImage: string;
  containerLabviewPath?: string;
  operationDirectory: string;
  cache?: ViPreviewCache;
  connectTimeoutSeconds?: number;
  /** Container runtime provider for the session. Defaults to linux-container. */
  provider?: ViPreviewSessionProvider;
}

async function docker(
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('docker', args, {
      timeout: EXEC_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER_BYTES
    });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string; message?: string };
    return {
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? failure.message ?? String(error)
    };
  }
}

/** Starts a warm preview container session, hardening VI Server once up. */
export async function startViPreviewSession(
  options: StartViPreviewSessionOptions
): Promise<ViPreviewSession> {
  const sessionRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-vi-preview-session-'));
  const containerName = `vihs-vi-preview-${randomBytes(6).toString('hex')}`;
  const provider: ViPreviewSessionProvider = options.provider ?? 'linux-container';

  const started = await docker(
    provider === 'windows-container'
      ? buildWindowsContainerSessionStartArgs({
          containerName,
          containerImage: options.containerImage,
          hostSessionRoot: sessionRoot,
          hostOperationDirectory: options.operationDirectory
        })
      : buildLinuxContainerSessionStartArgs({
          containerName,
          containerImage: options.containerImage,
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
            containerImage: options.containerImage,
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
