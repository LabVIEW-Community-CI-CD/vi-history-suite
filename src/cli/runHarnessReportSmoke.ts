import * as path from 'node:path';

import {
  HarnessReportSmokeOptions,
  HarnessReportSmokeReport,
  runHarnessReportSmoke
} from '../harness/harnessReportSmoke';
import { ComparisonRuntimeEngine, RuntimePlatform } from '../reporting/comparisonRuntimeLocator';

export interface HarnessReportSmokeCliArgs {
  harnessId: string;
  strictRsrcHeader: boolean;
  helpRequested: boolean;
  selectedHash?: string;
  baseHash?: string;
  runtimeExecutionTimeoutMs?: number;
  runtimePlatform?: RuntimePlatform;
  runtimeEngineOverride?: ComparisonRuntimeEngine;
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
    'Usage: runHarnessReportSmoke [--harness-id <id>] [--strict-rsrc-header] [--selected-hash <hash>] [--base-hash <hash>] [--runtime-timeout-ms <ms>] [--platform <win32|linux|darwin>] [--engine <labview-cli|lvcompare>] [--prefer-bitness <auto|x86|x64>] [--labview-cli-path <path>] [--labview-exe-path <path>] [--lvcompare-path <path>] [--help]',
    '',
    'Options:',
    '  --harness-id <id>         Select the canonical harness to run.',
    '  --strict-rsrc-header      Require RSRC header validation during VI detection.',
    '  --selected-hash <hash>    Target a specific selected revision instead of the default first compare pair.',
    '  --base-hash <hash>        Assert the targeted selected revision uses this base revision.',
    '  --runtime-timeout-ms <ms> Bound runtime execution for targeted or default report-smoke diagnosis.',
    '  --platform <value>        Override runtime detection platform for report-tool selection.',
    '  --engine <value>          Override the selected report engine for the smoke run.',
    '  --prefer-bitness <value>  Set runtime bitness preference for report-tool selection.',
    '  --labview-cli-path <path> Provide an explicit LabVIEWCLI path for report-tool selection.',
    '  --labview-exe-path <path> Provide an explicit LabVIEW executable path for report-tool selection.',
    '  --lvcompare-path <path>   Provide an explicit LVCompare path for report-tool selection.',
    '  --help                    Print this help and exit without running the harness.',
    '',
    'Canonical diagnosis rules:',
    '  --selected-hash requires --base-hash, and both hashes must be full 40-character git ids.',
    '  Explicit runtime override paths require matching --platform and --engine selections.',
    '  Windows bitness overrides must agree with any explicit Program Files / Program Files (x86) runtime paths.'
  ].join('\n');
}

