import * as path from 'node:path';

import {
  assertCompletedPassingDesignGateReport,
  DesignGateReport
} from '../tooling/designGate';
import { runDesignGate } from '../tooling/designGateRunner';

export interface RunDesignGateCliDeps {
  repoRoot?: string;
  runner?: (repoRoot: string) => Promise<DesignGateReport>;
}

export function resolveRunDesignGateRepoRoot(dirnameValue: string = __dirname): string {
  return path.resolve(dirnameValue, '..', '..');
}

export function reportRunDesignGateCliFailure(
  error: unknown,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): string {
  const message = error instanceof Error ? error.message : String(error);
  stderr.write(`${message}\n`);
  return message;
}

export async function runDesignGateCli(
  deps: RunDesignGateCliDeps = {}
): Promise<DesignGateReport> {
  const repoRoot = deps.repoRoot ?? resolveRunDesignGateRepoRoot();
  const report = await (deps.runner ?? runDesignGate)(repoRoot);
  assertCompletedPassingDesignGateReport(report);

  return report;
}

export async function runDesignGateCliMain(
  deps: RunDesignGateCliDeps = {},
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): Promise<number> {
  try {
    await runDesignGateCli(deps);
    return 0;
  } catch (error) {
    reportRunDesignGateCliFailure(error, stderr);
    return 1;
  }
}

export function applyRunDesignGateCliExitCode(
  exitCode: number,
  processLike: Pick<NodeJS.Process, 'exitCode'> = process
): number {
  processLike.exitCode = exitCode;
  return exitCode;
}

export function maybeRunDesignGateCliAsMain(
  mainModule: NodeModule | undefined = require.main,
  currentModule: NodeModule = module,
  deps: RunDesignGateCliDeps = {},
  processLike: Pick<NodeJS.Process, 'exitCode'> = process,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): boolean {
  if (mainModule !== currentModule) {
    return false;
  }

  void runDesignGateCliMain(deps, stderr).then((exitCode) => {
    applyRunDesignGateCliExitCode(exitCode, processLike);
  });
  return true;
}

maybeRunDesignGateCliAsMain();
