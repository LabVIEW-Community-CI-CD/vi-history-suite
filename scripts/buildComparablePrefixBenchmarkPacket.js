#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const latestDashboardRun = require('./printLatestDashboardRun.js');

const TARGET_HARNESS_ID = 'HARNESS-VHS-002';
const TARGET_RELATIVE_PATH = 'resource/plugins/lv_icon.vi';
const HOST_LINUX_BENCHMARK_ROOT_RELATIVE_PATH = path.join(
  'AppData',
  'Local',
  'VI History Suite',
  'host-linux-dashboard-benchmark',
  'workspace-stage',
  'current'
);
const HOST_LINUX_SUMMARY_RELATIVE_PATH = path.join(
  '.cache',
  'github-experiments',
  'linux-dashboard-benchmark',
  TARGET_HARNESS_ID,
  'latest-summary.json'
);
const HOST_LINUX_SMOKE_RELATIVE_PATH = path.join(
  '.cache',
  'harness-reports',
  TARGET_HARNESS_ID,
  'dashboard-smoke.json'
);
const HOST_WINDOWS_BENCHMARK_ROOT_RELATIVE_PATH = path.join(
  'AppData',
  'Local',
  'VI History Suite',
  'windows-benchmark-image-proof'
);
const HOST_WINDOWS_SUMMARY_RELATIVE_PATH = path.join(
  'cache',
  'github-experiments',
  'windows-dashboard-benchmark',
  TARGET_HARNESS_ID,
  'latest-summary.json'
);
const HOST_WINDOWS_SMOKE_RELATIVE_PATH = path.join(
  'cache',
  'harness-reports',
  TARGET_HARNESS_ID,
  'dashboard-smoke.json'
);
const HOST_WINDOWS_EXACT_PAIR_SMOKE_RELATIVE_PATH = path.join(
  'cache',
  'harness-reports',
  TARGET_HARNESS_ID,
  'comparison-report-smoke.json'
);
const HOST_WINDOWS_EXACT_PAIR_ROOTS_BY_ENGINE = {
  'labview-cli': path.join(
    'AppData',
    'Local',
    'VI History Suite',
    'windows-benchmark-image-pair129-labviewcli'
  ),
  lvcompare: path.join(
    'AppData',
    'Local',
    'VI History Suite',
    'windows-benchmark-image-pair129-lvcompare'
  )
};
const DEFAULT_JSON_OUTPUT_RELATIVE_PATH = path.join(
  'docs',
  'product',
  'benchmark-packets',
  'HARNESS-VHS-002-comparable-prefix.json'
);
const DEFAULT_MARKDOWN_OUTPUT_RELATIVE_PATH = path.join(
  'docs',
  'product',
  'benchmark-packets',
  'HARNESS-VHS-002-comparable-prefix.md'
);
const PACKET_SCHEMA = 'vi-history-suite/comparable-prefix-benchmark-packet@v1';

function main() {
  const options = parseArgs(process.argv.slice(2));
  const packet = buildComparablePrefixBenchmarkPacket(options.repoRoot, options);
  if (options.write) {
    writeComparablePrefixBenchmarkPacket(packet, options);
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
    return;
  }
  process.stdout.write(formatComparablePrefixBenchmarkPacket(packet));
}

function parseArgs(args) {
  const repoRoot = path.resolve(__dirname, '..');
  let json = false;
  let write = false;
  let prefixPairCount;

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
    if (arg === '--write') {
      write = true;
      continue;
    }
    if (arg === '--prefix-pairs') {
      const candidate = Number.parseInt(requireValue('--prefix-pairs'), 10);
      if (!Number.isFinite(candidate) || candidate < 1) {
        throw new Error(`Unsupported value for --prefix-pairs: ${String(candidate)}`);
      }
      prefixPairCount = candidate;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    repoRoot,
    json,
    write,
    prefixPairCount,
    jsonOutputPath: path.join(repoRoot, DEFAULT_JSON_OUTPUT_RELATIVE_PATH),
    markdownOutputPath: path.join(repoRoot, DEFAULT_MARKDOWN_OUTPUT_RELATIVE_PATH)
  };
}

