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
  it('retains the closed v1.3.9 authority/public publication state while keeping v1.3.8 as blocked history', () => {
    const state = publicationState.resolvePublicationState();
    const stateDoc = fs.readFileSync(
      path.join(repoRoot, 'docs', 'product', 'release-publication-state.md'),
      'utf8'
    );

    expect(state.authority).toMatchObject({
      system: 'gitlab',
      exactTag: 'v1.3.9',
      packageVersion: '1.3.9',
      mainCommit: '2f86063a35926fa67963af5ccd47e971157927c6',
      gitlabReleaseManifestPath:
        '.cache/gitlab-release-artifacts/v1.3.9/expanded/release-evidence/release-manifest.json'
    });
    expect(state.developPreview).toMatchObject({
      classification: 'linux-docker-validated-preview',
      stateRole: 'retained-preview-packet-evidence',
      headTrackingPolicy:
        'do-not-track-latest-develop-head; read live develop commit and pipeline state from GitLab when needed',
      retainedPacketPath: 'docs/product/linux-docker-preview-release-control-packet-2026-04-25.md',
      retainedPacketJsonPath:
        'docs/product/linux-docker-preview-release-control-packet-2026-04-25.json',
      previewEvidenceCommit: '5c85f0595065d62d4b2679a3df4bb21ba749d71a',
      packetEvidencePipelineId: 2479854355,
      packetEvidencePipelineStatus: 'success',
      retainedPacketMergeCommit: 'ebaf84eab1d779d607f4dcb6e58e990d2946779f',
      retainedPacketMergePipelineId: 2479875767,
      retainedPacketMergePipelineStatus: 'success',
      previewVsixPath: 'preview-evidence/vi-history-suite-1.3.9.vsix',
      previewVsixSha256: '7179df117c5b3c9032afbacb0b7c4a24f81229f3fbc0fd99f3ac0ed66a4c7470',
      publicationState: 'non-production-integration-evidence-only',
      windowsInstalledUserProofDeferred: true,
      publicGitHubMutation: 'not-admitted-by-this-preview-claim',
      marketplaceMutation: 'not-admitted-by-this-preview-claim'
    });
    expect(stateDoc).toContain('## Develop Preview State');
    expect(stateDoc).toContain('Linux/Docker validated preview');
    expect(stateDoc).toContain('Windows installed-user proof deferred');
    expect(stateDoc).toContain(
      'docs/product/linux-docker-preview-release-control-packet-2026-04-25.json'
    );
    expect(stateDoc).toContain('Preview state role: retained preview packet evidence');
    expect(stateDoc).toContain('Develop head tracking policy: do not persist the latest live');
    expect(stateDoc).toContain('Public GitHub mutation: not admitted by this preview claim');
    expect(stateDoc).toContain('VS Code Marketplace mutation: not admitted by this preview claim');
    expect(state.developPreview.currentDevelopCommit).toBeUndefined();
    expect(state.developPreview.currentDevelopPipelineId).toBeUndefined();
    expect(state.publicGitHub.release).toMatchObject({
      id: 312994104,
      tag: 'v1.3.9',
      published: true,
      immutable: true,
      assetCount: 2,
      assetStatus: 'published-complete'
    });
    expect(state.marketplace).toMatchObject({
      itemName: 'svelderrainruiz.vi-history-suite',
      currentPublishedVersion: '1.3.10',
      currentPublishedKind: 'community-validation-pre-release',
      currentRegularPublishedVersion: '1.3.9',
      currentPreReleaseVersion: '1.3.10',
      expectedVersion: '1.3.9',
      status: 'community-validation-preview-published-and-verified',
      windowsExactVsixInstallProof: {
        packageScript: 'npm run vscode:marketplace:install-proof',
        receiptPath: '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json',
        status: 'passed',
        authorityTag: 'v1.3.9',
        runtimeValidationOutcome: 'ready',
        launcherPathStrippedToLauncherAndSystem32: true,
        ambientNodeOnPathRequired: false
      }
    });
    expect(state.marketplaceCommunityValidationPreview).toMatchObject({
      status: 'published-and-verified',
      publicationClaim: 'community-validation-preview',
      preparePackageScript: 'npm run vscode:marketplace:community-preview:prepare',
      prepReceiptPath:
        '.cache/vscode-marketplace-community-validation-preview-prep/latest/vscode-marketplace-community-validation-preview-prep.json',
      preferredVsceMode: 'pre-release',
      targetVersionPolicy:
        'must-be-distinct-higher-major-minor-patch-than-current-marketplace-version',
      currentMarketplaceVersion: '1.3.9',
      targetVersion: '1.3.10',
      packageVersion: '1.3.10',
      publishedVersion: '1.3.10',
      publishedDate: '2026-04-25',
      marketplaceLastUpdated: '2026-04-26T00:05:09.09Z',
      previewVsixPath: 'preview-evidence/vi-history-suite-1.3.10.vsix',
      previewVsixSha256: 'da09af0d288db60870c1a8125667303c710159c80c06ff2deda02a76e5085705',
      publishTrigger: 'user-said-publish-it-now',
      windowsLabviewFeaturePolicy: 'user-selectable-with-proof-status-disclosure',
      windowsInstalledUserProofState: 'deferred',
      traceabilityMatrixPath: 'docs/requirements/rtm.csv',
      publicGitHubMutation: 'not-mutated-by-community-validation-preview-publication',
      marketplaceMutation: 'published-community-validation-preview'
    });
    expect(stateDoc).toContain('## Marketplace Community-Validation Preview Path');
    expect(stateDoc).toContain('`npm run vscode:marketplace:community-preview:prepare`');
    expect(stateDoc).toContain('Status: published and verified');
    expect(stateDoc).toContain('Target preview version: `1.3.10`');
    expect(stateDoc).toContain('Published preview version: `1.3.10`');
    expect(stateDoc).toContain(
      'Windows/LabVIEW feature policy: provider, year, and bitness choices may stay'
    );
    expect(state.incident).toMatchObject({
      active: false,
      classification: 'externally-blocked-publication',
      blockerCode: 'published-immutable-release-assets-incomplete',
      status: 'retained-history'
    });
    expect(state.activeCandidate).toMatchObject({
      releaseBranch: null,
      tag: null,
      packageVersion: '1.3.10',
      status: 'marketplace-community-validation-preview-line'
    });

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
      currentMarketplaceVersion: '1.3.10'
    });
  });
});
