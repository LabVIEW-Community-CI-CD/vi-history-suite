import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// Requirement coverage: VHS-REQ-601 (Requirements As Agent Work Contracts).
// Criterion coverage: VHS-REQ-601.30 — a deterministic risk-ledger aggregator
// ranks measured coverage, requirement-health, and standards risks into one
// nextTarget while parking non-Linux-executable platform-proof risk.

const ledgerModule = require('../../scripts/buildRiskLedger.js') as {
  SCHEMA_VERSION: number;
  RISK_LEDGER_SCHEMA_ID: string;
  DIMENSIONS: string[];
  PLATFORM_PROOF_RISKS: Array<{ id: string; provenance: string; title: string; suggestedAction: string }>;
  buildRiskLedger: (signals?: Record<string, unknown>, meta?: Record<string, unknown>) => any;
  buildCoverageEntries: (coverageMap: unknown, options?: Record<string, unknown>) => any[];
  buildVerificationEntries: (health: unknown) => any[];
  buildStandardsEntries: (summary: unknown) => any[];
  hasSelectableHighRisk: (ledger: unknown) => boolean;
  renderMarkdown: (ledger: unknown) => string;
  renderSchema: (options?: Record<string, unknown>) => string;
  parseArgs: (argv: string[]) => Record<string, unknown>;
  resolveOutputPath: (cwd: string, relativePath: string) => string;
  main: (argv?: string[], deps?: Record<string, unknown>) => number;
};

const {
  SCHEMA_VERSION,
  RISK_LEDGER_SCHEMA_ID,
  DIMENSIONS,
  PLATFORM_PROOF_RISKS,
  buildRiskLedger,
  buildCoverageEntries,
  buildVerificationEntries,
  buildStandardsEntries,
  hasSelectableHighRisk,
  renderMarkdown,
  renderSchema,
  parseArgs,
  resolveOutputPath,
  main
} = ledgerModule;

const {
  loadCoverageSignal,
  loadRequirementsSignal,
  loadStandardsSignal,
  renderSummary
} = ledgerModule as unknown as {
  loadCoverageSignal: (cwd: string, deps?: Record<string, unknown>) => any;
  loadRequirementsSignal: (cwd: string, deps?: Record<string, unknown>) => any;
  loadStandardsSignal: (cwd: string, deps?: Record<string, unknown>) => any;
  renderSummary: (ledger: unknown) => string;
};

const HEALTHY_HEALTH = {
  integrity: { success: true, violationCount: 0 },
  attention: []
};

const COVERAGE_WITH_DEBT = {
  riskThreshold: 50,
  mappedBelowThreshold: [],
  zeroCoverageSupportingRequirements: [],
  byRequirement: [
    { reqId: 'VHS-REQ-100', fileCount: 2, missingLines: 100, missingBranches: 50, missingFunctions: 10, files: ['a.ts', 'b.ts'] },
    { reqId: 'VHS-REQ-200', fileCount: 1, missingLines: 10, missingBranches: 5, missingFunctions: 1, files: ['c.ts'] }
  ]
};

function signalsFrom(options: {
  coverage?: unknown;
  requirements?: unknown;
  standards?: unknown;
}): Record<string, unknown> {
  return {
    coverage: options.coverage
      ? { available: true, map: options.coverage, source: 'fixture' }
      : { available: false, source: null },
    requirements: options.requirements
      ? { available: true, health: options.requirements, source: 'fixture' }
      : { available: false, source: null },
    standards: options.standards
      ? { available: true, summary: options.standards, source: 'fixture' }
      : { available: false, source: null }
  };
}

const META = { generatedAt: '2026-07-15T00:00:00.000Z', extensionVersion: '9.9.9', extensionCommit: 'abc1234' };

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-risk-ledger-'));
  tempDirs.push(dir);
  return dir;
}

