import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const {
  computeMutationScore,
  aggregateRequirementHealth,
  summarizeRequirementHealth,
  verifyRequirementsHealth,
  renderSummary,
  renderStepSummary,
  main
} = require('../../scripts/verifyRequirementsHealth.js') as {
  computeMutationScore: (report: unknown) => {
    killed: number;
    timeout: number;
    survived: number;
    noCoverage: number;
    score: number | null;
  };
  aggregateRequirementHealth: (
    linkage: unknown,
    criteria: unknown,
    coverage: unknown
  ) => Array<{
    reqId: string;
    linkState: string;
    criteriaCited: number;
    criteriaTotal: number;
    criteriaUncited: number;
    coverageRiskFiles: string[];
    attention: boolean;
  }>;
  summarizeRequirementHealth: (result: unknown) => {
    status: string;
    healthy: boolean;
    attentionCount: number;
    reasonCounts: { structuralIntegrity: number; unlinked: number; uncitedCriteria: number; coverageRisk: number };
    unavailableSignals: string[];
  };
  verifyRequirementsHealth: (cwd?: string, deps?: Record<string, unknown>) => Record<string, unknown>;
  renderSummary: (result: unknown) => string;
  renderStepSummary: (result: unknown) => string;
  main: (argv?: string[], deps?: Record<string, unknown>) => number;
};

const LINKAGE = {
  total: 4,
  linked: ['VHS-REQ-001', 'VHS-REQ-004'],
  unlinked: [{ reqId: 'VHS-REQ-002', testReferences: ['tests/unit/b.test.ts'] }],
  manualOnly: ['VHS-REQ-003']
};

const CRITERIA = {
  totalRequirements: 4,
  totalCriteria: 5,
  citedCriteria: 2,
  uncitedCriteria: 3,
  requirements: [
    {
      reqId: 'VHS-REQ-001',
      criteriaCount: 2,
      criteria: [
        { criterionId: 'VHS-REQ-001.1', ordinal: 1, text: 'a', cited: true },
        { criterionId: 'VHS-REQ-001.2', ordinal: 2, text: 'b', cited: false }
      ]
    },
    {
      reqId: 'VHS-REQ-004',
      criteriaCount: 1,
      criteria: [{ criterionId: 'VHS-REQ-004.1', ordinal: 1, text: 'c', cited: true }]
    }
  ]
};

const CRITERIA_ALL_CITED = {
  totalRequirements: 4,
  totalCriteria: 3,
  citedCriteria: 3,
  uncitedCriteria: 0,
  requirements: [
    {
      reqId: 'VHS-REQ-001',
      criteriaCount: 2,
      criteria: [
        { criterionId: 'VHS-REQ-001.1', ordinal: 1, text: 'a', cited: true },
        { criterionId: 'VHS-REQ-001.2', ordinal: 2, text: 'b', cited: true }
      ]
    },
    {
      reqId: 'VHS-REQ-004',
      criteriaCount: 1,
      criteria: [{ criterionId: 'VHS-REQ-004.1', ordinal: 1, text: 'c', cited: true }]
    }
  ]
};

const INTEGRITY_PASS = { success: true, violationCount: 0, checks: [] };

const COVERAGE_WITH_RISK = {
  riskThreshold: 50,
  mappedBelowThreshold: [{ path: 'src/a.ts', requirementIds: ['VHS-REQ-001'] }]
};

const MUTATION = { killed: 40, timeout: 0, survived: 9, noCoverage: 0, score: 81.63 };