function buildComparablePrefixBenchmarkPacket(repoRoot, options = {}) {
  const windowsHost = loadWindowsHostSurface(repoRoot);
  const linuxHost = loadLinuxHostSurface(repoRoot);
  const windowsBenchmarkImage = loadWindowsBenchmarkImageSurface(repoRoot);
  const windowsExactPairDiagnostics = loadWindowsExactPairDiagnostics(repoRoot);
  const maxComparablePairCount = Math.min(
    windowsHost.validatedPrefix.validatedPairCount,
    linuxHost.validatedPrefix.validatedPairCount,
    windowsBenchmarkImage.validatedPrefix.validatedPairCount
  );
  const comparablePairCount = options.prefixPairCount ?? maxComparablePairCount;

  if (!Number.isFinite(comparablePairCount) || comparablePairCount < 1) {
    throw new Error(
      'Could not derive a comparable prefix pair count from the retained governed benchmark surfaces.'
    );
  }
  if (comparablePairCount > maxComparablePairCount) {
    throw new Error(
      `Requested comparable prefix ${String(comparablePairCount)} exceeds the validated governed ceiling ${String(maxComparablePairCount)}.`
    );
  }

  const windowsPrefix = summarizeDashboardPrefix(
    windowsHost.dashboardJsonPath,
    comparablePairCount,
    {
      linuxWorkspaceRoot: undefined
    }
  );
  const linuxPrefix = summarizeDashboardPrefix(linuxHost.dashboardJsonPath, comparablePairCount, {
    linuxWorkspaceRoot: linuxHost.workspaceRoot
  });
  const windowsBenchmarkImagePrefix = summarizeDashboardPrefix(
    windowsBenchmarkImage.dashboardJsonPath,
    comparablePairCount,
    {
      windowsWorkspaceRoot: windowsBenchmarkImage.windowsWorkspaceRoot
    }
  );

  if (
    windowsPrefix.lastPairId !== linuxPrefix.lastPairId ||
    windowsPrefix.lastPairId !== windowsBenchmarkImagePrefix.lastPairId
  ) {
    throw new Error(
      `Comparable-prefix mismatch: windowsHost=${String(windowsPrefix.lastPairId)} linuxHost=${String(linuxPrefix.lastPairId)} windowsBenchmarkImage=${String(windowsBenchmarkImagePrefix.lastPairId)}.`
    );
  }

  const windowsRuntimeTotalMs = windowsPrefix.runtimeTotalMs;
  const linuxRuntimeTotalMs = linuxPrefix.runtimeTotalMs;
  const windowsBenchmarkImageRuntimeTotalMs = windowsBenchmarkImagePrefix.runtimeTotalMs;
  const linuxVsWindowsRuntimeRatio =
    windowsRuntimeTotalMs > 0 ? linuxRuntimeTotalMs / windowsRuntimeTotalMs : undefined;
  const windowsVsLinuxSpeedupFactor =
    linuxRuntimeTotalMs > 0 ? windowsRuntimeTotalMs / linuxRuntimeTotalMs : undefined;

  return {
    schema: PACKET_SCHEMA,
    benchmarkId: 'HARNESS-VHS-002-comparable-prefix',
    generatedAt: new Date().toISOString(),
    harnessId: TARGET_HARNESS_ID,
    targetRelativePath: TARGET_RELATIVE_PATH,
    proofState: 'bounded-prefix-comparable',
    fullWindow: {
      dashboardCommitWindow:
        windowsHost.latestRun.record.dashboard.commitWindow?.commitCount ??
        linuxHost.summary.dashboardCommitWindow,
      comparePairCount:
        windowsHost.latestRun.record.dashboard.commitWindow?.pairCount ??
        linuxHost.summary.comparePairCount
    },
    comparablePrefix: {
      dashboardCommitWindow: comparablePairCount + 1,
      comparePairCount: comparablePairCount,
      lastComparablePairId: windowsPrefix.lastPairId
    },
    surfaces: {
      windowsHost: {
        state: 'available',
        latestRunPath: windowsHost.latestRun.manifestPath,
        dashboardJsonPath: windowsHost.dashboardJsonPath,
        recordedAt: windowsHost.latestRun.record.recordedAt,
        validatedComparablePairCount: windowsHost.validatedPrefix.validatedPairCount,
        firstInvalidPairIndex: windowsHost.validatedPrefix.firstInvalidPairIndex,
        firstInvalidPairId: windowsHost.validatedPrefix.firstInvalidPairId,
        firstInvalidReason: windowsHost.validatedPrefix.firstInvalidReason,
        providerSummaries:
          windowsHost.latestRun.record.dashboard.summary.providerSummaries ?? [],
        representedPairCount:
          windowsHost.latestRun.record.dashboard.summary.representedPairCount,
        comparablePrefixRuntimeTotalMs: windowsRuntimeTotalMs
      },
      linuxHost: {
        state: linuxHost.summary.completionState === 'completed' ? 'available' : 'bounded-blocked',
        latestSummaryPath: linuxHost.summaryPath,
        dashboardSmokePath: linuxHost.dashboardSmokePath,
        dashboardJsonPath: linuxHost.dashboardJsonPath,
        validatedComparablePairCount: linuxHost.validatedPrefix.validatedPairCount,
        firstInvalidPairIndex: linuxHost.validatedPrefix.firstInvalidPairIndex,
        firstInvalidPairId: linuxHost.validatedPrefix.firstInvalidPairId,
        firstInvalidReason: linuxHost.validatedPrefix.firstInvalidReason,
        providerCounts: linuxPrefix.providerCounts,
        representedPairCount: linuxPrefix.representedPairCount,
        comparablePrefixRuntimeTotalMs: linuxRuntimeTotalMs,
        fullWindowBlocker: {
          completionState: linuxHost.summary.completionState,
          comparabilityState: linuxHost.summary.comparabilityState,
          processedPairCount: linuxHost.summary.processedPairCount,
          generatedReportCount: linuxHost.summary.generatedReportCount,
          terminalPairIndex: linuxHost.summary.terminalPairIndex,
          terminalPairFailureReason: linuxHost.summary.terminalPairFailureReason,
          terminalPairDiagnosticReason: linuxHost.summary.terminalPairDiagnosticReason,
          terminalPairDiagnosticNotes: linuxHost.summary.terminalPairDiagnosticNotes ?? []
        }
      },
      windowsBenchmarkImage: {
        state:
          windowsBenchmarkImage.summary.completionState === 'completed'
            ? 'available'
            : 'bounded-blocked',
        latestSummaryPath: windowsBenchmarkImage.summaryPath,
        dashboardSmokePath: windowsBenchmarkImage.dashboardSmokePath,
        dashboardJsonPath: windowsBenchmarkImage.dashboardJsonPath,
        imageRef:
          windowsBenchmarkImage.summary.benchmarkImage?.reference ??
          'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/windows-dashboard-benchmark:main',
        imageDigest: windowsBenchmarkImage.summary.benchmarkImage?.digest,
        validatedComparablePairCount: windowsBenchmarkImage.validatedPrefix.validatedPairCount,
        firstInvalidPairIndex: windowsBenchmarkImage.validatedPrefix.firstInvalidPairIndex,
        firstInvalidPairId: windowsBenchmarkImage.validatedPrefix.firstInvalidPairId,
        firstInvalidReason: windowsBenchmarkImage.validatedPrefix.firstInvalidReason,
        providerCounts: windowsBenchmarkImagePrefix.providerCounts,
        representedPairCount: windowsBenchmarkImagePrefix.representedPairCount,
        comparablePrefixRuntimeTotalMs: windowsBenchmarkImageRuntimeTotalMs,
        fullWindowBlocker: {
          completionState: windowsBenchmarkImage.summary.completionState,
          comparabilityState: windowsBenchmarkImage.summary.comparabilityState,
          processedPairCount: windowsBenchmarkImage.summary.processedPairCount,
          generatedReportCount: windowsBenchmarkImage.summary.generatedReportCount,
          terminalPairIndex: windowsBenchmarkImage.summary.terminalPairIndex,
          terminalPairFailureReason: windowsBenchmarkImage.summary.terminalPairFailureReason,
          terminalPairDiagnosticReason:
            windowsBenchmarkImage.summary.terminalPairDiagnosticReason ??
            windowsBenchmarkImage.pairFailureReceipt?.runtimeDiagnosticReason ??
            windowsBenchmarkImage.validatedPrefix.firstInvalidReason
        },
        exactPairDiagnostics: windowsExactPairDiagnostics
      }
    },
    comparison: {
      lastComparablePairId: windowsPrefix.lastPairId,
      linuxVsWindowsRuntimeRatio,
      windowsVsLinuxSpeedupFactor,
      deltaRuntimeMs: windowsRuntimeTotalMs - linuxRuntimeTotalMs
    },
    retainedArtifacts: {
      windowsHostLatestRunPath: windowsHost.latestRun.manifestPath,
      windowsHostDashboardJsonPath: windowsHost.dashboardJsonPath,
      linuxHostLatestSummaryPath: linuxHost.summaryPath,
      linuxHostDashboardSmokePath: linuxHost.dashboardSmokePath,
      linuxHostDashboardJsonPath: linuxHost.dashboardJsonPath,
      windowsBenchmarkImageLatestSummaryPath: windowsBenchmarkImage.summaryPath,
      windowsBenchmarkImageDashboardSmokePath: windowsBenchmarkImage.dashboardSmokePath,
      windowsBenchmarkImageDashboardJsonPath: windowsBenchmarkImage.dashboardJsonPath,
      windowsBenchmarkImageExactPairDiagnosticPaths: windowsExactPairDiagnostics.map(
        (diagnostic) => diagnostic.reportPath
      )
    }
  };
}

