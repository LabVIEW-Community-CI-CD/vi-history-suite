#!/usr/bin/env node

/*
 * Maintainer Vagrant evidence driver: real Windows user-PATH admission +
 * runtime-validation proof (advisory track `vagrant-win-pathadmit-validation`).
 *
 * Complements scripts/vagrantReleaseValidate.cjs (the release-gating in-guest
 * comparison, VHS-REQ-666). This driver exercises the two real-runtime
 * boundaries that a unit test can only mock:
 *
 *   A. persistWindowsUserPathPrepend — real `[Environment]::SetEnvironmentVariable
 *      ('Path', ..., 'User')` mutation + WM_SETTINGCHANGE broadcast, driven
 *      through admitLocalRuntimeSettingsCliToTerminalPath. The driver runs it
 *      TWICE and asserts the bare `vihs` launcher directory lands in the User
 *      PATH exactly once (real idempotency, not a stubbed setx).
 *   B. validateLocalRuntimeSettingsCli --proof-out — the real bounded runtime
 *      validation against the installed LabVIEWCLI, emitting a
 *      vi-history-suite/runtime-validation-proof@v1 JSON packet. The driver
 *      copies the packet to the synced repo and asserts its schema + outcome.
 *
 * On PASS it records the advisory attestation into the committed ledger track
 * `vagrant-win-pathadmit-validation` via scripts/recordRuntimeValidation.js.
 * This track is releaseGating:false / linuxExecutable:false — it is evidence,
 * NOT a publish gate, so it never blocks a release and is never surfaced as a
 * Linux re-validation risk.
 *
 * Like vagrantReleaseValidate.cjs this is a human-in-the-loop maintainer driver,
 * intentionally a .cjs so it stays outside the scripts/*.js traceability
 * inventory glob and is never shipped in the VSIX or run in hosted CI.
 *
 * Usage:
 *   node scripts/vagrantValidationProofDriver.cjs [--skip-up] [--evidence <note>]
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const vagrantDir = path.join(repoRoot, 'vagrant');
const TRACK_ID = 'vagrant-win-pathadmit-validation';

// In-guest paths: the Vagrantfile mounts the repo at C:\vihs-workspace.
const GUEST_REPO = 'C:\\vihs-workspace';
const GUEST_GLOBAL_STORAGE = 'C:\\vihs-workspace\\win-validation\\pathadmit-globalstorage';
const GUEST_PROOF_DIR = 'C:\\vihs-workspace\\win-validation\\pathadmit-proof';

// Host-side path to the proof the guest writes into the synced repo folder.
const HOST_PROOF_JSON = path.join(
  repoRoot,
  'win-validation',
  'pathadmit-proof',
  'vihs-validation-proof.json'
);
const PROOF_SCHEMA = 'vi-history-suite/runtime-validation-proof@v1';

function log(message) {
  process.stdout.write(`[vagrant-validation-proof] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[vagrant-validation-proof] ERROR: ${message}\n`);
  process.exit(1);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    cwd: options.cwd || repoRoot,
    env: { ...process.env, GH_PAGER: 'cat', HOME: process.env.HOME },
    ...options
  });
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

// PowerShell run IN-GUEST that: builds out/, exercises the real user-PATH
// admission twice (idempotency), asserts the launcher directory is present
// exactly once in the User PATH, then writes the real validation proof packet.
function buildGuestScript() {
  const nodeAdmitSnippet = [
    'const path = require("path");',
    'const cli = require("./out/tooling/localRuntimeSettingsCli.js");',
    // A fake VS Code EnvironmentVariableCollection: we only need prepend() to be
    // callable; the real persistent (setx-equivalent) admission is what we prove.
    'const collection = { prepend() {} };',
    `const globalStorage = ${JSON.stringify(GUEST_GLOBAL_STORAGE)};`,
    `const extensionPath = ${JSON.stringify(GUEST_REPO)};`,
    '(async () => {',
    '  // Admit twice: the second call must be a no-op against the User PATH.',
    '  const plan = await cli.admitLocalRuntimeSettingsCliToTerminalPath(globalStorage, extensionPath, collection, {});',
    '  await cli.admitLocalRuntimeSettingsCliToTerminalPath(globalStorage, extensionPath, collection, {});',
    '  process.stdout.write("ROOT=" + plan.rootDirectoryPath + "\\n");',
    '})().catch((error) => { console.error(error); process.exit(3); });'
  ].join(' ');

  const verifyPathSnippet = [
    '$root = (node -e \'const cli=require("./out/tooling/localRuntimeSettingsCli.js");' +
      'const plan=cli.buildLocalRuntimeSettingsCliMaterialization(' +
      `${JSON.stringify(GUEST_GLOBAL_STORAGE)},${JSON.stringify(GUEST_REPO)},"win32");` +
      'process.stdout.write(plan.rootDirectoryPath)\')',
    "$userPath = [Environment]::GetEnvironmentVariable('Path','User')",
    "$normalized = $root.TrimEnd('\\')",
    "$matches = @(($userPath -split ';') | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Where-Object { $_.TrimEnd('\\') -ieq $normalized })",
    'if ($matches.Count -ne 1) {',
    '  Write-Error "Expected the launcher directory once in the User PATH; found $($matches.Count)."',
    '  exit 4',
    '}',
    'Write-Host "PATH admission idempotent: launcher directory present exactly once."'
  ].join('; ');

  return [
    '$ErrorActionPreference = "Stop"',
    `cd ${GUEST_REPO}`,
    'npm run compile',
    // A. Real user-PATH admission (twice) through the shipped code path.
    `node -e '${nodeAdmitSnippet}'`,
    // Assert idempotency against the real User PATH.
    verifyPathSnippet,
    // Seed the persisted runtime settings first: a clean guest has no
    // viHistorySuite.* settings, and readPersistedRuntimeSettingsFacts sets
    // requireVersionAndBitness, so an unseeded --validate would return a
    // blocked `labview-runtime-selection-required` proof instead of exercising
    // the installed LabVIEWCLI (x86 host-native, VHS-REQ-665).
    'node out\\tooling\\localRuntimeSettingsCli.js --provider host --labview-version 2026 --labview-bitness x86',
    // B. Real bounded runtime validation proof packet against the seeded install.
    `node out\\tooling\\localRuntimeSettingsCli.js --validate --proof-out ${GUEST_PROOF_DIR}`
  ].join('; ');
}

function assertProofPacket() {
  if (!fs.existsSync(HOST_PROOF_JSON)) {
    fail(`Validation proof packet was not produced at ${HOST_PROOF_JSON}.`);
  }
  let proof;
  try {
    proof = JSON.parse(fs.readFileSync(HOST_PROOF_JSON, 'utf8'));
  } catch (error) {
    fail(`Validation proof packet is not valid JSON: ${error.message}`);
  }
  if (proof.schema !== PROOF_SCHEMA) {
    fail(`Validation proof schema mismatch: expected ${PROOF_SCHEMA}, got ${proof.schema}.`);
  }
  // The proof stores the outcome under the nested `runtime` block, not as a
  // top-level field (see buildValidationProof in localRuntimeSettingsCli.ts).
  const runtime = proof.runtime && typeof proof.runtime === 'object' ? proof.runtime : {};
  const validationOutcome = runtime.validationOutcome;
  if (typeof validationOutcome !== 'string') {
    fail('Validation proof packet is missing runtime.validationOutcome.');
  }
  if (validationOutcome !== 'ready') {
    fail(
      `Runtime validation did not reach 'ready' (runtime.validationOutcome=${validationOutcome}, ` +
        `blockedReason=${runtime.blockedReason ?? '<none>'}). No advisory attestation recorded.`
    );
  }
  log(
    `Validation proof packet OK (schema=${proof.schema}, ` +
      `runtime.validationOutcome=${validationOutcome}, proofStatus=${proof.proofStatus}).`
  );
  return proof;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const version = getPackageVersion();
  const commit = getCommit();
  log(`Producing PATH-admission + validation-proof evidence for ${version} (${commit}).`);

  // 1. Preflight the Vagrant lane.
  log('Preflighting the Vagrant lane...');
  const preflight = run('node', [path.join('scripts', 'vagrantLanePreflight.js'), 'preflight']);
  if (preflight.status !== 0) {
    fail('Vagrant lane preflight failed. Resolve the FAIL items (see docs/vagrant.md) first.');
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

  // 3. Real PATH admission (idempotent) + real validation proof, in-guest.
  log('Running in-guest PATH admission + validation proof...');
  const guest = run('vagrant', ['powershell', '-c', buildGuestScript()], { cwd: vagrantDir });
  if (guest.status !== 0) {
    fail('In-guest PATH admission / validation FAILED. No attestation recorded.');
  }

  // 4. Assert the proof packet the guest wrote into the synced repo folder.
  assertProofPacket();

  // 5. Record the advisory attestation into the committed ledger.
  log(`Recording the advisory attestation for track ${TRACK_ID} at ${version}...`);
  const evidence =
    options.evidence || `vagrant pathadmit+validation proof ${new Date().toISOString()}`;
  const record = run('node', [
    path.join('scripts', 'recordRuntimeValidation.js'),
    '--track',
    TRACK_ID,
    '--version',
    version,
    '--commit',
    commit,
    '--evidence',
    evidence
  ]);
  if (record.status !== 0) {
    fail('Failed to record the attestation into the runtime-validation ledger.');
  }

  log('Advisory attestation recorded. NEXT: commit docs/requirements/runtime-validation-ledger.json');
  log('and the retained win-validation/pathadmit-proof/ packet as PR evidence.');
}

main();
