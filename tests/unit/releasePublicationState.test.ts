import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const publicationState = require(path.join(
  repoRoot,
  'scripts',
  'releasePublicationState.js'
)) as {
  buildMarketplaceFactoryAction: (kind: string, versionOrTag: string) => string;
  buildMarketplacePublishNextAction: (versionOrTag: string) => string;
  buildWindowsExactVsixInstallProofNextAction: (versionOrTag: string) => string;
  deriveTargetFromReceiptOrState: (
    receipt: Record<string, unknown> | null,
    fsApi?: typeof fs
  ) => {
    tag: string;
    packageVersion: string;
    marketplaceItem: string;
    currentMarketplaceVersion: string | null;
    state: Record<string, any>;
  };
  normalizeTag: (tagOrVersion: string) => string;
  resolvePublicationState: (fsApi?: typeof fs) => Record<string, any>;
  versionFromTag: (tagOrVersion: string) => string;
};

describe('release publication state resolver', () => {
  it('retains the closed v1.3.9 authority/public publication state while keeping v1.3.8 as blocked history', () => {
    const state = publicationState.resolvePublicationState();
    const stateDoc = fs.readFileSync(
      path.join(repoRoot, 'docs', 'product', 'release-publication-state.md'),
      'utf8'
    );

    expect(state.authority).toMatchObject({
      system: 'gitlab',
      exactTag: 'v1.3.9',
      packageVersion: '1.3.9',
      mainCommit: '2f86063a35926fa67963af5ccd47e971157927c6',
      gitlabReleaseManifestPath:
        '.cache/gitlab-release-artifacts/v1.3.9/expanded/release-evidence/release-manifest.json'
    });
    expect(state.developPreview).toMatchObject({
      classification: 'linux-docker-validated-preview',
      stateRole: 'retained-provider-lane-packet-evidence',
      headTrackingPolicy:
        'do-not-track-latest-develop-head; read live develop commit and pipeline state from GitLab when needed',
      retainedPacketPath:
        'docs/product/linux-docker-provider-lane-release-control-packet-2026-04-26.md',
      retainedPacketJsonPath:
        'docs/product/linux-docker-provider-lane-release-control-packet-2026-04-26.json',
      previewEvidenceCommit: '21774a91710b71c6b63629cc0cf3cf37ce9abc0a',
      packetEvidencePipelineId: 2480195741,
      packetEvidencePipelineStatus: 'success',
      packetMergeTrackingPolicy:
        'do-not-track-packet-merge-commit; packet retention is governed by Git history and CI',
      providerLaneEvidence: expect.objectContaining({
        packageScript: 'npm run linux:docker:provider:lane',
        gitLabJob: 'linux_docker_provider_lane',
        jobId: 14091891709,
        evidenceRoot: 'linux-docker-provider-lane-evidence/',
        schema: 'vi-history-suite/linux-docker-provider-lane@v1',
        status: 'passed',
        docker: expect.objectContaining({
          ostype: 'linux',
          serverVersion: '29.4.1',
          driver: 'overlayfs'
        }),
        windowsInstalledUserProofState: 'community-deferred'
      }),
      previewVsixPath: 'preview-evidence/vi-history-suite-1.3.10.vsix',
      previewVsixSha256: 'bbe08e60d3d9a0275e5f734b002d115e648ab1a75b5b2641f34d7cf9f33a2c02',
      publicationState: 'develop-provider-lane-evidence-only',
      windowsInstalledUserProofDeferred: true,
      publicGitHubMutation: 'not-performed-by-this-packet',
      marketplaceMutation: 'not-performed-by-this-packet'
    });
    expect(stateDoc).toContain('## Develop Preview State');
    expect(stateDoc).toContain('Linux/Docker validated preview');
    expect(stateDoc).toContain('Windows installed-user LabVIEW proof community/deferred');
    expect(stateDoc).toContain(
      'docs/product/linux-docker-provider-lane-release-control-packet-2026-04-26.json'
    );
    expect(stateDoc).toContain('Preview state role: retained provider-lane packet evidence');
    expect(stateDoc).toContain('Develop head tracking policy: do not persist the latest live');
    expect(stateDoc).toContain('Packet evidence pipeline: `2480195741` / `success`');
    expect(stateDoc).toContain('Public GitHub mutation: not performed by this packet');
    expect(stateDoc).toContain('VS Code Marketplace mutation: not performed by this packet');
    expect(state.developPreview.currentDevelopCommit).toBeUndefined();
    expect(state.developPreview.currentDevelopPipelineId).toBeUndefined();
    expect(state.publicGitHub.release).toMatchObject({
      id: 312994104,
      tag: 'v1.3.9',
      published: true,
      immutable: true,
      assetCount: 2,
      assetStatus: 'published-complete'
    });
    expect(state.publicGitHub).toMatchObject({
      mainCommit: 'b56fde158fe151a736fe72c833efdfd0874d8537',
      sourcePublication: {
        status: 'community-validation-intake-published-and-verified',
        currentMainShortCommit: 'b56fde1',
        exactReleaseRetainedCommit: 'fb0ef2b5342c230d5372e61859dd0fca3dbc0b6a',
        pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/45'
      }
    });
    expect(state.marketplace).toMatchObject({
      itemName: 'svelderrainruiz.vi-history-suite',
      currentPublishedVersion: '1.3.10',
      currentPublishedKind: 'community-validation-pre-release',
      currentRegularPublishedVersion: '1.3.9',
      currentPreReleaseVersion: '1.3.10',
      expectedVersion: '1.3.11',
      status: 'published-community-validation-preview-with-1.3.11-public-validation-target-prepared',
      windowsExactVsixInstallProof: {
        packageScript: 'npm run vscode:marketplace:install-proof',
        receiptPath: '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json',
        status: 'passed',
        authorityTag: 'v1.3.9',
        runtimeValidationOutcome: 'ready',
        launcherPathStrippedToLauncherAndSystem32: true,
        ambientNodeOnPathRequired: false
      }
    });
    expect(state.marketplaceCommunityValidationPreview).toMatchObject({
      status: 'prepared-authorized-pending-publication',
      publicationClaim: 'public-validation-prerelease',
      preparePackageScript: 'npm run vscode:marketplace:community-preview:prepare',
      prepReceiptPath:
        '.cache/vscode-marketplace-community-validation-preview-prep/latest/vscode-marketplace-community-validation-preview-prep.json',
      preferredVsceMode: 'pre-release',
      targetVersionPolicy:
        'must-be-distinct-higher-major-minor-patch-than-current-marketplace-version',
      currentMarketplaceVersion: '1.3.10',
      targetVersion: '1.3.11',
      packageVersion: '1.3.11',
      publishedVersion: null,
      publishedDate: null,
      marketplaceLastUpdated: null,
      previewVsixPath: 'preview-evidence/vi-history-suite-1.3.11.vsix',
      previewVsixSha256: null,
      publishTrigger: 'maintainer-authorized-public-github-and-marketplace-public-validation-publication',
      windowsLabviewFeaturePolicy:
        'all-provider-year-bitness-variants-selectable-with-runtime-error-code-and-proof-packet-disclosure',
      windowsInstalledUserProofState: 'community-deferred',
      traceabilityMatrixPath: 'docs/requirements/rtm.csv',
      publicGitHubMutation: 'not-mutated-by-community-validation-preview-publication',
      marketplaceMutation: 'authorized-pending-publication',
      intakeStatus: 'prepared-for-public-validation-1.3.11',
      intakePacketPath: 'docs/product/public-validation-prerelease-v1.3.11.md',
      intakePacketJsonPath: 'docs/product/public-validation-prerelease-v1.3.11.json',
      preparedPublicIssueTemplatePath:
        'public-github-source/.github/ISSUE_TEMPLATE/community-validation-windows-labview.yml',
      preparedPublicLabelManifestPath: 'public-github-source/.github/labels.yml',
      publicGitHubIntakePromotionPlanStatus: 'superseded-by-1.3.11-public-validation-lane',
      publicGitHubIntakePublishedShortCommit: null,
      publicGitHubIntakeLabelsApplied: false,
      publicGitHubReleaseMutation: 'authorized-pending-v1.3.11-pre-release-with-vsix-assets'
    });
    expect(state.publicValidationPrerelease).toMatchObject({
      status: 'prepared-authorized-pending-publication',
      packageVersion: '1.3.11',
      runtimeProofCommand: 'vihs --validate --proof-out ./vihs-proof',
      windowsInstalledUserLabviewProof: 'community-deferred',
      exactReleaseGateBlockedByMissingWindowsProof: false,
      publicAndMarketplaceMutationAuthorizedByMaintainer: true
    });
    expect(state.exactReleaseReadinessAssessment).toMatchObject({
      status: 'blocked',
      assessmentPath: 'docs/product/exact-release-readiness-assessment-2026-04-26.md',
      assessmentJsonPath: 'docs/product/exact-release-readiness-assessment-2026-04-26.json',
      assessedBranch: 'develop',
      assessedCommit: '42d1f581874c9fad8f6dcbc96c8827bb07e3b508',
      assessedPipelineId: 2480212103,
      assessedPipelineStatus: 'success',
      packageVersion: '1.3.10',
      currentAdmissibleClaim: 'linux-docker-validated-preview-only',
      retainedExactBaseline: 'v1.3.9',
      blockingReason: 'missing-native-windows-installed-user-labview-proof-for-1.3.10',
      windowsInstalledUserLabviewProofState: 'community-deferred',
      previewVsixPath: 'preview-evidence/vi-history-suite-1.3.10.vsix',
      previewVsixSha256: 'f516b8ebec261c854e9e6d048a92ce8cb6f67a04114b9da945b916e37b0621a6',
      publicGitHubExactMutation: 'not-admitted-and-not-performed',
      marketplaceExactMutation: 'not-admitted-and-not-performed',
      communityProofIntakeChecklistPath:
        'docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.md',
      communityProofIntakeChecklistJsonPath:
        'docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.json',
      exactCandidateConversionPaths: [
        'windows-proof-claim-with-admitted-windows-labview-receipts',
        'community-deferred-claim-with-no-windows-installed-user-proof-claim'
      ]
    });
    expect(state.windowsLabviewCommunityProofIntakeChecklist).toMatchObject({
      status: 'prepared-no-mutation',
      path: 'docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.md',
      jsonPath: 'docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.json',
      preparedFromDevelopCommit: '3c0404a5cc51f3e131dfb29474fb36a338aec4ec',
      sourceAssessedPipelineId: 2480212103,
      packageVersion: '1.3.10',
      candidateAdmissionPaths: ['windows-proof-claim', 'community-deferred-claim'],
      communityReportsBecomeMaintainerProofAutomatically: false,
      linuxDockerEvidenceMayProveWindowsLabviewInstalledUserBehavior: false,
      publicGitHubMutation: 'not-performed',
      marketplaceMutation: 'not-performed'
    });
    expect(state.exactReleaseCandidateReassessment).toMatchObject({
      status: 'prepared',
      path: 'docs/product/exact-release-candidate-reassessment-2026-04-26.md',
      jsonPath: 'docs/product/exact-release-candidate-reassessment-2026-04-26.json',
      sourceBranch: 'develop',
      sourceCommit: '14243fd0ee647736124b06edb5a9947eae178d38',
      sourcePipelineId: 2480546719,
      sourcePipelineStatus: 'success',
      packageVersion: '1.3.10',
      selectedCandidatePath: 'community-deferred-windows-labview-claim',
      releaseBranchOpening: 'admissible-as-next-governed-action',
      releaseBranch: null,
      exactTag: null,
      candidateSourceVsixSha256:
        'afb9a78ccd4ef73f588deb8dbb0a73f1465431d3510db5d4a8a1b7a2f90b2783',
      admittedExternalWindowsProofArrived: false,
      windowsInstalledUserLabviewProofClaimMade: false,
      publicGitHubExactMutation: 'gated-and-not-performed',
      marketplaceExactMutation: 'gated-and-not-performed',
      nextAdmittedAction:
        'open-governed-release-1.3.10-branch-from-14243fd-community-deferred-windows-claim'
    });
    expect(stateDoc).toContain('## Marketplace Community-Validation Preview Path');
    expect(stateDoc).toContain('## Exact Release Readiness Assessment');
    expect(stateDoc).toContain('## Windows/LabVIEW Community Proof Intake Checklist');
    expect(stateDoc).toContain('## Exact Release Candidate Reassessment');
    expect(stateDoc).toContain('Exact-release readiness: blocked');
    expect(stateDoc).toContain('Source pipeline: `2480546719` / `success`');
    expect(stateDoc).toContain('Release branch opening: admissible as next governed action');
    expect(stateDoc).toContain('Admitted external Windows proof arrived: false');
    expect(stateDoc).toContain('Assessed pipeline: `2480212103` / `success`');
    expect(stateDoc).toContain(
      'f516b8ebec261c854e9e6d048a92ce8cb6f67a04114b9da945b916e37b0621a6'
    );
    expect(stateDoc).toContain('`npm run vscode:marketplace:community-preview:prepare`');
    expect(stateDoc).toContain('Status: prepared, authorized, pending publication');
    expect(stateDoc).toContain('Target preview version: `1.3.11`');
    expect(stateDoc).toContain('Published preview version: not yet published by this packet');
    expect(stateDoc).toContain(
      'Windows/LabVIEW feature policy: all provider, year, and bitness choices may'
    );
    expect(stateDoc).toContain(
      'docs/product/public-validation-prerelease-v1.3.11.md'
    );
    expect(stateDoc).toContain(
      'docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.md'
    );
    expect(stateDoc).toContain('docs/product/exact-release-candidate-reassessment-2026-04-26.md');
    expect(stateDoc).toContain(
      'afb9a78ccd4ef73f588deb8dbb0a73f1465431d3510db5d4a8a1b7a2f90b2783'
    );
    expect(stateDoc).toContain('Community reports become maintainer proof automatically: false');
    expect(stateDoc).toContain('community-deferred claim with no Windows installed-user proof claim');
    expect(stateDoc).toContain('public-github-source/.github/labels.yml');
    expect(stateDoc).toContain('Public GitHub intake promotion state: authorized, pending publication');
    expect(stateDoc).toContain('Public GitHub release/tag mutation: authorized for `v1.3.11`');
    expect(state.incident).toMatchObject({
      active: false,
      classification: 'externally-blocked-publication',
      blockerCode: 'published-immutable-release-assets-incomplete',
      status: 'retained-history'
    });
    expect(state.activeCandidate).toMatchObject({
      releaseBranch: null,
      tag: null,
      packageVersion: '1.3.11',
      status: 'public-validation-prerelease-prepared-for-public-github-and-marketplace-publication'
    });
    expect(state.nextAdmittedAction).toBe(
      'publish-v1.3.11-public-validation-prerelease-to-public-github-and-marketplace'
    );

    expect(publicationState.normalizeTag('1.4.2')).toBe('v1.4.2');
    expect(publicationState.versionFromTag('v1.4.2')).toBe('1.4.2');
    expect(publicationState.buildMarketplacePublishNextAction('1.4.2')).toBe(
      'publish-v1.4.2-to-vscode-marketplace-after-explicit-production-approval'
    );
    expect(publicationState.buildWindowsExactVsixInstallProofNextAction('v1.4.2')).toBe(
      'retain-windows-exact-vsix-install-proof-for-v1.4.2-before-marketplace-publication'
    );
    expect(publicationState.buildMarketplaceFactoryAction('publishWithPinnedVsce', 'v1.4.2')).toBe(
      'publish-vscode-marketplace-v1.4.2-with-pinned-vsce'
    );
  });

  it('derives the selected tag/version from a transaction receipt before falling back to retained state', () => {
    const derived = publicationState.deriveTargetFromReceiptOrState({
      authority: {
        tag: 'v9.8.7',
        packageVersion: '9.8.7'
      },
      marketplace: {
        marketplaceItem: 'publisher.extension'
      }
    });

    expect(derived).toMatchObject({
      tag: 'v9.8.7',
      packageVersion: '9.8.7',
      marketplaceItem: 'svelderrainruiz.vi-history-suite',
      currentMarketplaceVersion: '1.3.10'
    });
  });
});
