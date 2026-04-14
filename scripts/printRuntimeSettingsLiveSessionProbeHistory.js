#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXTENSION_ID = 'svelderrainruiz.vi-history-suite';
const PACKET_DIRECTORY_RELATIVE = path.join(
  'governed-proof',
  'runtime-provider-live-session-probe'
);
const RUN_SUMMARY_FILENAME = 'probe-summary.json';

function getUsage() {
  return [
    'Usage: node scripts/printRuntimeSettingsLiveSessionProbeHistory.js [--packet-root <path>] [--json] [--help]',
    '',
    'Print one retained history receipt for runtime-settings live-session probe packets.',
    'Defaults to the governed VS Code global-storage packet root for this host.'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    json: false,
    packetRoot: undefined
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      parsed.helpRequested = true;
      continue;
    }
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--packet-root') {
      i += 1;
      if (i >= argv.length) {
        throw new Error('Missing value for --packet-root.');
      }
      parsed.packetRoot = argv[i];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function resolveDefaultPacketRoot(
  platform = process.platform,
  env = process.env,
  homedir = os.homedir
) {
  if (platform === 'win32') {
    const appData = env.APPDATA ?? path.win32.join(homedir(), 'AppData', 'Roaming');
    return path.win32.join(
      appData,
      'Code',
      'User',
      'globalStorage',
      EXTENSION_ID,
      PACKET_DIRECTORY_RELATIVE
    );
  }

  if (platform === 'linux') {
    const configHome = env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config');
    return path.join(
      configHome,
      'Code',
      'User',
      'globalStorage',
      EXTENSION_ID,
      PACKET_DIRECTORY_RELATIVE
    );
  }

  if (platform === 'darwin') {
    return path.join(
      homedir(),
      'Library',
      'Application Support',
      'Code',
      'User',
      'globalStorage',
      EXTENSION_ID,
      PACKET_DIRECTORY_RELATIVE
    );
  }

  throw new Error(`Unsupported platform for packet-root resolution: ${platform}`);
}

function collectRunSummaries(packetRoot, fsApi = fs) {
  const runSummaries = [];
  const entries = safeReadDir(packetRoot, fsApi);
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const runId = entry.name;
    const summaryPath = path.join(packetRoot, runId, RUN_SUMMARY_FILENAME);
    if (!fsApi.existsSync(summaryPath)) {
      continue;
    }
    const parsed = tryReadJson(summaryPath, fsApi);
    if (!parsed || typeof parsed !== 'object') {
      continue;
    }
    runSummaries.push({
      runId,
      summaryPath,
      summary: parsed
    });
  }
  runSummaries.sort((left, right) => right.runId.localeCompare(left.runId));
  return runSummaries;
}

function summarizeHistory(packetRoot, runSummaries) {
  let reloadRequiredCount = 0;
  let inSessionUpdatedCount = 0;
  let unknownObservationCount = 0;
  let safeRestoreVerifiedCount = 0;

  for (const run of runSummaries) {
    const observation = normalizeObservation(run.summary);
    if (observation === 'reload-required') {
      reloadRequiredCount += 1;
    } else if (observation === 'in-session-updated') {
      inSessionUpdatedCount += 1;
    } else {
      unknownObservationCount += 1;
    }

    if (run.summary.safeRestoreVerified === true) {
      safeRestoreVerifiedCount += 1;
    }
  }

  const latest = runSummaries[0];
  const latestObservation = latest ? normalizeObservation(latest.summary) : undefined;
  const stance =
    reloadRequiredCount > 0
      ? 'live-uptake-not-proven'
      : inSessionUpdatedCount > 0 && unknownObservationCount === 0
        ? 'candidate-live-uptake-observed'
        : 'insufficient-evidence';

  return {
    packetRoot,
    totalRuns: runSummaries.length,
    reloadRequiredCount,
    inSessionUpdatedCount,
    unknownObservationCount,
    safeRestoreVerifiedCount,
    latestRunId: latest?.runId,
    latestSummaryPath: latest?.summaryPath,
    latestObservation,
    stance,
    recommendation:
      stance === 'live-uptake-not-proven'
        ? 'Keep reload-or-restart guidance active; retained history still contains reload-required runs.'
        : stance === 'candidate-live-uptake-observed'
          ? 'All retained runs report in-session-updated. Re-evaluate whether VHS-REQ-542 wording should stay unchanged.'
          : 'Run additional live-session probes before making a policy decision.'
  };
}

function normalizeObservation(summary) {
  const explicit = typeof summary.liveUptakeObservation === 'string'
    ? summary.liveUptakeObservation
    : undefined;
  if (explicit === 'reload-required' || explicit === 'in-session-updated') {
    return explicit;
  }

  if (typeof summary.driftDetected === 'boolean') {
    return summary.driftDetected ? 'reload-required' : 'in-session-updated';
  }

  return undefined;
}

function formatHistorySummary(summary) {
  return [
    'Runtime settings live-session probe history receipt',
    `- packetRoot: ${summary.packetRoot}`,
    `- totalRuns: ${summary.totalRuns}`,
    `- reloadRequiredCount: ${summary.reloadRequiredCount}`,
    `- inSessionUpdatedCount: ${summary.inSessionUpdatedCount}`,
    `- unknownObservationCount: ${summary.unknownObservationCount}`,
    `- safeRestoreVerifiedCount: ${summary.safeRestoreVerifiedCount}`,
    `- latestRunId: ${summary.latestRunId ?? '<none>'}`,
    `- latestObservation: ${summary.latestObservation ?? '<none>'}`,
    `- stance: ${summary.stance}`,
    `- recommendation: ${summary.recommendation}`,
    ''
  ].join('\n');
}

function run(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const parsed = parseArgs(argv);
  if (parsed.helpRequested) {
    stdout.write(`${getUsage()}\n`);
    return { outcome: 'help' };
  }

  const packetRoot = parsed.packetRoot
    ? path.resolve(parsed.packetRoot)
    : resolveDefaultPacketRoot(
        deps.platform ?? process.platform,
        deps.env ?? process.env,
        deps.homedir ?? os.homedir
      );

  const fsApi = deps.fs ?? fs;
  if (!fsApi.existsSync(packetRoot)) {
    throw new Error(`Runtime-settings live-session packet root is missing: ${packetRoot}`);
  }

  const runSummaries = collectRunSummaries(packetRoot, fsApi);
  if (runSummaries.length === 0) {
    throw new Error(
      `Runtime-settings live-session packet root contains no retained run summaries: ${packetRoot}`
    );
  }

  const summary = summarizeHistory(packetRoot, runSummaries);
  if (parsed.json) {
    stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    stdout.write(formatHistorySummary(summary));
  }

  return {
    outcome: 'ok',
    summary
  };
}

function safeReadDir(directoryPath, fsApi) {
  try {
    return fsApi.readdirSync(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function tryReadJson(filePath, fsApi) {
  try {
    return JSON.parse(fsApi.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function main() {
  try {
    run();
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  EXTENSION_ID,
  PACKET_DIRECTORY_RELATIVE,
  RUN_SUMMARY_FILENAME,
  getUsage,
  parseArgs,
  resolveDefaultPacketRoot,
  collectRunSummaries,
  summarizeHistory,
  normalizeObservation,
  formatHistorySummary,
  run
};
