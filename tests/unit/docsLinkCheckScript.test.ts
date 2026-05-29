import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const {
  checkDocumentationLinks,
  collectDocumentationFiles,
  extractHtmlLinks,
  extractMarkdownLinks,
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
    for (const root of fixtureRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('collects Markdown and bundled HTML documentation files only', () => {
    const root = createFixture({
      'README.md': '# Readme\n',
      '.cache/node/README.md': '[Missing](missing.md)\n',
      'assurance-release-evidence/report.md': '[Missing](missing.md)\n',
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

  it('extracts Markdown and HTML link targets with line numbers', () => {
    expect(extractMarkdownLinks('[Guide](docs/guide.md)\n\n[id]: docs/ref.md')).toEqual([
      { target: 'docs/guide.md', line: 1 },
      { target: 'docs/ref.md', line: 3 }
    ]);
    expect(extractHtmlLinks('<a href="overview.html">Overview</a>')).toEqual([
      { target: 'overview.html', line: 1 }
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
});
