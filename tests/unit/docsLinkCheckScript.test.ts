import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  checkDocumentationLinks,
  collectDocumentationFiles,
  extractHtmlLinks,
  extractMarkdownLinks,
  main,
  markdownAnchors,
  renderSummary,
  slugHeading
} = require('../../scripts/checkDocsLinks.js') as {
  checkDocumentationLinks: (cwd: string) => {
    success: boolean;
    filesChecked: number;
    localLinksChecked: number;
    externalLinksSkipped: number;
    failures: Array<{ source: string; line: number; target: string; reason: string }>;
  };
  collectDocumentationFiles: (cwd: string) => string[];
  extractHtmlLinks: (text: string) => Array<{ target: string; line: number }>;
  extractMarkdownLinks: (text: string) => Array<{ target: string; line: number }>;
  main: (
    argv?: string[],
    deps?: { cwd?: string; stdout?: { write: (text: string) => void }; stderr?: { write: (text: string) => void } }
  ) => number;
  markdownAnchors: (text: string) => Set<string>;
  renderSummary: (result: {
    success: boolean;
    filesChecked: number;
    localLinksChecked: number;
    externalLinksSkipped: number;
    failures: Array<{ source: string; line: number; target: string; reason: string }>;
  }) => string;
  slugHeading: (heading: string) => string;
};

const fixtureRoots: string[] = [];

function createFixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-link-check-'));
  fixtureRoots.push(root);

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }

  return root;
}

