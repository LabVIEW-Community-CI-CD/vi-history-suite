import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const closeoutAssert = require(path.join(
  repoRoot,
  'scripts',
  'assertReleaseAuthorityLedgerCloseout.js'
)) as {
  REQUIRED_CLOSEOUT_FIELDS: string[];
  REQUIRED_LEDGER_FILES: string[];
  assertReleaseAuthorityLedgerCloseout: (fsApi?: typeof fs) => {
    status: string;
    checkedFiles: string[];
    requiredCloseoutFields: string[];
    requiredLedgerFiles: string[];
    issues: string[];
  };
};

function fakeFs(releaseState: Record<string, unknown>, marketplaceLedger: Record<string, unknown>): typeof fs {
  return {
    ...fs,
    readFileSync: (targetPath: fs.PathOrFileDescriptor, encoding?: BufferEncoding | null) => {
      const normalized = path.normalize(String(targetPath));
      if (normalized.endsWith(path.normalize('docs/product/release-publication-state.json'))) {
        const value = JSON.stringify(releaseState);
        return encoding ? value : Buffer.from(value);
      }
      if (normalized.endsWith(path.normalize('docs/product/vscode-marketplace-publication-ledger.json'))) {
        const value = JSON.stringify(marketplaceLedger);
        return encoding ? value : Buffer.from(value);
      }
      throw new Error(`Unexpected read: ${String(targetPath)}`);
    }
  } as typeof fs;
}

function buildCloseout(overrides: Record<string, unknown> = {}) {
  return {
    marketplaceItemId: 'svelderrainruiz.vi-history-suite',
    expectedVersion: '1.3.16',
    observedMarketplaceVersion: '1.3.16',
    publicationTimestamp: '2026-05-11T23:10:13.317Z',
    verificationTimestamp: '2026-05-15T14:54:18.025Z',
    packageSha256: '56bc9b222ec859f530ea523eed215b2efde4ce96fa9fcc4974f6589da3b81170',
    publicGitHubReleaseState: 'published',
    marketplacePublicationState: 'published-and-verified',
    proofReceiptPaths: {
      publicGitHubExactTransaction:
        '.cache/public-github-exact-v1.3.16-verify-after-marketplace/public-github-exact-release-transaction.json',
      marketplacePreparation:
        '.cache/vscode-marketplace-publication-prep/v1.3.16-marketplace-verified/vscode-marketplace-publication-prep.json',
      marketplacePostPublicationVerification:
        '.cache/vscode-marketplace-post-publication-verification/latest/vscode-marketplace-post-publication-verification.json',
      windowsExactVsixInstallProof:
        '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json'
    },
    ...overrides
  };
}

function buildReleaseState(closeout = buildCloseout()) {
  return {
    publicGitHub: {
      release: {
        published: true
      }
    },
    postPublicationLedgerNormalization: {
      normalizedCloseoutPath: 'marketplacePostPublicationCloseout',
      requiredLedgerFiles: closeoutAssert.REQUIRED_LEDGER_FILES
    },
    marketplacePostPublicationCloseout: closeout
  };
}

function buildMarketplaceLedger(closeout = buildCloseout()) {
  return {
    latestExactRelease: {
      postPublicationCloseout: closeout
    }
  };
}

describe('release authority ledger closeout assertion', () => {
  it('passes against the retained release and Marketplace ledgers', () => {
    const report = closeoutAssert.assertReleaseAuthorityLedgerCloseout();

    expect(report).toMatchObject({
      status: 'passed',
      checkedFiles: [
        'docs/product/release-publication-state.json',
        'docs/product/vscode-marketplace-publication-ledger.json'
      ],
      issues: []
    });
    expect(report.requiredCloseoutFields).toEqual(
      expect.arrayContaining([
        'marketplaceItemId',
        'expectedVersion',
        'observedMarketplaceVersion',
        'publicationTimestamp',
        'verificationTimestamp',
        'packageSha256',
        'proofReceiptPaths.marketplacePostPublicationVerification'
      ])
    );
  });

  it('fails closed when a required closeout field or ledger file is missing', () => {
    const releaseCloseout = buildCloseout({ verificationTimestamp: '' });
    const ledgerCloseout = buildCloseout();
    const releaseState = buildReleaseState(releaseCloseout);
    (releaseState.postPublicationLedgerNormalization.requiredLedgerFiles as string[]) =
      closeoutAssert.REQUIRED_LEDGER_FILES.filter(
        (file) => file !== 'docs/product/public-github-source-publication-ledger.json'
      );

    const report = closeoutAssert.assertReleaseAuthorityLedgerCloseout(
      fakeFs(releaseState, buildMarketplaceLedger(ledgerCloseout))
    );

    expect(report.status).toBe('failed');
    expect(report.issues).toEqual(
      expect.arrayContaining([
        'release-publication-state.json missing marketplacePostPublicationCloseout.verificationTimestamp',
        'postPublicationLedgerNormalization.requiredLedgerFiles missing docs/product/public-github-source-publication-ledger.json'
      ])
    );
  });

  it('fails closed when release state and Marketplace ledger closeout values diverge', () => {
    const report = closeoutAssert.assertReleaseAuthorityLedgerCloseout(
      fakeFs(
        buildReleaseState(buildCloseout({ observedMarketplaceVersion: '1.3.16' })),
        buildMarketplaceLedger(buildCloseout({ observedMarketplaceVersion: '1.3.15' }))
      )
    );

    expect(report.status).toBe('failed');
    expect(report.issues).toEqual(
      expect.arrayContaining([
        'closeout field mismatch for observedMarketplaceVersion: release=1.3.16 ledger=1.3.15'
      ])
    );
  });
});
