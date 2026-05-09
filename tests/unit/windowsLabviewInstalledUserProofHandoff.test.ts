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

describe('windows labview installed-user proof handoff', () => {
  it('keeps the deferred Windows proof handoff evidence-anchored and no-mutation', () => {
    const handoff = readText(
      'docs/product/windows-labview-installed-user-proof-handoff-2026-04-25.md'
    );
    const machine = readJson<any>(
      'docs/product/windows-labview-installed-user-proof-handoff-2026-04-25.json'
    );
    const publicationState = readJson<any>('docs/product/release-publication-state.json');
    const informationItemMap = readText('docs/information-item-map.md');
    const currentState = readText('docs/product/current-state.md');

    expect(machine).toEqual(
      expect.objectContaining({
        schema: 'vi-history-suite/windows-labview-installed-user-proof-handoff@v1',
        recordedAt: '2026-04-25',
        externalHostRequired: true,
        noMutationBoundary: expect.objectContaining({
          publicGitHubTouched: false,
          marketplaceTouched: false,
          allowedMutation: 'gitlab-authority-documentation-only',
          publicGitHubMutation: 'not-admitted',
          marketplaceMutation: 'not-admitted'
        }),
        handoffClassification: expect.objectContaining({
          activeReleaseClaimAfterHandoff:
            'linux-docker-and-linux-host-labview-validated-preview',
          windowsInstalledUserProofState: 'deferred',
          linuxHostLabviewProofState: 'admitted-local-maintainer-proof',
          linuxHostLabviewProofMayProveWindowsInstalledUserLabview: false
        })
      })
    );
    expect(machine.developPreview).toMatchObject({
      classification: 'linux-docker-and-linux-host-labview-validated-preview',
      stateRole: 'retained-provider-lane-and-linux-host-packet-evidence',
      previewEvidenceCommit: '21774a91710b71c6b63629cc0cf3cf37ce9abc0a',
      packetEvidencePipelineId: 2480195741,
      packetMergeTrackingPolicy:
        'do-not-track-packet-merge-commit; packet retention is governed by Git history and CI',
      windowsInstalledUserProofDeferred: true,
      linuxHostLabviewProofState: 'admitted-local-maintainer-proof',
      windowsInstalledUserProofState: 'community-deferred',
      linuxHostLabviewProofMayProveWindowsInstalledUserLabview: false
    });
    expect(publicationState.developPreview).toMatchObject({
      classification:
        'linux-docker-linux-host-windows-host-labview-and-vagrant-vsix-validated-preview',
      stateRole: 'retained-provider-lane-linux-host-windows-host-and-vagrant-acceptance-evidence',
      linuxHostLabviewProofState: 'admitted-local-maintainer-proof',
      windowsInstalledUserProofState: 'admitted-for-host-labview-2026-x64',
      windowsDockerDesktopProofState: 'community-deferred',
      linuxHostLabviewProofMayProveWindowsInstalledUserLabview: false
    });
    expect(publicationState.developPreview.windowsHostLabviewEvidence).toMatchObject({
      packetPath:
        'docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-windows-host-labview-2026-v1.3.12-2026-04-26.md',
      status: 'passed',
      platform: 'win32',
      runtime: {
        errorCode: 'VIHS_OK',
        validationOutcome: 'ready',
        provider: 'host-native',
        engine: 'labview-cli'
      },
      compare: {
        operation: 'CreateComparisonReport',
        exitCode: 0,
        result: 'succeeded',
        reportSizeBytes: 146915
      }
    });
    expect(machine.developPreview.currentDevelopCommit).toBeUndefined();
    expect(machine.developPreview.currentDevelopPipelineId).toBeUndefined();
    expect(machine.requiredHostShape.runnerTags).toEqual([
      'windows',
      'x64',
      'labview-host',
      'docker-windows',
      'private-release'
    ]);
    expect(machine.deferredGitLabJobs.map((job: { name: string }) => job.name)).toEqual([
      'governed_runner_admission',
      'windows_private_release_acceptance'
    ]);
    expect(machine.requiredReceipts).toEqual(
      expect.arrayContaining([
        'governed-runner-admission-evidence/runner-doctor.json',
        'windows-private-release-evidence/manifest.json',
        '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json'
      ])
    );
    expect(machine.stopRules).toEqual(
      expect.arrayContaining([
        'no-native-windows-labview-host',
        'runner-is-linux-wsl-only-or-docker-only',
        'public-github-or-marketplace-mutation-not-explicitly-admitted'
      ])
    );

    expect(handoff).toContain('No public GitHub or VS Code Marketplace mutation');
    expect(handoff).toContain('This Ubuntu/Docker machine cannot satisfy the deferred Windows proof.');
    expect(handoff).toContain('PowerShell 7 shell executor');
    expect(handoff).toContain(
      'docs/product/linux-docker-provider-lane-release-control-packet-2026-04-26.md'
    );
    expect(handoff).toContain('2480195741');
    expect(handoff).toContain('Docker Desktop switchable to Windows-container mode');
    expect(handoff).toContain('LabVIEW 2026 x64 host bundle');
    expect(handoff).toContain('npm run gitlab:runner:windows:recovery:rehearse');
    expect(handoff).toContain('VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true');
    expect(handoff).toContain('windows_private_release_acceptance');
    expect(handoff).toContain('npm run vscode:marketplace:install-proof');
    expect(handoff).toContain('preview VSIX is Linux/Docker and Linux host LabVIEW');
    expect(handoff).toContain('Linux host LabVIEW proof may prove Windows installed-user behavior: no');
    expect(handoff).toContain('Public GitHub mutation: not admitted');
    expect(handoff).toContain('VS Code Marketplace mutation: not admitted');

    expect(informationItemMap).toContain('Windows/LabVIEW installed-user proof handoff');
    expect(informationItemMap).toContain(
      'docs/product/windows-labview-installed-user-proof-handoff-2026-04-25.json'
    );
    expect(currentState).toContain(
      'windows-labview-installed-user-proof-handoff-2026-04-25.md'
    );
  });
});