export function parseHarnessReportSmokeArgs(argv: string[]): HarnessReportSmokeCliArgs {
  let harnessId = 'HARNESS-VHS-001';
  let strictRsrcHeader = false;
  let helpRequested = false;
  let selectedHash: string | undefined;
  let baseHash: string | undefined;
  let runtimeExecutionTimeoutMs: number | undefined;
  let runtimePlatform: RuntimePlatform | undefined;
  let runtimeEngineOverride: ComparisonRuntimeEngine | undefined;
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

    if (current === '--selected-hash') {
      selectedHash = requireValue('--selected-hash');
      continue;
    }

    if (current === '--base-hash') {
      baseHash = requireValue('--base-hash');
      continue;
    }

    if (current === '--runtime-timeout-ms') {
      const candidate = Number.parseInt(requireValue('--runtime-timeout-ms'), 10);
      if (!Number.isFinite(candidate) || candidate < 1) {
        throw new Error(
          `Unsupported value for --runtime-timeout-ms: ${String(candidate)}\n\n${getHarnessReportSmokeUsage()}`
        );
      }

      runtimeExecutionTimeoutMs = candidate;
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

    if (current === '--engine') {
      const candidate = requireValue('--engine');
      if (candidate !== 'labview-cli' && candidate !== 'lvcompare') {
        throw new Error(`Unsupported value for --engine: ${candidate}\n\n${getHarnessReportSmokeUsage()}`);
      }

      runtimeEngineOverride = candidate;
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

  if (baseHash && !selectedHash) {
    throw new Error(`--base-hash requires --selected-hash.\n\n${getHarnessReportSmokeUsage()}`);
  }

  const parsedArgs = {
    harnessId,
    strictRsrcHeader,
    helpRequested,
    selectedHash,
    baseHash,
    runtimeExecutionTimeoutMs,
    runtimePlatform,
    runtimeEngineOverride,
    preferBitness,
    labviewCliPath,
    labviewExePath,
    lvComparePath
  };

  validateCanonicalHarnessReportSmokeArgs(parsedArgs);
  return parsedArgs;
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
    selectedHash: args.selectedHash,
    baseHash: args.baseHash,
    runtimeExecutionTimeoutMs: args.runtimeExecutionTimeoutMs,
    runtimePlatform: args.runtimePlatform,
    runtimeEngineOverride: args.runtimeEngineOverride,
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

const FULL_GIT_HASH_PATTERN = /^[0-9a-f]{40}$/i;

function validateCanonicalHarnessReportSmokeArgs(args: HarnessReportSmokeCliArgs): void {
  const explicitRuntimeOverrideRequested = Boolean(
    args.labviewCliPath || args.labviewExePath || args.lvComparePath || args.preferBitness
  );

  if (args.selectedHash && !FULL_GIT_HASH_PATTERN.test(args.selectedHash)) {
    throw new Error(
      `--selected-hash must be a full 40-character git hash for canonical exact-pair diagnosis.\n\n${getHarnessReportSmokeUsage()}`
    );
  }

  if (args.baseHash && !FULL_GIT_HASH_PATTERN.test(args.baseHash)) {
    throw new Error(
      `--base-hash must be a full 40-character git hash for canonical exact-pair diagnosis.\n\n${getHarnessReportSmokeUsage()}`
    );
  }

  if (args.selectedHash && !args.baseHash) {
    throw new Error(
      `--selected-hash requires --base-hash for canonical exact-pair diagnosis.\n\n${getHarnessReportSmokeUsage()}`
    );
  }

  if (args.preferBitness && args.runtimePlatform && args.runtimePlatform !== 'win32') {
    throw new Error(
      `--prefer-bitness is only supported with --platform win32.\n\n${getHarnessReportSmokeUsage()}`
    );
  }

  if (explicitRuntimeOverrideRequested && !args.runtimePlatform) {
    throw new Error(
      `Canonical runtime overrides require --platform.\n\n${getHarnessReportSmokeUsage()}`
    );
  }

  if (explicitRuntimeOverrideRequested && !args.runtimeEngineOverride) {
    throw new Error(
      `Canonical runtime overrides require --engine.\n\n${getHarnessReportSmokeUsage()}`
    );
  }

  if (args.runtimeEngineOverride === 'labview-cli') {
    if (args.lvComparePath) {
      throw new Error(
        `--engine labview-cli does not allow --lvcompare-path.\n\n${getHarnessReportSmokeUsage()}`
      );
    }

    if (Boolean(args.labviewCliPath) !== Boolean(args.labviewExePath)) {
      throw new Error(
        `Canonical labview-cli overrides require both --labview-cli-path and --labview-exe-path.\n\n${getHarnessReportSmokeUsage()}`
      );
    }

    validateExecutableBasename(args.labviewCliPath, '--labview-cli-path', 'LabVIEWCLI.exe');
    validateExecutableBasename(args.labviewExePath, '--labview-exe-path', 'LabVIEW.exe');
  }

  if (args.runtimeEngineOverride === 'lvcompare') {
    if (args.labviewCliPath) {
      throw new Error(
        `--engine lvcompare does not allow --labview-cli-path.\n\n${getHarnessReportSmokeUsage()}`
      );
    }

    if (Boolean(args.lvComparePath) !== Boolean(args.labviewExePath)) {
      throw new Error(
        `Canonical lvcompare overrides require both --lvcompare-path and --labview-exe-path.\n\n${getHarnessReportSmokeUsage()}`
      );
    }

    validateExecutableBasename(args.lvComparePath, '--lvcompare-path', 'LVCompare.exe');
    validateExecutableBasename(args.labviewExePath, '--labview-exe-path', 'LabVIEW.exe');
  }

  validateWindowsBitnessConsistency(args);
}

function validateExecutableBasename(
  candidatePath: string | undefined,
  flag: string,
  expectedBasename: string
): void {
  if (!candidatePath) {
    return;
  }

  const actualBasename = path.win32.basename(candidatePath);
  if (actualBasename.localeCompare(expectedBasename, undefined, { sensitivity: 'accent' }) !== 0) {
    throw new Error(
      `${flag} must point to ${expectedBasename}; received ${actualBasename || candidatePath}.\n\n${getHarnessReportSmokeUsage()}`
    );
  }
}

function validateWindowsBitnessConsistency(args: HarnessReportSmokeCliArgs): void {
  if (args.runtimePlatform !== 'win32' || !args.preferBitness || args.preferBitness === 'auto') {
    return;
  }

  for (const [flag, candidatePath] of [
    ['--labview-cli-path', args.labviewCliPath],
    ['--labview-exe-path', args.labviewExePath],
    ['--lvcompare-path', args.lvComparePath]
  ] as const) {
    if (!candidatePath) {
      continue;
    }

    const inferredBitness = inferWindowsPathBitness(candidatePath);
    if (inferredBitness && inferredBitness !== args.preferBitness) {
      throw new Error(
        `${flag} does not match --prefer-bitness ${args.preferBitness}; inferred ${inferredBitness} from ${candidatePath}.\n\n${getHarnessReportSmokeUsage()}`
      );
    }
  }
}

function inferWindowsPathBitness(candidatePath: string): 'x86' | 'x64' | undefined {
  const normalizedPath = candidatePath.replaceAll('/', '\\').toLowerCase();
  if (normalizedPath.includes('\\program files (x86)\\')) {
    return 'x86';
  }

  if (normalizedPath.includes('\\program files\\')) {
    return 'x64';
  }

  return undefined;
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
