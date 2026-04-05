import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  GitHubLinuxDashboardBenchmarkProgressRecord,
  GitHubLinuxDashboardBenchmarkSummary
} from '../cli/runGitHubLinuxDashboardBenchmark';
import {
  buildDashboardLatestRunFilePath,
  MultiReportDashboardLatestRunRecord
} from '../dashboard/dashboardLatestRun';
import { HARNESS_VHS_002 } from '../harness/canonicalHarnesses';
import {
  readProgramRepoJumpMap,
  resolveProgramRepoDescriptors
} from '../tooling/programRepoJump';

const HOST_LINUX_BENCHMARK_STALE_SECONDS = 600;
const HOST_LINUX_BENCHMARK_LOG_TAIL_LINE_COUNT = 16;
const HOST_LINUX_BENCHMARK_LAUNCH_RECEIPT_RELATIVE_PATH = path.join(
  '.cache',
  'host-linux-dashboard-benchmark',
  'latest-launch.json'
);
const HOST_LINUX_BENCHMARK_SUMMARY_RELATIVE_PATH = path.join(
  '.cache',
  'github-experiments',
  'linux-dashboard-benchmark',
  HARNESS_VHS_002.id,
  'latest-summary.json'
);
const HOST_LINUX_BENCHMARK_PROGRESS_RELATIVE_PATH = path.join(
  '.cache',
  'github-experiments',
  'linux-dashboard-benchmark',
  HARNESS_VHS_002.id,
  'latest-progress.json'
);
const HOST_LINUX_BENCHMARK_REPORT_ROOT_RELATIVE_PATH = path.join(
  '.cache',
  'harness-reports',
  HARNESS_VHS_002.id,
  'workspace-storage',
  'reports'
);
const HOST_LINUX_BENCHMARK_CONTAINER_NAME = 'vihs-host-linux-benchmark';

export interface HostLinuxBenchmarkLaunchReceipt {
  startedAt?: string;
  pid?: number;
  logPath?: string;
  repoPath?: string;
  sourceAuthorityRepoPath?: string;
  image?: string;
  sourceCommit?: string;
}

export interface BenchmarkStatusWindowsBaselineSummary {
  state: 'missing' | 'available' | 'different-target';
  latestRunPath?: string;
  relativePath?: string;
  generatedAt?: string;
  comparePairCount?: number;
  preparedPairCount?: number;
  generatedReportCount?: number;
  providerSummary?: string;
  totalDurationMs?: number;
  evidencePreparationDurationMs?: number;
  etaMeanAbsolutePercentageError?: number;
}

export interface BenchmarkStatusHostLinuxSummary {
  state: 'missing' | 'running' | 'stalled' | 'completed' | 'failed';
  benchmarkWorkspaceRoot?: string;
  launchReceiptPath?: string;
  latestSummaryPath?: string;
  latestProgressPath?: string;
  reportRoot?: string;
  launchReceipt?: HostLinuxBenchmarkLaunchReceipt;
  latestSummary?: GitHubLinuxDashboardBenchmarkSummary;
  latestProgress?: GitHubLinuxDashboardBenchmarkProgressRecord;
  logPath?: string;
  logUpdatedAt?: string;
  secondsSinceLogUpdate?: number;
  latestLogLines: string[];
  latestLogLine?: string;
  materializedMetadataCount?: number;
  statusSummary: string;
}

export interface BenchmarkStatusSnapshot {
  recordedAt: string;
  harnessId: string;
  targetRelativePath: string;
  windowsBaseline: BenchmarkStatusWindowsBaselineSummary;
  hostLinux: BenchmarkStatusHostLinuxSummary;
}

export interface BenchmarkStatusDeps {
  now?: () => Date;
  readFile?: typeof fs.readFile;
  stat?: typeof fs.stat;
  readdir?: typeof fs.readdir;
  resolveContainerState?: (
    containerName: string
  ) => Promise<'running' | 'missing' | 'unknown'>;
}

