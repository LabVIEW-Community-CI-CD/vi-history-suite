import * as path from 'node:path';

import { DesignGateReport } from '../tooling/designGate';
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

  if (report.status !== 'pass') {
    throw new Error('design gate failed');
  }

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

if (require.main === module) {
  void runDesignGateCliMain().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
