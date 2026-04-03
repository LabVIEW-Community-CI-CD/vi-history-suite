import { describe, expect, it } from 'vitest';

import {
  getDefaultReviewScenarioForHarness,
  getReviewScenarioDefinition,
  listReviewScenarios,
  validateReviewScenarioEvidence
} from '../../src/scenarios/reviewScenarioRegistry';

describe('reviewScenarioRegistry', () => {
  it('returns the active canonical scenario for the canonical harness', () => {
    expect(getDefaultReviewScenarioForHarness('HARNESS-VHS-001')).toMatchObject({
      id: 'SCENARIO-VHS-001',
      maturity: 'active',
      minimumCommitWindow: 3,
      minimumComparisonPairs: 2
    });
  });

  it('validates scenario evidence against the canonical harness contract', () => {
    const scenario = getReviewScenarioDefinition('SCENARIO-VHS-001');
    expect(
      validateReviewScenarioEvidence(scenario, {
        harnessId: 'HARNESS-VHS-001',
        repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        commitCount: 3,
        comparisonPairCount: 2
      })
    ).toEqual([]);

    expect(
      validateReviewScenarioEvidence(scenario, {
        harnessId: 'HARNESS-VHS-001',
        repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        commitCount: 2,
        comparisonPairCount: 1
      })
    ).toEqual([
      'Scenario SCENARIO-VHS-001 requires at least 3 commits, got 2.',
      'Scenario SCENARIO-VHS-001 requires at least 2 comparison pairs, got 1.'
    ]);
  });

  it('lists the modeled scenario inventory', () => {
    expect(listReviewScenarios().map((scenario) => scenario.id)).toEqual([
      'SCENARIO-VHS-001',
      'SCENARIO-VHS-002'
    ]);
  });
});
