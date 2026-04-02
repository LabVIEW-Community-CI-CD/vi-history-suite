import * as path from 'node:path';

import { DesignGateReport } from '../tooling/designGate';
import { runDesignGate } from '../tooling/designGateRunner';

export interface RunDesignGateCliDeps {
  repoRoot?: string;
  runner?: (repoRoot: string) => Promise<DesignGateReport>;
}

export async function runDesignGateCli(
  deps: RunDesignGateCliDeps = {}
): Promise<DesignGateReport> {
  const repoRoot = deps.repoRoot ?? path.resolve(__dirname, '..', '..');
  const report = await (deps.runner ?? runDesignGate)(repoRoot);

  if (report.status !== 'pass') {
    throw new Error('design gate failed');
  }

  return report;
}

if (require.main === module) {
  void runDesignGateCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
