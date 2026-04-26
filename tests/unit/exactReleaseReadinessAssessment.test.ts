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
  it('keeps the current develop line blocked for exact release while Windows proof is deferred', () => {
    const assessment = readText('docs/product/exact-release-readiness-assessment-2026-04-26.md');
    const machine = readJson<any>(
      'docs/product/exact-release-readiness-assessment-2026-04-26.json'
    );
    const publicationState = readJson<any>('docs/product/release-publication-state.json');
    const informationItemMap = readText('docs/information-item-map.md');
    const currentState = readText('docs/product/current-state.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');

    expect(assessment).toContain('Exact Release Readiness Assessment - 2026-04-26');
    expect(assessment).toContain('| Exact-release readiness | `blocked` |');
    expect(assessment).toContain('Assessed pipeline | `2480212103` / `success`');
    expect(assessment).toContain(
      'Assessed commit | `42d1f581874c9fad8f6dcbc96c8827bb07e3b508`'
    );
    expect(assessment).toContain('Windows installed-user LabVIEW proof | community/deferred');
    expect(assessment).toContain('`linux_docker_provider_lane` | `14091956354` | `success`');
    expect(assessment).toContain('`public_exact_pretag_proof` | `14091956353` | `success`');
    expect(assessment).toContain('runtimeProvider=linux-container');
    expect(assessment).toContain('runtimeEngine=labview-cli');
    expect(assessment).toContain('runtimeBlockedReason=<none>');
    expect(assessment).toContain('preview-evidence/vi-history-suite-1.3.10.vsix');
    expect(assessment).toContain(
      'f516b8ebec261c854e9e6d048a92ce8cb6f67a04114b9da945b916e37b0621a6'
    );
    expect(assessment).toContain('No `governed_runner_admission` or `windows_private_release_acceptance` job');
    expect(assessment).toContain('Community Proof Intake Checklist');
    expect(assessment).toContain(
      'docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.md'
    );
    expect(assessment).toContain('Community-deferred claim');
    expect(assessment).toContain('This assessment did not mutate public GitHub or VS Code Marketplace');

    expect(machine).toEqual(
      expect.objectContaining({
        schema: 'vi-history-suite/exact-release-readiness-assessment@v1',
        recordedAt: '2026-04-26',
        authority: expect.objectContaining({
          branch: 'develop',
          assessedCommitSha: '42d1f581874c9fad8f6dcbc96c8827bb07e3b508',
          pipelineId: 2480212103,
          pipelineStatus: 'success',
          packageVersion: '1.3.10'
        }),
        verdict: expect.objectContaining({
          exactReleaseReadiness: 'blocked',
          currentAdmissibleClaim: 'linux-docker-validated-preview-only',
          releaseBranch: 'not-open',
          exactTag: 'not-admitted',
          publicGitHubExactMutation: 'not-admitted-and-not-performed',
          marketplaceExactMutation: 'not-admitted-and-not-performed',
          windowsInstalledUserLabviewProof: 'community-deferred'
        }),
        retainedBaseline: expect.objectContaining({
          exactTag: 'v1.3.9',
          regularMarketplaceVersion: '1.3.9',
          publicGitHubReleaseId: 312994104
        }),
        activePreview: expect.objectContaining({
          packageVersion: '1.3.10',
          marketplacePublicationKind: 'community-validation-pre-release',
          linuxDockerClaim: 'linux-docker-validated-preview',
          windowsProofState: 'community-deferred'
        }),
        linuxDockerProviderLane: expect.objectContaining({
          jobId: 14091956354,
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
        previewArtifact: expect.objectContaining({
          jobId: 14091956355,
          vsixPath: 'preview-evidence/vi-history-suite-1.3.10.vsix',
          sha256: 'f516b8ebec261c854e9e6d048a92ce8cb6f67a04114b9da945b916e37b0621a6',
          sizeBytes: 998988,
          releaseUse: 'preview-only-not-exact-release-artifact'
        }),
        communityProofIntakeChecklist: expect.objectContaining({
          path: 'docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.md',
          jsonPath:
            'docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.json',
          status: 'prepared-no-mutation',
          candidateAdmissionPaths: ['windows-proof-claim', 'community-deferred-claim'],
          communityReportsBecomeMaintainerProofAutomatically: false,
          linuxDockerEvidenceMayProveWindowsLabviewInstalledUserBehavior: false
        })
      })
    );
    expect(machine.pipelineJobs.every((job: { status: string }) => job.status === 'success')).toBe(
      true
    );
    expect(machine.blockingOrDeferredGates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'windows-installed-user-labview-proof',
          status: 'community-deferred'
        }),
        expect.objectContaining({
          id: 'windows-exact-vsix-install-proof',
          status: 'missing-for-1.3.10'
        }),
        expect.objectContaining({
          id: 'marketplace-exact-release',
          status: 'not-admitted'
        })
      ])
    );
    expect(machine.noMutationBoundary).toMatchObject({
      publicGitHubTouched: false,
      marketplaceTouched: false,
      publicGitHubExactReleaseMutation: 'not-performed',
      publicGitHubTagMutation: 'not-performed',
      marketplaceExactMutation: 'not-performed'
    });

    expect(publicationState.exactReleaseReadinessAssessment).toMatchObject({
      status: 'blocked',
      assessmentPath: 'docs/product/exact-release-readiness-assessment-2026-04-26.md',
      assessmentJsonPath: 'docs/product/exact-release-readiness-assessment-2026-04-26.json',
      assessedCommit: '42d1f581874c9fad8f6dcbc96c8827bb07e3b508',
      assessedPipelineId: 2480212103,
      packageVersion: '1.3.10',
      currentAdmissibleClaim: 'linux-docker-validated-preview-only',
      blockingReason: 'missing-native-windows-installed-user-labview-proof-for-1.3.10',
      windowsInstalledUserLabviewProofState: 'community-deferred',
      previewVsixSha256: 'f516b8ebec261c854e9e6d048a92ce8cb6f67a04114b9da945b916e37b0621a6',
      communityProofIntakeChecklistPath:
        'docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.md',
      communityProofIntakeChecklistJsonPath:
        'docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.json'
    });
    expect(informationItemMap).toContain('Exact release readiness assessment');
    expect(informationItemMap).toContain('Windows/LabVIEW community proof intake checklist');
    expect(currentState).toContain('exact-release-readiness-assessment-2026-04-26.md');
    expect(currentState).toContain('current exact-release readiness verdict');
    expect(currentState).toContain(
      'windows-labview-community-proof-intake-checklist-2026-04-26.md'
    );
    expect(srs).toContain('exact-release readiness');
    expect(rtm).toContain(
      'TEST-UNIT-388; TEST-UNIT-389; TEST-DOC-133; TEST-DOC-141; TEST-DOC-142'
    );
    expect(testPlan).toContain('TEST-UNIT-388');
    expect(testPlan).toContain('TEST-UNIT-389');
    expect(testPlan).toContain('TEST-DOC-141');
    expect(testPlan).toContain('TEST-DOC-142');
  });
});
