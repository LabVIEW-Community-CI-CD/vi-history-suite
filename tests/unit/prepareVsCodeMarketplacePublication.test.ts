import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const vsixBuffer = Buffer.from('exact-vsix');
const vsixSha256 = crypto.createHash('sha256').update(vsixBuffer).digest('hex');
const checksumBuffer = Buffer.from(`${vsixSha256}  vi-history-suite-1.3.7.vsix\n`);
const checksumSha256 = crypto.createHash('sha256').update(checksumBuffer).digest('hex');
const manifestPath = path.join(
  repoRoot,
  '.cache',
  'gitlab-release-artifacts',
  'v1.3.7',
  'expanded',
  'release-evidence',
  'release-manifest.json'
);
const checksumPath = path.join(
  repoRoot,
  '.cache',
  'gitlab-release-artifacts',
  'v1.3.7',
  'expanded',
  'release-evidence',
  'vi-history-suite-1.3.7.vsix.sha256'
);
const vsixPath = path.join(
  repoRoot,
  '.cache',
  'gitlab-release-artifacts',
  'v1.3.7',
  'expanded',
  'release-evidence',
  'vi-history-suite-1.3.7.vsix'
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const prep = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'prepareVsCodeMarketplacePublication.js'
)) as {
  DEFAULT_EVIDENCE_DIR: string;
  DEFAULT_MARKETPLACE_ITEM: string;
  buildPlannedVscePublishCommand: (vsixPath: string) => {
    command: string;
    args: string[];
    display: string;
    pinnedPackage: string;
  };
  buildPrepReport: (
    options: Record<string, unknown>,
    deps?: Record<string, unknown>
  ) => Promise<Record<string, any>>;
  parseArgs: (argv: string[]) => Record<string, unknown>;
};

function fakeFs(): typeof fs {
  const files = new Map<string, string | Buffer>([
    [
      path.normalize(path.join(repoRoot, 'docs/product/public-release-candidate.json')),
      JSON.stringify({ versionLine: '1.3.7' })
    ],
    [
      path.normalize(path.join(repoRoot, 'docs/product/vscode-marketplace-publication-ledger.json')),
      JSON.stringify({
        listingUrl: 'https://marketplace.visualstudio.com/items?itemName=svelderrainruiz.vi-history-suite',
        homepageUrl: 'https://github.com/svelderrainruiz/vi-history-suite/wiki'
      })
    ],
    [
      path.normalize(path.join(repoRoot, '.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json')),
      JSON.stringify({
        authority: {
          tag: 'v1.3.7',
          packageVersion: '1.3.7',
          mainSha: 'e1a4fc8'
        },
        publicRelease: {
          id: 312517425,
          draft: false,
          published_at: '2026-04-23T02:08:29Z',
          html_url: 'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.7'
        },
        verifyGate: {
          status: 'pass',
          allowed: true
        },
        releaseManifest: {
          manifestPath: path.relative(repoRoot, manifestPath).replaceAll(path.sep, '/'),
          checksumPath: path.relative(repoRoot, checksumPath).replaceAll(path.sep, '/'),
          manifest: {
            tag: 'v1.3.7',
            packageVersion: '1.3.7',
            vsixArtifact: {
              fileName: 'vi-history-suite-1.3.7.vsix',
              sha256: vsixSha256
            }
          },
          checksumSha256
        }
      })
    ],
    [path.normalize(manifestPath), JSON.stringify({ tag: 'v1.3.7' })],
    [path.normalize(checksumPath), checksumBuffer],
    [path.normalize(vsixPath), vsixBuffer],
    [path.normalize('D:\\tokens\\azdo.txt'), 'marketplace-pat']
  ]);

  return {
    ...fs,
    existsSync: (targetPath: fs.PathLike) => files.has(path.normalize(String(targetPath))),
    readFileSync: (targetPath: fs.PathOrFileDescriptor, encoding?: BufferEncoding | null) => {
      const value = files.get(path.normalize(String(targetPath)));
      if (value === undefined) {
        throw new Error(`Unexpected read: ${String(targetPath)}`);
      }
      if (Buffer.isBuffer(value)) {
        return encoding ? value.toString(encoding) : value;
      }
      return encoding ? value : Buffer.from(value);
    }
  } as typeof fs;
}

describe('VS Code Marketplace publication prep', () => {
  it('retains a deterministic non-mutating CLI and planned pinned-vsce command', () => {
    expect(prep.parseArgs([])).toEqual({
      helpRequested: false,
      evidenceDir: prep.DEFAULT_EVIDENCE_DIR,
      patPath: null,
      marketplaceItem: 'svelderrainruiz.vi-history-suite',
      transactionReceiptPath:
        '.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json'
    });
    expect(prep.DEFAULT_MARKETPLACE_ITEM).toBe('svelderrainruiz.vi-history-suite');
    expect(prep.buildPlannedVscePublishCommand(vsixPath)).toEqual({
      command: 'node',
      args: [
        'scripts/runPinnedVsce.js',
        'publish',
        '--packagePath',
        '.cache/gitlab-release-artifacts/v1.3.7/expanded/release-evidence/vi-history-suite-1.3.7.vsix',
        '--pat',
        '<redacted>'
      ],
      display:
        'node scripts/runPinnedVsce.js publish --packagePath .cache/gitlab-release-artifacts/v1.3.7/expanded/release-evidence/vi-history-suite-1.3.7.vsix --pat <redacted>',
      pinnedPackage: '@vscode/vsce@3.7.1'
    });
  });

  it('prepares the Marketplace act only after GitHub exact v1.3.7 is verified', async () => {
    const report = await prep.buildPrepReport(
      {
        evidenceDir: prep.DEFAULT_EVIDENCE_DIR,
        patPath: 'D:\\tokens\\azdo.txt',
        marketplaceItem: 'svelderrainruiz.vi-history-suite',
        transactionReceiptPath:
          '.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json'
      },
      {
        fs: fakeFs(),
        fetchMarketplaceState: async () => ({
          statusCode: 200,
          marketplaceItem: 'svelderrainruiz.vi-history-suite',
          currentPublishedVersion: '1.3.0',
          found: true
        })
      }
    );

    expect(report.status).toBe('ready');
    expect(report.productionMutationAttempted).toBe(false);
    expect(report.publicGitHub.verifyGateStatus).toBe('pass');
    expect(report.marketplace).toMatchObject({
      expectedVersion: '1.3.7',
      currentPublishedVersion: '1.3.0',
      nextAction: 'publish-v1.3.7-to-vscode-marketplace-after-explicit-production-approval'
    });
    expect(report.assets).toMatchObject({
      expectedVsixSha256: vsixSha256,
      observedVsixSha256: vsixSha256,
      vsixSha256Verified: true,
      checksumDeclaresExpected: true
    });
    expect(report.pat).toMatchObject({
      ok: true,
      tokenPresent: true,
      secretRetained: false
    });
    expect(report.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'public-github-exact-release-verified', status: 'pass' }),
        expect.objectContaining({ id: 'authority-vsix-evidence', status: 'pass' }),
        expect.objectContaining({ id: 'marketplace-current-version', status: 'pending' }),
        expect.objectContaining({ id: 'vsce-pat-locator', status: 'pass' }),
        expect.objectContaining({ id: 'pinned-vsce-publish-command', status: 'pass' })
      ])
    );
  });
});
