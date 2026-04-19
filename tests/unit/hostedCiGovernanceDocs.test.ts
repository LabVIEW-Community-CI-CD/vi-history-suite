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

describe('hosted ci governance docs', () => {
  it('retains one hosted automation matrix across GitLab, public GitHub, and experiment lanes', () => {
    const matrix = readJson<any>('docs/product/hosted-ci-governance.json');
    const matrixDoc = readText('docs/product/hosted-ci-governance.md');
    const adr = readText(
      'docs/architecture/adr/ADR-0033-hosted-automation-governance-matrix-and-protection-semantics.md'
    );
    const gitlabCi = readText('.gitlab-ci.yml');
    const cmPlan = readText('docs/cm/cm-plan.md');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const releaseProcedure = readText('docs/release-procedure.md');
    const linuxBenchmarkWorkflow = readText('.github/workflows/linux-runtime-benchmark-experiment.yml');
    const windowsBenchmarkWorkflow = readText('.github/workflows/windows-runtime-benchmark-image.yml');

    expect(matrix.openingDecision).toEqual(
      expect.objectContaining({
        currentExactReleaseLine: 'v1.2.2',
        currentMainPackageLine: '1.2.2',
        currentDevelopPackageLine: '1.3.0',
        activeDevelopCandidateReleaseLine: 'v1.3.0',
        activeReleaseCandidateBranch: null,
        chosenBump: 'minor'
      })
    );
    expect(matrix.authorityGitLab.mergeGate).toBe('only_allow_merge_if_pipeline_succeeds');
    expect(matrix.authorityGitLab.namedRequiredChecks).toBe(false);
    expect(matrix.authorityGitLab.jobs.package_extension_preview.admittedRefs).toEqual(
      expect.arrayContaining([
        'merge_request_event',
        'develop',
        'release/*',
        'hotfix/*',
        'main',
        'vX.Y.Z-tags'
      ])
    );
    expect(matrix.authorityGitLab.jobs.windows_private_release_acceptance).toEqual(
      expect.objectContaining({
        classification: 'required-governance-check',
        admittedRefs: expect.arrayContaining([
          'merge_request_event',
          'develop',
          'release/*',
          'hotfix/*',
          'main',
          'vX.Y.Z-tags'
        ])
      })
    );
    expect(matrix.authorityGitLab.jobs.assurance_release_gate).toEqual(
      expect.objectContaining({
        classification: 'required-governance-check',
        admittedRefs: expect.arrayContaining([
          'merge_request_event',
          'develop',
          'release/*',
          'hotfix/*',
          'main',
          'vX.Y.Z-tags'
        ])
      })
    );
    expect(matrix.authorityGitLab.jobs.assurance_26514_authority.classification).toBe(
      'required-governance-check'
    );
    expect(matrix.authorityGitLab.jobs.assurance_requirements_quality.classification).toBe(
      'required-governance-check'
    );
    expect(matrix.authorityGitLab.jobs.assurance_external_user_information.classification).toBe(
      'required-governance-check'
    );
    expect(matrix.authorityGitLab.jobs.assurance_audit_packet.classification).toBe(
      'advisory-governance-check'
    );
    expect(matrix.authorityGitLab.runnerLanes.linuxAssurance).toEqual(
      expect.objectContaining({
        description: 'local-linux-assurance',
        runnerContractDoc: 'docs/product/linux-assurance-runner-lane.md'
      })
    );
    expect(matrix.publicGitHub.requiredChecks).toEqual([
      'package-preview',
      'public-facade-linux-smoke'
    ]);
    expect(matrix.githubExperiment).toEqual(
      expect.objectContaining({
        classification: 'characterization-only',
        requiredForExactRelease: false
      })
    );

    expect(matrixDoc).toContain('current exact release line: `v1.2.2`');
    expect(matrixDoc).toContain('current `main` package line: `1.2.2`');
    expect(matrixDoc).toContain('current `develop` package line: `1.3.0`');
    expect(matrixDoc).toContain('active exact release candidate line on `develop`: `v1.3.0`');
    expect(matrixDoc).toContain('no newer `release/*` branch is active yet');
    expect(matrixDoc).toContain('chosen bump: `minor`');
    expect(matrixDoc).toContain('npm run branch:governance:assert');
    expect(matrixDoc).toContain('merge gate: `only_allow_merge_if_pipeline_succeeds=true`');
    expect(matrixDoc).toContain('classification: characterization-only experiment automation');
    expect(matrixDoc).toContain('back-merge of exact released `main` into `develop`');
    expect(matrixDoc).toContain('linux-assurance');
    expect(matrixDoc).toContain('`windows_private_release_acceptance`');
    expect(matrixDoc).toContain('`assurance_release_gate`');
    expect(matrixDoc).toContain('`assurance_26514_authority`');
    expect(matrixDoc).toContain('`assurance_requirements_quality`');
    expect(matrixDoc).toContain('`assurance_external_user_information`');
    expect(matrixDoc).toContain('`assurance_audit_packet`');
    expect(matrixDoc).toContain('repo-standards-review');
    expect(adr).toContain('GitLab authority uses protected branches plus');
    expect(adr).toContain('GitHub benchmark workflows remain governed characterization lanes');

    expect(gitlabCi).toContain(`- if: '$CI_COMMIT_BRANCH == "develop"'`);
    expect(gitlabCi).toContain(
      `- if: '$CI_PIPELINE_SOURCE == "merge_request_event" && $CI_MERGE_REQUEST_TARGET_BRANCH_NAME == "develop"'`
    );
    expect(gitlabCi).toContain(`- if: '$CI_COMMIT_BRANCH =~ /^release\\/.+$/'`);
    expect(gitlabCi).toContain(`- if: '$CI_COMMIT_BRANCH =~ /^hotfix\\/.+$/'`);
    expect(gitlabCi).toContain('windows_private_release_acceptance:');
    expect(gitlabCi).toContain('npm run acceptance:windows:private-release');
    expect(gitlabCi).toContain('windows-private-release-evidence/');
    expect(gitlabCi).toContain('assurance_release_gate:');
    expect(gitlabCi).toContain('assurance_26514_authority:');
    expect(gitlabCi).toContain('assurance_requirements_quality:');
    expect(gitlabCi).toContain('assurance_external_user_information:');
    expect(gitlabCi).toContain('assurance_audit_packet:');
    expect(gitlabCi).toContain('registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main');
    expect(gitlabCi).toContain('VIHS_ASSURANCE_EXECUTOR: container');
    expect(gitlabCi).toContain('docker pull "${VIHS_ASSURANCE_IMAGE}"');
    expect(gitlabCi).toContain('npm run assurance:release-gate -- --evidence-dir assurance-release-gate-evidence');
    expect(gitlabCi).toContain('npm run assurance:26514:authority -- --evidence-dir assurance-26514-authority-evidence');
    expect(gitlabCi).toContain('npm run assurance:requirements -- --evidence-dir assurance-requirements-quality-evidence');
    expect(gitlabCi).toContain('npm run assurance:user-info -- --evidence-dir assurance-external-user-information-evidence');
    expect(gitlabCi).toContain('allow_failure: true');
    expect(gitlabCi).not.toContain(`- if: '$CI_COMMIT_BRANCH'`);

    expect(cmPlan).toContain(
      '`develop` is the working integration branch, `feature/*` branches are cut from `develop` and merge back into `develop`, `release/*` branches are cut from `develop`, merge into `main`, merge back into `develop`, and are deleted only after both merges complete, and `main` remains the protected exact-release line'
    );
    expect(readme).toContain('[Hosted CI Governance](./docs/product/hosted-ci-governance.md)');
    expect(readme).toContain(
      '- hosted automation governance matrix: [docs/product/hosted-ci-governance.md]'
    );
    expect(readme).toContain('assurance_release_gate');
    expect(readme).toContain('assurance_26514_authority');
    expect(readme).toContain('registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main');
    expect(currentState).toContain('[hosted-ci-governance.md](./hosted-ci-governance.md)');
    expect(currentState).toContain(
      '- hosted automation governance matrix: [hosted-ci-governance.md](./hosted-ci-governance.md)'
    );
    expect(currentState).toContain('assurance_release_gate');
    expect(currentState).toContain('assurance_26514_authority');
    expect(currentState).toContain('registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main');
    expect(releaseProcedure).toContain('The hosted automation governance matrix is retained in:');
    expect(releaseProcedure).toContain('assurance_release_gate');
    expect(releaseProcedure).toContain('assurance_26514_authority');
    expect(releaseProcedure).toContain('repo-standards-review/assurance-workbench:main');

    expect(linuxBenchmarkWorkflow).toContain('name: Linux Runtime Benchmark Experiment');
    expect(linuxBenchmarkWorkflow).toContain('- experiment/**');
    expect(windowsBenchmarkWorkflow).toContain('name: Windows Runtime Benchmark Image');
    expect(windowsBenchmarkWorkflow).toContain('- experiment/**');
  });
});
