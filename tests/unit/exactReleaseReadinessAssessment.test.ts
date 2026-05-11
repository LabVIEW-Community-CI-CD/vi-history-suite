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

describe('exact release readiness assessment', () => {
  it('refreshes the current develop line for 1.3.14 without admitting publication mutation', () => {
    const assessment = readText('docs/product/exact-release-readiness-assessment-2026-05-08.md');
    const machine = readJson<any>(
      'docs/product/exact-release-readiness-assessment-2026-05-08.json'
    );
    const publicationState = readJson<any>('docs/product/release-publication-state.json');
    const informationItemMap = readText('docs/information-item-map.md');
    const currentState = readText('docs/product/current-state.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');

    expect(assessment).toContain('Exact Release Readiness Assessment - 2026-05-08');
    expect(assessment).toContain(
      '| Exact-release readiness | `release-branch-opening-admissible` |'
    );
    expect(assessment).toContain('Assessed pipeline | `2511103937` / `success`');
    expect(assessment).toContain(
      'Assessed commit | `ce103d3d22a2d65e75dc6f5aaa75bc9e5e30c6a8`'
    );
    expect(assessment).toContain('| Candidate package line | `1.3.14` |');
    expect(assessment).toContain('| Exact tag | not admitted |');
    expect(assessment).toContain('| Public GitHub exact mutation | not admitted and not performed |');
    expect(assessment).toContain(
      '| VS Code Marketplace exact mutation | not admitted and not performed |'
    );
    expect(assessment).toContain('| `main` promotion | not admitted and not performed |');
    expect(assessment).toContain(
      '| Windows Docker Desktop Windows-container proof | community/deferred |'
    );
    expect(assessment).toContain('`linux_docker_provider_lane` | `14284448827` | `success`');
    expect(assessment).toContain(
      '`vagrant_windows_vsix_acceptance` | `14284448828` | `success`'
    );
    expect(assessment).toContain('`public_exact_pretag_proof` | `14284448826` | `success`');
    expect(assessment).toContain('runtimeProvider=linux-container');
    expect(assessment).toContain('runtimeEngine=labview-cli');
    expect(assessment).toContain('runtimeBlockedReason=<none>');
    expect(assessment).toContain('preview-evidence/vi-history-suite-1.3.14.vsix');
    expect(assessment).toContain(
      'cc3f71882328dd9d1b096860bafd49a90b7a5b6fc0c3726e363121f304c85c0f'
    );
    expect(assessment).toContain('proofExitCode=0');
    expect(assessment).toContain('runtimeExecutionState=succeeded');
    expect(assessment).toContain('generatedReportExists=true');
    expect(assessment).toContain('This assessment did not mutate public GitHub');
    expect(assessment).toContain('Open a governed `release/1.3.14` branch only as a separate action');

    expect(machine).toEqual(
      expect.objectContaining({
        schema: 'vi-history-suite/exact-release-readiness-assessment@v1',
        recordedAt: '2026-05-08',
        supersedesCurrentAssessmentPath:
          'docs/product/exact-release-readiness-assessment-2026-04-26.md',
        authority: expect.objectContaining({
          branch: 'develop',
          assessedCommitSha: 'ce103d3d22a2d65e75dc6f5aaa75bc9e5e30c6a8',
          pipelineId: 2511103937,
          pipelineStatus: 'success',
          packageVersion: '1.3.14'
        }),
        verdict: expect.objectContaining({
          exactReleaseReadiness: 'release-branch-opening-admissible',
          currentAdmissibleClaim:
            'develop-candidate-release-readiness-consolidated-no-exact-publication',
          releaseBranch: 'not-opened-by-this-assessment',
          exactTag: 'not-admitted',
          publicGitHubExactMutation: 'not-admitted-and-not-performed',
          marketplaceExactMutation: 'not-admitted-and-not-performed',
          mainPromotion: 'not-admitted-and-not-performed',
          windowsInstalledUserLabviewProof: 'admitted-for-host-labview-2026-x64',
          vagrantVsixAcceptance: 'protected-develop-ci-receipt-retained',
          windowsDockerDesktopWindowsContainerProof: 'community-deferred'
        }),
        retainedBaseline: expect.objectContaining({
          exactTag: 'v1.3.9',
          regularMarketplaceVersion: '1.3.9',
          publicGitHubReleaseId: 312994104
        }),
        activePreview: expect.objectContaining({
          packageVersion: '1.3.14',
          linuxDockerClaim: 'admitted-linux-docker-provider-lane',
          windowsHostLabviewProofState: 'admitted-for-host-labview-2026-x64',
          vagrantVsixAcceptanceState: 'protected-develop-ci-receipt-retained',
          windowsDockerDesktopProofState: 'community-deferred'
        }),
        linuxDockerProviderLane: expect.objectContaining({
          jobId: 14284448827,
          status: 'passed',
          providerLane: expect.objectContaining({
            selectedProviderSetting: 'docker',
            labviewVersion: '2026',
            labviewBitness: 'x64',
            runtimeProvider: 'linux-container',
            runtimeEngine: 'labview-cli',
            runtimeValidationOutcome: 'ready',
            runtimeBlockedReason: '<none>'
          })
        }),
        vagrantVsixAcceptance: expect.objectContaining({
          jobId: 14284448828,
          runDirectory: 'vagrant/evidence/20260508-113126',
          manifestPath: 'vagrant/evidence/20260508-113126/manifest.json',
          assertionReceiptPath:
            'vagrant/evidence/assertion/vagrant-vsix-acceptance-assertion.json',
          harnessId: 'HARNESS-VHS-002',
          selectedHash: '8741bb08026c104100720c0ef48621e4ab7762fd',
          baseHash: 'c188cdec606aac3b17d8b17274baa19eef3e4017',
          labviewVersion: '2026',
          labviewBitness: 'x86',
          proofExitCode: 0,
          runtimeProvider: 'host-native',
          runtimeEngine: 'labview-cli',
          runtimeExecutionState: 'succeeded',
          generatedReportExists: true,
          claimBoundary:
            'vagrant-vsix-acceptance-only; does-not-replace-native-windows-x64-private-release-or-windows-container-proof'
        }),
        previewArtifact: expect.objectContaining({
          jobId: 14284448829,
          vsixPath: 'preview-evidence/vi-history-suite-1.3.14.vsix',
          sha256: 'cc3f71882328dd9d1b096860bafd49a90b7a5b6fc0c3726e363121f304c85c0f',
          sizeBytes: 1011604,
          releaseUse: 'preview-only-not-exact-release-artifact'
        })
      })
    );
    expect(machine.pipelineJobs.every((job: { status: string }) => job.status === 'success')).toBe(
      true
    );
    expect(machine.blockingOrDeferredGates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'release-branch',
          status: 'not-opened-by-this-assessment'
        }),
        expect.objectContaining({
          id: 'exact-tag',
          status: 'not-admitted'
        }),
        expect.objectContaining({
          id: 'windows-exact-vsix-install-proof',
          status: 'missing-for-selected-1.3.14-exact-authority-vsix'
        }),
        expect.objectContaining({
          id: 'windows-docker-desktop-windows-container-proof',
          status: 'community-deferred'
        }),
        expect.objectContaining({
          id: 'main-promotion',
          status: 'not-admitted'
        })
      ])
    );
    expect(machine.noMutationBoundary).toMatchObject({
      publicGitHubTouched: false,
      marketplaceTouched: false,
      publicGitHubExactReleaseMutation: 'not-performed',
      publicGitHubTagMutation: 'not-performed',
      marketplaceExactMutation: 'not-performed',
      exactTagCreated: false,
      releaseBranchCreated: false,
      mainPromoted: false
    });

    expect(publicationState.exactReleaseReadinessAssessment).toMatchObject({
      status: 'release-branch-opening-admissible',
      assessmentPath: 'docs/product/exact-release-readiness-assessment-2026-05-08.md',
      assessmentJsonPath: 'docs/product/exact-release-readiness-assessment-2026-05-08.json',
      assessedCommit: 'ce103d3d22a2d65e75dc6f5aaa75bc9e5e30c6a8',
      assessedPipelineId: 2511103937,
      packageVersion: '1.3.14',
      currentAdmissibleClaim:
        'develop-candidate-release-readiness-consolidated-no-exact-publication',
      blockingReason: null,
      releaseBranchOpening: 'admissible-as-separate-governed-action',
      windowsInstalledUserLabviewProofState: 'admitted-for-host-labview-2026-x64',
      vagrantVsixAcceptanceState: 'protected-develop-ci-receipt-retained',
      windowsDockerDesktopProofState: 'community-deferred',
      previewVsixSha256: 'cc3f71882328dd9d1b096860bafd49a90b7a5b6fc0c3726e363121f304c85c0f',
      windowsExactVsixInstallProofState:
        'missing-for-selected-1.3.14-exact-authority-vsix',
      publicGitHubExactMutation: 'not-admitted-and-not-performed',
      marketplaceExactMutation: 'not-admitted-and-not-performed',
      mainPromotion: 'not-admitted-and-not-performed'
    });
    expect(informationItemMap).toContain('exact-release-readiness-assessment-2026-05-08.md');
    expect(informationItemMap).toContain('pipeline `2511103937`');
    expect(currentState).toContain('exact-release-readiness-assessment-2026-05-08.md');
    expect(currentState).toContain('historical readiness assessments for `v1.3.14`');
    expect(currentState).toContain('`release/1.3.15` branch opening remain retained');
    expect(currentState).toContain('exact `v1.3.15` is now');
    expect(currentState).toContain(
      '`open-release-1.3.16-after-protected-develop-candidate-pipeline`'
    );
    expect(srs).toContain('exact-release-readiness-assessment-2026-05-08.md');
    expect(srs).toContain('current `1.3.14` exact-release readiness verdict');
    expect(rtm).toContain('exact-release-readiness-assessment-2026-05-08.md');
    expect(rtm).toContain(
      'TEST-UNIT-388; TEST-UNIT-389; TEST-UNIT-390; TEST-UNIT-399; TEST-UNIT-400; TEST-DOC-133; TEST-DOC-141; TEST-DOC-142; TEST-DOC-143; TEST-DOC-151; TEST-DOC-152'
    );
    expect(testPlan).toContain('TEST-UNIT-388');
    expect(testPlan).toContain('TEST-DOC-141');
    expect(testPlan).toContain('`1.3.14` release-branch-opening-admissible');
  });
});
