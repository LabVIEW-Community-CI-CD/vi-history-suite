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

describe('release/1.3.16 branch readiness reassessment packet', () => {
  it('admits main promotion as a separate governed action when main is already an ancestor', () => {
    const packet = readText(
      'docs/product/release-branch-readiness-reassessment-v1.3.16-2026-05-11.md'
    );
    const packetJson = readJson<any>(
      'docs/product/release-branch-readiness-reassessment-v1.3.16-2026-05-11.json'
    );
    const releaseState = readJson<any>('docs/product/release-publication-state.json');
    const releaseStateDoc = readText('docs/product/release-publication-state.md');
    const publicCandidate = readJson<any>('docs/product/public-release-candidate.json');
    const currentState = readText('docs/product/current-state.md');
    const informationItemMap = readText('docs/information-item-map.md');

    expect(packet).toContain('# Release Branch Readiness Reassessment v1.3.16 - 2026-05-11');
    expect(packet).toContain(
      '| Release-branch readiness | `main-promotion-admissible-as-separate-governed-action` |'
    );
    expect(packet).toContain('`2516207722` / `success`');
    expect(packet).toContain('`2516304744` / `success`');
    expect(packet).toContain('`14309562384`');
    expect(packet).toContain('`14310323541`');
    expect(packet).toContain(
      '84ff12e25793406a29ca1ce23a670e6aab8b3519594ef0019605564034f964da'
    );
    expect(packet).toContain(
      '0944e92e28a01b5a8a7fb1d51c403c30fb67db551b263dc3970afadb34ba5e72'
    );
    expect(packet).toContain('`main` is an ancestor of `release/1.3.16`');
    expect(packet).toContain('`196dd70878bf26e9722c031b9192581e5147bafb`');
    expect(packet).toContain('`vihs-lv-prelaunch`');
    expect(packet).toContain(
      '`C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe`'
    );
    expect(packet).toContain('`promote-release-1.3.16-to-main-as-separate-governed-action`');

    expect(packetJson).toMatchObject({
      schema: 'vi-history-suite/release-branch-readiness-reassessment@v1',
      recordedAt: '2026-05-11',
      authority: {
        releaseBranch: 'release/1.3.16',
        releaseBranchCommitSha: '2443e601c2b1aa78122af785516376b9905ba43f',
        releaseBranchPipelineId: 2516207722,
        releaseBranchPipelineStatus: 'success',
        protectedDevelopRetentionCommitSha: '50faa3a07d8351db45b5fd13c479033c0debbb71',
        protectedDevelopRetentionPipelineId: 2516304744,
        protectedDevelopRetentionPipelineStatus: 'success',
        packageVersion: '1.3.16'
      },
      topology: {
        mainCommitSha: '196dd70878bf26e9722c031b9192581e5147bafb',
        mainIsAncestorOfReleaseBranch: true,
        mainReleaseBranchMergeBase: '196dd70878bf26e9722c031b9192581e5147bafb',
        releaseBranchIsAncestorOfProtectedDevelop: true,
        releaseBranchDevelopMergeBase: '2443e601c2b1aa78122af785516376b9905ba43f',
        v1316TagExistsAtInspection: false,
        topologyRefreshRequired: false
      },
      verdict: {
        releaseBranchReadiness: 'main-promotion-admissible-as-separate-governed-action',
        currentAdmissibleClaim: 'release-branch-green-for-main-promotion-no-exact-publication',
        mainPromotion: 'admissible-as-separate-governed-action-not-performed',
        exactTag: 'not-admitted-before-protected-main-promotion-and-green-main-pipeline',
        publicGitHubExactMutation: 'not-admitted-and-not-performed',
        marketplaceExactMutation: 'not-admitted-and-not-performed',
        windowsDockerDesktopWindowsContainerProof: 'community-deferred',
        releaseBranchDeletion: 'not-admitted',
        selectedExactAuthorityVsix: null,
        nextAdmittedAction: 'promote-release-1.3.16-to-main-as-separate-governed-action'
      }
    });
    expect(packetJson.releaseBranchEvidence.previewArtifact).toMatchObject({
      jobId: 14309562385,
      commitSha: '2443e601c2b1aa78122af785516376b9905ba43f',
      sha256: '84ff12e25793406a29ca1ce23a670e6aab8b3519594ef0019605564034f964da',
      sizeBytes: 1015904,
      role: 'release-branch-preview-evidence-only'
    });
    expect(packetJson.protectedDevelopRetention.previewArtifact).toMatchObject({
      jobId: 14310323542,
      commitSha: '50faa3a07d8351db45b5fd13c479033c0debbb71',
      sha256: '0944e92e28a01b5a8a7fb1d51c403c30fb67db551b263dc3970afadb34ba5e72',
      sizeBytes: 1015961,
      role: 'protected-develop-retention-preview-evidence-only'
    });
    expect(packetJson.releaseBranchEvidence.vagrantVsixAcceptance).toMatchObject({
      jobId: 14309562384,
      generatedReportSha256:
        'd98a1d5271ee451b61f798af51cb845b37286d382d950b2f7053c587697939ae',
      generatedReportSizeBytes: 6926
    });
    expect(packetJson.protectedDevelopRetention.vagrantVsixAcceptance).toMatchObject({
      jobId: 14310323541,
      manifestPath: 'vagrant/evidence/20260511-074020/manifest.json',
      generatedReportSha256:
        '79445880545899ebb2d37a5493aa027bf5fe0409db19e72b5e0f2acbc9c094d2',
      generatedReportSizeBytes: 6928
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
      'promote-release-1.3.16-to-main-as-separate-governed-action'
    );

    expect(releaseState.releaseBranchReadinessReassessment).toMatchObject({
      status: 'main-promotion-admissible-as-separate-governed-action',
      releaseBranch: 'release/1.3.16',
      releaseBranchPipelineId: 2516207722,
      protectedDevelopRetentionPipelineId: 2516304744,
      mainIsAncestorOfReleaseBranch: true,
      topologyRefreshRequired: false,
      releaseBranchIsAncestorOfProtectedDevelop: true,
      releaseBranchPreviewVsixSha256:
        '84ff12e25793406a29ca1ce23a670e6aab8b3519594ef0019605564034f964da',
      protectedDevelopPreviewVsixSha256:
        '0944e92e28a01b5a8a7fb1d51c403c30fb67db551b263dc3970afadb34ba5e72',
      releaseBranchVagrantVsixAcceptanceJobId: 14309562384,
      protectedDevelopVagrantVsixAcceptanceJobId: 14310323541,
      mainPromotion: 'admissible-as-separate-governed-action-not-performed',
      exactTag: 'not-admitted-before-protected-main-promotion-and-green-main-pipeline',
      nextAdmittedAction: 'promote-release-1.3.16-to-main-as-separate-governed-action'
    });
    expect(releaseState.activeCandidate).toMatchObject({
      packageVersion: '1.3.16',
      tag: 'v1.3.16',
      state: 'release-branch-readiness-reassessed-main-promotion-admissible'
    });
    expect(releaseState.nextAdmittedAction).toBe(
      'promote-release-1.3.16-to-main-as-separate-governed-action'
    );
    expect(publicCandidate.activeDevelopCandidate).toMatchObject({
      packageVersion: '1.3.16',
      tag: 'v1.3.16',
      status: 'release-branch-readiness-reassessed-main-promotion-admissible'
    });

    expect(releaseStateDoc).toContain('## Release Branch Readiness Reassessment');
    expect(releaseStateDoc).toContain('Main promotion: admissible only as a separate governed action');
    expect(currentState).toContain('release-branch-readiness-reassessment-v1.3.16-2026-05-11.md');
    expect(informationItemMap).toContain('Release branch readiness reassessment packet v1.3.16');
  });
});
