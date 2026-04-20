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
    runnerDescription: string;
    runnerId: number;
    runnerContractDoc: string;
    artifactRoot: string;
    expectedManifestPath: string;
    hostInstallState: string;
    hostApplySurface?: {
      windowsApplyScript: string;
      scheduledTaskAction: string;
      failurePolicy: string;
    };
    hostAssertionSurface?: {
      runnerAssertionWrapperScript: string;
      runnerAssertionPackageScript: string;
      windowsAssertScript: string;
      linuxAssertScript: string;
      failurePolicy: string;
    };
    coldAdmissionRuntimeCleanup?: {
      processNames: string[];
      terminationStrategy?: string[];
      failurePolicy: string;
    };
    midSessionRuntimeRecovery?: {
      laneId: string;
      trigger: string;
      retryDelayMs: number;
      maxProofRetries: number;
      firstFailureTranscript: string;
      failurePolicy: string;
    };
    firstRetainedReceipt: {
      mergeRequestIid: number;
      pipelineId: number;
      jobId: number;
      commitSha: string;
      status: string;
      queuedDurationSeconds: number;
      durationSeconds: number;
      finishedAt: string;
      webUrl: string;
      artifactsFile: string;
      artifactsSizeBytes: number;
    };
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
    expect(packetDoc).toContain('repo-controlled host asset pack and apply surfaces are versioned under');
    expect(packetDoc).toContain('scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1');
    expect(packetDoc).toContain('scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1');
    expect(packetDoc).toContain('scripts/gitlab-runner/windows/assert-governed-runner-lanes.ps1');
    expect(packetDoc).toContain('scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1');
    expect(packetDoc).toContain('scripts/assertGovernedRunnerLanes.js');
    expect(packetDoc).toContain('npm run gitlab:runner:assert');
    expect(packetDoc).toContain('without `ExecutionPolicy Bypass`');
    expect(packetDoc).toContain('governed Windows drift assertion fails closed');
    expect(packetDoc).toContain(
      'that Windows bootstrap clears stale `LabVIEW`, `LabVIEWCLI`, and'
    );
    expect(packetDoc).toContain('taskkill /PID /T /F');
    expect(packetDoc).toContain('taskkill /IM /T /F');
    expect(packetDoc).toContain('fails closed if');
    expect(packetDoc).toContain('contamination remains');
    expect(packetDoc).toContain('proof-run-pre-recovery.txt');
    expect(packetDoc).toContain('proof-runtime-recovery.txt');
    expect(packetDoc).toContain('`5000` ms');
    expect(packetDoc).toContain('repo-owned Windows proof runtime recovery script');
    expect(packetDoc).toContain('reruns the host-native proof once');
    expect(packetDoc).toContain('scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh');
    expect(packetDoc).toContain('scripts/gitlab-runner/linux/start-linux-assurance.sh');
    expect(packetDoc).toContain('scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service');
    expect(packetDoc).toContain('scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh');
    expect(packetDoc).toContain('## First Retained Runner Receipt');
    expect(packetDoc).toContain('| Merge request | `!91` |');
    expect(packetDoc).toContain('The first governed `windows_private_release_acceptance` receipt is now');

    expect(packetJson.packetId).toBe('private-release-windows-x64-v1.3.0');
    expect(packetJson.status).toBe('ready-for-private-release');
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
        runnerDescription: 'ghost',
        runnerId: 52775990,
        runnerContractDoc: 'docs/product/windows-private-release-runner-lane.md',
        artifactRoot: 'windows-private-release-evidence/',
        expectedManifestPath: 'windows-private-release-evidence/manifest.json',
        hostInstallState: 'current-user-scheduled-task-bootstrap-active',
        hostApplySurface: {
          windowsApplyScript: 'scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1',
          scheduledTaskAction:
            'powershell.exe -NoLogo -NoProfile -File "C:\\GitLab-Runner\\start-governed-runner-lanes.ps1"',
          failurePolicy: 'fail-closed-unless-exactly-one-configured-manager-after-apply'
        },
        hostAssertionSurface: {
          runnerAssertionWrapperScript: 'scripts/assertGovernedRunnerLanes.js',
          runnerAssertionPackageScript: 'npm run gitlab:runner:assert',
          windowsAssertScript: 'scripts/gitlab-runner/windows/assert-governed-runner-lanes.ps1',
          linuxAssertScript: 'scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh',
          failurePolicy: 'fail-closed-on-live-host-drift'
        },
        coldAdmissionRuntimeCleanup: {
          processNames: ['LabVIEW', 'LabVIEWCLI', 'LVCompare'],
          terminationStrategy: [
            'stop-process-force-by-pid',
            'taskkill-pid-tree',
            'taskkill-image-tree'
          ],
          failurePolicy: 'fail-closed-before-runner-start'
        },
        midSessionRuntimeRecovery: {
          laneId: 'windows-host-native',
          trigger: 'windows-host-runtime-cleanup-failed',
          recoveryScript: 'scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1',
          recoveryTranscript: 'windows-private-release-evidence/host/proof-runtime-recovery.txt',
          retryDelayMs: 5000,
          maxProofRetries: 1,
          firstFailureTranscript: 'windows-private-release-evidence/host/proof-run-pre-recovery.txt',
          failurePolicy: 'fail-closed-after-repo-recovery-script-and-single-retry'
        },
        repoOwnedOperatorAssets: {
          windowsApplyScript: 'scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1',
          windowsBootstrapScript: 'scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1',
          windowsAssertScript: 'scripts/gitlab-runner/windows/assert-governed-runner-lanes.ps1',
          windowsRecoveryScript:
            'scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1',
          linuxApplyScript: 'scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh',
          linuxHelperScript: 'scripts/gitlab-runner/linux/start-linux-assurance.sh',
          linuxServiceUnit: 'scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service',
          linuxAssertScript: 'scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh',
          runnerAssertionWrapperScript: 'scripts/assertGovernedRunnerLanes.js',
          runnerAssertionPackageScript: 'npm run gitlab:runner:assert'
        }
      })
    );
    expect(packetJson.gitlabRunnerLane.firstRetainedReceipt).toEqual({
      mergeRequestIid: 91,
      pipelineId: 2463649610,
      jobId: 13988738012,
      commitSha: 'd154a47bf1211d9a9fe8bc4c10352989780d1810',
      status: 'success',
      queuedDurationSeconds: 0.51449,
      durationSeconds: 257.909998,
      finishedAt: '2026-04-19T15:12:02.212Z',
      webUrl: 'https://gitlab.com/svelderrainruiz/vi-history-suite/-/jobs/13988738012',
      artifactsFile: 'artifacts.zip',
      artifactsSizeBytes: 1729689
    });
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
    expect(runnerLaneDoc).toContain('ghost');
    expect(runnerLaneDoc).toContain('52775990');
    expect(runnerLaneDoc).toContain('windows-private-release-evidence/manifest.json');
    expect(runnerLaneDoc).toContain('<runner-auth-token>');
  });
});
