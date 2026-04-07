import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('release governance package', () => {
  it('retains the semver decision framework and gitflow-lite branch/ci topology', () => {
    const rules = readJson<any>('docs/product/post-release-sustainment-rules.json');
    const adr = readText(
      'docs/architecture/adr/ADR-0030-semver-decision-framework-and-gitflow-lite-branch-ci-topology.md'
    );
    const adr2 = readText(
      'docs/architecture/adr/ADR-0031-finding-driven-adr-and-requirement-evolution.md'
    );
    const adr3 = readText(
      'docs/architecture/adr/ADR-0032-public-facade-github-workflow-responsibility-matrix.md'
    );
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');
    const program = readText(
      'docs/product/execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md'
    );
    const issue = readText(
      'docs/product/issues/ISSUE-0409-post-release-sustainment-and-release-cadence.md'
    );

    expect(rules.releaseCadence.semverDecisionFramework.defaultGovernanceBump).toBe('patch');
    expect(rules.releaseCadence.semverDecisionFramework.major).toContain(
      'breaks or removes a governed public or maintainer contract on purpose'
    );
    expect(rules.releaseCadence.semverDecisionFramework.minor).toContain(
      'adds a new governed capability or supported workflow without breaking the current exact released line'
    );
    expect(rules.releaseCadence.semverDecisionFramework.patch).toContain(
      'fixes or hardens an existing workflow, release rule, procedure, branch policy, or CI posture without breaking the exact released contract'
    );
    expect(rules.releaseCadence.versionLineContract.publicDefaultBranch).toBe('main');
    expect(rules.operatorSurfaceSustainment.branchModel.model).toBe('gitflow-lite');
    expect(rules.operatorSurfaceSustainment.branchModel.temporaryBranchPrefixes).toEqual([
      'feature/',
      'release/',
      'hotfix/'
    ]);
    expect(rules.operatorSurfaceSustainment.branchModel.laneResponsibilities.develop).toContain(
      'npm run design:gate'
    );
    expect(rules.operatorSurfaceSustainment.branchModel.laneResponsibilities['release/*']).toContain(
      'public-facade proof before merge to main'
    );
    expect(rules.operatorSurfaceSustainment.branchModel.laneResponsibilities.main).toContain(
      'exact SemVer tags only after merged main is green'
    );

    expect(adr).toContain('# ADR-0030: SemVer Decision Framework And Gitflow-Lite Branch/CI Topology');
    expect(adr).toContain('choose `major` for intentional breaking contract changes');
    expect(adr).toContain('choose `minor` for additive governed capability changes');
    expect(adr).toContain('choose `patch` for fixes, hardening, governance, documentation-package, or');
    expect(adr).toContain('keep the public GitHub default branch on `main`');
    expect(adr).toContain('`feature/*`');
    expect(adr).toContain('`release/*`');
    expect(adr).toContain('`hotfix/*`');
    expect(adr).toContain('`npm run design:gate`');
    expect(adr2).toContain('# ADR-0031: Finding-Driven ADR And Requirement Evolution');
    expect(adr2).toContain('every governed finding is classified for both requirement impact and ADR');
    expect(adr2).toContain('introduce a new ADR in the same slice');
    expect(adr3).toContain('# ADR-0032: Public Facade GitHub Workflow Responsibility Matrix');
    expect(adr3).toContain('Public Facade Package Preview');
    expect(adr3).toContain('Public Facade Linux Smoke');
    expect(adr3).toContain('do not create a `feature/*` push lane');
    expect(adr3).toContain('per-workflow/per-ref concurrency');

    expect(srs).toContain('public GitHub `main` remains the default branch and exact release branch');
    expect(srs).toContain('PR-driven focused admission on `feature/*`');
    expect(srs).toContain('push plus PR validation for `release/*` and `hotfix/*`');
    expect(srs).toContain('continuously classify current and future governed findings for ADR impact');
    expect(srs).toContain('governed public GitHub workflow matrix');
    expect(rtm).toContain('public GitHub `main` remains the default branch and exact release branch');
    expect(rtm).toContain('PR-driven focused admission on `feature/*`');
    expect(rtm).toContain('push plus PR validation for `release/*` and `hotfix/*`');
    expect(rtm).toContain('Continuously classify current and future governed findings for ADR impact');
    expect(rtm).toContain('Retain a governed public GitHub workflow matrix');
    expect(testPlan).toContain('public-default-branch');
    expect(testPlan).toContain('keeps GitHub `main` stable');
    expect(testPlan).toContain('PR-driven feature admission and push validation on `release/*` and');
    expect(testPlan).toContain('`hotfix/*`');
    expect(testPlan).toContain('finding-to-ADR discipline');
    expect(testPlan).toContain('`no-adr-impact`');
    expect(testPlan).toContain('TEST-UNIT-324');
    expect(testPlan).toContain('TEST-DOC-089');
    expect(rules.operatorSurfaceSustainment.branchModel.findingAdrDiscipline).toEqual(
      expect.arrayContaining([
        'every governed finding is classified before slice closeout as adr-update-required or no-adr-impact'
      ])
    );
    expect(rules.operatorSurfaceSustainment.publicWorkflowGovernance.workflows.packagePreview.responsibilities).toEqual(
      expect.arrayContaining(['npm run test:design-contract', 'preview VSIX packaging'])
    );
    expect(rules.operatorSurfaceSustainment.publicWorkflowGovernance.workflows.linuxSmoke.responsibilities).toEqual(
      expect.arrayContaining(['Docker Linux engine verification', 'npm run public:smoke:linux'])
    );

    expect(program).toContain('branch-model and lane-specific CI governance');
    expect(program).toContain('ADR evolution from governed findings');
    expect(program).toContain('explicit SemVer-decision rationale');
    expect(program).toContain('public GitHub workflow responsibility and churn-control governance');
    expect(issue).toContain('explicit major/minor/patch decision criteria');
    expect(issue).toContain('continuous refinement of ADR coverage from governed findings');
    expect(issue).toContain('branch-model and lane-specific CI/design-gate governance');
    expect(issue).toContain('workflow responsibility, trigger-boundary, and');
  });
});
