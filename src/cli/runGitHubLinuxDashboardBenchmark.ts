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

const DEFAULT_BENCHMARK_PAIR_TIMEOUT_MS = 120_000;
const DEFAULT_BENCHMARK_HEARTBEAT_INTERVAL_MS = 15_000;

export interface GitHubLinuxDashboardBenchmarkCliArgs {
  harnessId: string;
  dashboardCommitWindow?: number;
  labviewCliPath?: string;
  labviewExePath?: string;
  strictRsrcHeader: boolean;
  helpRequested: boolean;
}

export interface GitHubLinuxDashboardBenchmarkSummary {
  schema: 'vi-history-suite/github-linux-dashboard-benchmark@v1';
  benchmarkId: 'GITHUB-VHS-LINUX-DASHBOARD-BENCHMARK';
  harnessId: string;
  repositoryUrl: string;
  targetRelativePath: string;
  runtimePlatform: 'linux';
  runtimeImage: string;
  benchmarkImage?: {
    reference?: string;
    digest?: string;
  };
  headlessDisplayProvider?: string;
  startedAt: string;
  completedAt: string;
  wallClockSeconds: number;
  dashboardCommitWindow: number;
  comparePairCount: number;
  generatedReportCount: number;
  blockedPairCount: number;
  failedPairCount: number;
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
  comparabilityState: HarnessDashboardSmokeReport['comparabilityState'];
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
    pairFailureReceiptPath?: string;
  };
}

export interface GitHubLinuxDashboardBenchmarkPairFailureReceipt {
  schema: 'vi-history-suite/github-linux-dashboard-benchmark-pair-failure@v1';
  benchmarkId: 'GITHUB-VHS-LINUX-DASHBOARD-BENCHMARK';
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
  runtimeFailureReason?: string;
  runtimeDiagnosticReason?: string;
  runtimeDiagnosticNotes?: string[];
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

export interface GitHubLinuxDashboardBenchmarkProgressRecord {
  schema: 'vi-history-suite/github-linux-dashboard-benchmark-progress@v1';
  benchmarkId: 'GITHUB-VHS-LINUX-DASHBOARD-BENCHMARK';
  harnessId: string;
  targetRelativePath: string;
  recordedAt: string;
  phase: 'starting' | 'running' | 'completed' | 'failed';
  message: string;
}

export interface GitHubLinuxDashboardBenchmarkCliDeps {
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
  pathExists?: (filePath: string) => Promise<boolean>;
  hostPlatform?: NodeJS.Platform;
  now?: () => Date;
}

export function getGitHubLinuxDashboardBenchmarkUsage(): string {
  return [
    'Usage: runGitHubLinuxDashboardBenchmark [--harness-id <id>] [--dashboard-commit-window <count>] [--labview-cli-path <path>] [--labview-exe-path <path>] [--strict-rsrc-header] [--help]',
    '',
    'Options:',
    '  --harness-id <id>              Canonical harness id. Defaults to HARNESS-VHS-001 for the GitHub-hosted benchmark lane.',
    '  --dashboard-commit-window <n>  Limit the retained dashboard window to at least 3 commits. Defaults to 1000 for the hosted benchmark lane.',
    '  --labview-cli-path <path>      Provide an explicit LabVIEWCLI path.',
    '  --labview-exe-path <path>      Provide an explicit LabVIEW executable path.',
    '  --strict-rsrc-header           Require RSRC header validation during VI detection.',
    '  --help                         Print this help and exit without running the benchmark.'
  ].join('\n');
}

export function parseGitHubLinuxDashboardBenchmarkArgs(
  argv: string[]
): GitHubLinuxDashboardBenchmarkCliArgs {
  let harnessId = 'HARNESS-VHS-001';
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
          `Missing value for ${flag}.\n\n${getGitHubLinuxDashboardBenchmarkUsage()}`
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
          `Unsupported value for --dashboard-commit-window: ${String(candidate)}\n\n${getGitHubLinuxDashboardBenchmarkUsage()}`
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

    throw new Error(`Unknown argument: ${current}\n\n${getGitHubLinuxDashboardBenchmarkUsage()}`);
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
      runtimePlatform: 'linux',
      labviewCliPath,
      labviewExePath
    },
    getGitHubLinuxDashboardBenchmarkUsage()
  );
  return parsedArgs;
}

