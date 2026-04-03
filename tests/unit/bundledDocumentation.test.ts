import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  loadBundledDocumentationPage,
  readBundledDocumentationManifest,
  renderBundledDocumentationPanelHtml
} from '../../src/docs/bundledDocumentation';

const repoRoot = path.resolve(__dirname, '..', '..');
const extensionUri = {
  fsPath: repoRoot
};

describe('bundled documentation', () => {
  it('tracks the published wiki ledger and retains generated page fragments', async () => {
    const ledgerPath = path.join(repoRoot, 'docs', 'product', 'wiki-publication-ledger.json');
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) as {
      pages: Array<{ id: string; status: string }>;
    };
    const publishedPageIds = ledger.pages
      .filter((page) => page.status === 'published')
      .map((page) => page.id);

    const { manifest, manifestFilePath } = await readBundledDocumentationManifest(
      extensionUri as never
    );

    expect(manifestFilePath).toMatch(/resources\/bundled-docs\/manifest\.json$/);
    expect(manifest.defaultPageId).toBe('overview');
    expect(manifest.pages.map((page) => page.id)).toEqual(publishedPageIds);

    for (const page of manifest.pages) {
      expect(
        fs.existsSync(path.join(repoRoot, 'resources', 'bundled-docs', 'pages', page.htmlFileName))
      ).toBe(true);
    }
  });

  it('loads a bundled page and renders a navigation shell with local-page and external-link handling', async () => {
    const loaded = await loadBundledDocumentationPage(extensionUri as never, 'overview');
    expect(loaded).toBeDefined();
    expect(loaded?.page.title).toBe('Overview');
    expect(loaded?.pageBodyHtml).toContain('VI History Suite');
    expect(loaded?.pageBodyHtml).toContain('data-page-id="install-and-release"');
    expect(loaded?.pageBodyHtml).toContain('data-external-href="https://gitlab.com/');

    const rendered = renderBundledDocumentationPanelHtml({
      extensionVersion: '0.2.0',
      manifest: loaded!.manifest,
      page: loaded!.page,
      pageBodyHtml: loaded!.pageBodyHtml
    });

    expect(rendered).toContain('data-testid="documentation-shell"');
    expect(rendered).toContain('data-testid="documentation-sidebar"');
    expect(rendered).toContain('data-testid="documentation-nav"');
    expect(rendered).toContain('data-testid="documentation-page-body"');
    expect(rendered).toContain('Installed extension version: 0.2.0');
    expect(rendered).toContain('data-page-id="install-and-release"');
    expect(rendered).toContain('data-external-href="https://gitlab.com/');
  });
});
