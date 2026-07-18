import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { WindowsRegistryQueryPlan } from '../comparisonRuntimeLocator';

const execFileAsync = promisify(execFile);

/**
 * Pure Windows registry query runner extracted verbatim from comparisonRuntimeLocator.
 * `runWindowsRegistryQuery` executes a `reg query` plan through an injectable
 * `execFileRunner` (defaulting to a `promisify(execFile)` boundary with `windowsHide`
 * and a 1 MiB stdout cap) and returns the raw stdout for downstream candidate parsing.
 * Isolated from runtime-locator orchestration and re-exported to preserve the public API.
 *
 * Supporting VHS-REQ-634.
 */
export async function runWindowsRegistryQuery(
  plan: WindowsRegistryQueryPlan,
  execFileRunner: (
    file: string,
    args: readonly string[],
    options: { windowsHide: boolean; maxBuffer: number }
  ) => Promise<{ stdout: string }>
    = execFileAsync
): Promise<string> {
  const { stdout } = await execFileRunner(plan.command, plan.args, {
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  return stdout;
}
