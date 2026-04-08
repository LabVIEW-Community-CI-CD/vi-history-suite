import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const publicWikiRoot = path.resolve(repoRoot, '..', 'vi-history-suite.github.wiki');

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
    expect(ledger.currentPublishedVersion).toBe('1.2.1');
    expect(ledger.currentVerificationSurface).toBe('official-gallery-extensionquery');
    expect(ledger.secretHandling).toContain('do-not-retain-pat');

    expect(ledgerDoc).toContain('Current published Marketplace version: `1.2.1`');
    expect(ledgerDoc).toContain('manual-marketplace-portal-upload');
    expect(ledgerDoc).toContain('pinned-vsce-cli');
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
    const home = collapseWhitespace(readPublicWikiText('Home.md'));
    const install = collapseWhitespace(readPublicWikiText('Install-And-Release.md'));
    const userWorkflow = collapseWhitespace(readPublicWikiText('User-Workflow.md'));

    expect(pkg.homepage).toBe('https://github.com/svelderrainruiz/vi-history-suite/wiki');

    expect(readme).toContain('If You Installed VI History Suite From The Marketplace');
    expect(readme).toContain('You do not need to fork this repo or learn the branch model to use the installed extension.');
    expect(readme).toContain('install or start Docker Desktop or Docker, then confirm `docker info`');
    expect(readme).toContain('The rest of this README is the authority repo and release-control entry surface');

    expect(publicReadme).toContain('If You Installed VI History Suite');
    expect(publicReadme).toContain('You do not need to fork this repo or choose a branch to use the installed extension locally.');
    expect(publicReadme).toContain('install or start Docker Desktop or Docker, then confirm `docker info`');
    expect(publicReadme).toContain('Branches matter only when you are evaluating or contributing to the source repo.');

    expect(publicInstall).toContain('Installed Extension Start');
    expect(publicInstall).toContain('You do not need to fork the repo for this path.');
    expect(publicInstall).toContain("docker info --format '{{.OSType}}'");
    expect(publicInstall).toContain('If those checks fail, install or start Docker before expecting image');
    expect(publicInstall).toContain('Marketplace and exact-release users can stop after the installed-user flow above.');
    expect(publicSupport).toContain("docker info --format '{{.OSType}}'");
    expect(publicSupport).toContain('If Docker is not installed yet, not running yet');

    expect(home).toContain('If You Installed The Extension');
    expect(home).toContain('You do not need to fork the repo or learn the branch model for this path.');
    expect(home).toContain('install or start Docker Desktop or Docker, then confirm `docker info`');
    expect(home).toContain('Source Evaluation And Codespaces');
    expect(home).toContain(
      'When you are evaluating the next public candidate, use `develop` rather than GitHub\'s default `main` branch.'
    );
    expect(home).toContain(
      'public `https://github.com/...` or `https://gitlab.com/...` target repo'
    );

    expect(install).toContain('Installed Extension Users');
    expect(install).toContain(
      'retained exact-version releases: `v0.2.0`, `v1.0.0`, `v1.0.1`, `v1.0.2`, `v1.0.3`, `v1.0.4`, `v1.0.5`, `v1.0.6`, `v1.1.0`, `v1.2.0`, `v1.2.1`'
    );
    expect(install).toContain('VS Code Marketplace listing');
    expect(install).toContain('exact released VSIX from GitHub release `v1.2.1`');
    expect(install).toContain("docker info --format '{{.OSType}}'");
    expect(install).toContain('If those checks fail, install or start Docker before expecting image');
    expect(install).toContain('Use this lane only when you want to evaluate the source repo');
    expect(install).toContain('Open the repo or your fork on `develop` in a devcontainer or Codespace.');
    expect(install).toContain(
      'That generic bootstrap is intentionally limited to public `https://github.com/...` and `https://gitlab.com/...` repository URLs.'
    );

    expect(userWorkflow).toContain(
      'the extension is installed from the VS Code Marketplace, the current exact released VSIX, or a preview VSIX when you intentionally want the next candidate'
    );
    expect(userWorkflow).toContain(
      'If Docker is not installed yet or not running yet, install or start it first, then rerun the compare flow.'
    );
  });
});
