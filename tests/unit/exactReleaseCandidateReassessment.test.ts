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

describe('exact release candidate reassessment', () => {
  it('selects the community-deferred Windows/LabVIEW claim path while keeping publication gated', () => {
    const reassessment = readText(
      'docs/product/exact-release-candidate-reassessment-2026-04-26.md'
    );
    const machine = readJson<any>(
      'docs/product/exact-release-candidate-reassessment-2026-04-26.json'
    );
    const publicationState = readJson<any>('docs/product/release-publication-state.json');
    const informationItemMap = readText('docs/information-item-map.md');
    const currentState = readText('docs/product/current-state.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');

    expect(reassessment).toContain('Exact Release Candidate Reassessment - 2026-04-26');
    expect(reassessment).toContain(
      '`14243fd0ee647736124b06edb5a9947eae178d38`'
    );
    expect(reassessment).toContain('| Source pipeline | `2480546719` / `success` |');
    expect(reassessment).toContain(
      '| Selected candidate path | `community-deferred-windows-labview-claim` |'
    );
    expect(reassessment).toContain('| Release branch opening | admissible as next governed action |');
    expect(reassessment).toContain('| Public GitHub exact mutation | gated and not performed |');
    expect(reassessment).toContain('| VS Code Marketplace exact mutation | gated and not performed |');
    expect(reassessment).toContain('No admitted external Windows/LabVIEW proof was found');
    expect(reassessment).toContain('read-only public GitHub issue queries');
    expect(reassessment).toContain(
      'afb9a78ccd4ef73f588deb8dbb0a73f1465431d3510db5d4a8a1b7a2f90b2783'
    );
    expect(reassessment).toContain('not the selected exact release artifact');

    expect(machine).toEqual(
      expect.objectContaining({
        schema: 'vi-history-suite/exact-release-candidate-reassessment@v1',
        recordedAt: '2026-04-26',
        status: 'prepared',
        authority: expect.objectContaining({
          branch: 'develop',
          reassessedCommitSha: '14243fd0ee647736124b06edb5a9947eae178d38',
          pipelineId: 2480546719,
          pipelineStatus: 'success',
          packageVersion: '1.3.10'
        }),
        verdict: expect.objectContaining({
          reassessmentStatus: 'prepared',
          selectedCandidatePath: 'community-deferred-windows-labview-claim',
          currentAdmissibleCandidateClaim:
            'linux-docker-validated-exact-candidate-source-with-windows-labview-selectable-as-community-deferred',
          releaseBranchOpening: 'admissible-as-next-governed-action',
          releaseBranch: 'not-opened-by-this-reassessment',
          exactTag: 'not-admitted',
          windowsInstalledUserLabviewProofClaim: 'not-made',
          publicGitHubExactMutation: 'gated-and-not-performed',
          marketplaceExactMutation: 'gated-and-not-performed'
        }),
        inputs: expect.objectContaining({
          sourceBlockedAssessmentPath:
            'docs/product/exact-release-readiness-assessment-2026-04-26.md',
          communityProofIntakeChecklistPath:
            'docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.md',
          retainedExactBaseline: 'v1.3.9',
          activeMarketplacePreview: '1.3.10-community-validation-pre-release'
        })
      })
    );

    expect(machine.pipelineJobs.every((job: { status: string }) => job.status === 'success')).toBe(
      true
    );
    expect(machine.pipelineJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'ubuntu_docker_runner_admission',
          id: 14093348390,
          status: 'success'
        }),
        expect.objectContaining({
          name: 'linux_docker_provider_lane',
          id: 14093348402,
          status: 'success'
        }),
        expect.objectContaining({
          name: 'package_extension_preview',
          id: 14093348403,
          status: 'success'
        })
      ])
    );
    expect(machine.candidateSourceArtifact).toMatchObject({
      jobId: 14093348403,
      vsixPath: 'preview-evidence/vi-history-suite-1.3.10.vsix',
      commitSha: '14243fd0ee647736124b06edb5a9947eae178d38',
      sha256: 'afb9a78ccd4ef73f588deb8dbb0a73f1465431d3510db5d4a8a1b7a2f90b2783',
      sizeBytes: 998988,
      releaseUse: 'candidate-source-preview-only-not-selected-exact-release-artifact'
    });
    expect(machine.linuxDockerProviderLane).toMatchObject({
      jobId: 14093348402,
      status: 'passed',
      providerLane: expect.objectContaining({
        selectedProviderSetting: 'docker',
        labviewVersion: '2026',
        labviewBitness: 'x64',
        runtimeProvider: 'linux-container',
        runtimeEngine: 'labview-cli',
        runtimeValidationOutcome: 'ready',
        runtimeBlockedReason: '<none>'
      }),
      windowsLabviewProof: expect.objectContaining({
        included: false,
        state: 'community-deferred',
        claimMade: false
      })
    });
    expect(machine.admittedExternalWindowsProofCheck).toMatchObject({
      proofArrived: false,
      governedRunnerAdmissionJobInPipeline: false,
      windowsPrivateReleaseAcceptanceJobInPipeline: false,
      retainedWindowsPrivateReleaseEvidenceFor1310: false,
      retainedGovernedRunnerAdmissionEvidenceFor1310: false,
      retainedWindowsExactVsixInstallProofForSelected1310ExactVsix: false,
      decision: 'select-community-deferred-claim-path'
    });
    expect(machine.admittedExternalWindowsProofCheck.readOnlyPublicGitHubIssueQueries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'community-validation', issueCount: 0 }),
        expect.objectContaining({ label: 'windows-labview', issueCount: 0 }),
        expect.objectContaining({ label: 'proof:reported', issueCount: 0 }),
        expect.objectContaining({ label: 'proof:reproduced', issueCount: 0 }),
        expect.objectContaining({ label: 'marketplace-preview', issueCount: 0 })
      ])
    );
    expect(machine.selectedCommunityDeferredClaim).toMatchObject({
      windowsInstalledUserProofClaimMade: false,
      selectableFeaturePolicy: 'selectable-with-proof-status-disclosure',
      traceabilityRequirement: 'distinguish-proven-selectable-deferred-and-unsupported-paths',
      linuxDockerEvidenceMayProveWindowsLabviewInstalledUserBehavior: false,
      communityReportsBecomeMaintainerProofAutomatically: false
    });
    expect(machine.publicationGates).toMatchObject({
      releaseBranch: 'not-opened-by-this-reassessment',
      selectedExactAuthorityVsix: 'not-retained-yet',
      exactTag: 'not-admitted',
      publicGitHubExactRelease: 'gated-not-performed',
      marketplaceExactRelease: 'gated-not-performed',
      windowsInstalledUserLabviewProofClaim: 'not-made',
      communityDeferredWindowsLabviewWording: 'selected-and-required'
    });
    expect(machine.nextAdmittedActions).toEqual(
      expect.arrayContaining([
        'open-governed-release-1.3.10-branch-from-14243fd0ee647736124b06edb5a9947eae178d38-if-community-deferred-claim-remains-selected',
        'reassess-exact-release-readiness-from-release-branch-before-exact-tag',
        'use-asset-first-public-github-exact-release-controller-only-after-release-branch-readiness-closes'
      ])
    );
    expect(machine.noMutationBoundary).toMatchObject({
      publicGitHubTouched: false,
      marketplaceTouched: false,
      publicGitHubExactReleaseMutation: 'not-performed',
      publicGitHubTagMutation: 'not-performed',
      publicGitHubSourceMutation: 'not-performed',
      publicGitHubWikiMutation: 'not-performed',
      marketplaceExactMutation: 'not-performed',
      exactTagCreated: false,
      releaseBranchCreated: false
    });

    expect(publicationState.exactReleaseCandidateReassessment).toMatchObject({
      status: 'prepared',
      path: 'docs/product/exact-release-candidate-reassessment-2026-04-26.md',
      jsonPath: 'docs/product/exact-release-candidate-reassessment-2026-04-26.json',
      sourceCommit: '14243fd0ee647736124b06edb5a9947eae178d38',
      sourcePipelineId: 2480546719,
      selectedCandidatePath: 'community-deferred-windows-labview-claim',
      releaseBranchOpening: 'admissible-as-next-governed-action',
      releaseBranch: null,
      exactTag: null,
      candidateSourceVsixSha256:
        'afb9a78ccd4ef73f588deb8dbb0a73f1465431d3510db5d4a8a1b7a2f90b2783',
      admittedExternalWindowsProofArrived: false,
      windowsInstalledUserLabviewProofClaimMade: false,
      publicGitHubExactMutation: 'gated-and-not-performed',
      marketplaceExactMutation: 'gated-and-not-performed'
    });
    expect(publicationState.activeCandidate).toMatchObject({
      sourceBranch: 'develop',
      releaseBranch: null,
      tag: null,
      packageVersion: '1.3.11',
      status: 'public-validation-prerelease-published-and-verified'
    });
    expect(publicationState.nextAdmittedAction).toBe(
      'collect-community-validation-reports-for-1.3.11-public-validation'
    );

    expect(informationItemMap).toContain('Exact release candidate reassessment');
    expect(currentState).toContain('current exact-release candidate reassessment');
    expect(srs).toContain('exact-release candidate reassessment');
    expect(rtm).toContain(
      'TEST-UNIT-388; TEST-UNIT-389; TEST-UNIT-390; TEST-DOC-133; TEST-DOC-141; TEST-DOC-142; TEST-DOC-143'
    );
    expect(testPlan).toContain('TEST-UNIT-390');
    expect(testPlan).toContain('TEST-DOC-143');
  });
});
