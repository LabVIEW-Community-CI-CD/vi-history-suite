import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  resolveCanonicalRuntimeOverrideArgs,
  validateCanonicalRuntimeOverrideArgs,
  validateCanonicalRuntimeOverrideExecutionSurface
} from './canonicalRuntimeOverrideValidation';
import { maybeRejectGovernedProofLegacyEntrypointAsMain } from './governedProofLegacyEntrypoint';
import { getCanonicalHarnessDefinition } from '../harness/canonicalHarnesses';
import {
  HarnessDashboardSmokeOptions,
  HarnessDashboardSmokeReport,
  runHarnessDashboardSmoke
} from '../harness/harnessDashboardSmoke';

const DEFAULT_WINDOWS_BENCHMARK_PAIR_TIMEOUT_MS = 120_000;
const DEFAULT_WINDOWS_BENCHMARK_HEARTBEAT_INTERVAL_MS = 15_000;
export interface GitHubWindowsDashboardBenchmarkCliArgs {
  harnessId: string;
  dashboardCommitWindow?: number;
  labviewCliPath?: string;
  labviewExePath?: string;
  strictRsrcHeader: boolean;
  helpRequested: boolean;
}

export interface GitHubWindowsDashboardBenchmarkSummary {
  schema: 'vi-history-suite/github-windows-dashboard-benchmark@v1';
  benchmarkId: 'GITHUB-VHS-WINDOWS-DASHBOARD-BENCHMARK';
  harnessId: string;
  repositoryUrl: string;
  targetRelativePath: string;
  runtimePlatform: 'win32';
  runtimeImage: string;
  benchmarkImage?: {
    reference?: string;
    digest?: string;
  };
  startedAt: string;
  completedAt: string;
  wallClockSeconds: number;
  dashboardCommitWindow: number;
  comparePairCount: number;
  generatedReportCount: number;
  blockedPairCount: number;
  failedPairCount: number;
  notAvailablePairCount: number;
  noGeneratedReportPairCount: number;
  totalPairPreparationSeconds: number;
  meanPairPreparationSeconds: number;
  maxPairPreparationSeconds: number;
  dashboardWindowCompletenessState: HarnessDashboardSmokeReport['dashboardWindowCompletenessState'];
  completionState: HarnessDashboardSmokeReport['completionState'];
  processedPairCount: number;
  terminalPairIndex?: number;
  terminalPairFailureReason?: string;
  terminalPairDiagnosticReason?: string;
  terminalPairDiagnosticNotes?: string[];
  terminalOutcome: 'completed' | 'runtime-failed' | 'runtime-timed-out';
  comparabilityState:
    | 'comparable-to-linux-benchmark-image'
    | 'characterization-only';
  providerCounts: Record<string, number>;
  etaAccuracy?: {
    measuredPairCount: number;
    preparedPairCount: number;
    etaEligiblePairCount: number;
    meanAbsoluteErrorSeconds?: number;
    maxAbsoluteErrorSeconds?: number;
    meanAbsolutePercentageError?: number;
  };
  github?: {
    repository?: string;
    runId?: string;
    runAttempt?: string;
    sha?: string;
    refName?: string;
  };
  retainedArtifacts: {
    smokeJsonPath: string;
    smokeMarkdownPath: string;
    smokeHtmlPath: string;
    latestSummaryPath: string;
    runSummaryPath: string;
    runSmokeJsonPath?: string;
    runSmokeMarkdownPath?: string;
    runSmokeHtmlPath?: string;
    pairFailureReceiptPath?: string;
  };
}