describe('buildRiskLedger', () => {
  it('always parks the declared platform-proof risks as non-selectable (VHS-REQ-601.30)', () => {
    const ledger = buildRiskLedger(signalsFrom({}), META);
    // Even with no coverage/requirements/standards signals, the platform-proof
    // awareness list is present but never selectable and never nextTarget.
    for (const risk of PLATFORM_PROOF_RISKS) {
      const entry = ledger.entries.find((candidate: any) => candidate.id === risk.id);
      expect(entry).toBeDefined();
      expect(entry.dimension).toBe('platform-proof');
      expect(entry.selectable).toBe(false);
      expect(entry.linuxExecutable).toBe(false);
      expect(ledger.ranking.parked).toContain(risk.id);
      expect(ledger.ranking.selectable).not.toContain(risk.id);
    }
    expect(ledger.ranking.nextTarget).toBeNull();
  });

  it('frames platform-proof risk as a recurring per-release Windows re-validation sourced to the current tracking issue (VHS-REQ-601.30)', () => {
    // Windows comparison-runtime correctness is not a one-time close: it must be
    // re-validated on a Windows host every release. Guard the provenance so it
    // cannot silently drift back to stale/closed issue references.
    for (const risk of PLATFORM_PROOF_RISKS) {
      expect(risk.provenance).toBe('issue:#1316');
      expect(risk.title).toContain('per-release re-validation');
      expect(risk.suggestedAction).toContain('Re-validate');
    }
  });

  it('ranks coverage debt deterministically and picks the highest-debt requirement as nextTarget (VHS-REQ-601.30)', () => {
    const ledger = buildRiskLedger(signalsFrom({ coverage: COVERAGE_WITH_DEBT, requirements: HEALTHY_HEALTH }), META);
    // VHS-REQ-100 (debt 160) outranks VHS-REQ-200 (debt 16); platform-proof is HIGH
    // but parked, so the selectable nextTarget is the top coverage-debt entry.
    expect(ledger.ranking.nextTarget).toBe('coverage/debt/VHS-REQ-100');
    const first = ledger.ranking.selectable[0];
    expect(first).toBe('coverage/debt/VHS-REQ-100');
    const req100 = ledger.entries.find((entry: any) => entry.id === 'coverage/debt/VHS-REQ-100');
    const req200 = ledger.entries.find((entry: any) => entry.id === 'coverage/debt/VHS-REQ-200');
    expect(req100.severityTier).toBe('MEDIUM');
    expect(req100.severityScore).toBeGreaterThan(req200.severityScore);
    expect(req100.requirementIds).toEqual(['VHS-REQ-100']);
  });

  it('promotes a structural-integrity failure to a selectable CRITICAL nextTarget (VHS-REQ-601.30)', () => {
    const ledger = buildRiskLedger(
      signalsFrom({
        coverage: COVERAGE_WITH_DEBT,
        requirements: { integrity: { success: false, violationCount: 3 }, attention: [] }
      }),
      META
    );
    expect(ledger.ranking.nextTarget).toBe('verification/structural-integrity');
    const entry = ledger.entries.find((candidate: any) => candidate.id === 'verification/structural-integrity');
    expect(entry.severityTier).toBe('CRITICAL');
    expect(entry.selectable).toBe(true);
    expect(hasSelectableHighRisk(ledger)).toBe(true);
  });

  it('emits HIGH unlinked and MEDIUM uncited-criteria verification entries but defers coverage-risk to the coverage dimension (VHS-REQ-601.30)', () => {
    const entries = buildVerificationEntries({
      integrity: { success: true, violationCount: 0 },
      attention: [
        {
          reqId: 'VHS-REQ-321',
          criteriaUncited: 4,
          attentionReasons: [
            { reasonId: 'unlinked' },
            { reasonId: 'uncited-criteria', count: 4 },
            { reasonId: 'coverage-risk', files: ['x.ts'] }
          ]
        }
      ]
    });
    const ids = entries.map((entry: any) => entry.id);
    expect(ids).toContain('verification/unlinked/VHS-REQ-321');
    expect(ids).toContain('verification/uncited-criteria/VHS-REQ-321');
    // coverage-risk is owned by the coverage dimension (dedup): no verification entry.
    expect(ids.some((id: string) => id.includes('coverage-risk'))).toBe(false);
    expect(entries.find((entry: any) => entry.id === 'verification/unlinked/VHS-REQ-321').severityTier).toBe('HIGH');
  });

  it('builds HIGH standards entries from findings and FAIL gate profiles (VHS-REQ-601.30)', () => {
    const entries = buildStandardsEntries({
      directChecks: [{ name: 'requirements_quality', requirementsQuality: { ok: false, findingCount: 2 } }],
      profiles: [
        { profile: 'release-gate', status: 'FAIL' },
        { profile: 'quick-triage', status: 'PASS' }
      ]
    });
    const ids = entries.map((entry: any) => entry.id);
    expect(ids).toContain('standards/requirements-quality/requirements_quality');
    expect(ids).toContain('standards/gate/release-gate');
    expect(ids).not.toContain('standards/gate/quick-triage');
    expect(entries.every((entry: any) => entry.dimension === 'requirement-quality')).toBe(true);
  });

  it('reports unavailable standards without throwing (graceful-degrade) (VHS-REQ-601.30)', () => {
    expect(buildStandardsEntries(undefined)).toEqual([]);
    const ledger = buildRiskLedger(signalsFrom({ coverage: COVERAGE_WITH_DEBT, requirements: HEALTHY_HEALTH }), META);
    expect(ledger.inputs.standards.available).toBe(false);
  });

  it('exposes a stable top-level envelope with schema, inputs, ranking, and counts (VHS-REQ-601.30)', () => {
    const ledger = buildRiskLedger(signalsFrom({ coverage: COVERAGE_WITH_DEBT, requirements: HEALTHY_HEALTH }), META);
    expect(Object.keys(ledger)).toEqual([
      '$schema',
      'schemaVersion',
      'generatedAt',
      'extensionVersion',
      'extensionCommit',
      'inputs',
      'entries',
      'ranking',
      'countsByDimension',
      'countsByTier'
    ]);
    expect(ledger.$schema).toBe(RISK_LEDGER_SCHEMA_ID);
    expect(ledger.schemaVersion).toBe(SCHEMA_VERSION);
    expect(ledger.countsByDimension['platform-proof']).toBe(PLATFORM_PROOF_RISKS.length);
  });

  it('caps coverage-debt entries to maxCoverageDebtEntries (VHS-REQ-601.30)', () => {
    const many = {
      riskThreshold: 50,
      mappedBelowThreshold: [],
      zeroCoverageSupportingRequirements: [],
      byRequirement: Array.from({ length: 8 }, (_, index) => ({
        reqId: `VHS-REQ-${100 + index}`,
        fileCount: 1,
        missingLines: 8 - index,
        missingBranches: 0,
        missingFunctions: 0,
        files: ['f.ts']
      }))
    };
    const entries = buildCoverageEntries(many, { maxCoverageDebtEntries: 3 });
    expect(entries).toHaveLength(3);
    // Highest debt first (VHS-REQ-100 has missingLines 8).
    expect(entries[0].id).toBe('coverage/debt/VHS-REQ-100');
  });
});

