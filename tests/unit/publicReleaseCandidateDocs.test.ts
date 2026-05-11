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
  it('retains the closed v1.3.15 exact publication state while keeping historical blockers separate', () => {
    const candidate = readJson<any>('docs/product/public-release-candidate.json');
    const candidateMarkdown = readText('docs/product/public-release-candidate.md');
    const currentState = readText('docs/product/current-state.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');

    expect(candidate.versionLine).toBe('1.3.15');
    expect(candidate.activeDevelopCandidate).toBeNull();
    expect(candidate.burnedExactReleaseLine).toBe('v1.0.2');
    expect(candidate.publishedPublicSource).toMatchObject({
      publishedCommit: '427ab27',
      currentPublicSourceHead: '427ab27',
      currentPublicSourceHeadSha: '427ab27245f6f66d186e07865f1fc0a00795611a',
      status: 'published-main-tag-release-and-marketplace-v1.3.15',
      latestPublicExactReleaseCloseout: {
        status: 'published-and-verified',
        pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/83',
        publicMainCommit: '427ab27245f6f66d186e07865f1fc0a00795611a',
        publicMainShortCommit: '427ab27',
        publicTag: 'v1.3.15',
        publicTagObjectSha: '28ea4253813e6f322cbcc25cdce865cdeac219a6',
        publicGitHubReleaseId: 320197692,
        marketplaceVersion: '1.3.15',
        vsixSha256:
          '157fc562a495807ec99d16ce14096ed5fe05112e5a93bd25fef0c9cbf06873c7',
        marketplaceMutation: 'published-and-verified'
      }
    });
    expect(candidate.publishedPublicSource.latestPublicSourceAndTagHandoff).toMatchObject({
      pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/69',
      publicTag: 'v1.3.14',
      publicGitHubReleasePublication: 'not-performed',
      marketplaceMutation: 'not-performed'
    });
    expect(candidate.candidateReadiness).toMatchObject({
      authorityBaseline:
        'v1.3.15-published-across-gitlab-github-and-marketplace-with-v1.3.8-history-retained',
      localInstalledVsix: 'release-1.3.15-authority-candidate-package-line',
      publicGitHubExactTransactionGate: 'closed-for-v1.3.15',
      windowsExactVsixInstallProofGate: 'closed-for-v1.3.15',
      exactPublicRelease:
        'v1.3.15-github-release-and-marketplace-published; v1.3.8-public-github-release-externally-blocked-zero-assets-retained-history'
    });
    expect(candidate.exactRelease).toMatchObject({
      version: 'v1.3.15',
      gitHubReleaseId: 320197692,
      gitHubAssetName: 'vi-history-suite-1.3.15.vsix',
      gitHubAssetSha256:
        '157fc562a495807ec99d16ce14096ed5fe05112e5a93bd25fef0c9cbf06873c7',
      marketplaceVersion: '1.3.15'
    });
    expect(candidate.exactReleaseReopening).toMatchObject({
      status: 'authority-v1.3.15-published-v1.3.8-history-retained-no-open-release-line',
      authorityTag: 'v1.3.15',
      publicGitHubExactTag: 'v1.3.15',
      publicGitHubReleaseId: 320197692,
      nextSeparateAct: 'normal-next-line-governance-after-v1.3.15-retention',
      marketplaceVersionRetained: '1.3.15',
      publicGitHubExactTransactionReceiptPath:
        '.cache/public-github-exact-v1.3.15-verify-after-marketplace/public-github-exact-release-transaction.json',
      vscodeMarketplacePublicationPrepReceiptPath:
        '.cache/vscode-marketplace-publication-prep/v1.3.15-marketplace-verified/vscode-marketplace-publication-prep.json',
      windowsExactVsixInstallProofReceiptPath:
        '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json'
    });
    expect(candidate.publicationIncident).toMatchObject({
      id: 'PUBLICATION-INCIDENT-v1.3.8-IMMUTABLE-ZERO-ASSETS',
      status: 'retained-history',
      classification: 'externally-blocked-publication',
      blockerCode: 'published-immutable-release-assets-incomplete'
    });
    expect(candidate.softwareFactoryGovernance).toMatchObject({
      status: 'authority-v1.3.15-fully-published-no-active-feature-branch',
      activeFeatureBranch: null,
      productionMutationAllowed: false,
      rule:
        'Exact v1.3.15 is fully published across GitLab authority, public GitHub, and VS Code Marketplace; later SemVer openings return to normal GitFlow while the retained v1.3.8 authority exact line remains blocked historical publication evidence.'
    });
    expect(candidate.localProofs.localInstalledVsixPreview).toMatchObject({
      status: 'release-1.3.15-authority-candidate-package-line',
      version: '1.3.15',
      vsixPath:
        '.cache/gitlab-release-artifacts/v1.3.15/expanded/release-evidence/vi-history-suite-1.3.15.vsix'
    });
    expect(candidate.localProofs.windowsExactVsixInstallProof).toMatchObject({
      status: 'passed-v1.3.15-isolated-exact-vsix-install',
      authorityTag: 'v1.3.15',
      packageVersion: '1.3.15',
      runtimeValidationOutcome: 'ready',
      launcherPathStrippedToLauncherAndSystem32: true,
      ambientNodeOnPathRequired: false
    });
    expect(candidate.localProofs.publicGitHubExactTransaction).toMatchObject({
      status: 'published-v1.3.15-github-release-and-marketplace-verified',
      authorityTag: 'v1.3.15',
      publicMainCommit: '427ab27245f6f66d186e07865f1fc0a00795611a',
      publicTag: 'v1.3.15',
      publicReleaseId: 320197692,
      vsixAssetName: 'vi-history-suite-1.3.15.vsix',
      releaseAssetsRetainedAgainstManifest: true,
      verifyGateStatus: 'pass',
      openingNewSemverAllowed: true,
      nextAllowedAction: 'normal-next-line-governance-after-v1.3.15-retention'
    });
    expect(candidate.localProofs.vscodeMarketplacePublicationPrep).toMatchObject({
      status: 'published-v1.3.15-verified',
      expectedMarketplaceVersion: '1.3.15',
      currentMarketplaceVersion: '1.3.15',
      publicGitHubReleaseId: 320197692,
      vsixSha256Verified: true,
      windowsExactVsixInstallProofStatus: 'pass',
      productionMutationAttempted: true,
      publicationMode: 'pinned-vsce-cli',
      publishedAt: '2026-05-10',
      nextAllowedAction: 'normal-next-line-governance-after-v1.3.15-retention'
    });
    expect(candidate.activeBlockers).toEqual([
      expect.objectContaining({
        id: 'BLOCKER-VSCODE-MARKETPLACE-PUBLICATION',
        status: 'closed'
      })
    ]);

    expect(candidateMarkdown).toContain('Version line: `1.3.15`');
    expect(candidateMarkdown).toContain('Active develop candidate line: none');
    expect(candidateMarkdown).toContain('Retained release-candidate branch: `release/1.3.15`');
    expect(candidateMarkdown).toContain(
      '`normal-next-semver-opening-may-proceed-after-v1.3.15-closeout-retention`'
    );
    expect(candidateMarkdown).toContain('Published exact public source commit: `427ab27`');
    expect(candidateMarkdown).toContain('Current public source head: `427ab27`');
    expect(candidateMarkdown).toContain('GitHub release id: `320197692`');
    expect(candidateMarkdown).toContain('public PR #83');
    expect(candidateMarkdown).toContain('`28ea4253813e6f322cbcc25cdce865cdeac219a6`');
    expect(candidateMarkdown).toContain('VS Code Marketplace version: `1.3.15`');
    expect(candidateMarkdown).toContain('`currentMarketplaceVersion=1.3.15`');
    expect(candidateMarkdown).toContain(
      '.cache/public-github-exact-v1.3.15-verify-after-marketplace/public-github-exact-release-transaction.json'
    );
    expect(candidateMarkdown).toContain(
      '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json'
    );
    expect(candidateMarkdown).toContain('`runtimeValidationOutcome=ready`');
    expect(candidateMarkdown).toContain('`ambientNodeOnPathRequired=false`');
    expect(candidateMarkdown).toContain('GitHub release `312768592` is already published and immutable with zero');
    expect(candidateMarkdown).toContain('`published-immutable-release-assets-incomplete`');

    expect(currentState).toContain('current exact released line: `v1.3.15`');
    expect(currentState).toContain('current authority package line on `main`: `1.3.15`');
    expect(currentState).toContain('current develop package line on `develop`: `1.3.15`');
    expect(currentState).toContain('active release-candidate branch: retained `release/1.3.15`');
    expect(currentState).toContain('npm run public:github:exact:transaction:verify');
    expect(currentState).toContain('npm run vscode:marketplace:install-proof');
    expect(currentState).toContain('separate public GitHub exact release publication: published;');
    expect(currentState).toContain('releases/tag/v1.3.15');
    expect(currentState).toContain('verify receipt now records `verifyGateStatus=pass`');
    expect(currentState).toContain('VS Code Marketplace retained published version: `1.3.15`');

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
