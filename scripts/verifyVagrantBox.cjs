#!/usr/bin/env node

/*
 * Golden-box integrity manifest + verifier (Vagrant lane durability).
 *
 * The Windows/LabVIEW golden box is a large (~71 GB) binary that cannot live in
 * git and is rebuilt by hand. If it is restored from a backup, copied to a
 * second host, or archived to durable storage, nothing today confirms the
 * restored artifact is intact and is the exact box the recorded attestations
 * were produced on. This tool closes that gap with a small, committed
 * fingerprint (`vagrant/box-manifest.json`) and a fail-closed verifier.
 *
 * It is a maintainer-run helper (human-in-the-loop), intentionally a `.cjs` so
 * it stays outside the `scripts/*.js` traceability inventory glob and is never
 * shipped in the VSIX or run in hosted CI. It uses only Node built-ins.
 *
 * Usage:
 *   node scripts/verifyVagrantBox.cjs --generate <box-file> [--note <text>]
 *   node scripts/verifyVagrantBox.cjs --verify <box-file>
 *   node scripts/verifyVagrantBox.cjs --print
 *
 * --generate  Hash the box file and (re)write the committed manifest. Run this
 *             after rebuilding the golden box; commit the updated manifest.
 * --verify    Fail closed unless the box file's SHA-256 and size match the
 *             committed manifest. Run this after restoring/copying a box.
 * --print     Print the committed manifest.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const repoRoot = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(repoRoot, 'vagrant', 'box-manifest.json');
const MANIFEST_SCHEMA = 'vi-history-suite/vagrant-box-manifest@v1';

function log(message) {
  process.stdout.write(`[verify-vagrant-box] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[verify-vagrant-box] ERROR: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { mode: undefined, boxPath: undefined, note: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--generate') {
      options.mode = 'generate';
      options.boxPath = argv[++index];
    } else if (arg === '--verify') {
      options.mode = 'verify';
      options.boxPath = argv[++index];
    } else if (arg === '--print') {
      options.mode = 'print';
    } else if (arg === '--note') {
      options.note = argv[++index];
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }
  if (!options.mode) {
    fail('One of --generate <box>, --verify <box>, or --print is required.');
  }
  if ((options.mode === 'generate' || options.mode === 'verify') && !options.boxPath) {
    fail(`--${options.mode} requires a box file path.`);
  }
  return options;
}

// Stream the file through SHA-256 so a 71 GB box never lands in memory.
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    fail(`No committed box manifest at ${MANIFEST_PATH}. Run --generate first.`);
  }
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (error) {
    fail(`Box manifest is not valid JSON: ${error.message}`);
  }
  return undefined;
}

function getPackageVersion() {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
}

async function generate(options) {
  if (!fs.existsSync(options.boxPath)) {
    fail(`Box file not found: ${options.boxPath}`);
  }
  const sizeBytes = fs.statSync(options.boxPath).size;
  log(`Hashing ${options.boxPath} (${sizeBytes} bytes)... this can take a few minutes.`);
  const sha256 = await hashFile(options.boxPath);
  const manifest = {
    schema: MANIFEST_SCHEMA,
    schemaVersion: 1,
    boxFileName: path.basename(options.boxPath),
    sha256,
    sizeBytes,
    recordedAt: new Date().toISOString(),
    recordedForVersion: getPackageVersion(),
    note:
      options.note ||
      'Windows 11 + LabVIEW 2026 golden box with boot-time WinRM/account self-heal (VIHSVagrantSelfHeal).'
  };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  log(`Wrote ${MANIFEST_PATH}`);
  log(`  sha256=${sha256}`);
  log(`  sizeBytes=${sizeBytes}`);
  log('NEXT: commit vagrant/box-manifest.json. Archive the box to durable storage,');
  log('then confirm the archived copy with --verify before trusting it.');
}

async function verify(options) {
  const manifest = readManifest();
  if (!fs.existsSync(options.boxPath)) {
    fail(`Box file not found: ${options.boxPath}`);
  }
  const sizeBytes = fs.statSync(options.boxPath).size;
  if (sizeBytes !== manifest.sizeBytes) {
    fail(
      `Size mismatch: box is ${sizeBytes} bytes but the manifest records ${manifest.sizeBytes}. ` +
        'The box is truncated, corrupted, or a different build.'
    );
  }
  log(`Hashing ${options.boxPath} (${sizeBytes} bytes)... this can take a few minutes.`);
  const sha256 = await hashFile(options.boxPath);
  if (sha256 !== manifest.sha256) {
    fail(
      `SHA-256 mismatch: box is ${sha256} but the manifest records ${manifest.sha256}. ` +
        'The box does not match the committed fingerprint; do not trust it.'
    );
  }
  log(`Box integrity VERIFIED against ${MANIFEST_PATH}.`);
  log(`  sha256=${sha256}`);
  log(`  recordedForVersion=${manifest.recordedForVersion}`);
}

function printManifest() {
  const manifest = readManifest();
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === 'generate') {
    await generate(options);
  } else if (options.mode === 'verify') {
    await verify(options);
  } else {
    printManifest();
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
