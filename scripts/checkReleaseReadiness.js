#!/usr/bin/env node

/**
 * Release-readiness verdict (advisory; VHS-REQ-615).
 *
 * Composes the repository's existing release-relevant signals into ONE
 * PASS/ATTENTION verdict bound to version+commit, so a human can read a single
 * "is this candidate safe to release?" signal before deciding. This command
 * grants NO release power: it only measures. The actual marketplace release
 * remains a separate, maintainer-only manual lever.
 *
 * Checks (all composed from existing modules — nothing new is measured here):
 *   - risk-ledger: no selectable CRITICAL/HIGH risk (buildRiskLedger +
 *     hasSelectableHighRisk).
 *   - requirements-manifest digest: a freshly built manifest digest matches the
 *     shipped out/requirements/requirements-manifest.json digest (so the
 *     candidate's requirements are exactly what will ship). ATTENTION (not FAIL)
 *     when the shipped manifest is absent — run `npm run compile` first.
 *   - version/changelog coherence: package.json version agrees with the top
 *     CHANGELOG.md release heading, or CHANGELOG has an [Unreleased] section
 *     (normal pre-release state).
 *   - runtime attestation (DISPLAY-ONLY, never gating): reports whether a
 *     human-supplied real-hardware validation record for this version is present.
 *
 * Advisory by default (exit 0). `--strict` exits nonzero when the verdict is not
 * READY. Pure helpers stay separate from a thin CLI so the composition is
 * unit-testable with injected fixtures; only Node built-ins plus sibling report
 * modules are used, so no dependency install is required.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const SCHEMA_VERSION = 1;
const RELEASE_READINESS_SCHEMA_ID =
  'https://raw.githubusercontent.com/LabVIEW-Community-CI-CD/vi-history-suite/main/docs/requirements/release-readiness.schema.json';
const RELEASE_READINESS_SCHEMA_PROVENANCE_KEY = 'x-vi-history-suite-provenance';
const UNKNOWN_COMMIT = '<unknown>';
const SHIPPED_MANIFEST_RELATIVE_PATH = 'out/requirements/requirements-manifest.json';

function getGitCommit(cwd) {
  try {
    return execSync('git rev-parse HEAD', {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    return UNKNOWN_COMMIT;
  }
}

function getPackageVersion(cwd) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
}

// Parse the first `## [X.Y.Z]` or `## [Unreleased]` heading from CHANGELOG.md.
// Returns { released: 'X.Y.Z' | undefined, unreleased: boolean }.
function parseChangelogTop(changelogText) {
  if (typeof changelogText !== 'string') {
    return { released: undefined, unreleased: false };
  }
  for (const line of changelogText.split(/\r?\n/)) {
    const match = /^##\s*\[([^\]]+)\]/.exec(line.trim());
    if (!match) {
      continue;
    }
    const label = match[1].trim();
    if (/^unreleased$/i.test(label)) {
      return { released: undefined, unreleased: true };
    }
    if (/^\d+\.\d+\.\d+$/.test(label)) {
      return { released: label, unreleased: false };
    }
  }
  return { released: undefined, unreleased: false };
}

function makeCheck(name, passed, details) {
  return { name, passed, details };
}

// --- individual checks (pure; take already-loaded inputs) ---

function checkRiskLedger(ledger, hasSelectableHighRisk) {
  if (!ledger) {
    return makeCheck('risk-ledger', false, 'Risk ledger unavailable; run npm run risk:ledger to inspect.');
  }
  const high = hasSelectableHighRisk(ledger);
  const highCount = ledger.entries.filter(
    (entry) => entry.selectable && (entry.severityTier === 'CRITICAL' || entry.severityTier === 'HIGH')
  ).length;
  return makeCheck(
    'risk-ledger',
    !high,
    high
      ? `${highCount} selectable CRITICAL/HIGH risk(s); next target ${ledger.ranking.nextTarget}.`
      : `No selectable CRITICAL/HIGH risk (next target ${ledger.ranking.nextTarget ?? 'none'}).`
  );
}

function checkManifestDigest(builtDigest, shippedManifest) {
  if (!shippedManifest) {
    return makeCheck(
      'requirements-manifest',
      false,
      `Shipped ${SHIPPED_MANIFEST_RELATIVE_PATH} not found; run npm run compile to generate it.`
    );
  }
  const shippedDigest = shippedManifest.integrityDigest;
  const match = shippedDigest === builtDigest;
  return makeCheck(
    'requirements-manifest',
    match,
    match
      ? `Shipped manifest digest matches freshly built requirements (${builtDigest.slice(0, 12)}).`
      : `Shipped manifest digest ${String(shippedDigest).slice(0, 12)} != freshly built ${builtDigest.slice(0, 12)}; recompile.`
  );
}

function checkVersionChangelog(version, changelogTop) {
  if (changelogTop.unreleased) {
    return makeCheck(
      'version-changelog',
      true,
      `package.json ${version}; CHANGELOG has an [Unreleased] section (pre-release state).`
    );
  }
  if (!changelogTop.released) {
    return makeCheck('version-changelog', false, 'CHANGELOG.md has no [Unreleased] or [X.Y.Z] heading.');
  }
  const match = changelogTop.released === version;
  return makeCheck(
    'version-changelog',
    match,
    match
      ? `package.json ${version} matches top CHANGELOG entry [${changelogTop.released}].`
      : `package.json ${version} != top CHANGELOG entry [${changelogTop.released}].`
  );
}

// DISPLAY-ONLY: never affects the verdict. Reports whether a real-hardware
// validation record for this version exists. Absence is expected in CI (evidence
// is local/gitignored), so this is informational, not a gate. When the evidence
// is derived from the committed runtime-validation ledger it can also name the
// Linux-executable tracks that are stale (not validated at this build version).
function describeRuntimeAttestation(version, runtimeEvidence) {
  const stale = Array.isArray(runtimeEvidence && runtimeEvidence.staleTracks)
    ? runtimeEvidence.staleTracks
    : [];
  if (!runtimeEvidence || runtimeEvidence.present !== true) {
    if (stale.length > 0) {
      return `No runtime track is validated at ${version}; stale tracks needing re-validation: ${stale.join(', ')} (informational; not gating).`;
    }
    return `No human-attested real-hardware record supplied for ${version} (informational; not gating).`;
  }
  const tracks = Array.isArray(runtimeEvidence.tracks) ? runtimeEvidence.tracks.join(', ') : 'unspecified tracks';
  const staleSuffix =
    stale.length > 0 ? ` Stale tracks needing re-validation at ${version}: ${stale.join(', ')}.` : '';
  return `Human-attested real-hardware record present for ${version}: ${tracks}.${staleSuffix}`;
}

// Derive a display-only runtime-attestation record from the committed
// runtime-validation ledger (docs/requirements/runtime-validation-ledger.json).
// Linux-executable tracks validated at `version` are "fresh"; the rest are
// "stale" (need re-validation for this build). Returns undefined when the
// manifest is missing/malformed so the caller falls back to "no record".
function deriveRuntimeAttestationFromLedger(manifest, version) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.tracks)) {
    return undefined;
  }
  const fresh = [];
  const stale = [];
  for (const track of manifest.tracks) {
    if (!track || typeof track !== 'object' || track.linuxExecutable === false) {
      continue;
    }
    const trackId = typeof track.trackId === 'string' ? track.trackId : undefined;
    if (!trackId) {
      continue;
    }
    if (track.lastValidatedVersion === version) {
      fresh.push(trackId);
    } else {
      stale.push(trackId);
    }
  }
  return {
    present: fresh.length > 0,
    tracks: fresh,
    staleTracks: stale,
    source: 'runtime-validation-ledger'
  };
}

// GATING (opt-in): unlike the display-only runtime line, this is a hard check for
// the marketplace-release path. A release-gating track (releaseGating === true) in
// the committed runtime-validation ledger must be validated at the release version.
// This is how the mandatory local Vagrant release validation (VHS-REQ-666) blocks a
// publish: the maintainer records the attestation into the ledger, and the release
// workflow runs this check in --strict mode. Hosted CI reads the committed ledger,
// so no hypervisor is needed in CI and the workflow YAML never names the helper.
function checkReleaseAttestation(runtimeManifest, version) {
  const tracks =
    runtimeManifest && typeof runtimeManifest === 'object' && Array.isArray(runtimeManifest.tracks)
      ? runtimeManifest.tracks
      : [];
  const gating = tracks.filter((track) => track && typeof track === 'object' && track.releaseGating === true);
  if (gating.length === 0) {
    return makeCheck(
      'release-attestation',
      false,
      'No release-gating runtime track in the runtime-validation ledger; record a local release-validation attestation (npm run vagrant:validate:release) before publishing.'
    );
  }
  const fresh = gating
    .filter((track) => track.lastValidatedVersion === version)
    .map((track) => (typeof track.trackId === 'string' ? track.trackId : 'unnamed-track'));
  const stale = gating
    .filter((track) => track.lastValidatedVersion !== version)
    .map((track) => (typeof track.trackId === 'string' ? track.trackId : 'unnamed-track'));
  if (stale.length > 0) {
    return makeCheck(
      'release-attestation',
      false,
      `Release-gating track(s) not validated at ${version}: ${stale.join(', ')}; re-run the local release validation and record the attestation before publishing.`
    );
  }
  return makeCheck(
    'release-attestation',
    true,
    `Release-gating runtime attestation present for ${version}: ${fresh.join(', ')}.`
  );
}

function buildReleaseReadiness(inputs = {}, meta = {}) {
  const checks = [
    checkRiskLedger(inputs.ledger, inputs.hasSelectableHighRisk),
    checkManifestDigest(inputs.builtManifestDigest, inputs.shippedManifest),
    checkVersionChangelog(meta.version, inputs.changelogTop ?? { released: undefined, unreleased: false })
  ];
  // Opt-in release-attestation gate (release workflow path only). Default readiness
  // stays the advisory three-check verdict with a display-only runtime line so the
  // VHS-REQ-615.13 contract is preserved for local/CI advisory runs.
  if (inputs.requireReleaseAttestation) {
    checks.push(checkReleaseAttestation(inputs.runtimeManifest, meta.version));
  }
  const status = checks.every((check) => check.passed) ? 'READY' : 'ATTENTION';
  return {
    $schema: RELEASE_READINESS_SCHEMA_ID,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: meta.generatedAt,
    version: meta.version,
    commit: meta.commit,
    status,
    manifestDigest: inputs.builtManifestDigest ?? null,
    checks,
    runtimeAttestation: describeRuntimeAttestation(meta.version, inputs.runtimeEvidence)
  };
}

// --- signal loading (imports sibling modules in-process; graceful-degrade) ---

function loadSignals(cwd, deps = {}) {
  const ledgerModule = deps.riskLedgerModule ?? require('./buildRiskLedger.js');
  const manifestModule = deps.manifestModule ?? require('./exportRequirementsManifest.js');
  const readFile =
    deps.readFile ??
    ((relativePath) => {
      try {
        return fs.readFileSync(path.join(cwd, ...relativePath.split('/')), 'utf8');
      } catch {
        return undefined;
      }
    });

  let ledger;
  try {
    const signals = {
      coverage: ledgerModule.loadCoverageSignal(cwd, {}),
      requirements: ledgerModule.loadRequirementsSignal(cwd, {}),
      standards: { available: false, source: null }
    };
    ledger = ledgerModule.buildRiskLedger(signals, {
      generatedAt: new Date(0).toISOString(),
      extensionVersion: getPackageVersion(cwd),
      extensionCommit: 'readiness'
    });
  } catch {
    ledger = undefined;
  }

  let builtManifestDigest;
  try {
    const srsText = readFile('docs/requirements/srs.md');
    const rtmText = readFile('docs/requirements/rtm.csv');
    const manifest = manifestModule.buildRequirementsManifest({
      srsText,
      rtmText,
      extensionVersion: getPackageVersion(cwd),
      extensionCommit: 'readiness',
      generatedAt: new Date(0).toISOString()
    });
    builtManifestDigest = manifest.integrityDigest;
  } catch {
    builtManifestDigest = undefined;
  }

  let shippedManifest;
  const shippedRaw = readFile(SHIPPED_MANIFEST_RELATIVE_PATH);
  if (typeof shippedRaw === 'string') {
    try {
      shippedManifest = JSON.parse(shippedRaw);
    } catch {
      shippedManifest = undefined;
    }
  }

  const changelogTop = parseChangelogTop(readFile('CHANGELOG.md'));

  // Raw committed runtime-validation ledger manifest, used by the opt-in
  // release-attestation gate (releaseGating tracks). Kept separate from the
  // derived display-only runtimeEvidence.
  let runtimeManifest;
  try {
    const gatingSignal = ledgerModule.loadRuntimeValidationSignal(cwd, {});
    if (gatingSignal && gatingSignal.available) {
      runtimeManifest = gatingSignal.manifest;
    }
  } catch {
    runtimeManifest = undefined;
  }

  let runtimeEvidence;
  if (deps.runtimeEvidence !== undefined) {
    runtimeEvidence = deps.runtimeEvidence;
  } else if (deps.runtimeEvidencePath) {
    const raw = readFile(deps.runtimeEvidencePath);
    if (typeof raw === 'string') {
      try {
        runtimeEvidence = JSON.parse(raw);
      } catch {
        runtimeEvidence = undefined;
      }
    }
  }
  // Default source of truth: derive the display-only attestation from the
  // committed runtime-validation ledger the risk-ledger runtime-fidelity
  // dimension also reads, so release readiness names fresh/stale runtime tracks
  // for this build without a hand-supplied blob. Explicit runtimeEvidence /
  // runtimeEvidencePath still override.
  if (runtimeEvidence === undefined) {
    try {
      const runtimeSignal = ledgerModule.loadRuntimeValidationSignal(cwd, {});
      if (runtimeSignal && runtimeSignal.available) {
        runtimeEvidence = deriveRuntimeAttestationFromLedger(runtimeSignal.manifest, getPackageVersion(cwd));
      }
    } catch {
      runtimeEvidence = undefined;
    }
  }

  return {
    ledger,
    hasSelectableHighRisk: ledgerModule.hasSelectableHighRisk,
    builtManifestDigest,
    shippedManifest,
    changelogTop,
    runtimeManifest,
    requireReleaseAttestation: deps.requireReleaseAttestation === true,
    runtimeEvidence
  };
}

// --- rendering ---

function renderSummary(verdict) {
  const lines = [];
  lines.push('[release-readiness] Release-readiness verdict (advisory single-pane report).');
  lines.push(`[release-readiness] Candidate: ${verdict.version} (${verdict.commit})`);
  for (const check of verdict.checks) {
    lines.push(`[release-readiness] ${check.passed ? 'PASS' : 'ATTENTION'} ${check.name}: ${check.details}`);
  }
  lines.push(`[release-readiness] Runtime: ${verdict.runtimeAttestation}`);
  lines.push(`[release-readiness] Verdict: ${verdict.status}.`);
  lines.push('[release-readiness] Advisory; the marketplace release remains a separate maintainer-only manual action.');
  return lines.join('\n');
}

function renderMarkdown(verdict) {
  const lines = [];
  lines.push('# Release Readiness');
  lines.push('');
  lines.push(`- Candidate: \`${verdict.version}\` (\`${verdict.commit}\`)`);
  lines.push(`- Verdict: **${verdict.status}**`);
  lines.push(`- Manifest digest: \`${verdict.manifestDigest ?? 'n/a'}\``);
  lines.push('');
  lines.push('| Check | Result | Details |');
  lines.push('| --- | --- | --- |');
  for (const check of verdict.checks) {
    lines.push(`| ${check.name} | ${check.passed ? 'PASS' : 'ATTENTION'} | ${check.details.replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  lines.push(`_Runtime attestation:_ ${verdict.runtimeAttestation}`);
  lines.push('');
  lines.push('_The marketplace release remains a separate maintainer-only manual action._');
  lines.push('');
  return lines.join('\n');
}

const RELEASE_READINESS_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: RELEASE_READINESS_SCHEMA_ID,
  title: 'vi-history-suite release readiness verdict',
  type: 'object',
  additionalProperties: false,
  required: [
    '$schema',
    'schemaVersion',
    'generatedAt',
    'version',
    'commit',
    'status',
    'manifestDigest',
    'checks',
    'runtimeAttestation'
  ],
  properties: {
    $schema: { const: RELEASE_READINESS_SCHEMA_ID },
    schemaVersion: { const: SCHEMA_VERSION },
    generatedAt: { type: 'string' },
    version: { type: 'string' },
    commit: { type: 'string' },
    status: { enum: ['READY', 'ATTENTION'] },
    manifestDigest: { type: ['string', 'null'] },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'passed', 'details'],
        properties: {
          name: { type: 'string' },
          passed: { type: 'boolean' },
          details: { type: 'string' }
        }
      }
    },
    runtimeAttestation: { type: 'string' }
  }
};

function renderSchema(options = {}) {
  const schema = options.provenance
    ? { ...RELEASE_READINESS_JSON_SCHEMA, [RELEASE_READINESS_SCHEMA_PROVENANCE_KEY]: options.provenance }
    : RELEASE_READINESS_JSON_SCHEMA;
  return JSON.stringify(schema, null, 2);
}

// --- CLI ---

function parseArgs(argv = []) {
  const options = {
    json: false,
    markdown: false,
    schema: false,
    strict: false,
    includeProvenance: false,
    requireReleaseAttestation: false,
    outputPath: undefined,
    runtimeEvidencePath: undefined,
    positionals: []
  };
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
    else if (arg === '--schema') options.schema = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--include-provenance') options.includeProvenance = true;
    else if (arg === '--require-release-attestation') options.requireReleaseAttestation = true;
    else if (arg === '--output') options.outputPath = next();
    else if (arg === '--runtime-evidence') options.runtimeEvidencePath = next();
    else if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    else options.positionals.push(arg);
  }
  if ([options.json, options.markdown, options.schema].filter(Boolean).length > 1) {
    throw new Error('Use only one output mode: --json, --markdown, or --schema');
  }
  return options;
}

function outputModeForOptions(options = {}) {
  if (options.schema) return 'schema';
  if (options.markdown) return 'markdown';
  return options.json ? 'json' : 'text';
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

function generatedAtFor(deps = {}) {
  if (typeof deps.now === 'function') {
    const value = deps.now();
    return value instanceof Date ? value.toISOString() : String(value);
  }
  return new Date().toISOString();
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

  const cwd = deps.cwd || options.positionals[0] || process.cwd();
  const outputMode = outputModeForOptions(options);
  const provenance = options.includeProvenance
    ? { generatedAt: generatedAtFor(deps), cwd, outputMode, strict: options.strict, argv: [...argv] }
    : undefined;

  if (options.schema) {
    writeOrPrint(renderSchema({ provenance }), options, cwd, stdout, deps);
    return 0;
  }

  const signals = loadSignals(cwd, {
    ...deps,
    runtimeEvidencePath: options.runtimeEvidencePath,
    requireReleaseAttestation: options.requireReleaseAttestation
  });
  const verdict = buildReleaseReadiness(signals, {
    generatedAt: generatedAtFor(deps),
    version: (deps.getPackageVersion ?? getPackageVersion)(cwd),
    commit: (deps.getGitCommit ?? getGitCommit)(cwd)
  });

  let rendered;
  if (outputMode === 'json') {
    rendered = JSON.stringify(provenance ? { ...verdict, provenance } : verdict, null, 2);
  } else if (outputMode === 'markdown') {
    rendered = renderMarkdown(verdict);
  } else {
    rendered = renderSummary(verdict);
  }
  writeOrPrint(rendered, options, cwd, stdout, deps);

  if (options.strict && verdict.status !== 'READY') {
    return 1;
  }
  return 0;
}

function writeOrPrint(content, options, cwd, stdout, deps) {
  if (options.outputPath) {
    const resolved = resolveOutputPath(cwd, options.outputPath);
    const mkdirSync = deps.mkdirSync ?? fs.mkdirSync;
    const writeFile = deps.writeFile ?? fs.writeFileSync;
    mkdirSync(path.dirname(resolved), { recursive: true });
    writeFile(resolved, `${content}\n`, 'utf8');
    stdout.write(`[release-readiness] Wrote ${options.outputPath}\n`);
    return;
  }
  stdout.write(`${content}\n`);
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  SCHEMA_VERSION,
  RELEASE_READINESS_SCHEMA_ID,
  RELEASE_READINESS_SCHEMA_PROVENANCE_KEY,
  RELEASE_READINESS_JSON_SCHEMA,
  SHIPPED_MANIFEST_RELATIVE_PATH,
  parseChangelogTop,
  makeCheck,
  checkRiskLedger,
  checkManifestDigest,
  checkVersionChangelog,
  describeRuntimeAttestation,
  deriveRuntimeAttestationFromLedger,
  checkReleaseAttestation,
  buildReleaseReadiness,
  loadSignals,
  renderSummary,
  renderMarkdown,
  renderSchema,
  parseArgs,
  outputModeForOptions,
  resolveOutputPath,
  main
};