describe('buildRiskLedger rendering and CLI', () => {
  it('renders a markdown ranking table (VHS-REQ-601)', () => {
    const ledger = buildRiskLedger(signalsFrom({ coverage: COVERAGE_WITH_DEBT, requirements: HEALTHY_HEALTH }), META);
    const markdown = renderMarkdown(ledger);
    expect(markdown).toContain('# Risk Ledger');
    expect(markdown).toContain('| Rank | ID | Dimension | Tier | Score | Selectable | Title |');
    expect(markdown).toContain('coverage/debt/VHS-REQ-100');
  });

  it('renders a schema with the ledger enums and optional provenance (VHS-REQ-601)', () => {
    const schema = JSON.parse(renderSchema());
    expect(schema.$id).toBe(RISK_LEDGER_SCHEMA_ID);
    expect(schema.properties.entries.items.properties.dimension.enum).toEqual(DIMENSIONS);
    const withProvenance = JSON.parse(renderSchema({ provenance: { generatedAt: 'x' } }));
    expect(withProvenance['x-vi-history-suite-provenance']).toEqual({ generatedAt: 'x' });
  });

  it('keeps emitted JSON aligned with the published schema contract (VHS-REQ-601)', () => {
    const ledger = buildRiskLedger(
      signalsFrom({ coverage: COVERAGE_WITH_DEBT, requirements: HEALTHY_HEALTH }),
      META
    ) as Record<string, unknown>;
    const schema = JSON.parse(renderSchema()) as {
      required: string[];
      properties: {
        $schema: { const: string };
        schemaVersion: { const: number };
        entries: { items: { required: string[] } };
        ranking: { required: string[] };
      };
    };

    // Top-level required keys are all present and self-describing.
    expect(schema.required.filter((key) => !(key in ledger))).toEqual([]);
    expect(ledger.$schema).toBe(schema.properties.$schema.const);
    expect(ledger.$schema).toBe(RISK_LEDGER_SCHEMA_ID);
    expect(ledger.schemaVersion).toBe(schema.properties.schemaVersion.const);
    expect(ledger.schemaVersion).toBe(SCHEMA_VERSION);

    // Every entry record carries the schema's required entry keys.
    const entries = ledger.entries as Array<Record<string, unknown>>;
    expect(entries.length).toBeGreaterThan(0);
    const entryRequired = schema.properties.entries.items.required;
    for (const entry of entries) {
      expect(entryRequired.filter((key) => !(key in entry))).toEqual([]);
    }

    // The ranking sub-packet matches its required contract.
    const ranking = ledger.ranking as Record<string, unknown>;
    expect(schema.properties.ranking.required.filter((key) => !(key in ranking))).toEqual([]);
  });

  it('parseArgs rejects multiple output modes and unknown flags (VHS-REQ-601)', () => {
    expect(() => parseArgs(['--json', '--markdown'])).toThrow(/only one output mode/);
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown argument/);
    expect(parseArgs(['--strict', '--max-coverage-debt-entries', '5']).maxCoverageDebtEntries).toBe(5);
  });

  it('parseArgs rejects an invalid --max-coverage-debt-entries instead of yielding NaN (#2115)', () => {
    // An unvalidated Number(value) would produce NaN, which `?? default` does not
    // catch and slice(0, NaN) treats as 0 -> every coverage-debt row silently
    // dropped. These must throw a clear error rather than parse.
    expect(() => parseArgs(['--max-coverage-debt-entries', 'abc'])).toThrow(
      /Invalid --max-coverage-debt-entries value 'abc'\. Use a positive integer\./
    );
    expect(() => parseArgs(['--max-coverage-debt-entries', '3.5'])).toThrow(/positive integer/);
    expect(() => parseArgs(['--max-coverage-debt-entries', '0'])).toThrow(/positive integer/);
    expect(() => parseArgs(['--max-coverage-debt-entries', '-2'])).toThrow(/positive integer/);
    // A valid positive integer still parses.
    expect(parseArgs(['--max-coverage-debt-entries', '1']).maxCoverageDebtEntries).toBe(1);
  });

  it('resolveOutputPath rejects empty, absolute, and escaping paths (VHS-REQ-601)', () => {
    const cwd = makeTempDir();
    expect(() => resolveOutputPath(cwd, '')).toThrow(/non-empty/);
    expect(() => resolveOutputPath(cwd, '/etc/passwd')).toThrow(/relative path/);
    expect(() => resolveOutputPath(cwd, '../escape.json')).toThrow(/inside the working directory/);
    expect(resolveOutputPath(cwd, 'evidence/risk.json')).toBe(path.join(cwd, 'evidence', 'risk.json'));
  });

  it('main writes JSON to --output and stays advisory (exit 0) when only parked/MEDIUM risk exists (VHS-REQ-601.30)', () => {
    const cwd = makeTempDir();
    const outputs: string[] = [];
    const code = main(['--json', '--output', 'evidence/risk-ledger.json'], {
      cwd,
      coverage: undefined,
      // Inject in-process signal generators so no real coverage/requirements files are needed.
      generateCoverageMap: () => COVERAGE_WITH_DEBT,
      verifyRequirementsHealth: () => HEALTHY_HEALTH,
      getPackageVersion: () => '9.9.9',
      getGitCommit: () => 'abc1234',
      now: () => new Date('2026-07-15T00:00:00.000Z'),
      stdout: { write: (text: string) => outputs.push(text) },
      stderr: { write: (text: string) => outputs.push(text) }
    });
    expect(code).toBe(0);
    const written = JSON.parse(
      fs.readFileSync(path.join(cwd, 'evidence', 'risk-ledger.json'), 'utf8')
    );
    expect(written.ranking.nextTarget).toBe('coverage/debt/VHS-REQ-100');
    expect(written.inputs.coverage.available).toBe(true);
    expect(outputs.join('')).toContain('[risk-ledger] Wrote evidence/risk-ledger.json');
  });

  it('main --strict exits 1 when a selectable HIGH standards risk exists (VHS-REQ-601.30)', () => {
    const cwd = makeTempDir();
    const standardsPath = path.join(cwd, 'audit-summary.json');
    fs.writeFileSync(
      standardsPath,
      JSON.stringify({ directChecks: [{ name: 'rq', requirementsQuality: { ok: false, findingCount: 1 } }], profiles: [] }),
      'utf8'
    );
    const code = main(['--strict', '--standards-summary', 'audit-summary.json'], {
      cwd,
      generateCoverageMap: () => COVERAGE_WITH_DEBT,
      verifyRequirementsHealth: () => HEALTHY_HEALTH,
      getPackageVersion: () => '9.9.9',
      getGitCommit: () => 'abc1234',
      now: () => new Date('2026-07-15T00:00:00.000Z'),
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });
    expect(code).toBe(1);
  });
});

