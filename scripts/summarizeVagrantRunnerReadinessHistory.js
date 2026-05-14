#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const readiness = require('./runVagrantAcceptanceRunnerReadiness.js');

const SCHEMA = 'vi-history-suite/vagrant-runner-readiness-history@v1';
const DEFAULT_CURRENT_TIMER_SEC = 300;
const DEFAULT_RECEIPT_ROOT = readiness.DEFAULT_RECEIPT_ROOT;

function getUsage() {
  return [
    'Usage: node scripts/summarizeVagrantRunnerReadinessHistory.js [options] [paths...]',
    '',
    'Summarizes retained Vagrant runner readiness receipts and recommends timer policy.',
    '',
    'Options:',
    '  --root PATH               Directory or receipt file to scan. Can be repeated.',
    '  --evidence-dir PATH       Write vagrant-runner-readiness-history.json/.md under PATH.',
    `  --current-timer-sec SEC   Current readiness timer cadence. Defaults to ${DEFAULT_CURRENT_TIMER_SEC}.`,
    '  --json                    Print JSON to stdout instead of Markdown.',
    '  --help                    Show this help.',
    '',
    `When no paths are supplied, scans: ${DEFAULT_RECEIPT_ROOT}`
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    roots: [],
    evidenceDir: '',
    currentTimerSec: DEFAULT_CURRENT_TIMER_SEC,
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
    if (current === '--current-timer-sec') {
      const value = Number(requireValue('--current-timer-sec'));
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid --current-timer-sec value: ${value}`);
      }
      parsed.currentTimerSec = value;
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
    parsed.roots = [DEFAULT_RECEIPT_ROOT];
  }

  return parsed;
}

function stripBom(text) {
  return text.replace(/^\uFEFF/u, '');
}

function shouldScanFile(filePath) {
  const basename = path.basename(filePath);
  return basename !== 'latest.json' && basename.endsWith('.json');
}

function collectReceiptFiles(roots, fsApi = fs) {
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
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  return {
    count: sorted.length,
    min: sorted.length > 0 ? sorted[0] : null,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    max: sorted.length > 0 ? sorted[sorted.length - 1] : null
  };
}

function normalizeStatus(receipt) {
  return receipt.status === 'passed' && receipt.healthy !== false ? 'passed' : 'failed';
}

function classifyIssue(issue) {
  if (/active mount point is not mounted|active storage root is missing|active large-drive|Expected VirtualBox machine folder/u.test(issue)) {
    return 'active-storage-drift';
  }
  if (/active Windows 11 Vagrant box is missing/u.test(issue)) {
    return 'active-box-missing';
  }
  if (/Vagrant CI VM 'vihs-ci-win11' is already running/u.test(issue)) {
    return 'runner-busy';
  }
  if (/Golden VM 'vihs-win11-labview2026-golden' exists but is/u.test(issue)) {
    return 'golden-vm-not-powered-off';
  }
  if (/Vagrant box 'vihs\/win11-labview2026' is not registered|vagrant-reload plugin is not installed/u.test(issue)) {
    return 'host-tooling-drift';
  }
  if (/Stale inaccessible disposable VM registry entry/u.test(issue)) {
    return 'stale-disposable-vm-state';
  }
  if (/Vagrant host doctor failed/u.test(issue)) {
    return 'host-doctor-failed';
  }
  return 'other';
}

function classifyReceipt(receipt) {
  const categories = new Set();
  const issues = Array.isArray(receipt.issues) ? receipt.issues : [];
  for (const issue of issues) {
    categories.add(classifyIssue(String(issue)));
  }
  if (normalizeStatus(receipt) === 'failed' && categories.size === 0) {
    categories.add('other');
  }
  return [...categories].sort();
}

function parseReceipt(filePath, text) {
  const parsed = JSON.parse(stripBom(text));
  const generatedAt = new Date(parsed.generatedAt);
  if (Number.isNaN(generatedAt.valueOf())) {
    throw new Error(`Invalid generatedAt in ${filePath}`);
  }
  return {
    path: filePath,
    schema: parsed.schema ?? '',
    generatedAt: generatedAt.toISOString(),
    generatedAtMs: generatedAt.valueOf(),
    status: normalizeStatus(parsed),
    healthy: parsed.healthy !== false && parsed.status === 'passed',
    issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
    categories: classifyReceipt(parsed),
    nextAction: parsed.nextAction ?? ''
  };
}

function collectReceipts(roots, fsApi = fs) {
  const files = collectReceiptFiles(roots, fsApi);
  const receipts = [];
  const parseFailures = [];

  for (const filePath of files) {
    try {
      const receipt = parseReceipt(filePath, fsApi.readFileSync(filePath, 'utf8'));
      if (receipt.schema === readiness.SCHEMA) {
        receipts.push(receipt);
      }
    } catch (error) {
      parseFailures.push({
        path: filePath,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const deduped = new Map();
  for (const receipt of receipts) {
    deduped.set(`${receipt.generatedAt}:${receipt.path}`, receipt);
  }

  return {
    files,
    receipts: [...deduped.values()].sort((left, right) => left.generatedAtMs - right.generatedAtMs),
    parseFailures
  };
}

function buildIncidents(receipts, currentTimerSec) {
  const incidents = [];
  let current = null;
  let previous = null;
  const continuityLimitMs = currentTimerSec * 3 * 1000;

  const closeCurrent = (recoveredBy = null) => {
    if (!current) {
      return;
    }
    const first = current.receipts[0];
    const last = current.receipts[current.receipts.length - 1];
    const categories = new Set();
    const issueSamples = [];
    for (const receipt of current.receipts) {
      for (const category of receipt.categories) {
        categories.add(category);
      }
      for (const issue of receipt.issues) {
        if (!issueSamples.includes(issue) && issueSamples.length < 8) {
          issueSamples.push(issue);
        }
      }
    }
    incidents.push({
      startedAt: first.generatedAt,
      lastFailedAt: last.generatedAt,
      recoveredAt: recoveredBy?.generatedAt ?? null,
      failureReceiptCount: current.receipts.length,
      durationSec: Math.round((last.generatedAtMs - first.generatedAtMs) / 1000),
      detectionWindowSec: current.previousPassed
        ? Math.round((first.generatedAtMs - current.previousPassed.generatedAtMs) / 1000)
        : null,
      recoveryWindowSec: recoveredBy
        ? Math.round((recoveredBy.generatedAtMs - last.generatedAtMs) / 1000)
        : null,
      categories: [...categories].sort(),
      issueSamples
    });
    current = null;
  };

  for (const receipt of receipts) {
    if (receipt.status === 'failed') {
      const gapFromPrevious = previous ? receipt.generatedAtMs - previous.generatedAtMs : 0;
      if (current && gapFromPrevious > continuityLimitMs) {
        closeCurrent();
      }
      if (!current) {
        current = {
          previousPassed: previous?.status === 'passed' ? previous : null,
          receipts: []
        };
      }
      current.receipts.push(receipt);
    } else if (current) {
      closeCurrent(receipt);
    }
    previous = receipt;
  }
  closeCurrent();

  return incidents;
}

function countBy(values) {
  return values.reduce((accumulator, value) => {
    accumulator[value] = (accumulator[value] ?? 0) + 1;
    return accumulator;
  }, {});
}

function buildRecommendation(summary) {
  if (summary.receiptCount === 0) {
    return {
      decision: 'keep-current-timer',
      recommendedTimerSec: summary.currentTimerSec,
      adaptiveCandidate: false,
      basis:
        'No readiness receipts were found, so keep the current timer until the runner has retained enough timestamped evidence.'
    };
  }

  const busyFailureCount =
    (summary.categoryCounts['runner-busy'] ?? 0) +
    (summary.categoryCounts['golden-vm-not-powered-off'] ?? 0);
  const activeDriftIncidents = summary.incidents.filter((incident) =>
    incident.categories.includes('active-storage-drift')
  );
  const activeDetectionWindows = activeDriftIncidents
    .map((incident) => incident.detectionWindowSec)
    .filter((value) => typeof value === 'number');
  const worstActiveDetectionSec = activeDetectionWindows.length > 0
    ? Math.max(...activeDetectionWindows)
    : null;
  const shrinkWouldMostlyAddNoise = busyFailureCount > 0;

  return {
    decision: 'keep-current-timer',
    recommendedTimerSec: summary.currentTimerSec,
    adaptiveCandidate: shrinkWouldMostlyAddNoise,
    basis: [
      `Keep the ${summary.currentTimerSec}s readiness timer.`,
      activeDriftIncidents.length > 0
        ? `Active storage drift was detected by retained receipts${worstActiveDetectionSec === null ? '' : ` with a worst observed detection window of ${worstActiveDetectionSec}s`}.`
        : 'No active storage drift incidents were present in the scanned receipts.',
      shrinkWouldMostlyAddNoise
        ? `Shortening the timer would increase expected busy receipts (${busyFailureCount}) while Vagrant or the golden VM is intentionally active; classify busy/adaptive behavior separately before changing cadence.`
        : 'The history does not show a clear need to shrink the timer.',
      'GitLab admission still runs immediately before Vagrant acceptance, so the timer remains an early warning surface rather than the only gate.'
    ].join(' ')
  };
}

function summarizeVagrantRunnerReadinessHistory(options = {}, deps = {}) {
  const fsApi = deps.fsApi ?? fs;
  const now = deps.now ?? (() => new Date());
  const roots = (options.roots ?? [DEFAULT_RECEIPT_ROOT]).map((root) => path.resolve(root));
  const currentTimerSec = options.currentTimerSec ?? DEFAULT_CURRENT_TIMER_SEC;
  const collected = collectReceipts(roots, fsApi);
  const receipts = collected.receipts;
  const intervalsSec = [];
  for (let index = 1; index < receipts.length; index += 1) {
    intervalsSec.push(Math.round((receipts[index].generatedAtMs - receipts[index - 1].generatedAtMs) / 1000));
  }

  const statusCounts = countBy(receipts.map((receipt) => receipt.status));
  const categoryCounts = {};
  for (const receipt of receipts) {
    if (receipt.status !== 'failed') {
      continue;
    }
    for (const category of receipt.categories) {
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    }
  }

  const incidents = buildIncidents(receipts, currentTimerSec);
  const summary = {
    schema: SCHEMA,
    generatedAt: now().toISOString(),
    hostname: deps.hostname ?? os.hostname(),
    scannedRoots: roots,
    currentTimerSec,
    receiptFiles: collected.files,
    receiptCount: receipts.length,
    firstReceiptAt: receipts[0]?.generatedAt ?? null,
    lastReceiptAt: receipts[receipts.length - 1]?.generatedAt ?? null,
    statusCounts,
    categoryCounts,
    intervalStatsSec: calculateStats(intervalsSec),
    incidents,
    parseFailures: collected.parseFailures,
    recommendation: null
  };
  summary.recommendation = buildRecommendation(summary);

  if (options.evidenceDir) {
    writeEvidenceFiles(options.evidenceDir, summary, fsApi);
  }

  return summary;
}

function buildMarkdown(summary) {
  const incidentLines = summary.incidents.length > 0
    ? summary.incidents.map((incident) =>
      `- ${incident.startedAt} -> ${incident.recoveredAt ?? 'unrecovered'}: ${incident.categories.join(', ')} (${incident.failureReceiptCount} failed receipt(s))`
    )
    : ['- none'];

  return [
    '# Vagrant Runner Readiness History',
    '',
    `- Schema: ${summary.schema}`,
    `- Generated at: ${summary.generatedAt}`,
    `- Hostname: ${summary.hostname}`,
    `- Receipt count: ${summary.receiptCount}`,
    `- First receipt: ${summary.firstReceiptAt ?? 'n/a'}`,
    `- Last receipt: ${summary.lastReceiptAt ?? 'n/a'}`,
    `- Status counts: ${JSON.stringify(summary.statusCounts)}`,
    `- Category counts: ${JSON.stringify(summary.categoryCounts)}`,
    `- Interval seconds min/p50/p90/p95/max: ${summary.intervalStatsSec.min ?? 'n/a'} / ${summary.intervalStatsSec.p50 ?? 'n/a'} / ${summary.intervalStatsSec.p90 ?? 'n/a'} / ${summary.intervalStatsSec.p95 ?? 'n/a'} / ${summary.intervalStatsSec.max ?? 'n/a'}`,
    `- Recommended timer: ${summary.recommendation.recommendedTimerSec}s`,
    `- Decision: ${summary.recommendation.decision}`,
    `- Adaptive follow-up candidate: ${summary.recommendation.adaptiveCandidate ? 'yes' : 'no'}`,
    '',
    '## Recommendation',
    '',
    summary.recommendation.basis,
    '',
    '## Incidents',
    '',
    ...incidentLines,
    ''
  ].join('\n');
}

function writeEvidenceFiles(evidenceDir, summary, fsApi = fs) {
  fsApi.mkdirSync(evidenceDir, { recursive: true });
  fsApi.writeFileSync(
    path.join(evidenceDir, 'vagrant-runner-readiness-history.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  );
  fsApi.writeFileSync(
    path.join(evidenceDir, 'vagrant-runner-readiness-history.md'),
    `${buildMarkdown(summary)}\n`,
    'utf8'
  );
}

function runVagrantRunnerReadinessHistoryCli(argv, deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const parsed = parseArgs(argv);
  if (parsed.helpRequested) {
    stdout.write(`${getUsage()}\n`);
    return 'help';
  }

  const summary = summarizeVagrantRunnerReadinessHistory(parsed, deps);
  stdout.write(parsed.json ? `${JSON.stringify(summary, null, 2)}\n` : `${buildMarkdown(summary)}\n`);
  return 'passed';
}

module.exports = {
  DEFAULT_CURRENT_TIMER_SEC,
  DEFAULT_RECEIPT_ROOT,
  SCHEMA,
  buildIncidents,
  buildMarkdown,
  buildRecommendation,
  classifyIssue,
  collectReceiptFiles,
  collectReceipts,
  getUsage,
  parseArgs,
  parseReceipt,
  runVagrantRunnerReadinessHistoryCli,
  summarizeVagrantRunnerReadinessHistory,
  writeEvidenceFiles
};

if (require.main === module) {
  try {
    runVagrantRunnerReadinessHistoryCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