function loadWindowsHostSurface(repoRoot) {
  const latestRun = latestDashboardRun.findLatestDashboardRun(repoRoot, { hostOnly: true });
  if (!latestRun?.record?.artifactPaths?.dashboardJsonFilePath) {
    throw new Error('No retained Windows host dashboard run was discovered.');
  }
  if (latestRun.record.dashboard?.relativePath !== TARGET_RELATIVE_PATH) {
    throw new Error(
      `Latest Windows host dashboard target ${String(latestRun.record.dashboard?.relativePath)} is not ${TARGET_RELATIVE_PATH}.`
    );
  }

  return {
    latestRun,
    dashboardJsonPath: normalizeArtifactPath(
      latestRun.record.artifactPaths.dashboardJsonFilePath
    ),
    validatedPrefix: validateDashboardPrefix(
      normalizeArtifactPath(latestRun.record.artifactPaths.dashboardJsonFilePath)
    )
  };
}

function loadLinuxHostSurface(repoRoot) {
  const latest = findLatestHostLinuxBenchmark(repoRoot);
  if (!latest) {
    throw new Error('No retained host Linux benchmark summary was discovered.');
  }
  const dashboardJsonPath = normalizeArtifactPath(
    latest.dashboardSmoke.dashboardJsonFilePath,
    { linuxWorkspaceRoot: latest.workspaceRoot }
  );

  return {
    ...latest,
    dashboardJsonPath,
    validatedPrefix: validateDashboardPrefix(dashboardJsonPath, {
      linuxWorkspaceRoot: latest.workspaceRoot
    })
  };
}

