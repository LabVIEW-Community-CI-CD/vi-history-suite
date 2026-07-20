#!/usr/bin/env node

'use strict';

// VHS-REQ-697 (Agent Environment Consistency Gate, epic #2144): detect a stale
// local working environment after a merge/checkout so agents (and humans) stop
// wasting time on the documented pitfalls — stale node_modules ("tsc not found"),
// stale out/, and un-read requirement changes.
//
// This is the single testable core reused by the git hooks (post-merge,
// post-checkout, pre-commit) and the `env:sync:check` npm script. Pure evaluation
// is separated from collection so the decision logic is unit-tested with synthetic
// facts and no real fs.
//
// DESIGN — why a hash marker, not mtimes:
//   `git checkout`/`git reset` rewrite package-lock.json's mtime to "now", so an
//   mtime comparison would report node_modules "stale" after exactly the git
//   operations these hooks run in (a false positive). Instead, at install time the
//   `prepare` lifecycle records sha256(package-lock.json) into a git-ignored marker
//   under node_modules/ (wiped whenever node_modules is). Staleness is then:
//     - marker missing  -> node_modules absent/never installed from this lock, or
//     - marker != now    -> the lockfile changed since the last install.
//   This is content-based and immune to mtime churn. out/ staleness is driven by
//   the git DELTA (did src/tsconfig change in this merge/checkout) passed by the
//   hook, plus an out/-present check — never fs mtime.
//
// Enforcement contract (approved design, issue #2164): only the node_modules-vs-
// lock mismatch is HARD (fails the pre-commit gate); out/ and requirement changes
// are ADVISORY (reported, never block a commit).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { parseSharedOutputArgs, outputModeForOptions } = require('./lib/outputContract.js');

const INSTALLED_LOCK_HASH_MARKER = path.join('node_modules', '.vihs-installed-lock-hash');

// Pure: evaluate environment-sync facts into problems + a hard-stale verdict.
// facts:
//   - lockHashMatches:    true when sha256(package-lock.json) equals the recorded
//                         install marker; false on mismatch; undefined when the
//                         marker is missing (node_modules absent/never installed)
//   - outPresent:         boolean — out/ exists with compiled output
//   - sourcesChanged:     boolean — src/** or tsconfig changed in the git delta
//   - requirementsChanged: boolean — docs/requirements/** changed in the git delta
function evaluateEnvSync(facts = {}) {
  const problems = [];

  // node_modules vs lock (HARD).
  if (facts.lockHashMatches !== true) {
    problems.push({
      id: 'node-modules-stale',
      hard: true,
      message:
        facts.lockHashMatches === undefined
          ? 'node_modules is missing or was never installed from the current lockfile'
          : 'package-lock.json changed since node_modules was last installed',
      remedy: 'npm ci'
    });
  }

  // out/ (ADVISORY): missing output, or sources changed in this update.
  if (facts.outPresent !== true || facts.sourcesChanged === true) {
    problems.push({
      id: 'out-stale',
      hard: false,
      message:
        facts.outPresent !== true
          ? 'out/ is missing (no compiled output)'
          : 'source files changed in this update; the compiled out/ may be stale',
      remedy: 'npm run compile'
    });
  }

  // requirements changed (ADVISORY).
  if (facts.requirementsChanged === true) {
    problems.push({
      id: 'requirements-changed',
      hard: false,
      message: 'docs/requirements/** changed in this update',
      remedy: 're-read docs/requirements before implementing'
    });
  }

  return { problems, hardStale: problems.some((problem) => problem.hard) };
}

function computeLockHash(repoRoot, deps = {}) {
  const readFileSync = deps.readFileSync || fs.readFileSync;
  try {
    const bytes = readFileSync(path.join(repoRoot, 'package-lock.json'));
    return crypto.createHash('sha256').update(bytes).digest('hex');
  } catch {
    return undefined;
  }
}

function readInstalledLockHash(repoRoot, deps = {}) {
  const readFileSync = deps.readFileSync || fs.readFileSync;
  try {
    return String(readFileSync(path.join(repoRoot, INSTALLED_LOCK_HASH_MARKER), 'utf8')).trim() || undefined;
  } catch {
    return undefined;
  }
}

