#!/usr/bin/env node

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_GITHUB_REPOSITORY = 'svelderrainruiz/vi-history-suite-source-experiments';
const DEFAULT_HARNESS_ID = 'HARNESS-VHS-002';
const DEFAULT_WORKFLOW_NAME = 'Linux Runtime Benchmark Experiment';
const SUMMARY_FILENAME = 'latest-summary.json';
const IMAGE_RECEIPT_FILENAME = 'latest-image.json';
const BENCHMARK_SCHEMA = 'vi-history-suite/github-linux-dashboard-benchmark@v1';

function main() {
  const options = parseArgs(process.argv.slice(2));
  const latest = findLatestGitHubLinuxBenchmark(options.repoRoot, options);
  if (!latest) {
    console.error('No retained GitHub Linux benchmark metadata was discovered.');
    process.exitCode = 1;
    return;
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(latest, null, 2)}\n`);
    return;
  }
  process.stdout.write(formatLatestGitHubLinuxBenchmark(latest));
}

function parseArgs(args) {
  const repoRoot = path.resolve(__dirname, '..');
  let json = false;
  let cachedOnly = false;
  let refresh = false;
  let repository = DEFAULT_GITHUB_REPOSITORY;
  let harnessId = DEFAULT_HARNESS_ID;
  let runId;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const requireValue = (flag) => {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.`);
      }
      index += 1;
      return value;
    };

    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--cached-only') {
      cachedOnly = true;
      continue;
    }
    if (arg === '--refresh') {
      refresh = true;
      continue;
    }
    if (arg === '--repo') {
      repository = requireValue('--repo');
      continue;
    }
    if (arg === '--harness-id') {
      harnessId = requireValue('--harness-id');
      continue;
    }
    if (arg === '--run-id') {
      const candidate = Number.parseInt(requireValue('--run-id'), 10);
      if (!Number.isFinite(candidate) || candidate <= 0) {
        throw new Error(`Unsupported value for --run-id: ${String(candidate)}`);
      }
      runId = candidate;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    repoRoot,
    json,
    cachedOnly,
    refresh,
    repository,
    harnessId,
    runId
  };
}

function findLatestGitHubLinuxBenchmark(repoRoot, options = {}, deps = {}) {
  const cacheRoot = path.join(repoRoot, '.cache', 'github-experiment-downloads');
  const cachedCandidates = findCachedBenchmarkCandidates(cacheRoot, options.harnessId);

  if (!options.cachedOnly) {
    const run =
      typeof options.runId === 'number'
        ? getRunById(options.repository, options.runId, deps)
        : getLatestSuccessfulWorkflowDispatchRun(options.repository, deps);
    if (run) {
      const download = ensureRunArtifactsDownloaded(cacheRoot, run, options, deps);
      const liveCandidate = buildCandidateFromRunDirectory(
        download.runDirectory,
        options.harnessId,
        run,
        download.cacheState
      );
      if (liveCandidate) {
        return liveCandidate;
      }
    }
  }

  if (cachedCandidates.length === 0) {
    return undefined;
  }
  cachedCandidates.sort(compareBenchmarkCandidates);
  return cachedCandidates[0];
}

function getLatestSuccessfulWorkflowDispatchRun(repository, deps = {}) {
  const gh = deps.execFileSync ?? childProcess.execFileSync;
  const stdout = gh(
    'gh',
    [
      'run',
      'list',
      '-R',
      repository,
      '--workflow',
      DEFAULT_WORKFLOW_NAME,
      '--limit',
      '20',
      '--json',
      'databaseId,status,conclusion,event,createdAt,updatedAt,headSha,headBranch,url,displayTitle'
    ],
    { encoding: 'utf8' }
  );
  return selectLatestBenchmarkRun(JSON.parse(stdout));
}

function getRunById(repository, runId, deps = {}) {
  const gh = deps.execFileSync ?? childProcess.execFileSync;
  const stdout = gh(
    'gh',
    [
      'run',
      'view',
      String(runId),
      '-R',
      repository,
      '--json',
      'databaseId,status,conclusion,event,createdAt,updatedAt,headSha,headBranch,url,displayTitle'
    ],
    { encoding: 'utf8' }
  );
  const parsed = JSON.parse(stdout);
  return parsed.databaseId ? parsed : undefined;
}

