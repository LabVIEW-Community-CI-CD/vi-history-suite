#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXTENSION_ID = 'svelderrainruiz.vi-history-suite';
const LATEST_RUN_FILENAME = 'latest-dashboard-run.json';
const ETA_FILENAME = 'dashboard-pair-eta-accuracy.json';
const DASHBOARD_FILENAME = 'dashboard.json';

function main() {
  const { repoRoot, json, hostOnly } = parseArgs(process.argv.slice(2));
  const latest = findLatestDashboardRun(repoRoot, { hostOnly });
  if (!latest) {
    console.error('No retained dashboard run metadata was discovered.');
    process.exitCode = 1;
    return;
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(latest, null, 2)}\n`);
    return;
  }
  process.stdout.write(formatLatestDashboardRun(latest));
}

function parseArgs(args) {
  const repoRoot = path.resolve(__dirname, '..');
  let json = false;
  let hostOnly = false;
  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--host-only') {
      hostOnly = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { repoRoot, json, hostOnly };
}

function findLatestDashboardRun(repoRoot, options = {}) {
  const hostOnly = options.hostOnly === true;
  const roots = collectSearchRoots(repoRoot);
  const manifestCandidates = [];
  for (const root of roots) {
    for (const filePath of findFilesNamed(root, LATEST_RUN_FILENAME)) {
      if (hostOnly && !isHostWorkspaceArtifactPath(filePath)) {
        continue;
      }
      const parsed = tryReadJson(filePath);
      if (!parsed) {
        continue;
      }
      manifestCandidates.push({
        mode: 'latest-manifest',
        manifestPath: filePath,
        record: parsed,
        sortTimestamp: parseTimestamp(parsed.recordedAt, filePath),
        priority: getDiscoveryPriority(filePath)
      });
    }
  }
  if (manifestCandidates.length > 0) {
    manifestCandidates.sort(compareCandidates);
    return manifestCandidates[0];
  }

  const legacyCandidates = [];
  for (const root of roots) {
    for (const etaPath of findFilesNamed(root, ETA_FILENAME)) {
      if (hostOnly && !isHostWorkspaceArtifactPath(etaPath)) {
        continue;
      }
      const eta = tryReadJson(etaPath);
      if (!eta) {
        continue;
      }
      const dashboardDirectory = path.dirname(etaPath);
      const dashboardPath = path.join(dashboardDirectory, DASHBOARD_FILENAME);
      const dashboard = tryReadJson(dashboardPath);
      legacyCandidates.push({
        mode: 'legacy-fallback',
        manifestPath: etaPath,
        record: buildLegacyRecord(etaPath, eta, dashboardPath, dashboard),
        sortTimestamp: parseTimestamp(
          eta.recordedAt ?? dashboard?.generatedAt,
          etaPath
        ),
        priority: getDiscoveryPriority(etaPath)
      });
    }
  }
  if (legacyCandidates.length === 0) {
    return undefined;
  }
  legacyCandidates.sort(compareCandidates);
  return legacyCandidates[0];
}

function buildLegacyRecord(etaPath, eta, dashboardPath, dashboard) {
  const dashboardDirectory = path.dirname(etaPath);
  const workspaceStorageRoot = deriveWorkspaceStorageRoot(dashboardDirectory);
  const etaEligiblePairCount =
    typeof eta.etaEligiblePairCount === 'number'
      ? eta.etaEligiblePairCount
      : Math.max(
          0,
          (typeof eta.measuredPairCount === 'number' ? eta.measuredPairCount : 0) +
            (typeof eta.unmeasuredPairCount === 'number' ? eta.unmeasuredPairCount : 0)
        );
  const excludedPairCount =
    typeof eta.excludedPairCount === 'number'
      ? eta.excludedPairCount
      : Math.max(
          0,
          (typeof eta.preparedPairCount === 'number' ? eta.preparedPairCount : etaEligiblePairCount) -
            etaEligiblePairCount
        );
  return {
    recordedAt: eta.recordedAt ?? readStatTimestamp(etaPath),
    source: eta.context?.source ?? 'legacy-dashboard-artifact',
    workspaceStorageRoot,
    artifactPaths: {
      dashboardsDirectory: workspaceStorageRoot
        ? path.join(workspaceStorageRoot, 'dashboards')
        : path.dirname(path.dirname(dashboardDirectory)),
      dashboardDirectory,
      dashboardJsonFilePath: dashboardPath,
      dashboardHtmlFilePath: path.join(dashboardDirectory, 'dashboard.html'),
      etaAccuracyFilePath: etaPath
    },
    dashboard: dashboard
      ? {
          generatedAt: dashboard.generatedAt,
          repositoryName: dashboard.repositoryName,
          repositoryRoot: dashboard.repositoryRoot,
          relativePath: dashboard.relativePath,
          signature: dashboard.signature,
          commitWindow: dashboard.commitWindow,
          summary: {
            representedPairCount: dashboard.summary?.representedPairCount,
            windowCompletenessState: dashboard.summary?.windowCompletenessState,
            archivedPairCount: dashboard.summary?.archivedPairCount,
            missingPairCount: dashboard.summary?.missingPairCount,
            missingPairIds: dashboard.summary?.missingPairIds,
            generatedReportCount: dashboard.summary?.generatedReportCount,
            reportMetadataPairCount: dashboard.summary?.reportMetadataPairCount,
            failedPairCount: dashboard.summary?.failedPairCount,
            failedPairIds: dashboard.summary?.failedPairIds,
            blockedPairCount: dashboard.summary?.blockedPairCount,
            blockedPairIds: dashboard.summary?.blockedPairIds,
            overviewImageCount: dashboard.summary?.overviewImageCount,
            detailItemCount: dashboard.summary?.detailItemCount,
            providerSummaries: dashboard.summary?.providerSummaries
          }
        }
      : undefined,
    etaAccuracyRecord: {
      ...eta,
      etaEligiblePairCount,
      excludedPairCount
    },
    legacyFallback: true
  };
}

function deriveWorkspaceStorageRoot(dashboardDirectory) {
  const marker = `${path.sep}dashboards${path.sep}`;
  const index = dashboardDirectory.indexOf(marker);
  if (index < 0) {
    return undefined;
  }
  return dashboardDirectory.slice(0, index);
}

function collectSearchRoots(repoRoot) {
  const roots = new Set();
  roots.add(path.join(repoRoot, '.cache', 'harness-reports'));
  roots.add(path.join(repoRoot, '.vscode-test', 'user-data', 'User', 'workspaceStorage'));

  let hasCurrentHomeWindowsWorkspaceRoot = false;
  const home = os.homedir();
  if (home) {
    const homeCandidates = [
      path.join(home, '.config', 'Code', 'User', 'workspaceStorage'),
      path.join(home, 'AppData', 'Roaming', 'Code', 'User', 'workspaceStorage')
    ];
    for (const candidate of homeCandidates) {
      if (fs.existsSync(candidate)) {
        roots.add(candidate);
        if (candidate.includes(`${path.sep}AppData${path.sep}Roaming${path.sep}Code${path.sep}User${path.sep}workspaceStorage`)) {
          hasCurrentHomeWindowsWorkspaceRoot = true;
        }
      }
    }
  }

  const windowsUsersRoot = path.join(path.sep, 'mnt', 'c', 'Users');
  if (!hasCurrentHomeWindowsWorkspaceRoot && fs.existsSync(windowsUsersRoot)) {
    for (const userName of collectLikelyWindowsUserNames()) {
      roots.add(
        path.join(
          windowsUsersRoot,
          userName,
          'AppData',
          'Roaming',
          'Code',
          'User',
          'workspaceStorage'
        )
      );
    }
    if (process.env.VIHS_SCAN_ALL_WINDOWS_USERS === '1') {
      for (const entry of safeReadDir(windowsUsersRoot)) {
        roots.add(
          path.join(
            windowsUsersRoot,
            entry,
            'AppData',
            'Roaming',
            'Code',
            'User',
            'workspaceStorage'
          )
        );
      }
    }
  }

  return [...roots].filter((root) => fs.existsSync(root));
}

function collectLikelyWindowsUserNames() {
  const names = new Set();
  addUserName(names, process.env.USERNAME);
  addUserName(names, process.env.USER);
  addUserName(names, safeUserInfoName());

  const home = os.homedir();
  if (home) {
    const normalizedHome = home.replace(/\\/g, '/');
    const windowsHomePrefix = '/mnt/c/Users/';
    if (normalizedHome.startsWith(windowsHomePrefix)) {
      addUserName(names, normalizedHome.slice(windowsHomePrefix.length).split('/')[0]);
    }
  }

  return [...names];
}

function addUserName(target, value) {
  if (!value) {
    return;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return;
  }
  target.add(trimmed);
}

function safeUserInfoName() {
  try {
    return os.userInfo().username;
  } catch {
    return undefined;
  }
}

function compareCandidates(left, right) {
  if (right.priority !== left.priority) {
    return right.priority - left.priority;
  }
  return right.sortTimestamp - left.sortTimestamp;
}

function getDiscoveryPriority(filePath) {
  const normalized = normalizePortablePath(filePath);
  if (isRepoVscodeTestPath(filePath)) {
    return 0;
  }
  if (normalized.includes('/.cache/harness-reports/')) {
    return 1;
  }
  if (isCurrentHomeWorkspaceArtifactPath(filePath)) {
    return 3;
  }
  return 2;
}

function isRepoVscodeTestPath(filePath) {
  return normalizePortablePath(filePath).includes('/.vscode-test/');
}

function isHostWorkspaceArtifactPath(filePath) {
  return getDiscoveryPriority(filePath) >= 2;
}

function isCurrentHomeWorkspaceArtifactPath(filePath) {
  const normalizedFilePath = normalizePortablePath(filePath);
  if (
    normalizedFilePath.includes('/appdata/roaming/code/user/workspacestorage/') ||
    normalizedFilePath.includes('/.config/code/user/workspacestorage/')
  ) {
    return true;
  }

  const home = os.homedir();
  if (!home) {
    return false;
  }
  const candidates = [
    path.join(home, '.config', 'Code', 'User', 'workspaceStorage'),
    path.join(home, 'AppData', 'Roaming', 'Code', 'User', 'workspaceStorage')
  ];
  return candidates.some((candidate) =>
    normalizedFilePath.startsWith(`${normalizePortablePath(candidate)}/`)
  );
}

function findFilesNamed(root, filename) {
  const results = [];
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
        if (entry.name === 'node_modules' || entry.name === '.git') {
          continue;
        }
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name === filename) {
        const normalizedEntryPath = normalizePortablePath(entryPath);
        if (
          normalizedEntryPath.includes(`/${EXTENSION_ID}/`) ||
          normalizedEntryPath.includes('/workspace-storage/') ||
          normalizedEntryPath.includes('/.cache/harness-reports/')
        ) {
          results.push(entryPath);
        }
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
  return Date.parse(readStatTimestamp(fallbackPath));
}

function readStatTimestamp(filePath) {
  return fs.statSync(filePath).mtime.toISOString();
}

function safeReadDir(root) {
  try {
    return fs.readdirSync(root);
  } catch {
    return [];
  }
}

function normalizePortablePath(candidatePath) {
  return typeof candidatePath === 'string'
    ? candidatePath.replaceAll('\\', '/').toLowerCase()
    : '';
}

function formatLatestDashboardRun(latest) {
  const record = latest.record;
  const eta = record.etaAccuracyRecord;
  const lines = [
    'Latest Dashboard Run',
    `- discoveryMode: ${latest.mode}`,
    `- manifestPath: ${latest.manifestPath}`,
    `- recordedAt: ${record.recordedAt ?? 'unknown'}`,
    `- source: ${record.source ?? 'unknown'}`,
    `- repository: ${record.dashboard?.repositoryName ?? eta?.context?.repositoryName ?? 'unknown'}`,
    `- relativePath: ${record.dashboard?.relativePath ?? eta?.context?.relativePath ?? 'unknown'}`,
    `- dashboardJson: ${record.artifactPaths?.dashboardJsonFilePath ?? 'unknown'}`,
    `- dashboardHtml: ${record.artifactPaths?.dashboardHtmlFilePath ?? 'unknown'}`,
    `- etaAccuracyFile: ${record.artifactPaths?.etaAccuracyFilePath ?? 'none'}`
  ];
  if (eta) {
    lines.push(
      `- eta: measured=${eta.measuredPairCount}/${eta.etaEligiblePairCount} prepared=${eta.preparedPairCount} excluded=${eta.excludedPairCount} meanAbs=${formatOptionalSeconds(eta.meanAbsoluteErrorSeconds)} maxAbs=${formatOptionalSeconds(eta.maxAbsoluteErrorSeconds)} meanBias=${formatOptionalSignedSeconds(eta.meanSignedErrorSeconds)} mape=${eta.meanAbsolutePercentageError === undefined ? 'n/a' : `${Math.round(eta.meanAbsolutePercentageError)}%`}`
    );
  }
  if (record.dashboard?.summary) {
    lines.push(
      `- summary: archived=${record.dashboard.summary.archivedPairCount} missing=${record.dashboard.summary.missingPairCount} generated=${record.dashboard.summary.generatedReportCount} blocked=${record.dashboard.summary.blockedPairCount} failed=${record.dashboard.summary.failedPairCount}`
    );
  }
  if (record.experiment?.historyWindow) {
    lines.push(
      `- historyWindow: loaded=${record.experiment.historyWindow.loadedCommitCount} configuredMax=${record.experiment.historyWindow.configuredMaxHistoryEntries} effectiveCeiling=${record.experiment.historyWindow.effectiveHistoryEntryCeiling} total=${record.experiment.historyWindow.totalCommitCount ?? 'unknown'} truncated=${record.experiment.historyWindow.historyTruncated === undefined ? 'unknown' : record.experiment.historyWindow.historyTruncated ? 'yes' : 'no'} fraction=${record.experiment.historyWindow.loadedFractionOfTotal ?? 'n/a'} decision=${record.experiment.historyWindow.decision ?? 'unknown'}`
    );
  }
  if (record.experiment?.timings) {
    lines.push(
      `- timingsMs: total=${record.experiment.timings.totalDurationMs} scan=${record.experiment.timings.pairsNeedingEvidenceScanDurationMs} evidence=${record.experiment.timings.evidencePreparationDurationMs} build=${record.experiment.timings.dashboardBuildDurationMs} open=${record.experiment.timings.dashboardOpenDurationMs}`
    );
  }
  if (record.experiment?.configuration) {
    lines.push(
      `- config: strictRsrcHeader=${record.experiment.configuration.strictRsrcHeader} historyWindowMode=${record.experiment.configuration.historyWindowMode} maxHistoryEntries=${record.experiment.configuration.maxHistoryEntries} effectiveHistoryEntryCeiling=${record.experiment.configuration.effectiveHistoryEntryCeiling} bitness=${record.experiment.configuration.bitness ?? 'unknown'} containerImage=${record.experiment.configuration.windowsContainerImage ?? 'unknown'} labviewCliPathConfigured=${record.experiment.configuration.labviewCliPathConfigured} labviewExePathConfigured=${record.experiment.configuration.labviewExePathConfigured} lvComparePathConfigured=${record.experiment.configuration.lvComparePathConfigured}`
    );
  }
  if (record.experiment?.progress) {
    lines.push(`- progressEvents: ${record.experiment.progress.eventCount}`);
  }
  return `${lines.join('\n')}\n`;
}

function formatOptionalSeconds(value) {
  return typeof value === 'number' ? `${value}s` : 'n/a';
}

function formatOptionalSignedSeconds(value) {
  if (typeof value !== 'number') {
    return 'n/a';
  }
  return `${value >= 0 ? '+' : ''}${value}s`;
}

module.exports = {
  buildLegacyRecord,
  collectSearchRoots,
  compareCandidates,
  findLatestDashboardRun,
  formatLatestDashboardRun,
  getDiscoveryPriority,
  isCurrentHomeWorkspaceArtifactPath,
  isRepoVscodeTestPath,
  isHostWorkspaceArtifactPath,
  parseArgs
};

if (require.main === module) {
  main();
}
