#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const DEFAULT_EVIDENCE_ROOT = path.join(repoRoot, 'vagrant', 'evidence');
const DEFAULT_RECEIPT_DIR = path.join(DEFAULT_EVIDENCE_ROOT, 'assertion');
const SCHEMA = 'vi-history-suite/vagrant-vsix-acceptance@v1';
const ASSERTION_SCHEMA = 'vi-history-suite/vagrant-vsix-acceptance-assertion@v1';
const HARNESS_ID = 'HARNESS-VHS-002';
const SELECTED_HASH = '8741bb08026c104100720c0ef48621e4ab7762fd';
const BASE_HASH = 'c188cdec606aac3b17d8b17274baa19eef3e4017';
const COLD_START_MARKERS = [
  'LabVIEW not running. Launching via scheduled task...',
  'LabVIEW VI Server ready on port 3363.'
];

function getVagrantVsixAcceptanceEvidenceUsage() {
  return [
    'Usage: node scripts/assertVagrantVsixAcceptanceEvidence.js [--evidence-root <path>] [--manifest <path>] [--acceptance-log <path>] [--receipt-dir <path>] [--help]',
    '',
    'Assert that retained Vagrant Windows VSIX acceptance evidence proves the governed HARNESS-VHS-002 host-native LabVIEWCLI smoke.',
    '',
    'Options:',
    '  --evidence-root PATH   Directory containing timestamped Vagrant evidence runs. Defaults to vagrant/evidence.',
    '  --manifest PATH        Specific acceptance manifest to validate. Defaults to latest timestamped manifest under evidence root.',
    '  --acceptance-log PATH  Acceptance provisioner log to check for cold-start markers. Defaults to <evidence-root>/acceptance-provision.log.',
    '  --receipt-dir PATH     Directory for assertion JSON/Markdown receipt. Defaults to vagrant/evidence/assertion.',
    '  --help                 Print this help text.'
  ].join('\n');
}

function parseVagrantVsixAcceptanceEvidenceArgs(argv) {
  const parsed = {
    helpRequested: false,
    evidenceRoot: DEFAULT_EVIDENCE_ROOT,
    manifestPath: undefined,
    acceptanceLogPath: undefined,
    receiptDir: DEFAULT_RECEIPT_DIR
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }

    if (argument === '--evidence-root') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --evidence-root');
      }
      parsed.evidenceRoot = path.resolve(value);
      index += 1;
      continue;
    }

    if (argument === '--manifest') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --manifest');
      }
      parsed.manifestPath = path.resolve(value);
      index += 1;
      continue;
    }

    if (argument === '--acceptance-log') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --acceptance-log');
      }
      parsed.acceptanceLogPath = path.resolve(value);
      index += 1;
      continue;
    }

    if (argument === '--receipt-dir') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --receipt-dir');
      }
      parsed.receiptDir = path.resolve(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

function stripJsonBom(text) {
  return text.replace(/^\uFEFF/u, '');
}

function readJsonFile(filePath, fsApi = fs) {
  return JSON.parse(stripJsonBom(fsApi.readFileSync(filePath, 'utf8')));
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`Expected ${label}=${expected}, found ${String(actual)}`);
  }
}

function assertFileExists(filePath, label, fsApi = fs) {
  if (!fsApi.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function assertNonemptyFile(filePath, label, fsApi = fs) {
  assertFileExists(filePath, label, fsApi);
  const stats = fsApi.statSync(filePath);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`Expected nonempty ${label}: ${filePath}`);
  }
}

function resolveLatestVagrantManifestPath(evidenceRoot, fsApi = fs) {
  assertFileExists(evidenceRoot, 'Vagrant evidence root', fsApi);

  const candidates = fsApi
    .readdirSync(evidenceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => /^\d{8}-\d{6}$/.test(entry.name))
    .map((entry) => ({
      runId: entry.name,
      manifestPath: path.join(evidenceRoot, entry.name, 'manifest.json')
    }))
    .filter((entry) => fsApi.existsSync(entry.manifestPath))
    .sort((left, right) => right.runId.localeCompare(left.runId));

  if (candidates.length === 0) {
    throw new Error(`No timestamped Vagrant acceptance manifest found under ${evidenceRoot}`);
  }

  return candidates[0].manifestPath;
}

