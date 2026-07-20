#!/usr/bin/env node

'use strict';

// VHS-REQ-683 (dev-only sweep, epic #2159): dev-host & build tooling — build-info
// contract integrity gate.
//
// `scripts/generateBuildInfo.js` writes `out/buildInfo.json` with
// `{ extensionVersion, extensionCommit }`, and the shipped runtime consumer
// `src/tooling/buildInfo.ts` reads exactly those keys to compose the extension's
// build ref (`<version>+<shortCommit>`). Nothing previously asserted that the
// generator's output actually satisfies the consumer's contract: a regression
// that dropped a key or emitted a malformed version/commit would silently
// degrade the runtime build ref.
//
// This gate runs the real generator (with an in-memory write boundary) and FAILS
// CLOSED when its emitted build-info record does not satisfy the consumer
// contract. The validation is pure and injectable so it is unit-tested with
// synthetic records and no filesystem.

const fs = require('node:fs');
const path = require('node:path');
const { generateBuildInfo } = require('./generateBuildInfo.js');

const UNKNOWN_COMMIT = '<unknown>';
const REQUIRED_KEYS = ['extensionVersion', 'extensionCommit'];
// A real commit is a 7–40 char hex sha; the generator uses `<unknown>` when git
// is unavailable, which the consumer accepts as a sentinel.
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i;

// Pure: validate a build-info record against the runtime consumer contract.
// Returns { ok, problems: [{ reason, detail }] }.
function validateBuildInfoRecord(record, options = {}) {
  const problems = [];
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return { ok: false, problems: [{ reason: 'not-an-object', detail: typeof record }] };
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in record)) {
      problems.push({ reason: 'missing-key', detail: key });
    }
  }
  const version = record.extensionVersion;
  if (typeof version !== 'string' || version.trim().length === 0) {
    problems.push({ reason: 'version-invalid', detail: String(version) });
  } else if (typeof options.expectedVersion === 'string' && version.trim() !== options.expectedVersion.trim()) {
    problems.push({ reason: 'version-mismatch', detail: `${version.trim()} != ${options.expectedVersion.trim()}` });
  }
  const commit = record.extensionCommit;
  if (typeof commit !== 'string' || commit.trim().length === 0) {
    problems.push({ reason: 'commit-invalid', detail: String(commit) });
  } else {
    const trimmed = commit.trim();
    if (trimmed !== UNKNOWN_COMMIT && !COMMIT_PATTERN.test(trimmed)) {
      problems.push({ reason: 'commit-malformed', detail: trimmed });
    }
  }
  return { ok: problems.length === 0, problems };
}

// Run the real generator with an in-memory write boundary (never touches disk)
// and validate its output against the package version.
function checkBuildInfoContract(deps = {}) {
  const repoRoot = deps.repoRoot || path.resolve(__dirname, '..');
  const generate = deps.generateBuildInfo || generateBuildInfo;
  const readFileSync = deps.readFileSync || fs.readFileSync;
  let expectedVersion;
  try {
    expectedVersion = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
  } catch {
    expectedVersion = undefined;
  }
  const { buildInfo } = generate({
    repoRoot,
    // In-memory: swallow the write and directory creation so the gate is read-only.
    writeFile: () => {},
    mkdirSync: () => {},
    ...deps.generateOverrides
  });
  return { buildInfo, result: validateBuildInfoRecord(buildInfo, { expectedVersion }) };
}

function renderBuildInfoIntegrity(result) {
  const problems = (result && Array.isArray(result.problems)) ? result.problems : [];
  if (problems.length === 0) {
    return '[build-info-integrity] OK: generated build-info satisfies the runtime consumer contract.';
  }
  const lines = [`[build-info-integrity] FAIL: ${problems.length} build-info contract problem(s):`];
  for (const p of problems) {
    lines.push(`  - ${p.reason} (${p.detail})`);
  }
  return lines.join('\n');
}

module.exports = {
  UNKNOWN_COMMIT,
  REQUIRED_KEYS,
  validateBuildInfoRecord,
  checkBuildInfoContract,
  renderBuildInfoIntegrity
};

if (require.main === module) {
  const { result } = checkBuildInfoContract();
  process.stdout.write(`${renderBuildInfoIntegrity(result)}\n`);
  process.exit(result.ok ? 0 : 1);
}