function loadWindowsBenchmarkImageSurface(repoRoot) {
  const latest = findLatestHostWindowsBenchmarkImageProof(repoRoot);
  if (!latest) {
    throw new Error('No retained Windows benchmark-image proof summary was discovered.');
  }
  const windowsWorkspaceRoot = latest.workspaceRoot;
  const dashboardJsonPath = normalizeArtifactPath(latest.dashboardSmoke.dashboardJsonFilePath, {
    windowsWorkspaceRoot
  });
  const pairFailureReceiptPath = latest.summary.retainedArtifacts?.pairFailureReceiptPath
    ? normalizeArtifactPath(latest.summary.retainedArtifacts.pairFailureReceiptPath, {
        windowsWorkspaceRoot
      })
    : undefined;
  const pairFailureReceipt =
    pairFailureReceiptPath && fs.existsSync(pairFailureReceiptPath)
      ? readJson(pairFailureReceiptPath)
      : undefined;

  return {
    ...latest,
    dashboardJsonPath,
    windowsWorkspaceRoot,
    pairFailureReceiptPath,
    pairFailureReceipt,
    validatedPrefix: validateDashboardPrefix(dashboardJsonPath, {
      windowsWorkspaceRoot
    })
  };
}

function loadWindowsExactPairDiagnostics(repoRoot) {
  const diagnostics = [];
  for (const engine of ['labview-cli', 'lvcompare']) {
    const latest = findLatestHostWindowsExactPairDiagnosis(repoRoot, engine);
    if (!latest) {
      continue;
    }
    diagnostics.push(readWindowsExactPairDiagnosis(latest.reportPath, latest.proofRootPath));
  }
  return diagnostics;
}

function findLatestHostLinuxBenchmark(repoRoot) {
  const candidates = [];
  for (const root of collectHostLinuxBenchmarkRoots(repoRoot)) {
    const summaryPath = path.join(root, HOST_LINUX_SUMMARY_RELATIVE_PATH);
    const dashboardSmokePath = path.join(root, HOST_LINUX_SMOKE_RELATIVE_PATH);
    if (!fs.existsSync(summaryPath) || !fs.existsSync(dashboardSmokePath)) {
      continue;
    }
    const summary = tryReadJson(summaryPath);
    const dashboardSmoke = tryReadJson(dashboardSmokePath);
    if (!summary || !dashboardSmoke) {
      continue;
    }
    const sortTimestamp = parseTimestamp(summary.completedAt ?? summary.startedAt, summaryPath);
    candidates.push({
      workspaceRoot: root,
      summaryPath,
      dashboardSmokePath,
      summary,
      dashboardSmoke,
      sortTimestamp
    });
  }

  if (candidates.length === 0) {
    return undefined;
  }
  candidates.sort((left, right) => right.sortTimestamp - left.sortTimestamp);
  return candidates[0];
}