export async function loadBenchmarkStatusSnapshot(
  authorityRepoRoot: string,
  workspaceStorageRoot: string | undefined,
  deps: BenchmarkStatusDeps = {}
): Promise<BenchmarkStatusSnapshot> {
  const now = deps.now ?? (() => new Date());
  const [windowsBaseline, hostLinux] = await Promise.all([
    loadWindowsBaselineSummary(workspaceStorageRoot, deps),
    loadHostLinuxSummary(authorityRepoRoot, now(), deps)
  ]);

  return {
    recordedAt: now().toISOString(),
    harnessId: HARNESS_VHS_002.id,
    targetRelativePath: HARNESS_VHS_002.targetRelativePath,
    windowsBaseline,
    hostLinux
  };
}

export function resolveExperimentRepoRootFromAuthorityRepo(authorityRepoRoot: string): string {
  try {
    const map = readProgramRepoJumpMap(authorityRepoRoot);
    const [resolved] = resolveProgramRepoDescriptors(
      map,
      authorityRepoRoot,
      'vi-history-suite-source-experiments'
    );
    if (resolved?.localPathResolved) {
      return resolved.localPathResolved;
    }
  } catch {
    // Fall back to the governed sibling convention if the repo-jump map is unavailable.
  }

  return path.resolve(authorityRepoRoot, '..', 'vi-history-suite-source-experiments');
}

async function loadWindowsBaselineSummary(
  workspaceStorageRoot: string | undefined,
  deps: BenchmarkStatusDeps
): Promise<BenchmarkStatusWindowsBaselineSummary> {
  if (!workspaceStorageRoot) {
    return {
      state: 'missing'
    };
  }

  const latestRunPath = buildDashboardLatestRunFilePath(workspaceStorageRoot);
  const latestRun = await tryReadJson<MultiReportDashboardLatestRunRecord>(latestRunPath, deps);
  if (!latestRun) {
    return {
      state: 'missing',
      latestRunPath
    };
  }

  const comparePairCount =
    latestRun.dashboard.commitWindow?.pairCount ??
    latestRun.dashboard.summary.representedPairCount ??
    undefined;
  const preparedPairCount = latestRun.preparationSummary?.preparedPairCount;
  const generatedReportCount =
    latestRun.dashboard.summary.generatedReportCount ??
    latestRun.preparationSummary?.preparedGeneratedReportCount;
  const providerSummary = latestRun.dashboard.summary.providerSummaries?.length
    ? latestRun.dashboard.summary.providerSummaries
        .map((summary) => `${summary.label} (${summary.pairCount})`)
        .join(', ')
    : undefined;

  return {
    state:
      latestRun.dashboard.relativePath === HARNESS_VHS_002.targetRelativePath
        ? 'available'
        : 'different-target',
    latestRunPath,
    relativePath: latestRun.dashboard.relativePath,
    generatedAt: latestRun.dashboard.generatedAt,
    comparePairCount,
    preparedPairCount,
    generatedReportCount,
    providerSummary,
    totalDurationMs: latestRun.experiment?.timings.totalDurationMs,
    evidencePreparationDurationMs:
      latestRun.experiment?.timings.evidencePreparationDurationMs,
    etaMeanAbsolutePercentageError:
      latestRun.etaAccuracyRecord?.meanAbsolutePercentageError
  };
}