describe('docs link check script', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of fixtureRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('checks committed Markdown and bundled docs while skipping generated roots (VHS-REQ-597.5)', () => {
    const root = createFixture({
      'README.md': '# Readme\n',
      '.cache/node/README.md': '[Missing](missing.md)\n',
      '.git/README.md': '[Missing](missing.md)\n',
      '.vscode-test/README.md': '[Missing](missing.md)\n',
      'assurance-closeout-evidence/report.md': '[Missing](missing.md)\n',
      'assurance-release-evidence/report.md': '[Missing](missing.md)\n',
      'coverage/README.md': '[Missing](missing.md)\n',
      'dist/package.md': '[Missing](missing.md)\n',
      'node_modules/pkg/README.md': '[Missing](missing.md)\n',
      'out/README.md': '[Missing](missing.md)\n',
      'out-tests/README.md': '[Missing](missing.md)\n',
      'release-evidence/report.md': '[Missing](missing.md)\n',
      'tmp/README.md': '[Missing](missing.md)\n',
      'win-validation/WC-container/storage/reports/run/staging/README.md': '[Missing](missing.md)\n',
      'vagrant/.vagrant/README.md': '[Missing](missing.md)\n',
      'vagrant/.vagrant-ci/README.md': '[Missing](missing.md)\n',
      'vagrant/evidence/report.md': '[Missing](missing.md)\n',
      'vagrant/shared/README.md': '[Missing](missing.md)\n',
      'docs/guide.md': '# Guide\n',
      'resources/bundled-docs/pages/overview.html': '<h1>Overview</h1>',
      'resources/other/page.html': '<a href="missing.html">not checked</a>',
      'src/file.ts': 'export {};\n'
    });

    expect(collectDocumentationFiles(root)).toEqual([
      'README.md',
      'docs/guide.md',
      'resources/bundled-docs/pages/overview.html'
    ]);
  });

  it('ignores generated validation and evidence docs while still checking real docs', () => {
    const root = createFixture({
      'win-validation/WC-container/storage/reports/run/staging/README.md': '[Missing](missing.md)\n',
      'vagrant/evidence/report.md': '[Missing](missing.md)\n',
      'docs/real.md': '[Missing](missing.md)\n'
    });

    const result = checkDocumentationLinks(root);

    expect(collectDocumentationFiles(root)).toEqual(['docs/real.md']);
    expect(result.success).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({
        source: 'docs/real.md',
        target: 'missing.md',
        reason: 'target file does not exist'
      })
    ]);
  });

  it('extracts Markdown links while ignoring fenced and inline code', () => {
    const markdown = [
      '[Guide](docs/guide.md "Guide title")',
      '`[Code](code.md)`',
      '```',
      '[Fence](fenced.md)',
      '```',
      '[Angle](<docs/angle.md#part>)',
      '',
      '[ref]: docs/reference.md "Reference title"',
      '<a href="docs/html.html#top">HTML</a>',
      '<img src="images/pic.png">'
    ].join('\n');

    expect(extractMarkdownLinks(markdown)).toEqual([
      { target: 'docs/guide.md', line: 1 },
      { target: 'docs/angle.md#part', line: 6 },
      { target: 'docs/reference.md', line: 8 },
      { target: 'docs/html.html#top', line: 9 },
      { target: 'images/pic.png', line: 10 }
    ]);
  });

  it('extracts HTML href and src targets with line numbers', () => {
    expect(extractHtmlLinks('<a href="overview.html">Overview</a>\n<img src="asset.png">')).toEqual([
      { target: 'overview.html', line: 1 },
      { target: 'asset.png', line: 2 }
    ]);
  });

  it('passes local file and anchor links while skipping external URLs', () => {
    const root = createFixture({
      'README.md': [
        '# Home',
        '',
        '[Guide](docs/guide.md#deep-link)',
        '[External](https://example.invalid/path)'
      ].join('\n'),
      'docs/guide.md': ['# Guide', '', '## Deep Link'].join('\n')
    });

    const result = checkDocumentationLinks(root);

    expect(result.success).toBe(true);
    expect(result.localLinksChecked).toBe(1);
    expect(result.externalLinksSkipped).toBe(1);
    expect(slugHeading('Deep Link')).toBe('deep-link');
  });

  it('resolves absolute, encoded, duplicate, explicit, html, htm, and self anchors', () => {
    const root = createFixture({
      'README.md': [
        '# Home',
        '',
        '[Absolute](/docs/guide.md#name-1)',
        '[Explicit](docs/guide.md#manual-id)',
        '[Encoded](docs/space%20name.md#encoded%20id)',
        '[Self](#home)',
        '[Empty fragment](#)',
        '[HTML](resources/bundled-docs/page.html#spot)',
        '[HTM](docs/legacy.htm#legacy)',
        '[Binary](assets/file.bin#ignored)'
      ].join('\n'),
      'assets/file.bin': 'not markdown',
      'docs/guide.md': ['# Guide', '## Name', '## Name', '<p id="manual-id"></p>'].join('\n'),
      'docs/legacy.htm': '<a name="legacy"></a>',
      'docs/space name.md': '<h2 id="encoded id">Encoded</h2>',
      'resources/bundled-docs/page.html': '<h1 id="spot">Spot</h1>'
    });

    const result = checkDocumentationLinks(root);

    expect(result.success).toBe(true);
    expect(result.localLinksChecked).toBe(8);
    expect(markdownAnchors('## Name\n## Name\n<p id="manual-id"></p>')).toEqual(
      new Set(['name', 'name-1', 'manual-id'])
    );
  });

  it('fails when a local link resolves outside the repository', () => {
    const root = createFixture({
      'README.md': '[Outside](../outside.md)\n'
    });

    const result = checkDocumentationLinks(root);

    expect(result.success).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({
        source: 'README.md',
        target: '../outside.md',
        reason: 'target resolves outside the repository'
      })
    ]);
  });

  it('keeps malformed percent-encoded paths checkable without throwing', () => {
    const root = createFixture({
      'README.md': '[Bad Percent](docs/bad%ZZ.md)\n',
      'docs/bad%ZZ.md': '# Bad Percent\n'
    });

    const result = checkDocumentationLinks(root);

    expect(result.success).toBe(true);
    expect(result.localLinksChecked).toBe(1);
  });

  it('fails when a Markdown target file is missing', () => {
    const root = createFixture({
      'README.md': '[Missing](docs/missing.md)\n'
    });

    const result = checkDocumentationLinks(root);

    expect(result.success).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({
        source: 'README.md',
        target: 'docs/missing.md',
        reason: 'target file does not exist'
      })
    ]);
  });

  it('checks bundled HTML local links', () => {
    const root = createFixture({
      'resources/bundled-docs/pages/overview.html': '<a href="missing.html">Missing</a>'
    });

    const result = checkDocumentationLinks(root);

    expect(result.success).toBe(false);
    expect(result.failures[0]).toMatchObject({
      source: 'resources/bundled-docs/pages/overview.html',
      target: 'missing.html',
      reason: 'target file does not exist'
    });
  });

  it('fails when a local Markdown anchor is missing', () => {
    const root = createFixture({
      'README.md': '[Guide](docs/guide.md#missing-anchor)\n',
      'docs/guide.md': '# Guide\n'
    });

    const result = checkDocumentationLinks(root);

    expect(result.success).toBe(false);
    expect(result.failures[0]).toMatchObject({
      target: 'docs/guide.md#missing-anchor',
      reason: "anchor 'missing-anchor' was not found"
    });
  });

  it('renders success and failure summaries', () => {
    expect(
      renderSummary({
        success: true,
        filesChecked: 2,
        localLinksChecked: 3,
        externalLinksSkipped: 1,
        failures: []
      })
    ).toContain('[docs-links] Link check passed.');

    expect(
      renderSummary({
        success: false,
        filesChecked: 1,
        localLinksChecked: 1,
        externalLinksSkipped: 0,
        failures: [
          {
            source: 'README.md',
            line: 3,
            target: 'missing.md',
            reason: 'target file does not exist'
          }
        ]
      })
    ).toContain('README.md:3 -> missing.md (target file does not exist)');
  });

  it('main writes success summaries to stdout and returns zero', () => {
    const root = createFixture({
      'README.md': '# Home\n'
    });
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    const exitCode = main([], { cwd: root, stdout, stderr });

    expect(exitCode).toBe(0);
    expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining('Link check passed'));
    expect(stderr.write).not.toHaveBeenCalled();
  });

  it('main writes failure summaries to stderr and returns one', () => {
    const root = createFixture({
      'README.md': '[Missing](missing.md)\n'
    });
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    const exitCode = main([], { cwd: root, stdout, stderr });

    expect(exitCode).toBe(1);
    expect(stderr.write).toHaveBeenCalledWith(expect.stringContaining('Link check failed: 1'));
    expect(stdout.write).not.toHaveBeenCalled();
  });

  it('skips Markdown links whose normalized target is empty', () => {
    expect(extractMarkdownLinks('[Empty](<>)')).toEqual([]);
  });

  it('skips HTML links whose trimmed target is empty', () => {
    expect(extractHtmlLinks('<a href=" ">Blank</a>')).toEqual([]);
  });

  it('skips headings that slug to an empty anchor', () => {
    expect(markdownAnchors('# ***\n\n## Real Heading')).toEqual(new Set(['real-heading']));
  });

  it('resolves the working directory from argv[0] when no cwd dependency is supplied', () => {
    const root = createFixture({
      'README.md': '# Home\n'
    });
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    const exitCode = main([root], { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining('Link check passed'));
  });

  it('skips directory entries that are neither files nor directories', () => {
    const root = createFixture({
      'docs/real.md': '# Real\n'
    });
    let symlinkCreated = false;
    try {
      fs.symlinkSync(path.join(root, 'docs', 'real.md'), path.join(root, 'link.md'));
      symlinkCreated = true;
    } catch {
      // Symlink creation may be unavailable without elevated privileges (e.g.
      // some Windows hosts); the non-file skip branch is exercised where it is.
    }

    const files = collectDocumentationFiles(root);

    expect(files).toEqual(['docs/real.md']);
    if (symlinkCreated) {
      expect(files).not.toContain('link.md');
    }
  });
});