function findLatestHostWindowsBenchmarkImageProof(repoRoot) {
  const candidates = [];
  for (const root of collectHostWindowsBenchmarkRoots(repoRoot)) {
    const summaryPath = path.join(root, HOST_WINDOWS_SUMMARY_RELATIVE_PATH);
    const dashboardSmokePath = path.join(root, HOST_WINDOWS_SMOKE_RELATIVE_PATH);
    if (!fs.existsSync(summaryPath) || !fs.existsSync(dashboardSmokePath)) {
      continue;
    }
    const summary = tryReadJson(summaryPath);
    const dashboardSmoke = tryReadJson(dashboardSmokePath);
    if (!summary || !dashboardSmoke) {
      continue;
    }
    const sortTimestamp = parseTimestamp(summary.completedAt ?? summary.startedAt, summaryPath);
    candidates.push({
      workspaceRoot: root,
      summaryPath,
      dashboardSmokePath,
      summary,
      dashboardSmoke,
      sortTimestamp
    });
  }

  if (candidates.length === 0) {
    return undefined;
  }
  candidates.sort((left, right) => right.sortTimestamp - left.sortTimestamp);
  return candidates[0];
}

function findLatestHostWindowsExactPairDiagnosis(repoRoot, engine) {
  const candidates = [];
  for (const root of collectHostWindowsExactPairDiagnosisRoots(repoRoot, engine)) {
    const reportPath = path.join(root, HOST_WINDOWS_EXACT_PAIR_SMOKE_RELATIVE_PATH);
    if (!fs.existsSync(reportPath)) {
      continue;
    }
    const report = tryReadJson(reportPath);
    if (!report) {
      continue;
    }
    const sortTimestamp = parseTimestamp(report.generatedAt, reportPath);
    candidates.push({
      proofRootPath: root,
      reportPath,
      sortTimestamp
    });
  }

  if (candidates.length === 0) {
    return undefined;
  }
  candidates.sort((left, right) => right.sortTimestamp - left.sortTimestamp);
  return candidates[0];
}

function collectHostLinuxBenchmarkRoots(repoRoot) {
  const roots = new Set();
  const home = os.homedir();

  if (home) {
    roots.add(path.join(home, HOST_LINUX_BENCHMARK_ROOT_RELATIVE_PATH));
  }

  const windowsUsersRoot = path.join(path.sep, 'mnt', 'c', 'Users');
  if (fs.existsSync(windowsUsersRoot)) {
    for (const entry of safeReadDir(windowsUsersRoot)) {
      roots.add(path.join(windowsUsersRoot, entry, HOST_LINUX_BENCHMARK_ROOT_RELATIVE_PATH));
    }
  }

  roots.add(
    path.join(
      repoRoot,
      '.cache',
      'host-linux-dashboard-benchmark',
      'workspace-stage',
      'current'
    )
  );

  return [...roots].filter((root) => fs.existsSync(root));
}

function collectHostWindowsBenchmarkRoots(repoRoot) {
  const roots = new Set();
  const home = os.homedir();

  if (home) {
    roots.add(path.join(home, HOST_WINDOWS_BENCHMARK_ROOT_RELATIVE_PATH));
  }

  const windowsUsersRoot = path.join(path.sep, 'mnt', 'c', 'Users');
  if (fs.existsSync(windowsUsersRoot)) {
    for (const entry of safeReadDir(windowsUsersRoot)) {
      roots.add(path.join(windowsUsersRoot, entry, HOST_WINDOWS_BENCHMARK_ROOT_RELATIVE_PATH));
    }
  }

  roots.add(path.join(repoRoot, '.cache', 'windows-benchmark-image-proof'));
  return [...roots].filter((root) => fs.existsSync(root));
}

function collectHostWindowsExactPairDiagnosisRoots(repoRoot, engine) {
  const rootSuffix = HOST_WINDOWS_EXACT_PAIR_ROOTS_BY_ENGINE[engine];
  if (!rootSuffix) {
    throw new Error(`Unsupported Windows exact-pair diagnosis engine: ${String(engine)}`);
  }

  const roots = new Set();
  const home = os.homedir();

  if (home) {
    roots.add(path.join(home, rootSuffix));
  }

  const windowsUsersRoot = path.join(path.sep, 'mnt', 'c', 'Users');
  if (fs.existsSync(windowsUsersRoot)) {
    for (const entry of safeReadDir(windowsUsersRoot)) {
      roots.add(path.join(windowsUsersRoot, entry, rootSuffix));
    }
  }

  roots.add(path.join(repoRoot, '.cache', path.basename(rootSuffix)));
  return [...roots].filter((root) => fs.existsSync(root));
}

function readWindowsExactPairDiagnosis(reportPath, proofRootPath) {
  const report = readJson(reportPath);
  return {
    engine: report.runtimeEngine ?? 'unknown',
    proofRootPath,
    reportPath,
    selectedHash: report.selectedHash,
    baseHash: report.baseHash,
    runtimeExecutionState: report.runtimeExecutionState,
    runtimeFailureReason: report.runtimeFailureReason,
    runtimeDiagnosticReason: report.runtimeDiagnosticReason,
    runtimeExecutable: report.runtimeExecutable,
    runtimeNotes: report.runtimeNotes ?? []
  };
}