// Criterion coverage: VHS-REQ-601.31 — the risk ledger surfaces real-runtime
// validation freshness from a committed runtime-validation ledger; tracks not
// validated at the current build become selectable re-validation risks.
describe('buildRuntimeFidelityEntries (VHS-REQ-601.31)', () => {
  const {
    buildRuntimeFidelityEntries,
    loadRuntimeValidationSignal
  } = ledgerModule as unknown as {
    buildRuntimeFidelityEntries: (manifest: unknown, currentVersion: string) => any[];
    loadRuntimeValidationSignal: (cwd: string, deps?: Record<string, unknown>) => any;
  };

  const MANIFEST = {
    schemaVersion: 1,
    tracks: [
      { trackId: 'linux-host-native', linuxExecutable: true, lastValidatedVersion: '1.33.2', evidence: 'issue:#1317' },
      { trackId: 'linux-container-2026q1', linuxExecutable: true, lastValidatedVersion: '1.33.2', evidence: 'issue:#1317' }
    ]
  };

  it('emits no entries when every track is validated at the current build (VHS-REQ-601.31)', () => {
    expect(buildRuntimeFidelityEntries(MANIFEST, '1.33.2')).toEqual([]);
  });

  it('emits a selectable MEDIUM re-validation risk per stale Linux track at a newer build (VHS-REQ-601.31)', () => {
    const entries = buildRuntimeFidelityEntries(MANIFEST, '1.34.0');
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.dimension).toBe('runtime-fidelity');
      expect(entry.severityTier).toBe('MEDIUM');
      expect(entry.selectable).toBe(true);
      expect(entry.linuxExecutable).toBe(true);
      expect(entry.requirementIds).toContain('VHS-REQ-621');
    }
    expect(entries[0].id).toBe('runtime-fidelity/linux-host-native');
    expect(entries[0].title).toContain('1.33.2');
    expect(entries[0].title).toContain('1.34.0');
  });

  it('ignores non-Linux-executable tracks and malformed rows (VHS-REQ-601.31)', () => {
    const entries = buildRuntimeFidelityEntries(
      {
        tracks: [
          { trackId: 'windows-host-native', linuxExecutable: false, lastValidatedVersion: '1.0.0' },
          { linuxExecutable: true, lastValidatedVersion: '1.0.0' },
          null
        ]
      },
      '1.34.0'
    );
    expect(entries).toEqual([]);
  });

  it('treats a never-validated track as stale with a <never> marker (VHS-REQ-601.31)', () => {
    const entries = buildRuntimeFidelityEntries(
      { tracks: [{ trackId: 'linux-container-new', linuxExecutable: true }] },
      '1.34.0'
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toContain('<never>');
  });

  it('graceful-degrades to no entries when the manifest is missing or malformed (VHS-REQ-601.31)', () => {
    expect(buildRuntimeFidelityEntries(undefined, '1.34.0')).toEqual([]);
    expect(buildRuntimeFidelityEntries({}, '1.34.0')).toEqual([]);
    expect(buildRuntimeFidelityEntries({ tracks: 'nope' }, '1.34.0')).toEqual([]);
  });

  it('loadRuntimeValidationSignal reports available:false without throwing when the ledger is absent (VHS-REQ-601.31)', () => {
    const signal = loadRuntimeValidationSignal(makeTempDir());
    expect(signal.available).toBe(false);
    expect(signal.source).toBe('docs/requirements/runtime-validation-ledger.json');
  });

  it('the ledger integrates a stale runtime track as the nextTarget when no higher risk exists (VHS-REQ-601.31)', () => {
    const ledger = buildRiskLedger(
      {
        coverage: { available: false, source: null },
        requirements: { available: true, health: HEALTHY_HEALTH, source: 'fixture' },
        standards: { available: false, source: null },
        runtimeValidation: { available: true, manifest: MANIFEST, source: 'fixture' }
      },
      { ...META, extensionVersion: '1.34.0' }
    );
    expect(ledger.countsByDimension['runtime-fidelity']).toBe(2);
    // Same-tier runtime-fidelity entries tie-break alphabetically by id, so the
    // container track sorts ahead of the host-native track.
    expect(ledger.ranking.nextTarget).toBe('runtime-fidelity/linux-container-2026q1');
    expect(ledger.inputs.runtimeValidation.available).toBe(true);
  });
});

