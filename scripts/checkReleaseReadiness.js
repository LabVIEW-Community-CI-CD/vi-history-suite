#!/usr/bin/env node

/**
 * Release-readiness verdict (advisory; VHS-REQ-615).
 *
 * Composes the repository's existing release-relevant signals into ONE
 * PASS/ATTENTION verdict bound to version+commit, so a human can read a single
 * "is this candidate safe to release?" signal before deciding. This command
 * grants NO release power: it only measures. The actual marketplace release
 * remains a separate manual dispatch (an authorized agent is responsible for it;
 * a maintainer may also perform it).
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

const { SCHEMA_PROVENANCE_KEY, renderSchemaDocument } = require('./lib/schemaEnvelope.js');
const {
  outputModeForOptions,
  parseSharedOutputArgs,
  generatedAt: generatedAtFor,
  buildProvenance,
  resolveOutputPath,
  writeOutput
} = require('./lib/outputContract.js');

const SCHEMA_VERSION = 2;
const RELEASE_READINESS_SCHEMA_ID =
  'https://raw.githubusercontent.com/LabVIEW-Community-CI-CD/vi-history-suite/main/docs/requirements/release-readiness.schema.json';
const RELEASE_READINESS_SCHEMA_PROVENANCE_KEY = SCHEMA_PROVENANCE_KEY;
const UNKNOWN_COMMIT = '<unknown>';
const SHIPPED_MANIFEST_RELATIVE_PATH = 'out/requirements/requirements-manifest.json';
const BOX_MANIFEST_RELATIVE_PATH = 'vagrant/box-manifest.json';
const BOX_MANIFEST_SCHEMA_ID = 'vi-history-suite/vagrant-box-manifest@v1';

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

// Advisory one-line summary of the unified supply-chain state read-model
// (scripts/buildSupplyChainState.js), so a readiness run reports whether every
// shipped artifact bound to a committed digest (box, runtime, requirements,
// devtools) is fresh for this build. Informational only — never gating.
function describeSupplyChainState(state) {
  if (!state || typeof state !== 'object' || typeof state.status !== 'string') {
    return 'Supply-chain provenance state unavailable (run npm run supply-chain:state) (informational; not gating).';
  }
  const attention = Number.isInteger(state.attentionCount) ? state.attentionCount : 0;
  const total = Number.isInteger(state.artifactCount) ? state.artifactCount : 0;
  return `Supply-chain provenance ${state.status}: ${attention} attention of ${total} artifact(s) (informational; not gating).`;
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

// GATING (opt-in, CI-safe): verify the committed Vagrant box manifest
// (vagrant/box-manifest.json) is present, well-formed, and recorded for the
// release version. This never reads the ~71GB box artifact (hosted CI has none)
// — it only validates the committed manifest's internal consistency so a
// release cannot be attested against a missing, malformed, or version-mismatched
// box manifest. Byte-level hash verification stays in verifyVagrantBox.cjs
// --verify as a maintainer-local step.
function checkBoxManifestIntegrity(boxManifest, version) {
  if (!boxManifest || typeof boxManifest !== 'object') {
    return makeCheck(
      'box-manifest-integrity',
      false,
      `Committed Vagrant box manifest (${BOX_MANIFEST_RELATIVE_PATH}) is missing or unparseable; regenerate it with node scripts/verifyVagrantBox.cjs --generate <box> before publishing.`
    );
  }
  if (boxManifest.schema !== BOX_MANIFEST_SCHEMA_ID) {
    return makeCheck(
      'box-manifest-integrity',
      false,
      `Vagrant box manifest schema is ${JSON.stringify(boxManifest.schema)}; expected ${BOX_MANIFEST_SCHEMA_ID}.`
    );
  }
  if (boxManifest.schemaVersion !== 1) {
    return makeCheck(
      'box-manifest-integrity',
      false,
      `Vagrant box manifest schemaVersion is ${JSON.stringify(boxManifest.schemaVersion)}; expected 1.`
    );
  }
  if (typeof boxManifest.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(boxManifest.sha256)) {
    return makeCheck(
      'box-manifest-integrity',
      false,
      'Vagrant box manifest sha256 is missing or not a 64-character lowercase hex digest.'
    );
  }
  if (!Number.isInteger(boxManifest.sizeBytes) || boxManifest.sizeBytes <= 0) {
    return makeCheck(
      'box-manifest-integrity',
      false,
      'Vagrant box manifest sizeBytes is missing or not a positive integer.'
    );
  }
  // The box is identified by its sha256, not the release version: the golden box
  // is regenerated only when rebuilt, while the package version bumps every
  // release. Requiring recordedForVersion to equal the release version would
  // block a normal release on an unchanged box (the attestation freshness is
  // already enforced by the release-attestation check against the ledger). So
  // require recordedForVersion to be present and well-formed, not version-equal.
  if (typeof boxManifest.recordedForVersion !== 'string' || boxManifest.recordedForVersion.trim().length === 0) {
    return makeCheck(
      'box-manifest-integrity',
      false,
      'Vagrant box manifest recordedForVersion is missing or empty.'
    );
  }
  const versionNote =
    boxManifest.recordedForVersion === version
      ? `recorded for ${version}`
      : `recorded for ${boxManifest.recordedForVersion} (box unchanged since)`;
  return makeCheck(
    'box-manifest-integrity',
    true,
    `Committed Vagrant box manifest is well-formed and ${versionNote} (sha256 ${boxManifest.sha256.slice(0, 12)}\u2026).`
  );
}

// GATING (opt-in): bind the release-gating attestation to the box it ran on.
// When a release-gating track records a structured `boxSha256` (box-provenance
// S2), it MUST equal the committed box manifest's sha256 — otherwise the
// attestation was produced on a different box than the one this release ships
// against. Transition posture: soft-pass when a gating track has no `boxSha256`
// (pre-S2 attestations), hard-fail only on a present-but-mismatched digest.
function checkBoxProvenanceBinding(runtimeManifest, boxManifest) {
  const tracks =
    runtimeManifest && typeof runtimeManifest === 'object' && Array.isArray(runtimeManifest.tracks)
      ? runtimeManifest.tracks
      : [];
  const gating = tracks.filter((track) => track && typeof track === 'object' && track.releaseGating === true);
  const boxSha256 =
    boxManifest && typeof boxManifest === 'object' && typeof boxManifest.sha256 === 'string'
      ? boxManifest.sha256
      : null;
  if (!boxSha256) {
    return makeCheck(
      'box-provenance-binding',
      false,
      'Committed Vagrant box manifest has no sha256 to bind the attestation against.'
    );
  }
  const bound = gating.filter((track) => typeof track.boxSha256 === 'string' && track.boxSha256.length > 0);
  const mismatched = bound
    .filter((track) => track.boxSha256 !== boxSha256)
    .map((track) => (typeof track.trackId === 'string' ? track.trackId : 'unnamed-track'));
  if (mismatched.length > 0) {
    return makeCheck(
      'box-provenance-binding',
      false,
      `Release-gating track(s) recorded a boxSha256 that does not match the committed box manifest (${boxSha256.slice(0, 12)}\u2026): ${mismatched.join(', ')}; re-validate against the shipped box.`
    );
  }
  if (bound.length === 0) {
    return makeCheck(
      'box-provenance-binding',
      true,
      'No release-gating track records a structured boxSha256 yet; binding check passes (record one via --box-sha256 to bind future attestations).'
    );
  }
  return makeCheck(
    'box-provenance-binding',
    true,
    `Release-gating attestation(s) bound to the committed box (sha256 ${boxSha256.slice(0, 12)}\u2026): ${bound
      .map((track) => (typeof track.trackId === 'string' ? track.trackId : 'unnamed-track'))
      .join(', ')}.`
  );
}

// GATING (opt-in): promote the advisory unified supply-chain state read-model to a
// hard release check. Unlike the display-only `supplyChain` line, this fails the
// verdict unless every shipped artifact bound to a committed digest (box, runtime,
// requirements, devtools) is fresh for this build (status 'fresh', zero attention,
// at least one artifact). Fails closed when the read-model is unavailable so a
// publish cannot be attested against a missing or degraded provenance state. This
// closes the read-only -> gate loop for the provenance stack; CI reads the same
// committed signals the aggregator reads, so no hypervisor is needed.
function checkSupplyChainFreshness(state) {
  if (!state || typeof state !== 'object' || typeof state.status !== 'string') {
    return makeCheck(
      'supply-chain-freshness',
      false,
      'Supply-chain provenance state unavailable (run npm run supply-chain:state); cannot gate a release on an absent read-model.'
    );
  }
  const total = Number.isInteger(state.artifactCount) ? state.artifactCount : 0;
  if (total === 0) {
    return makeCheck(
      'supply-chain-freshness',
      false,
      'Supply-chain provenance state reports no artifacts; cannot attest freshness for a release.'
    );
  }
  // Enforce the documented "every artifact is fresh" contract by inspecting each
  // artifact record rather than trusting the rollup status/attentionCount, which
  // the aggregator derives from release-gating artifacts only. A stale or
  // unavailable non-gating artifact (e.g. a drifted requirements manifest or an
  // uncompiled devtools toolset) must still block the opt-in gate. Artifacts with
  // fresh === null (freshness not applicable, e.g. content-digest-only records)
  // are treated as acceptable.
  if (Array.isArray(state.artifacts)) {
    const stale = state.artifacts.filter(
      (artifact) => artifact && typeof artifact === 'object' && (artifact.available === false || artifact.fresh === false)
    );
    if (stale.length > 0) {
      const names = stale.map((artifact) => (typeof artifact.id === 'string' ? artifact.id : 'unnamed-artifact'));
      return makeCheck(
        'supply-chain-freshness',
        false,
        `Supply-chain artifact(s) stale or unavailable: ${names.join(', ')}; refresh provenance before publishing.`
      );
    }
    return makeCheck(
      'supply-chain-freshness',
      true,
      `Supply-chain provenance fresh: all ${total} artifact(s) bound and current for this build.`
    );
  }
  // Fallback (no per-artifact records supplied): honor the rollup summary.
  const attention = Number.isInteger(state.attentionCount) ? state.attentionCount : 0;
  if (state.status !== 'fresh' || attention > 0) {
    return makeCheck(
      'supply-chain-freshness',
      false,
      `Supply-chain provenance ${state.status}: ${attention} of ${total} artifact(s) need attention; refresh provenance before publishing.`
    );
  }
  return makeCheck(
    'supply-chain-freshness',
    true,
    `Supply-chain provenance fresh: all ${total} artifact(s) bound and current for this build.`
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
    checks.push(checkBoxManifestIntegrity(inputs.boxManifest, meta.version));
    checks.push(checkBoxProvenanceBinding(inputs.runtimeManifest, inputs.boxManifest));
  }
  // Opt-in supply-chain freshness gate (release workflow path only). The advisory
  // `supplyChain` line still renders regardless; this only adds a hard check when
  // the maintainer opts in, preserving the advisory-default contract.
  if (inputs.requireSupplyChainFresh) {
    checks.push(checkSupplyChainFreshness(inputs.supplyChainState));
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
    runtimeAttestation: describeRuntimeAttestation(meta.version, inputs.runtimeEvidence),
    supplyChain: describeSupplyChainState(inputs.supplyChainState)
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

  // Committed Vagrant box manifest, used by the opt-in box-manifest-integrity
  // gate. Read the committed JSON only (never the box bytes) so the gate is
  // safe in hosted CI, which has no box artifact.
  let boxManifest;
  const boxManifestRaw = readFile(BOX_MANIFEST_RELATIVE_PATH);
  if (typeof boxManifestRaw === 'string') {
    try {
      boxManifest = JSON.parse(boxManifestRaw);
    } catch {
      boxManifest = undefined;
    }
  }

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

  // Advisory unified supply-chain provenance state (read-model; never gating).
  // Graceful-degrade to undefined so the readiness verdict is unaffected when
  // the aggregator or any of its sources are unavailable.
  let supplyChainState;
  try {
    const supplyChainModule = deps.supplyChainModule ?? require('./buildSupplyChainState.js');
    const state = supplyChainModule.collectSupplyChainState(cwd, {}, {});
    if (state && typeof state.status === 'string') {
      supplyChainState = {
        status: state.status,
        attentionCount: state.attentionCount,
        artifactCount: state.artifactCount,
        artifacts: Array.isArray(state.artifacts) ? state.artifacts : undefined
      };
    }
  } catch {
    supplyChainState = undefined;
  }

  return {
    ledger,
    hasSelectableHighRisk: ledgerModule.hasSelectableHighRisk,
    builtManifestDigest,
    shippedManifest,
    changelogTop,
    runtimeManifest,
    boxManifest,
    requireReleaseAttestation: deps.requireReleaseAttestation === true,
    requireSupplyChainFresh: deps.requireSupplyChainFresh === true,
    runtimeEvidence,
    supplyChainState
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
  lines.push(`[release-readiness] Supply-chain: ${verdict.supplyChain}`);
  lines.push(`[release-readiness] Verdict: ${verdict.status}.`);
  lines.push('[release-readiness] Advisory; the marketplace release remains a separate manual dispatch (an authorized agent is responsible; a maintainer may also perform it).');
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
    lines.push(`| ${check.name} | ${check.passed ? 'PASS' : 'ATTENTION'} | ${check.details.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  lines.push(`_Runtime attestation:_ ${verdict.runtimeAttestation}`);
  lines.push('');
  lines.push(`_Supply-chain state:_ ${verdict.supplyChain}`);
  lines.push('');
  lines.push('_The marketplace release remains a separate manual dispatch (an authorized agent is responsible; a maintainer may also perform it)._');
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
    'runtimeAttestation',
    'supplyChain'
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
    runtimeAttestation: { type: 'string' },
    supplyChain: { type: 'string' }
  }
};

function renderSchema(options = {}) {
  return renderSchemaDocument(RELEASE_READINESS_JSON_SCHEMA, options);
}

// --- CLI ---

function parseArgs(argv = []) {
  const { options, positionals } = parseSharedOutputArgs(argv, {
    defaults: {
      json: false,
      markdown: false,
      schema: false,
      strict: false,
      includeProvenance: false,
      requireReleaseAttestation: false,
      requireSupplyChainFresh: false,
      outputPath: undefined,
      runtimeEvidencePath: undefined
    },
    boolFlags: {
      '--require-release-attestation': 'requireReleaseAttestation',
      '--require-supply-chain-fresh': 'requireSupplyChainFresh'
    },
    valueFlags: {
      '--runtime-evidence': 'runtimeEvidencePath'
    }
  });
  options.positionals = positionals;
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

  const cwd = deps.cwd || options.positionals[0] || process.cwd();
  const outputMode = outputModeForOptions(options);
  const provenance = options.includeProvenance
    ? buildProvenance({ cwd, outputMode, strict: options.strict, argv }, deps)
    : undefined;

  if (options.schema) {
    writeOutput(renderSchema({ provenance }), { outputPath: options.outputPath, cwd, stdout, deps, label: 'release-readiness' });
    return 0;
  }

  const signals = loadSignals(cwd, {
    ...deps,
    runtimeEvidencePath: options.runtimeEvidencePath,
    requireReleaseAttestation: options.requireReleaseAttestation,
    requireSupplyChainFresh: options.requireSupplyChainFresh
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
  writeOutput(rendered, { outputPath: options.outputPath, cwd, stdout, deps, label: 'release-readiness' });

  if (options.strict && verdict.status !== 'READY') {
    return 1;
  }
  return 0;
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
  BOX_MANIFEST_RELATIVE_PATH,
  BOX_MANIFEST_SCHEMA_ID,
  parseChangelogTop,
  makeCheck,
  checkRiskLedger,
  checkManifestDigest,
  checkVersionChangelog,
  describeRuntimeAttestation,
  describeSupplyChainState,
  deriveRuntimeAttestationFromLedger,
  checkReleaseAttestation,
  checkSupplyChainFreshness,
  checkBoxManifestIntegrity,
  checkBoxProvenanceBinding,
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