function summarizeDashboardPrefix(dashboardJsonPath, comparablePairCount, options = {}) {
  const dashboard = readJson(dashboardJsonPath);
  const entries = Array.isArray(dashboard.entries) ? dashboard.entries.slice(0, comparablePairCount) : [];
  if (entries.length !== comparablePairCount) {
    throw new Error(
      `Dashboard ${dashboardJsonPath} does not retain ${String(comparablePairCount)} comparable pairs.`
    );
  }

  let runtimeTotalMs = 0;
  const providerCounts = {};
  for (const entry of entries) {
    const metadataPath = normalizeArtifactPath(entry.metadataFilePath, options);
    const metadata = readJson(metadataPath);
    runtimeTotalMs += metadata.runtimeExecution?.durationMs ?? 0;
    const providerLabel = entry.runtimeProviderLabel ?? 'unknown';
    providerCounts[providerLabel] = (providerCounts[providerLabel] ?? 0) + 1;
  }

  return {
    representedPairCount: dashboard.summary?.representedPairCount ?? dashboard.representedPairCount,
    comparablePairCount,
    runtimeTotalMs,
    providerCounts,
    lastPairId: entries[entries.length - 1]?.pairId
  };
}

function validateDashboardPrefix(dashboardJsonPath, options = {}) {
  const dashboard = readJson(dashboardJsonPath);
  const entries = Array.isArray(dashboard.entries) ? dashboard.entries : [];
  let validatedPairCount = 0;
  let firstInvalidPairIndex;
  let firstInvalidPairId;
  let firstInvalidReason;

  for (const entry of entries) {
    const validation = validateDashboardEntry(entry, options);
    if (!validation.valid) {
      firstInvalidPairIndex = validatedPairCount + 1;
      firstInvalidPairId = entry?.pairId;
      firstInvalidReason = validation.reason;
      break;
    }
    validatedPairCount += 1;
  }

  return {
    validatedPairCount,
    firstInvalidPairIndex,
    firstInvalidPairId,
    firstInvalidReason
  };
}

function validateDashboardEntry(entry, options = {}) {
  if (!entry?.metadataFilePath) {
    return { valid: false, reason: 'missing-metadata-file-path' };
  }
  const metadataPath = normalizeArtifactPath(entry.metadataFilePath, options);
  if (!fs.existsSync(metadataPath)) {
    return { valid: false, reason: 'missing-metadata-file' };
  }

  const metadata = readJson(metadataPath);
  const runtimeExecutionState =
    metadata.runtimeExecutionState ?? entry.runtimeExecutionState ?? 'unknown';
  if (runtimeExecutionState !== 'succeeded') {
    return { valid: false, reason: `runtime-${String(runtimeExecutionState)}` };
  }
  if (entry.generatedReportExists !== true) {
    return { valid: false, reason: 'missing-generated-report' };
  }

  const sourceRecordPath = path.join(path.dirname(metadataPath), 'source-record.json');
  if (!fs.existsSync(sourceRecordPath)) {
    return { valid: true };
  }
  const sourceRecord = readJson(sourceRecordPath);
  const reportFilePath = sourceRecord.archivePlan?.reportFilePath;
  const leftFilename = sourceRecord.packetRecord?.stagedRevisionPlan?.leftFilename;
  const rightFilename = sourceRecord.packetRecord?.stagedRevisionPlan?.rightFilename;

  if (typeof reportFilePath !== 'string' || reportFilePath.length === 0) {
    return { valid: false, reason: 'missing-archived-report-html' };
  }
  const archivedReportPath = normalizeArtifactPath(reportFilePath, options);
  if (!fs.existsSync(archivedReportPath)) {
    return { valid: false, reason: 'missing-archived-report-html' };
  }
  if (leftFilename && rightFilename) {
    const archivedReportHtml = fs.readFileSync(archivedReportPath, 'utf8');
    if (
      !archivedReportHtml.includes(leftFilename) ||
      !archivedReportHtml.includes(rightFilename)
    ) {
      return { valid: false, reason: 'stale-archived-report-html' };
    }
  }

  return { valid: true };
}