describe('buildBoxProvenanceEntries (VHS-REQ-666)', () => {
  const {
    buildBoxProvenanceEntries,
    loadBoxManifestSignal
  } = ledgerModule as unknown as {
    buildBoxProvenanceEntries: (boxManifest: unknown, runtimeManifest: unknown) => any[];
    loadBoxManifestSignal: (cwd: string, deps?: Record<string, unknown>) => any;
  };

  // recordedForVersion deliberately lags: the box is sha256-identified, so a
  // version bump with an unchanged box must NOT fire the dimension (#1538).
  const BOX = { schemaVersion: 1, sha256: 'a'.repeat(64), recordedForVersion: '1.33.2' };
  const gatingWith = (boxSha256?: string) => ({
    tracks: [{ trackId: 'vagrant-win-x86-hostnative', releaseGating: true, ...(boxSha256 ? { boxSha256 } : {}) }]
  });

  it('emits no entries when a release-gating boxSha256 matches the committed manifest', () => {
    expect(buildBoxProvenanceEntries(BOX, gatingWith('a'.repeat(64)))).toEqual([]);
  });

  it('does NOT fire on a version bump with an unchanged box (no version keying) (#1538)', () => {
    // recordedForVersion 1.33.2 vs a newer build, but the gating boxSha256 matches -> no risk.
    expect(buildBoxProvenanceEntries(BOX, gatingWith('a'.repeat(64)))).toEqual([]);
    // Transition: no gating track records a boxSha256 yet -> no risk.
    expect(buildBoxProvenanceEntries(BOX, gatingWith())).toEqual([]);
  });

  it('emits one selectable MEDIUM box-provenance risk on genuine binding drift', () => {
    const entries = buildBoxProvenanceEntries(BOX, gatingWith('b'.repeat(64)));
    expect(entries).toHaveLength(1);
    expect(entries[0].dimension).toBe('box-provenance');
    expect(entries[0].severityTier).toBe('MEDIUM');
    expect(entries[0].selectable).toBe(true);
    expect(entries[0].id).toBe('box-provenance/box-manifest');
    expect(entries[0].requirementIds).toContain('VHS-REQ-666');
    expect(entries[0].title).toContain('does not match');
    expect(entries[0].title).toContain('vagrant-win-x86-hostnative');
  });

  it('graceful-degrades to no entries when the box manifest has no sha256 or is absent', () => {
    expect(buildBoxProvenanceEntries({ recordedForVersion: '1.33.2' }, gatingWith('b'.repeat(64)))).toEqual([]);
    expect(buildBoxProvenanceEntries(undefined, gatingWith('b'.repeat(64)))).toEqual([]);
    expect(buildBoxProvenanceEntries(null, gatingWith('b'.repeat(64)))).toEqual([]);
  });

  it('loadBoxManifestSignal reports available:false without throwing when the manifest is absent', () => {
    const signal = loadBoxManifestSignal(makeTempDir());
    expect(signal.available).toBe(false);
    expect(signal.source).toBe('vagrant/box-manifest.json');
  });

  it('the ledger integrates a genuine box-binding mismatch as a selectable box-provenance entry', () => {
    const ledger = buildRiskLedger(
      {
        coverage: { available: false, source: null },
        requirements: { available: true, health: HEALTHY_HEALTH, source: 'fixture' },
        standards: { available: false, source: null },
        boxManifest: { available: true, manifest: BOX, source: 'fixture' },
        runtimeValidation: { available: true, manifest: gatingWith('b'.repeat(64)), source: 'fixture' }
      },
      { ...META, extensionVersion: '1.34.0' }
    );
    expect(ledger.countsByDimension['box-provenance']).toBe(1);
    expect(ledger.inputs.boxManifest.available).toBe(true);
  });
});

