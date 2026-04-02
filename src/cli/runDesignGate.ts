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

if (require.main === module) {
  void runDesignGateCli().catch((error) => {
    reportRunDesignGateCliFailure(error);
    process.exitCode = 1;
  });
}
