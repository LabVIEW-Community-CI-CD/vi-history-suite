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
    expect(ledger.status).toBe('published-exact-release-1.3.16');
    expect(ledger.publisherId).toBe('svelderrainruiz');
    expect(ledger.marketplaceItemName).toBe('svelderrainruiz.vi-history-suite');
    expect(ledger.listingUrl).toBe(
      'https://marketplace.visualstudio.com/items?itemName=svelderrainruiz.vi-history-suite'
    );
    expect(ledger.homepageUrl).toBe('https://github.com/svelderrainruiz/vi-history-suite/wiki');
    expect(ledger.currentPublishedVersion).toBe('1.3.16');
    expect(ledger.currentPublishedDate).toBe('2026-05-11');
    expect(ledger.currentPublishedKind).toBe('exact-release');
    expect(ledger.currentRegularPublishedVersion).toBe('1.3.16');
    expect(ledger.currentRegularLastUpdated).toBe('2026-05-11T23:10:13.317Z');
    expect(ledger.currentPreReleaseVersion).toBe('1.3.13');
    expect(ledger.currentPreReleaseLastUpdated).toBe('2026-04-27T04:24:05.457Z');
    expect(ledger.currentVerificationSurface).toBe(
      'official-gallery-extensionquery-vsce-show-and-vscode-cli-install'
    );
    expect(ledger.pendingPublicationVersion).toBeNull();
    expect(ledger.pendingPublicationInstallProofPackageScript).toBe(
      'npm run vscode:marketplace:install-proof'
    );
    expect(ledger.pendingPublicationInstallProofStatus).toBe(
      'passed-v1.3.16-isolated-exact-vsix-install'
    );
    expect(ledger.pendingPublicationPrepPackageScript).toBe(
      'npm run vscode:marketplace:prepare'
    );
    expect(ledger.pendingPublicationPrepStatus).toBe(
      'closed-exact-release-1.3.16-published-and-verified'
    );
    expect(ledger.latestExactRelease).toMatchObject({
      status: 'published-and-verified',
      version: '1.3.16',
      authorityTag: 'v1.3.16',
      authorityMainCommit: '9c8e0a8503a84cba5d0ea722dd1497a35f52326c',
      publicMainCommit: 'f679023ed760963779d9331a9395128ad01c7e54',
      publicGitHubPullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/88',
      publicGitHubReleaseId: 320824958,
      marketplaceLastUpdated: '2026-05-11T23:10:13.317Z',
      vsixSha256: '56bc9b222ec859f530ea523eed215b2efde4ce96fa9fcc4974f6589da3b81170',
      windowsExactVsixInstallProofReceiptPath:
        '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json',
      marketplacePrepReceiptPath:
        '.cache/vscode-marketplace-publication-prep/v1.3.16-marketplace-verified/vscode-marketplace-publication-prep.json',
      publicGitHubExactTransactionReceiptPath:
        '.cache/public-github-exact-v1.3.16-verify-after-marketplace/public-github-exact-release-transaction.json'
    });
    expect(ledger.communityValidationPreviewPreparation).toMatchObject({
      status: 'published-and-verified',
      publicationClaim: 'public-validation-prerelease',
      targetVersion: '1.3.13',
      publishedVersion: '1.3.13',
      marketplaceLastUpdated: '2026-04-27T04:24:05.457Z',
      previewVsixPath: 'preview-evidence/vi-history-suite-1.3.13.vsix',
      windowsInstalledUserProofState: 'admitted-for-host-labview-2026-x64'
    });
    expect(ledger.publicValidationPrereleaseV1313).toMatchObject({
      status: 'published-and-verified',
      marketplaceTargetVersion: '1.3.13',
      marketplacePublishedVersion: '1.3.13',
      publicGitHubReleaseTarget: 'v1.3.13-public-validation-prerelease-1',
      publicGitHubReleaseId: 313873748,
      windowsDockerDesktopProof: 'community-deferred'
    });
    expect(ledger.secretHandling).toContain('do-not-retain-pat');
    expect(ledger.publicationHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'published',
          publishedDate: '2026-05-11',
          version: '1.3.16',
          publicationMode: 'pinned-vsce-cli'
        })
      ])
    );

    expect(ledgerDoc).toContain('Current published Marketplace version: `1.3.16`');
    expect(ledgerDoc).toContain('Current regular Marketplace version: `1.3.16`');
    expect(ledgerDoc).toContain('Current pre-release Marketplace version: `1.3.13`');
    expect(ledgerDoc).toContain('closed-exact-release-1.3.16-published-and-verified');
    expect(ledgerDoc).toContain('## Exact Release 1.3.16');
    expect(ledgerDoc).toContain('https://github.com/svelderrainruiz/vi-history-suite/pull/88');
    expect(ledgerDoc).toContain('320824958');
    expect(ledgerDoc).toContain(
      '56bc9b222ec859f530ea523eed215b2efde4ce96fa9fcc4974f6589da3b81170'
    );
    expect(ledgerDoc).toContain('## Community-Validation Preview Preparation');
    expect(ledgerDoc).toContain('Target preview version: `1.3.13`');
    expect(ledgerDoc).toContain('Published preview version: `1.3.13`');
    expect(ledgerDoc).toContain('## Public Validation Pre-Release 1.3.13');
    expect(ledgerDoc).toContain('v1.3.13-public-validation-prerelease-1');
    expect(ledgerDoc).toContain('## Public Validation Pre-Release 1.3.12');
    expect(ledgerDoc).toContain('## Public Validation Pre-Release 1.3.11');
    expect(ledgerDoc).toContain('## Community-Validation Intake');
    expect(ledgerDoc).toContain('manual-marketplace-portal-upload');
    expect(ledgerDoc).toContain('pinned-vsce-cli');
    expect(ledgerDoc).toContain(
      '| VS Code Marketplace exact release | published | `2026-05-11` | `1.3.16` | `pinned-vsce-cli` |'
    );
    expect(ledgerDoc).toContain('official gallery extension query');
    expect(currentState).toContain('VS Code Marketplace listing');
    expect(currentState).toContain('[vscode-marketplace-publication-ledger.md](./vscode-marketplace-publication-ledger.md)');
    expect(currentState).toContain('VS Code Marketplace retained published version: `1.3.16`');
    expect(releaseProcedure).toContain('VS Code Marketplace version are all published');
    expect(releaseProcedure).toContain('npm run vscode:marketplace:install-proof');
    expect(releaseProcedure).toContain('npm run vscode:marketplace:community-preview:prepare');
    expect(releaseProcedure).toContain('scripts/runPinnedVsce.js');
    expect(releaseProcedure).toContain('Marketplace: Manage');
    expect(releaseProcedure).toContain('approved operator fallback');
    expect(adr).toContain('VS Code Marketplace');
    expect(adr).toContain('manual Marketplace portal-upload fallback');
    expect(adr).toContain('do not retain PAT values or other secret material in repo evidence');
    expect(adr).toContain('packaged README content stays version-agnostic');
    expect(adr).toContain('Windows exact-VSIX install proof');
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
    expect(readme).toContain('The packaged Marketplace listing is intentionally installed-user first');
    expect(readme).toContain('vihs --validate');
    expect(readme).toContain('Proof Status And Community Validation');
    expect(readme).toContain('Marketplace stable `1.3.16` is the regular installed-user release');
    expect(readme).toContain('Traceability Matrix');
    expect(readme).toContain('Report A Problem Or Request Support');
    expect(readme).toContain('Issue Chooser');
    expect(readme).toContain('Marketplace Community Validation Report');
    expect(readme).toContain('LabVIEW Version Support Request');
    expect(readme).toContain('Evaluate From Source');
    expect(readme).toContain('Contribute');
    expect(readme).not.toContain('Install And Use');
    expect(readme).not.toContain('install-vihs-extension.ps1');

    expect(publicReadme).toContain('Install The Extension');
    expect(publicReadme).toContain('code --install-extension svelderrainruiz.vi-history-suite');
    expect(publicReadme).toContain(
      'The packaged Marketplace listing is intentionally installed-user first'
    );
    expect(publicReadme).toContain('vihs --validate');
    expect(publicReadme).toContain('Proof Status And Community Validation');
    expect(publicReadme).toContain('Stable `1.3.16` is the current installed-user release line');
    expect(publicReadme).toContain('Report A Problem Or Request Support');
    expect(publicReadme).toContain('Marketplace Community Validation Report');
    expect(publicReadme).toContain('LabVIEW Version Support Request');
    expect(publicReadme).toContain('Evaluate From Source');
    expect(publicReadme).toContain('Contribute');
    expect(publicReadme).not.toContain('Install And Use');
    expect(publicReadme).not.toContain('install-vihs-extension.ps1');

    expect(publicInstall).toContain('Install The Extension');
    expect(publicInstall).toContain('First-Time Setup');
    expect(publicInstall).toContain("docker info --format '{{.OSType}}'");
    expect(publicInstall).toContain('If those checks fail, correct provider, version, bitness, or Docker readiness');
    expect(publicInstall).toContain('Use this lane only when you want to inspect the source repo');
    expect(publicSupport).toContain("docker info --format '{{.OSType}}'");
    expect(publicSupport).toContain(
      'if the selected host or Docker bundle is missing, contradictory, unsupported, or blocked, the product should fail closed with visible next-step guidance'
    );
    expect(publicSupport).toContain('Community Validation Triage');
    expect(publicSupport).toContain('proof:reported');
    expect(publicBugReport).toContain('install, settings, validation, or compare problem');
    expect(publicBugReport).toContain('Install route');
    expect(publicBugReport).toContain('Marketplace stable installed-user `1.3.16`');
    expect(publicBugReport).toContain('Exact released Marketplace line (`1.3.16`)');
    expect(publicBugReport).toContain('Marketplace pre-release channel (latest pre-release)');
    expect(publicBugReport).toContain('runtime_error_code');
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
