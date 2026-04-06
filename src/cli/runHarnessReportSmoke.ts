import * as path from 'node:path';

import {
  defaultCliPathExists,
  validateCanonicalRuntimeOverrideArgs,
  validateCanonicalRuntimeOverrideExecutionSurface
} from './canonicalRuntimeOverrideValidation';
import { maybeRejectGovernedProofLegacyEntrypointAsMain } from './governedProofLegacyEntrypoint';
import {
  HarnessReportSmokeOptions,
  HarnessReportSmokeReport,
  runHarnessReportSmoke
} from '../harness/harnessReportSmoke';
import { RuntimePlatform } from '../reporting/comparisonRuntimeLocator';
import {
  cleanupWindowsHostRuntimeSurface as cleanupWindowsHostRuntimeSurfaceShared
} from './windowsHostRuntimeSurface';

export interface HarnessReportSmokeCliArgs {
  harnessId: string;
  strictRsrcHeader: boolean;
  helpRequested: boolean;
  selectedHash?: string;
  baseHash?: string;
  runtimeExecutionTimeoutMs?: number;
  runtimePlatform?: RuntimePlatform;
  executionMode?: 'auto' | 'host-only' | 'docker-only';
  bitness?: 'x86' | 'x64';
  labviewCliPath?: string;
  labviewExePath?: string;
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
  pathExists?: (candidatePath: string) => Promise<boolean>;
  hostPlatform?: NodeJS.Platform;
  stdout?: { write(text: string): void };
  cleanupWindowsHostRuntimeSurface?: (
    context: Pick<HarnessReportSmokeCliArgs, 'runtimePlatform' | 'executionMode'>
  ) => Promise<void>;
}

export function getHarnessReportSmokeUsage(): string {
  return [
    'Usage: runHarnessReportSmoke [--harness-id <id>] [--strict-rsrc-header] [--selected-hash <hash>] [--base-hash <hash>] [--runtime-timeout-ms <ms>] [--platform <win32|linux|darwin>] [--execution-mode <auto|host-only|docker-only>] [--bitness <x86|x64>] [--labview-cli-path <path>] [--labview-exe-path <path>] [--help]',
    '',
    'Options:',
    '  --harness-id <id>         Select the canonical harness to run.',
    '  --strict-rsrc-header      Require RSRC header validation during VI detection.',
    '  --selected-hash <hash>    Target a specific selected revision instead of the default first compare pair.',
    '  --base-hash <hash>        Assert the targeted selected revision uses this base revision.',
    '  --runtime-timeout-ms <ms> Bound runtime execution for targeted or default report-smoke diagnosis.',
    '  --platform <value>        Override runtime detection platform for report-tool selection.',
    '  --execution-mode <value>  Override provider selection with auto, host-only, or docker-only.',
    '  --bitness <value>  Set explicit runtime bitness for report-tool selection.',
    '  --labview-cli-path <path> Provide an explicit LabVIEWCLI path for report-tool selection.',
    '  --labview-exe-path <path> Provide an explicit LabVIEW executable path for report-tool selection.',
    '  --help                    Print this help and exit without running the harness.',
    '',
    'Canonical diagnosis rules:',
    '  --selected-hash requires --base-hash, and both hashes must be full 40-character git ids.',
    '  Explicit runtime override paths require matching --platform selection and canonical LabVIEWCLI paths.',
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
  let executionMode: 'auto' | 'host-only' | 'docker-only' | undefined;
  let bitness: 'x86' | 'x64' | undefined;
  let labviewCliPath: string | undefined;
  let labviewExePath: string | undefined;

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

    if (current === '--execution-mode') {
      const candidate = requireValue('--execution-mode');
      if (candidate !== 'auto' && candidate !== 'host-only' && candidate !== 'docker-only') {
        throw new Error(
          `Unsupported value for --execution-mode: ${candidate}\n\n${getHarnessReportSmokeUsage()}`
        );
      }

      executionMode = candidate;
      continue;
    }

    if (current === '--bitness') {
      const candidate = requireValue('--bitness');
      if (candidate !== 'x86' && candidate !== 'x64') {
        throw new Error(`Unsupported value for --bitness: ${candidate}\n\n${getHarnessReportSmokeUsage()}`);
      }

      bitness = candidate;
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
    executionMode,
    bitness,
    labviewCliPath,
    labviewExePath
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

  await validateCanonicalHarnessReportSmokeExecutionSurface(args, {
    pathExists: deps.pathExists ?? defaultCliPathExists,
    hostPlatform: deps.hostPlatform ?? process.platform
  });

  await maybeCleanupHarnessReportSmokeWindowsRuntimeSurface(args, deps);

  const repoRoot = deps.repoRoot ?? path.resolve(__dirname, '..', '..');
  const cloneRoot = path.resolve(repoRoot, '.cache', 'harnesses');
  const reportRoot = path.resolve(repoRoot, '.cache', 'harness-reports');

  let result: Awaited<ReturnType<NonNullable<HarnessReportSmokeCliDeps['runner']>>>;
  try {
    result = await (deps.runner ?? runHarnessReportSmoke)(args.harnessId, {
      cloneRoot,
      reportRoot,
      strictRsrcHeader: args.strictRsrcHeader,
      selectedHash: args.selectedHash,
      baseHash: args.baseHash,
      runtimeExecutionTimeoutMs: args.runtimeExecutionTimeoutMs,
      runtimePlatform: args.runtimePlatform,
      runtimeSettings: {
        executionMode: args.executionMode,
        bitness: args.bitness,
        labviewCliPath: args.labviewCliPath,
        labviewExePath: args.labviewExePath
      }
    });
  } finally {
    await maybeCleanupHarnessReportSmokeWindowsRuntimeSurface(args, deps);
  }

  for (const line of formatHarnessReportSmokeSuccess(result, args.harnessId)) {
    stdout.write(`${line}\n`);
  }

  return 'pass';
}

async function maybeCleanupHarnessReportSmokeWindowsRuntimeSurface(
  args: Pick<HarnessReportSmokeCliArgs, 'runtimePlatform' | 'executionMode'>,
  deps: HarnessReportSmokeCliDeps
): Promise<void> {
  if (args.runtimePlatform !== 'win32' || args.executionMode === 'docker-only') {
    return;
  }

  await (deps.cleanupWindowsHostRuntimeSurface ?? cleanupWindowsHostRuntimeSurface)(args);
}

export async function cleanupWindowsHostRuntimeSurface(
  _context: Pick<HarnessReportSmokeCliArgs, 'runtimePlatform' | 'executionMode'>
): Promise<void> {
  return cleanupWindowsHostRuntimeSurfaceShared();
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

  validateCanonicalRuntimeOverrideArgs(args, getHarnessReportSmokeUsage());
}

async function validateCanonicalHarnessReportSmokeExecutionSurface(
  args: HarnessReportSmokeCliArgs,
  deps: {
    pathExists: (candidatePath: string) => Promise<boolean>;
    hostPlatform: NodeJS.Platform;
  }
): Promise<void> {
  await validateCanonicalRuntimeOverrideExecutionSurface(args, getHarnessReportSmokeUsage(), deps);
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

  void argv;
  void deps;
  return maybeRejectGovernedProofLegacyEntrypointAsMain(
    'report-smoke',
    mainModule,
    currentModule,
    processLike,
    stderr
  );
}

maybeRunHarnessReportSmokeCliAsMain();
