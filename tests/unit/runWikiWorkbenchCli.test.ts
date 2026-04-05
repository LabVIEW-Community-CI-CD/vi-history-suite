import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getWikiWorkbenchUsage,
  parseWikiWorkbenchArgs,
  planWikiPages,
  readWikiPublicationLedger,
  resolveWikiWorkbenchTopology,
  stageWikiWorkbenchPage,
  prepareWikiWorkbenchPublication,
  validateWikiWorkbenchLedger
} from '../../src/tooling/wikiWorkbench';
import { runWikiWorkbenchCli } from '../../src/cli/runWikiWorkbench';

async function createWikiWorkbenchFixture(): Promise<{
  repoRoot: string;
  wikiRoot: string;
}> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-wiki-workbench-'));
  const repoRoot = path.join(tempRoot, 'vi-history-suite');
  const wikiRoot = path.join(tempRoot, 'vi-history-suite.wiki');

  await fs.mkdir(path.join(repoRoot, 'docs', 'product'), { recursive: true });
  await fs.mkdir(path.join(repoRoot, 'docs', 'requirements'), { recursive: true });
  await fs.mkdir(path.join(repoRoot, 'resources', 'bundled-docs'), { recursive: true });
  await fs.mkdir(wikiRoot, { recursive: true });

  await fs.writeFile(
    path.join(repoRoot, 'docs', 'product', 'program-repo-jump-map.json'),
    JSON.stringify(
      {
        programId: 'comparevi',
        version: 1,
        repos: [
          {
            id: 'vi-history-suite',
            displayName: 'VI History Suite',
            role: 'product-authority',
            expectedRemote: 'https://gitlab.com/svelderrainruiz/vi-history-suite.git',
            localPath: { kind: 'current-repo' },
            primaryEntrypoints: ['README.md']
          },
          {
            id: 'vi-history-suite.wiki',
            displayName: 'VI History Suite Wiki',
            role: 'derived-reader-surface',
            expectedRemote: 'https://gitlab.com/svelderrainruiz/vi-history-suite.wiki.git',
            localPath: { kind: 'sibling', relativePath: '../vi-history-suite.wiki' },
            primaryEntrypoints: ['home.md']
          }
        ]
      },
      null,
      2
    ),
    'utf8'
  );

  await fs.writeFile(
    path.join(repoRoot, 'docs', 'product', 'wiki-authority-map.md'),
    '# Wiki Authority Map\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(repoRoot, 'docs', 'product', 'wiki-publication-ledger.md'),
    '# Wiki Publication Ledger\n',
    'utf8'
  );
  await fs.writeFile(path.join(repoRoot, 'README.md'), '# VI History Suite\n', 'utf8');
  await fs.writeFile(path.join(repoRoot, 'docs', 'documentation-workbench.md'), '# Workbench\n', 'utf8');
  await fs.writeFile(path.join(repoRoot, 'docs', 'product', 'documentation-coherence-ledger.md'), '# Coherence\n', 'utf8');
  await fs.writeFile(path.join(repoRoot, 'docs', 'requirements', 'srs.md'), '# SRS\n', 'utf8');

  await fs.writeFile(
    path.join(repoRoot, 'docs', 'product', 'wiki-publication-ledger.json'),
    JSON.stringify(
      {
        generatedFor: 'vi-history-suite',
        pages: [
          {
            id: 'overview',
            title: 'Overview',
            wikiPath: 'home',
            wikiFileName: 'home.md',
            status: 'published',
            publishedDate: '2026-04-03',
            wikiCommit: 'abc1234',
            primaryAuthority: ['README.md', 'docs/requirements/srs.md']
          }
        ],
        nextPage: {
          id: 'documentation-workbench',
          title: 'Documentation Workbench',
          primaryAuthority: [
            'docs/documentation-workbench.md',
            'docs/product/documentation-coherence-ledger.md'
          ],
          secondaryAuthority: ['docs/product/wiki-authority-map.md']
        }
      },
      null,
      2
    ),
    'utf8'
  );

  await fs.writeFile(path.join(wikiRoot, 'home.md'), '# Overview\n', 'utf8');

  return {
    repoRoot,
    wikiRoot
  };
}

