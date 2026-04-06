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
      'comparison-reports-and-dashboard-review',
      'review-scenarios-and-decision-records'
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
    expect(loaded?.pageBodyHtml).toContain('<h2>Primary Review Flow</h2>');
    expect(loaded?.pageBodyHtml).toContain('<h2>Comparison Report Flow</h2>');
    expect(loaded?.pageBodyHtml).not.toContain('Read Next');
    expect(loaded?.pageBodyHtml).not.toContain('data-external-href=');
    expect(loaded?.pageBodyHtml).not.toContain('https://gitlab.com/');
    expect(loaded?.pageBodyHtml).not.toContain('docs/requirements/srs.md');
    expect(loaded?.pageBodyHtml).not.toContain('docs/requirements/rtm.csv');
    expect(loaded?.pageBodyHtml).not.toContain('LabVIEW.ini');
    expect(loaded?.pageBodyHtml).not.toContain('VI Server');
    expect(loaded?.pageBodyHtml).not.toContain('Software Requirements Specification');
    expect(loaded?.pageBodyHtml).not.toContain('Current State');

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
    expect(comparisonLoaded?.pageBodyHtml).toContain('<h2>Dashboard Review</h2>');
    expect(comparisonLoaded?.pageBodyHtml).not.toContain('Observed NI Metadata');
    expect(comparisonLoaded?.pageBodyHtml).not.toContain('Exact-Pair Diagnosis');
    expect(comparisonLoaded?.pageBodyHtml).not.toContain('Proof Surfaces');
    expect(comparisonLoaded?.pageBodyHtml).not.toContain('pair-129');
    expect(comparisonLoaded?.pageBodyHtml).not.toContain('HARNESS-VHS');

    const decisionLoaded = await loadBundledDocumentationPage(
      extensionUri as never,
      'review-scenarios-and-decision-records'
    );
    expect(decisionLoaded?.pageBodyHtml).toContain('<h2>Decision Record Contract</h2>');
    expect(decisionLoaded?.pageBodyHtml).not.toContain('Scenario Model');
    expect(decisionLoaded?.pageBodyHtml).not.toContain('Canonical Active Scenario');
    expect(decisionLoaded?.pageBodyHtml).not.toContain('Future Scenario Direction');
    expect(decisionLoaded?.pageBodyHtml).not.toContain('SCENARIO-VHS');
    expect(decisionLoaded?.pageBodyHtml).not.toContain('HARNESS-VHS');

    const overviewLoaded = await loadBundledDocumentationPage(extensionUri as never, 'overview');
    expect(overviewLoaded?.pageBodyHtml).toContain('<h2>Product Promise</h2>');
    expect(overviewLoaded?.pageBodyHtml).not.toContain('Documentation Workbench');
    expect(overviewLoaded?.pageBodyHtml).not.toContain('Debt Retirement Contract');
  });
});
