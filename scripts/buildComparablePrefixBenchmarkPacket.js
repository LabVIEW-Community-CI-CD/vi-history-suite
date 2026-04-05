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
  const comparablePairCount =
    options.prefixPairCount ??
    linuxHost.summary.generatedReportCount ??
    linuxHost.summary.processedPairCount;

  if (!Number.isFinite(comparablePairCount) || comparablePairCount < 1) {
    throw new Error('Could not derive a comparable prefix pair count from the retained Linux run.');
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

  if (windowsPrefix.lastPairId !== linuxPrefix.lastPairId) {
    throw new Error(
      `Comparable-prefix mismatch: Windows last pair ${String(windowsPrefix.lastPairId)} does not match Linux last pair ${String(linuxPrefix.lastPairId)}.`
    );
  }

  const windowsRuntimeTotalMs = windowsPrefix.runtimeTotalMs;
  const linuxRuntimeTotalMs = linuxPrefix.runtimeTotalMs;
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
        state: 'pending-proof',
        imageRef:
          'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/windows-dashboard-benchmark:main'
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
      linuxHostDashboardJsonPath: linuxHost.dashboardJsonPath
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
    dashboardJsonPath
  };
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

function normalizeArtifactPath(filePath, options = {}) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Missing artifact path.');
  }

  let normalized = filePath.replace(/\\/g, '/');
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
    `- Prefix runtime total: ${packet.surfaces.windowsHost.comparablePrefixRuntimeTotalMs} ms`,
    '',
    '## Linux Host',
    '',
    `- Latest summary: ${packet.surfaces.linuxHost.latestSummaryPath}`,
    `- Dashboard JSON: ${packet.surfaces.linuxHost.dashboardJsonPath}`,
    `- Prefix runtime total: ${packet.surfaces.linuxHost.comparablePrefixRuntimeTotalMs} ms`,
    `- Full-window blocker: pair ${packet.surfaces.linuxHost.fullWindowBlocker.terminalPairIndex} / ${packet.fullWindow.comparePairCount} :: ${packet.surfaces.linuxHost.fullWindowBlocker.terminalPairFailureReason} (${packet.surfaces.linuxHost.fullWindowBlocker.terminalPairDiagnosticReason})`,
    '',
    '## Comparison',
    '',
    `- Linux / Windows runtime ratio: ${formatOptionalNumber(packet.comparison.linuxVsWindowsRuntimeRatio)}`,
    `- Windows / Linux speedup factor: ${formatOptionalNumber(packet.comparison.windowsVsLinuxSpeedupFactor)}`,
    `- Runtime delta: ${packet.comparison.deltaRuntimeMs} ms`,
    '',
    '## Pending Surface',
    '',
    `- Windows benchmark image: ${packet.surfaces.windowsBenchmarkImage.state} (${packet.surfaces.windowsBenchmarkImage.imageRef})`,
    ''
  ].join('\n');
}

function formatComparablePrefixBenchmarkPacket(packet) {
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
    `- windowsBenchmarkImage: ${packet.surfaces.windowsBenchmarkImage.state}`
  ].join('\n') + '\n';
}

function formatOptionalNumber(value) {
  return typeof value === 'number' ? value.toFixed(4) : 'n/a';
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
  formatComparablePrefixBenchmarkPacket,
  normalizeArtifactPath,
  parseArgs,
  renderComparablePrefixBenchmarkPacketMarkdown,
  summarizeDashboardPrefix,
  writeComparablePrefixBenchmarkPacket
};

if (require.main === module) {
  main();
}
