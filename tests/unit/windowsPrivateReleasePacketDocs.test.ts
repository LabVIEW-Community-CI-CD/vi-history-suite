import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

interface PrivateReleasePacket {
  packetId: string;
  status: string;
  scope: {
    supportClaim: string;
    supportedProofLanes: string[];
    nonScope: string[];
  };
  governingSequence: {
    docsBranch: {
      name: string;
      mergedBaselineCommit: string;
    };
    prepBranch: {
      name: string;
      packageAuditBaselineCommit: string;
    };
    nextDeferredBranch: string;
  };
  packageEvidence: {
    versionLine: string;
    vsixPath: string;
    sha256: string;
    sizeBytes: number;
  };
  proofLanes: Array<{
    laneId: string;
    status: string;
    retainedRoot: string;
  }>;
  gitlabRunnerLane: {
    jobName: string;
    governedCli: string;
    governedScript: string;
    runnerContractDoc: string;
    artifactRoot: string;
    expectedManifestPath: string;
    hostInstallState: string;
  };
}

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('windows private release packet docs', () => {
  it('retains the tracked Windows-only private-release packet and links it into the control plane', () => {
    const packetDoc = readText('docs/product/private-release-windows-x64-v1.3.0.md');
    const packetJson = readJson<PrivateReleasePacket>('docs/product/private-release-windows-x64-v1.3.0.json');
    const currentState = readText('docs/product/current-state.md');
    const informationItemMap = readText('docs/information-item-map.md');
    const releaseProcedure = readText('docs/release-procedure.md');
    const runnerLaneDoc = readText('docs/product/windows-private-release-runner-lane.md');

    expect(packetDoc).toContain('# Windows x64 Private-Release Packet `v1.3.0`');
    expect(packetDoc).toContain('Windows x64 private release only');
    expect(packetDoc).toContain('feature/windows-private-release-docs-26514');
    expect(packetDoc).toContain('feature/windows-private-release-prep');
    expect(packetDoc).toContain('feature/linux-runtime-variant');
    expect(packetDoc).toContain('preview-evidence/vi-history-suite-1.3.0.vsix');
    expect(packetDoc).toContain('.cache/private-release/1.3.0/windows-x64-host/');
    expect(packetDoc).toContain('.cache/private-release/1.3.0/windows-x64-container/');
    expect(packetDoc).toContain('WSL as part of the active user or proof contract');
    expect(packetDoc).toContain('windows_private_release_acceptance');
    expect(packetDoc).toContain('windows-private-release-evidence/');

    expect(packetJson.packetId).toBe('private-release-windows-x64-v1.3.0');
    expect(packetJson.status).toBe('runner-lane-defined-pending-host-registration');
    expect(packetJson.scope.supportClaim).toBe('windows-x64-private-release-only');
    expect(packetJson.scope.supportedProofLanes).toEqual([
      'windows-host-native',
      'windows-container'
    ]);
    expect(packetJson.scope.nonScope).toContain('wsl-active-support');
    expect(packetJson.governingSequence.docsBranch.name).toBe('feature/windows-private-release-docs-26514');
    expect(packetJson.governingSequence.prepBranch.name).toBe('feature/windows-private-release-prep');
    expect(packetJson.governingSequence.nextDeferredBranch).toBe('feature/linux-runtime-variant');
    expect(packetJson.packageEvidence.versionLine).toBe('1.3.0');
    expect(packetJson.packageEvidence.vsixPath).toBe('preview-evidence/vi-history-suite-1.3.0.vsix');
    expect(packetJson.packageEvidence.sha256).toBe(
      '3092C9B740F13AC31FDEABCE00822FBDA13A3C7C6AEF0261D92EA38051751ACA'
    );
    expect(packetJson.packageEvidence.sizeBytes).toBe(497392);
    expect(packetJson.gitlabRunnerLane).toEqual(
      expect.objectContaining({
        jobName: 'windows_private_release_acceptance',
        governedCli: 'npm run acceptance:windows:private-release',
        governedScript: 'scripts/runWindowsPrivateReleaseAcceptance.js',
        runnerContractDoc: 'docs/product/windows-private-release-runner-lane.md',
        artifactRoot: 'windows-private-release-evidence/',
        expectedManifestPath: 'windows-private-release-evidence/manifest.json',
        hostInstallState: 'manual-registration-pending'
      })
    );
    expect(packetJson.proofLanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          laneId: 'windows-host-x64',
          status: 'succeeded',
          retainedRoot: '.cache/private-release/1.3.0/windows-x64-host/'
        }),
        expect.objectContaining({
          laneId: 'windows-container-x64',
          status: 'succeeded',
          retainedRoot: '.cache/private-release/1.3.0/windows-x64-container/'
        })
      ])
    );

    expect(currentState).toContain('[Windows x64 Private-Release Packet](./private-release-windows-x64-v1.3.0.md)');
    expect(currentState).toContain('[Windows x64 Private-Release Packet JSON](./private-release-windows-x64-v1.3.0.json)');
    expect(currentState).toContain('[windows-private-release-runner-lane.md](./windows-private-release-runner-lane.md)');
    expect(currentState).toContain('private-release-windows-x64-v1.3.0.md');
    expect(currentState).toContain('windows_private_release_acceptance');
    expect(currentState).toContain('windows-private-release-evidence/');

    expect(informationItemMap).toContain(
      '| Windows x64 private-release packet | `docs/product/private-release-windows-x64-v1.3.0.md` |'
    );
    expect(informationItemMap).toContain(
      '| Machine-readable Windows x64 private-release packet | `docs/product/private-release-windows-x64-v1.3.0.json` |'
    );
    expect(informationItemMap).toContain(
      '| Windows private-release runner lane | `docs/product/windows-private-release-runner-lane.md` |'
    );

    expect(releaseProcedure).toContain('docs/product/private-release-windows-x64-v1.3.0.md');
    expect(releaseProcedure).toContain('docs/product/private-release-windows-x64-v1.3.0.json');
    expect(releaseProcedure).toContain('docs/product/windows-private-release-runner-lane.md');

    expect(runnerLaneDoc).toContain('# Windows Private-Release Runner Lane');
    expect(runnerLaneDoc).toContain('windows_private_release_acceptance');
    expect(runnerLaneDoc).toContain('npm run acceptance:windows:private-release');
    expect(runnerLaneDoc).toContain('ghost-vihs-windows-private-release');
    expect(runnerLaneDoc).toContain('windows-private-release-evidence/manifest.json');
    expect(runnerLaneDoc).toContain('<runner-auth-token>');
  });
});