describe('wiki workbench cli', () => {
  it('parses stable args and usage', () => {
    expect(parseWikiWorkbenchArgs([])).toEqual({
      command: 'doctor',
      pageId: undefined,
      format: 'text',
      repoRoot: undefined,
      workbenchRoot: undefined,
      helpRequested: false
    });
    expect(
      parseWikiWorkbenchArgs([
        'stage-page',
        '--page-id',
        'documentation-workbench',
        '--format',
        'json'
      ])
    ).toEqual({
      command: 'stage-page',
      pageId: 'documentation-workbench',
      format: 'json',
      repoRoot: undefined,
      workbenchRoot: undefined,
      helpRequested: false
    });
    expect(() => parseWikiWorkbenchArgs(['--format', 'yaml'])).toThrow(/Unsupported --format/);
    expect(() => parseWikiWorkbenchArgs(['--page-id'])).toThrow(/Missing value/);
    expect(getWikiWorkbenchUsage()).toContain('prepare-publication');
  });

  it('resolves topology, validates the ledger, and plans the next page', async () => {
    const { repoRoot, wikiRoot } = await createWikiWorkbenchFixture();
    const topology = resolveWikiWorkbenchTopology(repoRoot, undefined, {
      getGitRemote: (candidate) => {
        if (candidate === repoRoot) {
          return 'https://gitlab.com/svelderrainruiz/vi-history-suite.git';
        }

        if (candidate === wikiRoot) {
          return 'https://gitlab.com/svelderrainruiz/vi-history-suite.wiki.git';
        }

        return undefined;
      }
    });
    const ledger = await readWikiPublicationLedger(topology.ledgerJsonPath);
    const issues = await validateWikiWorkbenchLedger(topology, ledger);
    const pages = planWikiPages(topology, ledger);

    expect(issues).toEqual([]);
    expect(topology.wikiRepo.localPath).toBe(wikiRoot);
    expect(pages.map((page) => page.id)).toEqual(['overview', 'documentation-workbench']);
    expect(pages[1]).toMatchObject({
      status: 'next',
      wikiFileName: 'Documentation-Workbench.md'
    });
  });

  it('accepts CI-authenticated GitLab HTTPS remotes as canonical repo matches', async () => {
    const { repoRoot, wikiRoot } = await createWikiWorkbenchFixture();
    const topology = resolveWikiWorkbenchTopology(repoRoot, undefined, {
      getGitRemote: (candidate) => {
        if (candidate === repoRoot) {
          return 'https://gitlab-ci-token:masked@gitlab.com/svelderrainruiz/vi-history-suite.git';
        }

        if (candidate === wikiRoot) {
          return 'https://gitlab-ci-token:masked@gitlab.com/svelderrainruiz/vi-history-suite.wiki.git';
        }

        return undefined;
      }
    });
    const ledger = await readWikiPublicationLedger(topology.ledgerJsonPath);
    const issues = await validateWikiWorkbenchLedger(topology, ledger);

    expect(topology.authorityRepo.remoteMatchesExpected).toBe(true);
    expect(topology.wikiRepo.remoteMatchesExpected).toBe(true);
    expect(issues).toEqual([]);
  });

  it('stages a next page, prepares publication, and invokes bundle sync with resolved paths', async () => {
    const { repoRoot, wikiRoot } = await createWikiWorkbenchFixture();
    const stdout: string[] = [];
    const bundleCalls: Array<{
      repoRoot: string;
      wikiRepoRoot: string;
      ledgerPath: string;
      bundleRoot: string;
    }> = [];

    await runWikiWorkbenchCli(['stage-page', '--page-id', 'documentation-workbench'], {
      repoRoot,
      stdout: {
        write(text: string) {
          stdout.push(text);
        }
      },
      getGitRemote: (candidate) => {
        if (candidate === repoRoot) {
          return 'https://gitlab.com/svelderrainruiz/vi-history-suite.git';
        }

        if (candidate === wikiRoot) {
          return 'https://gitlab.com/svelderrainruiz/vi-history-suite.wiki.git';
        }

        return undefined;
      }
    });

    const stageReceiptPath = path.join(
      repoRoot,
      '.cache',
      'wiki-workbench',
      'staging',
      'documentation-workbench',
      'stage-receipt.json'
    );
    const draftPath = path.join(
      repoRoot,
      '.cache',
      'wiki-workbench',
      'staging',
      'documentation-workbench',
      'wiki-draft.md'
    );
    expect(JSON.parse(await fs.readFile(stageReceiptPath, 'utf8')).page.id).toBe(
      'documentation-workbench'
    );
    expect(await fs.readFile(draftPath, 'utf8')).toContain('# Documentation Workbench');
    expect(stdout.join('')).toContain('documentation-workbench');

    await runWikiWorkbenchCli(['prepare-publication'], {
      repoRoot,
      runBundleSync(options) {
        bundleCalls.push(options);
      },
      getGitRemote: (candidate) => {
        if (candidate === repoRoot) {
          return 'https://gitlab.com/svelderrainruiz/vi-history-suite.git';
        }

        if (candidate === wikiRoot) {
          return 'https://gitlab.com/svelderrainruiz/vi-history-suite.wiki.git';
        }

        return undefined;
      }
    });

    const prepReceiptPath = path.join(
      repoRoot,
      '.cache',
      'wiki-workbench',
      'publication-prep',
      'documentation-workbench',
      'publication-prep.json'
    );
    const prepReceipt = JSON.parse(await fs.readFile(prepReceiptPath, 'utf8'));
    expect(prepReceipt.page.id).toBe('documentation-workbench');
    expect(prepReceipt.completionState).toBe('prepared');

    await runWikiWorkbenchCli(['sync-bundled-docs'], {
      repoRoot,
      runBundleSync(options) {
        bundleCalls.push(options);
      },
      getGitRemote: (candidate) => {
        if (candidate === repoRoot) {
          return 'https://gitlab.com/svelderrainruiz/vi-history-suite.git';
        }

        if (candidate === wikiRoot) {
          return 'https://gitlab.com/svelderrainruiz/vi-history-suite.wiki.git';
        }

        return undefined;
      }
    });

    expect(bundleCalls.at(-1)).toEqual({
      repoRoot,
      wikiRepoRoot: wikiRoot,
      ledgerPath: path.join(repoRoot, 'docs', 'product', 'wiki-publication-ledger.json'),
      bundleRoot: path.join(repoRoot, 'resources', 'bundled-docs')
    });
  });

  it('retains a no-op completion receipt when the wiki ledger has no next page', async () => {
    const { repoRoot, wikiRoot } = await createWikiWorkbenchFixture();
    const ledgerPath = path.join(repoRoot, 'docs', 'product', 'wiki-publication-ledger.json');
    const ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8')) as {
      generatedFor: string;
      pages: Array<unknown>;
      nextPage?: unknown;
    };
    delete ledger.nextPage;
    await fs.writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');

    await runWikiWorkbenchCli(['prepare-publication'], {
      repoRoot,
      getGitRemote: (candidate) => {
        if (candidate === repoRoot) {
          return 'https://gitlab.com/svelderrainruiz/vi-history-suite.git';
        }

        if (candidate === wikiRoot) {
          return 'https://gitlab.com/svelderrainruiz/vi-history-suite.wiki.git';
        }

        return undefined;
      }
    });

    const prepReceiptPath = path.join(
      repoRoot,
      '.cache',
      'wiki-workbench',
      'publication-prep',
      'complete',
      'publication-prep.json'
    );
    const prepReceipt = JSON.parse(await fs.readFile(prepReceiptPath, 'utf8'));

    expect(prepReceipt).toMatchObject({
      publicationMode: 'no-op-complete',
      ledgerUpdateRequired: false,
      completionState: 'already-complete'
    });
    expect(prepReceipt.message).toContain('no nextPage target');
    expect(prepReceipt.page).toBeUndefined();
  });

  it('fails closed when a published wiki file is missing', async () => {
    const { repoRoot } = await createWikiWorkbenchFixture();
    await fs.rm(path.join(repoRoot, '..', 'vi-history-suite.wiki', 'home.md'));
    const topology = resolveWikiWorkbenchTopology(repoRoot, undefined);
    const ledger = await readWikiPublicationLedger(topology.ledgerJsonPath);
    const issues = await validateWikiWorkbenchLedger(topology, ledger);

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'missing-wiki-page',
        severity: 'error'
      })
    );
  });

  it('falls back to writable recovery roots when stale retained page directories are not writable', async () => {
    const { repoRoot, wikiRoot } = await createWikiWorkbenchFixture();
    const topology = resolveWikiWorkbenchTopology(repoRoot, undefined, {
      getGitRemote: (candidate) => {
        if (candidate === repoRoot) {
          return 'https://gitlab.com/svelderrainruiz/vi-history-suite.git';
        }

        if (candidate === wikiRoot) {
          return 'https://gitlab.com/svelderrainruiz/vi-history-suite.wiki.git';
        }

        return undefined;
      }
    });
    const ledger = await readWikiPublicationLedger(topology.ledgerJsonPath);
    const fixedNow = new Date('2026-04-04T22:15:00.000Z');
    const preferredStageDirectory = path.join(topology.stagingRoot, 'documentation-workbench');
    const preferredPrepDirectory = path.join(topology.publicationPrepRoot, 'documentation-workbench');

    const { receipt: stageReceipt } = await stageWikiWorkbenchPage(topology, ledger, 'documentation-workbench', {
      now: () => fixedNow,
      rm: async (target, options) => {
        if (target === preferredStageDirectory) {
          const error = new Error('permission denied');
          (error as Error & { code?: string }).code = 'EACCES';
          throw error;
        }

        return fs.rm(target, options);
      }
    });

    expect(stageReceipt.stageDirectory).toBe(
      path.join(topology.workbenchRoot, 'staging-runs', 'documentation-workbench-20260404T221500Z')
    );
    expect(await fs.readFile(stageReceipt.draftFilePath, 'utf8')).toContain('# Documentation Workbench');

    const { receiptPath } = await prepareWikiWorkbenchPublication(
      topology,
      ledger,
      'documentation-workbench',
      {
        now: () => fixedNow,
        rm: async (target, options) => {
          if (target === preferredStageDirectory) {
            const error = new Error('permission denied');
            (error as Error & { code?: string }).code = 'EACCES';
            throw error;
          }

          return fs.rm(target, options);
        },
        mkdir: async (target, options) => {
          if (target === preferredPrepDirectory) {
            const error = new Error('permission denied');
            (error as Error & { code?: string }).code = 'EACCES';
            throw error;
          }

          return fs.mkdir(target, options);
        }
      }
    );

    expect(receiptPath).toBe(
      path.join(
        topology.workbenchRoot,
        'publication-prep-runs',
        'documentation-workbench-20260404T221500Z',
        'publication-prep.json'
      )
    );
  });
});
