import * as path from 'node:path';

import {
  HarnessDashboardSmokeOptions,
  HarnessDashboardSmokeReport,
  runHarnessDashboardSmoke
} from '../harness/harnessDashboardSmoke';
import { ComparisonRuntimeEngine, RuntimePlatform } from '../reporting/comparisonRuntimeLocator';

export interface HarnessDashboardSmokeCliArgs {
  harnessId: string;
  strictRsrcHeader: boolean;
  helpRequested: boolean;
  runtimePlatform?: RuntimePlatform;
  runtimeEngineOverride?: ComparisonRuntimeEngine;
  preferBitness?: 'auto' | 'x86' | 'x64';
  labviewCliPath?: string;
  labviewExePath?: string;
  lvComparePath?: string;
  dashboardCommitWindow?: number;
}

export interface HarnessDashboardSmokeCliDeps {
  repoRoot?: string;
  runner?: (
    harnessId: string,
    options: HarnessDashboardSmokeOptions
  ) => Promise<{
    report: HarnessDashboardSmokeReport;
    reportJsonPath: string;
    reportMarkdownPath: string;
    reportHtmlPath: string;
  }>;
  stdout?: { write(text: string): void };
}

export function getHarnessDashboardSmokeUsage(): string {
  return [
    'Usage: runHarnessDashboardSmoke [--harness-id <id>] [--strict-rsrc-header] [--platform <win32|linux|darwin>] [--engine <labview-cli|lvcompare>] [--prefer-bitness <auto|x86|x64>] [--labview-cli-path <path>] [--labview-exe-path <path>] [--lvcompare-path <path>] [--dashboard-commit-window <count>] [--help]',
    '',
    'Options:',
    '  --harness-id <id>              Select the canonical harness to run.',
    '  --strict-rsrc-header           Require RSRC header validation during VI detection.',
    '  --platform <value>             Override runtime detection platform for report-tool selection.',
    '  --engine <value>               Override the selected report engine for the smoke run.',
    '  --prefer-bitness <value>       Set runtime bitness preference for report-tool selection.',
    '  --labview-cli-path <path>      Provide an explicit LabVIEWCLI path for report-tool selection.',
    '  --labview-exe-path <path>      Provide an explicit LabVIEW executable path for report-tool selection.',
    '  --lvcompare-path <path>        Provide an explicit LVCompare path for report-tool selection.',
    '  --dashboard-commit-window <n>  Limit the retained dashboard window to at least 3 commits.',
    '  --help                         Print this help and exit without running the harness.'
  ].join('\n');
}

export function parseHarnessDashboardSmokeArgs(argv: string[]): HarnessDashboardSmokeCliArgs {
  let harnessId = 'HARNESS-VHS-001';
  let strictRsrcHeader = false;
  let helpRequested = false;
  let runtimePlatform: RuntimePlatform | undefined;
  let runtimeEngineOverride: ComparisonRuntimeEngine | undefined;
  let preferBitness: 'auto' | 'x86' | 'x64' | undefined;
  let labviewCliPath: string | undefined;
  let labviewExePath: string | undefined;
  let lvComparePath: string | undefined;
  let dashboardCommitWindow: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    const requireValue = (flag: string): string => {
      const candidate = argv[index + 1];
      if (!candidate || candidate.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.\n\n${getHarnessDashboardSmokeUsage()}`);
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
        throw new Error(`Unsupported value for --platform: ${candidate}\n\n${getHarnessDashboardSmokeUsage()}`);
      }

      runtimePlatform = candidate;
      continue;
    }

    if (current === '--engine') {
      const candidate = requireValue('--engine');
      if (candidate !== 'labview-cli' && candidate !== 'lvcompare') {
        throw new Error(`Unsupported value for --engine: ${candidate}\n\n${getHarnessDashboardSmokeUsage()}`);
      }

      runtimeEngineOverride = candidate;
      continue;
    }

    if (current === '--prefer-bitness') {
      const candidate = requireValue('--prefer-bitness');
      if (candidate !== 'auto' && candidate !== 'x86' && candidate !== 'x64') {
        throw new Error(`Unsupported value for --prefer-bitness: ${candidate}\n\n${getHarnessDashboardSmokeUsage()}`);
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

    if (current === '--dashboard-commit-window') {
      const candidate = Number.parseInt(requireValue('--dashboard-commit-window'), 10);
      if (!Number.isFinite(candidate) || candidate < 3) {
        throw new Error(
          `Unsupported value for --dashboard-commit-window: ${String(candidate)}\n\n${getHarnessDashboardSmokeUsage()}`
        );
      }

      dashboardCommitWindow = candidate;
      continue;
    }

    if (current === '--help' || current === '-h') {
      helpRequested = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n\n${getHarnessDashboardSmokeUsage()}`);
  }

  return {
    harnessId,
    strictRsrcHeader,
    helpRequested,
    runtimePlatform,
    runtimeEngineOverride,
    preferBitness,
    labviewCliPath,
    labviewExePath,
    lvComparePath,
    dashboardCommitWindow
  };
}