describe('buildRiskLedger coverage/standards entry edge cases (VHS-REQ-601.30)', () => {
  it('emits mapped-below and zero-coverage-supporting entries and skips zero-debt requirement rows', () => {
    const entries = buildCoverageEntries({
      riskThreshold: 80,
      mappedBelowThreshold: [{ path: 'src/a.ts', requirementIds: ['VHS-REQ-100'] }],
      zeroCoverageSupportingRequirements: [{ path: 'src/b.ts', requirementIds: ['VHS-REQ-200'] }],
      byRequirement: [
        { reqId: 'VHS-REQ-300', fileCount: 1, missingLines: 5, missingBranches: 0, missingFunctions: 0, files: ['src/c.ts'] },
        { reqId: 'VHS-REQ-400', fileCount: 1, missingLines: 0, missingBranches: 0, missingFunctions: 0, files: ['src/d.ts'] }
      ]
    });
    const ids = entries.map((entry: any) => entry.id);
    expect(ids).toContain('coverage/mapped-below/src/a.ts');
    expect(ids).toContain('coverage/zero-supporting/src/b.ts');
    expect(ids).toContain('coverage/debt/VHS-REQ-300');
    // The zero-debt requirement row is skipped by the `debt <= 0` continue.
    expect(ids).not.toContain('coverage/debt/VHS-REQ-400');
    const mappedBelow = entries.find((entry: any) => entry.id === 'coverage/mapped-below/src/a.ts');
    expect(mappedBelow.severityTier).toBe('HIGH');
    expect(mappedBelow.requirementIds).toEqual(['VHS-REQ-100']);
  });

  it('emits MEDIUM standards gate-detail entries for non-PASS gates or missing proof only', () => {
    const entries = buildStandardsEntries({
      directChecks: [],
      profiles: [],
      standardsGateDetailSummary: [
        { gate: 'g-fail', status: 'FAIL', missingProof: [] },
        { gate: 'g-missing', status: 'PASS', missingProof: ['proof-1', 'proof-2'] },
        { gate: 'g-ok', status: 'PASS', missingProof: [] }
      ]
    });
    const ids = entries.map((entry: any) => entry.id);
    expect(ids).toContain('standards/gate-detail/g-fail');
    expect(ids).toContain('standards/gate-detail/g-missing');
    // A passing gate with no missing proof produces no entry.
    expect(ids).not.toContain('standards/gate-detail/g-ok');
    const missing = entries.find((entry: any) => entry.id === 'standards/gate-detail/g-missing');
    expect(missing.severityTier).toBe('MEDIUM');
    expect(missing.severityScore).toBeGreaterThan(0);
  });
});

