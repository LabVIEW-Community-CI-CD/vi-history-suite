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
    expect(adr).toContain('`feature/*`');
    expect(adr).toContain('`release/*`');
    expect(adr).toContain('`hotfix/*`');
    expect(adr).toContain('`npm run design:gate`');

    expect(program).toContain('branch-model and lane-specific CI governance');
    expect(program).toContain('explicit SemVer-decision rationale');
    expect(issue).toContain('explicit major/minor/patch decision criteria');
    expect(issue).toContain('branch-model and lane-specific CI/design-gate governance');
  });
});
