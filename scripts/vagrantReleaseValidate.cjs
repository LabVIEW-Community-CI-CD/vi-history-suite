#!/usr/bin/env node

/*
 * Mandatory local Vagrant release validation + attestation recorder (VHS-REQ-666).
 *
 * This is the maintainer-run producer of the release-gating runtime attestation
 * that scripts/checkReleaseReadiness.js --require-release-attestation consumes and
 * the marketplace-release workflow enforces (fail-closed) before publishing.
 *
 * Flow:
 *   1. Preflight the Vagrant lane (scripts/vagrantLanePreflight.js).
 *   2. Bring the Windows/LabVIEW guest up (vagrant up); the box self-heals its
 *      account at boot (VIHSVagrantSelfHeal task), so no interactive login.
 *   3. Run the shipped comparison primitives IN-GUEST over WinRM against the
 *      icon-editor lv_icon.vi fixture (x86 host-native headless, VHS-REQ-665),
 *      using the in-repo scripts/windows-compare-driver.cjs on the synced repo.
 *   4. On PASS, record the attestation into the committed runtime-validation
 *      ledger track `vagrant-win-x86-hostnative` at the current package version
 *      via scripts/recordRuntimeValidation.js, then remind the maintainer to
 *      commit the ledger.
 *
 * This is a maintainer-run driver (human-in-the-loop, decision C of the plan);
 * it is intentionally a .cjs so it stays outside the scripts/*.js traceability
 * inventory glob and is not shipped in the VSIX. It never runs in hosted CI.
 *
 * Usage:
 *   npm run vagrant:validate:release
 *   node scripts/vagrantReleaseValidate.cjs [--skip-up] [--evidence <note>]
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const vagrantDir = path.join(repoRoot, 'vagrant');
const TRACK_ID = 'vagrant-win-x86-hostnative';

// In-guest paths: the Vagrantfile mounts the repo at C:\vihs-workspace.
const GUEST_REPO = 'C:\\vihs-workspace';
const GUEST_VI_PATH = 'resource/plugins/lv_icon.vi';
const GUEST_BASE = '5376833';
const GUEST_SELECTED = 'fc09736';

function log(message) {
  process.stdout.write(`[vagrant-release-validate] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[vagrant-release-validate] ERROR: ${message}\n`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    cwd: options.cwd || repoRoot,
    env: { ...process.env, GH_PAGER: 'cat', HOME: process.env.HOME },
    ...options
  });
  return result;
}

function parseArgs(argv) {
  const options = { skipUp: false, evidence: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--skip-up') options.skipUp = true;
    else if (arg === '--evidence') options.evidence = argv[++index];
    else fail(`Unknown argument: ${arg}`);
  }
  return options;
}

function getPackageVersion() {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
}

function getCommit() {
  const result = run('git', ['rev-parse', '--short', 'HEAD'], { capture: true });
  return result.status === 0 ? String(result.stdout).trim() : 'unknown';
}

// Read the committed Vagrant box manifest's sha256 so the recorded attestation
// is structurally bound to the specific box it was produced on (box-provenance
// chain). Returns undefined when the manifest is absent/unparseable.
function getBoxSha256() {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(vagrantDir, 'box-manifest.json'), 'utf8'));
    return typeof manifest.sha256 === 'string' && /^[0-9a-f]{64}$/.test(manifest.sha256)
      ? manifest.sha256
      : undefined;
  } catch {
    return undefined;
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const version = getPackageVersion();
  const commit = getCommit();
  log(`Validating release candidate ${version} (${commit}) via the Vagrant Windows/LabVIEW lane.`);

  // 1. Preflight.
  log('Preflighting the Vagrant lane...');
  const preflight = run('node', [path.join('scripts', 'vagrantLanePreflight.js'), 'preflight']);
  if (preflight.status !== 0) {
    fail('Vagrant lane preflight failed. Resolve the FAIL items (see docs/vagrant.md) before release validation.');
  }

  // 2. Bring the guest up (self-heals its account at boot).
  if (!options.skipUp) {
    log('Bringing the Windows/LabVIEW guest up (vagrant up)...');
    const up = run('vagrant', ['up', '--provider', 'virtualbox'], { cwd: vagrantDir });
    if (up.status !== 0) {
      fail('vagrant up failed. Inspect the guest console; the self-heal task should clear a restricted account automatically.');
    }
  } else {
    log('--skip-up: assuming the guest is already running.');
  }

  // 3. Run the shipped comparison primitives in-guest over WinRM.
  log('Running the in-guest comparison validation (x86 host-native headless, VHS-REQ-665)...');
  const guestScript = [
    '$ErrorActionPreference = "Stop"',
    '$env:LV_RTE_WIN_HOSTNATIVE_HEADLESS = "1"',
    '$env:WIN_PROVIDER = "host"',
    '$env:WIN_LV_BITNESS = "x86"',
    `$env:WIN_REPO_ROOT = "${GUEST_REPO}"`,
    `$env:WIN_VI_PATH = "${GUEST_VI_PATH}"`,
    `$env:WIN_BASE = "${GUEST_BASE}"`,
    `$env:WIN_SELECTED = "${GUEST_SELECTED}"`,
    `cd ${GUEST_REPO}`,
    'npm run compile',
    'node scripts\\windows-compare-driver.cjs'
  ].join('; ');

  const guest = run('vagrant', ['powershell', '-c', guestScript], { cwd: vagrantDir });
  if (guest.status !== 0) {
    fail('In-guest comparison validation FAILED. The release attestation was NOT recorded; do not publish.');
  }
  log('In-guest comparison validation PASSED.');

  // 4. Record the attestation into the committed ledger.
  log(`Recording the release attestation for track ${TRACK_ID} at ${version}...`);
  const evidence = options.evidence || `vagrant local validation ${new Date().toISOString()}`;
  const boxSha256 = getBoxSha256();
  const recordArgs = [
    path.join('scripts', 'recordRuntimeValidation.js'),
    '--track',
    TRACK_ID,
    '--version',
    version,
    '--commit',
    commit,
    '--evidence',
    evidence
  ];
  // Bind the attestation to the box it ran on when the committed manifest is
  // present (best-effort; the record still succeeds without it).
  if (boxSha256) {
    recordArgs.push('--box-sha256', boxSha256);
  }
  const record = run('node', recordArgs);
  if (record.status !== 0) {
    fail('Failed to record the attestation into the runtime-validation ledger.');
  }

  log('Release attestation recorded. NEXT: commit docs/requirements/runtime-validation-ledger.json,');
  log('then verify the gate with: npm run release:readiness:gate');
}

main();
