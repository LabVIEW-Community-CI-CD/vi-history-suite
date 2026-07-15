#!/usr/bin/env node

/**
 * Runtime-validation ledger recorder (VHS-REQ-601).
 *
 * Completes the runtime-fidelity loop opened by the risk-ledger dimension
 * (scripts/buildRiskLedger.js): that dimension READS
 * docs/requirements/runtime-validation-ledger.json and surfaces any
 * Linux-executable comparison-runtime track not validated at the current build
 * as a selectable re-validation risk. This script is the WRITE side — after a
 * real-runtime validation driver passes for a track, it records the track's new
 * lastValidatedVersion / lastValidatedCommit / evidence into the committed
 * ledger safely, instead of hand-editing JSON (which is error-prone and is
 * exactly the friction that previously kept this signal in issue comments and
 * agent memory rather than in tracked evidence).
 *
 * Fail-closed: an unknown trackId, a missing/blank version, or a malformed
 * version string is rejected before any write. Pure helpers stay separate from a
 * thin CLI so the update logic is unit-testable with injected fixtures; only Node
 * built-ins are used, so no dependency install is required.
 *
 * Usage:
 *   node scripts/recordRuntimeValidation.js --track <trackId> --version <x.y.z> \
 *     [--commit <sha>] [--evidence <issue:#NNN|note>] [--ledger <relative-path>] [--json]
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_LEDGER_PATH = 'docs/requirements/runtime-validation-ledger.json';
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

// Validate the semantic version string (x.y.z) shared with package.json.
function isValidVersion(value) {
  return typeof value === 'string' && VERSION_PATTERN.test(value.trim());
}

// Pure update: return a NEW manifest object with the named track's validation
// fields updated. Throws (fail-closed) on an unknown track or invalid version so
// a malformed record never reaches disk.
function applyRuntimeValidationRecord(manifest, record) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.tracks)) {
    throw new Error('Runtime-validation ledger is missing or has no tracks array.');
  }
  const trackId = typeof record.trackId === 'string' ? record.trackId.trim() : '';
  if (!trackId) {
    throw new Error('--track is required.');
  }
  if (!isValidVersion(record.version)) {
    throw new Error(`--version must be a semantic version (x.y.z); received "${record.version}".`);
  }

  const index = manifest.tracks.findIndex(
    (track) => track && typeof track === 'object' && track.trackId === trackId
  );
  if (index < 0) {
    const known = manifest.tracks
      .map((track) => (track && track.trackId) || '<malformed>')
      .join(', ');
    throw new Error(`Unknown track "${trackId}". Known tracks: ${known}.`);
  }

  const updatedTrack = {
    ...manifest.tracks[index],
    lastValidatedVersion: record.version.trim()
  };
  if (typeof record.commit === 'string' && record.commit.trim()) {
    updatedTrack.lastValidatedCommit = record.commit.trim();
  }
  if (typeof record.evidence === 'string' && record.evidence.trim()) {
    updatedTrack.evidence = record.evidence.trim();
  }

  const tracks = [...manifest.tracks];
  tracks[index] = updatedTrack;
  return { ...manifest, tracks };
}

// Two-space JSON with a trailing newline, matching the committed ledger style so
// the diff stays minimal and byte-consistent with the original file.
function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function resolveLedgerPath(cwd, relativePath) {
  const target = relativePath || DEFAULT_LEDGER_PATH;
  if (path.isAbsolute(target)) {
    throw new Error('--ledger must be a relative path inside the working directory.');
  }
  const resolved = path.resolve(cwd, target);
  const root = path.resolve(cwd) + path.sep;
  if (!resolved.startsWith(root)) {
    throw new Error('--ledger must stay inside the working directory.');
  }
  return resolved;
}

function parseArgs(argv = []) {
  const options = {
    trackId: undefined,
    version: undefined,
    commit: undefined,
    evidence: undefined,
    ledgerPath: undefined,
    json: false,
    positionals: []
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };
    if (arg === '--track') options.trackId = next();
    else if (arg === '--version') options.version = next();
    else if (arg === '--commit') options.commit = next();
    else if (arg === '--evidence') options.evidence = next();
    else if (arg === '--ledger') options.ledgerPath = next();
    else if (arg === '--json') options.json = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    else options.positionals.push(arg);
  }
  return options;
}

function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const cwd = deps.cwd || process.cwd();
  const readFile = deps.readFile ?? ((p) => fs.readFileSync(p, 'utf8'));
  const writeFile = deps.writeFile ?? ((p, content) => fs.writeFileSync(p, content, 'utf8'));

  let ledgerPath;
  try {
    ledgerPath = resolveLedgerPath(cwd, options.ledgerPath);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFile(ledgerPath));
  } catch (error) {
    stderr.write(`Failed to read runtime-validation ledger at ${options.ledgerPath || DEFAULT_LEDGER_PATH}: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  let updated;
  try {
    updated = applyRuntimeValidationRecord(manifest, {
      trackId: options.trackId,
      version: options.version,
      commit: options.commit,
      evidence: options.evidence
    });
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  writeFile(ledgerPath, serializeManifest(updated));

  const recordedTrack = updated.tracks.find((track) => track.trackId === options.trackId.trim());
  if (options.json) {
    stdout.write(`${JSON.stringify({ ledger: options.ledgerPath || DEFAULT_LEDGER_PATH, track: recordedTrack }, null, 2)}\n`);
  } else {
    stdout.write(
      `[runtime-validation] Recorded ${recordedTrack.trackId} validated at ${recordedTrack.lastValidatedVersion}` +
        `${recordedTrack.lastValidatedCommit ? ` (${recordedTrack.lastValidatedCommit})` : ''}` +
        `${recordedTrack.evidence ? ` evidence ${recordedTrack.evidence}` : ''}.\n`
    );
  }
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  DEFAULT_LEDGER_PATH,
  VERSION_PATTERN,
  isValidVersion,
  applyRuntimeValidationRecord,
  serializeManifest,
  resolveLedgerPath,
  parseArgs,
  main
};
