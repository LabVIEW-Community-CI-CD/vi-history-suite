import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const prep = require(path.join(
  repoRoot,
  'scripts',
  'prepareMarketplaceCommunityValidationPreview.js'
)) as {
  DEFAULT_EVIDENCE_DIR: string;
  DEFAULT_MARKETPLACE_ITEM: string;
  buildPlannedVsceCommands: (packagePath: string) => Record<string, any>;
  buildPrepReport: (
    options: Record<string, unknown>,
    deps?: Record<string, unknown>
  ) => Record<string, any>;
  compareMarketplaceVersions: (left: string, right: string) => number;
  normalizeMarketplaceVersion: (version: string) => string;
  parseArgs: (argv: string[]) => Record<string, unknown>;
};

function fakeFs(packageVersion = '1.3.9'): typeof fs {
  const files = new Map<string, string>([
    [
      path.normalize(path.join(repoRoot, 'package.json')),
      JSON.stringify({
        name: 'vi-history-suite',
        version: packageVersion
      })
    ],
    [
      path.normalize(path.join(repoRoot, 'docs/product/vscode-marketplace-publication-ledger.json')),
      JSON.stringify({
        listingUrl: 'https://marketplace.visualstudio.com/items?itemName=svelderrainruiz.vi-history-suite',
        currentPublishedVersion: '1.3.9'
      })
    ],
    [
      path.normalize(path.join(repoRoot, 'docs/product/release-publication-state.json')),
      JSON.stringify({
        schema: 'vi-history-suite/release-publication-state@v1',
        authority: {
          exactTag: 'v1.3.9',
          packageVersion: '1.3.9'
        },
        developPreview: {
          classification: 'linux-docker-validated-preview',
          retainedPacketPath: 'docs/product/linux-docker-preview-release-control-packet-2026-04-25.md',
          retainedPacketJsonPath:
            'docs/product/linux-docker-preview-release-control-packet-2026-04-25.json',
          previewEvidenceCommit: '5c85f0595065d62d4b2679a3df4bb21ba749d71a',
          packetEvidencePipelineId: 2479854355,
          retainedPacketMergeCommit: 'ebaf84eab1d779d607f4dcb6e58e990d2946779f',
          retainedPacketMergePipelineId: 2479875767,
          previewVsixPath: 'preview-evidence/vi-history-suite-1.3.9.vsix',
          previewVsixSha256:
            '7179df117c5b3c9032afbacb0b7c4a24f81229f3fbc0fd99f3ac0ed66a4c7470'
        },
        marketplace: {
          itemName: 'svelderrainruiz.vi-history-suite',
          currentPublishedVersion: '1.3.9'
        }
      })
    ]
  ]);

  return {
    ...fs,
    existsSync: (targetPath: fs.PathLike) => files.has(path.normalize(String(targetPath))),
    readFileSync: (targetPath: fs.PathOrFileDescriptor, encoding?: BufferEncoding | null) => {
      const value = files.get(path.normalize(String(targetPath)));
      if (value === undefined) {
        throw new Error(`Unexpected read: ${String(targetPath)}`);
      }
      return encoding ? value : Buffer.from(value);
    }
  } as typeof fs;
}