describe('buildRiskLedger signal loading (VHS-REQ-601.30)', () => {
  it('loadCoverageSignal reads an explicit coverage JSON path and degrades on read or generate failure', () => {
    const ok = loadCoverageSignal('/cwd', {
      coverageJsonPath: 'cov.json',
      readFile: () => JSON.stringify(COVERAGE_WITH_DEBT)
    });
    expect(ok).toMatchObject({ available: true, source: 'cov.json' });
    expect(ok.map.riskThreshold).toBe(50);

    const badRead = loadCoverageSignal('/cwd', {
      coverageJsonPath: 'cov.json',
      readFile: () => {
        throw new Error('read failed');
      }
    });
    expect(badRead).toMatchObject({ available: false, source: 'cov.json' });

    const badGenerate = loadCoverageSignal('/cwd', {
      generateCoverageMap: () => {
        throw new Error('generate failed');
      }
    });
    expect(badGenerate).toMatchObject({ available: false, source: 'in-process:coverage-map' });
  });

  it('loadRequirementsSignal reads an explicit requirements JSON path and degrades on failure', () => {
    const ok = loadRequirementsSignal('/cwd', {
      requirementsJsonPath: 'req.json',
      readFile: () => JSON.stringify(HEALTHY_HEALTH)
    });
    expect(ok).toMatchObject({ available: true, source: 'req.json' });

    const badRead = loadRequirementsSignal('/cwd', {
      requirementsJsonPath: 'req.json',
      readFile: () => {
        throw new Error('read failed');
      }
    });
    expect(badRead).toMatchObject({ available: false, source: 'req.json' });

    const badVerify = loadRequirementsSignal('/cwd', {
      verifyRequirementsHealth: () => {
        throw new Error('verify failed');
      }
    });
    expect(badVerify).toMatchObject({ available: false, source: 'in-process:requirements-verify' });
  });

  it('loadStandardsSignal degrades gracefully with no path, a read failure, or a valid summary', () => {
    expect(loadStandardsSignal('/cwd', {})).toMatchObject({ available: false, source: null });

    const badRead = loadStandardsSignal('/cwd', {
      standardsSummaryPath: 'audit.json',
      readFile: () => {
        throw new Error('read failed');
      }
    });
    expect(badRead).toMatchObject({ available: false, source: 'audit.json' });

    const ok = loadStandardsSignal('/cwd', {
      standardsSummaryPath: 'audit.json',
      readFile: () => '{"directChecks":[]}'
    });
    expect(ok).toMatchObject({ available: true, source: 'audit.json' });
  });
});