describe('requirement verification health (VHS-REQ-601)', () => {
  it('computes the Stryker mutation score from detected over valid mutants', () => {
    const report = {
      files: {
        'a.ts': {
          mutants: [{ status: 'Killed' }, { status: 'Survived' }, { status: 'Timeout' }]
        },
        'b.ts': {
          mutants: [{ status: 'NoCoverage' }, { status: 'Ignored' }, { status: 'CompileError' }]
        }
      }
    };

    const score = computeMutationScore(report);
    expect(score).toMatchObject({ killed: 1, timeout: 1, survived: 1, noCoverage: 1 });
    // detected = 2 (killed + timeout); valid = 4 (detected + survived + noCoverage) => 50%.
    expect(score.score).toBe(50);
  });

  it('returns a null score when there are no valid mutants', () => {
    expect(computeMutationScore({ files: {} }).score).toBeNull();
  });

  it('aggregates per-requirement link state, criterion citation, and coverage risk', () => {
    const requirements = aggregateRequirementHealth(LINKAGE, CRITERIA, COVERAGE_WITH_RISK);

    expect(requirements.map((entry) => entry.reqId)).toEqual([
      'VHS-REQ-001',
      'VHS-REQ-002',
      'VHS-REQ-003',
      'VHS-REQ-004'
    ]);

    const alpha = requirements.find((entry) => entry.reqId === 'VHS-REQ-001');
    expect(alpha).toMatchObject({
      linkState: 'linked',
      criteriaCited: 1,
      criteriaTotal: 2,
      criteriaUncited: 1
    });
    expect(alpha?.coverageRiskFiles).toEqual(['src/a.ts']);
    expect(alpha?.attention).toBe(true); // coverage risk

    expect(requirements.find((entry) => entry.reqId === 'VHS-REQ-002')).toMatchObject({
      linkState: 'unlinked',
      attention: true
    });
    expect(requirements.find((entry) => entry.reqId === 'VHS-REQ-003')).toMatchObject({
      linkState: 'manual',
      attention: false
    });
    expect(requirements.find((entry) => entry.reqId === 'VHS-REQ-004')).toMatchObject({
      attention: false
    });
  });

  it('reports ATTENTION with unlinked and coverage-risk requirements (VHS-REQ-601.17)', () => {
    const result = verifyRequirementsHealth('/repo', {
      linkage: LINKAGE,
      criteria: CRITERIA,
      integrity: INTEGRITY_PASS,
      coverage: COVERAGE_WITH_RISK,
      mutation: MUTATION
    });

    expect(result.activeRequirements).toBe(4);
    expect(result.healthy).toBe(false);
    expect((result.attention as unknown[]).length).toBe(2);
    expect(result.coverage).toMatchObject({ available: true, requirementsWithRisk: 1 });
    expect(result.mutation).toMatchObject({ available: true, score: 81.63 });
    expect(result.summary).toEqual({
      status: 'ATTENTION',
      healthy: false,
      attentionCount: 2,
      reasonCounts: { structuralIntegrity: 0, unlinked: 1, uncitedCriteria: 1, coverageRisk: 1 },
      unavailableSignals: []
    });
  });

  it('summarizes structural integrity failures without requiring per-requirement attention', () => {
    expect(summarizeRequirementHealth({
      healthy: false,
      integrity: { success: false, violationCount: 2 },
      coverage: { available: true },
      mutation: { available: true },
      attention: []
    })).toEqual({
      status: 'ATTENTION',
      healthy: false,
      attentionCount: 0,
      reasonCounts: { structuralIntegrity: 1, unlinked: 0, uncitedCriteria: 0, coverageRisk: 0 },
      unavailableSignals: []
    });
  });

  it('reports ATTENTION when criterion citations are missing despite clean linkage and coverage (VHS-REQ-601)', () => {
    const result = verifyRequirementsHealth('/repo', {
      linkage: { total: 2, linked: ['VHS-REQ-001', 'VHS-REQ-004'], unlinked: [], manualOnly: [] },
      criteria: CRITERIA,
      integrity: INTEGRITY_PASS,
      coverage: { riskThreshold: 50, mappedBelowThreshold: [] },
      mutation: MUTATION
    });

    expect(result.healthy).toBe(false);
    expect((result.attention as unknown[]).length).toBe(1);
    const summary = renderSummary(result);
    expect(summary).toContain('Overall: ATTENTION');
    expect(summary).toContain('1 uncited criterion/criteria');
    expect(summary).toContain('does not fail CI');
  });

  it('reports HEALTHY when linkage, criterion citation, and coverage are clean', () => {
    const result = verifyRequirementsHealth('/repo', {
      linkage: { total: 2, linked: ['VHS-REQ-001', 'VHS-REQ-004'], unlinked: [], manualOnly: [] },
      criteria: CRITERIA_ALL_CITED,
      integrity: INTEGRITY_PASS,
      coverage: { riskThreshold: 50, mappedBelowThreshold: [] },
      mutation: MUTATION
    });

    expect(result.healthy).toBe(true);
    expect((result.attention as unknown[]).length).toBe(0);
    expect(renderSummary(result)).toContain('Overall: HEALTHY');
  });

  it('marks coverage and mutation unavailable when their artifacts are absent', () => {
    const result = verifyRequirementsHealth('/repo', {
      linkage: { total: 1, linked: ['VHS-REQ-001'], unlinked: [], manualOnly: [] },
      criteria: CRITERIA_ALL_CITED,
      integrity: INTEGRITY_PASS,
      coverage: null,
      mutation: null
    });

    expect(result.coverage).toEqual({ available: false });
    expect(result.mutation).toEqual({ available: false });
    expect(result.healthy).toBe(true);
    expect(result.summary).toEqual({
      status: 'HEALTHY',
      healthy: true,
      attentionCount: 0,
      reasonCounts: { structuralIntegrity: 0, unlinked: 0, uncitedCriteria: 0, coverageRisk: 0 },
      unavailableSignals: ['coverage', 'mutation']
    });
    expect(renderSummary(result)).toContain('Coverage risk: not available');
    expect(renderStepSummary(result)).toContain('Mutation (advisory): not available');
  });

  it('main writes the report and step summary and always returns 0 (advisory)', () => {
    const stdoutChunks: string[] = [];
    const summaryChunks: string[] = [];

    const code = main([], {
      linkage: LINKAGE,
      criteria: CRITERIA,
      integrity: INTEGRITY_PASS,
      coverage: COVERAGE_WITH_RISK,
      mutation: MUTATION,
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) },
      stepSummaryPath: '/tmp/summary.md',
      appendStepSummary: (_filePath: string, content: string) => summaryChunks.push(content)
    });

    expect(code).toBe(0);
    expect(stdoutChunks.join('')).toContain('[requirements-verify] Overall: ATTENTION');
    expect(summaryChunks.join('')).toContain('## Requirement Verification Health');
  });

  it('exits non-zero under --strict when requirement health is not green (VHS-REQ-601.18)', () => {
    const stdoutChunks: string[] = [];

    const code = main(['--strict'], {
      linkage: LINKAGE,
      criteria: CRITERIA,
      integrity: INTEGRITY_PASS,
      coverage: COVERAGE_WITH_RISK,
      mutation: MUTATION,
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) }
    });

    expect(code).toBe(1);
    expect(stdoutChunks.join('')).toContain('Strict mode: FAILING');
  });

  it('exits zero under --strict when requirement health is green', () => {
    const stdoutChunks: string[] = [];

    const code = main(['--strict'], {
      linkage: { total: 2, linked: ['VHS-REQ-001', 'VHS-REQ-004'], unlinked: [], manualOnly: [] },
      criteria: CRITERIA_ALL_CITED,
      integrity: INTEGRITY_PASS,
      coverage: { riskThreshold: 50, mappedBelowThreshold: [] },
      mutation: MUTATION,
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) }
    });

    expect(code).toBe(0);
    expect(stdoutChunks.join('')).toContain('Strict mode: requirement health is green.');
  });

  it('includes the compact summary in --json output', () => {
    const stdoutChunks: string[] = [];

    const code = main(['--json'], {
      linkage: LINKAGE,
      criteria: CRITERIA,
      integrity: INTEGRITY_PASS,
      coverage: COVERAGE_WITH_RISK,
      mutation: MUTATION,
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) }
    });

    const output = JSON.parse(stdoutChunks.join('')) as { summary: unknown };
    expect(code).toBe(0);
    expect(output.summary).toEqual({
      status: 'ATTENTION',
      healthy: false,
      attentionCount: 2,
      reasonCounts: { structuralIntegrity: 0, unlinked: 1, uncitedCriteria: 1, coverageRisk: 1 },
      unavailableSignals: []
    });
  });

  it('verifies the real repository aggregate is healthy', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const result = verifyRequirementsHealth(repoRoot) as {
      activeRequirements: number;
      integrity: { success: boolean };
      linkage: { unlinked: number };
      criteria: { total: number; uncited: number };
      summary: { status: string; attentionCount: number };
    };

    expect(result.activeRequirements).toBeGreaterThan(20);
    expect(result.integrity.success).toBe(true);
    expect(result.linkage.unlinked).toBe(0);
    expect(result.criteria.total).toBeGreaterThan(100);
    expect(result.criteria.uncited).toBe(0);
    expect(result.summary).toMatchObject({ status: 'HEALTHY', attentionCount: 0 });
  });
});
