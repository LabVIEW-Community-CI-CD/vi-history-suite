import * as path from 'node:path';

import {
  HarnessSmokeOptions,
  runHarnessSmoke,
  HarnessSmokeReport
} from '../harness/harnessSmoke';
import { maybeRejectGovernedProofLegacyEntrypointAsMain } from './governedProofLegacyEntrypoint';

export interface HarnessSmokeCliArgs {
  harnessId: string;
  strictRsrcHeader: boolean;
  helpRequested: boolean;
}

export interface HarnessSmokeCliDeps {
  repoRoot?: string;
  runner?: (
    harnessId: string,
    options: HarnessSmokeOptions
  ) => Promise<{
    report: HarnessSmokeReport;
    reportJsonPath: string;
    reportMarkdownPath: string;
    reportHtmlPath: string;
  }>;
  stdout?: { write(text: string): void };
}

export function getHarnessSmokeUsage(): string {
  return [
    'Usage: runHarnessSmoke [--harness-id <id>] [--strict-rsrc-header] [--help]',
    '',
    'Options:',
    '  --harness-id <id>       Select the canonical harness to run.',
    '  --strict-rsrc-header    Require RSRC header validation during VI detection.',
    '  --help                  Print this help and exit without running the harness.'
  ].join('\n');
}

export function parseHarnessSmokeArgs(argv: string[]): HarnessSmokeCliArgs {
  let harnessId = 'HARNESS-VHS-001';
  let strictRsrcHeader = false;
  let helpRequested = false;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--harness-id') {
      const candidate = argv[index + 1];
      if (!candidate || candidate.startsWith('--')) {
        throw new Error(
          `Missing value for --harness-id.\n\n${getHarnessSmokeUsage()}`
        );
      }

      harnessId = candidate;
      index += 1;
      continue;
    }

    if (current === '--strict-rsrc-header') {
      strictRsrcHeader = true;
      continue;
    }

    if (current === '--help' || current === '-h') {
      helpRequested = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n\n${getHarnessSmokeUsage()}`);
  }

  return { harnessId, strictRsrcHeader, helpRequested };
}

export async function runHarnessSmokeCli(
  argv: string[],
  deps: HarnessSmokeCliDeps = {}
): Promise<'pass' | 'help'> {
  const args = parseHarnessSmokeArgs(argv);
  const stdout = deps.stdout ?? process.stdout;

  if (args.helpRequested) {
    stdout.write(`${getHarnessSmokeUsage()}\n`);
    return 'help';
  }

  const repoRoot = deps.repoRoot ?? path.resolve(__dirname, '..', '..');
  const cloneRoot = path.resolve(repoRoot, '.cache', 'harnesses');
  const reportRoot = path.resolve(repoRoot, '.cache', 'harness-reports');

  const result = await (deps.runner ?? runHarnessSmoke)(args.harnessId, {
    cloneRoot,
    reportRoot,
    strictRsrcHeader: args.strictRsrcHeader
  });

  for (const line of formatHarnessSmokeSuccess(result, args.harnessId)) {
    stdout.write(`${line}\n`);
  }

  return 'pass';
}

export function formatHarnessSmokeSuccess(
  result: {
    report: HarnessSmokeReport;
    reportJsonPath: string;
    reportMarkdownPath: string;
    reportHtmlPath: string;
  },
  harnessId: string
): string[] {
  return [
    `Harness smoke completed for ${harnessId}`,
    `JSON: ${result.reportJsonPath}`,
    `Markdown: ${result.reportMarkdownPath}`,
    `HTML: ${result.reportHtmlPath}`,
    `Eligible: ${result.report.eligible ? 'yes' : 'no'}`,
    `Signature: ${result.report.signature}`,
    `Commit count: ${result.report.commitCount}`
  ];
}

export async function runHarnessSmokeCliMain(
  argv: string[] = process.argv.slice(2),
  deps: HarnessSmokeCliDeps = {},
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): Promise<number> {
  try {
    await runHarnessSmokeCli(argv, deps);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export function applyHarnessSmokeCliExitCode(
  exitCode: number,
  processLike: Pick<NodeJS.Process, 'exitCode'> = process
): number {
  processLike.exitCode = exitCode;
  return exitCode;
}

export function maybeRunHarnessSmokeCliAsMain(
  argv: string[] = process.argv.slice(2),
  mainModule: NodeModule | undefined = require.main,
  currentModule: NodeModule = module,
  deps: HarnessSmokeCliDeps = {},
  processLike: Pick<NodeJS.Process, 'exitCode'> = process,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): boolean {
  if (mainModule !== currentModule) {
    return false;
  }

  void argv;
  void deps;
  return maybeRejectGovernedProofLegacyEntrypointAsMain(
    'smoke',
    mainModule,
    currentModule,
    processLike,
    stderr
  );
}

maybeRunHarnessSmokeCliAsMain();
