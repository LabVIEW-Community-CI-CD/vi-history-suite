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
  it('retains the closed v1.3.16 exact publication state while keeping historical blockers separate', () => {
    const candidate = readJson<any>('docs/product/public-release-candidate.json');
    const candidateMarkdown = readText('docs/product/public-release-candidate.md');
    const currentState = readText('docs/product/current-state.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');

    expect(candidate.versionLine).toBe('1.3.16');
    expect(candidate.activeDevelopCandidate).toBeNull();
    expect(candidate.burnedExactReleaseLine).toBe('v1.0.2');
    expect(candidate.publishedPublicSource).toMatchObject({
      publishedCommit: 'f679023',
      currentPublicSourceHead: 'fad5193f',
      currentPublicSourceHeadSha: 'fad5193f7aa0b9f543687eebf607cf2e94956afb',
      status:
        'published-main-post-v1.3.16-first-run-guide-adoption; exact-v1.3.16-remains-tagged-and-released',
      latestPublicExactReleaseCloseout: {
        status: 'published-and-verified',
        pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/88',
        publicMainCommit: 'f679023ed760963779d9331a9395128ad01c7e54',
        publicMainShortCommit: 'f679023',
        publicTag: 'v1.3.16',
        publicTagObjectSha: 'f6ca389269dac140dc416d76bb4c2ac142664567',
        publicGitHubReleaseId: 320824958,
        marketplaceVersion: '1.3.16',
        vsixSha256:
          '56bc9b222ec859f530ea523eed215b2efde4ce96fa9fcc4974f6589da3b81170',
        marketplaceMutation: 'published-and-verified'
      }
    });
    expect(candidate.publishedPublicSource.latestInstalledUserSupportMatrixAdoption).toMatchObject({
      status: 'published-and-verified',
      pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/89',
      publicMainCommit: '90b6e600ea025aeb238832cf91fe15ff2b0c7db8',
      publicMainShortCommit: '90b6e600',
      issue: 'https://github.com/svelderrainruiz/vi-history-suite/issues/78',
      marketplaceMutation: 'not-performed',
      releaseMutation: 'not-performed'
    });
    expect(candidate.publishedPublicSource.latestV1316IntakeSurfaceNormalization).toMatchObject({
      status: 'published-and-verified',
      publicPullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/90',
      publicMainCommit: 'fe4b15894d8417e6f1e0d234cb19bd945ef716c3',
      publicMainShortCommit: 'fe4b1589',
      issue: 'https://github.com/svelderrainruiz/vi-history-suite/issues/78',
      marketplaceMutation: 'not-performed',
      releaseMutation: 'not-performed'
    });
    expect(candidate.publishedPublicSource.latestFirstRunLocalLabviewGuideAdoption).toMatchObject({
      status: 'published-and-verified',
      pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/91',
      publicMainCommit: 'fad5193f7aa0b9f543687eebf607cf2e94956afb',
      publicMainShortCommit: 'fad5193f',
      issue: 'https://github.com/svelderrainruiz/vi-history-suite/issues/79',
      marketplaceMutation: 'not-performed',
      releaseMutation: 'not-performed'
    });
    expect(candidate.publishedPublicSource.latestPublicSourceAndTagHandoff).toMatchObject({
      pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/69',
      publicTag: 'v1.3.14',
      publicGitHubReleasePublication: 'not-performed',
      marketplaceMutation: 'not-performed'
    });
    expect(candidate.candidateReadiness).toMatchObject({
      authorityBaseline:
        'v1.3.16-published-across-gitlab-github-and-marketplace-with-v1.3.8-history-retained',
      localInstalledVsix: 'develop-1.3.16-authority-candidate-package-line',
      publicGitHubExactTransactionGate: 'closed-for-v1.3.16',
      windowsExactVsixInstallProofGate: 'closed-for-v1.3.16',
      exactPublicRelease:
        'v1.3.16-github-release-and-marketplace-published; v1.3.8-public-github-release-externally-blocked-zero-assets-retained-history'
    });
    expect(candidate.exactRelease).toMatchObject({
      version: 'v1.3.16',
      gitHubReleaseId: 320824958,
      gitHubAssetName: 'vi-history-suite-1.3.16.vsix',
      gitHubAssetSha256:
        '56bc9b222ec859f530ea523eed215b2efde4ce96fa9fcc4974f6589da3b81170',
      marketplaceVersion: '1.3.16'
    });
    expect(candidate.exactReleaseReopening).toMatchObject({
      status: 'v1.3.16-release-branch-readiness-reassessed-main-promotion-admissible',
      releaseBranch: 'release/1.3.16',
      authorityTag: 'v1.3.15',
      publicGitHubExactTag: 'v1.3.15',
      publicGitHubReleaseId: 320197692,
      nextSeparateAct: 'promote-release-1.3.16-to-main-as-separate-governed-action',
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
      status: 'authority-v1.3.16-fully-published-no-open-release-line',
      activeFeatureBranch: null,
      productionMutationAllowed: false,
      rule:
        'Exact v1.3.16 is fully published across GitLab authority, public GitHub, and VS Code Marketplace; later SemVer openings return to normal GitFlow while the retained v1.3.8 authority exact line remains blocked historical publication evidence.'
    });
    expect(candidate.localProofs.localInstalledVsixPreview).toMatchObject({
      status: 'develop-1.3.16-authority-candidate-package-line',
      version: '1.3.16',
      vsixPath: 'preview-evidence/vi-history-suite-1.3.16.vsix'
    });
    expect(candidate.localProofs.windowsExactVsixInstallProof).toMatchObject({
      status: 'passed-v1.3.16-isolated-exact-vsix-install',
      authorityTag: 'v1.3.16',
      packageVersion: '1.3.16',
      runtimeValidationOutcome: 'ready',
      launcherPathStrippedToLauncherAndSystem32: true,
      ambientNodeOnPathRequired: false
    });
    expect(candidate.localProofs.publicGitHubExactTransaction).toMatchObject({
      status: 'published-v1.3.16-github-release-and-marketplace-verified',
      authorityTag: 'v1.3.16',
      publicMainCommit: 'f679023ed760963779d9331a9395128ad01c7e54',
      publicTag: 'v1.3.16',
      publicReleaseId: 320824958,
      vsixAssetName: 'vi-history-suite-1.3.16.vsix',
      releaseAssetsRetainedAgainstManifest: true,
      verifyGateStatus: 'pass',
      openingNewSemverAllowed: true,
      nextAllowedAction: 'normal-next-line-governance-after-v1.3.16-retention'
    });
    expect(candidate.localProofs.vscodeMarketplacePublicationPrep).toMatchObject({
      status: 'published-v1.3.16-verified',
      expectedMarketplaceVersion: '1.3.16',
      currentMarketplaceVersion: '1.3.16',
      publicGitHubReleaseId: 320824958,
      vsixSha256Verified: true,
      windowsExactVsixInstallProofStatus: 'pass',
      productionMutationAttempted: true,
      publicationMode: 'pinned-vsce-cli',
      publishedAt: '2026-05-11',
      nextAllowedAction: 'normal-next-line-governance-after-v1.3.16-retention'
    });
    expect(candidate.activeBlockers).toEqual([
      expect.objectContaining({
        id: 'BLOCKER-VSCODE-MARKETPLACE-PUBLICATION',
        status: 'closed'
      })
    ]);

    expect(candidateMarkdown).toContain('Version line: `1.3.16`');
    expect(candidateMarkdown).toContain('Active develop candidate line: none');
    expect(candidateMarkdown).toContain('Active develop candidate package: none');
    expect(candidateMarkdown).toContain('Active release-candidate branch: none');
    expect(candidateMarkdown).toContain('Retained prior release-candidate branch: `release/1.3.16`');
    expect(candidateMarkdown).toContain('Retained release branch pipeline: `2516207722` / `success`');
    expect(candidateMarkdown).toContain(
      '`retain-v1.3.16-marketplace-closeout-on-protected-develop`'
    );
    expect(candidateMarkdown).toContain('Published exact public source commit: `f679023`');
    expect(candidateMarkdown).toContain('Current public source head: `fad5193f`');
    expect(candidateMarkdown).toContain('GitHub release id: `320824958`');
    expect(candidateMarkdown).toContain('PR #89');
    expect(candidateMarkdown).toContain('PR #90');
    expect(candidateMarkdown).toContain('PR #91');
    expect(candidateMarkdown).toContain('25705189099');
    expect(candidateMarkdown).toContain('25705500127');
    expect(candidateMarkdown).toContain('25730733192');
    expect(candidateMarkdown).toContain('PR #88');
    expect(candidateMarkdown).toContain('`f6ca389269dac140dc416d76bb4c2ac142664567`');
    expect(candidateMarkdown).toContain('VS Code Marketplace version: `1.3.16`');
    expect(candidateMarkdown).toContain('`currentMarketplaceVersion=1.3.16`');
    expect(candidateMarkdown).toContain(
      '.cache/public-github-exact-v1.3.16-verify-after-marketplace/public-github-exact-release-transaction.json'
    );
    expect(candidateMarkdown).toContain(
      '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json'
    );
    expect(candidateMarkdown).toContain('`runtimeValidationOutcome=ready`');
    expect(candidateMarkdown).toContain('`ambientNodeOnPathRequired=false`');
    expect(candidateMarkdown).toContain('GitHub release `312768592` is already published and immutable with zero');
    expect(candidateMarkdown).toContain('`published-immutable-release-assets-incomplete`');

    expect(currentState).toContain('current exact released line: `v1.3.16`');
    expect(currentState).toContain('current authority package line on `main`: `1.3.16`');
    expect(currentState).toContain('current develop package line on `develop`: `1.3.16`');
    expect(currentState).toContain('active exact release candidate line on `develop`: none');
    expect(currentState).toContain('active release-candidate branch: none; retained release-candidate branches:');
    expect(currentState).toContain('npm run public:github:exact:transaction:verify');
    expect(currentState).toContain('npm run vscode:marketplace:install-proof');
    expect(currentState).toContain('separate public GitHub exact release publication: published;');
    expect(currentState).toContain('releases/tag/v1.3.16');
    expect(currentState).toContain('verify receipt now records `verifyGateStatus=pass`');
    expect(currentState).toContain('VS Code Marketplace retained published version: `1.3.16`');

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
