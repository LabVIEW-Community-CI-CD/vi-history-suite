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

describe('release/1.3.14 branch opening packet', () => {
  it('retains governed branch-opening evidence without admitting publication mutation', () => {
    const packet = readText('docs/product/release-branch-opening-v1.3.14-2026-05-08.md');
    const packetJson = readJson<any>(
      'docs/product/release-branch-opening-v1.3.14-2026-05-08.json'
    );
    const releaseState = readJson<any>('docs/product/release-publication-state.json');
    const releaseStateDoc = readText('docs/product/release-publication-state.md');
    const currentState = readText('docs/product/current-state.md');
    const informationItemMap = readText('docs/information-item-map.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');

    expect(packet).toContain('# Release Branch Opening v1.3.14 - 2026-05-08');
    expect(packet).toContain('| Release branch opening | `performed-and-retained` |');
    expect(packet).toContain('| Release branch | `release/1.3.14` |');
    expect(packet).toContain('`50bec3391ea823739c2e8baddb33b77c283a37eb`');
    expect(packet).toContain('`2511168302` / `success`');
    expect(packet).toContain('`14284865649`');
    expect(packet).toContain('`14284865650`');
    expect(packet).toContain(
      'd5208f9092bd7e3c7b7c075c91fc8fbf08851e116df7bedbf1f6279985dd4f91'
    );
    expect(packet).toContain('`release_extension` job did not run');
    expect(packet).toContain('| Windows Docker Desktop Windows-container proof | community/deferred |');
    expect(packet).toContain('| `main` promotion | not admitted and not performed |');

    expect(packetJson.authority).toMatchObject({
      sourceBranch: 'develop',
      sourceCommitSha: '50bec3391ea823739c2e8baddb33b77c283a37eb',
      releaseBranch: 'release/1.3.14',
      releaseBranchRef: 'refs/heads/release/1.3.14',
      packageVersion: '1.3.14',
      pipelineId: 2511168302,
      pipelineStatus: 'success'
    });
    expect(packetJson.verdict).toMatchObject({
      releaseBranchOpening: 'performed-and-retained',
      exactTag: 'not-admitted-and-not-created',
      publicGitHubExactMutation: 'not-admitted-and-not-performed',
      marketplaceExactMutation: 'not-admitted-and-not-performed',
      windowsDockerDesktopWindowsContainerProof: 'community-deferred',
      mainPromotion: 'not-admitted-and-not-performed',
      selectedExactAuthorityVsix: null,
      nextAdmittedAction: 'reassess-release-1.3.14-branch-readiness-before-exact-tag'
    });
    expect(packetJson.previewArtifact).toMatchObject({
      jobId: 14284865650,
      vsixPath: 'preview-evidence/vi-history-suite-1.3.14.vsix',
      sha256: 'd5208f9092bd7e3c7b7c075c91fc8fbf08851e116df7bedbf1f6279985dd4f91',
      sizeBytes: 1011702,
      role: 'release-branch-preview-evidence-only'
    });
    expect(packetJson.vagrantVsixAcceptance).toMatchObject({
      jobId: 14284865649,
      jobStatus: 'success',
      assertionReceiptPath: 'vagrant/evidence/assertion/vagrant-vsix-acceptance-assertion.json',
      manifestPath: 'vagrant/evidence/20260508-121101/manifest.json',
      generatedReportSha256:
        '0df0027e2386543bd3e4b4ba54186b382430e0b95c8663d2a3609829c42b3800',
      generatedReportSizeBytes: 4841,
      claimBoundary:
        'vagrant-vsix-acceptance-only; does-not-replace-native-windows-x64-private-release-or-windows-container-proof'
    });
    expect(packetJson.vagrantVsixAcceptance.facts).toMatchObject({
      manifestSchema: 'vi-history-suite/vagrant-vsix-acceptance@v1',
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
      generatedReportExists: true
    });
    expect(packetJson.mutationBoundary).toMatchObject({
      exactTagCreated: false,
      publicGitHubReleaseCreated: false,
      publicGitHubReleasePublished: false,
      marketplaceTouched: false,
      mainPromoted: false,
      windowsDockerDesktopProofAdmitted: false
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
      releaseBranch: 'release/1.3.14',
      pipelineId: 2511168302,
      pipelineStatus: 'success',
      vagrantVsixAcceptanceJobId: 14284865649,
      packageVersion: '1.3.14',
      previewVsixSha256: 'd5208f9092bd7e3c7b7c075c91fc8fbf08851e116df7bedbf1f6279985dd4f91',
      releaseExtensionJob: 'not-run-without-exact-tag',
      nextAdmittedAction: 'reassess-release-1.3.14-branch-readiness-before-exact-tag'
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

    expect(releaseStateDoc).toContain('## Release Branch Opening');
    expect(releaseStateDoc).toContain('Release branch pipeline: `2511168302` / `success`');
    expect(currentState).toContain('active release-candidate branch: `release/1.3.14`');
    expect(currentState).toContain('release-branch-opening-v1.3.14-2026-05-08.md');
    expect(informationItemMap).toContain('Release branch opening packet');
    expect(srs).toContain('governed release-branch opening');
    expect(rtm).toContain('TEST-UNIT-399');
    expect(testPlan).toContain('TEST-DOC-151');
  });
});
