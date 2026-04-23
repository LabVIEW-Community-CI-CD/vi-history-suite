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
  it('retains the current GitLab authority matrix and v1.3.8 release-candidate posture', () => {
    const matrix = readJson<any>('docs/product/hosted-ci-governance.json');
    const matrixDoc = readText('docs/product/hosted-ci-governance.md');
    const gitlabCi = readText('.gitlab-ci.yml');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const releaseProcedure = readText('docs/release-procedure.md');

    expect(matrix.openingDecision).toEqual(
      expect.objectContaining({
        currentExactReleaseLine: 'v1.3.7',
        currentMainPackageLine: '1.3.7',
        currentDevelopPackageLine: '1.3.7',
        activeDevelopCandidateReleaseLine: '1.3.8',
        activeReleaseCandidateBranch: 'release/1.3.8',
        activeHotfixCandidateReleaseLine: null,
        activeHotfixBranch: null,
        activeFeatureBranch: null,
        preTagPublicExactProofPackageScript: 'npm run public:exact:pretag:proof',
        preTagPublicExactProofJob: 'public_exact_pretag_proof',
        publicGitHubExactTransactionPackageScript: 'npm run public:github:exact:transaction:verify',
        chosenBump: 'patch'
      })
    );
    expect(matrix.branchModel).toEqual(
      expect.objectContaining({
        model: 'gitflow',
        publicDefaultBranch: 'main',
        integrationBranch: 'develop',
        releaseBranch: 'release/*',
        hotfixBranch: 'hotfix/*',
        exactReleaseLineBranch: 'main'
      })
    );
    expect(matrix.authorityGitLab.mergeGate).toBe('only_allow_merge_if_pipeline_succeeds');
    expect(matrix.authorityGitLab.namedRequiredChecks).toBe(false);
    expect(matrix.authorityGitLab.jobs.governed_runner_admission).toEqual(
      expect.objectContaining({
        classification: 'required-governance-check',
        stage: 'admission',
        packageScript: 'npm run gitlab:runner:doctor',
        evidenceRoot: 'governed-runner-admission-evidence/'
      })
    );
    expect(matrix.authorityGitLab.jobs.public_exact_pretag_proof).toEqual(
      expect.objectContaining({
        classification: 'required-governance-check',
        packageScript: 'npm run public:exact:pretag:proof',
        evidenceRoot: 'public-exact-pretag-proof-evidence/'
      })
    );
    expect(matrix.authorityGitLab.jobs.windows_private_release_acceptance).toEqual(
      expect.objectContaining({
        classification: 'required-governance-check',
        runtimeContaminationRecovery: expect.objectContaining({
          recoveryScript: 'scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1',
          retryDelayMs: 5000,
          maxProofRetries: 1
        })
      })
    );
    expect(matrix.authorityGitLab.runnerLanes.linuxAssurance.operatorModel.helperVerification).toEqual(
      expect.objectContaining({
        distro: 'Ubuntu-24.04',
        distroOverrideEnvironmentVariable: 'VIHS_LINUX_ASSURANCE_DISTRO'
      })
    );
    expect(
      matrix.authorityGitLab.runnerLanes.windowsPrivateRelease.operatorModel.linuxAssuranceBootstrap
    ).toEqual(
      expect.objectContaining({
        distro: 'Ubuntu-24.04',
        distroOverrideEnvironmentVariable: 'VIHS_LINUX_ASSURANCE_DISTRO'
      })
    );
    expect(matrixDoc).toContain('Authority exact `main` carries tagged `v1.3.7`');
    expect(matrixDoc).toContain('public GitHub `main`, tag, and release publish the exact');
    expect(matrixDoc).toContain('Marketplace listing now serves `1.3.7`');
    expect(matrixDoc).toContain('current exact release line: `v1.3.7`');
    expect(matrixDoc).toContain('current `main` package line: `1.3.7`');
    expect(matrixDoc).toContain('current `develop` package line: `1.3.7`');
    expect(matrixDoc).toContain('active release-candidate branch: `release/1.3.8`');
    expect(matrixDoc).toContain('npm run public:github:exact:transaction:verify');
    expect(matrixDoc).toContain('installed Windows `vihs` launcher fix');
    expect(readme).toContain('- separate public GitHub exact release publication: published;');
    expect(readme).toContain('releases/tag/v1.3.7');
    expect(currentState).toContain('current exact released line: `v1.3.7`');
    expect(currentState).toContain('current published package line on `main`: `1.3.7`');
    expect(currentState).toContain('VS Code Marketplace retained published version: `1.3.7`');
    expect(releaseProcedure).toContain('The public GitHub exact transaction verification package script is');
    expect(releaseProcedure).toContain('npm run public:github:exact:transaction:verify');
    expect(gitlabCi).toContain('governed_runner_admission');
    expect(gitlabCi).toContain('public_exact_pretag_proof');
    expect(gitlabCi).toContain('windows_private_release_acceptance');
  });
});
