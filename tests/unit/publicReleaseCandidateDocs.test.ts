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

describe('public release candidate control surface', () => {
  it('retains the closed v1.3.9 exact publication state while keeping v1.3.8 as blocked historical evidence', () => {
    const candidate = readJson<any>('docs/product/public-release-candidate.json');
    const candidateMarkdown = readText('docs/product/public-release-candidate.md');
    const currentState = readText('docs/product/current-state.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');

    expect(candidate.versionLine).toBe('1.3.9');
    expect(candidate.activeDevelopCandidate).toMatchObject({
      candidateLine: 'v1.3.14',
      packageVersion: '1.3.14',
      state: 'develop-patch-candidate-consolidation',
      branch: 'develop',
      sourceFeatureBranch: 'feature/develop-1.3.14-candidate-consolidation',
      mergeRequest: 'https://gitlab.com/svelderrainruiz/vi-history-suite/-/merge_requests/192',
      sourceHeadCommit: '97efa937a5317d69a1d65607c4f704d603edbe52',
      developMergeCommit: '72899eb39e38ce34c697f0a227292ead6bcd8f2d',
      mergedAt: '2026-05-08T17:52:32.814Z',
      postMergeDevelopPipeline: {
        pipelineId: 2511040377,
        status: 'success',
        url: 'https://gitlab.com/svelderrainruiz/vi-history-suite/-/pipelines/2511040377'
      },
      vagrantVsixAcceptanceReceipt: {
        jobId: 14284054131,
        jobName: 'vagrant_windows_vsix_acceptance',
        jobStatus: 'success',
        jobUrl: 'https://gitlab.com/svelderrainruiz/vi-history-suite/-/jobs/14284054131',
        assertionReceipt: 'vagrant/evidence/assertion/vagrant-vsix-acceptance-assertion.json',
        manifest: 'vagrant/evidence/20260508-105809/manifest.json',
        recordedAt: '2026-05-08T17:58:36.620Z',
        runtimeExecutionState: 'succeeded',
        proofExitCode: 0
      },
      productionMutationAllowed: false,
      claimBoundary: 'does-not-admit-windows-docker-desktop-windows-container-proof'
    });
    expect(candidate.burnedExactReleaseLine).toBe('v1.0.2');
    expect(candidate.publishedPublicSource).toMatchObject({
      publishedCommit: 'fb0ef2b',
      currentPublicSourceHead: '220111e',
      currentPublicSourceHeadSha: '220111eae3ac214e99f2233e2bfe6b320edf383d',
      status: 'published-main-tag-and-release-v1.3.9'
    });
    expect(candidate.publishedPublicSource.latestPublicFacadeDocsPromotion).toMatchObject({
      pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/60',
      publicMainCommit: 'ce6dbd0b1b5783f7015b9d0589f3803636564789',
      publicMainShortCommit: 'ce6dbd0',
      marketplaceMutation: 'not-performed'
    });
    expect(candidate.publishedPublicSource.latestWindowsDockerDesktopIntakePromotion).toMatchObject({
      pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/68',
      publicMainCommit: '220111eae3ac214e99f2233e2bfe6b320edf383d',
      publicMainShortCommit: '220111e',
      publicLabelsApplied: ['windows-docker-desktop'],
      marketplaceMutation: 'not-performed'
    });
    expect(candidate.candidateReadiness).toMatchObject({
      authorityBaseline:
        'v1.3.9-published-across-gitlab-github-and-marketplace-with-v1.3.8-history-retained',
      localInstalledVsix: 'release-1.3.9-authority-candidate-package-line',
      publicGitHubExactTransactionGate:
        'required-before-any-further-public-github-release-or-marketplace-act',
      windowsExactVsixInstallProofGate: 'required-before-any-later-marketplace-act',
      exactPublicRelease:
        'v1.3.9-github-release-and-marketplace-published; v1.3.8-public-github-release-externally-blocked-zero-assets-retained-history'
    });
    expect(candidate.exactRelease).toMatchObject({
      version: 'v1.3.9',
      gitHubReleaseId: 312994104,
      gitHubAssetName: 'vi-history-suite-1.3.9.vsix',
      gitHubAssetSha256: '62c48a2ccdde3557680280a458bff52f2720541673b5a2dc2158f4f35addc353',
      marketplaceVersion: '1.3.9'
    });
    expect(candidate.exactReleaseReopening).toMatchObject({
      status: 'authority-v1.3.9-published-v1.3.8-history-retained-no-open-release-line',
      authorityTag: 'v1.3.9',
      publicGitHubExactTag: 'v1.3.9',
      publicGitHubReleaseId: 312994104,
      publicGitHubPublishabilityProbeStatus: 'published-complete',
      publicGitHubPublishabilityBlockerCode: null,
      publicGitHubDraftPublishabilityProbeStatus: 'not-applicable-already-published',
      publicGitHubDraftPublishabilityBlockerCode: null,
      publicGitHubReleaseLookupStatusCode: 200,
      publicGitHubDraftReleaseUsesUntaggedUrl: false,
      nextSeparateAct: 'normal-next-line-governance-after-v1.3.9-retention',
      marketplaceVersionRetained: '1.3.9',
      publicGitHubExactTransactionPackageScript: 'npm run public:github:exact:transaction:verify',
      vscodeMarketplacePublicationPrepPackageScript: 'npm run vscode:marketplace:prepare',
      windowsExactVsixInstallProofPackageScript: 'npm run vscode:marketplace:install-proof',
      windowsExactVsixInstallProofReceiptPath:
        '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json'
    });
    expect(candidate.publicationIncident).toMatchObject({
      id: 'PUBLICATION-INCIDENT-v1.3.8-IMMUTABLE-ZERO-ASSETS',
      status: 'retained-history',
      classification: 'externally-blocked-publication',
      authoritySystem: 'gitlab',
      authorityTag: 'v1.3.8',
      publicGitHubReleaseId: 312768592,
      publicGitHubReleaseImmutable: true,
      publicGitHubReleaseAssetCount: 0,
      blockerCode: 'published-immutable-release-assets-incomplete',
      marketplaceVersionRetained: '1.3.9'
    });
    expect(candidate.softwareFactoryGovernance).toEqual({
      status: 'authority-v1.3.9-fully-published-no-active-feature-branch',
      activeFeatureBranch: null,
      packageScripts: {
        assess: 'npm run software:factory:assess',
        rehearse: 'npm run software:factory:rehearse',
        repair: 'npm run software:factory:repair',
        publish: 'npm run software:factory:publish',
        verify: 'npm run software:factory:verify',
        marketplaceInstallProof: 'npm run vscode:marketplace:install-proof',
        marketplacePrepare: 'npm run vscode:marketplace:prepare'
      },
      receiptPaths: {
        assess: '.cache/software-factory-orchestrator/latest/software-factory-state.json',
        rehearse: '.cache/software-factory-orchestrator/latest/rehearse/software-factory-state.json',
        repair: '.cache/software-factory-orchestrator/latest/repair/software-factory-state.json',
        publish: '.cache/software-factory-orchestrator/latest/publish/software-factory-state.json',
        verify: '.cache/software-factory-orchestrator/latest/verify/software-factory-state.json',
        marketplaceInstallProof:
          '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json',
        marketplacePrepare:
          '.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json'
      },
      admittedNonProductionPhases: ['assess', 'rehearse', 'repair'],
      guardedNonMutatingContractPhases: ['publish', 'verify'],
      soleProductionRecoveryTarget: null,
      productionMutationAllowed: false,
      rule:
        'Exact v1.3.9 is fully published across GitLab authority, public GitHub, and VS Code Marketplace; later SemVer openings return to normal GitFlow while the retained v1.3.8 authority exact line remains blocked historical publication evidence.'
    });
    expect(candidate.localProofs.localInstalledVsixPreview).toMatchObject({
      status: 'release-1.3.9-authority-candidate-package-line',
      version: '1.3.9',
      vsixPath: 'preview-evidence/vi-history-suite-1.3.9.vsix',
      checksumPath: 'preview-evidence/vi-history-suite-1.3.9.vsix.sha256'
    });
    expect(candidate.localProofs.windowsExactVsixInstallProof).toMatchObject({
      status: 'passed-v1.3.9-isolated-exact-vsix-install',
      packageScript: 'npm run vscode:marketplace:install-proof',
      receiptPath: '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json',
      authorityTag: 'v1.3.9',
      packageVersion: '1.3.9',
      runtimeValidationOutcome: 'ready',
      launcherPathStrippedToLauncherAndSystem32: true,
      ambientNodeOnPathRequired: false
    });
    expect(candidate.localProofs.publicGitHubExactTransaction).toMatchObject({
      status: 'published-v1.3.9-github-release-and-marketplace-verified',
      packageScript: 'npm run public:github:exact:transaction:verify',
      authorityTag: 'v1.3.9',
      publicMainCommit: 'fb0ef2b5342c230d5372e61859dd0fca3dbc0b6a',
      publicTag: 'v1.3.9',
      publicReleaseId: 312994104,
      vsixAssetName: 'vi-history-suite-1.3.9.vsix',
      vsixAssetSha256: '62c48a2ccdde3557680280a458bff52f2720541673b5a2dc2158f4f35addc353',
      authorityReleaseManifestPath:
        '.cache/gitlab-release-artifacts/v1.3.9/expanded/release-evidence/release-manifest.json',
      releaseAssetsRetainedAgainstManifest: true,
      publicSourcePromotionStatus: 'passed',
      verifyGateStatus: 'pass',
      verifyGateAllowed: true,
      publicReleaseLookupStatusCode: 200,
      publicReleaseByIdStatusCode: 200,
      draft: false,
      immutable: true,
      openingNewSemverAllowed: true,
      repairInPlaceRequired: false,
      repairInPlaceAllowed: false,
      nextAllowedAction: 'normal-next-line-governance-after-v1.3.9-retention'
    });
    expect(candidate.localProofs.vscodeMarketplacePublicationPrep).toMatchObject({
      status: 'published-v1.3.9-verified',
      packageScript: 'npm run vscode:marketplace:prepare',
      expectedMarketplaceVersion: '1.3.9',
      currentMarketplaceVersion: '1.3.9',
      publicGitHubVerifyGateStatus: 'pass',
      publicGitHubReleaseId: 312994104,
      vsixSha256Verified: true,
      windowsExactVsixInstallProofStatus: 'pass',
      windowsExactVsixInstallProofReceiptPath:
        '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json',
      vscePatLocatorStatus: 'ok',
      secretRetained: false,
      pinnedVscePackage: '@vscode/vsce@3.7.1',
      productionMutationAttempted: true,
      publicationMode: 'pinned-vsce-cli',
      publishedAt: '2026-04-23',
      nextAllowedAction: 'normal-next-line-governance-after-v1.3.9-retention'
    });
    expect(candidate.activeBlockers).toEqual([
      expect.objectContaining({
        id: 'BLOCKER-VSCODE-MARKETPLACE-PUBLICATION',
        status: 'closed'
      })
    ]);

    expect(candidateMarkdown).toContain('Version line: `1.3.9`');
    expect(candidateMarkdown).toContain('Active develop candidate line: `v1.3.14`');
    expect(candidateMarkdown).toContain('Active develop candidate package: `1.3.14`');
    expect(candidateMarkdown).toContain('Active develop candidate branch: `develop`');
    expect(candidateMarkdown).toContain(
      '`feature/develop-1.3.14-candidate-consolidation`'
    );
    expect(candidateMarkdown).toContain('Protected develop merge: GitLab MR `!192`');
    expect(candidateMarkdown).toContain('`72899eb39e38ce34c697f0a227292ead6bcd8f2d`');
    expect(candidateMarkdown).toContain('Protected develop pipeline: `2511040377` / `success`');
    expect(candidateMarkdown).toContain(
      'Vagrant VSIX acceptance receipt: GitLab job `14284054131` / `success`'
    );
    expect(candidateMarkdown).toContain(
      'vagrant/evidence/assertion/vagrant-vsix-acceptance-assertion.json'
    );
    expect(candidateMarkdown).toContain('vagrant/evidence/20260508-105809/manifest.json');
    expect(candidateMarkdown).toContain('Published exact public source commit: `fb0ef2b`');
    expect(candidateMarkdown).toContain('Current public source head: `220111e`');
    expect(candidateMarkdown).toContain('Software-factory governance branch: none');
    expect(candidateMarkdown).toContain('`release-1.3.9-authority-candidate-package-line`');
    expect(candidateMarkdown).toContain(
      '`v1.3.9-github-release-and-marketplace-published; v1.3.8-public-github-release-externally-blocked-zero-assets-retained-history`'
    );
    expect(candidateMarkdown).toContain('GitHub release `312994104`');
    expect(candidateMarkdown).toContain('`verifyGateStatus=pass`');
    expect(candidateMarkdown).toContain('`verifyGateAllowed=true`');
    expect(candidateMarkdown).toContain(
      '.cache/gitlab-release-artifacts/v1.3.9/expanded/release-evidence/release-manifest.json'
    );
    expect(candidateMarkdown).toContain('Public GitHub exact now publishes `v1.3.9`');
    expect(candidateMarkdown).toContain('public PR #68');
    expect(candidateMarkdown).toContain('public PR #60');
    expect(candidateMarkdown).toContain('VS Code Marketplace item');
    expect(candidateMarkdown).toContain('VS Code Marketplace version: `1.3.9`');
    expect(candidateMarkdown).toContain('`required-before-any-later-marketplace-act`');
    expect(candidateMarkdown).toContain('`npm run vscode:marketplace:prepare`');
    expect(candidateMarkdown).toContain('`npm run vscode:marketplace:install-proof`');
    expect(candidateMarkdown).toContain(
      '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json'
    );
    expect(candidateMarkdown).toContain('`runtimeValidationOutcome=ready`');
    expect(candidateMarkdown).toContain('`ambientNodeOnPathRequired=false`');
    expect(candidateMarkdown).toContain('`currentMarketplaceVersion=1.3.9`');
    expect(candidateMarkdown).toContain('GitHub release `312768592` is already published and immutable with zero');
    expect(candidateMarkdown).toContain('`published-immutable-release-assets-incomplete`');

    expect(currentState).toContain('current exact released line: `v1.3.9`');
    expect(currentState).toContain('current published package line on `main`: `1.3.9`');
    expect(currentState).toContain('current develop package line on `develop`: `1.3.14`');
    expect(currentState).toContain('active release-candidate branch: none');
    expect(currentState).toContain('active software-factory governance branch on `develop`:');
    expect(currentState).toContain('none');
    expect(currentState).toContain('npm run public:github:exact:transaction:verify');
    expect(currentState).toContain('npm run vscode:marketplace:install-proof');
    expect(currentState).toContain('separate public GitHub exact release publication: published;');
    expect(currentState).toContain('releases/tag/v1.3.9');
    expect(currentState).toContain('verify receipt now records `verifyGateStatus=pass`');
    expect(currentState).toContain('VS Code Marketplace retained published version: `1.3.9`');

    for (const requirementId of [
      'VHS-REQ-566',
      'VHS-REQ-567',
      'VHS-REQ-568',
      'VHS-REQ-569',
      'VHS-REQ-570',
      'VHS-REQ-571',
      'VHS-REQ-572',
      'VHS-REQ-573',
      'VHS-REQ-574',
      'VHS-REQ-575',
      'VHS-REQ-576',
      'VHS-REQ-577',
      'VHS-REQ-578',
      'VHS-REQ-579',
      'VHS-REQ-580',
      'VHS-REQ-581',
      'VHS-REQ-582'
    ]) {
      expect(srs).toContain(requirementId);
      expect(rtm).toContain(requirementId);
    }

    for (const testId of [
      'TEST-UNIT-370',
      'TEST-UNIT-371',
      'TEST-UNIT-372',
      'TEST-UNIT-373',
      'TEST-UNIT-374',
      'TEST-UNIT-375',
      'TEST-UNIT-376',
      'TEST-UNIT-377',
      'TEST-UNIT-378',
      'TEST-UNIT-379',
      'TEST-DOC-123',
      'TEST-DOC-124',
      'TEST-DOC-125',
      'TEST-DOC-126',
      'TEST-DOC-127',
      'TEST-DOC-128',
      'TEST-DOC-129',
      'TEST-DOC-130',
      'TEST-DOC-131',
      'TEST-DOC-132',
      'TEST-UNIT-380',
      'TEST-UNIT-381',
      'TEST-UNIT-382',
      'TEST-UNIT-383',
      'TEST-UNIT-384',
      'TEST-DOC-133',
      'TEST-DOC-134',
      'TEST-DOC-135',
      'TEST-DOC-136',
      'TEST-DOC-137'
    ]) {
      expect(testPlan).toContain(testId);
    }
  });
});
