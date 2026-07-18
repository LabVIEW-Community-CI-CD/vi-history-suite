import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Shared structured execFile text runner for the preview/render + verify code
// paths (supporting VHS-REQ-659). Several call sites wrapped `promisify(execFile)`
// with the identical try/catch that maps success to `{ exitCode: 0, stdout,
// stderr }` and any failure to `{ exitCode, stdout, stderr }` WITHOUT throwing
// (so the caller inspects the exit code). This centralizes that mapping while
// leaving each caller its own timeout/maxBuffer budget. The bespoke spawn state
// machines (git/docker probes with kill-on-timeout) are intentionally NOT folded
// in here — their success/failure semantics differ per call site.

export interface ExecFileTextResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// The minimal promisified-execFile surface this helper depends on. Injectable so
// callers/tests can substitute a fake without spawning a real process.
export type ExecFileTextRunner = (
  file: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer: number }
) => Promise<{ stdout: string; stderr: string }>;

export interface RunExecFileTextOptions {
  timeoutMs: number;
  maxBufferBytes: number;
  execFileAsync?: ExecFileTextRunner;
}

const defaultExecFileAsync = promisify(execFile) as unknown as ExecFileTextRunner;

// Run an executable and capture its text stdout/stderr, mapping the result to a
// structured `{ exitCode, stdout, stderr }` value. Never throws: a non-zero exit
// or spawn error is returned as a non-zero `exitCode` with best-effort stdout and
// a stderr that falls back to the error message. Byte-for-byte preserves the
// prior inline wrappers (exitCode defaults to 1 when the failure code is not a
// number; stderr falls back to `failure.message` then `String(error)`).
export async function runExecFileText(
  executable: string,
  args: readonly string[],
  options: RunExecFileTextOptions
): Promise<ExecFileTextResult> {
  const exec = options.execFileAsync ?? defaultExecFileAsync;
  try {
    const { stdout, stderr } = await exec(executable, args, {
      timeout: options.timeoutMs,
      maxBuffer: options.maxBufferBytes
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