function selectLatestBenchmarkRun(runs) {
  return [...runs]
    .filter(
      (run) =>
        run &&
        run.event === 'workflow_dispatch' &&
        run.status === 'completed' &&
        run.conclusion === 'success'
    )
    .sort((left, right) => {
      const rightTimestamp = Date.parse(right.updatedAt ?? right.createdAt ?? '');
      const leftTimestamp = Date.parse(left.updatedAt ?? left.createdAt ?? '');
      if (rightTimestamp !== leftTimestamp) {
        return rightTimestamp - leftTimestamp;
      }
      return Number(right.databaseId ?? 0) - Number(left.databaseId ?? 0);
    })[0];
}

function ensureRunArtifactsDownloaded(cacheRoot, run, options, deps = {}) {
  const gh = deps.execFileSync ?? childProcess.execFileSync;
  const existsSync = deps.existsSync ?? fs.existsSync;
  const mkdirSync = deps.mkdirSync ?? fs.mkdirSync;
  const rmSync = deps.rmSync ?? fs.rmSync;
  const renameSync = deps.renameSync ?? fs.renameSync;

  const runDirectory = path.join(cacheRoot, `run-${run.databaseId}`);
  const summaryPath = findBenchmarkSummaryPath(runDirectory, options.harnessId);
  if (!options.refresh && summaryPath && existsSync(summaryPath)) {
    return { runDirectory, cacheState: 'cached' };
  }

  const tempDirectory = `${runDirectory}.tmp-${Date.now()}`;
  rmSync(tempDirectory, { recursive: true, force: true });
  mkdirSync(tempDirectory, { recursive: true });
  try {
    gh(
      'gh',
      ['run', 'download', String(run.databaseId), '-R', options.repository, '-D', tempDirectory],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    rmSync(runDirectory, { recursive: true, force: true });
    renameSync(tempDirectory, runDirectory);
  } catch (error) {
    rmSync(tempDirectory, { recursive: true, force: true });
    if (summaryPath && existsSync(summaryPath)) {
      return { runDirectory, cacheState: 'cached-download-failed' };
    }
    throw error;
  }

  return { runDirectory, cacheState: 'downloaded' };
}

function buildCandidateFromRunDirectory(runDirectory, harnessId, run, cacheState) {
  const summaryPath = findBenchmarkSummaryPath(runDirectory, harnessId);
  if (!summaryPath) {
    return undefined;
  }
  const summary = tryReadJson(summaryPath);
  if (!summary || summary.schema !== BENCHMARK_SCHEMA) {
    return undefined;
  }
  const imageReceiptPath = findImageReceiptPath(runDirectory);
  const imageReceipt = imageReceiptPath ? tryReadJson(imageReceiptPath) : undefined;
  return {
    mode: 'github-run-artifact',
    repository: DEFAULT_GITHUB_REPOSITORY,
    workflow: DEFAULT_WORKFLOW_NAME,
    harnessId,
    run: {
      databaseId: Number(run?.databaseId ?? 0),
      url: run?.url,
      event: run?.event,
      status: run?.status,
      conclusion: run?.conclusion,
      headSha: run?.headSha,
      headBranch: run?.headBranch,
      createdAt: run?.createdAt,
      updatedAt: run?.updatedAt,
      displayTitle: run?.displayTitle
    },
    cacheState,
    artifactRoot: runDirectory,
    summaryPath,
    imageReceiptPath,
    imageReceipt,
    summary,
    sortTimestamp: parseTimestamp(summary.completedAt ?? run?.updatedAt, summaryPath)
  };
}

function findCachedBenchmarkCandidates(cacheRoot, harnessId) {
  if (!fs.existsSync(cacheRoot)) {
    return [];
  }

  const candidates = [];
  for (const entry of safeReadDir(cacheRoot)) {
    if (!entry.startsWith('run-')) {
      continue;
    }
    const runDirectory = path.join(cacheRoot, entry);
    const summaryPath = findBenchmarkSummaryPath(runDirectory, harnessId);
    if (!summaryPath) {
      continue;
    }
    const summary = tryReadJson(summaryPath);
    if (!summary || summary.schema !== BENCHMARK_SCHEMA) {
      continue;
    }
    const imageReceiptPath = findImageReceiptPath(runDirectory);
    candidates.push({
      mode: 'cached-github-run-artifact',
      repository: DEFAULT_GITHUB_REPOSITORY,
      workflow: DEFAULT_WORKFLOW_NAME,
      harnessId,
      run: {
        databaseId: parseCachedRunId(entry)
      },
      cacheState: 'cached',
      artifactRoot: runDirectory,
      summaryPath,
      imageReceiptPath,
      imageReceipt: imageReceiptPath ? tryReadJson(imageReceiptPath) : undefined,
      summary,
      sortTimestamp: parseTimestamp(summary.completedAt, summaryPath)
    });
  }
  return candidates;
}

function parseCachedRunId(entryName) {
  const candidate = Number.parseInt(entryName.replace(/^run-/, ''), 10);
  return Number.isFinite(candidate) ? candidate : 0;
}

function findBenchmarkSummaryPath(root, harnessId) {
  return findFilesNamed(root, SUMMARY_FILENAME).find((filePath) =>
    filePath.includes(
      `${path.sep}github-experiments${path.sep}linux-dashboard-benchmark${path.sep}${harnessId}${path.sep}${SUMMARY_FILENAME}`
    )
  );
}

function findImageReceiptPath(root) {
  return findFilesNamed(root, IMAGE_RECEIPT_FILENAME).find((filePath) =>
    filePath.includes(
      `${path.sep}linux-runtime-benchmark-image${path.sep}${IMAGE_RECEIPT_FILENAME}`
    )
  );
}

function findFilesNamed(root, filename) {
  const results = [];
  if (!fs.existsSync(root)) {
    return results;
  }
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name === filename) {
        results.push(entryPath);
      }
    }
  }
  return results;
}

function tryReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function parseTimestamp(timestamp, fallbackPath) {
  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return Date.parse(fs.statSync(fallbackPath).mtime.toISOString());
}

function compareBenchmarkCandidates(left, right) {
  return right.sortTimestamp - left.sortTimestamp;
}

function safeReadDir(root) {
  try {
    return fs.readdirSync(root);
  } catch {
    return [];
  }
}

function formatLatestGitHubLinuxBenchmark(candidate) {
  const lines = [
    `discovery: ${candidate.mode}`,
    `repository: ${candidate.repository ?? DEFAULT_GITHUB_REPOSITORY}`,
    `runId: ${candidate.run?.databaseId ?? 'unknown'}`,
    `runUrl: ${candidate.run?.url ?? 'unknown'}`,
    `cacheState: ${candidate.cacheState}`,
    `completedAt: ${candidate.summary.completedAt}`,
    `target: ${candidate.summary.targetRelativePath}`,
    `runtimeImage: ${candidate.summary.runtimeImage}`,
    `benchmarkImage: ${formatBenchmarkImage(candidate.summary.benchmarkImage)}`,
    candidate.imageReceipt?.imageResolution
      ? `imageResolution: ${candidate.imageReceipt.imageResolution}`
      : undefined,
    candidate.summary.headlessDisplayProvider
      ? `headlessDisplay: ${candidate.summary.headlessDisplayProvider}`
      : undefined,
    `wallClockSeconds: ${candidate.summary.wallClockSeconds}`,
    `pairPreparationSeconds: ${candidate.summary.totalPairPreparationSeconds}`,
    `pairOutcomes: generated=${candidate.summary.generatedReportCount} blocked=${candidate.summary.blockedPairCount} failed=${candidate.summary.failedPairCount} noGenerated=${candidate.summary.noGeneratedReportPairCount}`,
    `providers: ${formatProviderCounts(candidate.summary.providerCounts)}`,
    `summary: ${candidate.summaryPath}`
  ].filter(Boolean);
  return `${lines.join('\n')}\n`;
}

function formatBenchmarkImage(benchmarkImage) {
  if (!benchmarkImage?.reference) {
    return 'unknown';
  }
  if (!benchmarkImage.digest) {
    return benchmarkImage.reference;
  }
  return `${benchmarkImage.reference}@${benchmarkImage.digest}`;
}

function formatProviderCounts(providerCounts) {
  const entries = Object.entries(providerCounts ?? {});
  if (entries.length === 0) {
    return 'none';
  }
  return entries
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([provider, count]) => `${provider}=${count}`)
    .join(', ');
}

module.exports = {
  DEFAULT_GITHUB_REPOSITORY,
  DEFAULT_HARNESS_ID,
  DEFAULT_WORKFLOW_NAME,
  findLatestGitHubLinuxBenchmark,
  formatLatestGitHubLinuxBenchmark,
  selectLatestBenchmarkRun
};

if (require.main === module) {
  main();
}
