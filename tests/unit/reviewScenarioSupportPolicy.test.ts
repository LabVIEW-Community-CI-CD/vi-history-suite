import { describe, expect, it } from 'vitest';

import {
  getDefaultReviewScenarioForHarness,
  getDefaultReviewScenarioForRepository,
  getReviewScenarioDefinition,
  listReviewScenarios,
  validateReviewScenarioEvidence
} from '../../src/scenarios/reviewScenarioRegistry';
import {
  classifyRepositorySupportPolicy,
  normalizeGitHubRepositoryUrl
} from '../../src/support/repositorySupportPolicy';

describe('review scenario registry and repository support policy (VHS-REQ-610 supporting evidence)', () => {
  it('classifies upstream, fork, local fixture, generic, and repo-agnostic support tiers', () => {
    expect(normalizeGitHubRepositoryUrl('git@github.com:NI/LabVIEW-Icon-Editor.git')).toBe(
      'https://github.com/ni/labview-icon-editor.git'
    );
    expect(
      classifyRepositorySupportPolicy('https://github.com/ni/labview-icon-editor.git')
    ).toMatchObject({
      tier: 'known-upstream',
      familyId: 'labview-icon-editor',
      allowCoreReviewActions: true,
      allowDecisionRecordActions: true,
      allowBenchmarkStatus: true
    });
    expect(
      classifyRepositorySupportPolicy('https://github.com/example/labview-icon-editor.git')
    ).toMatchObject({
      tier: 'known-fork',
      familyId: 'labview-icon-editor',
      supportLabel: 'Known-family fork: NI LabVIEW Icon Editor'
    });
    expect(classifyRepositorySupportPolicy('C:\\fixtures\\actor-framework', 'actor-framework')).toMatchObject({
      tier: 'known-upstream',
      familyId: 'actor-framework',
      supportLabel: 'Known local fixture: NI Actor Framework'
    });
    expect(classifyRepositorySupportPolicy('https://github.com/example/other-repo.git')).toMatchObject({
      tier: 'generic-repository',
      normalizedRepositoryUrl: 'https://github.com/example/other-repo.git'
    });
    expect(classifyRepositorySupportPolicy(undefined)).toMatchObject({
      tier: 'generic-repository',
      supportLabel: 'Repo-agnostic support'
    });
  });

  it('normalizes and classifies www.github.com remotes as canonical GitHub (VHS-REQ-610 supporting evidence)', () => {
    // www.github.com is a valid GitHub remote host (git redirects it); it must
    // normalize to the canonical github.com coordinates, not fall back to
    // generic-repository.
    expect(normalizeGitHubRepositoryUrl('https://www.github.com/ni/labview-icon-editor.git')).toBe(
      'https://github.com/ni/labview-icon-editor.git'
    );
    expect(normalizeGitHubRepositoryUrl('git@www.github.com:NI/LabVIEW-Icon-Editor.git')).toBe(
      'https://github.com/ni/labview-icon-editor.git'
    );
    expect(
      classifyRepositorySupportPolicy('https://www.github.com/ni/labview-icon-editor.git')
    ).toMatchObject({
      tier: 'known-upstream',
      familyId: 'labview-icon-editor'
    });
  });

  it('selects review scenarios and reports evidence contract mismatches', () => {
    const scenarios = listReviewScenarios();

    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      'SCENARIO-VHS-001',
      'SCENARIO-VHS-002'
    ]);
    expect(getReviewScenarioDefinition('SCENARIO-VHS-001')).toMatchObject({
      maturity: 'active',
      minimumCommitWindow: 3,
      minimumComparisonPairs: 2
    });
    expect(() => getReviewScenarioDefinition('missing')).toThrow(
      'Unknown review scenario: missing'
    );
    expect(getDefaultReviewScenarioForHarness('HARNESS-VHS-001')?.id).toBe('SCENARIO-VHS-001');
    expect(
      getDefaultReviewScenarioForRepository(
        'git@github.com:NI/LabVIEW-Icon-Editor.git',
        'Tooling/deployment/VIP_Pre-Install Custom Action.vi'
      )?.id
    ).toBe('SCENARIO-VHS-001');

    const repoAgnostic = getDefaultReviewScenarioForRepository(
      'https://github.com/example/other-repo.git',
      'Source/Other.vi'
    );
    expect(repoAgnostic).toMatchObject({
      id: 'SCENARIO-VHS-ANY',
      title: 'Repo-Agnostic VI Review',
      targetRelativePath: 'Source/Other.vi'
    });

    const mismatches = validateReviewScenarioEvidence(getReviewScenarioDefinition('SCENARIO-VHS-001'), {
      harnessId: 'wrong-harness',
      repositoryUrl: 'https://github.com/example/other-repo.git',
      targetRelativePath: 'Source/Other.vi',
      commitCount: 2,
      comparisonPairCount: 1
    });
    expect(mismatches).toEqual([
      'Scenario SCENARIO-VHS-001 requires harness HARNESS-VHS-001, got wrong-harness.',
      'Scenario SCENARIO-VHS-001 requires repository https://github.com/ni/labview-icon-editor.git, got https://github.com/example/other-repo.git.',
      'Scenario SCENARIO-VHS-001 requires target Tooling/deployment/VIP_Pre-Install Custom Action.vi, got Source/Other.vi.',
      'Scenario SCENARIO-VHS-001 requires at least 3 commits, got 2.',
      'Scenario SCENARIO-VHS-001 requires at least 2 comparison pairs, got 1.'
    ]);
  });
});
