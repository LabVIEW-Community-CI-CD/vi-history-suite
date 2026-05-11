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

describe('release/1.3.14 main promotion preflight packet', () => {
  it('admits opening a protected release-to-main MR without mutating main or deleting the branch', () => {
    const packet = readText(
      'docs/product/release-main-promotion-preflight-v1.3.14-2026-05-08.md'
    );
    const packetJson = readJson<any>(
      'docs/product/release-main-promotion-preflight-v1.3.14-2026-05-08.json'
    );
    const releaseState = readJson<any>('docs/product/release-publication-state.json');
    const publicCandidate = readJson<any>('docs/product/public-release-candidate.json');
    const currentState = readText('docs/product/current-state.md');
    const informationItemMap = readText('docs/information-item-map.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');

    expect(packet).toContain('# Release Main Promotion Preflight v1.3.14 - 2026-05-08');
    expect(packet).toContain(
      '| Main-promotion preflight | `protected-main-promotion-merge-request-opening-admissible` |'
    );
    expect(packet).toContain('| Target branch | `main` |');
    expect(packet).toContain('`2511333533` / `success`');
    expect(packet).toContain('MR `!196` retained the release-branch readiness reassessment');
    expect(packet).toContain('`main` is an ancestor of `release/1.3.14`');
    expect(packet).toContain(
      '3d377d660af33c0fd5a36ee5f2e98a02204d4e1768e04cb3842f8d16b878005b'
    );
    expect(packet).toContain('This preflight did not open a release-to-main MR');
    expect(packet).toContain(
      '`open-protected-release-1.3.14-to-main-merge-request-with-source-branch-retained`'
    );

    expect(packetJson).toMatchObject({
      schema: 'vi-history-suite/release-main-promotion-preflight@v1',
      recordedAt: '2026-05-08',
      authority: {
        sourceBranch: 'release/1.3.14',
        sourceCommitSha: '50bec3391ea823739c2e8baddb33b77c283a37eb',
        sourcePipelineId: 2511168302,
        sourcePipelineStatus: 'success',
        targetBranch: 'main',
        targetCommitSha: '2f86063a35926fa67963af5ccd47e971157927c6',
        protectedDevelopRetentionCommitSha: '3557031442cbf85641544e07f9d75af59fe092d7',
        protectedDevelopRetentionPipelineId: 2511333533,
        protectedDevelopRetentionPipelineStatus: 'success',
        releaseReadinessMergeRequestIid: 196,
        packageVersion: '1.3.14'
      },
      topology: {
        mainIsAncestorOfReleaseBranch: true,
        releaseBranchIsAncestorOfProtectedDevelop: true,
        mainReleaseBranchMergeBase: '2f86063a35926fa67963af5ccd47e971157927c6',
        releaseBranchDevelopMergeBase: '50bec3391ea823739c2e8baddb33b77c283a37eb',
        openReleaseToMainMergeRequestsAtInspection: [],
        exactTagsAtInspection: []
      },
      verdict: {
        mainPromotionPreflight: 'protected-main-promotion-merge-request-opening-admissible',
        currentAdmissibleClaim: 'release-to-main-promotion-mr-opening-admitted-no-main-mutation',
        promotionMergeRequest: 'admissible-as-separate-governed-action-not-opened',
        mainPromotionMerge: 'not-performed-requires-green-protected-promotion-mr',
        exactTag: 'not-admitted-before-protected-main-promotion-and-green-main-pipeline',
        publicGitHubExactMutation: 'not-admitted-and-not-performed',
        marketplaceExactMutation: 'not-admitted-and-not-performed',
        windowsDockerDesktopWindowsContainerProof: 'community-deferred',
        releaseBranchDeletion: 'not-admitted',
        selectedExactAuthorityVsix: null,
        nextAdmittedAction:
          'open-protected-release-1.3.14-to-main-merge-request-with-source-branch-retained'
      }
    });
    expect(packetJson.protectedDevelopRetention.previewArtifact).toMatchObject({
      jobId: 14285909249,
      commitSha: '3557031442cbf85641544e07f9d75af59fe092d7',
      sha256: '3d377d660af33c0fd5a36ee5f2e98a02204d4e1768e04cb3842f8d16b878005b',
      sizeBytes: 1011931,
      role: 'protected-develop-retention-preview-evidence-only'
    });
    expect(packetJson.protectedDevelopRetention.vagrantVsixAcceptance).toMatchObject({
      jobId: 14285909248,
      manifestPath: 'vagrant/evidence/20260508-135407/manifest.json',
      generatedReportSha256:
        '6abb059f4cbe0fbe808901d0c3c34405a0214738b219965bdf0e9e2d86c83746',
      generatedReportSizeBytes: 6682
    });
    expect(packetJson.mutationBoundary).toEqual({
      releaseToMainMergeRequestOpened: false,
      releaseBranchMergedToMain: false,
      mainPromoted: false,
      exactTagCreated: false,
      publicGitHubReleaseCreated: false,
      publicGitHubReleasePublished: false,
      marketplaceTouched: false,
      windowsDockerDesktopProofAdmitted: false,
      releaseBranchDeleted: false
    });

    expect(releaseState.releaseMainPromotionPreflight).toMatchObject({
      status: 'protected-main-promotion-merge-request-opening-admissible',
      packetPath: 'docs/product/release-main-promotion-preflight-v1.3.14-2026-05-08.md',
      packetJsonPath: 'docs/product/release-main-promotion-preflight-v1.3.14-2026-05-08.json',
      sourceBranch: 'release/1.3.14',
      sourceCommit: '50bec3391ea823739c2e8baddb33b77c283a37eb',
      sourcePipelineId: 2511168302,
      targetBranch: 'main',
      targetCommit: '2f86063a35926fa67963af5ccd47e971157927c6',
      protectedDevelopRetentionPipelineId: 2511333533,
      releaseReadinessMergeRequestIid: 196,
      promotionMergeRequest: 'admissible-as-separate-governed-action-not-opened',
      mainPromotionMerge: 'not-performed-requires-green-protected-promotion-mr',
      releaseBranchDeletion: 'not-admitted',
      nextAdmittedAction:
        'open-protected-release-1.3.14-to-main-merge-request-with-source-branch-retained'
    });
    expect(releaseState.activeCandidate).toBeNull();
    expect(releaseState.nextAdmittedAction).toBe(
      'normal-next-semver-opening-may-proceed-after-v1.3.15-closeout-retention'
    );
    expect(publicCandidate.activeDevelopCandidate).toBeNull();

    expect(currentState).toContain('release-main-promotion-preflight-v1.3.14-2026-05-08.md');
    expect(informationItemMap).toContain('Release main promotion preflight');
    expect(srs).toContain('protected-main-promotion preflight');
    expect(rtm).toContain('VHS-REQ-593');
    expect(rtm).toContain('TEST-UNIT-401; TEST-DOC-153');
    expect(testPlan).toContain('TEST-UNIT-401');
    expect(testPlan).toContain('TEST-DOC-153');
  });
});