export interface GitHubWindowsDashboardBenchmarkPairFailureReceipt {
  schema: 'vi-history-suite/github-windows-dashboard-benchmark-pair-failure@v1';
  benchmarkId: 'GITHUB-VHS-WINDOWS-DASHBOARD-BENCHMARK';
  harnessId: string;
  recordedAt: string;
  targetRelativePath: string;
  pairIndex: number;
  comparePairCount: number;
  selectedHash: string;
  baseHash: string;
  reportStatus: HarnessDashboardSmokeReport['pairSummaries'][number]['reportStatus'];
  runtimeExecutionState: HarnessDashboardSmokeReport['pairSummaries'][number]['runtimeExecutionState'];
  runtimeProvider?: string;
  runtimeEngine?: string;
  runtimeBlockedReason?: string;
  runtimeFailureReason?: string;
  runtimeDiagnosticReason?: string;
  runtimeImage: string;
  benchmarkImage?: {
    reference?: string;
    digest?: string;
  };
  artifacts: {
    packetFilePath: string;
    packetExists: boolean;
    reportFilePath: string;
    reportExists: boolean;
    metadataFilePath: string;
    metadataExists: boolean;
    runtimeStdoutPath?: string;
    runtimeStdoutExists: boolean;
    runtimeStderrPath?: string;
    runtimeStderrExists: boolean;
    runtimeDiagnosticLogPath?: string;
    runtimeDiagnosticLogExists: boolean;
    runtimeProcessObservationPath?: string;
    runtimeProcessObservationExists: boolean;
  };
}

export interface GitHubWindowsDashboardBenchmarkProgressRecord {
  schema: 'vi-history-suite/github-windows-dashboard-benchmark-progress@v1';
  benchmarkId: 'GITHUB-VHS-WINDOWS-DASHBOARD-BENCHMARK';
  harnessId: string;
  targetRelativePath: string;
  recordedAt: string;
  phase: 'starting' | 'running' | 'completed' | 'failed';
  message: string;
}

export interface GitHubWindowsDashboardBenchmarkCliDeps {
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
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
  copyFile?: typeof fs.copyFile;
  pathExists?: (filePath: string) => Promise<boolean>;
  hostPlatform?: NodeJS.Platform;
  now?: () => Date;
}

export function getGitHubWindowsDashboardBenchmarkUsage(): string {
  return [
    'Usage: runGitHubWindowsDashboardBenchmark [--harness-id <id>] [--dashboard-commit-window <count>] [--labview-cli-path <path>] [--labview-exe-path <path>] [--strict-rsrc-header] [--help]',
    '',
    'Options:',
    '  --harness-id <id>              Canonical harness id. Defaults to HARNESS-VHS-002 for the deep Windows benchmark lane.',
    '  --dashboard-commit-window <n>  Limit the retained dashboard window to at least 3 commits. Defaults to 1000 for the deep Windows benchmark lane.',
    '  --labview-cli-path <path>      Provide an explicit LabVIEWCLI path.',
    '  --labview-exe-path <path>      Provide an explicit LabVIEW executable path.',
    '  --strict-rsrc-header           Require RSRC header validation during VI detection.',
    '  --help                         Print this help and exit without running the benchmark.'
  ].join('\n');
}

export function parseGitHubWindowsDashboardBenchmarkArgs(
  argv: string[]
): GitHubWindowsDashboardBenchmarkCliArgs {
  let harnessId = 'HARNESS-VHS-002';
  let dashboardCommitWindow = 1000;
  let labviewCliPath: string | undefined;
  let labviewExePath: string | undefined;
  let strictRsrcHeader = false;
  let helpRequested = false;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const requireValue = (flag: string): string => {
      const candidate = argv[index + 1];
      if (!candidate || candidate.startsWith('--')) {
        throw new Error(
          `Missing value for ${flag}.\n\n${getGitHubWindowsDashboardBenchmarkUsage()}`
        );
      }

      index += 1;
      return candidate;
    };

    if (current === '--harness-id') {
      harnessId = requireValue('--harness-id');
      continue;
    }

    if (current === '--dashboard-commit-window') {
      const candidate = Number.parseInt(requireValue('--dashboard-commit-window'), 10);
      if (!Number.isFinite(candidate) || candidate < 3) {
        throw new Error(
          `Unsupported value for --dashboard-commit-window: ${String(candidate)}\n\n${getGitHubWindowsDashboardBenchmarkUsage()}`
        );
      }

      dashboardCommitWindow = candidate;
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

    if (current === '--strict-rsrc-header') {
      strictRsrcHeader = true;
      continue;
    }

    if (current === '--help' || current === '-h') {
      helpRequested = true;
      continue;
    }

    throw new Error(
      `Unknown argument: ${current}\n\n${getGitHubWindowsDashboardBenchmarkUsage()}`
    );
  }

  const parsedArgs = {
    harnessId,
    dashboardCommitWindow,
    labviewCliPath,
    labviewExePath,
    strictRsrcHeader,
    helpRequested
  };
  validateCanonicalRuntimeOverrideArgs(
    {
      runtimePlatform: 'win32',
      labviewCliPath,
      labviewExePath
    },
    getGitHubWindowsDashboardBenchmarkUsage()
  );
  return parsedArgs;
}

