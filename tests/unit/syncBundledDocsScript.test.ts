import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bundledDocsScript = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'syncBundledDocs.js'
)) as {
  compareBundledDocsFiles: (
    expectedFiles: Map<string, string>,
    actualFiles: Map<string, string>
  ) => Array<{ path: string; reason: string }>;
  getBundledDocsUsage: () => string;
  normalizeRepoRelativePath: (repoRoot: string, targetPath: string) => string;
  parseBundledDocsArgs: (argv: string[]) => {
    check: boolean;
    helpRequested: boolean;
    reportPath?: string;
  };
  resolveBundledDocsPaths: (env?: NodeJS.ProcessEnv) => {
    repoRoot: string;
    wikiRepoRoot: string;
    ledgerPath: string;
    bundleRoot: string;
    bundlePagesRoot: string;
  };
};

describe('bundled docs sync script', () => {
  it('parses stable args for refresh and drift-check modes', () => {
    expect(bundledDocsScript.parseBundledDocsArgs([])).toEqual({
      check: false,
      helpRequested: false,
      reportPath: undefined
    });
    expect(
      bundledDocsScript.parseBundledDocsArgs(['--check', '--report', 'artifacts/bundle.json'])
    ).toEqual({
      check: true,
      helpRequested: false,
      reportPath: path.resolve('artifacts/bundle.json')
    });
    expect(() => bundledDocsScript.parseBundledDocsArgs(['--report'])).toThrow(/Missing value/);
    expect(bundledDocsScript.getBundledDocsUsage()).toContain('--check');
    expect(bundledDocsScript.normalizeRepoRelativePath('/repo', '/repo/docs/test.md')).toBe(
      'docs/test.md'
    );
    expect(
      bundledDocsScript.resolveBundledDocsPaths({ VIHS_REPO_ROOT: '/repo' }).wikiRepoRoot
    ).toBe(path.resolve('/repo', '..', 'vi-history-suite.github.wiki'));
    expect(
      bundledDocsScript.resolveBundledDocsPaths({
        VIHS_REPO_ROOT: '/repo',
        VIHS_PUBLIC_GITHUB_WIKI_REPO_ROOT: '/public/wiki'
      }).wikiRepoRoot
    ).toBe(path.resolve('/public/wiki'));
    expect(bundledDocsScript.resolveBundledDocsPaths({ VIHS_REPO_ROOT: '/repo' }).ledgerPath).toBe(
      path.resolve('/repo', 'docs', 'product', 'public-github-wiki-publication-ledger.json')
    );
  });

  it('ignores manifest generatedAt and page wikiCommit churn while still failing on real bundle drift', () => {
    const expected = new Map<string, string>([
      [
        'manifest.json',
        JSON.stringify(
          {
            generatedAt: '2026-04-05T00:00:00.000Z',
            bundleAudience: 'extension-users',
            defaultPageId: 'overview',
            pages: [{ id: 'overview', htmlFileName: 'overview.html', wikiCommit: 'abc1234' }]
          },
          null,
          2
        )
      ],
      ['pages/overview.html', '<h1>Overview</h1>\n']
    ]);
    const sameBundleDifferentTimestamp = new Map<string, string>([
      [
        'manifest.json',
        JSON.stringify(
          {
            generatedAt: '2026-04-06T00:00:00.000Z',
            bundleAudience: 'extension-users',
            defaultPageId: 'overview',
            pages: [{ id: 'overview', htmlFileName: 'overview.html', wikiCommit: 'def5678' }]
          },
          null,
          2
        )
      ],
      ['pages/overview.html', '<h1>Overview</h1>\n']
    ]);
    const drifted = new Map<string, string>([
      ...sameBundleDifferentTimestamp.entries(),
      ['pages/overview.html', '<h1>Overview changed</h1>\n']
    ]);

    expect(
      bundledDocsScript.compareBundledDocsFiles(expected, sameBundleDifferentTimestamp)
    ).toEqual([]);
    expect(bundledDocsScript.compareBundledDocsFiles(expected, drifted)).toEqual([
      {
        path: 'pages/overview.html',
        reason: 'content-mismatch'
      }
    ]);
  });

  it('ignores CRLF-versus-LF differences while still failing on substantive html drift', () => {
    const expected = new Map<string, string>([['pages/overview.html', '<h1>Overview</h1>\r\n']]);
    const sameContentLf = new Map<string, string>([['pages/overview.html', '<h1>Overview</h1>\n']]);
    const drifted = new Map<string, string>([
      ['pages/overview.html', '<h1>Overview changed</h1>\n']
    ]);

    expect(bundledDocsScript.compareBundledDocsFiles(expected, sameContentLf)).toEqual([]);
    expect(bundledDocsScript.compareBundledDocsFiles(expected, drifted)).toEqual([
      {
        path: 'pages/overview.html',
        reason: 'content-mismatch'
      }
    ]);
  });
});
