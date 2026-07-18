/**
 * Git prerequisite detection (VHS-REQ-619).
 *
 * Probes `git --version` once per session via an injectable command runner so
 * the result can be cached in extension memory and re-used by the status bar,
 * the first-run notice, and the `labviewViHistory.open` gate without paying
 * the spawn cost on every call.
 */

import { spawn } from 'node:child_process';

import { errorMessage } from '../support/errorMessage';

/**
 * Reason a Git probe came back negative. Distinguishing "not on PATH" from
 * "spawn failed unexpectedly" lets the UX explain itself precisely.
 */
export type GitMissingReason = 'not-found' | 'probe-failed';

export interface GitAvailable {
  readonly available: true;
  readonly version: string;
}

export interface GitUnavailable {
  readonly available: false;
  readonly reason: GitMissingReason;
  readonly errorMessage?: string;
}

export type GitPrerequisiteDetection = GitAvailable | GitUnavailable;

export interface GitProbeResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface GitPrerequisiteDetectDeps {
  /**
   * Runs `git --version` and yields the captured exit code plus stdio. The
   * default uses `child_process.spawn`. Tests inject a deterministic stub.
   */
  readonly runGitVersion?: () => Promise<GitProbeResult>;
}

const GIT_PROBE_TIMEOUT_MS = 5_000;

/**
 * Build the default `git --version` probe over an injectable `spawn`. The
 * internal spawn is a parameter so the timeout / spawn-throw / child-error /
 * close branches can be unit-tested with a fake child process, matching the
 * dependency-injected-boundary convention used elsewhere in the codebase.
 */
export function createRunGitVersion(
  spawnImpl: typeof spawn = spawn
): () => Promise<GitProbeResult> {
  return () =>
    new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;

      let child: ReturnType<typeof spawn>;
      try {
        child = spawnImpl('git', ['--version'], {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });
      } catch (error) {
        reject(error);
        return;
      }

      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          child.kill();
        } catch {
          // ignore
        }
        reject(new Error('git --version timed out'));
      }, GIT_PROBE_TIMEOUT_MS);

      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        reject(error);
      });
      child.on('close', (exitCode) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve({ exitCode, stdout, stderr });
      });
    });
}

const defaultRunGitVersion = createRunGitVersion();

/**
 * Parse `git --version` stdout into a normalized version string. Returns
 * `undefined` if the output is not recognized.
 */
export function parseGitVersionOutput(stdout: string): string | undefined {
  const match = /git version\s+(\S+)/i.exec(stdout);
  return match?.[1];
}

/**
 * Probe Git availability once. Resolves to a discriminated union so the caller
 * can branch on the `available` flag without losing the underlying error
 * details.
 */
export async function detectGitPrerequisite(
  deps: GitPrerequisiteDetectDeps = {}
): Promise<GitPrerequisiteDetection> {
  const runGitVersion = deps.runGitVersion ?? defaultRunGitVersion;

  let result: GitProbeResult;
  try {
    result = await runGitVersion();
  } catch (error) {
    const message = errorMessage(error);
    return {
      available: false,
      reason: looksLikeNotFound(message) ? 'not-found' : 'probe-failed',
      errorMessage: message
    };
  }

  if (result.exitCode !== 0) {
    return {
      available: false,
      reason: 'probe-failed',
      errorMessage: result.stderr.trim() || `git --version exit code ${result.exitCode}`
    };
  }

  const version = parseGitVersionOutput(result.stdout);
  if (!version) {
    return {
      available: false,
      reason: 'probe-failed',
      errorMessage: `Unexpected git --version output: ${result.stdout.trim()}`
    };
  }

  return { available: true, version };
}

function looksLikeNotFound(message: string): boolean {
  return /ENOENT|not\s+recognized|not found|cannot find/i.test(message);
}
