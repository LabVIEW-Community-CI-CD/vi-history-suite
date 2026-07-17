import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// Requirement coverage: VHS-REQ-615 (Definition-of-Done Operating Requirement).
// Criterion coverage: VHS-REQ-615.13 — a release-readiness verdict composes
// existing signals (risk ledger, requirements-manifest digest, version/CHANGELOG)
// into one advisory PASS/ATTENTION status bound to version+commit, with a
// display-only human-attested runtime line that never gates.

const readinessModule = require('../../scripts/checkReleaseReadiness.js') as {
  SCHEMA_VERSION: number;
  RELEASE_READINESS_SCHEMA_ID: string;
  parseChangelogTop: (text: string) => { released?: string; unreleased: boolean };
  checkRiskLedger: (ledger: unknown, hasSelectableHighRisk: (l: unknown) => boolean) => { name: string; passed: boolean; details: string };
  checkManifestDigest: (builtDigest: string, shipped: unknown) => { name: string; passed: boolean; details: string };
  checkVersionChangelog: (version: string, top: { released?: string; unreleased: boolean }) => { name: string; passed: boolean; details: string };
  describeRuntimeAttestation: (version: string, evidence: unknown) => string;
  describeSupplyChainState: (state: unknown) => string;
  deriveRuntimeAttestationFromLedger: (manifest: unknown, version: string) => any;
  checkReleaseAttestation: (manifest: unknown, version: string) => { name: string; passed: boolean; details: string };
  checkBoxManifestIntegrity: (boxManifest: unknown, version: string) => { name: string; passed: boolean; details: string };
  checkBoxProvenanceBinding: (runtimeManifest: unknown, boxManifest: unknown) => { name: string; passed: boolean; details: string };
  buildReleaseReadiness: (inputs?: Record<string, unknown>, meta?: Record<string, unknown>) => any;
  renderMarkdown: (verdict: unknown) => string;
  renderSchema: (options?: Record<string, unknown>) => string;
  parseArgs: (argv: string[]) => Record<string, unknown>;
  outputModeForOptions: (options?: Record<string, unknown>) => string;
  resolveOutputPath: (cwd: string, relativePath: string) => string;
  main: (argv?: string[], deps?: Record<string, unknown>) => number;
};

const {
  SCHEMA_VERSION,
  RELEASE_READINESS_SCHEMA_ID,
  parseChangelogTop,
  checkRiskLedger,
  checkManifestDigest,
  checkVersionChangelog,
  describeRuntimeAttestation,
  describeSupplyChainState,
  deriveRuntimeAttestationFromLedger,
  checkReleaseAttestation,
  checkBoxManifestIntegrity,
  checkBoxProvenanceBinding,
  buildReleaseReadiness,
  renderMarkdown,
  renderSchema,
  parseArgs,
  outputModeForOptions,
  resolveOutputPath,
  main
} = readinessModule;

const CLEAN_LEDGER = {
  entries: [
    { id: 'coverage/debt/VHS-REQ-621', selectable: true, severityTier: 'MEDIUM' },
    { id: 'platform-proof/windows-host-native', selectable: false, severityTier: 'HIGH' }
  ],
  ranking: { nextTarget: 'coverage/debt/VHS-REQ-621' }
};
const HIGH_LEDGER = {
  entries: [{ id: 'verification/unlinked/VHS-REQ-999', selectable: true, severityTier: 'HIGH' }],
  ranking: { nextTarget: 'verification/unlinked/VHS-REQ-999' }
};
const hasSelectableHighRisk = (ledger: any): boolean =>
  ledger.entries.some((e: any) => e.selectable && (e.severityTier === 'CRITICAL' || e.severityTier === 'HIGH'));

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});
function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-readiness-'));
  tempDirs.push(dir);
  return dir;
}