function normalizeArtifactPath(filePath, options = {}) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Missing artifact path.');
  }

  let normalized = filePath.replace(/\\/g, '/');
  if (normalized.startsWith('C:/workspace/.cache/')) {
    if (!options.windowsWorkspaceRoot) {
      throw new Error(`Cannot resolve Windows benchmark workspace cache path: ${filePath}`);
    }
    return path.join(
      options.windowsWorkspaceRoot,
      'cache',
      normalized.slice('C:/workspace/.cache/'.length)
    );
  }
  if (normalized.startsWith('C:/workspace/')) {
    if (!options.windowsWorkspaceRoot) {
      throw new Error(`Cannot resolve Windows benchmark workspace path: ${filePath}`);
    }
    return path.join(options.windowsWorkspaceRoot, normalized.slice('C:/workspace/'.length));
  }
  if (normalized.startsWith('/workspace/')) {
    if (!options.linuxWorkspaceRoot) {
      throw new Error(`Cannot resolve Linux benchmark workspace path: ${filePath}`);
    }
    return path.join(options.linuxWorkspaceRoot, normalized.slice('/workspace/'.length));
  }
  if (/^[A-Za-z]:\//.test(normalized)) {
    if (process.platform === 'win32') {
      return normalized.replace(/\//g, '\\');
    }
    return path.join('/mnt', normalized[0].toLowerCase(), normalized.slice(3));
  }
  return normalized;
}

function writeComparablePrefixBenchmarkPacket(packet, options) {
  fs.mkdirSync(path.dirname(options.jsonOutputPath), { recursive: true });
  fs.writeFileSync(options.jsonOutputPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    options.markdownOutputPath,
    renderComparablePrefixBenchmarkPacketMarkdown(packet),
    'utf8'
  );
}

function renderComparablePrefixBenchmarkPacketMarkdown(packet) {
  const exactPairDiagnostics = packet.surfaces.windowsBenchmarkImage.exactPairDiagnostics ?? [];
  return [
    '# HARNESS-VHS-002 Comparable Prefix Benchmark Packet',
    '',
    `- Generated at: ${packet.generatedAt}`,
    `- Proof state: ${packet.proofState}`,
    `- Target: ${packet.targetRelativePath}`,
    `- Full window: ${packet.fullWindow.dashboardCommitWindow} commits / ${packet.fullWindow.comparePairCount} pairs`,
    `- Comparable prefix: ${packet.comparablePrefix.dashboardCommitWindow} commits / ${packet.comparablePrefix.comparePairCount} pairs`,
    `- Last comparable pair id: ${packet.comparablePrefix.lastComparablePairId}`,
    '',
    '## Windows Host',
    '',
    `- Latest run: ${packet.surfaces.windowsHost.latestRunPath}`,
    `- Dashboard JSON: ${packet.surfaces.windowsHost.dashboardJsonPath}`,
    `- Validated comparable pairs: ${packet.surfaces.windowsHost.validatedComparablePairCount}`,
    `- Prefix runtime total: ${packet.surfaces.windowsHost.comparablePrefixRuntimeTotalMs} ms`,
    '',
    '## Linux Host',
    '',
    `- Latest summary: ${packet.surfaces.linuxHost.latestSummaryPath}`,
    `- Dashboard JSON: ${packet.surfaces.linuxHost.dashboardJsonPath}`,
    `- Validated comparable pairs: ${packet.surfaces.linuxHost.validatedComparablePairCount}`,
    `- Prefix runtime total: ${packet.surfaces.linuxHost.comparablePrefixRuntimeTotalMs} ms`,
    `- Full-window blocker: pair ${packet.surfaces.linuxHost.fullWindowBlocker.terminalPairIndex} / ${packet.fullWindow.comparePairCount} :: ${packet.surfaces.linuxHost.fullWindowBlocker.terminalPairFailureReason} (${packet.surfaces.linuxHost.fullWindowBlocker.terminalPairDiagnosticReason})`,
    '',
    '## Windows Benchmark Image',
    '',
    `- Latest summary: ${packet.surfaces.windowsBenchmarkImage.latestSummaryPath}`,
    `- Dashboard JSON: ${packet.surfaces.windowsBenchmarkImage.dashboardJsonPath}`,
    `- State: ${packet.surfaces.windowsBenchmarkImage.state}`,
    `- Image ref: ${packet.surfaces.windowsBenchmarkImage.imageRef}`,
    `- Validated comparable pairs: ${packet.surfaces.windowsBenchmarkImage.validatedComparablePairCount}`,
    `- Prefix runtime total: ${packet.surfaces.windowsBenchmarkImage.comparablePrefixRuntimeTotalMs} ms`,
    `- Full-window blocker: pair ${packet.surfaces.windowsBenchmarkImage.fullWindowBlocker.terminalPairIndex} / ${packet.fullWindow.comparePairCount} :: ${packet.surfaces.windowsBenchmarkImage.fullWindowBlocker.terminalPairFailureReason} (${packet.surfaces.windowsBenchmarkImage.fullWindowBlocker.terminalPairDiagnosticReason})`,
    ...(exactPairDiagnostics.length > 0
      ? [
          '',
          '## Windows Exact-Pair Diagnosis',
          '',
          ...exactPairDiagnostics.flatMap((diagnostic) => [
            `- ${diagnostic.engine}: ${formatHashPair(diagnostic.baseHash, diagnostic.selectedHash)} :: ${diagnostic.runtimeFailureReason}${diagnostic.runtimeDiagnosticReason ? ` (${diagnostic.runtimeDiagnosticReason})` : ''}`,
            `- ${diagnostic.engine} proof root: ${diagnostic.proofRootPath}`,
            `- ${diagnostic.engine} report: ${diagnostic.reportPath}`
          ])
        ]
      : []),
    '',
    '## Comparison',
    '',
    `- Linux / Windows runtime ratio: ${formatOptionalNumber(packet.comparison.linuxVsWindowsRuntimeRatio)}`,
    `- Windows / Linux speedup factor: ${formatOptionalNumber(packet.comparison.windowsVsLinuxSpeedupFactor)}`,
    `- Runtime delta: ${packet.comparison.deltaRuntimeMs} ms`,
    ''
  ].join('\n');
}