export async function runGitHubLinuxDashboardBenchmarkCli(
  argv: string[],
  deps: GitHubLinuxDashboardBenchmarkCliDeps = {}
): Promise<'pass' | 'help'> {
  const args = parseGitHubLinuxDashboardBenchmarkArgs(argv);
  const stdout = deps.stdout ?? process.stdout;

  if (args.helpRequested) {
    stdout.write(`${getGitHubLinuxDashboardBenchmarkUsage()}\n`);
    return 'help';
  }

  const effectiveRuntimeOverrides = resolveCanonicalRuntimeOverrideArgs({
    runtimePlatform: 'linux',
    labviewCliPath: args.labviewCliPath,
    labviewExePath: args.labviewExePath
  });
  validateCanonicalRuntimeOverrideArgs(
    effectiveRuntimeOverrides,
    getGitHubLinuxDashboardBenchmarkUsage()
  );
  await validateCanonicalRuntimeOverrideExecutionSurface(
    effectiveRuntimeOverrides,
    getGitHubLinuxDashboardBenchmarkUsage(),
    {
      pathExists: deps.pathExists ?? defaultPathExists,
      hostPlatform: deps.hostPlatform ?? process.platform
    }
  );

  const repoRoot = deps.repoRoot ?? path.resolve(__dirname, '..', '..');
  const cloneRoot = path.resolve(repoRoot, '.cache', 'harnesses');
  const reportRoot = path.resolve(repoRoot, '.cache', 'harness-reports');
  const benchmarkRoot = path.resolve(
    repoRoot,
    '.cache',
    'github-experiments',
    'linux-dashboard-benchmark',
    args.harnessId
  );
  const harnessDefinition = getCanonicalHarnessDefinition(args.harnessId);
  const now = deps.now ?? (() => new Date());
  const startedAtDate = now();
  const latestProgressPath = path.join(benchmarkRoot, 'latest-progress.json');
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const pathExists = deps.pathExists ?? defaultPathExists;
  const runtimePairTimeoutMs = readPositiveIntegerEnv(
    'VIHS_GITHUB_BENCHMARK_PAIR_TIMEOUT_MS',
    DEFAULT_BENCHMARK_PAIR_TIMEOUT_MS
  );
  const runtimeHeartbeatIntervalMs = readPositiveIntegerEnv(
    'VIHS_GITHUB_BENCHMARK_HEARTBEAT_INTERVAL_MS',
    DEFAULT_BENCHMARK_HEARTBEAT_INTERVAL_MS
  );

  await mkdir(benchmarkRoot, { recursive: true });
  const writeProgress = async (
    phase: GitHubLinuxDashboardBenchmarkProgressRecord['phase'],
    message: string
  ): Promise<void> => {
    stdout.write(`VIHS_PROGRESS: ${message}\n`);
    await writeFile(
      latestProgressPath,
      `${JSON.stringify(
        {
          schema: 'vi-history-suite/github-linux-dashboard-benchmark-progress@v1',
          benchmarkId: 'GITHUB-VHS-LINUX-DASHBOARD-BENCHMARK',
          harnessId: args.harnessId,
          targetRelativePath: harnessDefinition.targetRelativePath,
          recordedAt: now().toISOString(),
          phase,
          message
        } satisfies GitHubLinuxDashboardBenchmarkProgressRecord,
        null,
        2
      )}\n`
    );
  };

  await writeProgress(
    'starting',
    `Preparing the Linux benchmark workspace for ${args.harnessId}.`
  );

  let result: Awaited<ReturnType<typeof runHarnessDashboardSmoke>>;
  try {
    result = await (deps.runner ?? runHarnessDashboardSmoke)(args.harnessId, {
      cloneRoot,
      reportRoot,
      strictRsrcHeader: args.strictRsrcHeader,
      runtimePlatform: 'linux',
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
  const summary = buildGitHubLinuxDashboardBenchmarkSummary(result, {
    startedAt: startedAtDate,
    completedAt: completedAtDate,
    benchmarkRoot,
    runtimeImage:
      process.env.VIHS_GITHUB_BENCHMARK_RUNTIME_IMAGE ??
      process.env.COMPAREVI_NI_LINUX_IMAGE ??
      'nationalinstruments/labview:2026q1-linux'
  });
  const runSummaryPath = path.join(
    benchmarkRoot,
    `${summary.completedAt.replaceAll(':', '').replaceAll('.', '').replace('T', '-').replace('Z', '')}.json`
  );
  const latestSummaryPath = path.join(benchmarkRoot, 'latest-summary.json');
  summary.retainedArtifacts.runSummaryPath = runSummaryPath;
  summary.retainedArtifacts.latestSummaryPath = latestSummaryPath;
  if (summary.completionState === 'failed') {
    const failureReceipt = await buildGitHubLinuxDashboardBenchmarkPairFailureReceipt(
      summary,
      result.report,
      pathExists,
      completedAtDate
    );
    if (failureReceipt) {
      const pairFailureReceiptPath = path.join(
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
  await writeFile(
    latestSummaryPath,
    `${JSON.stringify(summary, null, 2)}\n`
  );
  if (summary.completionState === 'failed') {
    const failureMessage =
      summary.terminalPairIndex === undefined
        ? `Linux benchmark failed after processing ${summary.processedPairCount}/${summary.comparePairCount} pair(s).`
        : `Linux benchmark failed at pair ${summary.terminalPairIndex}/${summary.comparePairCount}: ${summary.terminalPairFailureReason ?? 'runtime-execution-failed'}${
            summary.terminalPairDiagnosticReason
              ? ` (${summary.terminalPairDiagnosticReason})`
              : ''
          }.`;
    await writeProgress('failed', failureMessage);
    throw new Error(failureMessage);
  }

  await writeProgress(
    'completed',
    `Completed ${summary.comparePairCount} compare pair(s); generated=${summary.generatedReportCount}, blocked=${summary.blockedPairCount}, failed=${summary.failedPairCount}.`
  );

  for (const line of formatGitHubLinuxDashboardBenchmarkSuccess(summary)) {
    stdout.write(`${line}\n`);
  }

  return 'pass';
}

export function buildGitHubLinuxDashboardBenchmarkSummary(
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
): GitHubLinuxDashboardBenchmarkSummary {
  const totalPairPreparationSeconds = roundSeconds(
    result.report.pairSummaries.reduce(
      (sum, pair) => sum + pair.actualPreparationSeconds,
      0
    )
  );
  const pairCount = result.report.pairSummaries.length;
  const blockedPairCount = result.report.pairSummaries.filter(
    (pair) => pair.reportStatus === 'blocked-preflight' || pair.reportStatus === 'blocked-runtime'
  ).length;
  const failedPairCount = result.report.pairSummaries.filter(
    (pair) => pair.runtimeExecutionState === 'failed'
  ).length;
  const noGeneratedReportPairCount = result.report.pairSummaries.filter(
    (pair) =>
      !pair.generatedReportExists &&
      pair.reportStatus === 'ready-for-runtime' &&
      pair.runtimeExecutionState !== 'failed'
  ).length;
  const providerCounts = result.report.pairSummaries.reduce<Record<string, number>>((counts, pair) => {
    const key = pair.runtimeProvider?.trim() || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const etaAccuracy = result.report.dashboardEtaAccuracyRecord;
  const terminalPair =
    result.report.terminalPairIndex === undefined
      ? undefined
      : result.report.pairSummaries.find(
          (pair) => pair.pairIndex === result.report.terminalPairIndex
        );
  const benchmarkImageReference = process.env.VIHS_GITHUB_BENCHMARK_IMAGE_REF;
  const benchmarkImageDigest = process.env.VIHS_GITHUB_BENCHMARK_IMAGE_DIGEST;
  const headlessDisplayProvider = process.env.VIHS_GITHUB_BENCHMARK_HEADLESS_DISPLAY_PROVIDER;

  return {
    schema: 'vi-history-suite/github-linux-dashboard-benchmark@v1',
    benchmarkId: 'GITHUB-VHS-LINUX-DASHBOARD-BENCHMARK',
    harnessId: result.report.harnessId,
    repositoryUrl: result.report.repositoryUrl,
    targetRelativePath: result.report.targetRelativePath,
    runtimePlatform: 'linux',
    runtimeImage: options.runtimeImage,
    benchmarkImage:
      benchmarkImageReference || benchmarkImageDigest
        ? {
            reference: benchmarkImageReference,
            digest: benchmarkImageDigest
          }
        : undefined,
    headlessDisplayProvider: headlessDisplayProvider?.trim() || undefined,
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
    noGeneratedReportPairCount,
    totalPairPreparationSeconds,
    meanPairPreparationSeconds: roundSeconds(
      pairCount === 0 ? 0 : totalPairPreparationSeconds / pairCount
    ),
    maxPairPreparationSeconds: roundSeconds(
      Math.max(0, ...result.report.pairSummaries.map((pair) => pair.actualPreparationSeconds))
    ),
    dashboardWindowCompletenessState: result.report.dashboardWindowCompletenessState,
    completionState: result.report.completionState,
    processedPairCount: result.report.processedPairCount,
    terminalPairIndex: result.report.terminalPairIndex,
    terminalPairFailureReason: result.report.terminalPairFailureReason,
    terminalPairDiagnosticReason: terminalPair?.runtimeDiagnosticReason,
    terminalPairDiagnosticNotes: terminalPair?.runtimeDiagnosticNotes,
    terminalOutcome:
      result.report.completionState !== 'failed'
        ? 'completed'
        : result.report.terminalPairFailureReason === 'command-timed-out'
          ? 'runtime-timed-out'
          : 'runtime-failed',
    comparabilityState: result.report.comparabilityState,
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
      latestSummaryPath: path.join(options.benchmarkRoot, 'latest-summary.json'),
      runSummaryPath: path.join(options.benchmarkRoot, 'pending-run-summary.json')
    }
  };
}

export function formatGitHubLinuxDashboardBenchmarkSuccess(
  summary: GitHubLinuxDashboardBenchmarkSummary
): string[] {
  const benchmarkImageSummary = summary.benchmarkImage?.reference
    ? `${summary.benchmarkImage.reference}${summary.benchmarkImage.digest ? `@${summary.benchmarkImage.digest}` : ''}`
    : undefined;

  return [
    `GitHub Linux dashboard benchmark completed for ${summary.harnessId}`,
    `Target: ${summary.targetRelativePath}`,
    `Runtime image: ${summary.runtimeImage}`,
    benchmarkImageSummary ? `Benchmark image: ${benchmarkImageSummary}` : undefined,
    summary.headlessDisplayProvider
      ? `Headless display: ${summary.headlessDisplayProvider}`
      : undefined,
    `Wall clock: ${summary.wallClockSeconds}s`,
    `Pair preparation total: ${summary.totalPairPreparationSeconds}s`,
    `Pair preparation mean/max: ${summary.meanPairPreparationSeconds}s / ${summary.maxPairPreparationSeconds}s`,
    `Completion: ${summary.completionState} (${summary.comparabilityState})`,
    `Pair outcomes: generated=${summary.generatedReportCount} blocked=${summary.blockedPairCount} failed=${summary.failedPairCount} no-generated=${summary.noGeneratedReportPairCount}`,
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

async function buildGitHubLinuxDashboardBenchmarkPairFailureReceipt(
  summary: GitHubLinuxDashboardBenchmarkSummary,
  report: HarnessDashboardSmokeReport,
  pathExists: (filePath: string) => Promise<boolean>,
  recordedAt: Date
): Promise<GitHubLinuxDashboardBenchmarkPairFailureReceipt | undefined> {
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
    schema: 'vi-history-suite/github-linux-dashboard-benchmark-pair-failure@v1',
    benchmarkId: 'GITHUB-VHS-LINUX-DASHBOARD-BENCHMARK',
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
    runtimeFailureReason: pair.runtimeFailureReason,
    runtimeDiagnosticReason: pair.runtimeDiagnosticReason,
    runtimeDiagnosticNotes: pair.runtimeDiagnosticNotes,
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

export async function runGitHubLinuxDashboardBenchmarkCliMain(
  argv: string[] = process.argv.slice(2),
  deps: GitHubLinuxDashboardBenchmarkCliDeps = {},
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): Promise<number> {
  try {
    await runGitHubLinuxDashboardBenchmarkCli(argv, deps);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export function applyGitHubLinuxDashboardBenchmarkCliExitCode(
  exitCode: number,
  processLike: Pick<NodeJS.Process, 'exitCode'> = process
): number {
  processLike.exitCode = exitCode;
  return exitCode;
}

export function maybeRunGitHubLinuxDashboardBenchmarkCliAsMain(
  argv: string[] = process.argv.slice(2),
  mainModule: NodeModule | undefined = require.main,
  currentModule: NodeModule = module,
  deps: GitHubLinuxDashboardBenchmarkCliDeps = {},
  processLike: Pick<NodeJS.Process, 'exitCode'> = process,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): boolean {
  if (mainModule !== currentModule) {
    return false;
  }

  void argv;
  void deps;
  return maybeRejectGovernedProofLegacyEntrypointAsMain(
    'benchmark-linux',
    mainModule,
    currentModule,
    processLike,
    stderr
  );
}

maybeRunGitHubLinuxDashboardBenchmarkCliAsMain();