describe('checkReleaseReadiness', () => {
  it('parses CHANGELOG top as unreleased or released heading (VHS-REQ-615)', () => {
    expect(parseChangelogTop('# Changelog\n\n## [Unreleased]\n\n### Added\n')).toEqual({
      released: undefined,
      unreleased: true
    });
    expect(parseChangelogTop('# Changelog\n\n## [1.33.2] - 2026-06-25\n')).toEqual({
      released: '1.33.2',
      unreleased: false
    });
    expect(parseChangelogTop('no headings here')).toEqual({ released: undefined, unreleased: false });
  });

  it('passes the risk-ledger check only when no selectable CRITICAL/HIGH exists (VHS-REQ-615.13)', () => {
    expect(checkRiskLedger(CLEAN_LEDGER, hasSelectableHighRisk).passed).toBe(true);
    const high = checkRiskLedger(HIGH_LEDGER, hasSelectableHighRisk);
    expect(high.passed).toBe(false);
    expect(high.details).toContain('CRITICAL/HIGH');
  });

  it('passes the manifest check only when shipped digest matches the freshly built digest (VHS-REQ-615.13)', () => {
    expect(checkManifestDigest('abc123', { integrityDigest: 'abc123' }).passed).toBe(true);
    expect(checkManifestDigest('abc123', { integrityDigest: 'DIFFERENT' }).passed).toBe(false);
    // Absent shipped manifest -> ATTENTION with a recompile hint (not a crash).
    const absent = checkManifestDigest('abc123', undefined);
    expect(absent.passed).toBe(false);
    expect(absent.details).toContain('npm run compile');
  });

  it('treats an [Unreleased] CHANGELOG as coherent and flags a version mismatch (VHS-REQ-615.13)', () => {
    expect(checkVersionChangelog('1.33.2', { released: undefined, unreleased: true }).passed).toBe(true);
    expect(checkVersionChangelog('1.33.2', { released: '1.33.2', unreleased: false }).passed).toBe(true);
    expect(checkVersionChangelog('1.33.2', { released: '1.30.0', unreleased: false }).passed).toBe(false);
  });

  it('keeps runtime attestation display-only and never gating (VHS-REQ-615.13)', () => {
    expect(describeRuntimeAttestation('1.33.2', undefined)).toContain('not gating');
    expect(describeRuntimeAttestation('1.33.2', { present: true, tracks: ['host-native', '2026q1'] })).toContain(
      'host-native, 2026q1'
    );
    // Even with no runtime evidence, a fully-passing verdict is READY (runtime is not a check).
    const verdict = buildReleaseReadiness(
      {
        ledger: CLEAN_LEDGER,
        hasSelectableHighRisk,
        builtManifestDigest: 'abc123',
        shippedManifest: { integrityDigest: 'abc123' },
        changelogTop: { released: undefined, unreleased: true },
        runtimeEvidence: undefined
      },
      { generatedAt: '2026-07-15T00:00:00.000Z', version: '1.33.2', commit: 'deadbeef' }
    );
    expect(verdict.status).toBe('READY');
    expect(verdict.checks).toHaveLength(3);
  });

  it('returns ATTENTION when any composed check fails (VHS-REQ-615.13)', () => {
    const verdict = buildReleaseReadiness(
      {
        ledger: HIGH_LEDGER,
        hasSelectableHighRisk,
        builtManifestDigest: 'abc123',
        shippedManifest: { integrityDigest: 'abc123' },
        changelogTop: { released: undefined, unreleased: true }
      },
      { generatedAt: '2026-07-15T00:00:00.000Z', version: '1.33.2', commit: 'deadbeef' }
    );
    expect(verdict.status).toBe('ATTENTION');
    expect(Object.keys(verdict)).toEqual([
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
    ]);
    expect(verdict.$schema).toBe(RELEASE_READINESS_SCHEMA_ID);
    expect(verdict.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('renders markdown and a schema with the status enum (VHS-REQ-615)', () => {
    const verdict = buildReleaseReadiness(
      {
        ledger: CLEAN_LEDGER,
        hasSelectableHighRisk,
        builtManifestDigest: 'abc123',
        shippedManifest: { integrityDigest: 'abc123' },
        changelogTop: { released: undefined, unreleased: true }
      },
      { generatedAt: '2026-07-15T00:00:00.000Z', version: '1.33.2', commit: 'deadbeef' }
    );
    expect(renderMarkdown(verdict)).toContain('# Release Readiness');
    expect(renderMarkdown(verdict)).toContain('Verdict: **READY**');
    const schema = JSON.parse(renderSchema());
    expect(schema.properties.status.enum).toEqual(['READY', 'ATTENTION']);
    expect(JSON.parse(renderSchema({ provenance: { generatedAt: 'x' } }))['x-vi-history-suite-provenance']).toEqual({
      generatedAt: 'x'
    });
  });

  it('describeSupplyChainState summarizes the read-model advisory line without gating (VHS-REQ-668)', () => {
    expect(describeSupplyChainState({ status: 'fresh', attentionCount: 0, artifactCount: 4 })).toBe(
      'Supply-chain provenance fresh: 0 attention of 4 artifact(s) (informational; not gating).'
    );
    expect(describeSupplyChainState({ status: 'attention', attentionCount: 2, artifactCount: 4 })).toContain(
      'attention: 2 attention of 4'
    );
    // Unavailable / malformed inputs degrade to an informational, non-gating note.
    expect(describeSupplyChainState(undefined)).toContain('unavailable');
    expect(describeSupplyChainState({})).toContain('unavailable');
  });

  it('parseArgs and resolveOutputPath enforce output-mode and path safety (VHS-REQ-615)', () => {
    expect(() => parseArgs(['--json', '--schema'])).toThrow(/only one output mode/);
    expect(() => parseArgs(['--bad'])).toThrow(/Unknown argument/);
    const cwd = makeTempDir();
    expect(() => resolveOutputPath(cwd, '')).toThrow(/non-empty/);
    expect(() => resolveOutputPath(cwd, '/abs')).toThrow(/relative/);
    expect(() => resolveOutputPath(cwd, '../x')).toThrow(/inside the working directory/);
  });

  it('main composes injected sibling modules, writes JSON to --output, and honors --strict (VHS-REQ-615.13)', () => {
    const cwd = makeTempDir();
    fs.mkdirSync(path.join(cwd, 'docs', 'requirements'), { recursive: true });
    fs.mkdirSync(path.join(cwd, 'out', 'requirements'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n', 'utf8');
    fs.writeFileSync(
      path.join(cwd, 'out', 'requirements', 'requirements-manifest.json'),
      JSON.stringify({ integrityDigest: 'DIGEST123' }),
      'utf8'
    );

    const riskLedgerModule = {
      loadCoverageSignal: () => ({ available: true, map: {}, source: 'fixture' }),
      loadRequirementsSignal: () => ({ available: true, health: {}, source: 'fixture' }),
      buildRiskLedger: () => CLEAN_LEDGER,
      hasSelectableHighRisk
    };
    const manifestModule = {
      buildRequirementsManifest: () => ({ integrityDigest: 'DIGEST123' })
    };

    const outputs: string[] = [];
    const readyCode = main(['--json', '--output', 'evidence/readiness.json'], {
      cwd,
      riskLedgerModule,
      manifestModule,
      getPackageVersion: () => '1.33.2',
      getGitCommit: () => 'deadbeefcafef00d',
      now: () => new Date('2026-07-15T00:00:00.000Z'),
      stdout: { write: (t: string) => outputs.push(t) },
      stderr: { write: (t: string) => outputs.push(t) }
    });
    expect(readyCode).toBe(0);
    const written = JSON.parse(fs.readFileSync(path.join(cwd, 'evidence', 'readiness.json'), 'utf8'));
    expect(written.status).toBe('READY');
    expect(written.manifestDigest).toBe('DIGEST123');

    // Strict + a HIGH ledger -> exit 1.
    const strictCode = main(['--strict'], {
      cwd,
      riskLedgerModule: { ...riskLedgerModule, buildRiskLedger: () => HIGH_LEDGER },
      manifestModule,
      getPackageVersion: () => '1.33.2',
      getGitCommit: () => 'deadbeefcafef00d',
      now: () => new Date('2026-07-15T00:00:00.000Z'),
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });
    expect(strictCode).toBe(1);
  });
});

// Criterion coverage: VHS-REQ-615.14 — the release-readiness runtime line is
// derived by default from the committed runtime-validation ledger, naming tracks
// validated at the candidate build and any stale tracks, and stays display-only.
describe('deriveRuntimeAttestationFromLedger (VHS-REQ-615.14)', () => {
  const MANIFEST = {
    schemaVersion: 1,
    tracks: [
      { trackId: 'linux-host-native', linuxExecutable: true, lastValidatedVersion: '1.33.2' },
      { trackId: 'linux-container-2026q1', linuxExecutable: true, lastValidatedVersion: '1.33.2' },
      { trackId: 'windows-host-native', linuxExecutable: false, lastValidatedVersion: '1.0.0' }
    ]
  };

  it('marks every Linux track fresh at the matching build version (no stale)', () => {
    const evidence = deriveRuntimeAttestationFromLedger(MANIFEST, '1.33.2');
    expect(evidence.present).toBe(true);
    expect(evidence.tracks).toEqual(['linux-host-native', 'linux-container-2026q1']);
    expect(evidence.staleTracks).toEqual([]);
    // Windows (non-Linux-executable) tracks are excluded entirely.
    expect(evidence.tracks).not.toContain('windows-host-native');
  });

  it('marks Linux tracks stale at a newer build version', () => {
    const evidence = deriveRuntimeAttestationFromLedger(MANIFEST, '1.34.0');
    expect(evidence.present).toBe(false);
    expect(evidence.tracks).toEqual([]);
    expect(evidence.staleTracks).toEqual(['linux-host-native', 'linux-container-2026q1']);
  });

  it('returns undefined for a missing or malformed manifest', () => {
    expect(deriveRuntimeAttestationFromLedger(undefined, '1.33.2')).toBeUndefined();
    expect(deriveRuntimeAttestationFromLedger({}, '1.33.2')).toBeUndefined();
  });

  it('describeRuntimeAttestation names fresh and stale tracks but never gates (VHS-REQ-615.14)', () => {
    const fresh = deriveRuntimeAttestationFromLedger(MANIFEST, '1.33.2');
    const freshText = describeRuntimeAttestation('1.33.2', fresh);
    expect(freshText).toContain('present for 1.33.2');
    expect(freshText).toContain('linux-host-native, linux-container-2026q1');

    const stale = deriveRuntimeAttestationFromLedger(MANIFEST, '1.34.0');
    const staleText = describeRuntimeAttestation('1.34.0', stale);
    expect(staleText).toContain('stale tracks needing re-validation');
    expect(staleText).toContain('not gating');

    // Derived evidence must not add a gating check: the verdict still has 3 checks.
    const verdict = buildReleaseReadiness(
      {
        ledger: CLEAN_LEDGER,
        hasSelectableHighRisk,
        builtManifestDigest: 'abc123',
        shippedManifest: { integrityDigest: 'abc123' },
        changelogTop: { released: undefined, unreleased: true },
        runtimeEvidence: stale
      },
      { generatedAt: '2026-07-15T00:00:00.000Z', version: '1.34.0', commit: 'deadbeef' }
    );
    expect(verdict.status).toBe('READY');
    expect(verdict.checks).toHaveLength(3);
    expect(verdict.runtimeAttestation).toContain('stale tracks needing re-validation');
  });
});

describe('outputModeForOptions', () => {
  it('returns schema when --schema is set (highest precedence)', () => {
    expect(outputModeForOptions({ schema: true, markdown: true, json: true })).toBe('schema');
  });

  it('returns markdown when --markdown is set and --schema is not', () => {
    expect(outputModeForOptions({ markdown: true, json: true })).toBe('markdown');
  });

  it('returns json when only --json is set', () => {
    expect(outputModeForOptions({ json: true })).toBe('json');
  });

  it('returns text when no output mode is set (default and empty options)', () => {
    expect(outputModeForOptions({})).toBe('text');
    expect(outputModeForOptions()).toBe('text');
  });
});

describe('parseArgs value and provenance branches', () => {
  it('throws when an option requiring a value is given none', () => {
    expect(() => parseArgs(['--output'])).toThrow(/--output requires a value/);
    expect(() => parseArgs(['--runtime-evidence'])).toThrow(/--runtime-evidence requires a value/);
  });

  it('throws when an option requiring a value is followed by another flag', () => {
    expect(() => parseArgs(['--output', '--json'])).toThrow(/--output requires a value/);
  });

  it('captures option values and positionals', () => {
    const options = parseArgs(['--output', 'out/readiness.json', '--strict', 'pos1']);
    expect(options.outputPath).toBe('out/readiness.json');
    expect(options.strict).toBe(true);
    expect(options.positionals).toEqual(['pos1']);
  });

  it('renderSchema omits the provenance key when no provenance is supplied', () => {
    const schema = JSON.parse(renderSchema());
    expect(schema['x-vi-history-suite-provenance']).toBeUndefined();
    expect(schema.$id).toBe(RELEASE_READINESS_SCHEMA_ID);
  });
});

// Criterion coverage: VHS-REQ-666 — a mandatory local release-validation
// attestation (produced by the Vagrant Windows/LabVIEW lane) is an opt-in
// GATING check. It reads a releaseGating track from the committed
// runtime-validation ledger and fails closed unless that track was validated at
// the release version. The default advisory verdict (no flag) stays three checks
// with a display-only runtime line, preserving VHS-REQ-615.13.
describe('checkReleaseAttestation release gate (VHS-REQ-666)', () => {
  const GATING_FRESH = {
    tracks: [
      { trackId: 'linux-host-native', linuxExecutable: true, lastValidatedVersion: '1.33.2' },
      { trackId: 'vagrant-win-x86-hostnative', releaseGating: true, lastValidatedVersion: '1.33.2' }
    ]
  };
  const GATING_STALE = {
    tracks: [{ trackId: 'vagrant-win-x86-hostnative', releaseGating: true, lastValidatedVersion: '0.0.0' }]
  };
  const GATING_ABSENT = {
    tracks: [{ trackId: 'linux-host-native', linuxExecutable: true, lastValidatedVersion: '1.33.2' }]
  };

  it('passes only when a release-gating track is validated at the release version (VHS-REQ-666.1)', () => {
    expect(checkReleaseAttestation(GATING_FRESH, '1.33.2').passed).toBe(true);
    const stale = checkReleaseAttestation(GATING_STALE, '1.33.2');
    expect(stale.passed).toBe(false);
    expect(stale.details).toContain('not validated at 1.33.2');
  });

  it('fails closed when no release-gating track exists (VHS-REQ-666.1)', () => {
    const absent = checkReleaseAttestation(GATING_ABSENT, '1.33.2');
    expect(absent.passed).toBe(false);
    expect(absent.details).toContain('No release-gating runtime track');
    expect(checkReleaseAttestation(undefined, '1.33.2').passed).toBe(false);
  });

  const BOX_MANIFEST_VALID = {
    schema: 'vi-history-suite/vagrant-box-manifest@v1',
    schemaVersion: 1,
    sha256: 'a'.repeat(64),
    sizeBytes: 123,
    recordedForVersion: '1.33.2'
  };

  it('appends the gating checks ONLY when requireReleaseAttestation is set (VHS-REQ-666.2)', () => {
    const base = {
      ledger: CLEAN_LEDGER,
      hasSelectableHighRisk,
      builtManifestDigest: 'abc123',
      shippedManifest: { integrityDigest: 'abc123' },
      changelogTop: { released: undefined, unreleased: true }
    };
    const meta = { generatedAt: '2026-07-16T00:00:00.000Z', version: '1.33.2', commit: 'deadbeef' };

    // Default: three checks, READY, no gate.
    const advisory = buildReleaseReadiness(base, meta);
    expect(advisory.checks).toHaveLength(3);
    expect(advisory.status).toBe('READY');

    // Gated + fresh attestation + valid box manifest: six checks, READY.
    const gatedReady = buildReleaseReadiness(
      { ...base, requireReleaseAttestation: true, runtimeManifest: GATING_FRESH, boxManifest: BOX_MANIFEST_VALID },
      meta
    );
    expect(gatedReady.checks).toHaveLength(6);
    expect(gatedReady.status).toBe('READY');
    expect(gatedReady.checks.map((c: { name: string }) => c.name)).toContain('release-attestation');

    // Gated + stale attestation: six checks, ATTENTION (fails closed).
    const gatedStale = buildReleaseReadiness(
      { ...base, requireReleaseAttestation: true, runtimeManifest: GATING_STALE, boxManifest: BOX_MANIFEST_VALID },
      meta
    );
    expect(gatedStale.checks).toHaveLength(6);
    expect(gatedStale.status).toBe('ATTENTION');
  });

  it('main --require-release-attestation --strict blocks a stale attestation and passes a fresh one (VHS-REQ-666.1)', () => {
    const cwd = makeTempDir();
    fs.mkdirSync(path.join(cwd, 'out', 'requirements'), { recursive: true });
    fs.mkdirSync(path.join(cwd, 'vagrant'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n', 'utf8');
    fs.writeFileSync(
      path.join(cwd, 'out', 'requirements', 'requirements-manifest.json'),
      JSON.stringify({ integrityDigest: 'DIGEST123' }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(cwd, 'vagrant', 'box-manifest.json'),
      JSON.stringify({
        schema: 'vi-history-suite/vagrant-box-manifest@v1',
        schemaVersion: 1,
        sha256: 'a'.repeat(64),
        sizeBytes: 123,
        recordedForVersion: '1.33.2'
      }),
      'utf8'
    );

    const baseDeps = (manifest: unknown) => ({
      cwd,
      riskLedgerModule: {
        loadCoverageSignal: () => ({ available: true, map: {}, source: 'fixture' }),
        loadRequirementsSignal: () => ({ available: true, health: {}, source: 'fixture' }),
        loadRuntimeValidationSignal: () => ({ available: true, manifest }),
        buildRiskLedger: () => CLEAN_LEDGER,
        hasSelectableHighRisk
      },
      manifestModule: { buildRequirementsManifest: () => ({ integrityDigest: 'DIGEST123' }) },
      getPackageVersion: () => '1.33.2',
      getGitCommit: () => 'deadbeefcafef00d',
      now: () => new Date('2026-07-16T00:00:00.000Z'),
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });

    const staleCode = main(['--strict', '--require-release-attestation'], baseDeps(GATING_STALE));
    expect(staleCode).toBe(1);

    const freshCode = main(['--strict', '--require-release-attestation'], baseDeps(GATING_FRESH));
    expect(freshCode).toBe(0);
  });

  it('parseArgs captures --require-release-attestation', () => {
    expect(parseArgs(['--require-release-attestation']).requireReleaseAttestation).toBe(true);
    expect(parseArgs([]).requireReleaseAttestation).toBe(false);
  });
});

// Criterion coverage: VHS-REQ-666.5 — a CI-safe box-manifest-integrity gate
// verifies the committed vagrant/box-manifest.json is present, well-formed, and
// recorded for the release version. It reads only the committed manifest (never
// the box bytes), so it runs in hosted CI. It is appended only under
// --require-release-attestation, preserving the advisory default verdict.
describe('checkBoxManifestIntegrity release gate (VHS-REQ-666.5)', () => {
  const VALID = {
    schema: 'vi-history-suite/vagrant-box-manifest@v1',
    schemaVersion: 1,
    sha256: 'a'.repeat(64),
    sizeBytes: 123,
    recordedForVersion: '1.33.2'
  };

  it('passes a well-formed manifest recorded for the release version (VHS-REQ-666.5)', () => {
    const result = checkBoxManifestIntegrity(VALID, '1.33.2');
    expect(result.passed).toBe(true);
    expect(result.name).toBe('box-manifest-integrity');
  });

  it('fails closed on a missing or non-object manifest (VHS-REQ-666.5)', () => {
    expect(checkBoxManifestIntegrity(undefined, '1.33.2').passed).toBe(false);
    expect(checkBoxManifestIntegrity(null, '1.33.2').passed).toBe(false);
    expect(checkBoxManifestIntegrity(undefined, '1.33.2').details).toContain('missing or unparseable');
  });

  it('fails closed on a wrong schema id or schemaVersion (VHS-REQ-666.5)', () => {
    expect(checkBoxManifestIntegrity({ ...VALID, schema: 'other' }, '1.33.2').passed).toBe(false);
    expect(checkBoxManifestIntegrity({ ...VALID, schemaVersion: 2 }, '1.33.2').passed).toBe(false);
  });

  it('fails closed on a malformed sha256 (VHS-REQ-666.5)', () => {
    expect(checkBoxManifestIntegrity({ ...VALID, sha256: 'abc' }, '1.33.2').passed).toBe(false);
    expect(checkBoxManifestIntegrity({ ...VALID, sha256: 'A'.repeat(64) }, '1.33.2').passed).toBe(false);
    expect(checkBoxManifestIntegrity({ ...VALID, sha256: undefined }, '1.33.2').passed).toBe(false);
  });

  it('fails closed on a non-positive-integer sizeBytes (VHS-REQ-666.5)', () => {
    expect(checkBoxManifestIntegrity({ ...VALID, sizeBytes: 0 }, '1.33.2').passed).toBe(false);
    expect(checkBoxManifestIntegrity({ ...VALID, sizeBytes: -1 }, '1.33.2').passed).toBe(false);
    expect(checkBoxManifestIntegrity({ ...VALID, sizeBytes: 1.5 }, '1.33.2').passed).toBe(false);
    expect(checkBoxManifestIntegrity({ ...VALID, sizeBytes: undefined }, '1.33.2').passed).toBe(false);
  });

  it('passes a non-version-equal recordedForVersion (box unchanged) but fails when missing/empty (VHS-REQ-666.5)', () => {
    // The box is identified by sha256, not the release version; an unchanged box
    // recorded for a prior version must not block a release.
    const unchanged = checkBoxManifestIntegrity({ ...VALID, recordedForVersion: '0.0.0' }, '1.33.2');
    expect(unchanged.passed).toBe(true);
    expect(unchanged.details).toContain('box unchanged since');
    expect(checkBoxManifestIntegrity({ ...VALID, recordedForVersion: undefined }, '1.33.2').passed).toBe(false);
    expect(checkBoxManifestIntegrity({ ...VALID, recordedForVersion: '  ' }, '1.33.2').passed).toBe(false);
  });

  it('is appended only under requireReleaseAttestation (VHS-REQ-666.5)', () => {
    const base = {
      ledger: CLEAN_LEDGER,
      hasSelectableHighRisk,
      builtManifestDigest: 'abc123',
      shippedManifest: { integrityDigest: 'abc123' },
      changelogTop: { released: undefined, unreleased: true },
      runtimeManifest: {
        tracks: [{ trackId: 'vagrant-win-x86-hostnative', releaseGating: true, lastValidatedVersion: '1.33.2' }]
      }
    };
    const meta = { generatedAt: '2026-07-16T00:00:00.000Z', version: '1.33.2', commit: 'deadbeef' };

    const advisory = buildReleaseReadiness(base, meta);
    expect(advisory.checks.map((c: { name: string }) => c.name)).not.toContain('box-manifest-integrity');

    const gatedReady = buildReleaseReadiness({ ...base, requireReleaseAttestation: true, boxManifest: VALID }, meta);
    expect(gatedReady.checks.map((c: { name: string }) => c.name)).toContain('box-manifest-integrity');
    expect(gatedReady.status).toBe('READY');

    const gatedMalformed = buildReleaseReadiness(
      { ...base, requireReleaseAttestation: true, boxManifest: { ...VALID, sha256: 'nope' } },
      meta
    );
    expect(gatedMalformed.status).toBe('ATTENTION');
  });
});

// Criterion coverage: VHS-REQ-666.6 — box-provenance binding. When a
// release-gating track records a structured boxSha256 (S2), it must equal the
// committed box manifest sha256; a mismatch fails closed. Absent boxSha256
// (pre-S2 attestations) soft-passes during the transition.
describe('checkBoxProvenanceBinding (VHS-REQ-666.6)', () => {
  const BOX = { sha256: 'a'.repeat(64) };
  const gatingTrack = (over: Record<string, unknown> = {}) => ({
    trackId: 'vagrant-win-x86-hostnative',
    releaseGating: true,
    lastValidatedVersion: '1.33.2',
    ...over
  });

  it('passes when a gating track boxSha256 matches the committed manifest (VHS-REQ-666.6)', () => {
    const result = checkBoxProvenanceBinding(
      { tracks: [gatingTrack({ boxSha256: 'a'.repeat(64) })] },
      BOX
    );
    expect(result.passed).toBe(true);
    expect(result.name).toBe('box-provenance-binding');
  });

  it('fails closed when a gating track boxSha256 does not match (VHS-REQ-666.6)', () => {
    const result = checkBoxProvenanceBinding(
      { tracks: [gatingTrack({ boxSha256: 'b'.repeat(64) })] },
      BOX
    );
    expect(result.passed).toBe(false);
    expect(result.details).toContain('does not match');
  });

  it('soft-passes when no gating track records a boxSha256 yet (transition) (VHS-REQ-666.6)', () => {
    const result = checkBoxProvenanceBinding({ tracks: [gatingTrack()] }, BOX);
    expect(result.passed).toBe(true);
    expect(result.details).toContain('No release-gating track records a structured boxSha256');
  });

  it('fails closed when the committed manifest has no sha256 (VHS-REQ-666.6)', () => {
    expect(checkBoxProvenanceBinding({ tracks: [gatingTrack({ boxSha256: 'a'.repeat(64) })] }, {}).passed).toBe(
      false
    );
  });
});
