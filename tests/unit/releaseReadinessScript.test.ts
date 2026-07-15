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
  buildReleaseReadiness: (inputs?: Record<string, unknown>, meta?: Record<string, unknown>) => any;
  renderMarkdown: (verdict: unknown) => string;
  renderSchema: (options?: Record<string, unknown>) => string;
  parseArgs: (argv: string[]) => Record<string, unknown>;
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
  buildReleaseReadiness,
  renderMarkdown,
  renderSchema,
  parseArgs,
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
      'runtimeAttestation'
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
