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

describe('linux docker provider lane release-control packet', () => {
  it('retains the merged develop provider-lane evidence without widening the Windows claim', () => {
    const packet = readText(
      'docs/product/linux-docker-provider-lane-release-control-packet-2026-04-26.md'
    );
    const machine = readJson<any>(
      'docs/product/linux-docker-provider-lane-release-control-packet-2026-04-26.json'
    );
    const publicationState = readJson<any>('docs/product/release-publication-state.json');
    const informationItemMap = readText('docs/information-item-map.md');
    const currentState = readText('docs/product/current-state.md');

    expect(packet).toContain('Linux Docker Provider Lane Release-Control Packet');
    expect(packet).toContain('Develop pipeline | `2480195741`');
    expect(packet).toContain('Merge commit | `21774a91710b71c6b63629cc0cf3cf37ce9abc0a`');
    expect(packet).toContain('Windows installed-user LabVIEW proof community/deferred');
    expect(packet).toContain('`linux_docker_provider_lane` | `14091891709` | `success`');
    expect(packet).toContain('runtimeProvider=linux-container');
    expect(packet).toContain('runtimeEngine=labview-cli');
    expect(packet).toContain('runtimeBlockedReason=<none>');
    expect(packet).toContain('preview-evidence/vi-history-suite-1.3.10.vsix');
    expect(packet).toContain(
      'bbe08e60d3d9a0275e5f734b002d115e648ab1a75b5b2641f34d7cf9f33a2c02'
    );
    expect(packet).toContain('No public GitHub or Marketplace mutation was performed');

    expect(machine).toEqual(
      expect.objectContaining({
        schema: 'vi-history-suite/linux-docker-provider-lane-release-control-packet@v1',
        recordedAt: '2026-04-26',
        authority: expect.objectContaining({
          branch: 'develop',
          mergeRequestIid: 174,
          mergeCommitSha: '21774a91710b71c6b63629cc0cf3cf37ce9abc0a',
          sourceCommitSha: '231d1ab05fd1ec218ce367e1a1936997cfb9fa36',
          pipelineId: 2480195741,
          pipelineStatus: 'success',
          packageVersion: '1.3.10'
        }),
        claim: expect.objectContaining({
          classification: 'linux-docker-validated-preview',
          providerLane: 'admitted',
          windowsInstalledUserProofState: 'community-deferred',
          windowsInstalledUserProofDeferred: true,
          publicGitHubMutation: 'not-performed',
          marketplaceMutation: 'not-performed'
        }),
        ubuntuDockerAdmission: expect.objectContaining({
          jobId: 14091891697,
          schema: 'vi-history-suite/ubuntu-docker-runner-admission@v2',
          dockerOstype: 'linux',
          windowsLabviewProofIncluded: false
        }),
        linuxDockerProviderLane: expect.objectContaining({
          jobId: 14091891709,
          schema: 'vi-history-suite/linux-docker-provider-lane@v1',
          status: 'passed',
          providerLane: expect.objectContaining({
            selectedProviderSetting: 'docker',
            labviewVersion: '2026',
            labviewBitness: 'x64',
            runtimeProvider: 'linux-container',
            runtimeEngine: 'labview-cli',
            runtimeValidationOutcome: 'ready',
            runtimeBlockedReason: '<none>'
          }),
          docker: expect.objectContaining({
            ostype: 'linux',
            serverVersion: '29.4.1',
            driver: 'overlayfs',
            cgroupDriver: 'systemd'
          })
        }),
        previewArtifact: expect.objectContaining({
          jobId: 14091891710,
          vsixPath: 'preview-evidence/vi-history-suite-1.3.10.vsix',
          sha256: 'bbe08e60d3d9a0275e5f734b002d115e648ab1a75b5b2641f34d7cf9f33a2c02',
          sizeBytes: 998988
        })
      })
    );
    expect(machine.absentWindowsJobs).toEqual(
      expect.arrayContaining(['governed_runner_admission', 'windows_private_release_acceptance'])
    );
    expect(machine.pipelineJobs.every((job: { status: string }) => job.status === 'success')).toBe(
      true
    );
    expect(machine.publicAndMarketplaceBoundary).toMatchObject({
      publicGitHubTouched: false,
      marketplaceTouched: false,
      publicGitHubRemoteMutation: 'not-performed',
      marketplaceMutation: 'not-performed'
    });
    expect(publicationState.developPreview).toMatchObject({
      retainedPacketPath:
        'docs/product/linux-docker-provider-lane-release-control-packet-2026-04-26.md',
      retainedPacketJsonPath:
        'docs/product/linux-docker-provider-lane-release-control-packet-2026-04-26.json',
      previewEvidenceCommit: '21774a91710b71c6b63629cc0cf3cf37ce9abc0a',
      packetEvidencePipelineId: 2480195741,
      previewVsixSha256: 'bbe08e60d3d9a0275e5f734b002d115e648ab1a75b5b2641f34d7cf9f33a2c02',
      publicGitHubMutation: 'not-performed-by-this-packet',
      marketplaceMutation: 'not-performed-by-this-packet'
    });
    expect(publicationState.developPreview.currentDevelopCommit).toBeUndefined();
    expect(publicationState.developPreview.currentDevelopPipelineId).toBeUndefined();

    expect(informationItemMap).toContain('Linux Docker provider-lane release-control packet');
    expect(informationItemMap).toContain(
      'docs/product/linux-docker-provider-lane-release-control-packet-2026-04-26.json'
    );
    expect(currentState).toContain(
      'linux-docker-provider-lane-release-control-packet-2026-04-26.md'
    );
  });
});