// Record sha256(package-lock.json) into the git-ignored marker so a later check
// can tell in-sync from stale independent of mtimes. Called by the `prepare`
// lifecycle after an install. No-ops safely (returns a result) when node_modules
// or the lockfile is absent.
function recordInstalledLockHash(repoRoot, deps = {}) {
  const existsSync = deps.existsSync || fs.existsSync;
  const writeFileSync = deps.writeFileSync || fs.writeFileSync;
  const hash = computeLockHash(repoRoot, deps);
  if (hash === undefined) {
    return { action: 'skipped', reason: 'no-package-lock' };
  }
  if (!existsSync(path.join(repoRoot, 'node_modules'))) {
    return { action: 'skipped', reason: 'no-node-modules' };
  }
  try {
    writeFileSync(path.join(repoRoot, INSTALLED_LOCK_HASH_MARKER), `${hash}\n`, 'utf8');
    return { action: 'recorded', hash };
  } catch (error) {
    return { action: 'failed', reason: String(error && error.message ? error.message : error) };
  }
}

// Collect live environment-sync facts. Injectable for tests.
function collectEnvFacts(options = {}, deps = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  const existsSync = deps.existsSync || fs.existsSync;
  const currentHash = computeLockHash(repoRoot, deps);
  const installedHash = readInstalledLockHash(repoRoot, deps);
  const lockHashMatches =
    installedHash === undefined ? undefined : currentHash !== undefined && currentHash === installedHash;
  let outPresent = false;
  try {
    outPresent = existsSync(path.join(repoRoot, 'out'));
  } catch {
    outPresent = false;
  }
  return {
    lockHashMatches,
    outPresent,
    sourcesChanged: options.sourcesChanged === true,
    requirementsChanged: options.requirementsChanged === true
  };
}

function renderReport(result, context) {
  const lines = [];
  const label = context && context.label ? `[${context.label}] ` : '';
  if (result.problems.length === 0) {
    lines.push(`${label}environment is in sync.`);
    return lines;
  }
  lines.push(`${label}environment sync check found ${result.problems.length} item(s):`);
  for (const problem of result.problems) {
    lines.push(`${label}${problem.hard ? 'BLOCKING' : 'advisory'}: ${problem.message} — ${problem.remedy}`);
  }
  if (result.hardStale) {
    lines.push(`${label}A blocking condition is present; run the remedy above before committing.`);
  }
  return lines;
}

function parseArgs(argv) {
  return parseSharedOutputArgs(argv, {
    boolFlags: {
      '--report': 'report',
      '--enforce': 'enforce',
      '--record-lock-hash': 'recordLockHash',
      '--sources-changed': 'sourcesChanged',
      '--requirements-changed': 'requirementsChanged'
    },
    valueFlags: { '--label': 'label' },
    excludeCommonFlags: ['--markdown', '--schema', '--include-provenance', '--output'],
    defaults: {}
  });
}

function run(argv, deps = {}) {
  const { options } = parseArgs(argv);
  const repoRoot = deps.repoRoot || process.cwd();

  if (options.recordLockHash) {
    const outcome = recordInstalledLockHash(repoRoot, deps);
    return {
      exitCode: 0,
      stdout: `[env-sync] lock hash ${outcome.action}${outcome.reason ? ` (${outcome.reason})` : ''}.`
    };
  }

  const facts = collectEnvFacts(
    {
      repoRoot,
      sourcesChanged: options.sourcesChanged === true,
      requirementsChanged: options.requirementsChanged === true
    },
    deps
  );
  const result = evaluateEnvSync(facts);
  const outputMode = outputModeForOptions(options);
  const exitCode = options.enforce && result.hardStale ? 1 : 0;
  if (outputMode === 'json') {
    return { exitCode, stdout: JSON.stringify(result, null, 2) };
  }
  return { exitCode, stdout: renderReport(result, { label: options.label }).join('\n') };
}

module.exports = {
  INSTALLED_LOCK_HASH_MARKER,
  evaluateEnvSync,
  computeLockHash,
  readInstalledLockHash,
  recordInstalledLockHash,
  collectEnvFacts,
  renderReport,
  run
};

if (require.main === module) {
  const outcome = run(process.argv.slice(2));
  if (outcome.stdout) {
    process.stdout.write(`${outcome.stdout}\n`);
  }
  process.exit(outcome.exitCode || 0);
}
