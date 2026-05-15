import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const verification = require(path.join(
  repoRoot,
  'scripts',
  'verifyVsCodeMarketplacePublication.js'
)) as {
  DEFAULT_EVIDENCE_DIR: string;
  DEFAULT_MARKETPLACE_ITEM: string;
  buildMarkdown: (report: Record<string, any>) => string;
  buildVerificationReport: (
    options: Record<string, unknown>,
    deps?: Record<string, unknown>
  ) => Promise<Record<string, any>>;
  parseArgs: (argv: string[]) => Record<string, any>;
};

function fakeFs(existingPaths: string[] = []): typeof fs {
  const normalized = new Set(existingPaths.map((value) => path.normalize(value)));
  return {
    ...fs,
    existsSync: (targetPath: fs.PathLike) => normalized.has(path.normalize(String(targetPath)))
  } as typeof fs;
}

describe('VS Code Marketplace post-publication verification', () => {
  it('retains a deterministic non-mutating CLI contract', () => {
    const parsed = verification.parseArgs([
      '--expected-version',
      '1.3.16',
      '--marketplace-item',
      'svelderrainruiz.vi-history-suite',
      '--evidence-dir',
      'artifacts/marketplace-verify',
      '--clean-install-validation',
      'deferred',
      '--defer-reason',
      'clean profile validation deferred in CI'
    ]);

    expect(parsed).toMatchObject({
      helpRequested: false,
      expectedVersion: '1.3.16',
      marketplaceItem: 'svelderrainruiz.vi-history-suite',
      evidenceDir: path.resolve('artifacts/marketplace-verify'),
      cleanInstallValidation: 'deferred',
      installValidationReceipt: null,
      deferReason: 'clean profile validation deferred in CI'
    });
    expect(verification.DEFAULT_MARKETPLACE_ITEM).toBe('svelderrainruiz.vi-history-suite');
    expect(verification.DEFAULT_EVIDENCE_DIR).toContain(
      '.cache/vscode-marketplace-post-publication-verification/latest'
    );
  });

  it('records a passing gallery readback and explicitly deferred clean install validation', async () => {
    const report = await verification.buildVerificationReport(
      {
        expectedVersion: '1.3.16',
        marketplaceItem: 'svelderrainruiz.vi-history-suite',
        evidenceDir: path.join(
          repoRoot,
          '.cache',
          'vscode-marketplace-post-publication-verification',
          'latest'
        ),
        cleanInstallValidation: 'deferred',
        installValidationReceipt: null,
        deferReason: 'clean profile validation deferred because retained exact-VSIX install proof is already available'
      },
      {
        now: () => '2026-05-15T13:50:00.000Z',
        fetchMarketplaceState: async () => ({
          statusCode: 200,
          marketplaceItem: 'svelderrainruiz.vi-history-suite',
          currentPublishedVersion: '1.3.16',
          currentPublishedVersionLastUpdated: '2026-05-11T23:10:13.317Z',
          latestMarketplaceVersion: '1.3.16',
          latestMarketplaceVersionLastUpdated: '2026-05-11T23:10:13.317Z',
          latestPreReleaseVersion: '1.3.13',
          latestPreReleaseVersionLastUpdated: '2026-04-27T04:24:05.457Z',
          found: true
        })
      }
    );

    expect(report.status).toBe('pass');
    expect(report.productionMutationAttempted).toBe(false);
    expect(report.marketplace).toMatchObject({
      marketplaceItem: 'svelderrainruiz.vi-history-suite',
      expectedVersion: '1.3.16',
      observedVersion: '1.3.16',
      observedUpdateTimestamp: '2026-05-11T23:10:13.317Z',
      versionMatches: true
    });
    expect(report.cleanInstallValidation).toMatchObject({
      status: 'deferred',
      performed: false,
      deferred: true
    });
    expect(report.ledgerNormalizationFields).toMatchObject({
      marketplaceItemId: 'svelderrainruiz.vi-history-suite',
      expectedVersion: '1.3.16',
      observedVersion: '1.3.16',
      observedUpdateTimestamp: '2026-05-11T23:10:13.317Z',
      queryTimestamp: '2026-05-15T13:50:00.000Z',
      cleanInstallValidationStatus: 'deferred'
    });

    const markdown = verification.buildMarkdown(report);
    expect(markdown).toContain('# VS Code Marketplace Post-Publication Verification');
    expect(markdown).toContain('Observed version: 1.3.16');
    expect(markdown).toContain('Clean install validation status: deferred');
    expect(markdown).toContain('No VS Code Marketplace publication was attempted');
  });

  it('fails closed when Marketplace does not serve the expected version', async () => {
    const report = await verification.buildVerificationReport(
      {
        expectedVersion: '1.3.16',
        marketplaceItem: 'svelderrainruiz.vi-history-suite',
        evidenceDir: path.join(repoRoot, '.cache', 'marketplace-verify'),
        cleanInstallValidation: 'deferred',
        installValidationReceipt: null,
        deferReason: 'deferred'
      },
      {
        now: () => '2026-05-15T13:51:00.000Z',
        fetchMarketplaceState: async () => ({
          statusCode: 200,
          marketplaceItem: 'svelderrainruiz.vi-history-suite',
          currentPublishedVersion: '1.3.15',
          currentPublishedVersionLastUpdated: '2026-05-10T00:00:00.000Z',
          found: true
        })
      }
    );

    expect(report.status).toBe('fail');
    expect(report.marketplace.versionMatches).toBe(false);
    expect(report.failure).toMatchObject({
      marketplaceFound: true,
      versionMatches: false,
      cleanInstallValidationStatus: 'deferred'
    });
  });

  it('requires and verifies a receipt path when clean install validation is performed', async () => {
    expect(() =>
      verification.parseArgs(['--clean-install-validation', 'performed'])
    ).toThrow('--install-validation-receipt is required');

    const receiptPath = path.join(repoRoot, '.cache', 'clean-profile-install.json');
    const report = await verification.buildVerificationReport(
      {
        expectedVersion: '1.3.16',
        marketplaceItem: 'svelderrainruiz.vi-history-suite',
        evidenceDir: path.join(repoRoot, '.cache', 'marketplace-verify'),
        cleanInstallValidation: 'performed',
        installValidationReceipt: '.cache/clean-profile-install.json',
        deferReason: 'unused'
      },
      {
        fs: fakeFs([receiptPath]),
        now: () => '2026-05-15T13:52:00.000Z',
        fetchMarketplaceState: async () => ({
          statusCode: 200,
          marketplaceItem: 'svelderrainruiz.vi-history-suite',
          currentPublishedVersion: '1.3.16',
          currentPublishedVersionLastUpdated: '2026-05-11T23:10:13.317Z',
          found: true
        })
      }
    );

    expect(report.status).toBe('pass');
    expect(report.cleanInstallValidation).toMatchObject({
      status: 'performed',
      performed: true,
      receiptPath: '.cache/clean-profile-install.json',
      receiptExists: true
    });
  });
});
