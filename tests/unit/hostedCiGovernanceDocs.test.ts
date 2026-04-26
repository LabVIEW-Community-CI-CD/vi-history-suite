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
  it('retains the current GitLab authority matrix and fully closed v1.3.9 posture', () => {
    const matrix = readJson<any>('docs/product/hosted-ci-governance.json');
    const matrixDoc = readText('docs/product/hosted-ci-governance.md');
    const gitlabCi = readText('.gitlab-ci.yml');
    const docsAuthoringDockerfile = readText('docker/docs-authoring/Dockerfile');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const releaseProcedure = readText('docs/release-procedure.md');

    expect(matrix.openingDecision).toEqual(
      expect.objectContaining({
        currentExactReleaseLine: 'v1.3.9',
        currentMainPackageLine: '1.3.9',
        currentDevelopPackageLine: '1.3.11',
        activeMarketplaceCommunityPreviewLine: '1.3.11',
        activeDevelopCandidateReleaseLine: null,
        activeReleaseCandidateBranch: null,
        activeHotfixCandidateReleaseLine: null,
        activeHotfixBranch: null,
        activeFeatureBranch: null,
        preTagPublicExactProofPackageScript: 'npm run public:exact:pretag:proof',
        preTagPublicExactProofJob: 'public_exact_pretag_proof',
        publicGitHubExactTransactionPackageScript: 'npm run public:github:exact:transaction:verify',
        chosenBump: 'patch-preview'
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
        classification: 'deferred-windows-labview-governance-check',
        stage: 'admission',
        packageScript: 'npm run gitlab:runner:doctor',
        evidenceRoot: 'governed-runner-admission-evidence/',
        activationVariable: 'VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true'
      })
    );
    expect(matrix.authorityGitLab.jobs.ubuntu_docker_runner_admission).toEqual(
      expect.objectContaining({
        classification: 'required-linux-docker-preview-admission',
        stage: 'admission',
        evidenceRoot: 'governed-runner-admission-evidence/',
        claimScope: 'linux-docker-validated-preview'
      })
    );
    expect(matrix.authorityGitLab.jobs.linux_docker_provider_lane).toEqual(
      expect.objectContaining({
        classification: 'required-linux-docker-provider-validation',
        stage: 'test',
        packageScript: 'npm run linux:docker:provider:lane',
        evidenceRoot: 'linux-docker-provider-lane-evidence/',
        evidenceSchema: 'vi-history-suite/linux-docker-provider-lane@v1',
        claimScope: 'linux-docker-validated-preview',
        windowsInstalledUserProofDeferred: true
      })
    );
    expect(matrix.authorityGitLab.jobs.public_exact_pretag_proof).toEqual(
      expect.objectContaining({
        classification: 'required-governance-check',
        packageScript: 'npm run public:exact:pretag:proof',
        evidenceRoot: 'public-exact-pretag-proof-evidence/'
      })
    );
    expect(matrix.authorityGitLab.jobs.docs_link_check).toEqual(
      expect.objectContaining({
        classification: 'required-governance-check',
        containerImage:
          'lycheeverse/lychee:latest-alpine@sha256:1b2f74f0b6816dc3ee4e5f457d11f1b2ed6c1cf8ebcbaa18cbfe057d5e2ccb00',
        stabilityPolicy: 'pinned-alpine-digest-no-floating-latest',
        command: 'lychee --verbose --no-progress --include-fragments README.md docs/**/*.md'
      })
    );
    expect(matrix.authorityGitLab.jobs.windows_private_release_acceptance).toEqual(
      expect.objectContaining({
        classification: 'deferred-windows-labview-proof-check',
        activationVariable: 'VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true',
        claimBoundary:
          'required-before-any-windows-installed-user-proof-claim; not required for Linux/Docker validated preview',
        runtimeContaminationRecovery: expect.objectContaining({
          recoveryScript: 'scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1',
          retryDelayMs: 5000,
          maxProofRetries: 1
        })
      })
    );
    expect(matrix.activeReleaseClaim).toEqual(
      expect.objectContaining({
        classification: 'linux-docker-validated-preview',
        publicGitHubMutation: 'not-admitted-by-this-claim',
        marketplaceMutation: 'not-admitted-by-this-claim'
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
    expect(matrixDoc).toContain('Authority exact `main` now carries tagged `v1.3.9`');
    expect(matrixDoc).toContain('public GitHub release `312768592` for');
    expect(matrixDoc).toContain('`v1.3.8` remains retained as immutable zero-asset historical incident');
    expect(matrixDoc).toContain('public GitHub and VS Code');
    expect(matrixDoc).toContain('Marketplace both publish `1.3.9`');
    expect(matrixDoc).toContain('current exact release line: `v1.3.9`');
    expect(matrixDoc).toContain('current `main` package line: `1.3.9`');
    expect(matrixDoc).toContain('current `develop` package line: `1.3.11`');
    expect(matrixDoc).toContain('active Marketplace public validation preview line: `1.3.11`');
    expect(matrixDoc).toContain('active release-candidate branch: none');
    expect(matrixDoc).toContain('npm run public:github:exact:transaction:verify');
    expect(matrixDoc).toContain('chosen bump: patch-preview');
    expect(matrixDoc).toContain(
      'lycheeverse/lychee:latest-alpine@sha256:1b2f74f0b6816dc3ee4e5f457d11f1b2ed6c1cf8ebcbaa18cbfe057d5e2ccb00'
    );
    expect(matrixDoc).toContain('no longer depends on drift-prone `lycheeverse/lychee:latest`');
    expect(readme).toContain('- separate public GitHub exact release publication: published;');
    expect(readme).toContain('releases/tag/v1.3.9');
    expect(currentState).toContain('current exact released line: `v1.3.9`');
    expect(currentState).toContain('current published package line on `main`: `1.3.9`');
    expect(currentState).toContain('VS Code Marketplace retained published version: `1.3.9`');
    expect(releaseProcedure).toContain('The public GitHub exact transaction verification package script is');
    expect(releaseProcedure).toContain('npm run public:github:exact:transaction:verify');
    expect(gitlabCi).toContain('governed_runner_admission');
    expect(gitlabCi).toContain('ubuntu_docker_runner_admission');
    expect(gitlabCi).toContain('linux_docker_provider_lane');
    expect(gitlabCi).toContain('npm run linux:docker:provider:lane');
    expect(gitlabCi).toContain('public_exact_pretag_proof');
    expect(gitlabCi).toContain('windows_private_release_acceptance');
    expect(gitlabCi).toContain('VIHS_WINDOWS_LABVIEW_PROOF_ENABLED');
    expect(gitlabCi).toContain(
      'lycheeverse/lychee:latest-alpine@sha256:1b2f74f0b6816dc3ee4e5f457d11f1b2ed6c1cf8ebcbaa18cbfe057d5e2ccb00'
    );
    expect(gitlabCi).not.toMatch(/name:\s+lycheeverse\/lychee:latest(?:\r?\n|$)/);
    expect(docsAuthoringDockerfile).toContain('lychee-v0.24.1');
    expect(docsAuthoringDockerfile).toContain('lychee-x86_64-unknown-linux-musl.tar.gz');
    expect(docsAuthoringDockerfile).not.toContain('releases/latest');
  });
});
