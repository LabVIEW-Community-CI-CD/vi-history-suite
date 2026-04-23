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
  it('retains the v1.3.7 GitHub and Marketplace published closeout contract', () => {
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
        currentExactReleaseLine: 'v1.3.7',
        currentMainPackageLine: '1.3.7',
        currentDevelopPackageLine: '1.3.7',
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
        vscodeMarketplacePublicationPrepPackageScript: 'npm run vscode:marketplace:prepare',
        vscodeMarketplacePublicationPrepReceiptPath:
          '.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json',
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
    expect(rules.releaseCadence.versionLineContract.publicGitHubExactPublishabilityProbe).toEqual(
      expect.objectContaining({
        status: 'published',
        blockerCode: null,
        draftReleaseId: 312517425,
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
        draftReleaseId: 312517425,
        draftReleaseByIdStatusCode: 200,
        draftReleaseTagMatchesAuthority: true,
        authorityReleaseManifestPath:
          '.cache/gitlab-release-artifacts/v1.3.7/expanded/release-evidence/release-manifest.json',
        releaseAssetsRetainedAgainstManifest: true
      })
    );
    expect(rules.releaseCadence.strictSemverRule).toEqual(
      expect.arrayContaining([
        'future sessions shall assess or verify the current exact public GitHub transaction through the repo-owned controller before any further public GitHub release or VS Code Marketplace act',
        "future sessions shall retain the controller's non-mutating draft-publishability probe before any in-place public GitHub release repair attempt",
        'future sessions shall retain the completed public GitHub exact verify gate before the separate VS Code Marketplace publication act proceeds',
        'future sessions shall run and retain npm run vscode:marketplace:prepare before any mutating VS Code Marketplace publication act',
        'future sessions may open the next SemVer line only after the matching public tag, public GitHub release, VS Code Marketplace version, and protected develop retention state all agree'
      ])
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
        status: 'github-release-and-marketplace-published',
        activeFeatureBranch: null,
        soleProductionRecoveryTarget: 'v1.3.7',
        productionMutationAllowed: false
      })
    );
    expect(rules.softwareFactoryGovernance.recoveryBoundary).toEqual(
      expect.arrayContaining([
        'repair-in-place first when public GitHub main, tag, or draft release already exist',
        'current exact GitHub and VS Code Marketplace acts are closed for v1.3.7'
      ])
    );
    expect(rules.softwareFactoryGovernance.approvalModel).toEqual(
      expect.arrayContaining([
        'assess, rehearse, and repair are repo-owned and automatic non-production phases',
        'publish and verify are repo-owned and automatic guarded non-mutating contract phases',
        'later VS Code Marketplace publish requires explicit production approval through the repo-owned publication path'
      ])
    );

    expect(rulesDoc).toContain('current exact released line: `v1.3.7`');
    expect(rulesDoc).toContain('current published package line on `main`: `1.3.7`');
    expect(rulesDoc).toContain('current develop package line on `develop`: `1.3.7`');
    expect(rulesDoc).toContain('later SemVer openings return to normal GitFlow governance');
    expect(rulesDoc).toContain('public release `312517425` is published on `v1.3.7`');
    expect(rulesDoc).toContain('VS Code Marketplace publication prep package script');
    expect(rulesDoc).toContain('`npm run vscode:marketplace:prepare`');
    expect(rulesDoc).toContain(
      '.cache/gitlab-release-artifacts/v1.3.7/expanded/release-evidence/'
    );
    expect(rulesDoc).toContain('active software-factory branch on `develop`:');
    expect(rulesDoc).toContain('none');
    expect(rulesDoc).toContain('sole production recovery target: `v1.3.7`');
    expect(rulesDoc).toContain('exact GitHub and VS Code Marketplace acts are closed for `v1.3.7`');
    expect(rulesDoc).toContain('Marketplace prep rule');
    expect(readme).toContain('current exact released line: `v1.3.7`');
    expect(currentState).toContain('current exact released line: `v1.3.7`');
    expect(releaseProcedure).toContain('The current exact released line is `v1.3.7`.');
    expect(releaseProcedure).toContain('The public GitHub exact transaction verification package script is');
  });
});