function validateColdStartMarkers(acceptanceLogPath, fsApi = fs) {
  assertFileExists(acceptanceLogPath, 'Vagrant acceptance provision log', fsApi);
  const logText = fsApi.readFileSync(acceptanceLogPath, 'utf8');
  const missingMarkers = COLD_START_MARKERS.filter((marker) => !logText.includes(marker));

  if (missingMarkers.length > 0) {
    throw new Error(`Missing Vagrant cold-start marker(s): ${missingMarkers.join(', ')}`);
  }

  return {
    acceptanceLogPath,
    markers: [...COLD_START_MARKERS]
  };
}

function validateManifest(manifestPath, fsApi = fs) {
  assertFileExists(manifestPath, 'Vagrant acceptance manifest', fsApi);
  const manifest = readJsonFile(manifestPath, fsApi);

  assertEqual(manifest.schema, SCHEMA, 'manifest.schema');
  assertEqual(manifest.harnessId, HARNESS_ID, 'manifest.harnessId');
  assertEqual(manifest.selectedHash, SELECTED_HASH, 'manifest.selectedHash');
  assertEqual(manifest.baseHash, BASE_HASH, 'manifest.baseHash');
  assertEqual(manifest.labviewVersion, '2026', 'manifest.labviewVersion');
  assertEqual(manifest.labviewBitness, 'x86', 'manifest.labviewBitness');
  assertEqual(manifest.proofExitCode, 0, 'manifest.proofExitCode');
  assertEqual(manifest.runtimeExecutionState, 'succeeded', 'manifest.runtimeExecutionState');

  return manifest;
}

function validateHarnessReport(runDirectory, fsApi = fs) {
  const harnessReportDirectory = path.join(runDirectory, 'harness-report');
  const harnessReportJsonPath = path.join(harnessReportDirectory, 'comparison-report-smoke.json');
  const harnessReportHtmlPath = path.join(harnessReportDirectory, 'comparison-report-smoke.html');
  assertFileExists(harnessReportJsonPath, 'Vagrant harness report JSON', fsApi);
  const harnessReport = readJsonFile(harnessReportJsonPath, fsApi);

  assertEqual(harnessReport.harnessId, HARNESS_ID, 'harnessReport.harnessId');
  assertEqual(harnessReport.selectedHash, SELECTED_HASH, 'harnessReport.selectedHash');
  assertEqual(harnessReport.baseHash, BASE_HASH, 'harnessReport.baseHash');
  assertEqual(harnessReport.runtimeProvider, 'host-native', 'harnessReport.runtimeProvider');
  assertEqual(harnessReport.runtimeEngine, 'labview-cli', 'harnessReport.runtimeEngine');
  assertEqual(harnessReport.runtimeExecutionState, 'succeeded', 'harnessReport.runtimeExecutionState');
  assertEqual(harnessReport.generatedReportExists, true, 'harnessReport.generatedReportExists');
  assertNonemptyFile(harnessReportHtmlPath, 'Vagrant generated comparison report HTML', fsApi);

  return {
    harnessReportJsonPath,
    harnessReportHtmlPath,
    harnessReport
  };
}

function buildVagrantVsixAcceptanceEvidenceMarkdown(report) {
  return [
    '# Vagrant VSIX Acceptance Evidence Assertion',
    '',
    `- Status: ${report.status}`,
    `- Recorded at: ${report.recordedAt}`,
    `- Manifest: ${report.manifestPath}`,
    `- Acceptance log: ${report.acceptanceLogPath}`,
    `- Runtime provider: ${report.facts.runtimeProvider}`,
    `- Runtime engine: ${report.facts.runtimeEngine}`,
    `- Runtime execution: ${report.facts.runtimeExecutionState}`,
    `- Generated report exists: ${report.facts.generatedReportExists ? 'yes' : 'no'}`,
    ''
  ].join('\n');
}

