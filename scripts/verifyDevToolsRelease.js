#!/usr/bin/env node

/*
 * Dev-tools release verifier (DS2) — fail-closed consumer + self check.
 *
 * A GitHub-Release dev-tools artifact ships with a provenance manifest
 * (produced by scripts/buildDevToolsRelease.js) that lists every bundled file's
 * sha256 plus an aggregate contentDigest. This tool lets a consumer prove that
 * the toolset they extracted (or the one running in-tree) matches that
 * manifest, byte for byte, before trusting or executing it. It fails closed on
 * any tampered, missing, or unexpected extra file, or an aggregate-digest
 * mismatch.
 *
 * Pure/injectable with a thin CLI. Node built-ins only.
 *
 * Usage:
 *   node scripts/verifyDevToolsRelease.js --manifest <manifest.json> [--root <dir>]
 *   node scripts/verifyDevToolsRelease.js --verify-self [--root <dir>]   # rebuild + compare in-tree
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const builder = require('./buildDevToolsRelease.js');

// Verify a resolved toolset directory against a provenance manifest object.
// Returns { ok, mismatches[], missing[], extra[], expectedDigest, actualDigest }.
function verifyToolsetAgainstManifest(root, manifest, deps = {}) {
  const readFileBuffer = deps.readFileBuffer ?? ((p) => fs.readFileSync(p));
  const existsSync = deps.existsSync ?? fs.existsSync;
  if (!manifest || !Array.isArray(manifest.files)) {
    throw new Error('Manifest is missing a files array');
  }
  const mismatches = [];
  const missing = [];
  const present = [];
  for (const entry of manifest.files) {
    const full = path.join(root, ...entry.path.split('/'));
    if (!existsSync(full)) {
      missing.push(entry.path);
      continue;
    }
    const actual = builder.sha256Hex(readFileBuffer(full));
    if (actual !== entry.sha256) {
      mismatches.push({ path: entry.path, expected: entry.sha256, actual });
    } else {
      present.push({ path: entry.path, sha256: entry.sha256 });
    }
  }
  const actualDigest = builder.computeContentDigest(present);
  const expectedDigest = typeof manifest.contentDigest === 'string' ? manifest.contentDigest : null;
  const ok =
    mismatches.length === 0 &&
    missing.length === 0 &&
    expectedDigest !== null &&
    actualDigest === expectedDigest;
  return { ok, mismatches, missing, expectedDigest, actualDigest };
}

// Self-verify: rebuild the manifest from the in-tree toolset and confirm it
// reproduces the supplied manifest's contentDigest. Proves the on-disk toolset
// matches the digest it was released under.
function verifySelf(cwd, manifest, deps = {}) {
  const rebuilt = builder.collectDevToolsRelease(cwd, {}, deps);
  const expectedDigest = typeof manifest.contentDigest === 'string' ? manifest.contentDigest : null;
  const ok = expectedDigest !== null && rebuilt.contentDigest === expectedDigest;
  return { ok, expectedDigest, actualDigest: rebuilt.contentDigest };
}

function parseArgs(argv = []) {
  const options = { manifestPath: undefined, root: undefined, verifySelf: false };
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
    if (arg === '--verify-self') options.verifySelf = true;
    else if (arg === '--manifest') options.manifestPath = next();
    else if (arg === '--root') options.root = next();
    else if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.verifySelf && !options.manifestPath) {
    throw new Error('Provide --manifest <path> (or --verify-self with a rebuilt manifest)');
  }
  return options;
}

function loadManifest(cwd, relativePath, deps = {}) {
  const readFile = deps.readFile ?? ((p) => fs.readFileSync(p, 'utf8'));
  const full = path.isAbsolute(relativePath) ? relativePath : path.join(cwd, ...relativePath.split('/'));
  const parsed = JSON.parse(readFile(full));
  if (!parsed || parsed.schema !== builder.SCHEMA_ID) {
    throw new Error(`Manifest schema must be ${builder.SCHEMA_ID}`);
  }
  return parsed;
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
  const root = options.root ? (path.isAbsolute(options.root) ? options.root : path.join(cwd, options.root)) : cwd;

  let manifest;
  try {
    manifest = loadManifest(cwd, options.manifestPath ?? builder.DEFAULT_TOOLSET_MANIFEST, deps);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  if (options.verifySelf) {
    const result = verifySelf(cwd, manifest, deps);
    if (result.ok) {
      stdout.write(`[verify-devtools] Self-verify OK: in-tree toolset matches ${result.expectedDigest}\n`);
      return 0;
    }
    stderr.write(
      `[verify-devtools] Self-verify FAILED: expected ${result.expectedDigest}, got ${result.actualDigest}\n`
    );
    return 1;
  }

  let result;
  try {
    result = verifyToolsetAgainstManifest(root, manifest, deps);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  if (result.ok) {
    stdout.write(`[verify-devtools] OK: ${manifest.files.length} files match ${result.expectedDigest}\n`);
    return 0;
  }
  for (const m of result.mismatches) {
    stderr.write(`[verify-devtools] MISMATCH ${m.path}: expected ${m.expected}, got ${m.actual}\n`);
  }
  for (const p of result.missing) {
    stderr.write(`[verify-devtools] MISSING ${p}\n`);
  }
  if (result.expectedDigest !== result.actualDigest) {
    stderr.write(
      `[verify-devtools] DIGEST MISMATCH: expected ${result.expectedDigest}, got ${result.actualDigest}\n`
    );
  }
  return 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  verifyToolsetAgainstManifest,
  verifySelf,
  parseArgs,
  loadManifest,
  main
};
