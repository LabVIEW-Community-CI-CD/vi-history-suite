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

describe('release/1.3.15 branch readiness reassessment packet', () => {
  it('blocks main promotion preflight until main is brought into the release branch', () => {
    const packet = readText(
      'docs/product/release-branch-readiness-reassessment-v1.3.15-2026-05-09.md'
    );
    const packetJson = readJson<any>(
      'docs/product/release-branch-readiness-reassessment-v1.3.15-2026-05-09.json'
    );
    const releaseState = readJson<any>('docs/product/release-publication-state.json');
    const releaseStateDoc = readText('docs/product/release-publication-state.md');
    const publicCandidate = readJson<any>('docs/product/public-release-candidate.json');
    const currentState = readText('docs/product/current-state.md');
    const informationItemMap = readText('docs/information-item-map.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');

    expect(packet).toContain('# Release Branch Readiness Reassessment v1.3.15 - 2026-05-09');
    expect(packet).toContain(
      '| Release-branch readiness | `blocked-main-not-ancestor-topology-refresh-required` |'
    );
    expect(packet).toContain('`2513019603` / `success`');
    expect(packet).toContain('`2513063788` / `success`');
    expect(packet).toContain('`14293424513`');
    expect(packet).toContain('`14293598040`');
    expect(packet).toContain(
      'bf5b15c944536a2e23872ebcf993e64351f01ed35e56793ae3e5005a520e0a14'
    );
    expect(packet).toContain(
      '03699261fc3937b1f0676f60230e4e9b4cbe4b1daff86fba1d3730cb908bcc95'
    );
    expect(packet).toContain('`main` is not yet an ancestor of `release/1.3.15`');
    expect(packet).toContain('`50bec3391ea823739c2e8baddb33b77c283a37eb`');
    expect(packet).toContain('`vihs-lv-prelaunch`');
    expect(packet).toContain('`C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe`');
    expect(packet).toContain(
      '`refresh-release-1.3.15-with-main-before-main-promotion-preflight`'
    );

    expect(packetJson).toMatchObject({
      schema: 'vi-history-suite/release-branch-readiness-reassessment@v1',
      recordedAt: '2026-05-09',
      authority: {
        releaseBranch: 'release/1.3.15',
        releaseBranchCommitSha: '67c2c3a188666eaad3cab2695092991c42f33470',
        releaseBranchPipelineId: 2513019603,
        releaseBranchPipelineStatus: 'success',
        protectedDevelopRetentionCommitSha: '801349167499b9d03b8244c42b03d88e15098034',
        protectedDevelopRetentionPipelineId: 2513063788,
        protectedDevelopRetentionPipelineStatus: 'success',
        packageVersion: '1.3.15'
      },
      topology: {
        mainCommitSha: '2a08e94f819a34d54b4fdcb4ded24f85f8c7dbaa',
        mainIsAncestorOfReleaseBranch: false,
        mainReleaseBranchMergeBase: '50bec3391ea823739c2e8baddb33b77c283a37eb',
        releaseBranchIsAncestorOfProtectedDevelop: true,
        releaseBranchDevelopMergeBase: '67c2c3a188666eaad3cab2695092991c42f33470',
        v1315TagExistsAtInspection: false,
        topologyRefreshRequired: true
      },
      verdict: {
        releaseBranchReadiness: 'blocked-main-not-ancestor-topology-refresh-required',
        currentAdmissibleClaim:
          'release-branch-green-but-main-topology-refresh-required-no-exact-publication',
        mainPromotion: 'blocked-until-main-is-ancestor-of-release-branch',
        exactTag:
          'not-admitted-before-topology-refresh-protected-main-promotion-and-green-main-pipeline',
        publicGitHubExactMutation: 'not-admitted-and-not-performed',
        marketplaceExactMutation: 'not-admitted-and-not-performed',
        windowsDockerDesktopWindowsContainerProof: 'community-deferred',
        selectedExactAuthorityVsix: null,
        nextAdmittedAction:
          'refresh-release-1.3.15-with-main-before-main-promotion-preflight'
      }
    });
    expect(packetJson.releaseBranchEvidence.previewArtifact).toMatchObject({
      jobId: 14293424514,
      commitSha: '67c2c3a188666eaad3cab2695092991c42f33470',
      sha256: 'bf5b15c944536a2e23872ebcf993e64351f01ed35e56793ae3e5005a520e0a14',
      sizeBytes: 1014754,
      role: 'release-branch-preview-evidence-only'
    });
    expect(packetJson.protectedDevelopRetention.previewArtifact).toMatchObject({
      jobId: 14293598041,
      commitSha: '801349167499b9d03b8244c42b03d88e15098034',
      sha256: '03699261fc3937b1f0676f60230e4e9b4cbe4b1daff86fba1d3730cb908bcc95',
      sizeBytes: 1014773,
      role: 'protected-develop-retention-preview-evidence-only'
    });
    expect(packetJson.releaseBranchEvidence.vagrantVsixAcceptance).toMatchObject({
      jobId: 14293424513,
      generatedReportSha256:
        '39e42c208e518382a4d7870b9d132796ad61195e319575f6b9534080914c17a9',
      generatedReportSizeBytes: 6737
    });
    expect(packetJson.protectedDevelopRetention.vagrantVsixAcceptance).toMatchObject({
      jobId: 14293598040,
      manifestPath: 'vagrant/evidence/20260509-174735/manifest.json',
      generatedReportSha256:
        '28af59de34ee10f1b549019fd5da4dd9625c48e27ca3aa7221f897b29411e180',
      generatedReportSizeBytes: 6737
    });
    expect(packetJson.protectedDevelopRetention.vagrantVsixAcceptance.facts).toMatchObject({
      harnessId: 'HARNESS-VHS-002',
      selectedHash: '8741bb08026c104100720c0ef48621e4ab7762fd',
      baseHash: 'c188cdec606aac3b17d8b17274baa19eef3e4017',
      labviewVersion: '2026',
      labviewBitness: 'x86',
      proofExitCode: 0,
      runtimeProvider: 'host-native',
      runtimeEngine: 'labview-cli',
      runtimeBitness: 'x86',
      runtimeExecutionState: 'succeeded',
      generatedReportExists: true,
      prelaunchTaskName: 'vihs-lv-prelaunch',
      labviewExe: 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      labviewSessionId: 1,
      explorerSessionId: 1
    });
    expect(packetJson.mutationBoundary).toEqual({
      topologyRefreshPerformed: false,
      releaseBranchMergedToMain: false,
      mainPromoted: false,
      exactTagCreated: false,
      publicGitHubReleaseCreated: false,
      publicGitHubReleasePublished: false,
      marketplaceTouched: false,
      windowsDockerDesktopProofAdmitted: false,
      releaseBranchDeleted: false
    });
    expect(packetJson.nextAdmittedActions).toContain(
      'refresh-release-1.3.15-with-main-before-main-promotion-preflight'
    );

    expect(releaseState.releaseBranchReadinessReassessment).toMatchObject({
      status: 'blocked-main-not-ancestor-topology-refresh-required',
      releaseBranch: 'release/1.3.15',
      releaseBranchPipelineId: 2513019603,
      protectedDevelopRetentionPipelineId: 2513063788,
      mainIsAncestorOfReleaseBranch: false,
      releaseBranchIsAncestorOfProtectedDevelop: true,
      releaseBranchPreviewVsixSha256:
        'bf5b15c944536a2e23872ebcf993e64351f01ed35e56793ae3e5005a520e0a14',
      protectedDevelopPreviewVsixSha256:
        '03699261fc3937b1f0676f60230e4e9b4cbe4b1daff86fba1d3730cb908bcc95',
      releaseBranchVagrantVsixAcceptanceJobId: 14293424513,
      protectedDevelopVagrantVsixAcceptanceJobId: 14293598040,
      mainPromotion: 'blocked-until-main-is-ancestor-of-release-branch',
      exactTag:
        'not-admitted-before-topology-refresh-protected-main-promotion-and-green-main-pipeline',
      nextAdmittedAction: 'refresh-release-1.3.15-with-main-before-main-promotion-preflight'
    });
    expect(releaseState.activeCandidate).toMatchObject({ packageVersion: '1.3.16', tag: 'v1.3.16' });
    expect(releaseState.nextAdmittedAction).toBe(
      'open-release-1.3.16-after-protected-develop-candidate-pipeline'
    );
    expect(publicCandidate.activeDevelopCandidate).toMatchObject({ packageVersion: '1.3.16', tag: 'v1.3.16' });

    expect(releaseStateDoc).toContain('## Release Branch Readiness Reassessment');
    expect(releaseStateDoc).toContain('Main promotion: blocked until topology refresh');
    expect(currentState).toContain('release-branch-readiness-reassessment-v1.3.15-2026-05-09.md');
    expect(informationItemMap).toContain('Release branch readiness reassessment packet v1.3.15');
    expect(srs).toContain('blocking protected `main` promotion while `main` is not an ancestor');
    expect(rtm).toContain('VHS-REQ-592');
    expect(rtm).toContain('TEST-UNIT-400; TEST-DOC-152');
    expect(testPlan).toContain('TEST-UNIT-400');
    expect(testPlan).toContain('TEST-DOC-152');
  });
});
