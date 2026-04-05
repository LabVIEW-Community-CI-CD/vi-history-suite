import { describe, expect, it } from 'vitest';

import {
  classifyRepositorySupportPolicy,
  normalizeGitHubRepositoryUrl
} from '../../src/support/repositorySupportPolicy';

describe('repositorySupportPolicy', () => {
  it('normalizes canonical GitHub remotes across https and ssh forms', () => {
    expect(normalizeGitHubRepositoryUrl('https://github.com/ni/labview-icon-editor')).toBe(
      'https://github.com/ni/labview-icon-editor.git'
    );
    expect(normalizeGitHubRepositoryUrl('git@github.com:ni/labview-icon-editor.git')).toBe(
      'https://github.com/ni/labview-icon-editor.git'
    );
    expect(
      normalizeGitHubRepositoryUrl('ssh://git@github.com/ni/actor-framework.git')
    ).toBe('https://github.com/ni/actor-framework.git');
  });

  it('classifies governed upstreams, governed-family forks, and unsupported repos', () => {
    expect(
      classifyRepositorySupportPolicy('https://github.com/ni/labview-icon-editor.git')
    ).toMatchObject({
      tier: 'governed-upstream',
      familyId: 'labview-icon-editor',
      allowCoreReviewActions: true,
      allowDecisionRecordActions: true,
      allowBenchmarkStatus: true,
      allowHumanReviewSubmission: true
    });

    expect(
      classifyRepositorySupportPolicy('git@github.com:svelderrainruiz/labview-icon-editor.git')
    ).toMatchObject({
      tier: 'governed-fork',
      familyId: 'labview-icon-editor',
      allowCoreReviewActions: true,
      allowDecisionRecordActions: false,
      allowBenchmarkStatus: false,
      allowHumanReviewSubmission: false
    });

    expect(
      classifyRepositorySupportPolicy('https://github.com/ni/actor-framework.git')
    ).toMatchObject({
      tier: 'governed-upstream',
      familyId: 'actor-framework',
      allowCoreReviewActions: true,
      allowDecisionRecordActions: false,
      allowBenchmarkStatus: false,
      allowHumanReviewSubmission: false
    });

    expect(
      classifyRepositorySupportPolicy('https://github.com/example/something-else.git')
    ).toMatchObject({
      tier: 'unsupported',
      allowCoreReviewActions: false,
      allowDecisionRecordActions: false,
      allowBenchmarkStatus: false,
      allowHumanReviewSubmission: false
    });
  });

  it('treats governed local fixture clones as in-family when the repo name matches a governed upstream', () => {
    expect(
      classifyRepositorySupportPolicy(
        'C:\\Users\\sveld\\AppData\\Local\\Temp\\VI History Suite Acceptance\\staged-assets\\labview-icon-editor-develop-e8945de7.bundle',
        'labview-icon-editor'
      )
    ).toMatchObject({
      tier: 'governed-upstream',
      familyId: 'labview-icon-editor',
      supportLabel: 'Governed local fixture: NI LabVIEW Icon Editor',
      allowCoreReviewActions: true,
      allowDecisionRecordActions: true,
      allowBenchmarkStatus: true,
      allowHumanReviewSubmission: true
    });

    expect(
      classifyRepositorySupportPolicy('/tmp/actor-framework.bundle', 'actor-framework')
    ).toMatchObject({
      tier: 'governed-upstream',
      familyId: 'actor-framework',
      supportLabel: 'Governed local fixture: NI Actor Framework',
      allowCoreReviewActions: true,
      allowDecisionRecordActions: false,
      allowBenchmarkStatus: false,
      allowHumanReviewSubmission: false
    });

    expect(
      classifyRepositorySupportPolicy('/tmp/something-else.bundle', 'something-else')
    ).toMatchObject({
      tier: 'unsupported',
      allowCoreReviewActions: false,
      allowDecisionRecordActions: false,
      allowBenchmarkStatus: false,
      allowHumanReviewSubmission: false
    });
  });
});