async function loadHostLinuxSummary(
  benchmarkWorkspaceRoot: string,
  now: Date,
  deps: BenchmarkStatusDeps
): Promise<BenchmarkStatusHostLinuxSummary> {
  const launchReceiptPath = path.join(
    benchmarkWorkspaceRoot,
    HOST_LINUX_BENCHMARK_LAUNCH_RECEIPT_RELATIVE_PATH
  );
  const latestSummaryPath = path.join(
    benchmarkWorkspaceRoot,
    HOST_LINUX_BENCHMARK_SUMMARY_RELATIVE_PATH
  );
  const latestProgressPath = path.join(
    benchmarkWorkspaceRoot,
    HOST_LINUX_BENCHMARK_PROGRESS_RELATIVE_PATH
  );
  const reportRoot = path.join(
    benchmarkWorkspaceRoot,
    HOST_LINUX_BENCHMARK_REPORT_ROOT_RELATIVE_PATH
  );

  const [
    launchReceipt,
    latestSummary,
    latestProgress,
    materializedMetadataCount,
    liveContainerState
  ] = await Promise.all([
    tryReadJson<HostLinuxBenchmarkLaunchReceipt>(launchReceiptPath, deps),
    tryReadJson<GitHubLinuxDashboardBenchmarkSummary>(latestSummaryPath, deps),
    tryReadJson<GitHubLinuxDashboardBenchmarkProgressRecord>(latestProgressPath, deps),
    countFilesNamed(reportRoot, 'report-metadata.json', deps),
    (deps.resolveContainerState ?? resolveHostLinuxBenchmarkContainerState)(
      HOST_LINUX_BENCHMARK_CONTAINER_NAME
    )
  ]);

  const logPath = launchReceipt?.logPath;
  const logStat = logPath ? await tryStat(logPath, deps) : undefined;
  const latestLogLines = logPath
    ? await readTailLines(logPath, HOST_LINUX_BENCHMARK_LOG_TAIL_LINE_COUNT, deps)
    : [];
  const latestLogLine =
    latestLogLines.length > 0 ? latestLogLines[latestLogLines.length - 1] : undefined;
  const logUpdatedAt = logStat?.mtime.toISOString();
  const secondsSinceLogUpdate = logStat
    ? roundSeconds((now.getTime() - logStat.mtime.getTime()) / 1000)
    : undefined;

  const launchStartedAtMs = parseTimestamp(launchReceipt?.startedAt);
  const latestSummaryCompletedAtMs = parseTimestamp(latestSummary?.completedAt);
  const hasFreshSummary =
    latestSummaryCompletedAtMs !== undefined &&
    (launchStartedAtMs === undefined || latestSummaryCompletedAtMs >= launchStartedAtMs);

  if (hasFreshSummary && latestSummary) {
    return {
      state:
        latestSummary.completionState === 'failed' ? 'failed' : 'completed',
      benchmarkWorkspaceRoot,
      launchReceiptPath,
      latestSummaryPath,
      latestProgressPath,
      reportRoot,
      launchReceipt,
      latestSummary,
      latestProgress,
      logPath,
      logUpdatedAt,
      secondsSinceLogUpdate,
      latestLogLines,
      latestLogLine,
      materializedMetadataCount,
      statusSummary:
        latestSummary.completionState === 'failed'
          ? `Failed. The latest retained Linux benchmark summary stopped at pair ${String(
              latestSummary.terminalPairIndex ?? 'unknown'
            )}/${latestSummary.comparePairCount} with ${
              latestSummary.terminalPairFailureReason ?? 'runtime-execution-failed'
            }${
              latestSummary.terminalPairDiagnosticReason
                ? ` (${latestSummary.terminalPairDiagnosticReason})`
                : ''
            }.`
          : 'Completed. The latest retained Linux benchmark summary is newer than the current host launch receipt.'
    };
  }

  if (launchReceipt) {
    if (liveContainerState === 'missing') {
      return {
        state: 'missing',
        benchmarkWorkspaceRoot,
        launchReceiptPath,
        latestSummaryPath,
        latestProgressPath,
        reportRoot,
        launchReceipt,
        latestSummary,
        latestProgress,
        logPath,
        logUpdatedAt,
        secondsSinceLogUpdate,
        latestLogLines,
        latestLogLine,
        materializedMetadataCount,
        statusSummary:
          'A stale host Linux launch receipt exists, but no live host Linux benchmark container is present.'
      };
    }

    const stale =
      secondsSinceLogUpdate !== undefined &&
      secondsSinceLogUpdate >= HOST_LINUX_BENCHMARK_STALE_SECONDS;
    return {
      state: stale ? 'stalled' : 'running',
      benchmarkWorkspaceRoot,
      launchReceiptPath,
      latestSummaryPath,
      latestProgressPath,
      reportRoot,
      launchReceipt,
      latestSummary,
      latestProgress,
      logPath,
      logUpdatedAt,
      secondsSinceLogUpdate,
      latestLogLines,
      latestLogLine,
      materializedMetadataCount,
      statusSummary: stale
        ? latestProgress?.message
          ? `${latestProgress.message} The retained log has been quiet for about ${formatDurationSeconds(
              secondsSinceLogUpdate
            )}.`
          : `No completed Linux summary exists yet, and the retained log has been quiet for about ${formatDurationSeconds(
              secondsSinceLogUpdate
            )}.`
        : latestProgress?.message ??
          'The host Linux benchmark launch receipt exists and no completed summary has replaced it yet.'
    };
  }

  return {
    state: 'missing',
    benchmarkWorkspaceRoot,
    launchReceiptPath,
    latestSummaryPath,
    latestProgressPath,
    reportRoot,
    latestSummary,
    latestProgress,
    latestLogLines,
    materializedMetadataCount,
    statusSummary:
      'No host Linux benchmark launch receipt was discovered under the current authority workspace.'
  };
}

