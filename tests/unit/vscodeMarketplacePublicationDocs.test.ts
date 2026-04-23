import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const publicWikiRoot = process.env.VIHS_PUBLIC_GITHUB_WIKI_REPO_ROOT
  ? path.resolve(process.env.VIHS_PUBLIC_GITHUB_WIKI_REPO_ROOT)
  : path.resolve(repoRoot, '..', 'vi-history-suite.github.wiki');

function readAuthorityText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readPublicWikiText(fileName: string): string {
  return fs.readFileSync(path.join(publicWikiRoot, fileName), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readAuthorityText(relativePath)) as T;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

describe('vs code marketplace publication and installed-user docs', () => {
  it('retains Marketplace publication as a governed release surface', () => {
    const ledger = readJson<any>('docs/product/vscode-marketplace-publication-ledger.json');
    const ledgerDoc = readAuthorityText('docs/product/vscode-marketplace-publication-ledger.md');
    const currentState = readAuthorityText('docs/product/current-state.md');
    const releaseProcedure = readAuthorityText('docs/release-procedure.md');
    const adr = readAuthorityText(
      'docs/architecture/adr/ADR-0036-vscode-marketplace-publication-and-installed-user-entry-surface.md'
    );

    expect(ledger.publicationSurface).toBe('vscode-marketplace');
    expect(ledger.status).toBe('published');
    expect(ledger.publisherId).toBe('svelderrainruiz');
    expect(ledger.marketplaceItemName).toBe('svelderrainruiz.vi-history-suite');
    expect(ledger.listingUrl).toBe(
      'https://marketplace.visualstudio.com/items?itemName=svelderrainruiz.vi-history-suite'
    );
    expect(ledger.homepageUrl).toBe('https://github.com/svelderrainruiz/vi-history-suite/wiki');
    expect(ledger.currentPublishedVersion).toBe('1.3.7');
    expect(ledger.currentPublishedDate).toBe('2026-04-23');
    expect(ledger.currentVerificationSurface).toBe('official-gallery-extensionquery');
    expect(ledger.pendingPublicationVersion).toBeNull();
    expect(ledger.pendingPublicationPrepPackageScript).toBe(
      'npm run vscode:marketplace:prepare'
    );
    expect(ledger.pendingPublicationPrepReceiptPath).toBe(
      '.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json'
    );
    expect(ledger.pendingPublicationPrepStatus).toBe('published-and-verified');
    expect(ledger.secretHandling).toContain('do-not-retain-pat');

    expect(ledgerDoc).toContain('Current published Marketplace version: `1.3.7`');
    expect(ledgerDoc).toContain('Current pending publication: none');
    expect(ledgerDoc).toContain('`npm run vscode:marketplace:prepare`');
    expect(ledgerDoc).toContain('manual-marketplace-portal-upload');
    expect(ledgerDoc).toContain('pinned-vsce-cli');
    expect(ledgerDoc).toContain('| VS Code Marketplace exact release | published | `2026-04-23` | `1.3.7` | `pinned-vsce-cli` |');
    expect(ledgerDoc).toContain('official gallery extension query');
    expect(currentState).toContain('VS Code Marketplace listing');
    expect(currentState).toContain('[vscode-marketplace-publication-ledger.md](./vscode-marketplace-publication-ledger.md)');
    expect(releaseProcedure).toContain('VS Code Marketplace version are all published');
    expect(releaseProcedure).toContain('scripts/runPinnedVsce.js');
    expect(releaseProcedure).toContain('Marketplace: Manage');
    expect(releaseProcedure).toContain('approved operator fallback');
    expect(adr).toContain('VS Code Marketplace');
    expect(adr).toContain('manual Marketplace portal-upload fallback');
    expect(adr).toContain('do not retain PAT values or other secret material in repo evidence');
  });

  it('keeps the Marketplace-linked entry surfaces installed-user first', () => {
    expect(fs.existsSync(publicWikiRoot)).toBe(true);

    const pkg = readJson<{ homepage: string }>('package.json');
    const readme = collapseWhitespace(readAuthorityText('README.md'));
    const publicReadme = collapseWhitespace(readAuthorityText('public-github-source/README.md'));
    const publicInstall = collapseWhitespace(readAuthorityText('public-github-source/INSTALL.md'));
    const publicSupport = collapseWhitespace(readAuthorityText('public-github-source/SUPPORT.md'));
    const publicBugReport = collapseWhitespace(
      readAuthorityText('public-github-source/.github/ISSUE_TEMPLATE/bug-report.yml')
    );
    const publicLabviewVersion = collapseWhitespace(
      readAuthorityText('public-github-source/.github/ISSUE_TEMPLATE/labview-version-support.yml')
    );
    const publicFeatureRequest = collapseWhitespace(
      readAuthorityText('public-github-source/.github/ISSUE_TEMPLATE/feature-request.yml')
    );
    const publicIssueConfig = collapseWhitespace(
      readAuthorityText('public-github-source/.github/ISSUE_TEMPLATE/config.yml')
    );
    const home = collapseWhitespace(readPublicWikiText('Home.md'));
    const install = collapseWhitespace(readPublicWikiText('Install-And-Release.md'));
    const userWorkflow = collapseWhitespace(readPublicWikiText('User-Workflow.md'));

    expect(pkg.homepage).toBe('https://github.com/svelderrainruiz/vi-history-suite/wiki');

    expect(readme).toContain('Install The Extension');
    expect(readme).toContain('code --install-extension svelderrainruiz.vi-history-suite');
    expect(readme).toContain('vihs --validate');
    expect(readme).toContain('Report A Problem Or Request Support');
    expect(readme).toContain('Issue Chooser');
    expect(readme).toContain('LabVIEW Version Support Request');
    expect(readme).toContain('Evaluate From Source');
    expect(readme).toContain('Contribute');

    expect(publicReadme).toContain('Install The Extension');
    expect(publicReadme).toContain('code --install-extension svelderrainruiz.vi-history-suite');
    expect(publicReadme).toContain('vihs --validate');
    expect(publicReadme).toContain('Report A Problem Or Request Support');
    expect(publicReadme).toContain('LabVIEW Version Support Request');
    expect(publicReadme).toContain('Evaluate From Source');
    expect(publicReadme).toContain('Contribute');

    expect(publicInstall).toContain('Install The Extension');
    expect(publicInstall).toContain('First-Time Setup');
    expect(publicInstall).toContain("docker info --format '{{.OSType}}'");
    expect(publicInstall).toContain('If those checks fail, correct provider, version, bitness, or Docker readiness');
    expect(publicInstall).toContain('Use this lane only when you want to inspect the source repo');
    expect(publicSupport).toContain("docker info --format '{{.OSType}}'");
    expect(publicSupport).toContain(
      'if the selected host or Docker bundle is missing, contradictory, unsupported, or blocked, the product should fail closed with visible next-step guidance'
    );
    expect(publicBugReport).toContain('install, settings, validation, or compare problem');
    expect(publicBugReport).toContain('Install route');
    expect(publicBugReport).toContain('`vihs --validate` output');
    expect(publicBugReport).toContain('What command or surface failed?');
    expect(publicLabviewVersion).toContain('LabVIEW version support request');
    expect(publicLabviewVersion).toContain('Requested LabVIEW year');
    expect(publicLabviewVersion).toContain('Current guidance or failure output');
    expect(publicFeatureRequest).toContain(
      'install, configuration, validation, or compare improvement'
    );
    expect(publicFeatureRequest).toContain('Which surface should improve?');
    expect(publicIssueConfig).toContain('Install and release guide');
    expect(publicIssueConfig).toContain('User workflow');

    expect(home).toContain('Install And Release');
    expect(home).toContain('User Workflow');
    expect(home).toContain('Comparison Reports And Dashboard Review');
    expect(home).toContain('Source Evaluation And Codespaces');
    expect(home).toContain('Review Public LabVIEW VI Changes');
    expect(home).toContain('Refresh Codespace Repositories');

    expect(install).toContain('Install And Release');
    expect(install).toContain('vihs --validate');
    expect(install).toContain("docker info --format '{{.OSType}}'");
    expect(install).toContain('Review Public LabVIEW VI Changes');
    expect(install).toContain('Refresh Codespace Repositories');

    expect(userWorkflow).toContain('VI History');
    expect(userWorkflow).toContain('Compare');
  });
});
