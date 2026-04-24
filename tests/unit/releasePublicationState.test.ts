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

    expect(state.authority).toMatchObject({
      system: 'gitlab',
      exactTag: 'v1.3.9',
      packageVersion: '1.3.9',
      mainCommit: '2f86063a35926fa67963af5ccd47e971157927c6',
      gitlabReleaseManifestPath:
        '.cache/gitlab-release-artifacts/v1.3.9/expanded/release-evidence/release-manifest.json'
    });
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
      currentPublishedVersion: '1.3.9',
      expectedVersion: '1.3.9',
      status: 'published-and-verified',
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
    expect(state.incident).toMatchObject({
      active: false,
      classification: 'externally-blocked-publication',
      blockerCode: 'published-immutable-release-assets-incomplete',
      status: 'retained-history'
    });
    expect(state.activeCandidate).toMatchObject({
      releaseBranch: null,
      tag: null,
      packageVersion: '1.3.9',
      status: 'no-active-release-line'
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
      currentMarketplaceVersion: '1.3.9'
    });
  });
});
