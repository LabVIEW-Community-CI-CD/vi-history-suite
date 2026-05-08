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
      classification:
        'linux-docker-linux-host-windows-host-labview-and-vagrant-vsix-validated-preview',
      stateRole: 'retained-provider-lane-linux-host-windows-host-and-vagrant-acceptance-evidence',
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
        windowsInstalledUserProofState: 'admitted-separate-windows-host-proof'
      }),
      linuxHostLabviewEvidence: expect.objectContaining({
        packetPath:
          'docs/product/benchmark-packets/HARNESS-VHS-002-linux-host-labview-2026-create-comparison-proof-2026-04-26.md',
        packetJsonPath:
          'docs/product/benchmark-packets/HARNESS-VHS-002-linux-host-labview-2026-create-comparison-proof-2026-04-26.json',
        schema: 'vi-history-suite/linux-host-labview-2026-create-comparison-proof@v1',
        status: 'passed',
        platform: 'linux',
        runtime: expect.objectContaining({
          errorCode: 'VIHS_OK',
          validationOutcome: 'ready',
          provider: 'host-native',
          engine: 'labview-cli',
          labviewExePath: '/usr/local/natinst/LabVIEW-2026-64/labview',
          labviewCliPath: '/usr/local/bin/LabVIEWCLI'
        }),
        fixture: expect.objectContaining({
          repository: 'https://github.com/ni/labview-icon-editor',
          viPath: 'resource/plugins/lv_icon.vi',
          oldCommit: 'ab94f6c4b375062492036c63a6dab7ea8824748a',
          newCommit: '8741bb08026c104100720c0ef48621e4ab7762fd'
        }),
        compare: expect.objectContaining({
          operation: 'CreateComparisonReport',
          exitCode: 0,
          result: 'succeeded',
          reportFile: 'diff-report-lv_icon.vi.html',
          reportSizeBytes: 214412,
          reportSha256:
            '637055a103b25ecc77e4e308a6d216fc7adab0e1741038502bb53f129e5eb864'
        }),
        linuxHostLabviewProofState: 'admitted-local-maintainer-proof',
        windowsInstalledUserLabviewProofState: 'admitted-separate-windows-host-proof',
        linuxHostLabviewProofMayProveWindowsInstalledUserLabview: false,
        publicGitHubMutation: 'not-performed',
        marketplaceMutation: 'not-performed'
      }),
      windowsHostLabviewEvidence: expect.objectContaining({
        packetPath:
          'docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-windows-host-labview-2026-v1.3.12-2026-04-26.md',
        packetJsonPath:
          'docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-windows-host-labview-2026-v1.3.12-2026-04-26.json',
        schema: 'vi-history-suite/windows-host-labview-installed-user-proof@v1',
        status: 'passed',
        platform: 'win32',
        runtime: expect.objectContaining({
          errorCode: 'VIHS_OK',
          validationOutcome: 'ready',
          provider: 'host-native',
          engine: 'labview-cli',
          labviewExePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
          labviewCliPath:
            'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
        }),
        fixture: expect.objectContaining({
          repository: 'https://github.com/ni/labview-icon-editor',
          viPath: 'resource/plugins/lv_icon.vi',
          oldCommit: 'ab94f6c4b375062492036c63a6dab7ea8824748a',
          newCommit: '8741bb08026c104100720c0ef48621e4ab7762fd'
        }),
        compare: expect.objectContaining({
          operation: 'CreateComparisonReport',
          exitCode: 0,
          result: 'succeeded',
          reportFile: 'diff-report-lv_icon.vi.html',
          reportSizeBytes: 146915,
          evidence: 'CreateComparisonReport operation succeeded.'
        })
      }),
      vagrantVsixAcceptanceEvidence: expect.objectContaining({
        status: 'protected-develop-ci-receipt-retained',
        packageScript: 'npm run vagrant:acceptance:assert',
        assertionScript: 'scripts/assertVagrantVsixAcceptanceEvidence.js',
        evidenceRoot: 'vagrant/evidence/',
        assertionReceiptRoot: 'vagrant/evidence/assertion',
        protectedDevelopMergeRequest:
          'https://gitlab.com/svelderrainruiz/vi-history-suite/-/merge_requests/192',
        protectedDevelopMergeCommit: '72899eb39e38ce34c697f0a227292ead6bcd8f2d',
        protectedDevelopPipelineId: 2511040377,
        protectedDevelopPipelineStatus: 'success',
        protectedDevelopPipelineUrl:
          'https://gitlab.com/svelderrainruiz/vi-history-suite/-/pipelines/2511040377',
        gitLabJob: 'vagrant_windows_vsix_acceptance',
        gitLabJobId: 14284054131,
        gitLabJobStatus: 'success',
        gitLabJobUrl: 'https://gitlab.com/svelderrainruiz/vi-history-suite/-/jobs/14284054131',
        artifactRoot: 'vagrant/evidence/',
        runDirectory: 'vagrant/evidence/20260508-105809',
        manifestPath: 'vagrant/evidence/20260508-105809/manifest.json',
        acceptanceLogPath: 'vagrant/evidence/acceptance-provision.log',
        coldPrepLogPath: 'vagrant/evidence/labview-cold-prep.log',
        hostDoctorLogPath: 'vagrant/evidence/vagrant-host-doctor.log',
        assertionReceiptPath: 'vagrant/evidence/assertion/vagrant-vsix-acceptance-assertion.json',
        assertionRecordedAt: '2026-05-08T17:58:36.620Z',
        manifestGeneratedAt: '2026-05-08T10:58:36.0049159-07:00',
        schema: 'vi-history-suite/vagrant-vsix-acceptance@v1',
        assertionSchema: 'vi-history-suite/vagrant-vsix-acceptance-assertion@v1',
        harnessId: 'HARNESS-VHS-002',
        selectedHash: '8741bb08026c104100720c0ef48621e4ab7762fd',
        baseHash: 'c188cdec606aac3b17d8b17274baa19eef3e4017',
        labviewVersion: '2026',
        labviewBitness: 'x86',
        proofExitCode: 0,
        runtimeProvider: 'host-native',
        runtimeEngine: 'labview-cli',
        runtimeExecutionState: 'succeeded',
        requiredRuntimeExecutionState: 'succeeded',
        generatedReportExists: true,
        requiredGeneratedReportExists: true,
        coldStartMarkers: [
          'LabVIEW not running. Launching via scheduled task...',
          'LabVIEW VI Server ready on port 3363.'
        ],
        publicGitHubMutation: 'not-performed',
        marketplaceMutation: 'not-performed',
        claimBoundary:
          'vagrant-vsix-acceptance-only; does-not-replace-native-windows-x64-private-release-or-windows-container-proof'
      }),
      previewVsixPath: 'preview-evidence/vi-history-suite-1.3.10.vsix',
      previewVsixSha256: 'bbe08e60d3d9a0275e5f734b002d115e648ab1a75b5b2641f34d7cf9f33a2c02',
      publicationState: 'develop-provider-lane-linux-host-and-windows-host-labview-evidence',
      linuxHostLabviewProofState: 'admitted-local-maintainer-proof',
      windowsInstalledUserProofState: 'admitted-for-host-labview-2026-x64',
      windowsDockerDesktopProofState: 'community-deferred',
      linuxHostLabviewProofMayProveWindowsInstalledUserLabview: false,
      windowsInstalledUserProofDeferred: false,
      publicGitHubMutation: 'not-performed-by-this-packet',
      marketplaceMutation: 'not-performed-by-this-packet'
    });
    expect(stateDoc).toContain('## Develop Preview State');
    expect(stateDoc).toContain('Vagrant Windows VSIX acceptance validated preview');
    expect(stateDoc).toContain('Windows proof state: host LabVIEW 2026 x64 admitted');
    expect(stateDoc).toContain('Windows-container proof community/deferred');
    expect(stateDoc).toContain('Vagrant Windows VSIX acceptance evidence');
    expect(stateDoc).toContain('protected `develop` pipeline `2511040377`');
    expect(stateDoc).toContain('GitLab job `14284054131`');
    expect(stateDoc).toContain('`npm run vagrant:acceptance:assert`');
    expect(stateDoc).toContain(
      'vagrant/evidence/assertion/vagrant-vsix-acceptance-assertion.json'
    );
    expect(stateDoc).toContain('vagrant/evidence/20260508-105809/manifest.json');
    expect(stateDoc).toContain('`proofExitCode=0`');
    expect(stateDoc).toContain('`runtimeExecutionState=succeeded`');
    expect(stateDoc).toContain('`generatedReportExists=true`');
    expect(stateDoc).toContain(
      'HARNESS-VHS-002-linux-host-labview-2026-create-comparison-proof-2026-04-26.json'
    );
    expect(stateDoc).toContain(
      'HARNESS-VHS-002-public-fixture-validate-fixture-windows-host-labview-2026-v1.3.12-2026-04-26.json'
    );
    expect(stateDoc).toContain('Linux host proof may prove Windows installed-user LabVIEW behavior: no');
    expect(stateDoc).toContain(
      'docs/product/linux-docker-provider-lane-release-control-packet-2026-04-26.json'
    );
    expect(stateDoc).toContain(
      'Preview state role: retained provider-lane, Linux host, Windows host, and'
    );
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
      mainCommit: '220111eae3ac214e99f2233e2bfe6b320edf383d',
      sourcePublication: {
        status:
          'public-validation-prerelease-1.3.13-windows-docker-desktop-intake-promoted-and-verified',
        currentMainCommit: '220111eae3ac214e99f2233e2bfe6b320edf383d',
        currentMainShortCommit: '220111e',
        exactReleaseRetainedCommit: 'fb0ef2b5342c230d5372e61859dd0fca3dbc0b6a',
        priorCommunityValidationIntakeCommit: 'b56fde158fe151a736fe72c833efdfd0874d8537',
        priorCommunityValidationIntakePullRequest:
          'https://github.com/svelderrainruiz/vi-history-suite/pull/45',
        pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/46',
        latestPullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/68',
        latestPublicValidationFixturePullRequest:
          'https://github.com/svelderrainruiz/vi-history-suite/pull/63',
        latestWindowsDockerDesktopIntakePromotionCloseout: expect.objectContaining({
          status: 'published-and-verified',
          pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/68',
          publicMainCommit: '220111eae3ac214e99f2233e2bfe6b320edf383d',
          publicMainShortCommit: '220111e',
          marketplaceMutation: 'not-performed'
        }),
        publicDevelopSync: expect.objectContaining({
          pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/64',
          status: 'not-applied-requires-separate-branch-policy-decision'
        })
      }
    });
    expect(state.marketplace).toMatchObject({
      itemName: 'svelderrainruiz.vi-history-suite',
      currentPublishedVersion: '1.3.13',
      currentPublishedKind: 'public-validation-pre-release',
      currentRegularPublishedVersion: '1.3.9',
      currentPreReleaseVersion: '1.3.13',
      expectedVersion: '1.3.14',
      status: 'published-public-validation-prerelease-1.3.13',
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
      status: 'published-and-verified',
      publicationClaim: 'public-validation-prerelease',
      preparePackageScript: 'npm run vscode:marketplace:community-preview:prepare',
      prepReceiptPath:
        '.cache/vscode-marketplace-community-validation-preview-prep/latest/vscode-marketplace-community-validation-preview-prep.json',
      preferredVsceMode: 'pre-release',
      targetVersionPolicy:
        'must-be-distinct-higher-major-minor-patch-than-current-marketplace-version',
      currentMarketplaceVersion: '1.3.13',
      targetVersion: '1.3.13',
      packageVersion: '1.3.13',
      publishedVersion: '1.3.13',
      publishedDate: '2026-04-27',
      marketplaceLastUpdated: '2026-04-27T04:24:05.457Z',
      previewVsixPath: 'preview-evidence/vi-history-suite-1.3.13.vsix',
      previewVsixSha256: '3b1d83632b8126b597a9db8c98f2737fd988458ecf6c4d74e4f5c3349d16036f',
      publishTrigger: 'maintainer-authorized-public-github-and-marketplace-public-validation-publication',
      windowsLabviewFeaturePolicy:
        'all-provider-year-bitness-variants-selectable-with-runtime-error-code-and-proof-packet-disclosure',
      windowsInstalledUserProofState: 'admitted-for-host-labview-2026-x64',
      traceabilityMatrixPath: 'docs/requirements/rtm.csv',
      publicGitHubMutation: 'not-mutated-by-community-validation-preview-publication',
      marketplaceMutation: 'published-and-verified',
      intakeStatus: 'prepared-authorized-for-1.3.13',
      intakePacketPath: 'docs/product/public-validation-prerelease-v1.3.13.md',
      intakePacketJsonPath: 'docs/product/public-validation-prerelease-v1.3.13.json',
      preparedPublicIssueTemplatePath:
        'public-github-source/.github/ISSUE_TEMPLATE/community-validation-windows-labview.yml',
      preparedPublicLabelManifestPath: 'public-github-source/.github/labels.yml',
      publicGitHubIntakePromotionPlanStatus: 'superseded-by-1.3.11-public-validation-lane',
      publicGitHubIntakePublishedShortCommit: '5e67194',
      publicGitHubIntakeLabelsApplied: true,
      publicGitHubReleaseMutation: 'published-and-verified-with-corrected-asset-release',
      publicGitHubReleaseTag: 'v1.3.13-public-validation-prerelease-1',
      publicGitHubReleaseId: 313873748,
      supersededPublicGitHubReleaseTag: 'v1.3.13-public-validation-prerelease'
    });
    expect(state.publicValidationPrereleaseV1313).toMatchObject({
      status: 'published-and-verified',
      marketplaceTargetVersion: '1.3.13',
      marketplacePublishedVersion: '1.3.13',
      publicGitHubReleaseTarget: 'v1.3.13-public-validation-prerelease-1',
      publicGitHubReleaseId: 313873748,
      publicGitHubMainCommit: '769cf180c1d5e94d1462d90e4e7366b1e050e7b1',
      publicGitHubPullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/67',
      publicGitHubMutationAuthorized: true,
      marketplaceMutationAuthorized: true,
      windowsInstalledUserLabviewProof: 'admitted-for-host-labview-2026-x64',
      windowsDockerDesktopProof: 'community-deferred',
      previewVsixSha256: '3b1d83632b8126b597a9db8c98f2737fd988458ecf6c4d74e4f5c3349d16036f',
      supersededImmutablePublicGitHubReleaseTag: 'v1.3.13-public-validation-prerelease',
      diagnosticNoteFix: expect.objectContaining({
        status: 'published-to-public-facade-and-marketplace',
        source: 'src/reporting/comparisonReportRuntimeExecution.ts',
        publicIssue: 'https://github.com/svelderrainruiz/vi-history-suite/issues/66'
      })
    });
    expect(state.publicValidationPrereleaseV1312).toMatchObject({
      status: 'published-and-verified',
      marketplacePublishedVersion: '1.3.12',
      publicGitHubReleaseTarget: 'v1.3.12-public-validation-prerelease',
      publicGitHubReleaseId: 313840265,
      publicGitHubMainCommit: '1853a4332eff40665e30db6e632febaa9821cf98',
      publicGitHubPullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/63',
      previewVsixSha256: 'e0d72bc198756d0f3302779830fc4e187d4bc63818769ffedaedaffb23d4dc25',
      windowsInstalledUserLabviewProof: 'admitted-for-host-labview-2026-x64',
      windowsHostLabview2026x64: 'admitted',
      windowsDockerDesktopProof: 'community-deferred',
      retainedWindowsHostValidateFixtureProofPath:
        'docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-windows-host-labview-2026-v1.3.12-2026-04-26.md',
      windowsHostProofAdmission: expect.objectContaining({
        status: 'admitted-after-publication',
        runtimeExecutionState: 'succeeded',
        runtimeProvider: 'host-native',
        runtimeErrorCode: 'VIHS_OK'
      }),
      branchHygiene: expect.objectContaining({
        publicDevelopSyncPullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/64',
        status: 'not-applied-requires-separate-branch-policy-decision'
      })
    });
    expect(state.publicValidationPrerelease).toMatchObject({
      status: 'published-and-verified',
      packageVersion: '1.3.11',
      runtimeProofCommand: 'vihs --validate --proof-out ./vihs-proof',
      windowsInstalledUserLabviewProof: 'community-deferred',
      exactReleaseGateBlockedByMissingWindowsProof: false,
      publicAndMarketplaceMutationAuthorizedByMaintainer: true
    });
    expect(state.publicValidationPrerelease.publicGitHub).toMatchObject({
      tag: 'v1.3.11-public-validation',
      releaseMutation: 'published-and-verified',
      sourceFacadeMutation: 'published-through-protected-pr',
      releaseId: 313782074,
      mainCommit: '5e67194992af021ada2903ea868e8b84678d72d6',
      pullRequest: 'https://github.com/svelderrainruiz/vi-history-suite/pull/46'
    });
    expect(state.publicValidationPrerelease.marketplace).toMatchObject({
      mutation: 'published-and-verified',
      publishedVersion: '1.3.11',
      lastUpdated: '2026-04-26T16:51:22.260Z'
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
    expect(stateDoc).toContain('Status: published and verified');
    expect(stateDoc).toContain('Target preview version: `1.3.13`');
    expect(stateDoc).toContain('Published preview version: `1.3.13`');
    expect(stateDoc).toContain('Windows host LabVIEW 2026 x64');
    expect(stateDoc).toContain(
      'HARNESS-VHS-002-public-fixture-validate-fixture-windows-host'
    );
    expect(stateDoc).toContain(
      'Windows/LabVIEW feature policy: all provider, year, and bitness choices may'
    );
    expect(stateDoc).toContain(
      'docs/product/public-validation-prerelease-v1.3.12.md'
    );
    expect(stateDoc).toContain(
      'docs/product/public-validation-prerelease-v1.3.13.md'
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
    expect(stateDoc).toContain(
      'Public GitHub intake promotion state: published and verified through public'
    );
    expect(stateDoc).toContain(
      'Public GitHub release/tag mutation: published and verified'
    );
    expect(state.incident).toMatchObject({
      active: false,
      classification: 'externally-blocked-publication',
      blockerCode: 'published-immutable-release-assets-incomplete',
      status: 'retained-history'
    });
    expect(state.activeCandidate).toMatchObject({
      releaseBranch: null,
      tag: null,
      packageVersion: '1.3.14',
      status: 'develop-patch-candidate-consolidation'
    });
    expect(state.nextAdmittedAction).toBe(
      'retain-1.3.14-develop-candidate-consolidation-and-triage-community-validation'
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
      currentMarketplaceVersion: '1.3.13'
    });
  });
});
