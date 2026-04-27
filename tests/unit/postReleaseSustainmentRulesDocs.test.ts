import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('post-release sustainment rules package', () => {
  it('retains the fully closed v1.3.9 line while keeping v1.3.8 as blocked historical evidence', () => {
    const rules = readJson<any>('docs/product/post-release-sustainment-rules.json');
    const rulesDoc = readText('docs/product/post-release-sustainment-rules.md');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const releaseProcedure = readText('docs/release-procedure.md');

    expect(rules.trancheId).toBe('TRANCHE-012');
    expect(rules.issueId).toBe('ISSUE-0409');
    expect(rules.programId).toBe('PROGRAM-0004');
    expect(rules.status).toBe('active');
    expect(rules.releaseCadence.model).toBe('event-driven');
    expect(rules.releaseCadence.versionLineContract).toEqual(
      expect.objectContaining({
        currentExactReleaseLine: 'v1.3.9',
        currentMainPackageLine: '1.3.9',
        currentDevelopPackageLine: '1.3.13',
        activeMarketplaceCommunityPreviewLine: '1.3.13',
        activeDevelopCandidateReleaseLine: null,
        activeReleaseCandidateBranch: null,
        activeHotfixCandidateReleaseLine: null,
        activeHotfixBranch: null,
        activeFeatureBranch: null,
        preTagPublicExactProofPackageScript: 'npm run public:exact:pretag:proof',
        preTagPublicExactProofJob: 'public_exact_pretag_proof',
        publicGitHubExactTransactionPackageScript: 'npm run public:github:exact:transaction:verify',
        publicGitHubExactTransactionReceiptPath:
          '.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json',
        windowsExactVsixInstallProofPackageScript: 'npm run vscode:marketplace:install-proof',
        windowsExactVsixInstallProofReceiptPath:
          '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json',
        vscodeMarketplacePublicationPrepPackageScript: 'npm run vscode:marketplace:prepare',
        vscodeMarketplacePublicationPrepReceiptPath:
          '.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json',
        vscodeMarketplaceCommunityValidationPreviewPrepPackageScript:
          'npm run vscode:marketplace:community-preview:prepare',
        vscodeMarketplaceCommunityValidationPreviewPrepReceiptPath:
          '.cache/vscode-marketplace-community-validation-preview-prep/latest/vscode-marketplace-community-validation-preview-prep.json',
        vscodeMarketplaceCommunityValidationPreviewPrepStatus:
          'prepared-authorized-awaiting-gitlab-authority-green',
        vscodeMarketplaceCommunityValidationPreviewTargetVersion: '1.3.13',
        vscodeMarketplaceCommunityValidationPreviewPublishedVersion: null,
        vscodeMarketplaceCommunityValidationPreviewPublishedDate: null,
        vscodeMarketplaceCommunityValidationPreviewLastUpdated: null,
        vscodeMarketplaceCommunityValidationPreviewVsixSha256: null,
        publicDefaultBranch: 'main',
        publicCodespaceBranch: 'develop',
        integrationBranch: 'develop',
        releaseBranch: 'release/*',
        hotfixBranch: 'hotfix/*',
        exactReleaseLineBranch: 'main',
        nextLineBranchModel: 'gitflow'
      })
    );
    expect(rules.releaseCadence.versionLineContract.retainedExactVersionReleases).toContain('v1.3.7');
    expect(rules.releaseCadence.versionLineContract.retainedExactVersionReleases).toContain('v1.3.8');
    expect(rules.releaseCadence.versionLineContract.retainedExactVersionReleases).toContain('v1.3.9');
    expect(rules.releaseCadence.versionLineContract.publicGitHubExactPublishabilityProbe).toEqual(
      expect.objectContaining({
        status: 'published',
        blockerCode: null,
        draftReleaseId: 312994104,
        draftReleaseLookupStatusCode: 200,
        draftReleaseHtmlUrlUsesUntaggedPath: false
      })
    );
    expect(
      rules.releaseCadence.versionLineContract.publicGitHubExactDraftPublishabilityProbe
    ).toEqual(
      expect.objectContaining({
        status: 'not-applicable',
        blockerCode: 'draft-release-not-draft',
        draftReleaseId: 312994104,
        draftReleaseByIdStatusCode: 200,
        draftReleaseTagMatchesAuthority: true,
        authorityReleaseManifestPath:
          '.cache/gitlab-release-artifacts/v1.3.9/expanded/release-evidence/release-manifest.json',
        releaseAssetsRetainedAgainstManifest: true
      })
    );
    expect(rules.releaseCadence.versionLineContract.publicGitHubExactImmutableAssetIncident).toEqual(
      expect.objectContaining({
        status: 'historical-retained',
        authorityTag: 'v1.3.8',
        publicGitHubReleaseId: 312768592,
        publicGitHubReleaseImmutable: true,
        publicGitHubReleaseAssetCount: 0,
        blockerCode: 'published-immutable-release-assets-incomplete',
        marketplaceVersionRetained: '1.3.9'
      })
    );
    expect(rules.releaseCadence.activeOpeningDecision).toEqual(
      expect.objectContaining({
        recordedAt: '2026-04-23',
        chosenBump: 'patch',
        publicGitHubExactTransactionPackageScript: 'npm run public:github:exact:transaction:verify'
      })
    );
    expect(rules.softwareFactoryGovernance).toEqual(
      expect.objectContaining({
        status: 'authority-v1.3.9-fully-published-no-open-release-line',
        activeFeatureBranch: null,
        soleProductionRecoveryTarget: null,
        productionMutationAllowed: false
      })
    );
    expect(rules.softwareFactoryGovernance.recoveryBoundary).toEqual(
      expect.arrayContaining([
        'repair-in-place first when public GitHub main, tag, or draft release already exist',
        'current exact GitHub and VS Code Marketplace acts are fully closed for v1.3.9 while v1.3.8 is retained as blocked historical incident evidence'
      ])
    );
    expect(rules.softwareFactoryGovernance.approvalModel).toEqual(
      expect.arrayContaining([
        'assess, rehearse, and repair are repo-owned and automatic non-production phases',
        'publish and verify are repo-owned and automatic guarded non-mutating contract phases',
        'later VS Code Marketplace publish requires explicit production approval through the repo-owned publication path'
      ])
    );

    expect(rulesDoc).toContain('current exact released line: `v1.3.9`');
    expect(rulesDoc).toContain('current published package line on `main`: `1.3.9`');
    expect(rulesDoc).toContain('current develop package line on `develop`: `1.3.13`');
    expect(rulesDoc).toContain('active release-candidate branch: none');
    expect(rulesDoc).toContain('public release `312994104` is published on `v1.3.9`');
    expect(rulesDoc).toContain('`312768592` is already published and immutable with zero assets');
    expect(rulesDoc).toContain('asset-first GitHub release rule');
    expect(rulesDoc).toContain('`npm run vscode:marketplace:install-proof`');
    expect(rulesDoc).toContain(
      '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json'
    );
    expect(rulesDoc).toContain('runtimeValidationOutcome=ready');
    expect(rulesDoc).toContain('VS Code Marketplace publication prep package script');
    expect(rulesDoc).toContain('`npm run vscode:marketplace:prepare`');
    expect(rulesDoc).toContain('`npm run vscode:marketplace:community-preview:prepare`');
    expect(rulesDoc).toContain('Marketplace public validation preview status: prepared, authorized, pending');
    expect(rulesDoc).toContain('Marketplace public validation preview last updated: pending post-publication');
    expect(rulesDoc).toContain('Marketplace public validation preview VSIX SHA-256: pending package');
    expect(rulesDoc).toContain(
      '.cache/gitlab-release-artifacts/v1.3.9/expanded/release-evidence/'
    );
    expect(rulesDoc).toContain('active software-factory branch on `develop`:');
    expect(rulesDoc).toContain('none');
    expect(rulesDoc).toContain('sole production recovery target: none');
    expect(rulesDoc).toContain('current');
    expect(rulesDoc).toContain('exact GitHub and VS Code Marketplace acts are fully closed for `v1.3.9`');
    expect(rulesDoc).toContain('published `v1.3.9` host-default Windows local');
    expect(rulesDoc).toContain('`LabVIEWCLI` contract with bounded expert Docker');
    expect(rulesDoc).toContain('Marketplace prep rule');
    expect(readme).toContain('current exact released line: `v1.3.9`');
    expect(currentState).toContain('current exact released line: `v1.3.9`');
    expect(releaseProcedure).toContain('The current exact released line is `v1.3.9`.');
    expect(releaseProcedure).toContain('The public GitHub exact transaction verification package script is');
    expect(releaseProcedure).toContain('The Windows exact-VSIX install proof package script is');
  });
});
