import * as path from 'node:path';

import {
  HarnessReportSmokeOptions,
  HarnessReportSmokeReport,
  runHarnessReportSmoke
} from '../harness/harnessReportSmoke';
import { RuntimePlatform } from '../reporting/comparisonRuntimeLocator';

export interface HarnessReportSmokeCliArgs {
  harnessId: string;
  strictRsrcHeader: boolean;
  helpRequested: boolean;
  runtimePlatform?: RuntimePlatform;
  preferBitness?: 'auto' | 'x86' | 'x64';
  labviewCliPath?: string;
  labviewExePath?: string;
  lvComparePath?: string;
}

export interface HarnessReportSmokeCliDeps {
  repoRoot?: string;
  runner?: (
    harnessId: string,
    options: HarnessReportSmokeOptions
  ) => Promise<{
    report: HarnessReportSmokeReport;
    reportJsonPath: string;
    reportMarkdownPath: string;
    reportHtmlPath: string;
  }>;
  stdout?: { write(text: string): void };
}

export function getHarnessReportSmokeUsage(): string {
  return [
    'Usage: runHarnessReportSmoke [--harness-id <id>] [--strict-rsrc-header] [--platform <win32|linux|darwin>] [--prefer-bitness <auto|x86|x64>] [--labview-cli-path <path>] [--labview-exe-path <path>] [--lvcompare-path <path>] [--help]',
    '',
    'Options:',
    '  --harness-id <id>         Select the canonical harness to run.',
    '  --strict-rsrc-header      Require RSRC header validation during VI detection.',
    '  --platform <value>        Override runtime detection platform for report-tool selection.',
    '  --prefer-bitness <value>  Set runtime bitness preference for report-tool selection.',
    '  --labview-cli-path <path> Provide an explicit LabVIEWCLI path for report-tool selection.',
    '  --labview-exe-path <path> Provide an explicit LabVIEW executable path for report-tool selection.',
    '  --lvcompare-path <path>   Provide an explicit LVCompare path for report-tool selection.',
    '  --help                    Print this help and exit without running the harness.'
  ].join('\n');
}

export function parseHarnessReportSmokeArgs(argv: string[]): HarnessReportSmokeCliArgs {
  let harnessId = 'HARNESS-VHS-001';
  let strictRsrcHeader = false;
  let helpRequested = false;
  let runtimePlatform: RuntimePlatform | undefined;
  let preferBitness: 'auto' | 'x86' | 'x64' | undefined;
  let labviewCliPath: string | undefined;
  let labviewExePath: string | undefined;
  let lvComparePath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    const requireValue = (flag: string): string => {
      const candidate = argv[index + 1];
      if (!candidate || candidate.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.\n\n${getHarnessReportSmokeUsage()}`);
      }

      index += 1;
      return candidate;
    };

    if (current === '--harness-id') {
      harnessId = requireValue('--harness-id');
      continue;
    }

    if (current === '--strict-rsrc-header') {
      strictRsrcHeader = true;
      continue;
    }

    if (current === '--platform') {
      const candidate = requireValue('--platform');
      if (candidate !== 'win32' && candidate !== 'linux' && candidate !== 'darwin') {
        throw new Error(`Unsupported value for --platform: ${candidate}\n\n${getHarnessReportSmokeUsage()}`);
      }

      runtimePlatform = candidate;
      continue;
    }

    if (current === '--prefer-bitness') {
      const candidate = requireValue('--prefer-bitness');
      if (candidate !== 'auto' && candidate !== 'x86' && candidate !== 'x64') {
        throw new Error(`Unsupported value for --prefer-bitness: ${candidate}\n\n${getHarnessReportSmokeUsage()}`);
      }

      preferBitness = candidate;
      continue;
    }

    if (current === '--labview-cli-path') {
      labviewCliPath = requireValue('--labview-cli-path');
      continue;
    }

    if (current === '--labview-exe-path') {
      labviewExePath = requireValue('--labview-exe-path');
      continue;
    }

    if (current === '--lvcompare-path') {
      lvComparePath = requireValue('--lvcompare-path');
      continue;
    }

    if (current === '--help' || current === '-h') {
      helpRequested = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n\n${getHarnessReportSmokeUsage()}`);
  }

  return {
    harnessId,
    strictRsrcHeader,
    helpRequested,
    runtimePlatform,
    preferBitness,
    labviewCliPath,
    labviewExePath,
    lvComparePath
  };
}

export async function runHarnessReportSmokeCli(
  argv: string[],
  deps: HarnessReportSmokeCliDeps = {}
): Promise<'pass' | 'help'> {
  const args = parseHarnessReportSmokeArgs(argv);
  const stdout = deps.stdout ?? process.stdout;

  if (args.helpRequested) {
    stdout.write(`${getHarnessReportSmokeUsage()}\n`);
    return 'help';
  }

  const repoRoot = deps.repoRoot ?? path.resolve(__dirname, '..', '..');
  const cloneRoot = path.resolve(repoRoot, '.cache', 'harnesses');
  const reportRoot = path.resolve(repoRoot, '.cache', 'harness-reports');

  const result = await (deps.runner ?? runHarnessReportSmoke)(args.harnessId, {
    cloneRoot,
    reportRoot,
    strictRsrcHeader: args.strictRsrcHeader,
    runtimePlatform: args.runtimePlatform,
    runtimeSettings: {
      preferBitness: args.preferBitness,
      labviewCliPath: args.labviewCliPath,
      labviewExePath: args.labviewExePath,
      lvComparePath: args.lvComparePath
    }
  });

  for (const line of formatHarnessReportSmokeSuccess(result, args.harnessId)) {
    stdout.write(`${line}\n`);
  }

  return 'pass';
}

export function formatHarnessReportSmokeSuccess(
  result: {
    report: HarnessReportSmokeReport;
    reportJsonPath: string;
    reportMarkdownPath: string;
    reportHtmlPath: string;
  },
  harnessId: string
): string[] {
  return [
    `Harness report smoke completed for ${harnessId}`,
    `JSON: ${result.reportJsonPath}`,
    `Markdown: ${result.reportMarkdownPath}`,
    `HTML: ${result.reportHtmlPath}`,
    `Report status: ${result.report.reportStatus}`,
    `Runtime execution: ${result.report.runtimeExecutionState}`,
    `Generated report exists: ${result.report.generatedReportExists ? 'yes' : 'no'}`
  ];
}

export async function runHarnessReportSmokeCliMain(
  argv: string[] = process.argv.slice(2),
  deps: HarnessReportSmokeCliDeps = {},
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): Promise<number> {
  try {
    await runHarnessReportSmokeCli(argv, deps);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export function applyHarnessReportSmokeCliExitCode(
  exitCode: number,
  processLike: Pick<NodeJS.Process, 'exitCode'> = process
): number {
  processLike.exitCode = exitCode;
  return exitCode;
}

export function maybeRunHarnessReportSmokeCliAsMain(
  argv: string[] = process.argv.slice(2),
  mainModule: NodeModule | undefined = require.main,
  currentModule: NodeModule = module,
  deps: HarnessReportSmokeCliDeps = {},
  processLike: Pick<NodeJS.Process, 'exitCode'> = process,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): boolean {
  if (mainModule !== currentModule) {
    return false;
  }

  void runHarnessReportSmokeCliMain(argv, deps, stderr).then((exitCode) => {
    applyHarnessReportSmokeCliExitCode(exitCode, processLike);
  });
  return true;
}

maybeRunHarnessReportSmokeCliAsMain();
