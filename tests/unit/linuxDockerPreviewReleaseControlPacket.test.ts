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

describe('linux docker preview release-control packet', () => {
  it('retains the post-merge develop preview evidence without widening the Windows claim', () => {
    const packet = readText(
      'docs/product/linux-docker-preview-release-control-packet-2026-04-25.md'
    );
    const machine = readJson<any>(
      'docs/product/linux-docker-preview-release-control-packet-2026-04-25.json'
    );
    const informationItemMap = readText('docs/information-item-map.md');
    const currentState = readText('docs/product/current-state.md');

    expect(packet).toContain('Linux/Docker validated preview');
    expect(packet).toContain('Windows installed-user proof deferred');
    expect(packet).toContain('Develop pipeline | `2479854355`');
    expect(packet).toContain('Merge commit | `5c85f0595065d62d4b2679a3df4bb21ba749d71a`');
    expect(packet).toContain('`ubuntu_docker_runner_admission` | `14090503645` | `success`');
    expect(packet).toContain('`package_extension_preview` | `14090503657` | `success`');
    expect(packet).toContain('No `governed_runner_admission` or `windows_private_release_acceptance` job was');
    expect(packet).toContain('preview-evidence/vi-history-suite-1.3.9.vsix');
    expect(packet).toContain(
      '7179df117c5b3c9032afbacb0b7c4a24f81229f3fbc0fd99f3ac0ed66a4c7470'
    );
    expect(packet).toContain('Public GitHub production mutation: not admitted');
    expect(packet).toContain('Marketplace production mutation: not admitted');

    expect(machine).toEqual(
      expect.objectContaining({
        schema: 'vi-history-suite/linux-docker-preview-release-control-packet@v1',
        recordedAt: '2026-04-25',
        authority: expect.objectContaining({
          branch: 'develop',
          mergeRequestIid: 164,
          mergeCommitSha: '5c85f0595065d62d4b2679a3df4bb21ba749d71a',
          pipelineId: 2479854355,
          pipelineStatus: 'success',
          packageVersion: '1.3.9'
        }),
        claim: expect.objectContaining({
          classification: 'linux-docker-validated-preview',
          windowsInstalledUserProofDeferred: true,
          windowsLabviewProofRequiredForPreview: false,
          windowsLabviewProofRequiredForWindowsClaim: true,
          publicGitHubMutation: 'not-admitted',
          marketplaceMutation: 'not-admitted'
        }),
        ubuntuDockerAdmission: expect.objectContaining({
          schema: 'vi-history-suite/ubuntu-docker-runner-admission@v2',
          claimScope: 'linux-docker-validated-preview',
          dockerOstype: 'linux',
          windowsLabviewProofIncluded: false
        }),
        previewArtifact: expect.objectContaining({
          vsixPath: 'preview-evidence/vi-history-suite-1.3.9.vsix',
          sha256: '7179df117c5b3c9032afbacb0b7c4a24f81229f3fbc0fd99f3ac0ed66a4c7470',
          sizeBytes: 997943
        })
      })
    );
    expect(machine.absentWindowsJobs).toEqual(
      expect.arrayContaining(['governed_runner_admission', 'windows_private_release_acceptance'])
    );
    expect(machine.pipelineJobs.map((job: { status: string }) => job.status)).toEqual(
      expect.arrayContaining(['success'])
    );
    expect(machine.pipelineJobs.every((job: { status: string }) => job.status === 'success')).toBe(
      true
    );
    expect(informationItemMap).toContain('Linux/Docker preview release-control packet');
    expect(informationItemMap).toContain(
      'docs/product/linux-docker-preview-release-control-packet-2026-04-25.json'
    );
    expect(informationItemMap).toContain(
      'linux-docker-preview-release-control-packet-2026-04-25.md'
    );
  });
});
