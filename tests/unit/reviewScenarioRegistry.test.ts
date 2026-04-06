import { describe, expect, it } from 'vitest';

import {
  getDefaultReviewScenarioForHarness,
  getDefaultReviewScenarioForRepository,
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
    expect(getDefaultReviewScenarioForHarness('HARNESS-VHS-999')).toBeUndefined();
  });

  it('matches the active canonical scenario across normalized upstream remote forms', () => {
    expect(
      getDefaultReviewScenarioForRepository(
        'git@github.com:ni/labview-icon-editor.git',
        'Tooling/deployment/VIP_Pre-Install Custom Action.vi'
      )
    ).toMatchObject({
      id: 'SCENARIO-VHS-001'
    });
  });

  it('falls back to a repo-agnostic active scenario when no canonical scenario matches', () => {
    expect(
      getDefaultReviewScenarioForRepository(
        'https://github.com/example/other.git',
        'Other.vi'
      )
    ).toMatchObject({
      id: 'SCENARIO-VHS-ANY',
      repositoryUrl: 'https://github.com/example/other.git',
      targetRelativePath: 'Other.vi',
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

    expect(
      validateReviewScenarioEvidence(scenario, {
        harnessId: 'HARNESS-VHS-999',
        repositoryUrl: 'https://github.com/example/other.git',
        targetRelativePath: 'Other.vi',
        commitCount: 3,
        comparisonPairCount: 2
      })
    ).toEqual([
      'Scenario SCENARIO-VHS-001 requires harness HARNESS-VHS-001, got HARNESS-VHS-999.',
      'Scenario SCENARIO-VHS-001 requires repository https://github.com/ni/labview-icon-editor.git, got https://github.com/example/other.git.',
      'Scenario SCENARIO-VHS-001 requires target Tooling/deployment/VIP_Pre-Install Custom Action.vi, got Other.vi.'
    ]);
  });

  it('lists the modeled scenario inventory', () => {
    expect(listReviewScenarios().map((scenario) => scenario.id)).toEqual([
      'SCENARIO-VHS-001',
      'SCENARIO-VHS-002'
    ]);
  });

  it('fails closed on unknown scenarios', () => {
    expect(() => getReviewScenarioDefinition('SCENARIO-VHS-404')).toThrow(
      'Unknown review scenario: SCENARIO-VHS-404'
    );
  });
});