async function tryReadJson<T>(
  filePath: string,
  deps: BenchmarkStatusDeps
): Promise<T | undefined> {
  try {
    const text = await (deps.readFile ?? fs.readFile)(filePath, 'utf8');
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

async function tryStat(
  filePath: string,
  deps: BenchmarkStatusDeps
): Promise<Awaited<ReturnType<typeof fs.stat>> | undefined> {
  try {
    return await (deps.stat ?? fs.stat)(filePath);
  } catch {
    return undefined;
  }
}

async function readTailLines(
  filePath: string,
  maxLines: number,
  deps: BenchmarkStatusDeps
): Promise<string[]> {
  try {
    const text = await (deps.readFile ?? fs.readFile)(filePath, 'utf8');
    return text
      .split(/\r?\n/u)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0)
      .filter((line) => !line.includes('No such container: vihs-host-linux-benchmark'))
      .filter((line) => !line.startsWith('npm warn deprecated '))
      .slice(-maxLines);
  } catch {
    return [];
  }
}

async function countFilesNamed(
  root: string,
  fileName: string,
  deps: BenchmarkStatusDeps
): Promise<number | undefined> {
  const rootStat = await tryStat(root, deps);
  if (!rootStat?.isDirectory()) {
    return undefined;
  }

  let count = 0;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries: Array<{
      name: string;
      isDirectory(): boolean;
      isFile(): boolean;
    }>;
    try {
      entries = (await (deps.readdir ?? fs.readdir)(current, {
        withFileTypes: true
      })) as unknown as Array<{
        name: string;
        isDirectory(): boolean;
        isFile(): boolean;
      }>;
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryName = String(entry.name);
      const entryPath = path.join(current, entryName);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile() && entryName === fileName) {
        count += 1;
      }
    }
  }

  return count;
}

function parseTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatDurationSeconds(value: number): string {
  if (value >= 3600) {
    return `${roundSeconds(value / 3600)}h`;
  }
  if (value >= 60) {
    return `${roundSeconds(value / 60)}m`;
  }
  return `${roundSeconds(value)}s`;
}

async function resolveHostLinuxBenchmarkContainerState(
  containerName: string
): Promise<'running' | 'missing' | 'unknown'> {
  const result = spawnSync(
    'docker',
    [
      '--context',
      'desktop-linux',
      'ps',
      '-a',
      '--filter',
      `name=^/${containerName}$`,
      '--format',
      '{{.Status}}'
    ],
    {
      encoding: 'utf8'
    }
  );

  if (result.status !== 0) {
    return 'unknown';
  }

  const status = (result.stdout ?? '').trim();
  if (!status) {
    return 'missing';
  }

  return status.startsWith('Up ') ? 'running' : 'missing';
}
