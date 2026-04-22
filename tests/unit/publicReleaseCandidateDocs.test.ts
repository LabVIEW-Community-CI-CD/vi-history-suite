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

describe('public release candidate control surface', () => {
  it('retains the blocked v1.3.6 public GitHub transaction as repair-in-place only while keeping Marketplace separate', () => {
    const candidate = readJson<any>('docs/product/public-release-candidate.json');
    const candidateMarkdown = readText('docs/product/public-release-candidate.md');
    const currentState = readText('docs/product/current-state.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');

    expect(candidate.versionLine).toBe('1.3.6');
    expect(candidate.burnedExactReleaseLine).toBe('v1.0.2');
    expect(candidate.authorityRepo).toMatchObject({
      role: 'source-of-truth',
      integrationBranch: 'develop',
      releaseBranch: 'main',
      featureHardeningBranch: null,
      semverDiscipline: 'strict-post-release-bumps'
    });
    expect(candidate.authorityRepo.requiredChecks).toEqual(
      expect.arrayContaining([
        'public_exact_pretag_proof',
        'docs_continuous_integration',
        'docs_public_continuous_integration',
        'docs_internal_continuous_integration',
        'test_extension',
        'package_extension_preview',
        'Public Facade Package Preview / package-preview',
        'Public Facade Linux Smoke / public-facade-linux-smoke'
      ])
    );

    expect(candidate.publishedPublicSource).toMatchObject({
      publishedCommit: 'bd81bfe',
      status: 'published-main-and-tag-v1.3.6-release-draft-only'
    });
    expect(candidate.publicDevelopCandidate).toMatchObject({
      branch: 'develop',
      candidateCommit: 'ab293d5',
      status: 'published-v1.3.1-candidate-tag-eligible',
      sourcePullRequest: '#38'
    });
    expect(candidate.publishedPublicWiki).toMatchObject({
      publishedHeadCommit: '141c39e',
      status: 'published-v1.3.1-candidate-wiki-head'
    });

    expect(candidate.candidateReadiness).toMatchObject({
      authorityBaseline: 'v1.3.6-tagged-on-main-public-main-and-tag-published-release-draft-only',
      localInstalledVsix: 'released-v1.3.6-authority-evidence-retained',
      historicalPublicRepoBootstrapBaseline: 'exact-v1.2.0-human-baseline-retained',
      authorityIssue0414ImplementationState: 'closed-clean-before-next-public-candidate-step',
      authorityIssue0414LiveSessionProof: 'fresh-governed-windows-proof-retained',
      publishedSurfaceExpertAgentReview: 'no-findings-on-current-v1.3.1-published-heads',
      runtimeProviderPublicAcceptanceGate: 'closed-on-published-v1.3.0-candidate-heads-retained',
      preTagPublicExactProofGate: 'required-before-any-later-exact-reopen',
      publicGitHubExactTransactionGate:
        'required-before-any-further-public-github-release-or-marketplace-act',
      exactPublicRelease:
        'v1.3.1-github-release-published-v1.3.6-public-main-and-tag-published-release-draft-only'
    });

    expect(candidate.localProofs.localInstalledVsixPreview).toMatchObject({
      status: 'released-v1.3.6-authority-evidence-retained',
      version: '1.3.6',
      vsixPath:
        '.cache/gitlab-release-artifacts/v1.3.6/expanded/release-evidence/vi-history-suite-1.3.6.vsix',
      checksumPath:
        '.cache/gitlab-release-artifacts/v1.3.6/expanded/release-evidence/vi-history-suite-1.3.6.vsix.sha256',
      buildCommand: 'not-applicable-authority-exact-v1.3.6-already-built',
      gatingPackageScript: 'npm run public:exact:pretag:proof',
      gatingGitLabJob: 'public_exact_pretag_proof'
    });
    expect(candidate.localProofs.publicGitHubExactTransaction).toMatchObject({
      status: 'blocked-v1.3.6-release-draft-repair-in-place-required',
      packageScript: 'npm run public:github:exact:transaction:assess',
      receiptPath:
        '.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json',
      authorityTag: 'v1.3.6',
      authorityMainCommit: '3cb238334100d01d5cfe7998e17e20a7b497b3fb',
      publicMainCommit: 'bd81bfe6743348c9138c3f0f4967c790a235184f',
      publicTag: 'v1.3.6',
      draftReleaseId: 312363117,
      draftReleaseUrl:
        'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/untagged-308c75957d1c8136f871',
      vsixAssetName: 'vi-history-suite-1.3.6.vsix',
      vsixAssetSha256: '4cba0367deacc6c1917958b47a2c227692ef373fda8b8b964203a0b955906beb',
      checksumAssetSha256: '7e2554c4685938b0db66cf02d04ef0292cb440ffc596ab201579252af0d038d0',
      authorityReleaseManifestPath:
        '.cache/gitlab-release-artifacts/v1.3.6/expanded/release-evidence/release-manifest.json',
      authorityReleaseManifestLocatorStatus: 'located-and-verified-non-mutatively',
      releaseAssetsRetainedAgainstManifest: true,
      draftPublishabilityProbeStatus: 'blocked',
      draftPublishabilityBlockerCode: 'draft-release-tag-lookup-unavailable',
      draftPublishabilityBlockerSummary:
        'Draft release 312363117 is readable by id and still carries the exact assets, but immutable releases are enabled while exact-tag release lookup still returns 404, so a safe in-place draft publish transition cannot yet be proven non-mutatively.',
      draftPublishabilityProbeReleaseId: 312363117,
      draftPublishabilityByIdStatusCode: 200,
      draftPublishabilityTagMatchesAuthority: true,
      draftPublishabilitySafeToAttemptPublish: false,
      publishabilityProbeStatus: 'blocked',
      publishabilityBlockerCode: 'draft-release-tag-lookup-unavailable',
      publishabilityBlockerSummary:
        'Immutable releases are enabled, but the retained draft is still discoverable only by id/list; release lookup by the exact tag remains unavailable.',
      immutableReleasePolicyStatusCode: 200,
      immutableReleasesEnabled: true,
      immutableReleasesEnforcedByOwner: false,
      draftReleaseTargetCommitish: 'main',
      draftReleaseLookupStatusCode: 404,
      draftReleaseDiscoveredByList: true,
      draftReleaseDiscoveredByTag: false,
      draftReleaseUsesUntaggedUrl: true,
      safeToAttemptRepairPublish: false,
      openingNewSemverAllowed: false,
      repairInPlaceRequired: true,
      repairInPlaceAllowed: true,
      nextAllowedAction:
        'repair-the-existing-v1.3.6-public-github-release-only-after-safe-publishability-is-proven'
    });

    expect(candidate.exactRelease).toMatchObject({
      version: 'v1.3.1',
      gitHubAssetName: 'vi-history-suite-1.3.1.vsix',
      marketplaceVersion: '1.3.0'
    });
    expect(candidate.exactReleaseReopening).toMatchObject({
      status:
        'authority-v1.3.6-tagged-public-main-and-tag-published-release-draft-only-repair-in-place-frozen',
      hotfixBranch: null,
      featureBranch: null,
      authorityMainCommit: '3cb238334100d01d5cfe7998e17e20a7b497b3fb',
      authorityTag: 'v1.3.6',
      publicGitHubExactCommit: 'bd81bfe6743348c9138c3f0f4967c790a235184f',
      publicGitHubExactTag: 'v1.3.6',
      publicGitHubReleaseUrl:
        'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.1',
      publicGitHubDraftReleaseId: 312363117,
      publicGitHubDraftReleaseUrl:
        'https://github.com/svelderrainruiz/vi-history-suite/releases/tag/untagged-308c75957d1c8136f871',
      publicGitHubPublishabilityProbeStatus: 'blocked',
      publicGitHubPublishabilityBlockerCode: 'draft-release-tag-lookup-unavailable',
      publicGitHubDraftPublishabilityProbeStatus: 'blocked',
      publicGitHubDraftPublishabilityBlockerCode: 'draft-release-tag-lookup-unavailable',
      publicGitHubDraftPublishabilityProbeReleaseId: 312363117,
      publicGitHubDraftPublishabilityByIdStatusCode: 200,
      publicGitHubDraftPublishabilityTagMatchesAuthority: true,
      publicGitHubDraftPublishabilitySafeToAttemptPublish: false,
      publicGitHubImmutableReleasesEnabled: true,
      publicGitHubImmutableReleasesEnforcedByOwner: false,
      publicGitHubDraftReleaseTargetCommitish: 'main',
      publicGitHubReleaseLookupStatusCode: 404,
      publicGitHubDraftReleaseUsesUntaggedUrl: true,
      nextSeparateAct:
        'repair-existing-v1.3.6-public-github-release-in-place-through-transaction-controller',
      marketplaceVersionRetained: '1.3.0',
      preTagPublicExactProofPackageScript: 'npm run public:exact:pretag:proof',
      preTagPublicExactProofJob: 'public_exact_pretag_proof',
      publicGitHubExactTransactionPackageScript: 'npm run public:github:exact:transaction:assess',
      publicGitHubExactTransactionReceiptPath:
        '.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json'
    });
    expect(candidate.softwareFactoryGovernance).toEqual({
      status: 'assess-only-foundation-open-no-production-mutation',
      activeFeatureBranch: 'feature/software-factory-governance-foundation',
      packageScript: 'npm run software:factory:assess',
      receiptPath: '.cache/software-factory-orchestrator/latest/software-factory-state.json',
      currentPhase: 'assess',
      plannedFuturePhases: ['rehearse', 'repair', 'publish', 'verify'],
      soleProductionRecoveryTarget: 'v1.3.6',
      productionMutationAllowed: false,
      rule:
        'no GitHub release publication, Marketplace publication, or other production mutation may occur through this foundation slice while the retained v1.3.6 recovery case remains open'
    });

    expect(candidate.activeBlockers).toEqual([
      expect.objectContaining({
        id: 'BLOCKER-PUBLIC-GITHUB-EXACT-TRANSACTION',
        status: 'open'
      })
    ]);

    expect(candidateMarkdown).toContain('Version line: `1.3.6`');
    expect(candidateMarkdown).toContain('Published public source commit: `bd81bfe`');
    expect(candidateMarkdown).toContain('Feature-lane public GitHub release hardening branch: none');
    expect(candidateMarkdown).toContain('Software-factory governance foundation branch:');
    expect(candidateMarkdown).toContain('`feature/software-factory-governance-foundation`');
    expect(candidateMarkdown).toContain('`released-v1.3.6-authority-evidence-retained`');
    expect(candidateMarkdown).toContain(
      '`required-before-any-further-public-github-release-or-marketplace-act`'
    );
    expect(candidateMarkdown).toContain(
      '`v1.3.1-github-release-published-v1.3.6-public-main-and-tag-published-release-draft-only`'
    );
    expect(candidateMarkdown).toContain('npm run public:github:exact:transaction:assess');
    expect(candidateMarkdown).toContain('draft release `312363117`');
    expect(candidateMarkdown).toContain('read release `312363117` by id with status `200`');
    expect(candidateMarkdown).toContain(
      '.cache/gitlab-release-artifacts/v1.3.6/expanded/release-evidence/release-manifest.json'
    );
    expect(candidateMarkdown).toContain('`releaseAssetsRetainedAgainstManifest=true`');
    expect(candidateMarkdown).toContain('`draftPublishabilityProbeReleaseId=312363117`');
    expect(candidateMarkdown).toContain('`draftPublishabilityByIdStatusCode=200`');
    expect(candidateMarkdown).toContain('immutable releases are enabled');
    expect(candidateMarkdown).toContain('`publishabilityBlockerCode=draft-release-tag-lookup-unavailable`');
    expect(candidateMarkdown).toContain('`draftReleaseTargetCommitish=main`');
    expect(candidateMarkdown).toContain('`draftReleaseLookupStatusCode=404`');
    expect(candidateMarkdown).toContain(
      '.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json'
    );
    expect(candidateMarkdown).toContain('`npm run software:factory:assess`');
    expect(candidateMarkdown).toContain(
      '.cache/software-factory-orchestrator/latest/software-factory-state.json'
    );
    expect(candidateMarkdown).toContain('sole production recovery case');
    expect(candidateMarkdown).toContain(
      'GitHub release publication, Marketplace publication, or other production'
    );
    expect(candidateMarkdown).toContain('Public GitHub exact still serves `v1.3.1`');
    expect(candidateMarkdown).toContain('repair in place through `npm run public:github:exact:transaction:assess`');

    expect(currentState).toContain('current exact released line: `v1.3.6`');
    expect(currentState).toContain('current published package line on `main`: `1.3.6`');
    expect(currentState).toContain('current develop package line on `develop`: `1.3.6`');
    expect(currentState).toContain(
      'active feature-lane public GitHub release hardening branch on `develop`:'
    );
    expect(currentState).toContain('none');
    expect(currentState).toContain('active software-factory governance foundation branch on `develop`');
    expect(currentState).toContain('npm run public:github:exact:transaction:assess');
    expect(currentState).toContain('npm run software:factory:assess');
    expect(currentState).toContain('separate public GitHub exact release publication: blocked; public `main` now');
    expect(currentState).toContain('can read that draft by id with status `200`');
    expect(currentState).toContain('retained authority release manifest non-mutatively');
    expect(currentState).toContain('lookup still returns `404`');
    expect(currentState).toContain('draftPublishabilityProbeReleaseId=312363117');
    expect(currentState).toContain('VS Code Marketplace retained published version: `1.3.0`');

    expect(srs).toContain('VHS-REQ-566');
    expect(srs).toContain('VHS-REQ-567');
    expect(srs).toContain('VHS-REQ-568');
    expect(srs).toContain('VHS-REQ-569');
    expect(srs).toContain('VHS-REQ-570');
    expect(srs).toContain('VHS-REQ-571');
    expect(srs).toContain('VHS-REQ-572');
    expect(rtm).toContain('VHS-REQ-566');
    expect(rtm).toContain('VHS-REQ-567');
    expect(rtm).toContain('VHS-REQ-568');
    expect(rtm).toContain('VHS-REQ-569');
    expect(rtm).toContain('VHS-REQ-570');
    expect(rtm).toContain('VHS-REQ-571');
    expect(rtm).toContain('VHS-REQ-572');
    expect(testPlan).toContain('TEST-UNIT-370');
    expect(testPlan).toContain('TEST-UNIT-371');
    expect(testPlan).toContain('TEST-UNIT-372');
    expect(testPlan).toContain('TEST-UNIT-373');
    expect(testPlan).toContain('TEST-UNIT-374');
    expect(testPlan).toContain('TEST-DOC-123');
    expect(testPlan).toContain('TEST-DOC-124');
    expect(testPlan).toContain('TEST-DOC-125');
    expect(testPlan).toContain('TEST-DOC-126');
    expect(testPlan).toContain('TEST-DOC-127');
  });
});
