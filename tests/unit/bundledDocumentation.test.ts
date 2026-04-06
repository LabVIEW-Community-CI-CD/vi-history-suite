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
  it('retains a curated extension-user bundle instead of mirroring every published wiki page', async () => {
    const { manifest, manifestFilePath } = await readBundledDocumentationManifest(
      extensionUri as never
    );

    expect(manifestFilePath).toMatch(/resources\/bundled-docs\/manifest\.json$/);
    expect(manifest.bundleAudience).toBe('extension-users');
    expect(manifest.defaultPageId).toBe('overview');
    expect(manifest.pages.map((page) => page.id)).toEqual([
      'overview',
      'install-and-release',
      'user-workflow',
      'comparison-reports-and-dashboard-review'
    ]);
    expect(manifest.pages.map((page) => page.id)).not.toContain('requirements-and-verification');
    expect(manifest.pages.map((page) => page.id)).not.toContain('architecture');
    expect(manifest.pages.map((page) => page.id)).not.toContain('current-state');
    expect(manifest.pages.map((page) => page.id)).not.toContain('debt-ledger');

    for (const page of manifest.pages) {
      expect(
        fs.existsSync(path.join(repoRoot, 'resources', 'bundled-docs', 'pages', page.htmlFileName))
      ).toBe(true);
    }
  });

  it('loads concise bundled pages that stay free of private authority links and standards-only pages', async () => {
    const loaded = await loadBundledDocumentationPage(extensionUri as never, 'user-workflow');
    expect(loaded).toBeDefined();
    expect(loaded?.page.title).toBe('User Workflow');
    expect(loaded?.pageBodyHtml).toContain('<h2>Execution Policy</h2>');
    expect(loaded?.pageBodyHtml).toContain('<h2>Repository Support</h2>');
    expect(loaded?.pageBodyHtml).toContain('<h2>Primary Review Flow</h2>');
    expect(loaded?.pageBodyHtml).toContain('<h2>Comparison Report Flow</h2>');
    expect(loaded?.pageBodyHtml).toContain('if Docker Desktop is installed on Windows');
    expect(loaded?.pageBodyHtml).toContain('uses the governed Windows container');
    expect(loaded?.pageBodyHtml).toContain('if Docker is installed but unusable');
    expect(loaded?.pageBodyHtml).toContain('fix Docker instead of probing the host');
    expect(loaded?.pageBodyHtml).toContain('use the governed Windows container whenever Docker Desktop is installed');
    expect(loaded?.pageBodyHtml).toContain('no mode silently falls back to a different provider');
    expect(loaded?.pageBodyHtml).toContain('if Docker is required but unavailable, the extension stops and tells you what to fix');
    expect(loaded?.pageBodyHtml).toContain('compare progress, provider choice, and Windows image acquisition state stay visible');
    expect(loaded?.pageBodyHtml).not.toContain('Read Next');
    expect(loaded?.pageBodyHtml).not.toContain('data-external-href=');
    expect(loaded?.pageBodyHtml).not.toContain('https://gitlab.com/');
    expect(loaded?.pageBodyHtml).not.toContain('docs/requirements/srs.md');
    expect(loaded?.pageBodyHtml).not.toContain('docs/requirements/rtm.csv');
    expect(loaded?.pageBodyHtml).not.toContain('LabVIEW.ini');
    expect(loaded?.pageBodyHtml).not.toContain('VI Server');
    expect(loaded?.pageBodyHtml).not.toContain('Software Requirements Specification');
    expect(loaded?.pageBodyHtml).not.toContain('Current State');
    expect(loaded?.pageBodyHtml).toContain('VI History is available on any trusted Git repository that contains eligible LabVIEW VIs');
    expect(loaded?.pageBodyHtml).toContain('the checkbox-selected compare workflow is repo-agnostic');
    expect(loaded?.pageBodyHtml).toContain('The packaged guide is intentionally concise');
    expect(loaded?.pageBodyHtml).toContain('the primary and only extension-user compare control');
    expect(loaded?.pageBodyHtml).toContain('select the second retained revision to generate a comparison report automatically for that exact pair');
    expect(loaded?.pageBodyHtml).toContain('the oldest retained revision is still selectable as the older/base side of a checkbox-selected pair');
    expect(loaded?.pageBodyHtml).toContain('there is no separate dashboard or decision-record step in the extension-user compare flow');

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
    expect(rendered).not.toContain('Requirements And Verification');
    expect(rendered).not.toContain('Architecture');
    expect(rendered).not.toContain('data-external-href=');

    const comparisonLoaded = await loadBundledDocumentationPage(
      extensionUri as never,
      'comparison-reports-and-dashboard-review'
    );
    expect(comparisonLoaded?.pageBodyHtml).toContain('the primary compare path is selecting two retained revisions with the checkbox column');
    expect(comparisonLoaded?.pageBodyHtml).not.toContain('Observed NI Metadata');
    expect(comparisonLoaded?.pageBodyHtml).not.toContain('Exact-Pair Diagnosis');
    expect(comparisonLoaded?.pageBodyHtml).not.toContain('Proof Surfaces');
    expect(comparisonLoaded?.pageBodyHtml).not.toContain('pair-129');
    expect(comparisonLoaded?.pageBodyHtml).not.toContain('HARNESS-VHS');
    expect(comparisonLoaded?.pageBodyHtml).toContain('there is no separate compare button on commit rows for extension users');
    expect(comparisonLoaded?.pageBodyHtml).not.toContain('<h2>Dashboard Review</h2>');

    const overviewLoaded = await loadBundledDocumentationPage(extensionUri as never, 'overview');
    expect(overviewLoaded?.pageBodyHtml).toContain('<h2>Product Promise</h2>');
    expect(overviewLoaded?.pageBodyHtml).not.toContain('Documentation Workbench');
    expect(overviewLoaded?.pageBodyHtml).not.toContain('Debt Retirement Contract');
  });
});
