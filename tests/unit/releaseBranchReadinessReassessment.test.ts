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

describe('release/1.3.14 branch readiness reassessment packet', () => {
  it('admits protected main promotion as a separate action without performing publication mutation', () => {
    const packet = readText(
      'docs/product/release-branch-readiness-reassessment-v1.3.14-2026-05-08.md'
    );
    const packetJson = readJson<any>(
      'docs/product/release-branch-readiness-reassessment-v1.3.14-2026-05-08.json'
    );
    const releaseState = readJson<any>('docs/product/release-publication-state.json');
    const releaseStateDoc = readText('docs/product/release-publication-state.md');
    const publicCandidate = readJson<any>('docs/product/public-release-candidate.json');
    const currentState = readText('docs/product/current-state.md');
    const informationItemMap = readText('docs/information-item-map.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');

    expect(packet).toContain('# Release Branch Readiness Reassessment v1.3.14 - 2026-05-08');
    expect(packet).toContain(
      '| Release-branch readiness | `main-promotion-admissible-as-separate-governed-action` |'
    );
    expect(packet).toContain('`2511168302` / `success`');
    expect(packet).toContain('`2511236377` / `success`');
    expect(packet).toContain('`14284865649`');
    expect(packet).toContain('`14285299160`');
    expect(packet).toContain(
      'd5208f9092bd7e3c7b7c075c91fc8fbf08851e116df7bedbf1f6279985dd4f91'
    );
    expect(packet).toContain(
      '17c73f9e011499d1d77ae758e0c0ef13dcb2b8304e29a0fa4cf29cb6e8559ebd'
    );
    expect(packet).toContain('| Exact tag | not admitted before protected `main` promotion |');
    expect(packet).toContain('This reassessment did not create `v1.3.14`');
    expect(packet).toContain('`promote-release-1.3.14-to-main-as-separate-governed-action`');

    expect(packetJson).toMatchObject({
      schema: 'vi-history-suite/release-branch-readiness-reassessment@v1',
      recordedAt: '2026-05-08',
      authority: {
        releaseBranch: 'release/1.3.14',
        releaseBranchCommitSha: '50bec3391ea823739c2e8baddb33b77c283a37eb',
        releaseBranchPipelineId: 2511168302,
        releaseBranchPipelineStatus: 'success',
        protectedDevelopRetentionCommitSha: 'c9cff58f5608289ec6acdaea64999b1e460cca96',
        protectedDevelopRetentionPipelineId: 2511236377,
        protectedDevelopRetentionPipelineStatus: 'success',
        packageVersion: '1.3.14'
      },
      verdict: {
        releaseBranchReadiness: 'main-promotion-admissible-as-separate-governed-action',
        currentAdmissibleClaim: 'release-branch-green-for-main-promotion-no-exact-publication',
        mainPromotion: 'admissible-as-separate-governed-action-not-performed',
        exactTag: 'not-admitted-before-protected-main-promotion',
        publicGitHubExactMutation: 'not-admitted-and-not-performed',
        marketplaceExactMutation: 'not-admitted-and-not-performed',
        windowsDockerDesktopWindowsContainerProof: 'community-deferred',
        selectedExactAuthorityVsix: null,
        nextAdmittedAction: 'promote-release-1.3.14-to-main-as-separate-governed-action'
      }
    });
    expect(packetJson.releaseBranchEvidence.previewArtifact).toMatchObject({
      jobId: 14284865650,
      commitSha: '50bec3391ea823739c2e8baddb33b77c283a37eb',
      sha256: 'd5208f9092bd7e3c7b7c075c91fc8fbf08851e116df7bedbf1f6279985dd4f91',
      sizeBytes: 1011702,
      role: 'release-branch-preview-evidence-only'
    });
    expect(packetJson.protectedDevelopRetention.previewArtifact).toMatchObject({
      jobId: 14285299161,
      commitSha: 'c9cff58f5608289ec6acdaea64999b1e460cca96',
      sha256: '17c73f9e011499d1d77ae758e0c0ef13dcb2b8304e29a0fa4cf29cb6e8559ebd',
      sizeBytes: 1011765,
      role: 'protected-develop-retention-preview-evidence-only'
    });
    expect(packetJson.releaseBranchEvidence.vagrantVsixAcceptance).toMatchObject({
      jobId: 14284865649,
      generatedReportSha256:
        '0df0027e2386543bd3e4b4ba54186b382430e0b95c8663d2a3609829c42b3800',
      generatedReportSizeBytes: 4841
    });
    expect(packetJson.protectedDevelopRetention.vagrantVsixAcceptance).toMatchObject({
      jobId: 14285299160,
      manifestPath: 'vagrant/evidence/20260508-125315/manifest.json',
      generatedReportSha256:
        '371c486a2d68cbf2d0f29af34119f75afceac5c5dc14d3ad868b1ba249d8a71c',
      generatedReportSizeBytes: 4841
    });
    expect(packetJson.releaseBranchEvidence.vagrantVsixAcceptance.facts).toMatchObject({
      harnessId: 'HARNESS-VHS-002',
      selectedHash: '8741bb08026c104100720c0ef48621e4ab7762fd',
      baseHash: 'c188cdec606aac3b17d8b17274baa19eef3e4017',
      labviewVersion: '2026',
      labviewBitness: 'x86',
      proofExitCode: 0,
      runtimeProvider: 'host-native',
      runtimeEngine: 'labview-cli',
      runtimeExecutionState: 'succeeded',
      generatedReportExists: true
    });
    expect(packetJson.mutationBoundary).toEqual({
      exactTagCreated: false,
      releaseBranchMergedToMain: false,
      publicGitHubReleaseCreated: false,
      publicGitHubReleasePublished: false,
      marketplaceTouched: false,
      mainPromoted: false,
      windowsDockerDesktopProofAdmitted: false,
      releaseBranchDeleted: false
    });
    expect(packetJson.nextAdmittedActions).toContain(
      'promote-release-1.3.14-to-main-as-separate-governed-action'
    );

    expect(releaseState.releaseBranchReadinessReassessment).toMatchObject({
      status: 'main-promotion-admissible-as-separate-governed-action',
      releaseBranch: 'release/1.3.14',
      releaseBranchPipelineId: 2511168302,
      protectedDevelopRetentionPipelineId: 2511236377,
      releaseBranchPreviewVsixSha256:
        'd5208f9092bd7e3c7b7c075c91fc8fbf08851e116df7bedbf1f6279985dd4f91',
      protectedDevelopPreviewVsixSha256:
        '17c73f9e011499d1d77ae758e0c0ef13dcb2b8304e29a0fa4cf29cb6e8559ebd',
      releaseBranchVagrantVsixAcceptanceJobId: 14284865649,
      protectedDevelopVagrantVsixAcceptanceJobId: 14285299160,
      mainPromotion: 'admissible-as-separate-governed-action-not-performed',
      exactTag: 'not-admitted-before-protected-main-promotion',
      nextAdmittedAction: 'promote-release-1.3.14-to-main-as-separate-governed-action'
    });
    expect(releaseState.activeCandidate).toMatchObject({
      releaseBranch: 'release/1.3.14',
      tag: 'v1.3.14',
      packageVersion: '1.3.14',
      status: 'public-source-and-tag-handoff-complete-release-publication-blocked'
    });
    expect(releaseState.nextAdmittedAction).toBe(
      'retain-public-source-and-tag-handoff-with-release-publication-blocked'
    );
    expect(publicCandidate.activeDevelopCandidate).toMatchObject({
      state: 'public-source-and-tag-handoff-complete-release-publication-blocked',
      releaseBranchReadinessReassessmentPacketPath:
        'docs/product/release-branch-readiness-reassessment-v1.3.14-2026-05-08.md',
      nextAdmittedAction:
        'retain-public-source-and-tag-handoff-with-release-publication-blocked'
    });

    expect(releaseStateDoc).toContain('## Release Branch Readiness Reassessment');
    expect(currentState).toContain('release-branch-readiness-reassessment-v1.3.14-2026-05-08.md');
    expect(informationItemMap).toContain('Release branch readiness reassessment');
    expect(srs).toContain('release-branch-readiness reassessment');
    expect(rtm).toContain('VHS-REQ-592');
    expect(rtm).toContain('TEST-UNIT-400; TEST-DOC-152');
    expect(testPlan).toContain('TEST-UNIT-400');
    expect(testPlan).toContain('TEST-DOC-152');
  });
});
