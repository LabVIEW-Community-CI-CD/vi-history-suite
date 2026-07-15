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
  PLATFORM_PROOF_RISKS: Array<{ id: string }>;
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

  it('parseArgs rejects multiple output modes and unknown flags (VHS-REQ-601)', () => {
    expect(() => parseArgs(['--json', '--markdown'])).toThrow(/only one output mode/);
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown argument/);
    expect(parseArgs(['--strict', '--max-coverage-debt-entries', '5']).maxCoverageDebtEntries).toBe(5);
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