describe('Marketplace community-validation preview prep', () => {
  it('retains a deterministic prep-only CLI surface', () => {
    expect(prep.parseArgs([])).toEqual({
      helpRequested: false,
      evidenceDir: prep.DEFAULT_EVIDENCE_DIR,
      marketplaceItem: 'svelderrainruiz.vi-history-suite',
      targetVersion: null,
      packagePath: null
    });
    expect(prep.DEFAULT_MARKETPLACE_ITEM).toBe('svelderrainruiz.vi-history-suite');
    expect(prep.normalizeMarketplaceVersion('1.3.10')).toBe('1.3.10');
    expect(() => prep.normalizeMarketplaceVersion('1.3.10-preview.1')).toThrow(
      /major\.minor\.patch/
    );
    expect(prep.compareMarketplaceVersions('1.3.10', '1.3.9')).toBe(1);
  });

  it('prepares a non-mutating receipt and blocks reuse of the current Marketplace version', () => {
    const report = prep.buildPrepReport(
      {
        evidenceDir: prep.DEFAULT_EVIDENCE_DIR,
        marketplaceItem: 'svelderrainruiz.vi-history-suite',
        targetVersion: '1.3.9'
      },
      { fs: fakeFs() }
    );

    expect(report).toMatchObject({
      schema: 'vi-history-suite/vscode-marketplace-community-validation-preview-prep@v1',
      status: 'prepared-with-blockers',
      productionMutationAttempted: false,
      publicGitHubMutationAttempted: false,
      marketplaceMutationAttempted: false,
      publicationClaim: 'community-validation-preview',
      activePreviewClaim: 'linux-docker-validated-preview',
      targetVersion: '1.3.9',
      currentMarketplaceVersion: '1.3.9',
      windowsInstalledUserProof: {
        state: 'deferred',
        claimMade: false
      },
      windowsLabviewFeatures: {
        selectionPolicy: 'user-selectable-with-proof-status-disclosure',
        unsupportedOrBlockedRuntimeBehavior: 'fail-closed-with-visible-next-step-guidance'
      },
      readiness: {
        versionReadiness: 'blocked-until-distinct-marketplace-version',
        packageManifestReadiness: 'ready-target-version-in-package-manifest',
        packageArtifactReadiness: 'ready-target-versioned-vsix-path',
        publishReadiness: 'prepared-with-blockers-before-user-says-publish-it-now'
      },
      nextAction: 'resolve-version-and-package-blockers-before-user-says-publish-it-now'
    });
    expect(report.evidence.proofDisclosureSurfaces).toContain('docs/requirements/rtm.csv');
    expect(report.vsce.plannedPublishCommand.display).toContain('--pre-release');
    expect(report.vsce.plannedPublishCommand.display).toContain('--pat <redacted>');
  });

  it('marks a distinct target as ready only when package manifest and VSIX path match it', () => {
    const report = prep.buildPrepReport(
      {
        evidenceDir: prep.DEFAULT_EVIDENCE_DIR,
        marketplaceItem: 'svelderrainruiz.vi-history-suite',
        targetVersion: '1.3.10'
      },
      { fs: fakeFs('1.3.10') }
    );

    expect(report.status).toBe('prepared');
    expect(report.package.packageJsonVersion).toBe('1.3.10');
    expect(report.package.packagePath).toBe('preview-evidence/vi-history-suite-1.3.10.vsix');
    expect(report.readiness).toMatchObject({
      versionReadiness: 'ready-distinct-higher-marketplace-version',
      packageManifestReadiness: 'ready-target-version-in-package-manifest',
      packageArtifactReadiness: 'ready-target-versioned-vsix-path',
      publishReadiness: 'prepared-awaiting-user-says-publish-it-now',
      blockers: []
    });
    expect(report.nextAction).toBe('await-user-says-publish-it-now');
  });

  it('retains pinned pre-release package and publish command shapes', () => {
    const commands = prep.buildPlannedVsceCommands(
      path.join(repoRoot, 'preview-evidence', 'vi-history-suite-1.3.10.vsix')
    );

    expect(commands.packageCommand.display).toBe(
      'node scripts/runPinnedVsce.js package --pre-release --out preview-evidence/vi-history-suite-1.3.10.vsix'
    );
    expect(commands.publishCommand.display).toBe(
      'node scripts/runPinnedVsce.js publish --pre-release --packagePath preview-evidence/vi-history-suite-1.3.10.vsix --pat <redacted>'
    );
    expect(commands.packageCommand.pinnedPackage).toBe('@vscode/vsce@3.7.1');
  });
});
