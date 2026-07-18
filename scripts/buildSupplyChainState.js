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

const {
  SCHEMA_PROVENANCE_KEY,
  JSON_SCHEMA_DIALECT,
  renderSchemaDocument,
  schemaEnvelopeFields,
  schemaEnvelopePropertyNodes
} = require('./lib/schemaEnvelope.js');
const {
  outputModeForOptions,
  parseSharedOutputArgs,
  buildProvenance,
  resolveOutputPath,
  writeOutput
} = require('./lib/outputContract.js');

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
  // Box freshness follows the same decoupled contract as the release gate's
  // box-manifest-integrity check: the box is identified by its sha256, not the
  // release version. The golden box is regenerated only when rebuilt, while the
  // package version bumps every release, so requiring recordedForVersion to equal
  // the build version would wrongly mark an unchanged box stale on a version-only
  // release (and, once this artifact gates the release path, block that release).
  // The box is "fresh" when it is well-formed (64-hex sha256 + positive sizeBytes,
  // i.e. cryptographically bound) AND records a version binding; per-version
  // runtime freshness is enforced by the runtime-validation track, not here.
  const wellFormed =
    typeof manifest.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(manifest.sha256) &&
    Number.isInteger(manifest.sizeBytes) &&
    manifest.sizeBytes > 0;
  const boundToVersion = typeof recordedForVersion === 'string' && recordedForVersion.trim().length > 0;
  const fresh = wellFormed && boundToVersion;
  const recordedForBuild = recordedForVersion === version;
  const detail = !wellFormed
    ? 'Box manifest is malformed (sha256 must be 64-hex and sizeBytes a positive integer).'
    : !boundToVersion
      ? 'Box manifest is missing a recordedForVersion binding.'
      : recordedForBuild
        ? `Box manifest bound (sha256) and recorded for ${version}.`
        : `Box manifest bound (sha256) and recorded for ${recordedForVersion} (unchanged box; version binding is informational).`;
  return {
    ...makeArtifact({
      id: 'box',
      kind: 'box-manifest',
      available: true,
      gates: true,
      digest: typeof manifest.sha256 === 'string' ? manifest.sha256 : null,
      fresh,
      detail,
      drift: fresh ? null : !wellFormed ? 'malformed' : 'recorded-for-version',
      source: BOX_MANIFEST_PATH
    })
  };
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
    ...schemaEnvelopeFields(SCHEMA_ID, SCHEMA_VERSION),
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

// Optional provenance footer lines shared by the text and Markdown renderers, so
// --include-provenance is honored in every output mode (not only JSON/schema).
function provenanceTextLines(provenance) {
  if (!provenance) return [];
  return [
    `[supply-chain-state] provenance generatedAt: ${provenance.generatedAt}`,
    `[supply-chain-state] provenance cwd: ${provenance.cwd}`,
    `[supply-chain-state] provenance outputMode: ${provenance.outputMode}`,
    `[supply-chain-state] provenance strict: ${provenance.strict}`,
    `[supply-chain-state] provenance argv: ${JSON.stringify(provenance.argv)}`
  ];
}

function provenanceMarkdownLines(provenance) {
  if (!provenance) return [];
  return [
    '## Provenance',
    '',
    `- Generated: ${markdownCodeSpan(provenance.generatedAt)}`,
    `- Cwd: ${markdownCodeSpan(provenance.cwd)}`,
    `- Output: ${markdownCodeSpan(provenance.outputMode)}`,
    `- Strict: ${markdownCodeSpan(provenance.strict)}`,
    `- Argv: ${markdownCodeSpan(JSON.stringify(provenance.argv))}`,
    ''
  ];
}

function renderSummary(state, provenance) {
  const lines = [];
  lines.push('[supply-chain-state] Supply-chain provenance state (read-only).');
  lines.push(`[supply-chain-state] Build: ${state.buildVersion} (${state.gitCommit})`);
  for (const artifact of state.artifacts) {
    const freshLabel = artifact.fresh === null ? 'n/a' : artifact.fresh ? 'fresh' : 'STALE';
    const availLabel = artifact.available ? freshLabel : 'ABSENT';
    lines.push(`[supply-chain-state] ${artifact.gates ? 'gate ' : '     '}${artifact.id}: ${availLabel} - ${artifact.detail}`);
  }
  lines.push(`[supply-chain-state] Status: ${state.status} (${state.attentionCount} attention of ${state.artifactCount}).`);
  lines.push(...provenanceTextLines(provenance));
  return lines.join('\n');
}

// CodeQL-safe Markdown table cell: escape backslashes BEFORE pipes.
function markdownCell(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>');
}

