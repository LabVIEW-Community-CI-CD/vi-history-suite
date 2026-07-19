#!/usr/bin/env node

/*
 * Dev-tools release content-digest + provenance builder (DS1).
 *
 * Distributing the development tooling (scripts CLIs, .cjs drivers, the compiled
 * MCP server, requirements docs, and agent-customization surfaces) via GitHub
 * Releases needs a deterministic, content-addressed fingerprint of exactly what
 * ships, bound to the requirements state it was cut from. This module resolves
 * the committed toolset manifest (docs/devtools-release.manifest.json) into a
 * sorted file list, hashes each file, folds those into a single aggregate
 * `contentDigest`, and emits a provenance manifest.
 *
 * It is pure/injectable (all I/O behind deps) with a thin CLI entrypoint so the
 * DS3 release workflow and unit tests can drive it deterministically. No
 * network, no tarball packing yet (that is DS2).
 *
 * Usage:
 *   node scripts/buildDevToolsRelease.js [--channel stable|prerelease] \
 *     [--manifest <path>] [--output <relative-path>] [--json]
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { execSync } = require('node:child_process');
const { globSync } = require('glob');
const {
  JSON_SCHEMA_DIALECT,
  renderSchemaDocument,
  schemaEnvelopeFields,
  schemaEnvelopePropertyNodes
} = require('./lib/schemaEnvelope.js');
const { parseSharedOutputArgs } = require('./lib/outputContract.js');
const { isValidSemVer } = require('./lib/semver.cjs');

const SCHEMA_ID = 'vi-history-suite/devtools-release@v1';
const SCHEMA_VERSION = 1;
const DEFAULT_TOOLSET_MANIFEST = 'docs/devtools-release.manifest.json';
const REQUIREMENTS_MANIFEST_RELATIVE_PATH = 'out/requirements/requirements-manifest.json';
const CHANNELS = ['stable', 'prerelease'];
const UNKNOWN_COMMIT = '<unknown>';

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function getGitCommit(cwd, deps = {}) {
  const run = deps.execSync ?? execSync;
  try {
    return run('git rev-parse HEAD', { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return UNKNOWN_COMMIT;
  }
}

function getPackageVersion(cwd, deps = {}) {
  const readFile = deps.readFile ?? ((p) => fs.readFileSync(p, 'utf8'));
  try {
    return JSON.parse(readFile(path.join(cwd, 'package.json'))).version;
  } catch {
    return '0.0.0';
  }
}

// Read + parse the committed toolset manifest (the source of truth for globs).
function loadToolsetManifest(cwd, relativePath, deps = {}) {
  const readFile = deps.readFile ?? ((p) => fs.readFileSync(p, 'utf8'));
  const raw = readFile(path.join(cwd, ...relativePath.split('/')));
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.schema !== SCHEMA_ID) {
    throw new Error(`Toolset manifest schema must be ${SCHEMA_ID}`);
  }
  if (!Array.isArray(parsed.categories) || parsed.categories.length === 0) {
    throw new Error('Toolset manifest must declare a non-empty categories array');
  }
  // The dev-tools version is an independent SemVer 2.0 line (VHS-REQ-676); fail
  // closed when it is missing or malformed so a release can never publish an
  // unversioned or non-semver toolset.
  if (typeof parsed.version !== 'string' || !isValidSemVer(parsed.version)) {
    throw new Error(
      `Toolset manifest must declare a SemVer 2.0 "version" (got: ${JSON.stringify(parsed.version)})`
    );
  }
  return parsed;
}

// Resolve the manifest globs into a deterministic, de-duplicated, sorted list of
// repo-relative POSIX paths. Excludes are applied globally.
function resolveToolsetFiles(cwd, manifest, deps = {}) {
  const glob = deps.globSync ?? globSync;
  const exclude = Array.isArray(manifest.exclude) ? manifest.exclude : [];
  const found = new Set();
  for (const category of manifest.categories) {
    const include = Array.isArray(category.include) ? category.include : [];
    for (const pattern of include) {
      const matches = glob(pattern, { cwd, nodir: true, ignore: exclude, dot: true });
      for (const match of matches) {
        found.add(match.split(path.sep).join('/'));
      }
    }
  }
  return [...found].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// Per-file sha256 + byte size for every resolved file.
function computeFileDigests(cwd, relativePaths, deps = {}) {
  const readFileBuffer = deps.readFileBuffer ?? ((p) => fs.readFileSync(p));
  return relativePaths.map((relativePath) => {
    const buffer = readFileBuffer(path.join(cwd, ...relativePath.split('/')));
    return { path: relativePath, sha256: sha256Hex(buffer), bytes: buffer.length };
  });
}

// Fold the per-file digests into one aggregate content digest. Deterministic:
// hashes the sorted "path:sha256" lines, so the digest is independent of glob
// ordering and stable across hosts/runs for identical file bytes.
function computeContentDigest(fileDigests) {
  const lines = fileDigests
    .map((entry) => `${entry.path}:${entry.sha256}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .join('\n');
  return sha256Hex(Buffer.from(lines, 'utf8'));
}

// Read the compiled requirements-manifest integrity digest, binding the release
// to its requirements state. Returns null when the manifest is not built.
function readRequirementsManifestDigest(cwd, deps = {}) {
  const readFile = deps.readFile ?? ((p) => fs.readFileSync(p, 'utf8'));
  try {
    const raw = readFile(path.join(cwd, ...REQUIREMENTS_MANIFEST_RELATIVE_PATH.split('/')));
    const parsed = JSON.parse(raw);
    return typeof parsed.integrityDigest === 'string' ? parsed.integrityDigest : null;
  } catch {
    return null;
  }
}

function normalizeChannel(channel) {
  if (channel === undefined) {
    return 'prerelease';
  }
  if (!CHANNELS.includes(channel)) {
    throw new Error(`--channel must be one of: ${CHANNELS.join(', ')}`);
  }
  return channel;
}

// --- deterministic tarball packing (POSIX ustar + gzip, Node built-ins only) ---
//
// A released toolset is packed reproducibly so identical inputs yield a
// byte-identical archive (and thus a stable archive sha256). Determinism comes
// from: sorted entries, fixed mtime/uid/gid, normalized modes, empty uname/gname,
// and a gzip header with a zeroed mtime and a fixed OS byte. Third-party tar
// libraries are avoided (none is a declared dependency) so the packer has no
// undeclared-dependency risk.

const TAR_BLOCK_SIZE = 512;
const TAR_FIXED_FILE_MODE = 0o644;

function writeOctalField(header, value, offset, length) {
  // ustar numeric fields are zero-padded octal with a trailing NUL.
  const octal = value.toString(8).padStart(length - 1, '0');
  header.write(`${octal}\0`, offset, length, 'ascii');
}

function buildUstarHeader(relativePath, sizeBytes) {
  let name = relativePath;
  let prefix = '';
  if (Buffer.byteLength(name, 'utf8') > 100) {
    // ustar splits long paths across prefix (<=155) + name (<=100) on a '/'.
    const slash = relativePath.lastIndexOf('/', relativePath.length - 1);
    if (slash > 0) {
      prefix = relativePath.slice(0, slash);
      name = relativePath.slice(slash + 1);
    }
    if (Buffer.byteLength(name, 'utf8') > 100 || Buffer.byteLength(prefix, 'utf8') > 155) {
      throw new Error(`Path too long for ustar tar header: ${relativePath}`);
    }
  }
  const header = Buffer.alloc(TAR_BLOCK_SIZE, 0);
  header.write(name, 0, 100, 'utf8');
  writeOctalField(header, TAR_FIXED_FILE_MODE, 100, 8);
  writeOctalField(header, 0, 108, 8); // uid
  writeOctalField(header, 0, 116, 8); // gid
  writeOctalField(header, sizeBytes, 124, 12);
  writeOctalField(header, 0, 136, 12); // mtime (fixed epoch)
  header.write('        ', 148, 8, 'ascii'); // checksum placeholder (spaces)
  header.write('0', 156, 1, 'ascii'); // typeflag: regular file
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  // uname/gname intentionally empty for determinism.
  if (prefix) {
    header.write(prefix, 345, 155, 'utf8');
  }
  // Header checksum: unsigned sum of all bytes with the checksum field as spaces.
  let checksum = 0;
  for (let index = 0; index < TAR_BLOCK_SIZE; index += 1) {
    checksum += header[index];
  }
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return header;
}

function padToBlock(buffer) {
  const remainder = buffer.length % TAR_BLOCK_SIZE;
  if (remainder === 0) {
    return buffer;
  }
  return Buffer.concat([buffer, Buffer.alloc(TAR_BLOCK_SIZE - remainder, 0)]);
}

// Build the uncompressed tar image for a sorted list of files.
function buildToolsetTar(cwd, relativePaths, deps = {}) {
  const readFileBuffer = deps.readFileBuffer ?? ((p) => fs.readFileSync(p));
  const chunks = [];
  for (const relativePath of relativePaths) {
    const content = readFileBuffer(path.join(cwd, ...relativePath.split('/')));
    chunks.push(buildUstarHeader(relativePath, content.length));
    chunks.push(padToBlock(content));
  }
  // Two zero blocks terminate the archive.
  chunks.push(Buffer.alloc(TAR_BLOCK_SIZE * 2, 0));
  return Buffer.concat(chunks);
}

// Gzip the tar image with a normalized header (zeroed mtime + fixed OS byte) so
// the compressed output is reproducible across hosts for identical input.
function gzipDeterministic(buffer, deps = {}) {
  const gzipSync = deps.gzipSync ?? zlib.gzipSync;
  const gz = Buffer.from(gzipSync(buffer, { level: 9 }));
  if (gz.length >= 10) {
    gz.writeUInt32LE(0, 4); // MTIME = 0
    gz[9] = 0xff; // OS = unknown (platform-independent)
  }
  return gz;
}

// Produce the reproducible gzipped tarball buffer for a resolved toolset.
function packToolsetTarball(cwd, relativePaths, deps = {}) {
  return gzipDeterministic(buildToolsetTar(cwd, relativePaths, deps), deps);
}

// Assemble the full provenance manifest for a resolved toolset.
function buildDevToolsReleaseManifest(inputs = {}, meta = {}) {
  const fileDigests = inputs.fileDigests ?? [];
  return {
    ...schemaEnvelopeFields(SCHEMA_ID, SCHEMA_VERSION),
    version: meta.version,
    channel: meta.channel ?? 'prerelease',
    generatedAt: meta.generatedAt,
    buildVersion: meta.buildVersion,
    gitCommit: meta.gitCommit,
    contentDigest: computeContentDigest(fileDigests),
    requirementsManifestDigest: inputs.requirementsManifestDigest ?? null,
    traceabilityAudit: inputs.traceabilityAudit ?? null,
    fileCount: fileDigests.length,
    files: fileDigests
  };
}

function collectDevToolsRelease(cwd, options = {}, deps = {}) {
  const manifestPath = options.manifestPath ?? DEFAULT_TOOLSET_MANIFEST;
  const toolset = loadToolsetManifest(cwd, manifestPath, deps);
  const files = resolveToolsetFiles(cwd, toolset, deps);
  const fileDigests = computeFileDigests(cwd, files, deps);
  const requirementsManifestDigest = readRequirementsManifestDigest(cwd, deps);
  return buildDevToolsReleaseManifest(
    {
      fileDigests,
      requirementsManifestDigest,
      traceabilityAudit: deps.traceabilityAudit ?? null
    },
    {
      channel: normalizeChannel(options.channel),
      version: toolset.version,
      generatedAt:
        typeof deps.now === 'function'
          ? new Date(deps.now()).toISOString()
          : new Date().toISOString(),
      buildVersion: (deps.getPackageVersion ?? ((c) => getPackageVersion(c, deps)))(cwd),
      gitCommit: (deps.getGitCommit ?? ((c) => getGitCommit(c, deps)))(cwd)
    }
  );
}

function parseArgs(argv = []) {
  const { options } = parseSharedOutputArgs(argv, {
    defaults: { channel: undefined, manifestPath: undefined, outputPath: undefined, packPath: undefined, json: false, schema: false },
    // --markdown/--strict/--include-provenance are not supported here.
    excludeCommonFlags: ['--markdown', '--strict', '--include-provenance'],
    enforceSingleOutputMode: false,
    valueFlags: {
      '--channel': 'channel',
      '--manifest': 'manifestPath',
      '--pack': 'packPath'
    }
  });
  return options;
}

// Published JSON Schema for the devtools-release provenance manifest, so
// consumers can validate it and the `--schema` mode can publish the contract
// without building. Shares the self-describing envelope via schemaEnvelope.js.
const DEVTOOLS_RELEASE_JSON_SCHEMA = {
  $schema: JSON_SCHEMA_DIALECT,
  $id: SCHEMA_ID,
  title: 'vi-history-suite devtools release provenance manifest',
  type: 'object',
  additionalProperties: true,
  required: [
    '$schema',
    'schemaVersion',
    'version',
    'channel',
    'contentDigest',
    'fileCount',
    'files'
  ],
  properties: {
    ...schemaEnvelopePropertyNodes(SCHEMA_ID, SCHEMA_VERSION),
    version: { type: 'string' },
    channel: { enum: CHANNELS },
    generatedAt: { type: 'string' },
    buildVersion: { type: 'string' },
    gitCommit: { type: 'string' },
    contentDigest: { type: 'string' },
    requirementsManifestDigest: { type: ['string', 'null'] },
    traceabilityAudit: { type: ['object', 'null'] },
    fileCount: { type: 'integer' },
    files: { type: 'array', items: { type: 'object' } }
  }
};

function renderSchema(options = {}) {
  return renderSchemaDocument(DEVTOOLS_RELEASE_JSON_SCHEMA, options);
}

function resolveOutputPath(cwd, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.trim().length === 0) {
    throw new Error('--output requires a non-empty relative path');
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error('--output must be a relative path inside the working directory');
  }
  const resolved = path.resolve(cwd, relativePath);
  const normalizedRoot = path.resolve(cwd) + path.sep;
  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error('--output must stay inside the working directory');
  }
  return resolved;
}

function renderSummary(manifest) {
  const lines = [];
  lines.push('[devtools-release] Development-tools release provenance (DS1 content digest).');
  lines.push(`[devtools-release] Channel: ${manifest.channel}`);
  lines.push(`[devtools-release] Build: ${manifest.buildVersion} (${manifest.gitCommit})`);
  lines.push(`[devtools-release] Files: ${manifest.fileCount}`);
  lines.push(`[devtools-release] Content digest: ${manifest.contentDigest}`);
  lines.push(`[devtools-release] Requirements digest: ${manifest.requirementsManifestDigest ?? 'n/a'}`);
  return lines.join('\n');
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

  // --schema publishes the JSON Schema without building the release.
  if (deps.schema ?? options.schema) {
    stdout.write(`${renderSchema()}\n`);
    return 0;
  }

  let manifest;
  try {
    manifest = collectDevToolsRelease(cwd, options, deps);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  // Optional: write a deterministic gzipped tarball of the resolved toolset.
  if (options.packPath) {
    try {
      const resolved = resolveOutputPath(cwd, options.packPath);
      const files = manifest.files.map((entry) => entry.path);
      const tarball = packToolsetTarball(cwd, files, deps);
      const mkdirSync = deps.mkdirSync ?? fs.mkdirSync;
      const writeFile = deps.writeFile ?? fs.writeFileSync;
      mkdirSync(path.dirname(resolved), { recursive: true });
      writeFile(resolved, tarball);
      manifest.archive = { path: options.packPath, sha256: sha256Hex(tarball), bytes: tarball.length };
      stdout.write(`[devtools-release] Packed ${options.packPath} (${tarball.length} bytes)\n`);
    } catch (error) {
      stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

  const rendered = options.json ? JSON.stringify(manifest, null, 2) : renderSummary(manifest);
  if (options.outputPath) {
    const resolved = resolveOutputPath(cwd, options.outputPath);
    const mkdirSync = deps.mkdirSync ?? fs.mkdirSync;
    const writeFile = deps.writeFile ?? fs.writeFileSync;
    mkdirSync(path.dirname(resolved), { recursive: true });
    writeFile(resolved, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    stdout.write(`[devtools-release] Wrote ${options.outputPath}\n`);
    return 0;
  }
  stdout.write(`${rendered}\n`);
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  SCHEMA_ID,
  SCHEMA_VERSION,
  DEFAULT_TOOLSET_MANIFEST,
  REQUIREMENTS_MANIFEST_RELATIVE_PATH,
  CHANNELS,
  sha256Hex,
  loadToolsetManifest,
  resolveToolsetFiles,
  computeFileDigests,
  computeContentDigest,
  readRequirementsManifestDigest,
  normalizeChannel,
  buildUstarHeader,
  buildToolsetTar,
  gzipDeterministic,
  packToolsetTarball,
  buildDevToolsReleaseManifest,
  collectDevToolsRelease,
  parseArgs,
  renderSchema,
  DEVTOOLS_RELEASE_JSON_SCHEMA,
  resolveOutputPath,
  renderSummary,
  main
};
