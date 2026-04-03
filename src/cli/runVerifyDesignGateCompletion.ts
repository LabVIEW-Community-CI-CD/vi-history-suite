import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  assertCompletedPassingDesignGateReport,
  DesignGateReport,
  designGateReportJsonPath
} from '../tooling/designGate';

export interface VerifyDesignGateCompletionCliDeps {
  repoRoot?: string;
  readFile?: (filePath: string, encoding: BufferEncoding) => Promise<string>;
}

export function resolveVerifyDesignGateCompletionRepoRoot(
  dirnameValue: string = __dirname
): string {
  return path.resolve(dirnameValue, '..', '..');
}

export function reportVerifyDesignGateCompletionFailure(
  error: unknown,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): string {
  const message = error instanceof Error ? error.message : String(error);
  stderr.write(`${message}\n`);
  return message;
}

export async function verifyDesignGateCompletionCli(
  deps: VerifyDesignGateCompletionCliDeps = {}
): Promise<DesignGateReport> {
  const repoRoot = deps.repoRoot ?? resolveVerifyDesignGateCompletionRepoRoot();
  const reportPath = designGateReportJsonPath(repoRoot);
  const raw = await (deps.readFile ?? fs.readFile)(reportPath, 'utf8');
  const report = JSON.parse(raw) as DesignGateReport;
  assertCompletedPassingDesignGateReport(report);
  return report;
}

export async function verifyDesignGateCompletionCliMain(
  deps: VerifyDesignGateCompletionCliDeps = {},
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): Promise<number> {
  try {
    await verifyDesignGateCompletionCli(deps);
    return 0;
  } catch (error) {
    reportVerifyDesignGateCompletionFailure(error, stderr);
    return 1;
  }
}

export function applyVerifyDesignGateCompletionCliExitCode(
  exitCode: number,
  processLike: Pick<NodeJS.Process, 'exitCode'> = process
): number {
  processLike.exitCode = exitCode;
  return exitCode;
}

export function maybeRunVerifyDesignGateCompletionCliAsMain(
  mainModule: NodeModule | undefined = require.main,
  currentModule: NodeModule = module,
  deps: VerifyDesignGateCompletionCliDeps = {},
  processLike: Pick<NodeJS.Process, 'exitCode'> = process,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): boolean {
  if (mainModule !== currentModule) {
    return false;
  }

  void verifyDesignGateCompletionCliMain(deps, stderr).then((exitCode) => {
    applyVerifyDesignGateCompletionCliExitCode(exitCode, processLike);
  });
  return true;
}

maybeRunVerifyDesignGateCompletionCliAsMain();