function writeVagrantVsixAcceptanceEvidenceReceipt(report, receiptDir, fsApi = fs) {
  fsApi.mkdirSync(receiptDir, { recursive: true });
  const jsonPath = path.join(receiptDir, 'vagrant-vsix-acceptance-assertion.json');
  const markdownPath = path.join(receiptDir, 'vagrant-vsix-acceptance-assertion.md');
  fsApi.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fsApi.writeFileSync(markdownPath, buildVagrantVsixAcceptanceEvidenceMarkdown(report), 'utf8');
  return { jsonPath, markdownPath };
}

function assertVagrantVsixAcceptanceEvidence(options = {}, deps = {}) {
  const fsApi = deps.fsApi ?? fs;
  const evidenceRoot = path.resolve(options.evidenceRoot ?? DEFAULT_EVIDENCE_ROOT);
  const manifestPath = path.resolve(
    options.manifestPath ?? resolveLatestVagrantManifestPath(evidenceRoot, fsApi)
  );
  const runDirectory = path.dirname(manifestPath);
  const acceptanceLogPath = path.resolve(
    options.acceptanceLogPath ?? path.join(evidenceRoot, 'acceptance-provision.log')
  );
  const manifest = validateManifest(manifestPath, fsApi);
  const coldStart = validateColdStartMarkers(acceptanceLogPath, fsApi);
  const harness = validateHarnessReport(runDirectory, fsApi);

  const report = {
    schema: ASSERTION_SCHEMA,
    recordedAt: (deps.now ?? (() => new Date()))().toISOString(),
    status: 'passed',
    evidenceRoot,
    runDirectory,
    manifestPath,
    acceptanceLogPath: coldStart.acceptanceLogPath,
    harnessReportJsonPath: harness.harnessReportJsonPath,
    harnessReportHtmlPath: harness.harnessReportHtmlPath,
    facts: {
      manifestSchema: manifest.schema,
      harnessId: manifest.harnessId,
      selectedHash: manifest.selectedHash,
      baseHash: manifest.baseHash,
      labviewVersion: manifest.labviewVersion,
      labviewBitness: manifest.labviewBitness,
      proofExitCode: manifest.proofExitCode,
      runtimeProvider: harness.harnessReport.runtimeProvider,
      runtimeEngine: harness.harnessReport.runtimeEngine,
      runtimeExecutionState: harness.harnessReport.runtimeExecutionState,
      generatedReportExists: harness.harnessReport.generatedReportExists,
      coldStartMarkers: coldStart.markers
    }
  };

  return report;
}

function runVagrantVsixAcceptanceEvidenceAssertion(argv = process.argv.slice(2), deps = {}) {
  const parsed = parseVagrantVsixAcceptanceEvidenceArgs(argv);
  const stdout = deps.stdout ?? process.stdout;

  if (parsed.helpRequested) {
    stdout.write(`${getVagrantVsixAcceptanceEvidenceUsage()}\n`);
    return 'help';
  }

  const report = assertVagrantVsixAcceptanceEvidence(
    {
      evidenceRoot: parsed.evidenceRoot,
      manifestPath: parsed.manifestPath,
      acceptanceLogPath: parsed.acceptanceLogPath
    },
    deps
  );
  const receipt = writeVagrantVsixAcceptanceEvidenceReceipt(
    report,
    parsed.receiptDir,
    deps.fsApi ?? fs
  );
  stdout.write(`[vagrant-acceptance] Evidence assertion passed: ${receipt.jsonPath}\n`);
  return 'pass';
}

function main(argv = process.argv.slice(2), deps = {}) {
  try {
    runVagrantVsixAcceptanceEvidenceAssertion(argv, deps);
    return 0;
  } catch (error) {
    const stderr = deps.stderr ?? process.stderr;
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  ASSERTION_SCHEMA,
  BASE_HASH,
  COLD_START_MARKERS,
  HARNESS_ID,
  SCHEMA,
  SELECTED_HASH,
  assertVagrantVsixAcceptanceEvidence,
  getVagrantVsixAcceptanceEvidenceUsage,
  parseVagrantVsixAcceptanceEvidenceArgs,
  resolveLatestVagrantManifestPath,
  runVagrantVsixAcceptanceEvidenceAssertion,
  validateColdStartMarkers,
  validateHarnessReport,
  validateManifest
};
