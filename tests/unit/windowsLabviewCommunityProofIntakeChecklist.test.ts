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

describe('Windows/LabVIEW community proof intake checklist', () => {
  it('retains the external proof intake path without turning community reports into admitted proof', () => {
    const checklist = readText(
      'docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.md'
    );
    const machine = readJson<any>(
      'docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.json'
    );
    const publicationState = readJson<any>('docs/product/release-publication-state.json');
    const assessment = readJson<any>(
      'docs/product/exact-release-readiness-assessment-2026-04-26.json'
    );
    const informationItemMap = readText('docs/information-item-map.md');
    const currentState = readText('docs/product/current-state.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');

    expect(checklist).toContain('Windows/LabVIEW Community Proof Intake Checklist - 2026-04-26');
    expect(checklist).toContain('turning the blocked `1.3.10` exact-release readiness assessment');
    expect(checklist).toContain('Windows-proof claim');
    expect(checklist).toContain('Community-deferred claim');
    expect(checklist).toContain('Linux/Docker evidence must not be used as proof');
    expect(checklist).toContain('code --list-extensions --show-versions');
    expect(checklist).toContain('vihs --validate');
    expect(checklist).toContain('where.exe LabVIEWCLI.exe');
    expect(checklist).toContain("docker info --format '{{.OSType}}'");
    expect(checklist).toContain('`admitted-proof`');
    expect(checklist).toContain('This checklist mutates only GitLab authority documentation and tests');

    expect(machine).toEqual(
      expect.objectContaining({
        schema: 'vi-history-suite/windows-labview-community-proof-intake-checklist@v1',
        recordedAt: '2026-04-26',
        status: 'prepared-no-mutation',
        authority: expect.objectContaining({
          integrationBranch: 'develop',
          checklistPreparedFromDevelopCommit: '3c0404a5cc51f3e131dfb29474fb36a338aec4ec',
          packageVersion: '1.3.10'
        }),
        sourceReadinessAssessment: expect.objectContaining({
          path: 'docs/product/exact-release-readiness-assessment-2026-04-26.md',
          status: 'blocked',
          assessedCommit: '42d1f581874c9fad8f6dcbc96c8827bb07e3b508',
          assessedPipelineId: 2480212103,
          currentAdmissibleClaim: 'linux-docker-validated-preview-only',
          blockingReason: 'missing-native-windows-installed-user-labview-proof-for-1.3.10'
        }),
        activePreview: expect.objectContaining({
          packageVersion: '1.3.10',
          marketplacePublicationKind: 'community-validation-pre-release',
          linuxDockerClaim: 'linux-docker-validated-preview',
          windowsLabviewProofState: 'community-deferred',
          previewVsixSha256: 'f516b8ebec261c854e9e6d048a92ce8cb6f67a04114b9da945b916e37b0621a6'
        }),
        claimBoundary: expect.objectContaining({
          communityReportsBecomeMaintainerProofAutomatically: false,
          selectableFeaturePolicy: 'selectable-with-proof-status-disclosure',
          linuxDockerEvidenceMayProveWindowsLabviewInstalledUserBehavior: false,
          publicGitHubMutationAdmitted: false,
          marketplaceMutationAdmitted: false
        })
      })
    );

    expect(machine.candidateAdmissionPaths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'windows-proof-claim',
          admissibleWhen: expect.arrayContaining([
            'governed_runner_admission-succeeded-and-retained',
            'windows_private_release_acceptance-succeeded-and-retained',
            'windows-exact-vsix-install-proof-succeeded-for-selected-exact-vsix'
          ])
        }),
        expect.objectContaining({
          id: 'community-deferred-claim',
          admissibleWhen: expect.arrayContaining([
            'exact-release-claim-is-explicitly-narrowed',
            'windows-labview-installed-user-proof-is-stated-as-community-deferred',
            'no-windows-installed-user-proof-claim-is-made'
          ])
        })
      ])
    );

    expect(machine.requiredCommunityReportPackage.requiredCommands).toEqual(
      expect.arrayContaining([
        'code --version',
        'code --list-extensions --show-versions',
        'Get-Command vihs',
        'where.exe vihs',
        'vihs',
        'vihs --validate'
      ])
    );
    expect(machine.requiredCommunityReportPackage.hostLabviewCommandsWhenRelevant).toEqual(
      expect.arrayContaining(['Get-Command LabVIEWCLI.exe', 'where.exe LabVIEWCLI.exe'])
    );
    expect(machine.requiredCommunityReportPackage.dockerCommandsWhenRelevant).toEqual(
      expect.arrayContaining([
        'docker version',
        "docker info --format '{{.OSType}}'",
        'docker context show'
      ])
    );
    expect(machine.requiredCommunityReportPackage.doNotCollect).toEqual(
      expect.arrayContaining(['PATs', 'Marketplace-PATs', 'proprietary-VI-contents'])
    );
    expect(machine.proofStatusLadder.map((entry: { status: string }) => entry.status)).toEqual([
      'community-reported',
      'intake-complete',
      'needs-more-evidence',
      'maintainer-reproduction-pending',
      'maintainer-reproduced',
      'admitted-proof',
      'deferred-no-host',
      'rejected-insufficient-evidence'
    ]);
    expect(machine.triageLoop.map((entry: { step: string }) => entry.step)).toEqual([
      'capture-intake',
      'sanitize',
      'verify-completeness',
      'classify-execution-surface',
      'assign-proof-status',
      'decide-candidate-path',
      'run-admitted-proof-lanes-if-windows-claim-selected',
      'update-authority-docs',
      'reassess-exact-release-readiness'
    ]);
    expect(machine.candidateAdmissionChecklist.allPaths).toEqual(
      expect.arrayContaining([
        'selected-exact-authority-vsix-path-and-sha256',
        'release-branch-pipeline-id-status-and-job-list',
        'traceability-matrix-proven-selectable-deferred-unsupported-boundary',
        'separate-public-github-and-marketplace-exact-mutation-gates'
      ])
    );
    expect(machine.candidateAdmissionChecklist.communityDeferredClaimAdditional).toEqual(
      expect.arrayContaining([
        'explicit-release-claim-that-windows-labview-installed-user-behavior-is-not-maintainer-proven',
        'stop-rule-against-windows-proof-claim-from-linux-docker-or-unreproduced-community-reports'
      ])
    );
    expect(machine.stopRules).toEqual(
      expect.arrayContaining([
        'linux-docker-evidence-used-as-windows-labview-installed-user-proof',
        'community-reported-evidence-treated-as-maintainer-proof',
        'public-github-or-marketplace-exact-mutation-treated-as-admitted-by-this-checklist'
      ])
    );
    expect(machine.noMutationBoundary).toMatchObject({
      gitlabAuthorityDocsAndTestsOnly: true,
      publicGitHubSourceTouched: false,
      publicGitHubReleaseMutation: 'not-performed',
      publicGitHubTagMutation: 'not-performed',
      publicGitHubWikiMutation: 'not-performed',
      marketplaceMutation: 'not-performed'
    });

    expect(publicationState.windowsLabviewCommunityProofIntakeChecklist).toMatchObject({
      status: 'prepared-no-mutation',
      path: 'docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.md',
      jsonPath: 'docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.json',
      preparedFromDevelopCommit: '3c0404a5cc51f3e131dfb29474fb36a338aec4ec',
      sourceAssessedPipelineId: 2480212103,
      packageVersion: '1.3.10',
      communityReportsBecomeMaintainerProofAutomatically: false,
      linuxDockerEvidenceMayProveWindowsLabviewInstalledUserBehavior: false,
      publicGitHubMutation: 'not-performed',
      marketplaceMutation: 'not-performed'
    });
    expect(publicationState.exactReleaseReadinessAssessment).toMatchObject({
      communityProofIntakeChecklistPath:
        'docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.md',
      communityProofIntakeChecklistJsonPath:
        'docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.json',
      exactCandidateConversionPaths: [
        'open-governed-release-1.3.14-branch-with-current-evidence-boundary',
        'reassess-release-branch-before-exact-tag',
        'retain-selected-exact-authority-vsix-before-public-exact-release'
      ]
    });
    expect(assessment.communityProofIntakeChecklist).toMatchObject({
      status: 'prepared-no-mutation',
      candidateAdmissionPaths: ['windows-proof-claim', 'community-deferred-claim'],
      communityReportsBecomeMaintainerProofAutomatically: false,
      linuxDockerEvidenceMayProveWindowsLabviewInstalledUserBehavior: false
    });

    expect(informationItemMap).toContain('Windows/LabVIEW community proof intake checklist');
    expect(currentState).toContain('current external Windows/LabVIEW community proof intake checklist');
    expect(srs).toContain('external/community Windows/LabVIEW proof intake');
    expect(rtm).toContain(
      'TEST-UNIT-388; TEST-UNIT-389; TEST-UNIT-390; TEST-UNIT-399; TEST-UNIT-400; TEST-DOC-133; TEST-DOC-141; TEST-DOC-142; TEST-DOC-143; TEST-DOC-151; TEST-DOC-152'
    );
    expect(testPlan).toContain('TEST-UNIT-389');
    expect(testPlan).toContain('TEST-DOC-142');
  });
});
