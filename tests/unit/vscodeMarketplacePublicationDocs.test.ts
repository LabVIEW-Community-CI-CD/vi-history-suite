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
    expect(ledger.status).toBe('published-public-validation-prerelease-1.3.12');
    expect(ledger.publisherId).toBe('svelderrainruiz');
    expect(ledger.marketplaceItemName).toBe('svelderrainruiz.vi-history-suite');
    expect(ledger.listingUrl).toBe(
      'https://marketplace.visualstudio.com/items?itemName=svelderrainruiz.vi-history-suite'
    );
    expect(ledger.homepageUrl).toBe('https://github.com/svelderrainruiz/vi-history-suite/wiki');
    expect(ledger.currentPublishedVersion).toBe('1.3.12');
    expect(ledger.currentPublishedDate).toBe('2026-04-27');
    expect(ledger.currentPublishedKind).toBe('public-validation-pre-release');
    expect(ledger.currentRegularPublishedVersion).toBe('1.3.9');
    expect(ledger.currentPreReleaseVersion).toBe('1.3.12');
    expect(ledger.currentPreReleaseLastUpdated).toBe('2026-04-27T00:36:15.800Z');
    expect(ledger.currentVerificationSurface).toBe(
      'official-gallery-extensionquery-vsce-show-and-vscode-cli-install'
    );
    expect(ledger.pendingPublicationVersion).toBeNull();
    expect(ledger.pendingPublicationInstallProofPackageScript).toBe(
      'npm run vscode:marketplace:install-proof'
    );
    expect(ledger.pendingPublicationInstallProofReceiptPath).toBe(
      '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json'
    );
    expect(ledger.pendingPublicationInstallProofStatus).toBe(
      'not-required-for-community-validation-prerelease-windows-proof-deferred'
    );
    expect(ledger.pendingPublicationPrepPackageScript).toBe(
      'npm run vscode:marketplace:prepare'
    );
    expect(ledger.pendingPublicationPrepReceiptPath).toBe(
      '.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json'
    );
    expect(ledger.pendingPublicationPrepStatus).toBe(
      'closed-public-validation-prerelease-published-and-verified'
    );
    expect(ledger.communityValidationPreviewPreparation).toMatchObject({
      status: 'published-and-verified',
      publicationClaim: 'public-validation-prerelease',
      preparePackageScript: 'npm run vscode:marketplace:community-preview:prepare',
      prepReceiptPath:
        '.cache/vscode-marketplace-community-validation-preview-prep/latest/vscode-marketplace-community-validation-preview-prep.json',
      preferredVsceMode: 'pre-release',
      targetVersionPolicy:
        'must-be-distinct-higher-major-minor-patch-than-current-marketplace-version',
      targetVersion: '1.3.12',
      publishTrigger: 'maintainer-authorized-public-github-and-marketplace-public-validation-publication',
      publishedDate: '2026-04-27',
      marketplaceLastUpdated: '2026-04-27T00:36:15.800Z',
      previewVsixPath: 'preview-evidence/vi-history-suite-1.3.12.vsix',
      previewVsixSha256: 'e0d72bc198756d0f3302779830fc4e187d4bc63818769ffedaedaffb23d4dc25',
      windowsInstalledUserProofState: 'community-deferred',
      windowsLabviewFeaturePolicy:
        'all-provider-year-bitness-variants-selectable-with-runtime-error-code-and-proof-packet-disclosure',
      publicGitHubMutationAttemptedByPrep: false,
      marketplaceMutationAttemptedByPrep: false,
      publicGitHubMutationAttemptedByPublication: true,
      marketplaceMutationAttemptedByPublication: true,
      verificationSurface: 'official-gallery-extensionquery-vsce-show-and-vscode-cli-install'
    });
    expect(ledger.publicValidationPrereleaseV1312).toMatchObject({
      status: 'published-and-verified',
      marketplaceTargetVersion: '1.3.12',
      marketplacePublishedVersion: '1.3.12',
      marketplacePublished: true,
      marketplaceLastUpdated: '2026-04-27T00:36:15.800Z',
      publicGitHubReleaseTarget: 'v1.3.12-public-validation-prerelease',
      publicGitHubReleaseId: 313840265,
      publicGitHubMainCommit: '1853a4332eff40665e30db6e632febaa9821cf98',
      publicGitHubPullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/63',
      publicGitHubPublished: true,
      publicGitHubMutationAuthorized: true,
      marketplaceMutationAuthorized: true,
      linuxDocker2026x64: 'admitted',
      linuxHostLabview2026x64: 'admitted',
      windowsInstalledUserLabviewProof: 'community-deferred',
      previewVsixSha256: 'e0d72bc198756d0f3302779830fc4e187d4bc63818769ffedaedaffb23d4dc25',
      supersededPublicGitHubReleaseTag: 'v1.3.12-public-validation'
    });
    expect(ledger.publicValidationPrerelease).toMatchObject({
      status: 'published-and-verified',
      marketplaceTargetVersion: '1.3.11',
      publicGitHubReleaseTarget: 'v1.3.11-public-validation',
      publicGitHubMutationAuthorized: true,
      marketplaceMutationAuthorized: true,
      allCliVariantsSelectable: true,
      marketplacePublishedVersion: '1.3.11',
      marketplaceLastUpdated: '2026-04-26T16:51:22.260Z',
      nominalPackageTag: 'v1.3.11',
      publicGitHubReleaseId: 313782074,
      publicGitHubReleaseUrl:
        'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.11-public-validation',
      publicGitHubMainCommit: '5e67194992af021ada2903ea868e8b84678d72d6',
      publicGitHubPullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/46',
      publicGitHubPublished: true,
      marketplacePublished: true,
      previewVsixSha256: '21a21f7638d5348274ef66a9e58e0ba8d58918b72937e1b8c2e104bc6a0136ff'
    });
    expect(ledger.communityValidationIntake).toMatchObject({
      status: 'public-github-published-and-verified',
      packetPath: 'docs/product/marketplace-community-validation-intake-v1.3.10.md',
      packetJsonPath: 'docs/product/marketplace-community-validation-intake-v1.3.10.json',
      preparedIssueTemplatePath:
        'public-github-source/.github/ISSUE_TEMPLATE/community-validation-windows-labview.yml',
      preparedLabelManifestPath: 'public-github-source/.github/labels.yml',
      publicGitHubPublishedShortCommit: 'b56fde1',
      publicGitHubLabelsApplied: true,
      publicGitHubMutationAttempted: true,
      publicGitHubReleaseMutationAttempted: false,
      publicGitHubTagMutationAttempted: false,
      publicGitHubWikiMutationAttempted: false,
      marketplaceMutationAttempted: false,
      proofStatusPolicy: 'selectable-does-not-mean-maintainer-proven'
    });
    expect(ledger.secretHandling).toContain('do-not-retain-pat');

    expect(ledgerDoc).toContain('Current published Marketplace version: `1.3.12`');
    expect(ledgerDoc).toContain('Current regular Marketplace version: `1.3.9`');
    expect(ledgerDoc).toContain('Current pre-release Marketplace version: `1.3.12`');
    expect(ledgerDoc).toContain('Current pending publication: none');
    expect(ledgerDoc).toContain('`npm run vscode:marketplace:install-proof`');
    expect(ledgerDoc).toContain('not-required-for-community-validation-prerelease-windows-proof-deferred');
    expect(ledgerDoc).toContain('`npm run vscode:marketplace:prepare`');
    expect(ledgerDoc).toContain('## Community-Validation Preview Preparation');
    expect(ledgerDoc).toContain('`npm run vscode:marketplace:community-preview:prepare`');
    expect(ledgerDoc).toContain('Target preview version: `1.3.12`');
    expect(ledgerDoc).toContain('Published preview version: `1.3.12`');
    expect(ledgerDoc).toContain('maintainer authorized public GitHub and Marketplace public');
    expect(ledgerDoc).toContain('## Public Validation Pre-Release 1.3.12');
    expect(ledgerDoc).toContain('v1.3.12-public-validation-prerelease');
    expect(ledgerDoc).toContain('https://github.com/svelderrainruiz/vi-history-suite/pull/63');
    expect(ledgerDoc).toContain(
      'e0d72bc198756d0f3302779830fc4e187d4bc63818769ffedaedaffb23d4dc25'
    );
    expect(ledgerDoc).toContain('## Public Validation Pre-Release 1.3.11');
    expect(ledgerDoc).toContain('v1.3.11-public-validation');
    expect(ledgerDoc).toContain('https://github.com/svelderrainruiz/vi-history-suite/pull/46');
    expect(ledgerDoc).toContain(
      '21a21f7638d5348274ef66a9e58e0ba8d58918b72937e1b8c2e104bc6a0136ff'
    );
    expect(ledgerDoc).toContain('## Community-Validation Intake');
    expect(ledgerDoc).toContain('public GitHub published and verified');
    expect(ledgerDoc).toContain('https://github.com/svelderrainruiz/vi-history-suite/pull/45');
    expect(ledgerDoc).toContain('b56fde158fe151a736fe72c833efdfd0874d8537');
    expect(ledgerDoc).toContain(
      'docs/product/marketplace-community-validation-intake-v1.3.10.md'
    );
    expect(ledgerDoc).toContain('public-github-source/.github/labels.yml');
    expect(ledgerDoc).toContain('manual-marketplace-portal-upload');
    expect(ledgerDoc).toContain('pinned-vsce-cli');
    expect(ledgerDoc).toContain('| VS Code Marketplace community-validation preview | published | `2026-04-25` | `1.3.10` | `pinned-vsce-cli-pre-release` |');
    expect(ledgerDoc).toContain(
      '| VS Code Marketplace public-validation preview | published | `2026-04-26` | `1.3.11` | `pinned-vsce-cli-pre-release` |'
    );
    expect(ledgerDoc).toContain(
      '| VS Code Marketplace public-validation preview | published | `2026-04-27` | `1.3.12` | `pinned-vsce-cli-pre-release` |'
    );
    expect(ledgerDoc).toContain('| VS Code Marketplace exact release | published | `2026-04-23` | `1.3.9` | `pinned-vsce-cli` |');
    expect(ledgerDoc).toContain('official gallery extension query');
    expect(currentState).toContain('VS Code Marketplace listing');
    expect(currentState).toContain('[vscode-marketplace-publication-ledger.md](./vscode-marketplace-publication-ledger.md)');
    expect(releaseProcedure).toContain('VS Code Marketplace version are all published');
    expect(releaseProcedure).toContain('npm run vscode:marketplace:install-proof');
    expect(releaseProcedure).toContain('npm run vscode:marketplace:community-preview:prepare');
    expect(releaseProcedure).toContain('authorization for public GitHub and Marketplace publication');
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
    expect(readme).toContain('Marketplace pre-release `1.3.12` is the public validation lane');
    expect(readme).toContain('svelderrainruiz.vi-history-suite@prerelease');
    expect(readme).toContain('Traceability Matrix');
    expect(readme).toContain('Report A Problem Or Request Support');
    expect(readme).toContain('Issue Chooser');
    expect(readme).toContain('Marketplace Community Validation Report');
    expect(readme).toContain('LabVIEW Version Support Request');
    expect(readme).toContain('Evaluate From Source');
    expect(readme).toContain('Contribute');
    expect(readme).not.toContain('Install And Use');
    expect(readme).not.toContain('exact released Marketplace line');
    expect(readme).not.toContain('maintained `develop` candidate line');
    expect(readme).not.toContain('install-vihs-extension.ps1');

    expect(publicReadme).toContain('Install The Extension');
    expect(publicReadme).toContain('code --install-extension svelderrainruiz.vi-history-suite');
    expect(publicReadme).toContain(
      'The packaged Marketplace listing is intentionally installed-user first'
    );
    expect(publicReadme).toContain('vihs --validate');
    expect(publicReadme).toContain('Proof Status And Community Validation');
    expect(publicReadme).toContain('svelderrainruiz.vi-history-suite@prerelease');
    expect(publicReadme).toContain('Report A Problem Or Request Support');
    expect(publicReadme).toContain('Marketplace Community Validation Report');
    expect(publicReadme).toContain('LabVIEW Version Support Request');
    expect(publicReadme).toContain('Evaluate From Source');
    expect(publicReadme).toContain('Contribute');
    expect(publicReadme).not.toContain('Install And Use');
    expect(publicReadme).not.toContain('exact released Marketplace line');
    expect(publicReadme).not.toContain('maintained `develop` candidate line');
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
    expect(publicBugReport).toContain('Marketplace public-validation pre-release (`1.3.12`)');
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
