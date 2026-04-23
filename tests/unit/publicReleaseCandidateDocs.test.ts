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
  it('retains the completed public GitHub exact v1.3.7 release while keeping Marketplace separate', () => {
    const candidate = readJson<any>('docs/product/public-release-candidate.json');
    const candidateMarkdown = readText('docs/product/public-release-candidate.md');
    const currentState = readText('docs/product/current-state.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');

    expect(candidate.versionLine).toBe('1.3.7');
    expect(candidate.burnedExactReleaseLine).toBe('v1.0.2');
    expect(candidate.publishedPublicSource).toMatchObject({
      publishedCommit: '704e629',
      status: 'published-main-tag-and-release-v1.3.7'
    });
    expect(candidate.candidateReadiness).toMatchObject({
      authorityBaseline:
        'v1.3.7-tagged-on-main-public-main-tag-and-github-release-published-marketplace-pending',
      localInstalledVsix: 'released-v1.3.7-authority-evidence-retained',
      publicGitHubExactTransactionGate:
        'required-before-any-further-public-github-release-or-marketplace-act',
      exactPublicRelease: 'v1.3.7-github-release-published-marketplace-pending'
    });
    expect(candidate.exactRelease).toMatchObject({
      version: 'v1.3.7',
      gitHubReleaseId: 312517425,
      gitHubAssetName: 'vi-history-suite-1.3.7.vsix',
      gitHubAssetSha256: '89c01d0841399661b2bfaf272361926ba5c0fe99ba4cf463319aa17f7776396b',
      marketplaceVersion: '1.3.0'
    });
    expect(candidate.exactReleaseReopening).toMatchObject({
      status: 'authority-v1.3.7-github-release-published-marketplace-pending',
      authorityTag: 'v1.3.7',
      publicGitHubExactTag: 'v1.3.7',
      publicGitHubReleaseId: 312517425,
      publicGitHubPublishabilityProbeStatus: 'published',
      publicGitHubPublishabilityBlockerCode: null,
      publicGitHubDraftPublishabilityProbeStatus: 'not-applicable',
      publicGitHubDraftPublishabilityBlockerCode: 'draft-release-not-draft',
      publicGitHubReleaseLookupStatusCode: 200,
      publicGitHubDraftReleaseUsesUntaggedUrl: false,
      nextSeparateAct: 'publish-v1.3.7-to-vscode-marketplace-after-governed-validation',
      marketplaceVersionRetained: '1.3.0',
      publicGitHubExactTransactionPackageScript: 'npm run public:github:exact:transaction:verify'
    });
    expect(candidate.softwareFactoryGovernance).toEqual({
      status: 'github-release-published-marketplace-pending-no-active-feature-branch',
      activeFeatureBranch: null,
      packageScripts: {
        assess: 'npm run software:factory:assess',
        rehearse: 'npm run software:factory:rehearse',
        repair: 'npm run software:factory:repair',
        publish: 'npm run software:factory:publish',
        verify: 'npm run software:factory:verify'
      },
      receiptPaths: {
        assess: '.cache/software-factory-orchestrator/latest/software-factory-state.json',
        rehearse: '.cache/software-factory-orchestrator/latest/rehearse/software-factory-state.json',
        repair: '.cache/software-factory-orchestrator/latest/repair/software-factory-state.json',
        publish: '.cache/software-factory-orchestrator/latest/publish/software-factory-state.json',
        verify: '.cache/software-factory-orchestrator/latest/verify/software-factory-state.json'
      },
      admittedNonProductionPhases: ['assess', 'rehearse', 'repair'],
      guardedNonMutatingContractPhases: ['publish', 'verify'],
      soleProductionRecoveryTarget: 'v1.3.7',
      productionMutationAllowed: false,
      rule:
        'no later SemVer opening, Marketplace publication, or other production mutation may occur outside the repo-owned factory/orchestrator closeout path while the retained v1.3.7 exact line remains open on Marketplace'
    });
    expect(candidate.localProofs.localInstalledVsixPreview).toMatchObject({
      status: 'released-v1.3.7-authority-evidence-retained',
      version: '1.3.7',
      vsixPath:
        '.cache/gitlab-release-artifacts/v1.3.7/expanded/release-evidence/vi-history-suite-1.3.7.vsix',
      checksumPath:
        '.cache/gitlab-release-artifacts/v1.3.7/expanded/release-evidence/vi-history-suite-1.3.7.vsix.sha256'
    });
    expect(candidate.localProofs.publicGitHubExactTransaction).toMatchObject({
      status: 'published-v1.3.7-github-release-verified-marketplace-pending',
      packageScript: 'npm run public:github:exact:transaction:verify',
      authorityTag: 'v1.3.7',
      publicMainCommit: '704e629eed72d7ea5f46e2e45b1e17e58655edce',
      publicTag: 'v1.3.7',
      publicReleaseId: 312517425,
      vsixAssetName: 'vi-history-suite-1.3.7.vsix',
      vsixAssetSha256: '89c01d0841399661b2bfaf272361926ba5c0fe99ba4cf463319aa17f7776396b',
      authorityReleaseManifestPath:
        '.cache/gitlab-release-artifacts/v1.3.7/expanded/release-evidence/release-manifest.json',
      releaseAssetsRetainedAgainstManifest: true,
      publicSourcePromotionStatus: 'passed',
      verifyGateStatus: 'pass',
      verifyGateAllowed: true,
      publicReleaseLookupStatusCode: 200,
      publicReleaseByIdStatusCode: 200,
      draft: false,
      immutable: true,
      openingNewSemverAllowed: false,
      repairInPlaceRequired: false,
      repairInPlaceAllowed: false,
      nextAllowedAction: 'publish-v1.3.7-to-vscode-marketplace-after-governed-validation'
    });
    expect(candidate.activeBlockers).toEqual([
      expect.objectContaining({
        id: 'BLOCKER-VSCODE-MARKETPLACE-PUBLICATION',
        status: 'open'
      })
    ]);

    expect(candidateMarkdown).toContain('Version line: `1.3.7`');
    expect(candidateMarkdown).toContain('Published public source commit: `704e629`');
    expect(candidateMarkdown).toContain('Software-factory governance branch: none');
    expect(candidateMarkdown).toContain('`released-v1.3.7-authority-evidence-retained`');
    expect(candidateMarkdown).toContain('`v1.3.7-github-release-published-marketplace-pending`');
    expect(candidateMarkdown).toContain('GitHub release `312517425`');
    expect(candidateMarkdown).toContain('`verifyGateStatus=pass`');
    expect(candidateMarkdown).toContain('`verifyGateAllowed=true`');
    expect(candidateMarkdown).toContain(
      '.cache/gitlab-release-artifacts/v1.3.7/expanded/release-evidence/release-manifest.json'
    );
    expect(candidateMarkdown).toContain('Public GitHub exact now publishes `v1.3.7`');
    expect(candidateMarkdown).toContain('VS Code Marketplace version: `1.3.0`');

    expect(currentState).toContain('current exact released line: `v1.3.7`');
    expect(currentState).toContain('current published package line on `main`: `1.3.7`');
    expect(currentState).toContain('current develop package line on `develop`: `1.3.7`');
    expect(currentState).toContain('active software-factory governance branch on `develop`:');
    expect(currentState).toContain('none');
    expect(currentState).toContain('npm run public:github:exact:transaction:verify');
    expect(currentState).toContain('separate public GitHub exact release publication: published;');
    expect(currentState).toContain('releases/tag/v1.3.7');
    expect(currentState).toContain('verify receipt now records `verifyGateStatus=pass`');
    expect(currentState).toContain('VS Code Marketplace retained published version: `1.3.0`');

    for (const requirementId of [
      'VHS-REQ-566',
      'VHS-REQ-567',
      'VHS-REQ-568',
      'VHS-REQ-569',
      'VHS-REQ-570',
      'VHS-REQ-571',
      'VHS-REQ-572',
      'VHS-REQ-573',
      'VHS-REQ-574',
      'VHS-REQ-575',
      'VHS-REQ-576'
    ]) {
      expect(srs).toContain(requirementId);
      expect(rtm).toContain(requirementId);
    }

    for (const testId of [
      'TEST-UNIT-370',
      'TEST-UNIT-371',
      'TEST-UNIT-372',
      'TEST-UNIT-373',
      'TEST-UNIT-374',
      'TEST-UNIT-375',
      'TEST-UNIT-376',
      'TEST-UNIT-377',
      'TEST-UNIT-378',
      'TEST-DOC-123',
      'TEST-DOC-124',
      'TEST-DOC-125',
      'TEST-DOC-126',
      'TEST-DOC-127',
      'TEST-DOC-128',
      'TEST-DOC-129',
      'TEST-DOC-130',
      'TEST-DOC-131'
    ]) {
      expect(testPlan).toContain(testId);
    }
  });
});
