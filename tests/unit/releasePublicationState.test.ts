import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const publicationState = require(path.join(
  repoRoot,
  'scripts',
  'releasePublicationState.js'
)) as {
  buildMarketplaceFactoryAction: (kind: string, versionOrTag: string) => string;
  buildMarketplacePublishNextAction: (versionOrTag: string) => string;
  buildWindowsExactVsixInstallProofNextAction: (versionOrTag: string) => string;
  deriveTargetFromReceiptOrState: (
    receipt: Record<string, unknown> | null,
    fsApi?: typeof fs
  ) => {
    tag: string;
    packageVersion: string;
    marketplaceItem: string;
    currentMarketplaceVersion: string | null;
    state: Record<string, any>;
  };
  normalizeTag: (tagOrVersion: string) => string;
  resolvePublicationState: (fsApi?: typeof fs) => Record<string, any>;
  versionFromTag: (tagOrVersion: string) => string;
};

describe('release publication state resolver', () => {
  it('retains the closed v1.3.15 authority/public/Marketplace state while keeping historical lanes explicit', () => {
    const state = publicationState.resolvePublicationState();
    const stateDoc = fs.readFileSync(
      path.join(repoRoot, 'docs', 'product', 'release-publication-state.md'),
      'utf8'
    );

    expect(state.authority).toMatchObject({
      system: 'gitlab',
      exactTag: 'v1.3.15',
      packageVersion: '1.3.15',
      mainCommit: '196dd70878bf26e9722c031b9192581e5147bafb',
      tagObjectSha: '08102dafaab6b4e05ac4e62b9c7a13e1293d388b',
      tagCommitSha: '196dd70878bf26e9722c031b9192581e5147bafb',
      tagPipelineId: 2514112734,
      releaseExtensionJobId: 14297942289,
      vagrantWindowsVsixAcceptanceJobId: 14297942286,
      gitlabReleaseManifestPath:
        '.cache/gitlab-release-artifacts/v1.3.15/expanded/release-evidence/release-manifest.json',
      expectedVsixAsset: 'vi-history-suite-1.3.15.vsix',
      expectedVsixSha256:
        '157fc562a495807ec99d16ce14096ed5fe05112e5a93bd25fef0c9cbf06873c7'
    });
    expect(state.currentAuthority).toMatchObject(state.authority);
    expect(state.publicGitHub.release).toMatchObject({
      id: 320197692,
      tag: 'v1.3.15',
      published: true,
      immutable: true,
      assetCount: 2,
      assetStatus: 'published-complete'
    });
    expect(state.publicGitHub).toMatchObject({
      mainCommit: '427ab27245f6f66d186e07865f1fc0a00795611a',
      tag: 'v1.3.15',
      tagObjectSha: '28ea4253813e6f322cbcc25cdce865cdeac219a6',
      sourcePublication: {
        status: 'public-source-tag-release-and-marketplace-v1.3.15-published-and-verified',
        currentMainCommit: '427ab27245f6f66d186e07865f1fc0a00795611a',
        currentMainShortCommit: '427ab27',
        latestPublicExactReleaseCloseout: expect.objectContaining({
          status: 'published-and-verified',
          pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/83',
          publicTag: 'v1.3.15',
          publicGitHubReleaseId: 320197692,
          marketplaceVersion: '1.3.15',
          marketplaceMutation: 'published-and-verified'
        }),
        latestPublicSourceAndTagHandoffCloseout: expect.objectContaining({
          pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/69',
          publicTag: 'v1.3.14',
          publicGitHubReleasePublication: 'not-performed',
          marketplaceMutation: 'not-performed'
        }),
        latestWindowsDockerDesktopIntakePromotionCloseout: expect.objectContaining({
          pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/68',
          publicLabelsApplied: ['windows-docker-desktop'],
          marketplaceMutation: 'not-performed'
        })
      }
    });
    expect(state.marketplace).toMatchObject({
      itemName: 'svelderrainruiz.vi-history-suite',
      currentPublishedVersion: '1.3.15',
      currentPublishedKind: 'exact-release',
      currentRegularPublishedVersion: '1.3.15',
      currentPreReleaseVersion: '1.3.13',
      expectedVersion: '1.3.16',
      status: 'published-exact-release-1.3.15',
      windowsExactVsixInstallProof: {
        packageScript: 'npm run vscode:marketplace:install-proof',
        receiptPath: '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json',
        status: 'passed',
        authorityTag: 'v1.3.15',
        packageVersion: '1.3.15',
        runtimeValidationOutcome: 'ready',
        launcherPathStrippedToLauncherAndSystem32: true,
        ambientNodeOnPathRequired: false
      }
    });
    expect(state.exactReleaseCloseoutV1315).toMatchObject({
      status: 'published-and-verified',
      authority: expect.objectContaining({
        exactTag: 'v1.3.15',
        mainCommit: '196dd70878bf26e9722c031b9192581e5147bafb'
      }),
      publicGitHub: expect.objectContaining({
        mainCommit: '427ab27245f6f66d186e07865f1fc0a00795611a',
        tag: 'v1.3.15',
        releaseId: 320197692
      }),
      marketplace: expect.objectContaining({
        currentPublishedVersion: '1.3.15',
        lastUpdated: '2026-05-10T22:22:37.663Z'
      })
    });
    expect(state.developPreview).toMatchObject({
      classification:
        'linux-docker-linux-host-windows-host-labview-and-vagrant-vsix-validated-preview',
      linuxHostLabviewProofState: 'admitted-local-maintainer-proof',
      windowsInstalledUserProofState: 'admitted-for-host-labview-2026-x64',
      windowsDockerDesktopProofState: 'community-deferred'
    });
    expect(state.marketplaceCommunityValidationPreview).toMatchObject({
      status: 'published-and-verified',
      targetVersion: '1.3.13',
      publishedVersion: '1.3.13',
      marketplaceLastUpdated: '2026-04-27T04:24:05.457Z',
      windowsInstalledUserProofState: 'admitted-for-host-labview-2026-x64'
    });
    expect(state.releaseBranchOpening).toMatchObject({
      status: 'performed-and-retained',
      releaseBranch: 'release/1.3.16',
      pipelineStatus: 'success',
      vagrantVsixAcceptanceJobId: 14309562384
    });
    expect(state.releaseBranchReadinessReassessment).toMatchObject({
      status: 'main-promotion-admissible-as-separate-governed-action',
      releaseBranch: 'release/1.3.16',
      mainIsAncestorOfReleaseBranch: true,
      topologyRefreshRequired: false,
      releaseBranchVagrantVsixAcceptanceJobId: 14309562384,
      protectedDevelopVagrantVsixAcceptanceJobId: 14310323541,
      nextAdmittedAction: 'promote-release-1.3.16-to-main-as-separate-governed-action'
    });
    expect(state.publicGitHubSourceAndTagHandoff).toMatchObject({
      status: 'public-source-and-tag-published-release-publication-blocked',
      publicPullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/69',
      publicTag: 'v1.3.14',
      publicGitHubReleasePublication: 'not-performed',
      marketplaceMutation: 'not-performed'
    });
    expect(state.incident).toMatchObject({
      active: false,
      classification: 'externally-blocked-publication',
      blockerCode: 'published-immutable-release-assets-incomplete',
      status: 'retained-history'
    });
    expect(state.activeCandidate).toMatchObject({
      packageVersion: '1.3.16',
      tag: 'v1.3.16',
      branch: 'release/1.3.16',
      state: 'release-branch-readiness-reassessed-main-promotion-admissible'
    });
    expect(state.nextAdmittedAction).toBe(
      'promote-release-1.3.16-to-main-as-separate-governed-action'
    );

    expect(stateDoc).toContain('Fully closed authority exact tag: `v1.3.15`');
    expect(stateDoc).toContain('Current authority exact tag: `v1.3.15`');
    expect(stateDoc).toContain('Public GitHub `main`: `427ab27245f6f66d186e07865f1fc0a00795611a`');
    expect(stateDoc).toContain('Public GitHub release id: `320197692`');
    expect(stateDoc).toContain('## Exact Release Closeout v1.3.15');
    expect(stateDoc).toContain('VS Code Marketplace version: `1.3.15`');
    expect(stateDoc).toContain(
      '.cache/public-github-exact-v1.3.15-verify-after-marketplace/public-github-exact-release-transaction.json'
    );
    expect(stateDoc).toContain('## Marketplace Community-Validation Preview Path');
    expect(stateDoc).toContain('## Release Branch Opening');
    expect(stateDoc).toContain('## Release Branch Readiness Reassessment');
    expect(stateDoc).toContain('## Public GitHub Source And Tag Handoff');
    expect(stateDoc).toContain('## Incident Classification');
    expect(stateDoc).toContain('blocked historical incident');
    expect(stateDoc).toContain(
      '`promote-release-1.3.16-to-main-as-separate-governed-action`'
    );

    expect(publicationState.normalizeTag('1.4.2')).toBe('v1.4.2');
    expect(publicationState.versionFromTag('v1.4.2')).toBe('1.4.2');
    expect(publicationState.buildMarketplacePublishNextAction('1.4.2')).toBe(
      'publish-v1.4.2-to-vscode-marketplace-after-explicit-production-approval'
    );
    expect(publicationState.buildWindowsExactVsixInstallProofNextAction('v1.4.2')).toBe(
      'retain-windows-exact-vsix-install-proof-for-v1.4.2-before-marketplace-publication'
    );
    expect(publicationState.buildMarketplaceFactoryAction('publishWithPinnedVsce', 'v1.4.2')).toBe(
      'publish-vscode-marketplace-v1.4.2-with-pinned-vsce'
    );
  });

  it('derives the selected tag/version from a transaction receipt before falling back to retained state', () => {
    const derived = publicationState.deriveTargetFromReceiptOrState({
      authority: {
        tag: 'v9.8.7',
        packageVersion: '9.8.7'
      },
      marketplace: {
        marketplaceItem: 'publisher.extension'
      }
    });

    expect(derived).toMatchObject({
      tag: 'v9.8.7',
      packageVersion: '9.8.7',
      marketplaceItem: 'svelderrainruiz.vi-history-suite',
      currentMarketplaceVersion: '1.3.15'
    });
  });
});
