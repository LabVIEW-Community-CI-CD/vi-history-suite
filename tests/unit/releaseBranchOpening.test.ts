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

describe('release/1.3.15 branch opening packet', () => {
  it('retains governed branch-opening evidence without admitting publication mutation', () => {
    const packet = readText('docs/product/release-branch-opening-v1.3.15-2026-05-09.md');
    const packetJson = readJson<any>(
      'docs/product/release-branch-opening-v1.3.15-2026-05-09.json'
    );
    const releaseState = readJson<any>('docs/product/release-publication-state.json');
    const releaseStateDoc = readText('docs/product/release-publication-state.md');
    const currentState = readText('docs/product/current-state.md');
    const informationItemMap = readText('docs/information-item-map.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');

    expect(packet).toContain('# Release Branch Opening v1.3.15 - 2026-05-09');
    expect(packet).toContain('| Release branch opening | `performed-and-retained` |');
    expect(packet).toContain('| Release branch | `release/1.3.15` |');
    expect(packet).toContain('`67c2c3a188666eaad3cab2695092991c42f33470`');
    expect(packet).toContain('`2513019603` / `success`');
    expect(packet).toContain('`2513019188`');
    expect(packet).toContain('`14293424513`');
    expect(packet).toContain('`14293424514`');
    expect(packet).toContain(
      'bf5b15c944536a2e23872ebcf993e64351f01ed35e56793ae3e5005a520e0a14'
    );
    expect(packet).toContain(
      'ae2305cf4a08eceb207e15db4d2a3f2e589f5a664ecf5d8197b2eba5a5184fe0'
    );
    expect(packet).toContain('`release_extension` job did not run');
    expect(packet).toContain('| Windows Docker Desktop Windows-container proof | community/deferred |');
    expect(packet).toContain('| `main` promotion | not admitted and not performed |');
    expect(packet).toContain('`C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe`');
    expect(packet).toContain('`runtimeBitness=x86`');
    expect(packet).toContain('stale `viHistorySuite.labviewBitness=x64`');

    expect(packetJson.authority).toMatchObject({
      sourceBranch: 'develop',
      sourceCommitSha: '67c2c3a188666eaad3cab2695092991c42f33470',
      releaseBranch: 'release/1.3.15',
      releaseBranchRef: 'refs/heads/release/1.3.15',
      packageVersion: '1.3.15',
      pipelineId: 2513019603,
      pipelineStatus: 'success',
      pipelineSource: 'push'
    });
    expect(packetJson.verdict).toMatchObject({
      releaseBranchOpening: 'performed-and-retained',
      exactTag: 'not-admitted-and-not-created',
      publicGitHubExactMutation: 'not-admitted-and-not-performed',
      marketplaceExactMutation: 'not-admitted-and-not-performed',
      windowsDockerDesktopWindowsContainerProof: 'community-deferred',
      mainPromotion: 'not-admitted-and-not-performed',
      releaseBranchDeletion: 'not-admitted-and-not-performed',
      selectedExactAuthorityVsix: null,
      nextAdmittedAction: 'reassess-release-1.3.15-branch-readiness-before-exact-tag'
    });
    expect(packetJson.duplicatePipeline).toMatchObject({
      status: 'passed-duplicate-operator-validation',
      pipelineId: 2513019188,
      pipelineStatus: 'success',
      pipelineSource: 'api',
      sourceCommitSha: '67c2c3a188666eaad3cab2695092991c42f33470',
      releaseBranch: 'release/1.3.15',
      previewVsixSha256: 'ae2305cf4a08eceb207e15db4d2a3f2e589f5a664ecf5d8197b2eba5a5184fe0',
      vagrantVsixAcceptanceJobId: 14293422370,
      packageExtensionPreviewJobId: 14293422371,
      canonicalForBranchOpening: false
    });
    expect(packetJson.previewArtifact).toMatchObject({
      jobId: 14293424514,
      vsixPath: 'preview-evidence/vi-history-suite-1.3.15.vsix',
      sha256: 'bf5b15c944536a2e23872ebcf993e64351f01ed35e56793ae3e5005a520e0a14',
      sizeBytes: 1014754,
      role: 'release-branch-preview-evidence-only'
    });
    expect(packetJson.vagrantVsixAcceptance).toMatchObject({
      jobId: 14293424513,
      jobStatus: 'success',
      assertionReceiptPath: 'vagrant/evidence/assertion/vagrant-vsix-acceptance-assertion.json',
      assertionStatus: 'passed',
      manifestPath: 'vagrant/evidence/20260509-171233/manifest.json',
      labviewStartupReceiptPath: 'vagrant/evidence/labview-startup.json',
      generatedReportSha256:
        '39e42c208e518382a4d7870b9d132796ad61195e319575f6b9534080914c17a9',
      generatedReportSizeBytes: 6737,
      claimBoundary:
        'vagrant-vsix-acceptance-only; does-not-replace-native-windows-x64-private-release-or-windows-container-proof'
    });
    expect(packetJson.vagrantVsixAcceptance.facts).toMatchObject({
      manifestSchema: 'vi-history-suite/vagrant-vsix-acceptance@v1',
      assertionSchema: 'vi-history-suite/vagrant-vsix-acceptance-assertion@v1',
      startupSchema: 'vi-history-suite/vagrant-labview-startup@v1',
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
      explorerSessionId: 1,
      viServerPortLine: 'TCP 0.0.0.0:3363 LISTENING',
      settingsCorrection: 'stale-x64-overwritten-by-forced-vihs-launcher-x86'
    });
    expect(packetJson.mutationBoundary).toMatchObject({
      exactTagCreated: false,
      publicGitHubReleaseCreated: false,
      publicGitHubReleasePublished: false,
      marketplaceTouched: false,
      mainPromoted: false,
      windowsDockerDesktopProofAdmitted: false,
      releaseBranchDeleted: false
    });
    expect(packetJson.pipelineJobs.map((job: { name: string }) => job.name)).toEqual([
      'ubuntu_docker_runner_admission',
      'docs_link_check',
      'docs_continuous_integration',
      'docs_public_continuous_integration',
      'docs_internal_continuous_integration',
      'assurance_release_gate',
      'assurance_26514_authority',
      'assurance_requirements_quality',
      'assurance_external_user_information',
      'assurance_audit_packet',
      'test_extension',
      'public_exact_pretag_proof',
      'linux_docker_provider_lane',
      'vagrant_windows_vsix_acceptance',
      'package_extension_preview'
    ]);

    expect(releaseState.releaseBranchOpening).toMatchObject({
      status: 'performed-and-retained',
      releaseBranch: 'release/1.3.15',
      pipelineId: 2513019603,
      pipelineStatus: 'success',
      pipelineSource: 'push',
      duplicatePipelineId: 2513019188,
      vagrantVsixAcceptanceJobId: 14293424513,
      packageVersion: '1.3.15',
      previewVsixSha256: 'bf5b15c944536a2e23872ebcf993e64351f01ed35e56793ae3e5005a520e0a14',
      releaseExtensionJob: 'not-run-without-exact-tag',
      nextAdmittedAction: 'reassess-release-1.3.15-branch-readiness-before-exact-tag'
    });
    expect(releaseState.activeCandidate).toMatchObject({
      releaseBranch: 'release/1.3.15',
      tag: 'v1.3.15',
      packageVersion: '1.3.15',
      status: 'release-branch-opened-green-readiness-reassessment-pending'
    });
    expect(releaseState.nextAdmittedAction).toBe(
      'reassess-release-1.3.15-branch-readiness-before-exact-tag'
    );

    expect(releaseStateDoc).toContain('## Release Branch Opening');
    expect(releaseStateDoc).toContain('Release branch pipeline: `2513019603` / `success`');
    expect(currentState).toContain('active release-candidate branch: `release/1.3.15`');
    expect(currentState).toContain('release-branch-opening-v1.3.15-2026-05-09.md');
    expect(informationItemMap).toContain('Release branch opening packet');
    expect(srs).toContain('governed release-branch opening');
    expect(rtm).toContain('TEST-UNIT-399');
    expect(testPlan).toContain('TEST-DOC-151');
  });
});
