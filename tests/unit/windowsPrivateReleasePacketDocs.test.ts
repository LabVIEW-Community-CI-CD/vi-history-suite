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
    publicationBranch: {
      name: string;
      publishedSourceCommit: string;
    };
    nextDeferredBranch: string;
  };
  packageEvidence: {
    versionLine: string;
    vsixPath: string;
    sha256: string;
    sizeBytes: number;
  };
  publication?: {
    status: string;
    releaseChannel: string;
    releaseTag: string;
    releaseName: string;
    releaseUrl: string;
    publishCommand: string;
    sourceBranch: string;
    sourceCommit: string;
    vsixDirectAssetUrl: string;
    checksumDirectAssetUrl: string;
    publishReceipt: string;
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
    midSessionRecoveryRehearsal?: {
      governedScript: string;
      packageScript: string;
      receiptRoot: string;
      latestReceipt: string;
      requestedLabviewVersion: string;
      requestedLabviewBitness: string;
      contaminationSeedMode: string;
      recoveryTranscriptLeaf: string;
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
    expect(packetDoc).toContain('feature/windows-private-release-v1.3.0-refresh');
    expect(packetDoc).toContain('feature/linux-runtime-variant');
    expect(packetDoc).toContain('preview-evidence/vi-history-suite-1.3.0.vsix');
    expect(packetDoc).toContain('.cache/private-release/1.3.0/windows-x64-host/');
    expect(packetDoc).toContain('.cache/private-release/1.3.0/windows-x64-container/');
    expect(packetDoc).toContain('Windows x86 / 32-bit LabVIEW release support');
    expect(packetDoc).toContain('WSL as part of the active user or proof contract');
    expect(packetDoc).toContain('windows_private_release_acceptance');
    expect(packetDoc).toContain('windows-private-release-evidence/');
    expect(packetDoc).toContain('repo-controlled host asset pack and apply surfaces are versioned under');
    expect(packetDoc).toContain('scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1');
    expect(packetDoc).toContain('scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1');
    expect(packetDoc).toContain('scripts/gitlab-runner/windows/doctor-governed-runner-lanes.ps1');
    expect(packetDoc).toContain('scripts/gitlab-runner/windows/assert-governed-runner-lanes.ps1');
    expect(packetDoc).toContain('scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1');
    expect(packetDoc).toContain('scripts/runWindowsProofRuntimeRecoveryRehearsal.js');
    expect(packetDoc).toContain('scripts/assertGovernedRunnerLanes.js');
    expect(packetDoc).toContain('npm run gitlab:runner:assert');
    expect(packetDoc).toContain('npm run gitlab:runner:windows:recovery:rehearse');
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
    expect(packetDoc).toContain('.cache/windows-proof-runtime-recovery-rehearsal/latest.json');
    expect(packetDoc).toContain('headless LabVIEW contamination');
    expect(packetDoc).toContain('scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh');
    expect(packetDoc).toContain('scripts/gitlab-runner/linux/start-linux-assurance.sh');
    expect(packetDoc).toContain('scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh');
    expect(packetDoc).toContain('scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service');
    expect(packetDoc).toContain('scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh');
    expect(packetDoc).toContain('scripts/doctorGovernedRunnerLanes.js');
    expect(packetDoc).toContain('npm run gitlab:runner:doctor');
    expect(packetDoc).toContain('governed_runner_admission');
    expect(packetDoc).toContain('C:\\GitLab-Runner\\receipts\\governed-runner-startup\\latest.json');
    expect(packetDoc).toContain('$HOME/.gitlab-runner/receipts/linux-assurance-startup/latest.json');
    expect(packetDoc).toContain('## Private Release Publication');
    expect(packetDoc).toContain('npm run gitlab:private-release:publish');
    expect(packetDoc).toContain('private-v1.3.0-windows-x64');
    expect(packetDoc).toContain('Windows x64 Private Release v1.3.0');
    expect(packetDoc).toContain('## First Retained Runner Receipt');
    expect(packetDoc).toContain('| Merge request | `!91` |');
    expect(packetDoc).toContain('The first governed `windows_private_release_acceptance` receipt is now');

    expect(packetJson.packetId).toBe('private-release-windows-x64-v1.3.0');
    expect(packetJson.status).toBe('published-private-release');
    expect(packetJson.scope.supportClaim).toBe('windows-x64-private-release-only');
    expect(packetJson.scope.supportedProofLanes).toEqual([
      'windows-host-native',
      'windows-container'
    ]);
    expect(packetJson.scope.nonScope).toContain('windows-x86-labview-release-support');
    expect(packetJson.scope.nonScope).toContain('wsl-active-support');
    expect(packetJson.governingSequence.docsBranch.name).toBe('feature/windows-private-release-docs-26514');
    expect(packetJson.governingSequence.publicationBranch.name).toBe(
      'feature/windows-private-release-v1.3.0-refresh'
    );
    expect(packetJson.governingSequence.publicationBranch.publishedSourceCommit).toBe(
      'e26ac6f504152e02e61572cb6aa0d8345f3af2bb'
    );
    expect(packetJson.governingSequence.nextDeferredBranch).toBe('feature/linux-runtime-variant');
    expect(packetJson.packageEvidence.versionLine).toBe('1.3.0');
    expect(packetJson.packageEvidence.vsixPath).toBe('preview-evidence/vi-history-suite-1.3.0.vsix');
    expect(packetJson.packageEvidence.sha256).toBe(
      'F46CCB721B1AB772408EB2CFDBDFFCA917E41229D38E9F624CE107C795D53EA8'
    );
    expect(packetJson.packageEvidence.sizeBytes).toBe(493630);
    expect(packetJson.publication).toEqual({
      status: 'published',
      releaseChannel: 'gitlab-private-release',
      releaseTag: 'private-v1.3.0-windows-x64',
      releaseName: 'Windows x64 Private Release v1.3.0',
      releaseUrl:
        'https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.0-windows-x64',
      publishCommand: 'npm run gitlab:private-release:publish',
      sourceBranch: 'feature/windows-private-release-v1.3.0-refresh',
      sourceCommit: 'e26ac6f504152e02e61572cb6aa0d8345f3af2bb',
      vsixDirectAssetUrl:
        'https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.0-windows-x64/downloads/private-releases/windows-x64/vi-history-suite-1.3.0.vsix',
      checksumDirectAssetUrl:
        'https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.0-windows-x64/downloads/private-releases/windows-x64/vi-history-suite-1.3.0.vsix.sha256',
      publishReceipt: '.cache/private-release-publish/latest/private-release-publish.json'
    });
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
        governedRunnerAdmission: expect.objectContaining({
          jobName: 'governed_runner_admission',
          packageScript: 'npm run gitlab:runner:doctor',
          evidenceRoot: 'governed-runner-admission-evidence/',
          failurePolicy: 'fail-fast-before-docs-assurance-test-package-and-release-stages'
        }),
        startupReceipts: expect.objectContaining({
          windowsLatest: 'C:\\GitLab-Runner\\receipts\\governed-runner-startup\\latest.json',
          linuxLatest: '$HOME/.gitlab-runner/receipts/linux-assurance-startup/latest.json'
        }),
        hostApplySurface: expect.objectContaining({
          windowsApplyScript: 'scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1',
          scheduledTaskAction:
            'powershell.exe -NoLogo -NoProfile -File "C:\\GitLab-Runner\\start-governed-runner-lanes.ps1"',
          failurePolicy: 'fail-closed-unless-exactly-one-configured-manager-after-apply'
        }),
        linuxBootstrapReadiness: expect.objectContaining({
          script: 'scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1',
          distro: 'Ubuntu-24.04',
          distroOverrideEnvironmentVariable: 'VIHS_LINUX_ASSURANCE_DISTRO',
          bootstrapCommand: '$HOME/gitlab-runner/start-linux-assurance.sh',
          wakeAttempts: 12,
          wakeDelaySeconds: 10,
          failurePolicy: 'fail-closed-unless-linux-assurance-helper-observes-live-service'
        }),
        hostDoctorSurface: expect.objectContaining({
          windowsDoctorScript: 'scripts/gitlab-runner/windows/doctor-governed-runner-lanes.ps1',
          linuxDoctorScript: 'scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh',
          runnerDoctorWrapperScript: 'scripts/doctorGovernedRunnerLanes.js',
          runnerDoctorPackageScript: 'npm run gitlab:runner:doctor',
          failurePolicy:
            'non-mutating-readback; combined surface may fail closed on drift when requested'
        }),
        hostAssertionSurface: expect.objectContaining({
          runnerAssertionWrapperScript: 'scripts/assertGovernedRunnerLanes.js',
          runnerAssertionPackageScript: 'npm run gitlab:runner:assert',
          windowsAssertScript: 'scripts/gitlab-runner/windows/assert-governed-runner-lanes.ps1',
          linuxAssertScript: 'scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh',
          failurePolicy: 'fail-closed-on-live-host-drift',
          linuxConcurrencyContract: {
            globalConcurrency: 2,
            requestConcurrency: 2
          }
        }),
        coldAdmissionRuntimeCleanup: expect.objectContaining({
          processNames: ['LabVIEW', 'LabVIEWCLI', 'LVCompare'],
          terminationStrategy: [
            'stop-process-force-by-pid',
            'taskkill-pid-tree',
            'taskkill-image-tree'
          ],
          failurePolicy: 'fail-closed-before-runner-start'
        }),
        midSessionRuntimeRecovery: expect.objectContaining({
          laneId: 'windows-host-native',
          trigger: 'windows-host-runtime-cleanup-failed',
          recoveryScript: 'scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1',
          recoveryTranscript: 'windows-private-release-evidence/host/proof-runtime-recovery.txt',
          retryDelayMs: 5000,
          maxProofRetries: 1,
          firstFailureTranscript: 'windows-private-release-evidence/host/proof-run-pre-recovery.txt',
          failurePolicy: 'fail-closed-after-repo-recovery-script-and-single-retry'
        }),
        midSessionRecoveryRehearsal: expect.objectContaining({
          governedScript: 'scripts/runWindowsProofRuntimeRecoveryRehearsal.js',
          packageScript: 'npm run gitlab:runner:windows:recovery:rehearse',
          receiptRoot: '.cache/windows-proof-runtime-recovery-rehearsal',
          latestReceipt: '.cache/windows-proof-runtime-recovery-rehearsal/latest.json',
          requestedLabviewVersion: '2026',
          requestedLabviewBitness: 'x64',
          contaminationSeedMode: 'headless-labview-launch',
          recoveryTranscriptLeaf: 'proof-runtime-recovery.txt',
          failurePolicy: 'fail-closed-unless-clean-before-and-after-governed-recovery-rehearsal'
        }),
        repoOwnedOperatorAssets: expect.objectContaining({
          windowsApplyScript: 'scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1',
          windowsBootstrapScript: 'scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1',
          windowsDoctorScript: 'scripts/gitlab-runner/windows/doctor-governed-runner-lanes.ps1',
          windowsAssertScript: 'scripts/gitlab-runner/windows/assert-governed-runner-lanes.ps1',
          windowsRecoveryScript:
            'scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1',
          windowsRecoveryRehearsalScript: 'scripts/runWindowsProofRuntimeRecoveryRehearsal.js',
          linuxApplyScript: 'scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh',
          linuxHelperScript: 'scripts/gitlab-runner/linux/start-linux-assurance.sh',
          linuxDoctorScript: 'scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh',
          linuxServiceUnit: 'scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service',
          linuxAssertScript: 'scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh',
          runnerDoctorWrapperScript: 'scripts/doctorGovernedRunnerLanes.js',
          runnerDoctorPackageScript: 'npm run gitlab:runner:doctor',
          runnerAssertionWrapperScript: 'scripts/assertGovernedRunnerLanes.js',
          runnerAssertionPackageScript: 'npm run gitlab:runner:assert',
          runnerRecoveryRehearsalPackageScript: 'npm run gitlab:runner:windows:recovery:rehearse'
        })
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
    expect(releaseProcedure).toContain('npm run gitlab:private-release:publish');
    expect(releaseProcedure).toContain('private-v1.3.1-windows-x64');

    expect(runnerLaneDoc).toContain('# Windows Private-Release Runner Lane');
    expect(runnerLaneDoc).toContain('windows_private_release_acceptance');
    expect(runnerLaneDoc).toContain('npm run acceptance:windows:private-release');
    expect(runnerLaneDoc).toContain('ghost');
    expect(runnerLaneDoc).toContain('52775990');
    expect(runnerLaneDoc).toContain('windows-private-release-evidence/manifest.json');
    expect(runnerLaneDoc).toContain('<runner-auth-token>');
  });

  it('retains the first fresh v1.3.1 Windows host/container acceptance receipt set in the draft packet without publication claims', () => {
    const packetDoc = readText('docs/product/private-release-windows-x64-v1.3.1.md');
    const packetJson = readJson<any>('docs/product/private-release-windows-x64-v1.3.1.json');
    const currentState = readText('docs/product/current-state.md');
    const releaseProcedure = readText('docs/release-procedure.md');
    const controlPlane = readText('docs/product/maintainer-control-plane-index.md');

    expect(packetDoc).toContain('# Windows x64 Private-Release Packet `v1.3.1`');
    expect(packetDoc).toContain('Retain the first published Windows x64 private-release packet');
    expect(packetDoc).toContain('preview-evidence/vi-history-suite-1.3.1.vsix');
    expect(packetDoc).toContain('D211FC16CE9213F005C6DA9C6ED4FD14F8B298648C1446A3891B2BD697A0CFC5');
    expect(packetDoc).toContain('publication status: `published-for-v1.3.1`');
    expect(packetDoc).toContain('release tag: `private-v1.3.1-windows-x64`');
    expect(packetDoc).toContain('`https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.1-windows-x64`');
    expect(packetDoc).toContain('.cache/private-release-publish/latest/private-release-publish.json');
    expect(packetDoc).toContain('windows-private-release-evidence/manifest.json');
    expect(packetDoc).toContain('| Windows host x64 | `succeeded` | `2026-04-21T14:13:42.907Z` |');
    expect(packetDoc).toContain('| Windows container x64 | `succeeded` | `2026-04-21T14:14:27.725Z` |');
    expect(packetDoc).toContain('windows-private-release-evidence/host/settings-write.txt');
    expect(packetDoc).toContain('windows-private-release-evidence/container/settings-validate.txt');
    expect(packetDoc).toContain('bounded recovery transcripts retained: none');
    expect(packetDoc).toContain('current private install surface for this line');

    expect(packetJson.packetId).toBe('private-release-windows-x64-v1.3.1');
    expect(packetJson.status).toBe('published-private-release');
    expect(packetJson.packageEvidence).toEqual({
      versionLine: '1.3.1',
      vsixPath: 'preview-evidence/vi-history-suite-1.3.1.vsix',
      sha256: 'D211FC16CE9213F005C6DA9C6ED4FD14F8B298648C1446A3891B2BD697A0CFC5',
      sizeBytes: 495214,
      generatedAt: '2026-04-21T14:06:14.4953320Z',
      buildCommand: 'npm run package -- --out \"preview-evidence/vi-history-suite-1.3.1.vsix\"'
    });
    expect(packetJson.governingSequence.freshAcceptanceManifest).toEqual({
      manifestPath: 'windows-private-release-evidence/manifest.json',
      generatedAt: '2026-04-21T14:14:27.778Z'
    });
    expect(packetJson.publication).toEqual({
      status: 'published',
      releaseChannel: 'gitlab-private-release',
      releaseTag: 'private-v1.3.1-windows-x64',
      releaseName: 'Windows x64 Private Release v1.3.1',
      releaseUrl:
        'https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.1-windows-x64',
      publishCommand: 'npm run gitlab:private-release:publish -- --skip-package --allow-dirty',
      sourceBranch: 'release/1.3.1',
      sourceCommit: '3fe766ab5eb6ef6652e3ab8a50e6392730d1fb7f',
      vsixDirectAssetUrl:
        'https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.1-windows-x64/downloads/private-releases/windows-x64/vi-history-suite-1.3.1.vsix',
      checksumDirectAssetUrl:
        'https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.1-windows-x64/downloads/private-releases/windows-x64/vi-history-suite-1.3.1.vsix.sha256',
      publishReceipt: '.cache/private-release-publish/latest/private-release-publish.json',
      retainedHistoricalReleaseTag: 'private-v1.3.0-windows-x64',
      retainedHistoricalReleaseUrl:
        'https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.0-windows-x64'
    });
    expect(packetJson.proofLanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          laneId: 'windows-host-x64',
          status: 'succeeded',
          generatedAt: '2026-04-21T14:13:42.907Z',
          providerRequest: 'host',
          proofExecutionMode: 'host-only',
          settingsFilePath: 'host/settings-file.json',
          proofAttemptCount: 1,
          retainedRoot: 'windows-private-release-evidence/host/'
        }),
        expect.objectContaining({
          laneId: 'windows-container-x64',
          status: 'succeeded',
          generatedAt: '2026-04-21T14:14:27.725Z',
          providerRequest: 'docker',
          proofExecutionMode: 'docker-only',
          settingsFilePath: 'container/settings-file.json',
          proofAttemptCount: 1,
          retainedRoot: 'windows-private-release-evidence/container/'
        })
      ])
    );
    expect(packetJson.gitlabRunnerLane).toEqual(
      expect.objectContaining({
        jobName: 'windows_private_release_acceptance',
        governedCli: 'npm run acceptance:windows:private-release',
        governedScript: 'scripts/runWindowsPrivateReleaseAcceptance.js',
        runnerContractDoc: 'docs/product/windows-private-release-runner-lane.md',
        artifactRoot: 'windows-private-release-evidence/',
        expectedManifestPath: 'windows-private-release-evidence/manifest.json',
        v1_3_1ReceiptStatus: 'retained-local-governed-receipt',
        receiptGeneratedAt: '2026-04-21T14:14:27.778Z',
        boundedRecoveryTriggered: false
      })
    );

    expect(controlPlane).toContain('private-release-windows-x64-v1.3.1.md');
    expect(controlPlane).toContain('private-release-windows-x64-v1.3.1.json');
    expect(controlPlane).toContain('private-v1.3.1-windows-x64');
    expect(controlPlane).toContain('.cache/private-release-publish/latest/private-release-publish.json');
    expect(currentState).toContain('[private-release-windows-x64-v1.3.1.md](./private-release-windows-x64-v1.3.1.md)');
    expect(currentState).toContain('[private-release-windows-x64-v1.3.1.json](./private-release-windows-x64-v1.3.1.json)');
    expect(currentState).toContain('private-v1.3.1-windows-x64');
    expect(currentState).toContain('`windows-private-release-evidence/manifest.json`');
    expect(currentState).toContain('.cache/private-release-publish/latest/private-release-publish.json');
    expect(releaseProcedure).toContain('docs/product/private-release-windows-x64-v1.3.1.md');
    expect(releaseProcedure).toContain('docs/product/private-release-windows-x64-v1.3.1.json');
    expect(releaseProcedure).toContain('private-v1.3.1-windows-x64');
    expect(releaseProcedure).toContain('`windows-private-release-evidence/manifest.json`');
    expect(releaseProcedure).toContain('.cache/private-release-publish/latest/private-release-publish.json');
  });
});