export async function runGitHubWindowsDashboardBenchmarkCli(
  argv: string[],
  deps: GitHubWindowsDashboardBenchmarkCliDeps = {}
): Promise<'pass' | 'help'> {
  const args = parseGitHubWindowsDashboardBenchmarkArgs(argv);
  const stdout = deps.stdout ?? process.stdout;

  if (args.helpRequested) {
    stdout.write(`${getGitHubWindowsDashboardBenchmarkUsage()}\n`);
    return 'help';
  }

  const effectiveRuntimeOverrides = resolveCanonicalRuntimeOverrideArgs(
    {
      runtimePlatform: 'win32',
      labviewCliPath: args.labviewCliPath,
      labviewExePath: args.labviewExePath
    },
    {
      labviewCliPath: process.env.VIHS_GITHUB_WINDOWS_BENCHMARK_LABVIEW_CLI_PATH,
      labviewExePath: process.env.VIHS_GITHUB_WINDOWS_BENCHMARK_LABVIEW_EXE_PATH
    }
  );
  validateCanonicalRuntimeOverrideArgs(
    effectiveRuntimeOverrides,
    getGitHubWindowsDashboardBenchmarkUsage()
  );
  await validateCanonicalRuntimeOverrideExecutionSurface(
    effectiveRuntimeOverrides,
    getGitHubWindowsDashboardBenchmarkUsage(),
    {
      pathExists: deps.pathExists ?? defaultPathExists,
      hostPlatform: deps.hostPlatform ?? process.platform
    }
  );

  const repoRoot = deps.repoRoot ?? path.resolve(__dirname, '..', '..');
  const cloneRoot = joinPreservingExplicitPathStyle(repoRoot, '.cache', 'harnesses');
  const reportRoot = joinPreservingExplicitPathStyle(repoRoot, '.cache', 'harness-reports');
  const benchmarkRoot = joinPreservingExplicitPathStyle(
    repoRoot,
    '.cache',
    'github-experiments',
    'windows-dashboard-benchmark',
    args.harnessId
  );
  const harnessDefinition = getCanonicalHarnessDefinition(args.harnessId);
  const now = deps.now ?? (() => new Date());
  const startedAtDate = now();
  const latestProgressPath = joinPreservingExplicitPathStyle(
    benchmarkRoot,
    'latest-progress.json'
  );
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const copyFile = deps.copyFile ?? fs.copyFile;
  const pathExists = deps.pathExists ?? defaultPathExists;
  const runtimePairTimeoutMs = readPositiveIntegerEnv(
    'VIHS_GITHUB_WINDOWS_BENCHMARK_PAIR_TIMEOUT_MS',
    DEFAULT_WINDOWS_BENCHMARK_PAIR_TIMEOUT_MS
  );
  const runtimeHeartbeatIntervalMs = readPositiveIntegerEnv(
    'VIHS_GITHUB_WINDOWS_BENCHMARK_HEARTBEAT_INTERVAL_MS',
    DEFAULT_WINDOWS_BENCHMARK_HEARTBEAT_INTERVAL_MS
  );

  await mkdir(benchmarkRoot, { recursive: true });
  const writeProgress = async (
    phase: GitHubWindowsDashboardBenchmarkProgressRecord['phase'],
    message: string
  ): Promise<void> => {
    stdout.write(`VIHS_PROGRESS: ${message}\n`);
    await writeFile(
      latestProgressPath,
      `${JSON.stringify(
        {
          schema: 'vi-history-suite/github-windows-dashboard-benchmark-progress@v1',
          benchmarkId: 'GITHUB-VHS-WINDOWS-DASHBOARD-BENCHMARK',
          harnessId: args.harnessId,
          targetRelativePath: harnessDefinition.targetRelativePath,
          recordedAt: now().toISOString(),
          phase,
          message
        } satisfies GitHubWindowsDashboardBenchmarkProgressRecord,
        null,
        2
      )}\n`
    );
  };

  await writeProgress(
    'starting',
    `Preparing the Windows benchmark workspace for ${args.harnessId}.`
  );

  let result: Awaited<ReturnType<typeof runHarnessDashboardSmoke>>;
  try {
    result = await (deps.runner ?? runHarnessDashboardSmoke)(args.harnessId, {
      cloneRoot,
      reportRoot,
      strictRsrcHeader: args.strictRsrcHeader,
      runtimePlatform: 'win32',
      dashboardCommitWindow: args.dashboardCommitWindow,
      runtimeExecutionTimeoutMs: runtimePairTimeoutMs,
      runtimeHeartbeatIntervalMs,
      runtimeSettings: {
        labviewCliPath: effectiveRuntimeOverrides.labviewCliPath,
        labviewExePath: effectiveRuntimeOverrides.labviewExePath
      },
      reportProgress: async (update) => {
        await writeProgress('running', update.message);
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeProgress('failed', message);
    throw error;
  }

  const completedAtDate = now();
  const summary = buildGitHubWindowsDashboardBenchmarkSummary(result, {
    startedAt: startedAtDate,
    completedAt: completedAtDate,
    benchmarkRoot,
    runtimeImage:
      process.env.VIHS_GITHUB_WINDOWS_BENCHMARK_RUNTIME_IMAGE ??
      process.env.COMPAREVI_NI_WINDOWS_IMAGE ??
      'nationalinstruments/labview:2026q1-windows'
  });
  const runSummaryPath = joinPreservingExplicitPathStyle(
    benchmarkRoot,
    `${summary.completedAt.replaceAll(':', '').replaceAll('.', '').replace('T', '-').replace('Z', '')}.json`
  );
  const latestSummaryPath = joinPreservingExplicitPathStyle(benchmarkRoot, 'latest-summary.json');
  const runSmokeArtifactBasePath = runSummaryPath.replace(/\.json$/u, '');
  const runSmokeJsonPath = `${runSmokeArtifactBasePath}-dashboard-smoke.json`;
  const runSmokeMarkdownPath = `${runSmokeArtifactBasePath}-dashboard-smoke.md`;
  const runSmokeHtmlPath = `${runSmokeArtifactBasePath}-dashboard-smoke.html`;
  summary.retainedArtifacts.runSummaryPath = runSummaryPath;
  summary.retainedArtifacts.latestSummaryPath = latestSummaryPath;
  if (await pathExists(result.reportJsonPath)) {
    await copyFile(result.reportJsonPath, runSmokeJsonPath);
    summary.retainedArtifacts.runSmokeJsonPath = runSmokeJsonPath;
  }
  if (await pathExists(result.reportMarkdownPath)) {
    await copyFile(result.reportMarkdownPath, runSmokeMarkdownPath);
    summary.retainedArtifacts.runSmokeMarkdownPath = runSmokeMarkdownPath;
  }
  if (await pathExists(result.reportHtmlPath)) {
    await copyFile(result.reportHtmlPath, runSmokeHtmlPath);
    summary.retainedArtifacts.runSmokeHtmlPath = runSmokeHtmlPath;
  }
  if (summary.completionState === 'failed') {
    const failureReceipt = await buildGitHubWindowsDashboardBenchmarkPairFailureReceipt(
      summary,
      result.report,
      pathExists,
      completedAtDate
    );
    if (failureReceipt) {
      const pairFailureReceiptPath = joinPreservingExplicitPathStyle(
        benchmarkRoot,
        `pair-failure-pair-${String(failureReceipt.pairIndex).padStart(4, '0')}.json`
      );
      summary.retainedArtifacts.pairFailureReceiptPath = pairFailureReceiptPath;
      await writeFile(
        pairFailureReceiptPath,
        `${JSON.stringify(failureReceipt, null, 2)}\n`
      );
    }
  }

  await writeFile(runSummaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(latestSummaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  if (summary.completionState === 'failed') {
    const failureMessage =
      summary.terminalPairIndex === undefined
        ? `Windows benchmark failed after processing ${summary.processedPairCount}/${summary.comparePairCount} pair(s).`
        : `Windows benchmark failed at pair ${summary.terminalPairIndex}/${summary.comparePairCount}: ${summary.terminalPairFailureReason ?? 'runtime-execution-failed'}${summary.terminalPairDiagnosticReason ? ` (${summary.terminalPairDiagnosticReason})` : ''}.`;
    await writeProgress('failed', failureMessage);
    throw new Error(failureMessage);
  }

  await writeProgress(
    'completed',
    `Completed ${summary.comparePairCount} compare pair(s); generated=${summary.generatedReportCount}, blocked=${summary.blockedPairCount}, failed=${summary.failedPairCount}.`
  );

  for (const line of formatGitHubWindowsDashboardBenchmarkSuccess(summary)) {
    stdout.write(`${line}\n`);
  }

  return 'pass';
}

export function buildGitHubWindowsDashboardBenchmarkSummary(
  result: {
    report: HarnessDashboardSmokeReport;
    reportJsonPath: string;
    reportMarkdownPath: string;
    reportHtmlPath: string;
  },
  options: {
    startedAt: Date;
    completedAt: Date;
    benchmarkRoot: string;
    runtimeImage: string;
  }
): GitHubWindowsDashboardBenchmarkSummary {
  const totalPairPreparationSeconds = roundSeconds(
    result.report.pairSummaries.reduce((sum, pair) => sum + pair.actualPreparationSeconds, 0)
  );
  const pairCount = result.report.pairSummaries.length;
  const blockedPairs = result.report.pairSummaries.filter(
    (pair) =>
      pair.reportStatus === 'blocked-preflight' ||
      pair.reportStatus === 'blocked-runtime' ||
      pair.runtimeExecutionState === 'not-available'
  );
  const blockedPairCount = blockedPairs.length;
  const failedPairCount = result.report.pairSummaries.filter(
    (pair) => pair.runtimeExecutionState === 'failed'
  ).length;
  const notAvailablePairCount = result.report.pairSummaries.filter(
    (pair) => pair.runtimeExecutionState === 'not-available'
  ).length;
  const noGeneratedReportPairCount = result.report.pairSummaries.filter(
    (pair) =>
      !pair.generatedReportExists &&
      pair.reportStatus === 'ready-for-runtime' &&
      pair.runtimeExecutionState === 'succeeded'
  ).length;
  const providerCounts = result.report.pairSummaries.reduce<Record<string, number>>(
    (counts, pair) => {
      const key = pair.runtimeProvider?.trim() || 'unknown';
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    },
    {}
  );
  const etaAccuracy = result.report.dashboardEtaAccuracyRecord;
  const benchmarkImageReference = process.env.VIHS_GITHUB_WINDOWS_BENCHMARK_IMAGE_REF;
  const benchmarkImageDigest = process.env.VIHS_GITHUB_WINDOWS_BENCHMARK_IMAGE_DIGEST;
  const terminalPair =
    result.report.terminalPairIndex === undefined
      ? undefined
      : result.report.pairSummaries.find(
          (pair) => pair.pairIndex === result.report.terminalPairIndex
        );
  const firstNotAvailablePair = result.report.pairSummaries.find(
    (pair) => pair.runtimeExecutionState === 'not-available'
  );
  const summaryCompletionState =
    result.report.completionState === 'failed' || firstNotAvailablePair ? 'failed' : 'completed';
  const summaryTerminalPair = terminalPair ?? firstNotAvailablePair;
  const summaryTerminalPairFailureReason =
    result.report.terminalPairFailureReason ??
    summaryTerminalPair?.runtimeFailureReason ??
    summaryTerminalPair?.runtimeBlockedReason;

  return {
    schema: 'vi-history-suite/github-windows-dashboard-benchmark@v1',
    benchmarkId: 'GITHUB-VHS-WINDOWS-DASHBOARD-BENCHMARK',
    harnessId: result.report.harnessId,
    repositoryUrl: result.report.repositoryUrl,
    targetRelativePath: result.report.targetRelativePath,
    runtimePlatform: 'win32',
    runtimeImage: options.runtimeImage,
    benchmarkImage:
      benchmarkImageReference || benchmarkImageDigest
        ? {
            reference: benchmarkImageReference,
            digest: benchmarkImageDigest
          }
        : undefined,
    startedAt: options.startedAt.toISOString(),
    completedAt: options.completedAt.toISOString(),
    wallClockSeconds: roundSeconds(
      Math.max(0, options.completedAt.getTime() - options.startedAt.getTime()) / 1000
    ),
    dashboardCommitWindow: result.report.dashboardCommitWindow,
    comparePairCount: result.report.comparePairCount,
    generatedReportCount: result.report.dashboardGeneratedReportCount,
    blockedPairCount,
    failedPairCount,
    notAvailablePairCount,
    noGeneratedReportPairCount,
    totalPairPreparationSeconds,
    meanPairPreparationSeconds: roundSeconds(
      pairCount === 0 ? 0 : totalPairPreparationSeconds / pairCount
    ),
    maxPairPreparationSeconds: roundSeconds(
      Math.max(0, ...result.report.pairSummaries.map((pair) => pair.actualPreparationSeconds))
    ),
    dashboardWindowCompletenessState: result.report.dashboardWindowCompletenessState,
    completionState: summaryCompletionState,
    processedPairCount: result.report.processedPairCount,
    terminalPairIndex: result.report.terminalPairIndex ?? firstNotAvailablePair?.pairIndex,
    terminalPairFailureReason: summaryTerminalPairFailureReason,
    terminalPairDiagnosticReason: summaryTerminalPair?.runtimeDiagnosticReason,
    terminalPairDiagnosticNotes: summaryTerminalPair?.runtimeDiagnosticNotes,
    terminalOutcome:
      summaryCompletionState !== 'failed'
        ? 'completed'
        : summaryTerminalPairFailureReason === 'command-timed-out'
          ? 'runtime-timed-out'
          : 'runtime-failed',
    comparabilityState:
      summaryCompletionState === 'completed'
        ? 'comparable-to-linux-benchmark-image'
        : 'characterization-only',
    providerCounts,
    etaAccuracy: etaAccuracy
      ? {
          measuredPairCount: etaAccuracy.measuredPairCount,
          preparedPairCount: etaAccuracy.preparedPairCount,
          etaEligiblePairCount: etaAccuracy.etaEligiblePairCount,
          meanAbsoluteErrorSeconds: etaAccuracy.meanAbsoluteErrorSeconds,
          maxAbsoluteErrorSeconds: etaAccuracy.maxAbsoluteErrorSeconds,
          meanAbsolutePercentageError: etaAccuracy.meanAbsolutePercentageError
        }
      : undefined,
    github:
      process.env.GITHUB_ACTIONS === 'true'
        ? {
            repository: process.env.GITHUB_REPOSITORY,
            runId: process.env.GITHUB_RUN_ID,
            runAttempt: process.env.GITHUB_RUN_ATTEMPT,
            sha: process.env.GITHUB_SHA,
            refName: process.env.GITHUB_REF_NAME
          }
        : undefined,
    retainedArtifacts: {
      smokeJsonPath: result.reportJsonPath,
      smokeMarkdownPath: result.reportMarkdownPath,
      smokeHtmlPath: result.reportHtmlPath,
      latestSummaryPath: joinPreservingExplicitPathStyle(
        options.benchmarkRoot,
        'latest-summary.json'
      ),
      runSummaryPath: joinPreservingExplicitPathStyle(
        options.benchmarkRoot,
        'pending-run-summary.json'
      )
    }
  };
}

export function formatGitHubWindowsDashboardBenchmarkSuccess(
  summary: GitHubWindowsDashboardBenchmarkSummary
): string[] {
  const benchmarkImageSummary = summary.benchmarkImage?.reference
    ? `${summary.benchmarkImage.reference}${summary.benchmarkImage.digest ? `@${summary.benchmarkImage.digest}` : ''}`
    : undefined;

  return [
    `GitHub Windows dashboard benchmark completed for ${summary.harnessId}`,
    `Target: ${summary.targetRelativePath}`,
    `Runtime image: ${summary.runtimeImage}`,
    benchmarkImageSummary ? `Benchmark image: ${benchmarkImageSummary}` : undefined,
    `Wall clock: ${summary.wallClockSeconds}s`,
    `Pair preparation total: ${summary.totalPairPreparationSeconds}s`,
    `Pair preparation mean/max: ${summary.meanPairPreparationSeconds}s / ${summary.maxPairPreparationSeconds}s`,
    `Completion: ${summary.completionState} (${summary.comparabilityState})`,
    `Pair outcomes: generated=${summary.generatedReportCount} blocked=${summary.blockedPairCount} failed=${summary.failedPairCount} not-available=${summary.notAvailablePairCount} no-generated=${summary.noGeneratedReportPairCount}`,
    `Providers: ${formatProviderCounts(summary.providerCounts)}`,
    `Smoke JSON: ${summary.retainedArtifacts.smokeJsonPath}`,
    `Benchmark summary: ${summary.retainedArtifacts.latestSummaryPath}`
  ].filter((line): line is string => Boolean(line));
}

function formatProviderCounts(providerCounts: Record<string, number>): string {
  const entries = Object.entries(providerCounts);
  if (entries.length === 0) {
    return 'none';
  }

  return entries
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([provider, count]) => `${provider}=${count}`)
    .join(', ');
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

async function buildGitHubWindowsDashboardBenchmarkPairFailureReceipt(
  summary: GitHubWindowsDashboardBenchmarkSummary,
  report: HarnessDashboardSmokeReport,
  pathExists: (filePath: string) => Promise<boolean>,
  recordedAt: Date
): Promise<GitHubWindowsDashboardBenchmarkPairFailureReceipt | undefined> {
  if (summary.completionState !== 'failed' || summary.terminalPairIndex === undefined) {
    return undefined;
  }

  const pair = report.pairSummaries.find(
    (candidate) => candidate.pairIndex === summary.terminalPairIndex
  );
  if (!pair) {
    return undefined;
  }

  return {
    schema: 'vi-history-suite/github-windows-dashboard-benchmark-pair-failure@v1',
    benchmarkId: 'GITHUB-VHS-WINDOWS-DASHBOARD-BENCHMARK',
    harnessId: summary.harnessId,
    recordedAt: recordedAt.toISOString(),
    targetRelativePath: summary.targetRelativePath,
    pairIndex: pair.pairIndex,
    comparePairCount: summary.comparePairCount,
    selectedHash: pair.selectedHash,
    baseHash: pair.baseHash,
    reportStatus: pair.reportStatus,
    runtimeExecutionState: pair.runtimeExecutionState,
    runtimeProvider: pair.runtimeProvider,
    runtimeEngine: pair.runtimeEngine,
    runtimeBlockedReason: pair.runtimeBlockedReason,
    runtimeFailureReason: pair.runtimeFailureReason,
    runtimeDiagnosticReason: pair.runtimeDiagnosticReason,
    runtimeImage: summary.runtimeImage,
    benchmarkImage: summary.benchmarkImage,
    artifacts: {
      packetFilePath: pair.packetFilePath,
      packetExists: await pathExists(pair.packetFilePath),
      reportFilePath: pair.reportFilePath,
      reportExists: await pathExists(pair.reportFilePath),
      metadataFilePath: pair.metadataFilePath,
      metadataExists: await pathExists(pair.metadataFilePath),
      runtimeStdoutPath: pair.runtimeStdoutPath,
      runtimeStdoutExists: pair.runtimeStdoutPath
        ? await pathExists(pair.runtimeStdoutPath)
        : false,
      runtimeStderrPath: pair.runtimeStderrPath,
      runtimeStderrExists: pair.runtimeStderrPath
        ? await pathExists(pair.runtimeStderrPath)
        : false,
      runtimeDiagnosticLogPath: pair.runtimeDiagnosticLogPath,
      runtimeDiagnosticLogExists: pair.runtimeDiagnosticLogPath
        ? await pathExists(pair.runtimeDiagnosticLogPath)
        : false,
      runtimeProcessObservationPath: pair.runtimeProcessObservationPath,
      runtimeProcessObservationExists: pair.runtimeProcessObservationPath
        ? await pathExists(pair.runtimeProcessObservationPath)
        : false
    }
  };
}

async function defaultPathExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function runGitHubWindowsDashboardBenchmarkCliMain(
  argv: string[] = process.argv.slice(2),
  deps: GitHubWindowsDashboardBenchmarkCliDeps = {},
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): Promise<number> {
  try {
    await runGitHubWindowsDashboardBenchmarkCli(argv, deps);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export function applyGitHubWindowsDashboardBenchmarkCliExitCode(
  exitCode: number,
  processLike: Pick<NodeJS.Process, 'exitCode'> = process
): number {
  processLike.exitCode = exitCode;
  return exitCode;
}

export function maybeRunGitHubWindowsDashboardBenchmarkCliAsMain(
  argv: string[] = process.argv.slice(2),
  mainModule: NodeModule | undefined = require.main,
  currentModule: NodeModule = module,
  deps: GitHubWindowsDashboardBenchmarkCliDeps = {},
  processLike: Pick<NodeJS.Process, 'exitCode'> = process,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): boolean {
  if (mainModule !== currentModule) {
    return false;
  }

  void argv;
  void deps;
  return maybeRejectGovernedProofLegacyEntrypointAsMain(
    'benchmark-windows',
    mainModule,
    currentModule,
    processLike,
    stderr
  );
}

maybeRunGitHubWindowsDashboardBenchmarkCliAsMain();

function usesExplicitPosixPathStyle(rootPath: string): boolean {
  return rootPath.startsWith('/');
}

function usesExplicitWindowsPathStyle(rootPath: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(rootPath) || rootPath.startsWith('\\\\');
}

function joinPreservingExplicitPathStyle(rootPath: string, ...segments: string[]): string {
  if (usesExplicitPosixPathStyle(rootPath)) {
    return path.posix.join(rootPath, ...segments.map((segment) => segment.replace(/\\/g, '/')));
  }

  if (usesExplicitWindowsPathStyle(rootPath)) {
    return path.win32.join(rootPath, ...segments.map((segment) => segment.replace(/\//g, '\\')));
  }

  return path.join(rootPath, ...segments);
}
