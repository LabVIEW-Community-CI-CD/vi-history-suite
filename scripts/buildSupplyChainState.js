#!/usr/bin/env node

/*
 * Supply-chain state read-model (epic capstone).
 *
 * vi-history-suite binds several shipped artifacts to cryptographic digests
 * recorded in committed ledgers/manifests, and gates releases on them. Those
 * provenance streams live in four different files. This read-only aggregator
 * reports all of them in one schema-versioned packet so a maintainer or agent
 * can answer, at a glance: is everything that ships cryptographically bound and
 * fresh for the current build?
 *
 *   - box          vagrant/box-manifest.json (sha256 + recordedForVersion; gates
 *                  the marketplace release via VHS-REQ-666)
 *   - runtime      docs/requirements/runtime-validation-ledger.json (per-track
 *                  validated-version freshness; release-gating tracks)
 *   - requirements out/requirements/requirements-manifest.json (integrityDigest)
 *   - devtools     the current dev-tools toolset contentDigest (VHS-REQ-667)
 *
 * It is a READ-MODEL: it never mutates any source, and `--strict` is an opt-in
 * local signal only (it is not wired into any CI gate). Pure/injectable with a
 * thin CLI. Sources graceful-degrade to unavailable when absent.
 *
 * Usage:
 *   node scripts/buildSupplyChainState.js [--json | --markdown] [--strict] \
 *     [--output <relative-path>]
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const SCHEMA_ID = 'vi-history-suite/supply-chain-state@v1';
const SCHEMA_VERSION = 1;
const UNKNOWN_COMMIT = '<unknown>';

const BOX_MANIFEST_PATH = 'vagrant/box-manifest.json';
const REQUIREMENTS_MANIFEST_PATH = 'out/requirements/requirements-manifest.json';

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

function readJson(cwd, relativePath, deps = {}) {
  const readFile = deps.readFile ?? ((p) => fs.readFileSync(p, 'utf8'));
  try {
    return JSON.parse(readFile(path.join(cwd, ...relativePath.split('/'))));
  } catch {
    return undefined;
  }
}

// Canonical per-artifact record. `gates` marks whether the artifact currently
// gates a release; `fresh` is tri-state (true/false/null) where null means
// freshness is not a meaningful concept for that artifact offline.
function makeArtifact(fields = {}) {
  return {
    id: fields.id,
    kind: fields.kind,
    available: fields.available === true,
    gates: fields.gates === true,
    digest: fields.digest ?? null,
    fresh: fields.fresh ?? null,
    detail: fields.detail ?? '',
    drift: fields.drift ?? null,
    source: fields.source ?? null,
    tracks: fields.tracks ?? undefined
  };
}

// box: fresh when the committed box manifest is recorded for the build version.
function buildBoxArtifact(cwd, version, deps = {}) {
  const manifest = readJson(cwd, BOX_MANIFEST_PATH, deps);
  if (!manifest || typeof manifest !== 'object') {
    return makeArtifact({
      id: 'box',
      kind: 'box-manifest',
      available: false,
      gates: true,
      detail: 'Vagrant box manifest is absent or unparseable.',
      drift: 'unavailable',
      source: BOX_MANIFEST_PATH
    });
  }
  const recordedForVersion = manifest.recordedForVersion ?? null;
  const fresh = recordedForVersion === version;
  return makeArtifact({
    id: 'box',
    kind: 'box-manifest',
    available: true,
    gates: true,
    digest: typeof manifest.sha256 === 'string' ? manifest.sha256 : null,
    fresh,
    detail: fresh
      ? `Box manifest recorded for ${version}.`
      : `Box manifest recorded for ${recordedForVersion ?? 'n/a'}, not ${version}.`,
    drift: fresh ? null : 'recorded-for-version',
    source: BOX_MANIFEST_PATH
  });
}

// runtime: per-track validated-version freshness. The artifact is fresh only
// when every release-gating track is validated at the build version.
function buildRuntimeArtifact(cwd, version, deps = {}) {
  const loader = deps.loadRuntimeValidationSignal ?? require('./buildRiskLedger.js').loadRuntimeValidationSignal;
  let signal;
  try {
    signal = loader(cwd, {});
  } catch {
    signal = undefined;
  }
  const manifest = signal && signal.available ? signal.manifest : undefined;
  const rawTracks = manifest && Array.isArray(manifest.tracks) ? manifest.tracks : [];
  if (!manifest || rawTracks.length === 0) {
    return makeArtifact({
      id: 'runtime',
      kind: 'runtime-validation',
      available: false,
      gates: true,
      detail: 'Runtime-validation ledger is absent or has no tracks.',
      drift: 'unavailable',
      source: 'docs/requirements/runtime-validation-ledger.json'
    });
  }
  const tracks = rawTracks
    .filter((track) => track && typeof track === 'object' && typeof track.trackId === 'string')
    .map((track) => ({
      trackId: track.trackId,
      releaseGating: track.releaseGating === true,
      lastValidatedVersion: track.lastValidatedVersion ?? null,
      fresh: track.lastValidatedVersion === version
    }));
  const gatingStale = tracks.filter((track) => track.releaseGating && !track.fresh);
  const gatingCount = tracks.filter((track) => track.releaseGating).length;
  const fresh = gatingCount > 0 && gatingStale.length === 0;
  return makeArtifact({
    id: 'runtime',
    kind: 'runtime-validation',
    available: true,
    gates: true,
    fresh,
    detail:
      gatingCount === 0
        ? 'No release-gating runtime track recorded.'
        : fresh
          ? `All ${gatingCount} release-gating track(s) validated at ${version}.`
          : `Release-gating track(s) stale: ${gatingStale.map((t) => t.trackId).join(', ')}.`,
    drift: fresh ? null : gatingCount === 0 ? 'no-gating-track' : 'stale-gating-track',
    source: 'docs/requirements/runtime-validation-ledger.json',
    tracks
  });
}

// requirements: the compiled manifest's integrity digest. Freshness is whether
// the manifest was built for the current extension version.
function buildRequirementsArtifact(cwd, version, deps = {}) {
  const manifest = readJson(cwd, REQUIREMENTS_MANIFEST_PATH, deps);
  if (!manifest || typeof manifest !== 'object' || typeof manifest.integrityDigest !== 'string') {
    return makeArtifact({
      id: 'requirements',
      kind: 'requirements-manifest',
      available: false,
      gates: false,
      detail: 'Requirements manifest is absent (run npm run requirements:manifest / compile).',
      drift: 'unavailable',
      source: REQUIREMENTS_MANIFEST_PATH
    });
  }
  const manifestVersion = manifest.extensionVersion ?? null;
  const fresh = manifestVersion === version;
  return makeArtifact({
    id: 'requirements',
    kind: 'requirements-manifest',
    available: true,
    gates: false,
    digest: manifest.integrityDigest,
    fresh,
    detail: fresh
      ? `Requirements manifest built for ${version} (${manifest.counts?.requirements ?? '?'} requirements).`
      : `Requirements manifest built for ${manifestVersion ?? 'n/a'}, not ${version}.`,
    drift: fresh ? null : 'extension-version',
    source: REQUIREMENTS_MANIFEST_PATH
  });
}

// devtools: the current toolset content digest. Freshness vs a published release
// is not knowable offline, so `fresh` is null; the digest is reported so a
// consumer can compare it against a release manifest out-of-band.
function buildDevtoolsArtifact(cwd, deps = {}) {
  const collect = deps.collectDevToolsRelease ?? require('./buildDevToolsRelease.js').collectDevToolsRelease;
  try {
    const manifest = collect(cwd, {}, deps);
    return makeArtifact({
      id: 'devtools',
      kind: 'devtools-toolset',
      available: true,
      gates: false,
      digest: manifest.contentDigest,
      fresh: null,
      detail: `Current toolset content digest over ${manifest.fileCount} files.`,
      source: 'docs/devtools-release.manifest.json'
    });
  } catch {
    return makeArtifact({
      id: 'devtools',
      kind: 'devtools-toolset',
      available: false,
      gates: false,
      detail: 'Dev-tools toolset digest could not be computed (compile first).',
      drift: 'unavailable',
      source: 'docs/devtools-release.manifest.json'
    });
  }
}

// Assemble the packet + rollup. Rollup is `attention` when any gating artifact
// is unavailable or not fresh; otherwise `fresh`.
function buildSupplyChainState(inputs = {}, meta = {}) {
  const artifacts = inputs.artifacts ?? [];
  const attention = artifacts.filter((a) => a.gates && (!a.available || a.fresh === false));
  return {
    schema: SCHEMA_ID,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: meta.generatedAt,
    buildVersion: meta.buildVersion,
    gitCommit: meta.gitCommit,
    status: attention.length === 0 ? 'fresh' : 'attention',
    artifactCount: artifacts.length,
    attentionCount: attention.length,
    artifacts
  };
}

function collectSupplyChainState(cwd, options = {}, deps = {}) {
  const version = (deps.getPackageVersion ?? ((c) => getPackageVersion(c, deps)))(cwd);
  const artifacts = [
    buildBoxArtifact(cwd, version, deps),
    buildRuntimeArtifact(cwd, version, deps),
    buildRequirementsArtifact(cwd, version, deps),
    buildDevtoolsArtifact(cwd, deps)
  ];
  return buildSupplyChainState(
    { artifacts },
    {
      generatedAt:
        typeof deps.now === 'function' ? new Date(deps.now()).toISOString() : new Date().toISOString(),
      buildVersion: version,
      gitCommit: (deps.getGitCommit ?? ((c) => getGitCommit(c, deps)))(cwd)
    }
  );
}

// --- rendering ---

function renderSummary(state) {
  const lines = [];
  lines.push('[supply-chain-state] Supply-chain provenance state (read-only).');
  lines.push(`[supply-chain-state] Build: ${state.buildVersion} (${state.gitCommit})`);
  for (const artifact of state.artifacts) {
    const freshLabel = artifact.fresh === null ? 'n/a' : artifact.fresh ? 'fresh' : 'STALE';
    const availLabel = artifact.available ? freshLabel : 'ABSENT';
    lines.push(`[supply-chain-state] ${artifact.gates ? 'gate ' : '     '}${artifact.id}: ${availLabel} - ${artifact.detail}`);
  }
  lines.push(`[supply-chain-state] Status: ${state.status} (${state.attentionCount} attention of ${state.artifactCount}).`);
  return lines.join('\n');
}

// CodeQL-safe Markdown table cell: escape backslashes BEFORE pipes.
function markdownCell(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>');
}

function renderMarkdown(state) {
  const lines = [];
  lines.push('# Supply-Chain State');
  lines.push('');
  lines.push(`- Build: \`${state.buildVersion}\` (\`${state.gitCommit}\`)`);
  lines.push(`- Status: **${state.status}** (${state.attentionCount} attention of ${state.artifactCount})`);
  lines.push('');
  lines.push('| Artifact | Gates | Available | Fresh | Digest | Detail |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const artifact of state.artifacts) {
    const fresh = artifact.fresh === null ? 'n/a' : artifact.fresh ? 'yes' : 'no';
    const digest = artifact.digest ? artifact.digest.slice(0, 12) : 'n/a';
    lines.push(
      `| ${markdownCell(artifact.id)} | ${artifact.gates ? 'yes' : 'no'} | ${artifact.available ? 'yes' : 'no'} | ${fresh} | \`${markdownCell(digest)}\` | ${markdownCell(artifact.detail)} |`
    );
  }
  lines.push('');
  lines.push('_Read-only provenance summary; it mutates no source and gates nothing._');
  lines.push('');
  return lines.join('\n');
}

// --- CLI ---

function parseArgs(argv = []) {
  const options = { json: false, markdown: false, strict: false, outputPath: undefined };
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
    if (arg === '--json') options.json = true;
    else if (arg === '--markdown') options.markdown = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--output') options.outputPath = next();
    else if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.json && options.markdown) {
    throw new Error('Use only one output mode: --json or --markdown');
  }
  return options;
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
  const state = collectSupplyChainState(cwd, options, deps);
  const rendered = options.json
    ? JSON.stringify(state, null, 2)
    : options.markdown
      ? renderMarkdown(state)
      : renderSummary(state);
  if (options.outputPath) {
    const resolved = resolveOutputPath(cwd, options.outputPath);
    const mkdirSync = deps.mkdirSync ?? fs.mkdirSync;
    const writeFile = deps.writeFile ?? fs.writeFileSync;
    mkdirSync(path.dirname(resolved), { recursive: true });
    writeFile(resolved, `${rendered}\n`, 'utf8');
    stdout.write(`[supply-chain-state] Wrote ${options.outputPath}\n`);
  } else {
    stdout.write(`${rendered}\n`);
  }
  if (options.strict && state.status !== 'fresh') {
    return 1;
  }
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  SCHEMA_ID,
  SCHEMA_VERSION,
  getGitCommit,
  getPackageVersion,
  readJson,
  makeArtifact,
  buildBoxArtifact,
  buildRuntimeArtifact,
  buildRequirementsArtifact,
  buildDevtoolsArtifact,
  buildSupplyChainState,
  collectSupplyChainState,
  renderSummary,
  renderMarkdown,
  markdownCell,
  parseArgs,
  resolveOutputPath,
  main
};