function formatComparablePrefixBenchmarkPacket(packet) {
  const exactPairDiagnostics = packet.surfaces.windowsBenchmarkImage.exactPairDiagnostics ?? [];
  return [
    'Comparable Prefix Benchmark Packet',
    `- proofState: ${packet.proofState}`,
    `- target: ${packet.targetRelativePath}`,
    `- fullWindow: ${packet.fullWindow.dashboardCommitWindow} commits / ${packet.fullWindow.comparePairCount} pairs`,
    `- comparablePrefix: ${packet.comparablePrefix.dashboardCommitWindow} commits / ${packet.comparablePrefix.comparePairCount} pairs`,
    `- lastComparablePairId: ${packet.comparablePrefix.lastComparablePairId}`,
    `- windowsHostRuntimeMs: ${packet.surfaces.windowsHost.comparablePrefixRuntimeTotalMs}`,
    `- linuxHostRuntimeMs: ${packet.surfaces.linuxHost.comparablePrefixRuntimeTotalMs}`,
    `- linuxVsWindowsRatio: ${formatOptionalNumber(packet.comparison.linuxVsWindowsRuntimeRatio)}`,
    `- windowsVsLinuxSpeedupFactor: ${formatOptionalNumber(packet.comparison.windowsVsLinuxSpeedupFactor)}`,
    `- linuxFullWindowBlocker: pair ${packet.surfaces.linuxHost.fullWindowBlocker.terminalPairIndex} / ${packet.fullWindow.comparePairCount} :: ${packet.surfaces.linuxHost.fullWindowBlocker.terminalPairFailureReason} (${packet.surfaces.linuxHost.fullWindowBlocker.terminalPairDiagnosticReason})`,
    `- windowsBenchmarkImage: ${packet.surfaces.windowsBenchmarkImage.state}`,
    `- windowsBenchmarkImageRuntimeMs: ${packet.surfaces.windowsBenchmarkImage.comparablePrefixRuntimeTotalMs}`,
    ...(exactPairDiagnostics.length > 0
      ? [
          `- windowsExactPairDiagnostics: ${exactPairDiagnostics
            .map(
              (diagnostic) =>
                `${diagnostic.engine}=${diagnostic.runtimeFailureReason}${diagnostic.runtimeDiagnosticReason ? ` (${diagnostic.runtimeDiagnosticReason})` : ''}`
            )
            .join('; ')}`
        ]
      : [])
  ].join('\n') + '\n';
}

function formatOptionalNumber(value) {
  return typeof value === 'number' ? value.toFixed(4) : 'n/a';
}

function formatHashPair(baseHash, selectedHash) {
  return `${abbreviateHash(baseHash)} -> ${abbreviateHash(selectedHash)}`;
}

function abbreviateHash(hash) {
  if (typeof hash !== 'string' || hash.length === 0) {
    return 'unknown';
  }
  return hash.slice(0, 12);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function tryReadJson(filePath) {
  try {
    return readJson(filePath);
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
  return fs.statSync(fallbackPath).mtime.getTime();
}

function safeReadDir(root) {
  try {
    return fs.readdirSync(root);
  } catch {
    return [];
  }
}

module.exports = {
  PACKET_SCHEMA,
  buildComparablePrefixBenchmarkPacket,
  findLatestHostLinuxBenchmark,
  findLatestHostWindowsBenchmarkImageProof,
  formatComparablePrefixBenchmarkPacket,
  normalizeArtifactPath,
  parseArgs,
  readWindowsExactPairDiagnosis,
  renderComparablePrefixBenchmarkPacketMarkdown,
  summarizeDashboardPrefix,
  validateDashboardPrefix,
  writeComparablePrefixBenchmarkPacket
};

if (require.main === module) {
  main();
}