describe('buildRiskLedger main output modes (VHS-REQ-601.30)', () => {
  const injectedSignals = {
    generateCoverageMap: () => COVERAGE_WITH_DEBT,
    verifyRequirementsHealth: () => HEALTHY_HEALTH,
    getPackageVersion: () => '9.9.9',
    getGitCommit: () => 'abc1234',
    now: () => new Date('2026-07-15T00:00:00.000Z')
  };

  it('main renders the JSON schema under --schema without loading signals', () => {
    const out: string[] = [];
    const code = main(['--schema'], {
      stdout: { write: (text: string) => out.push(text) },
      stderr: { write: () => undefined }
    });
    expect(code).toBe(0);
    expect(out.join('')).toContain(RISK_LEDGER_SCHEMA_ID);
  });

  it('main renders a markdown ranking table under --markdown', () => {
    const out: string[] = [];
    const code = main(['--markdown'], {
      cwd: makeTempDir(),
      ...injectedSignals,
      stdout: { write: (text: string) => out.push(text) },
      stderr: { write: () => undefined }
    });
    expect(code).toBe(0);
    expect(out.join('')).toContain('# Risk Ledger');
    expect(out.join('')).toContain('coverage/debt/VHS-REQ-100');
  });

  it('main prints a text summary reporting no selectable target when only parked risk exists', () => {
    const cwd = makeTempDir();
    // A real package.json exercises the default getPackageVersion read path.
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ version: '7.7.7' }), 'utf8');
    const out: string[] = [];
    const code = main([], {
      cwd,
      // Only healthy signals + parked platform-proof risk -> no selectable target.
      generateCoverageMap: () => ({
        riskThreshold: 80,
        mappedBelowThreshold: [],
        zeroCoverageSupportingRequirements: [],
        byRequirement: []
      }),
      verifyRequirementsHealth: () => HEALTHY_HEALTH,
      // getPackageVersion intentionally NOT injected: exercise the real fs read.
      getGitCommit: () => 'abc1234',
      now: () => new Date('2026-07-15T00:00:00.000Z'),
      stdout: { write: (text: string) => out.push(text) },
      stderr: { write: () => undefined }
    });
    expect(code).toBe(0);
    const text = out.join('');
    expect(text).toContain('Next target: none');
    expect(text).toContain('Parked (not auto-selectable)');
  });

  it('main falls back to a 0.0.0 extension version when no package.json is present', () => {
    const cwd = makeTempDir(); // empty temp dir: getPackageVersion read fails -> 0.0.0
    const out: string[] = [];
    const code = main(['--json'], {
      cwd,
      generateCoverageMap: () => ({
        riskThreshold: 80,
        mappedBelowThreshold: [],
        zeroCoverageSupportingRequirements: [],
        byRequirement: []
      }),
      verifyRequirementsHealth: () => HEALTHY_HEALTH,
      getGitCommit: () => 'abc1234',
      now: () => new Date('2026-07-15T00:00:00.000Z'),
      stdout: { write: (text: string) => out.push(text) },
      stderr: { write: () => undefined }
    });
    expect(code).toBe(0);
    expect(JSON.parse(out.join('')).extensionVersion).toBe('0.0.0');
  });

  it('renderSummary reports the no-selectable-target line directly for a parked-only ledger', () => {
    const ledger = buildRiskLedger(signalsFrom({}), META);
    const summary = renderSummary(ledger);
    expect(summary).toContain('Next target: none (no selectable Linux-executable risk).');
  });
});
