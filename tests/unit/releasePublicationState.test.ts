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
  it('retains the closed v1.3.16 authority/public/Marketplace state while keeping historical lanes explicit', () => {
    const state = publicationState.resolvePublicationState();
    const stateDoc = fs.readFileSync(
      path.join(repoRoot, 'docs', 'product', 'release-publication-state.md'),
      'utf8'
    );

    expect(state.authority).toMatchObject({
      system: 'gitlab',
      exactTag: 'v1.3.16',
      packageVersion: '1.3.16',
      mainCommit: '9c8e0a8503a84cba5d0ea722dd1497a35f52326c',
      tagObjectSha: 'a1f3d173ed8f89eaf4b71bdcd799a0c3eb01a84d',
      tagCommitSha: '9c8e0a8503a84cba5d0ea722dd1497a35f52326c',
      tagPipelineId: 2517275332,
      releaseExtensionJobId: 14317413309,
      vagrantWindowsVsixAcceptanceJobId: 14317413306,
      gitlabReleaseManifestPath:
        '.cache/gitlab-release-artifacts/v1.3.16/expanded/release-evidence/release-manifest.json',
      expectedVsixAsset: 'vi-history-suite-1.3.16.vsix',
      expectedVsixSha256:
        '56bc9b222ec859f530ea523eed215b2efde4ce96fa9fcc4974f6589da3b81170'
    });
    expect(state.currentAuthority).toMatchObject(state.authority);
    expect(state.publicGitHub.release).toMatchObject({
      id: 320824958,
      tag: 'v1.3.16',
      published: true,
      immutable: true,
      assetCount: 2,
      assetStatus: 'published-complete'
    });
    expect(state.publicGitHub).toMatchObject({
      mainCommit: 'fe4b15894d8417e6f1e0d234cb19bd945ef716c3',
      tag: 'v1.3.16',
      tagObjectSha: 'f6ca389269dac140dc416d76bb4c2ac142664567',
      sourcePublication: {
        status:
          'public-main-post-v1.3.16-installed-user-support-matrix-and-intake-normalization; exact-v1.3.16-tag-release-and-marketplace-retained',
        currentMainCommit: 'fe4b15894d8417e6f1e0d234cb19bd945ef716c3',
        currentMainShortCommit: 'fe4b1589',
        latestPublicExactReleaseCloseout: expect.objectContaining({
          status: 'published-and-verified',
          pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/88',
          publicTag: 'v1.3.16',
          publicGitHubReleaseId: 320824958,
          marketplaceVersion: '1.3.16',
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
        }),
        latestInstalledUserSupportMatrixAdoption: expect.objectContaining({
          status: 'published-and-verified',
          pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/89',
          publicMainCommit: '90b6e600ea025aeb238832cf91fe15ff2b0c7db8',
          publicMainShortCommit: '90b6e600',
          marketplaceMutation: 'not-performed',
          releaseMutation: 'not-performed'
        }),
        latestV1316IntakeSurfaceNormalization: expect.objectContaining({
          status: 'published-and-verified',
          publicPullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/90',
          publicMainCommit: 'fe4b15894d8417e6f1e0d234cb19bd945ef716c3',
          publicMainShortCommit: 'fe4b1589',
          marketplaceMutation: 'not-performed',
          releaseMutation: 'not-performed'
        })
      }
    });
    expect(state.marketplace).toMatchObject({
      itemName: 'svelderrainruiz.vi-history-suite',
      currentPublishedVersion: '1.3.16',
      currentPublishedKind: 'exact-release',
      currentRegularPublishedVersion: '1.3.16',
      currentPreReleaseVersion: '1.3.13',
      expectedVersion: '1.3.16',
      status: 'published-exact-release-1.3.16',
      windowsExactVsixInstallProof: {
        packageScript: 'npm run vscode:marketplace:install-proof',
        receiptPath: '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json',
        status: 'passed',
        authorityTag: 'v1.3.16',
        packageVersion: '1.3.16',
        runtimeValidationOutcome: 'ready',
        launcherPathStrippedToLauncherAndSystem32: true,
        ambientNodeOnPathRequired: false
      }
    });
    expect(state.exactReleaseCloseout).toMatchObject({
      status: 'published-and-verified',
      version: '1.3.16',
      tag: 'v1.3.16',
      authorityMainCommit: '9c8e0a8503a84cba5d0ea722dd1497a35f52326c',
      publicMainCommit: 'f679023ed760963779d9331a9395128ad01c7e54',
      publicGitHubReleaseId: 320824958,
      marketplaceVersion: '1.3.16',
      marketplaceLastUpdated: '2026-05-11T23:10:13.317Z'
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
    expect(state.activeCandidate).toBeNull();
    expect(state.nextAdmittedAction).toBe(
      'retain-v1.3.16-marketplace-closeout-on-protected-develop'
    );

    expect(stateDoc).toContain('Fully closed authority exact tag: `v1.3.16`');
    expect(stateDoc).toContain('Current authority exact tag: `v1.3.16`');
    expect(stateDoc).toContain('Public GitHub `main`: `fe4b15894d8417e6f1e0d234cb19bd945ef716c3`');
    expect(stateDoc).toContain('Public GitHub release id: `320824958`');
    expect(stateDoc).toContain('## Exact Release Closeout v1.3.16');
    expect(stateDoc).toContain('## Public GitHub Installed-User Support Matrix Adoption');
    expect(stateDoc).toContain('## Public GitHub v1.3.16 Intake Surface Normalization');
    expect(stateDoc).toContain('VS Code Marketplace version: `1.3.16`');
    expect(stateDoc).toContain(
      '.cache/public-github-exact-v1.3.16-verify-after-marketplace/public-github-exact-release-transaction.json'
    );
    expect(stateDoc).toContain('## Marketplace Community-Validation Preview Path');
    expect(stateDoc).toContain('## Release Branch Opening');
    expect(stateDoc).toContain('## Release Branch Readiness Reassessment');
    expect(stateDoc).toContain('## Public GitHub Source And Tag Handoff');
    expect(stateDoc).toContain('## Incident Classification');
    expect(stateDoc).toContain('blocked historical incident');
    expect(stateDoc).toContain(
      '`retain-v1.3.16-marketplace-closeout-on-protected-develop`'
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
      currentMarketplaceVersion: '1.3.16'
    });
  });
});
