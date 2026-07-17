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
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const vagrantDir = path.join(repoRoot, 'vagrant');
const TRACK_ID = 'vagrant-win-pathadmit-validation';

// In-guest paths: the Vagrantfile mounts the repo at C:\vihs-workspace.
const GUEST_REPO = 'C:\\vihs-workspace';
const GUEST_GLOBAL_STORAGE = 'C:\\vihs-workspace\\win-validation\\pathadmit-globalstorage';
// The proof is written to a GUEST-LOCAL dir (not the shared folder): after a
// host-side delete of a shared path, the VirtualBox shared-folder host cache
// can go stale and never surface the guest's recreation. We instead emit the
// proof JSON on stdout between sentinels and let the driver persist it host-side.
const GUEST_PROOF_DIR = 'C:\\vihs-proof-tmp';

// Host-side path where the driver persists the captured proof packet.
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

// Read the committed Vagrant box manifest sha256 to bind the attestation to the
// box it ran on (box-provenance chain). Undefined when absent/unparseable OR
// when VIHS_VAGRANT_BOX overrides the box (the committed manifest fingerprints
// the DEFAULT box; binding it to an override run would be false provenance).
function getBoxSha256() {
  if (process.env.VIHS_VAGRANT_BOX && process.env.VIHS_VAGRANT_BOX.trim()) {
    return undefined;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(vagrantDir, 'box-manifest.json'), 'utf8'));
    return typeof manifest.sha256 === 'string' && /^[0-9a-f]{64}$/.test(manifest.sha256)
      ? manifest.sha256
      : undefined;
  } catch {
    return undefined;
  }
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
    // B. Real bounded runtime validation proof packet against the seeded install,
    // written to a guest-local dir to avoid shared-folder host-cache staleness.
    `if (Test-Path ${GUEST_PROOF_DIR}) { Remove-Item -Recurse -Force ${GUEST_PROOF_DIR} }`,
    `node out\\tooling\\localRuntimeSettingsCli.js --validate --proof-out ${GUEST_PROOF_DIR}`
  ].join('; ');
}

// A dedicated second invocation that only prints the guest-local proof JSON.
// Kept separate from the main script so the command echo Vagrant prints to
// stdout contains no JSON braces, letting the driver extract the packet by
// brace-matching without relying on the shared-folder mount.
function buildEmitProofScript() {
  return `Get-Content -Raw ${GUEST_PROOF_DIR}\\vihs-validation-proof.json`;
}

// Extract the proof JSON from the dedicated emit invocation's stdout by
// brace-matching (the `Get-Content` command echo contains no JSON braces),
// persist it host-side (the driver owns the write, so no shared-folder read is
// involved), and assert schema + a `ready` runtime outcome.
function persistAndAssertProofPacket(emitStdout) {
  const begin = emitStdout.indexOf('{');
  const end = emitStdout.lastIndexOf('}');
  if (begin < 0 || end < 0 || end <= begin) {
    fail('Guest did not emit a JSON proof packet.');
  }
  // Vagrant prefixes each guest output line with `    default: `; strip it.
  const rawJson = emitStdout
    .slice(begin, end + 1)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*default:\s?/, ''))
    .join('\n');
  let proof;
  try {
    proof = JSON.parse(rawJson);
  } catch (error) {
    fail(`Emitted validation proof is not valid JSON: ${error.message}`);
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
  // Persist the captured packet host-side for retained PR/ledger evidence.
  const serialized = `${JSON.stringify(proof, null, 2)}
`;
  fs.mkdirSync(path.dirname(HOST_PROOF_JSON), { recursive: true });
  fs.writeFileSync(HOST_PROOF_JSON, serialized, 'utf8');
  // Hash the exact retained bytes so the committed ledger attestation is
  // tamper-evident: the evidence line names the SHA-256 of the proof packet it
  // was derived from, letting anyone holding the (gitignored, local) packet
  // confirm the committed record matches what the driver actually observed.
  const sha256 = crypto.createHash('sha256').update(serialized).digest('hex');
  log(
    `Validation proof OK (schema=${proof.schema}, ` +
      `runtime.validationOutcome=${validationOutcome}, proofStatus=${proof.proofStatus}). ` +
      `Persisted to ${HOST_PROOF_JSON} (sha256=${sha256}).`
  );
  return { proof, sha256 };
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
  const guest = run('vagrant', ['powershell', '-c', buildGuestScript()], {
    cwd: vagrantDir,
    capture: true
  });
  if (guest.stdout) {
    process.stdout.write(guest.stdout);
  }
  if (guest.stderr) {
    process.stderr.write(guest.stderr);
  }
  if (guest.status !== 0) {
    fail('In-guest PATH admission / validation FAILED. No attestation recorded.');
  }

  // 4. Emit the guest-local proof JSON via a dedicated invocation, then
  // extract, persist, and assert it host-side.
  const emit = run('vagrant', ['powershell', '-c', buildEmitProofScript()], {
    cwd: vagrantDir,
    capture: true
  });
  if (emit.status !== 0) {
    fail('Failed to read the guest-local validation proof packet.');
  }
  const { sha256 } = persistAndAssertProofPacket(String(emit.stdout || ''));

  // 5. Record the advisory attestation into the committed ledger. The evidence
  // always names the proof packet's SHA-256 so the committed record is
  // tamper-evident and traceable back to the exact retained proof, even when
  // the maintainer supplies a custom --evidence note (the hash is appended to
  // it rather than replaced).
  log(`Recording the advisory attestation for track ${TRACK_ID} at ${version}...`);
  const proofTag = `sha256:${sha256}`;
  const evidence = options.evidence
    ? `${options.evidence} ${proofTag}`
    : `vagrant pathadmit+validation proof ${proofTag} ${new Date().toISOString()}`;
  const record = run('node', [
    path.join('scripts', 'recordRuntimeValidation.js'),
    '--track',
    TRACK_ID,
    '--version',
    version,
    '--commit',
    commit,
    '--evidence',
    evidence,
    ...(getBoxSha256() ? ['--box-sha256', getBoxSha256()] : [])
  ]);
  if (record.status !== 0) {
    fail('Failed to record the attestation into the runtime-validation ledger.');
  }

  log('Advisory attestation recorded. NEXT: commit docs/requirements/runtime-validation-ledger.json');
  log('and the retained win-validation/pathadmit-proof/ packet as PR evidence.');
}

main();
