#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_EVIDENCE_ROOT = 'vagrant/evidence';
const TIMESTAMPED_RUN_PATTERN = /^\d{8}-\d{6}$/;

function getUsage() {
  return [
    'Usage: node scripts/printLatestVagrantAcceptanceManifest.js [options]',
    '',
    'Options:',
    '  --evidence-root PATH   Vagrant evidence root. Defaults to vagrant/evidence.',
    '  --help                 Show this help.'
  ].join('\n');
}

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {
    evidenceRoot: path.resolve(DEFAULT_EVIDENCE_ROOT),
    helpRequested: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      parsed.helpRequested = true;
    } else if (arg === '--evidence-root') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --evidence-root');
      }
      parsed.evidenceRoot = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function findLatestVagrantAcceptanceManifest(evidenceRoot, fsApi = fs) {
  if (!fsApi.existsSync(evidenceRoot)) {
    return undefined;
  }

  const candidates = fsApi
    .readdirSync(evidenceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => TIMESTAMPED_RUN_PATTERN.test(entry.name))
    .map((entry) => ({
      runId: entry.name,
      runDirectory: path.join(evidenceRoot, entry.name),
      manifestPath: path.join(evidenceRoot, entry.name, 'manifest.json')
    }))
    .filter((candidate) => {
      if (!fsApi.existsSync(candidate.manifestPath)) {
        return false;
      }
      return fsApi.statSync(candidate.manifestPath).isFile();
    })
    .sort((left, right) => right.runId.localeCompare(left.runId));

  return candidates[0];
}

function printLatestVagrantAcceptanceManifest(options = {}, deps = {}) {
  const fsApi = deps.fsApi ?? fs;
  const stdout = deps.stdout ?? process.stdout;
  const evidenceRoot = path.resolve(options.evidenceRoot ?? DEFAULT_EVIDENCE_ROOT);
  const latest = findLatestVagrantAcceptanceManifest(evidenceRoot, fsApi);

  if (!latest) {
    stdout.write(`No Vagrant acceptance manifest found under ${evidenceRoot}.\n`);
    return 'missing';
  }

  stdout.write('=== Vagrant Acceptance Manifest ===\n');
  stdout.write(`Run directory: ${latest.runDirectory}\n`);
  const manifestText = fsApi.readFileSync(latest.manifestPath, 'utf8');
  stdout.write(manifestText);
  if (!manifestText.endsWith('\n')) {
    stdout.write('\n');
  }
  return 'printed';
}

function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;

  try {
    const parsed = parseArgs(argv);
    if (parsed.helpRequested) {
      stdout.write(`${getUsage()}\n`);
      return 0;
    }
    printLatestVagrantAcceptanceManifest({ evidenceRoot: parsed.evidenceRoot }, deps);
    return 0;
  } catch (error) {
    const stderr = deps.stderr ?? process.stderr;
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    stderr.write(`${getUsage()}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  DEFAULT_EVIDENCE_ROOT,
  TIMESTAMPED_RUN_PATTERN,
  findLatestVagrantAcceptanceManifest,
  getUsage,
  main,
  parseArgs,
  printLatestVagrantAcceptanceManifest
};
