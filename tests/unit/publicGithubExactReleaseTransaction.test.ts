import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const releaseManifestPath = path.join(
  repoRoot,
  '.cache',
  'gitlab-release-artifacts',
  'v1.3.6',
  'expanded',
  'release-evidence',
  'release-manifest.json'
);
const releaseChecksumPath = path.join(
  repoRoot,
  '.cache',
  'gitlab-release-artifacts',
  'v1.3.6',
  'expanded',
  'release-evidence',
  'vi-history-suite-1.3.6.vsix.sha256'
);
const releaseManifestFixture = {
  tag: 'v1.3.6',
  packageVersion: '1.3.6',
  commitSha: '3cb238334100d01d5cfe7998e17e20a7b497b3fb',
  vsixArtifact: {
    fileName: 'vi-history-suite-1.3.6.vsix',
    sha256: '4cba0367deacc6c1917958b47a2c227692ef373fda8b8b964203a0b955906beb'
  }
};
const releaseChecksumFixture =
  '4cba0367deacc6c1917958b47a2c227692ef373fda8b8b964203a0b955906beb  vi-history-suite-1.3.6.vsix\n';
const alternateWorktreeRoot = path.join(repoRoot, '..', 'vihs-authority-retained');
const alternateReleaseManifestPath = path.join(
  alternateWorktreeRoot,
  '.cache',
  'gitlab-release-artifacts',
  'v1.3.6',
  'expanded',
  'release-evidence',
  'release-manifest.json'
);
const alternateReleaseChecksumPath = path.join(
  alternateWorktreeRoot,
  '.cache',
  'gitlab-release-artifacts',
  'v1.3.6',
  'expanded',
  'release-evidence',
  'vi-history-suite-1.3.6.vsix.sha256'
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const transaction = require(path.join(
  repoRoot,
  'scripts',
  'runPublicGithubExactReleaseTransaction.js'
)) as {
  DEFAULT_EVIDENCE_DIR: string;
  DEFAULT_MARKETPLACE_ITEM: string;
  DEFAULT_OWNER: string;
  DEFAULT_REPO: string;
  assessTransaction: (facts: Record<string, unknown>) => {
    status: string;
    phases: Array<{ id: string; status: string; summary: string }>;
    draftPublishabilityProbe: {
      status: string;
      safeToAttemptPublishDraftInPlace: boolean;
      blockerCode: string | null;
      rationale: string;
      requestedDraftReleaseId: number | null;
      draftReleaseByIdStatusCode: number | null;
      draftReleaseIdMatchesRequested: boolean;
      draftReleaseTagMatchesAuthority: boolean;
      draftReleaseTargetCommitish: string | null;
      draftReleaseLookupByTagStatusCode: number | null;
      draftReleaseHtmlUrlUsesUntaggedPath: boolean;
      exactAssetsRetained: boolean;
    };
    publishabilityProbe: {
      status: string;
      safeToAttemptRepairPublish: boolean;
      blockerCode: string | null;
      rationale: string;
      immutableReleasePolicyStatusCode: number | null;
      immutableReleasesEnabled: boolean | null;
      immutableReleasesEnforcedByOwner: boolean | null;
      draftReleaseTargetCommitish: string | null;
      draftReleaseLookupStatusCode: number;
      draftReleaseDiscoveredByTag: boolean;
      draftReleaseHtmlUrlUsesUntaggedPath: boolean;
      exactAssetsRetained: boolean;
    };
    semverFreeze: {
      status: string;
      openingNewSemverAllowed: boolean;
      rationale: string;
    };
    repairInPlace: {
      required: boolean;
      allowed: boolean;
      status: string;
      rationale: string;
      nextAllowedAction: string;
    };
  };
  buildPublishedReleaseVerificationGate: (
    facts: Record<string, unknown>,
    assessment: {
      phases: Array<{ id: string; status: string; summary: string }>;
    }
  ) => {
    status: string;
    blockerCode: string | null;
    rationale: string;
    allowed: boolean;
    releaseId: number | null;
    exactTagLookupStatusCode: number | null;
    htmlUrlUsesUntaggedPath: boolean;
  };
  buildReleasePublishExecutionGate: (
    facts: Record<string, unknown>,
    assessment: {
      phases: Array<{ id: string; status: string; summary: string }>;
      publishabilityProbe: { blockerCode: string | null };
    }
  ) => {
    status: string;
    blockerCode: string | null;
    rationale: string;
    requestedDraftReleaseId: number | null;
    allowed: boolean;
  };
  buildMarkdown: (report: {
    recordedAt: string;
    repoRoot: string;
    status: string;
    authority: { tag: string; mainSha: string };
    publicSource: { mainSha: string | null; tagRef: string | null };
    releaseManifest?: { manifestPath: string } | null;
    marketplace: { currentPublishedVersion: string | null };
    draftPublishabilityProbe: {
      status: string;
      safeToAttemptPublishDraftInPlace: boolean;
      blockerCode: string | null;
      rationale: string;
      requestedDraftReleaseId: number | null;
      draftReleaseByIdStatusCode: number | null;
      draftReleaseIdMatchesRequested: boolean;
      draftReleaseTagMatchesAuthority: boolean;
      draftReleaseTargetCommitish: string | null;
      draftReleaseLookupByTagStatusCode: number | null;
      draftReleaseHtmlUrlUsesUntaggedPath: boolean;
    };
    publishabilityProbe: {
      status: string;
      safeToAttemptRepairPublish: boolean;
      blockerCode: string | null;
      rationale: string;
      immutableReleasesEnabled: boolean | null;
      immutableReleasesEnforcedByOwner: boolean | null;
      draftReleaseTargetCommitish: string | null;
      draftReleaseLookupStatusCode: number;
      draftReleaseHtmlUrlUsesUntaggedPath: boolean;
    };
    semverFreeze: {
      status: string;
      openingNewSemverAllowed: boolean;
      rationale: string;
    };
    repairInPlace: {
      required: boolean;
      allowed: boolean;
      status: string;
      rationale: string;
      nextAllowedAction: string;
    };
    phases: Array<{ id: string; status: string; summary: string }>;
  }) => string;
  computeFileSha256: (filePath: string, fsApi?: typeof fs) => string;
  getUsage: () => string;
  parseArgs: (argv: string[]) => {
    helpRequested: boolean;
    owner: string;
    repo: string;
    tag: string | null;
    draftReleaseId: number | null;
    evidenceDir: string;
    githubTokenPath: string | null;
    marketplaceItem: string;
  };
  parseSemverTag: (
    tag: string
  ) => { tag: string; major: number; minor: number; patch: number } | null;
  resolveLatestExactTag: (
    spawnImpl?: (command: string, args: string[], options: { cwd: string; encoding: string; shell: boolean }) => {
      status?: number | null;
      stdout?: string;
      stderr?: string;
    }
  ) => string;
  resolveReleaseManifestPath: (
    tag: string,
    fsApi?: typeof fs,
    spawnImpl?: (command: string, args: string[], options: { cwd: string; encoding: string; shell: boolean }) => {
      status?: number | null;
      stdout?: string;
      stderr?: string;
    }
  ) => string | null;
  readReleaseManifest: (
    tag: string,
    fsApi?: typeof fs,
    spawnImpl?: (command: string, args: string[], options: { cwd: string; encoding: string; shell: boolean }) => {
      status?: number | null;
      stdout?: string;
      stderr?: string;
    }
  ) => {
    manifestPath: string;
    manifestRoot: string;
    checksumPath: string | null;
    manifest: {
      tag: string;
      packageVersion: string;
      commitSha: string;
      vsixArtifact: { fileName: string; sha256: string };
    };
    checksumSha256: string | null;
  } | null;
  runAssessment: (
    argv?: string[],
    deps?: Record<string, unknown>
  ) => Promise<{ outcome: string; report?: Record<string, unknown> }>;
  runPublish: (
    argv?: string[],
    deps?: Record<string, unknown>
  ) => Promise<{ outcome: string; report?: Record<string, unknown> }>;
  runVerify: (
    argv?: string[],
    deps?: Record<string, unknown>
  ) => Promise<{ outcome: string; report?: Record<string, unknown> }>;
};

function createReleaseManifestFs(
  manifestPath = releaseManifestPath,
  checksumPath = releaseChecksumPath,
  fallbackToRealFs = true
): typeof fs {
  return {
    ...fs,
    existsSync: (targetPath: fs.PathLike) => {
      const normalized = path.normalize(String(targetPath));
      if (
        normalized === path.normalize(manifestPath) ||
        normalized === path.normalize(checksumPath)
      ) {
        return true;
      }
      return fallbackToRealFs ? fs.existsSync(targetPath) : false;
    },
    readFileSync: (targetPath: fs.PathOrFileDescriptor, encoding?: BufferEncoding | null) => {
      const normalized = path.normalize(String(targetPath));
      if (normalized === path.normalize(manifestPath)) {
        return JSON.stringify(releaseManifestFixture);
      }
      if (normalized === path.normalize(checksumPath)) {
        return releaseChecksumFixture;
      }
      if (!fallbackToRealFs) {
        throw new Error(`Unexpected readFileSync outside retained manifest fixture: ${normalized}`);
      }
      return fs.readFileSync(targetPath, encoding as BufferEncoding);
    }
  } as typeof fs;
}

describe('public GitHub exact-release transaction controller', () => {
  it('retains a deterministic CLI contract and latest-tag resolver', () => {
    expect(transaction.parseArgs([])).toEqual({
      helpRequested: false,
      mode: 'assess',
      owner: 'svelderrainruiz',
      repo: 'vi-history-suite',
      tag: null,
      draftReleaseId: null,
      evidenceDir: transaction.DEFAULT_EVIDENCE_DIR,
      githubTokenPath: null,
      marketplaceItem: 'svelderrainruiz.vi-history-suite'
    });
    expect(
      transaction.parseArgs([
        '--mode',
        'publish',
        '--tag',
        'v1.3.6',
        '--draft-release-id',
        '312363117',
        '--owner',
        'owner',
        '--repo',
        'repo',
        '--github-token-path',
        'C:\\tokens\\github.txt',
        '--marketplace-item',
        'publisher.extension',
        '--evidence-dir',
        'artifacts/public-transaction'
      ])
    ).toEqual({
      helpRequested: false,
      mode: 'publish',
      owner: 'owner',
      repo: 'repo',
      tag: 'v1.3.6',
      draftReleaseId: 312363117,
      evidenceDir: path.resolve('artifacts/public-transaction'),
      githubTokenPath: path.resolve('C:\\tokens\\github.txt'),
      marketplaceItem: 'publisher.extension'
    });
    expect(transaction.getUsage()).toContain('--github-token-path');
    expect(transaction.getUsage()).toContain('--marketplace-item');
    expect(transaction.getUsage()).toContain('--draft-release-id');
    expect(transaction.getUsage()).toContain('--mode <assess|publish|verify>');
    expect(transaction.DEFAULT_OWNER).toBe('svelderrainruiz');
    expect(transaction.DEFAULT_REPO).toBe('vi-history-suite');
    expect(transaction.DEFAULT_MARKETPLACE_ITEM).toBe('svelderrainruiz.vi-history-suite');

    expect(transaction.parseSemverTag('v1.3.6')).toEqual({
      tag: 'v1.3.6',
      major: 1,
      minor: 3,
      patch: 6
    });
    expect(transaction.parseSemverTag('not-a-tag')).toBeNull();

    const latestTag = transaction.resolveLatestExactTag((command, args) => {
      expect(command).toBe('git');
      expect(args).toEqual(['tag', '--list', 'v*']);
      return {
        status: 0,
        stdout: ['v1.3.4', 'v1.3.6', 'v1.3.5'].join('\n'),
        stderr: ''
      };
    });
    expect(latestTag).toBe('v1.3.6');
  });

  it('reads the retained authority release manifest for the current exact tag', () => {
    const fakeFs = createReleaseManifestFs();
    const manifestPath = transaction.resolveReleaseManifestPath('v1.3.6', fakeFs);
    expect(manifestPath).toBe(releaseManifestPath);

    const manifest = transaction.readReleaseManifest('v1.3.6', fakeFs);
    expect(manifest).toMatchObject({
      manifestPath,
      manifestRoot: repoRoot,
      checksumPath: releaseChecksumPath,
      manifest: releaseManifestFixture
    });
    expect(manifest?.checksumSha256).toBe(transaction.computeFileSha256(releaseChecksumPath, fakeFs));
  });

  it('locates the retained authority release manifest across the known worktree set', () => {
    const fakeFs = createReleaseManifestFs(
      alternateReleaseManifestPath,
      alternateReleaseChecksumPath,
      false
    );
    const worktreeAwareSpawn = (command: string, args: string[]) => {
      expect(command).toBe('git');
      expect(args).toEqual(['worktree', 'list', '--porcelain']);
      return {
        status: 0,
        stdout: [`worktree ${repoRoot}`, `worktree ${alternateWorktreeRoot}`].join('\n'),
        stderr: ''
      };
    };

    const manifestPath = transaction.resolveReleaseManifestPath(
      'v1.3.6',
      fakeFs,
      worktreeAwareSpawn
    );
    expect(manifestPath).toBe(alternateReleaseManifestPath);

    const manifest = transaction.readReleaseManifest('v1.3.6', fakeFs, worktreeAwareSpawn);
    expect(manifest).toMatchObject({
      manifestPath: alternateReleaseManifestPath,
      manifestRoot: path.resolve(alternateWorktreeRoot),
      checksumPath: alternateReleaseChecksumPath,
      manifest: releaseManifestFixture
    });
  });

  it('fails closed on the current v1.3.6 partial-publication state and freezes new SemVer openings', () => {
    const assessment = transaction.assessTransaction({
      authority: {
        tag: 'v1.3.6',
        packageVersion: '1.3.6',
        mainSha: '3cb238334100d01d5cfe7998e17e20a7b497b3fb',
        tagObjectSha: '044399a598735ad87082d64e01d8c92a8c77b5ef',
        tagCommitSha: '3cb238334100d01d5cfe7998e17e20a7b497b3fb'
      },
      publicSource: {
        mainSha: 'bd81bfe6743348c9138c3f0f4967c790a235184f',
        tagRef: 'refs/tags/v1.3.6',
        tagObjectType: 'tag',
        tagObjectSha: '4e2e2f92bd733336eb81e496b1cc4facc4410016',
        tagCommitSha: 'bd81bfe6743348c9138c3f0f4967c790a235184f'
      },
      immutableReleasePolicy: {
        statusCode: 200,
        enabled: true,
        enforcedByOwner: false
      },
      publicReleaseLookup: {
        statusCode: 404
      },
      publicReleaseByIdLookup: {
        requestedDraftReleaseId: 312363117,
        statusCode: 200
      },
      publicReleases: [
        {
          id: 311813620,
          tag_name: 'v1.3.1',
          draft: false,
          immutable: true
        }
      ],
      publicRelease: {
        id: 312363117,
        tag_name: 'v1.3.6',
        draft: true,
        prerelease: false,
        created_at: '2026-04-22T17:45:17Z',
        published_at: null,
        html_url:
          'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/untagged-308c75957d1c8136f871',
        target_commitish: 'main',
        immutable: false,
        assets: [
          {
            name: 'vi-history-suite-1.3.6.vsix',
            digest: 'sha256:4cba0367deacc6c1917958b47a2c227692ef373fda8b8b964203a0b955906beb'
          },
          {
            name: 'vi-history-suite-1.3.6.vsix.sha256',
            digest: 'sha256:7e2554c4685938b0db66cf02d04ef0292cb440ffc596ab201579252af0d038d0'
          }
        ]
      },
      releaseManifest: {
        manifestPath: 'release-evidence/release-manifest.json',
        checksumPath: 'release-evidence/vi-history-suite-1.3.6.vsix.sha256',
        manifest: {
          tag: 'v1.3.6',
          packageVersion: '1.3.6',
          commitSha: '3cb238334100d01d5cfe7998e17e20a7b497b3fb',
          vsixArtifact: {
            fileName: 'vi-history-suite-1.3.6.vsix',
            sha256: '4cba0367deacc6c1917958b47a2c227692ef373fda8b8b964203a0b955906beb'
          }
        },
        checksumSha256: '7e2554c4685938b0db66cf02d04ef0292cb440ffc596ab201579252af0d038d0'
      },
      marketplace: {
        marketplaceItem: 'svelderrainruiz.vi-history-suite',
        currentPublishedVersion: '1.3.0'
      }
    });

    expect(assessment.status).toBe('blocked');
    expect(assessment.draftPublishabilityProbe).toEqual(
      expect.objectContaining({
        status: 'blocked',
        safeToAttemptPublishDraftInPlace: false,
        blockerCode: 'draft-release-tag-lookup-unavailable',
        requestedDraftReleaseId: 312363117,
        draftReleaseByIdStatusCode: 200,
        draftReleaseIdMatchesRequested: true,
        draftReleaseTagMatchesAuthority: true,
        draftReleaseTargetCommitish: 'main',
        draftReleaseLookupByTagStatusCode: 404,
        draftReleaseHtmlUrlUsesUntaggedPath: true,
        exactAssetsRetained: true
      })
    );
    expect(assessment.draftPublishabilityProbe.rationale).toContain('readable by id');
    expect(assessment.publishabilityProbe).toEqual(
      expect.objectContaining({
        status: 'blocked',
        safeToAttemptRepairPublish: false,
        blockerCode: 'draft-release-tag-lookup-unavailable',
        immutableReleasePolicyStatusCode: 200,
        immutableReleasesEnabled: true,
        immutableReleasesEnforcedByOwner: false,
        draftReleaseTargetCommitish: 'main',
        draftReleaseLookupStatusCode: 404,
        draftReleaseDiscoveredByTag: false,
        draftReleaseHtmlUrlUsesUntaggedPath: true,
        exactAssetsRetained: true
      })
    );
    expect(assessment.publishabilityProbe.rationale).toContain('draft-publishability probe is blocked');
    expect(assessment.semverFreeze).toEqual(
      expect.objectContaining({
        status: 'frozen',
        openingNewSemverAllowed: false
      })
    );
    expect(assessment.semverFreeze.rationale).toContain('v1.3.6');
    expect(assessment.repairInPlace).toEqual(
      expect.objectContaining({
        required: true,
        allowed: true,
        status: 'required-but-blocked-on-publishability'
      })
    );
    expect(assessment.repairInPlace.rationale).toContain('repair in place');
    expect(assessment.repairInPlace.nextAllowedAction).toBe(
      'repair-the-existing-v1.3.6-public-github-release-only-after-safe-publishability-is-proven'
    );
    expect(assessment.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'authority-exact-main', status: 'pass' }),
        expect.objectContaining({ id: 'public-source-main', status: 'pass' }),
        expect.objectContaining({ id: 'public-tag', status: 'pass' }),
        expect.objectContaining({ id: 'public-release-assets', status: 'pass' }),
        expect.objectContaining({ id: 'public-release-publishability', status: 'blocked' }),
        expect.objectContaining({ id: 'public-release-published', status: 'blocked' }),
        expect.objectContaining({ id: 'marketplace-published', status: 'blocked' })
      ])
    );

    const markdown = transaction.buildMarkdown({
      recordedAt: '2026-04-22T19:00:00.000Z',
      repoRoot: '/repo',
      status: assessment.status,
      authority: { tag: 'v1.3.6', mainSha: '3cb2383' },
      publicSource: { mainSha: 'bd81bfe', tagRef: 'refs/tags/v1.3.6' },
      releaseManifest: {
        manifestPath: '.cache/gitlab-release-artifacts/v1.3.6/expanded/release-evidence/release-manifest.json'
      },
      marketplace: { currentPublishedVersion: '1.3.0' },
      draftPublishabilityProbe: assessment.draftPublishabilityProbe,
      publishabilityProbe: assessment.publishabilityProbe,
      semverFreeze: assessment.semverFreeze,
      repairInPlace: assessment.repairInPlace,
      phases: assessment.phases
    });
    expect(markdown).toContain('# Public GitHub Exact Release Transaction');
    expect(markdown).toContain('Status: blocked');
    expect(markdown).toContain(
      'Authority release manifest: .cache/gitlab-release-artifacts/v1.3.6/expanded/release-evidence/release-manifest.json'
    );
    expect(markdown).toContain('## Draft Publishability Probe');
    expect(markdown).toContain('Requested draft release id: 312363117');
    expect(markdown).toContain('Exact assets retained against authority manifest: true');
    expect(markdown).toContain('## Publishability Probe');
    expect(markdown).toContain('Blocker code: draft-release-tag-lookup-unavailable');
    expect(markdown).toContain('Immutable releases enabled: true');
    expect(markdown).toContain('New SemVer opening allowed: false');
    expect(markdown).toContain('| public-release-published | blocked |');
  });

  it('writes a retained blocked receipt before failing closed on an incomplete public transaction', async () => {
    const evidenceDir = path.join(repoRoot, '.cache', 'test-public-github-exact-release-transaction');
    fs.rmSync(evidenceDir, { recursive: true, force: true });
    const releaseManifestFs = createReleaseManifestFs();

    try {
        await expect(
          transaction.runAssessment(
            ['--tag', 'v1.3.6', '--draft-release-id', '312363117', '--evidence-dir', evidenceDir],
            {
            now: () => '2026-04-22T21:00:00.000Z',
            env: {
              [process.env.USERPROFILE ? 'USERPROFILE' : 'HOME']: process.env.USERPROFILE ?? process.env.HOME,
              VIHS_GITHUB_TOKEN_FILE: path.join(repoRoot, '.cache', 'tests', 'github-token.txt')
            },
            fs: {
              ...releaseManifestFs,
              existsSync: (targetPath: fs.PathLike) => {
                const normalized = path.normalize(String(targetPath));
                if (
                  normalized.endsWith(
                    path.normalize(path.join('.cache', 'tests', 'github-token.txt'))
                  )
                ) {
                  return true;
                }
                return releaseManifestFs.existsSync(targetPath);
              },
              readFileSync: (targetPath: fs.PathOrFileDescriptor, encoding?: BufferEncoding | null) => {
                const normalized = path.normalize(String(targetPath));
                if (
                  normalized.endsWith(
                    path.normalize(path.join('.cache', 'tests', 'github-token.txt'))
                  )
                ) {
                  return 'github-token';
                }
                return releaseManifestFs.readFileSync(targetPath, encoding as BufferEncoding);
              }
            },
            spawnImpl: (command, args) => {
              expect(command).toBe('git');
              const joined = args.join(' ');
              if (joined === 'rev-parse --verify origin/main') {
                return { status: 0, stdout: '3cb238334100d01d5cfe7998e17e20a7b497b3fb', stderr: '' };
              }
              if (joined === 'rev-parse --verify refs/tags/v1.3.6') {
                return { status: 0, stdout: '044399a598735ad87082d64e01d8c92a8c77b5ef', stderr: '' };
              }
              if (joined === 'rev-list -n 1 v1.3.6') {
                return { status: 0, stdout: '3cb238334100d01d5cfe7998e17e20a7b497b3fb', stderr: '' };
              }
              if (joined === 'worktree list --porcelain') {
                return { status: 0, stdout: `worktree ${repoRoot}`, stderr: '' };
              }
              throw new Error(`Unexpected git invocation: ${joined}`);
            },
            fetchGitHubJson: async (_owner, _repo, endpoint) => {
              if (endpoint === '/branches/main') {
                return {
                  statusCode: 200,
                  json: { commit: { sha: 'bd81bfe6743348c9138c3f0f4967c790a235184f' } }
                };
              }
              if (endpoint === '/git/ref/tags/v1.3.6') {
                return {
                  statusCode: 200,
                  json: {
                    ref: 'refs/tags/v1.3.6',
                    object: { type: 'tag', sha: '4e2e2f92bd733336eb81e496b1cc4facc4410016' }
                  }
                };
              }
              if (endpoint === '/git/tags/4e2e2f92bd733336eb81e496b1cc4facc4410016') {
                return {
                  statusCode: 200,
                  json: {
                    object: { sha: 'bd81bfe6743348c9138c3f0f4967c790a235184f' }
                  }
                };
              }
              if (endpoint === '/releases?per_page=100') {
                return {
                  statusCode: 200,
                  json: [
                    {
                      id: 311813620,
                      tag_name: 'v1.3.1',
                      draft: false,
                      prerelease: false,
                      created_at: '2026-04-21T14:00:00Z',
                      published_at: '2026-04-21T14:05:00Z',
                      html_url:
                        'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.1',
                      immutable: true
                    },
                    {
                      id: 312363117,
                      tag_name: 'v1.3.6',
                      draft: true,
                      prerelease: false,
                      created_at: '2026-04-22T17:45:17Z',
                      published_at: null,
                      html_url:
                        'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/untagged-308c75957d1c8136f871',
                      immutable: false,
                      url: 'https://api.github.com/repos/svelderrainruiz/vi-history-suite/releases/312363117'
                    }
                  ]
                };
              }
              if (endpoint === '/immutable-releases') {
                return {
                  statusCode: 200,
                  json: {
                    enabled: true,
                    enforced_by_owner: false
                  }
                };
              }
              if (endpoint === '/releases/tags/v1.3.6') {
                return { statusCode: 404, json: { message: 'Not Found' } };
              }
              if (endpoint === '/releases/312363117') {
                return {
                  statusCode: 200,
                  json: {
                    id: 312363117,
                    tag_name: 'v1.3.6',
                    draft: true,
                    prerelease: false,
                    created_at: '2026-04-22T17:45:17Z',
                    published_at: null,
                    html_url:
                      'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/untagged-308c75957d1c8136f871',
                    target_commitish: 'main',
                    immutable: false,
                    assets: [
                      {
                        id: 1,
                        name: 'vi-history-suite-1.3.6.vsix',
                        size: 495214,
                        state: 'uploaded',
                        digest:
                          'sha256:4cba0367deacc6c1917958b47a2c227692ef373fda8b8b964203a0b955906beb',
                        download_count: 0,
                        browser_download_url: 'https://example.invalid/vsix'
                      },
                      {
                        id: 2,
                        name: 'vi-history-suite-1.3.6.vsix.sha256',
                        size: 120,
                        state: 'uploaded',
                        digest:
                          'sha256:7e2554c4685938b0db66cf02d04ef0292cb440ffc596ab201579252af0d038d0',
                        download_count: 0,
                        browser_download_url: 'https://example.invalid/vsix.sha256'
                      }
                    ]
                  }
                };
              }

              throw new Error(`Unexpected GitHub endpoint: ${endpoint}`);
            },
            fetchMarketplaceState: async () => ({
              statusCode: 200,
              marketplaceItem: 'svelderrainruiz.vi-history-suite',
              currentPublishedVersion: '1.3.0',
              found: true
            })
          }
        )
      ).rejects.toThrow(/repair in place/i);

      const jsonReportPath = path.join(
        evidenceDir,
        'public-github-exact-release-transaction.json'
      );
      const markdownReportPath = path.join(
        evidenceDir,
        'public-github-exact-release-transaction.md'
      );
      expect(fs.existsSync(jsonReportPath)).toBe(true);
      expect(fs.existsSync(markdownReportPath)).toBe(true);

      const jsonReport = JSON.parse(fs.readFileSync(jsonReportPath, 'utf8')) as {
        authority: { packageVersion: string; branchPackageVersion: string };
        releaseManifest: {
          manifestPath: string;
          manifestRoot: string;
          checksumPath: string | null;
          checksumSha256: string | null;
        } | null;
        publicReleaseByIdLookup: {
          requestedDraftReleaseId: number | null;
          statusCode: number | null;
        };
        draftPublishabilityProbe: {
          status: string;
          blockerCode: string | null;
          safeToAttemptPublishDraftInPlace: boolean;
          requestedDraftReleaseId: number | null;
          draftReleaseByIdStatusCode: number | null;
          draftReleaseIdMatchesRequested: boolean;
        };
        immutableReleasePolicy: {
          statusCode: number;
          enabled: boolean | null;
          enforcedByOwner: boolean | null;
        };
        publishabilityProbe: {
          status: string;
          blockerCode: string | null;
          safeToAttemptRepairPublish: boolean;
          immutableReleasesEnabled: boolean | null;
          immutableReleasesEnforcedByOwner: boolean | null;
          draftReleaseTargetCommitish: string | null;
          draftReleaseLookupStatusCode: number;
          draftReleaseHtmlUrlUsesUntaggedPath: boolean;
        };
        status: string;
        semverFreeze: { status: string; openingNewSemverAllowed: boolean };
        repairInPlace: { required: boolean; allowed: boolean; status: string };
        phases: Array<{ id: string; summary: string }>;
      };
      const markdownReport = fs.readFileSync(markdownReportPath, 'utf8');

      expect(jsonReport.authority).toMatchObject({
        packageVersion: '1.3.6',
        branchPackageVersion: '1.3.8'
      });
      expect(jsonReport.publicReleaseByIdLookup).toEqual({
        requestedDraftReleaseId: 312363117,
        statusCode: 200
      });
      expect(jsonReport.releaseManifest).toMatchObject({
        manifestPath: '.cache/gitlab-release-artifacts/v1.3.6/expanded/release-evidence/release-manifest.json',
        manifestRoot: '.',
        checksumPath:
          '.cache/gitlab-release-artifacts/v1.3.6/expanded/release-evidence/vi-history-suite-1.3.6.vsix.sha256'
      });
      expect(jsonReport.draftPublishabilityProbe).toMatchObject({
        status: 'blocked',
        blockerCode: 'draft-release-tag-lookup-unavailable',
        safeToAttemptPublishDraftInPlace: false,
        requestedDraftReleaseId: 312363117,
        draftReleaseByIdStatusCode: 200,
        draftReleaseIdMatchesRequested: true,
        exactAssetsRetained: true
      });
      expect(jsonReport.immutableReleasePolicy).toEqual({
        statusCode: 200,
        enabled: true,
        enforcedByOwner: false
      });
      expect(jsonReport.publishabilityProbe).toMatchObject({
        status: 'blocked',
        blockerCode: 'draft-release-tag-lookup-unavailable',
        safeToAttemptRepairPublish: false,
        immutableReleasesEnabled: true,
        immutableReleasesEnforcedByOwner: false,
        draftReleaseTargetCommitish: 'main',
        draftReleaseLookupStatusCode: 404,
        draftReleaseHtmlUrlUsesUntaggedPath: true,
        exactAssetsRetained: true
      });
      expect(jsonReport.status).toBe('blocked');
      expect(jsonReport.semverFreeze).toMatchObject({
        status: 'frozen',
        openingNewSemverAllowed: false
      });
      expect(jsonReport.repairInPlace).toMatchObject({
        required: true,
        allowed: true,
        status: 'required-but-blocked-on-publishability'
      });
      expect(
        jsonReport.phases.find((phase) => phase.id === 'marketplace-published')?.summary
      ).toContain('not 1.3.6');
      expect(markdownReport).toContain('Authority tag: v1.3.6');
      expect(markdownReport).toContain('Requested draft release id: 312363117');
      expect(markdownReport).toContain('Blocker code: draft-release-tag-lookup-unavailable');
      expect(markdownReport).toContain('Next allowed action: repair-the-existing-v1.3.6-public-github-release-only-after-safe-publishability-is-proven');
    } finally {
      fs.rmSync(evidenceDir, { recursive: true, force: true });
    }
  });

  it('publishes and verifies the retained v1.3.6 draft release in place by release id once the exact assets are already retained', async () => {
    const evidenceDir = path.join(
      repoRoot,
      '.cache',
      'test-public-github-exact-release-transaction-publish'
    );
    fs.rmSync(evidenceDir, { recursive: true, force: true });
    const releaseManifestFs = createReleaseManifestFs();
    let published = false;
    const releaseApiUrl =
      'https://api.github.com/repos/svelderrainruiz/vi-history-suite/releases/312363117';

    const createReleaseJson = () => ({
      id: 312363117,
      tag_name: 'v1.3.6',
      draft: !published,
      prerelease: false,
      created_at: '2026-04-22T17:45:17Z',
      published_at: published ? '2026-04-22T21:30:00Z' : null,
      html_url: published
        ? 'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.6'
        : 'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/untagged-308c75957d1c8136f871',
      target_commitish: 'main',
      immutable: false,
      assets: [
        {
          id: 1,
          name: 'vi-history-suite-1.3.6.vsix',
          size: 495214,
          state: 'uploaded',
          digest: 'sha256:4cba0367deacc6c1917958b47a2c227692ef373fda8b8b964203a0b955906beb',
          download_count: 0,
          browser_download_url: published
            ? 'https://github.com/svelderrainruiz/vi-history-suite/releases/download/v1.3.6/vi-history-suite-1.3.6.vsix'
            : 'https://github.com/svelderrainruiz/vi-history-suite/releases/download/untagged-308c75957d1c8136f871/vi-history-suite-1.3.6.vsix'
        },
        {
          id: 2,
          name: 'vi-history-suite-1.3.6.vsix.sha256',
          size: 120,
          state: 'uploaded',
          digest: 'sha256:7e2554c4685938b0db66cf02d04ef0292cb440ffc596ab201579252af0d038d0',
          download_count: 0,
          browser_download_url: published
            ? 'https://github.com/svelderrainruiz/vi-history-suite/releases/download/v1.3.6/vi-history-suite-1.3.6.vsix.sha256'
            : 'https://github.com/svelderrainruiz/vi-history-suite/releases/download/untagged-308c75957d1c8136f871/vi-history-suite-1.3.6.vsix.sha256'
        }
      ]
    });

    try {
      const commonDeps = {
        now: () => '2026-04-22T21:30:00.000Z',
        env: {
          [process.env.USERPROFILE ? 'USERPROFILE' : 'HOME']: process.env.USERPROFILE ?? process.env.HOME,
          VIHS_GITHUB_TOKEN_FILE: path.join(repoRoot, '.cache', 'tests', 'github-token.txt')
        },
        fs: {
          ...releaseManifestFs,
          existsSync: (targetPath: fs.PathLike) => {
            const normalized = path.normalize(String(targetPath));
            if (
              normalized.endsWith(path.normalize(path.join('.cache', 'tests', 'github-token.txt')))
            ) {
              return true;
            }
            return releaseManifestFs.existsSync(targetPath);
          },
          readFileSync: (targetPath: fs.PathOrFileDescriptor, encoding?: BufferEncoding | null) => {
            const normalized = path.normalize(String(targetPath));
            if (
              normalized.endsWith(path.normalize(path.join('.cache', 'tests', 'github-token.txt')))
            ) {
              return 'github-token';
            }
            return releaseManifestFs.readFileSync(targetPath, encoding as BufferEncoding);
          }
        },
        spawnImpl: (command: string, args: string[]) => {
          expect(command).toBe('git');
          const joined = args.join(' ');
          if (joined === 'rev-parse --verify origin/main') {
            return { status: 0, stdout: '3cb238334100d01d5cfe7998e17e20a7b497b3fb', stderr: '' };
          }
          if (joined === 'rev-parse --verify refs/tags/v1.3.6') {
            return { status: 0, stdout: '044399a598735ad87082d64e01d8c92a8c77b5ef', stderr: '' };
          }
          if (joined === 'rev-list -n 1 v1.3.6') {
            return { status: 0, stdout: '3cb238334100d01d5cfe7998e17e20a7b497b3fb', stderr: '' };
          }
          if (joined === 'worktree list --porcelain') {
            return { status: 0, stdout: `worktree ${repoRoot}`, stderr: '' };
          }
          throw new Error(`Unexpected git invocation: ${joined}`);
        },
        fetchGitHubJson: async (_owner: string, _repo: string, endpoint: string) => {
          if (endpoint === '/branches/main') {
            return {
              statusCode: 200,
              json: { commit: { sha: 'bd81bfe6743348c9138c3f0f4967c790a235184f' } }
            };
          }
          if (endpoint === '/git/ref/tags/v1.3.6') {
            return {
              statusCode: 200,
              json: {
                ref: 'refs/tags/v1.3.6',
                object: { type: 'tag', sha: '4e2e2f92bd733336eb81e496b1cc4facc4410016' }
              }
            };
          }
          if (endpoint === '/git/tags/4e2e2f92bd733336eb81e496b1cc4facc4410016') {
            return {
              statusCode: 200,
              json: {
                object: { sha: 'bd81bfe6743348c9138c3f0f4967c790a235184f' }
              }
            };
          }
          if (endpoint === '/releases?per_page=100') {
            return {
              statusCode: 200,
              json: [
                {
                  id: 311813620,
                  tag_name: 'v1.3.1',
                  draft: false,
                  prerelease: false,
                  created_at: '2026-04-21T14:00:00Z',
                  published_at: '2026-04-21T14:05:00Z',
                  html_url:
                    'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.1',
                  immutable: true
                },
                {
                  id: 312363117,
                  tag_name: 'v1.3.6',
                  draft: !published,
                  prerelease: false,
                  created_at: '2026-04-22T17:45:17Z',
                  published_at: published ? '2026-04-22T21:30:00Z' : null,
                  html_url: published
                    ? 'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.6'
                    : 'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/untagged-308c75957d1c8136f871',
                  immutable: false,
                  url: releaseApiUrl
                }
              ]
            };
          }
          if (endpoint === '/immutable-releases') {
            return {
              statusCode: 200,
              json: {
                enabled: true,
                enforced_by_owner: false
              }
            };
          }
          if (endpoint === '/releases/tags/v1.3.6') {
            return published
              ? { statusCode: 200, json: createReleaseJson() }
              : { statusCode: 404, json: { message: 'Not Found' } };
          }
          if (endpoint === '/releases/312363117') {
            return {
              statusCode: 200,
              json: createReleaseJson()
            };
          }

          throw new Error(`Unexpected GitHub endpoint: ${endpoint}`);
        },
        mutateGitHubJson: async (
          _owner: string,
          _repo: string,
          endpoint: string,
          _token: string,
          method: string,
          payload: { draft: boolean }
        ) => {
          expect(endpoint).toBe('/releases/312363117');
          expect(method).toBe('PATCH');
          expect(payload).toEqual({ draft: false });
          published = true;
          return {
            statusCode: 200,
            bodyText: JSON.stringify(createReleaseJson()),
            json: createReleaseJson()
          };
        },
        fetchMarketplaceState: async () => ({
          statusCode: 200,
          marketplaceItem: 'svelderrainruiz.vi-history-suite',
          currentPublishedVersion: '1.3.0',
          found: true
        }),
        publishVerificationRetryCount: 2,
        publishVerificationRetryDelayMs: 0
      };

      await expect(
        transaction.runPublish(
          ['--tag', 'v1.3.6', '--draft-release-id', '312363117', '--evidence-dir', evidenceDir],
          commonDeps
        )
      ).resolves.toMatchObject({
        outcome: 'published'
      });

      const publishReport = JSON.parse(
        fs.readFileSync(path.join(evidenceDir, 'public-github-exact-release-transaction.json'), 'utf8')
      ) as {
        mode: string;
        publicReleaseLookup: { statusCode: number };
        publicRelease: { draft: boolean; published_at: string | null; html_url: string };
        verifyGate: { status: string; allowed: boolean; blockerCode: string | null };
      };
      expect(publishReport.mode).toBe('publish');
      expect(publishReport.publicReleaseLookup.statusCode).toBe(200);
      expect(publishReport.publicRelease.draft).toBe(false);
      expect(publishReport.publicRelease.published_at).toBe('2026-04-22T21:30:00Z');
      expect(publishReport.publicRelease.html_url).toContain('/releases/tag/v1.3.6');
      expect(publishReport.verifyGate).toMatchObject({
        status: 'pass',
        allowed: true,
        blockerCode: null
      });

      await expect(
        transaction.runVerify(
          ['--tag', 'v1.3.6', '--draft-release-id', '312363117', '--evidence-dir', evidenceDir],
          commonDeps
        )
      ).resolves.toMatchObject({
        outcome: 'verified'
      });
    } finally {
      fs.rmSync(evidenceDir, { recursive: true, force: true });
    }
  });
});