export async function runHarnessDashboardSmokeCli(
  argv: string[],
  deps: HarnessDashboardSmokeCliDeps = {}
): Promise<'pass' | 'help'> {
  const args = parseHarnessDashboardSmokeArgs(argv);
  const stdout = deps.stdout ?? process.stdout;

  if (args.helpRequested) {
    stdout.write(`${getHarnessDashboardSmokeUsage()}\n`);
    return 'help';
  }

  const repoRoot = deps.repoRoot ?? path.resolve(__dirname, '..', '..');
  const cloneRoot = path.resolve(repoRoot, '.cache', 'harnesses');
  const reportRoot = path.resolve(repoRoot, '.cache', 'harness-reports');

  const result = await (deps.runner ?? runHarnessDashboardSmoke)(args.harnessId, {
    cloneRoot,
    reportRoot,
    strictRsrcHeader: args.strictRsrcHeader,
    runtimePlatform: args.runtimePlatform,
    runtimeEngineOverride: args.runtimeEngineOverride,
    dashboardCommitWindow: args.dashboardCommitWindow,
    runtimeSettings: {
      preferBitness: args.preferBitness,
      labviewCliPath: args.labviewCliPath,
      labviewExePath: args.labviewExePath,
      lvComparePath: args.lvComparePath
    }
  });

  for (const line of formatHarnessDashboardSmokeSuccess(result, args.harnessId)) {
    stdout.write(`${line}\n`);
  }

  return 'pass';
}

export function formatHarnessDashboardSmokeSuccess(
  result: {
    report: HarnessDashboardSmokeReport;
    reportJsonPath: string;
    reportMarkdownPath: string;
    reportHtmlPath: string;
  },
  harnessId: string
): string[] {
  return [
    `Harness dashboard smoke completed for ${harnessId}`,
    `JSON: ${result.reportJsonPath}`,
    `Markdown: ${result.reportMarkdownPath}`,
    `HTML: ${result.reportHtmlPath}`,
    `Dashboard completeness: ${result.report.dashboardWindowCompletenessState}`,
    `Dashboard archived pairs: ${result.report.dashboardArchivedPairCount}`,
    `Dashboard metadata pairs: ${result.report.dashboardMetadataPairCount}`
  ];
}

export async function runHarnessDashboardSmokeCliMain(
  argv: string[] = process.argv.slice(2),
  deps: HarnessDashboardSmokeCliDeps = {},
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): Promise<number> {
  try {
    await runHarnessDashboardSmokeCli(argv, deps);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export function applyHarnessDashboardSmokeCliExitCode(
  exitCode: number,
  processLike: Pick<NodeJS.Process, 'exitCode'> = process
): number {
  processLike.exitCode = exitCode;
  return exitCode;
}

export function maybeRunHarnessDashboardSmokeCliAsMain(
  argv: string[] = process.argv.slice(2),
  mainModule: NodeModule | undefined = require.main,
  currentModule: NodeModule = module,
  deps: HarnessDashboardSmokeCliDeps = {},
  processLike: Pick<NodeJS.Process, 'exitCode'> = process,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): boolean {
  if (mainModule !== currentModule) {
    return false;
  }

  void runHarnessDashboardSmokeCliMain(argv, deps, stderr).then((exitCode) => {
    applyHarnessDashboardSmokeCliExitCode(exitCode, processLike);
  });
  return true;
}

maybeRunHarnessDashboardSmokeCliAsMain();
