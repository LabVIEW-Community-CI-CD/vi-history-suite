#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCHEMA = 'vi-history-suite/vagrant-labview-startup-history@v1';
const DEFAULT_SCAN_ROOTS = ['.cache', path.join('vagrant', 'evidence')];
const DEFAULT_RECOMMENDED_TIMEOUT_SEC = 60;

function getUsage() {
  return [
    'Usage: node scripts/summarizeVagrantLabviewStartupHistory.js [options] [paths...]',
    '',
    'Summarizes retained Vagrant LabVIEW VI Server startup evidence.',
    '',
    'Options:',
    '  --root PATH          Directory or file to scan. Can be repeated.',
    '  --evidence-dir PATH  Write vagrant-labview-startup-history.json/.md under PATH.',
    '  --json               Print JSON to stdout instead of Markdown.',
    '  --help               Show this help.',
    '',
    `When no paths are supplied, scans: ${DEFAULT_SCAN_ROOTS.join(', ')}`
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    roots: [],
    evidenceDir: '',
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const requireValue = (flag) => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.\n\n${getUsage()}`);
      }
      index += 1;
      return value;
    };

    if (current === '--help' || current === '-h') {
      parsed.helpRequested = true;
      continue;
    }
    if (current === '--root') {
      parsed.roots.push(requireValue('--root'));
      continue;
    }
    if (current === '--evidence-dir') {
      parsed.evidenceDir = path.resolve(requireValue('--evidence-dir'));
      continue;
    }
    if (current === '--json') {
      parsed.json = true;
      continue;
    }
    if (current.startsWith('--')) {
      throw new Error(`Unknown argument: ${current}\n\n${getUsage()}`);
    }
    parsed.roots.push(current);
  }

  if (parsed.roots.length === 0) {
    parsed.roots = [...DEFAULT_SCAN_ROOTS];
  }

  return parsed;
}

function timestampToSeconds(value) {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/u.exec(value);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function elapsedSeconds(start, end) {
  if (start === null || end === null) {
    return null;
  }
  return end >= start ? end - start : end + 86400 - start;
}

function parseAcceptanceProvisionLog(filePath, text) {
  const events = [];
  const lines = text.split(/\r?\n/u);
  const stepPattern = /^(?:\s*default:\s*)?\[(\d{2}:\d{2}:\d{2}) acceptance\]\s+(.*)$/u;

  for (const line of lines) {
    const match = stepPattern.exec(line);
    if (!match) {
      continue;
    }
    events.push({
      timestamp: match[1],
      seconds: timestampToSeconds(match[1]),
      message: match[2]
    });
  }

  const waitStart = events.find((event) =>
    /Waiting up to \d+s .*VI Server/u.test(event.message)
  );
  const alreadyListening = events.find((event) =>
    /LabVIEW VI Server already listening on port 3363/u.test(event.message)
  );
  const ready = events.find((event) =>
    /LabVIEW VI Server ready on port 3363/u.test(event.message)
  );
  const timeout = /LabVIEW VI Server did not open port 3363 within \d+ s/u.test(text);

  const durationSec = ready && waitStart
    ? elapsedSeconds(waitStart.seconds, ready.seconds)
    : ready && alreadyListening
      ? 0
      : null;

  return {
    path: filePath,
    hasWaitStart: Boolean(waitStart),
    ready: Boolean(ready || alreadyListening),
    timeout,
    durationSec,
    startTimestamp: waitStart?.timestamp ?? alreadyListening?.timestamp ?? null,
    readyTimestamp: ready?.timestamp ?? alreadyListening?.timestamp ?? null
  };
}

function parseStartupReceipt(filePath, text) {
  const parsed = JSON.parse(text);
  return {
    path: filePath,
    schema: parsed.schema ?? '',
    phase: parsed.phase ?? '',
    viServerTimeoutSec: typeof parsed.viServerTimeoutSec === 'number'
      ? parsed.viServerTimeoutSec
      : null,
    capturedAt: parsed.capturedAt ?? '',
    timedOut: parsed.phase === 'timeout'
  };
}

function shouldScanFile(filePath) {
  const basename = path.basename(filePath);
  return basename === 'acceptance-provision.log' || basename === 'labview-startup.json';
}

function collectEvidenceFiles(roots, fsApi = fs) {
  const files = [];
  const visited = new Set();
  const pending = roots.map((root) => path.resolve(root));

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current) || !fsApi.existsSync(current)) {
      continue;
    }
    visited.add(current);

    const stat = fsApi.statSync(current);
    if (stat.isFile()) {
      if (shouldScanFile(current)) {
        files.push(current);
      }
      continue;
    }
    if (!stat.isDirectory()) {
      continue;
    }

    const basename = path.basename(current);
    if (basename === 'node_modules' || basename === '.git') {
      continue;
    }

    for (const entry of fsApi.readdirSync(current, { withFileTypes: true })) {
      pending.push(path.join(current, entry.name));
    }
  }

  return files.sort();
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) {
    return null;
  }
  const index = Math.max(
    0,
    Math.min(sortedValues.length - 1, Math.ceil((percentileValue / 100) * sortedValues.length) - 1)
  );
  return sortedValues[index];
}

function calculateStats(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    min: sorted.length > 0 ? sorted[0] : null,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    max: sorted.length > 0 ? sorted[sorted.length - 1] : null
  };
}

function buildRecommendation(stats) {
  return {
    recommendedTimeoutSec: DEFAULT_RECOMMENDED_TIMEOUT_SEC,
    basis:
      stats.count > 0
        ? `Observed successful VI Server starts complete by ${stats.max}s; 60s preserves a conservative buffer while failing stuck interactive startups quickly.`
        : 'No successful startup durations were found; keep the conservative 60s default and use the environment override for diagnostics.'
  };
}

function summarizeVagrantLabviewStartupHistory(options = {}, deps = {}) {
  const fsApi = deps.fsApi ?? fs;
  const now = deps.now ?? (() => new Date());
  const roots = (options.roots ?? DEFAULT_SCAN_ROOTS).map((root) => path.resolve(root));
  const files = collectEvidenceFiles(roots, fsApi);
  const acceptanceLogs = [];
  const startupReceipts = [];
  const parseFailures = [];

  for (const filePath of files) {
    try {
      const text = fsApi.readFileSync(filePath, 'utf8');
      if (path.basename(filePath) === 'acceptance-provision.log') {
        acceptanceLogs.push(parseAcceptanceProvisionLog(filePath, text));
      } else if (path.basename(filePath) === 'labview-startup.json') {
        startupReceipts.push(parseStartupReceipt(filePath, text));
      }
    } catch (error) {
      parseFailures.push({
        path: filePath,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const successfulDurationsSec = acceptanceLogs
    .map((log) => log.durationSec)
    .filter((value) => typeof value === 'number');
  const stats = calculateStats(successfulDurationsSec);
  const logTimeoutCount = acceptanceLogs.filter((log) => log.timeout).length;
  const receiptTimeoutCount = startupReceipts.filter((receipt) => receipt.timedOut).length;

  const report = {
    schema: SCHEMA,
    generatedAt: now().toISOString(),
    hostname: deps.hostname ?? os.hostname(),
    scannedRoots: roots,
    evidenceFiles: files,
    acceptanceLogCount: acceptanceLogs.length,
    startupReceiptCount: startupReceipts.length,
    successfulStartupDurationsSec: successfulDurationsSec,
    stats,
    timeoutCount: Math.max(logTimeoutCount, receiptTimeoutCount),
    logTimeoutCount,
    receiptTimeoutCount,
    previousIncidentTimeoutSec: 300,
    currentDefaultTimeoutSec: DEFAULT_RECOMMENDED_TIMEOUT_SEC,
    recommendation: buildRecommendation(stats),
    acceptanceLogs,
    startupReceipts,
    parseFailures
  };

  if (options.evidenceDir) {
    writeEvidenceFiles(options.evidenceDir, report, fsApi);
  }

  return report;
}

function buildMarkdown(report) {
  return [
    '# Vagrant LabVIEW Startup History',
    '',
    `- Schema: ${report.schema}`,
    `- Generated at: ${report.generatedAt}`,
    `- Hostname: ${report.hostname}`,
    `- Acceptance logs: ${report.acceptanceLogCount}`,
    `- Startup receipts: ${report.startupReceiptCount}`,
    `- Successful starts measured: ${report.stats.count}`,
    `- Durations seconds: ${report.successfulStartupDurationsSec.join(', ') || 'none'}`,
    `- Min/p50/p90/p95/max: ${report.stats.min ?? 'n/a'} / ${report.stats.p50 ?? 'n/a'} / ${report.stats.p90 ?? 'n/a'} / ${report.stats.p95 ?? 'n/a'} / ${report.stats.max ?? 'n/a'}`,
    `- Timeouts observed: ${report.timeoutCount}`,
    `- Recommended timeout: ${report.recommendation.recommendedTimeoutSec}s`,
    '',
    '## Recommendation',
    '',
    report.recommendation.basis,
    ''
  ].join('\n');
}

function writeEvidenceFiles(evidenceDir, report, fsApi = fs) {
  fsApi.mkdirSync(evidenceDir, { recursive: true });
  fsApi.writeFileSync(
    path.join(evidenceDir, 'vagrant-labview-startup-history.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  fsApi.writeFileSync(
    path.join(evidenceDir, 'vagrant-labview-startup-history.md'),
    `${buildMarkdown(report)}\n`,
    'utf8'
  );
}

function runVagrantLabviewStartupHistoryCli(argv, deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const parsed = parseArgs(argv);
  if (parsed.helpRequested) {
    stdout.write(`${getUsage()}\n`);
    return 'help';
  }

  const report = summarizeVagrantLabviewStartupHistory(parsed, deps);
  stdout.write(parsed.json ? `${JSON.stringify(report, null, 2)}\n` : `${buildMarkdown(report)}\n`);
  return 'passed';
}

module.exports = {
  DEFAULT_RECOMMENDED_TIMEOUT_SEC,
  DEFAULT_SCAN_ROOTS,
  SCHEMA,
  buildMarkdown,
  collectEvidenceFiles,
  getUsage,
  parseAcceptanceProvisionLog,
  parseArgs,
  parseStartupReceipt,
  runVagrantLabviewStartupHistoryCli,
  summarizeVagrantLabviewStartupHistory,
  writeEvidenceFiles
};

if (require.main === module) {
  try {
    runVagrantLabviewStartupHistoryCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