// Inline-code span: inside a code span backslashes are LITERAL (unlike table
// cells), so paths like C:\repo must NOT be backslash-doubled. Fence with a
// backtick run one longer than any run inside the value so embedded backticks
// stay literal, per the requirements-health/branch-protection renderers.
function markdownCodeSpan(value) {
  const content = String(value ?? '').replace(/\r?\n/gu, ' ');
  const longestBacktickRun = Math.max(0, ...Array.from(content.matchAll(/`+/gu), (match) => match[0].length));
  const fence = '`'.repeat(longestBacktickRun + 1);
  const paddedContent = content.startsWith('`') || content.endsWith('`') ? ` ${content} ` : content;
  return `${fence}${paddedContent}${fence}`;
}

function renderMarkdown(state, provenance) {
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
  lines.push(...provenanceMarkdownLines(provenance));
  return lines.join('\n');
}

// Published JSON Schema for the supply-chain-state packet, so machine consumers
// can validate the emitted `--json` output and the `--schema` mode can publish
// the contract without running the aggregation. Shares the self-describing
// envelope contract (top-level $schema + schemaVersion) used by the other
// read-models via scripts/lib/schemaEnvelope.js.
const SUPPLY_CHAIN_STATE_JSON_SCHEMA = {
  $schema: JSON_SCHEMA_DIALECT,
  $id: SCHEMA_ID,
  title: 'vi-history-suite supply-chain state',
  type: 'object',
  additionalProperties: false,
  required: [
    '$schema',
    'schemaVersion',
    'generatedAt',
    'buildVersion',
    'gitCommit',
    'status',
    'artifactCount',
    'attentionCount',
    'artifacts'
  ],
  properties: {
    ...schemaEnvelopePropertyNodes(SCHEMA_ID, SCHEMA_VERSION),
    generatedAt: { type: 'string' },
    buildVersion: { type: 'string' },
    gitCommit: { type: 'string' },
    status: { enum: ['fresh', 'attention'] },
    artifactCount: { type: 'integer' },
    attentionCount: { type: 'integer' },
    artifacts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'kind', 'available', 'gates', 'digest', 'fresh', 'detail', 'drift', 'source'],
        properties: {
          id: { type: 'string' },
          kind: { type: 'string' },
          available: { type: 'boolean' },
          gates: { type: 'boolean' },
          digest: { type: ['string', 'null'] },
          fresh: { type: ['boolean', 'null'] },
          detail: { type: 'string' },
          drift: { type: ['string', 'null'] },
          source: { type: ['string', 'null'] },
          tracks: { type: 'array' }
        }
      }
    },
    provenance: {
      type: 'object',
      required: ['generatedAt', 'cwd', 'outputMode', 'strict', 'argv'],
      properties: {
        generatedAt: { type: 'string' },
        cwd: { type: 'string' },
        outputMode: { enum: ['text', 'json', 'markdown', 'schema'] },
        strict: { type: 'boolean' },
        argv: { type: 'array', items: { type: 'string' } }
      }
    }
  }
};

function renderSchema(options = {}) {
  return renderSchemaDocument(SUPPLY_CHAIN_STATE_JSON_SCHEMA, options);
}

// --- CLI ---

function parseArgs(argv = []) {
  const { options } = parseSharedOutputArgs(argv, {
    defaults: {
      json: false,
      markdown: false,
      schema: false,
      strict: false,
      includeProvenance: false,
      outputPath: undefined
    }
  });
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
  const outputMode = outputModeForOptions(options);
  const provenance = options.includeProvenance
    ? buildProvenance({ cwd, outputMode, strict: options.strict, argv }, deps)
    : undefined;

  // --schema publishes the JSON Schema without running the aggregation.
  if (options.schema) {
    const rendered = renderSchema({ provenance });
    writeOutput(rendered, { outputPath: options.outputPath, cwd, stdout, deps, label: 'supply-chain-state' });
    return 0;
  }

  const state = collectSupplyChainState(cwd, options, deps);
  const stateWithProvenance = provenance ? { ...state, provenance } : state;
  const rendered = options.json
    ? JSON.stringify(stateWithProvenance, null, 2)
    : options.markdown
      ? renderMarkdown(state, provenance)
      : renderSummary(state, provenance);
  writeOutput(rendered, { outputPath: options.outputPath, cwd, stdout, deps, label: 'supply-chain-state' });
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
  SUPPLY_CHAIN_STATE_JSON_SCHEMA,
  renderSchema,
  outputModeForOptions,
  renderSummary,
  renderMarkdown,
  markdownCell,
  parseArgs,
  resolveOutputPath,
  main
};
