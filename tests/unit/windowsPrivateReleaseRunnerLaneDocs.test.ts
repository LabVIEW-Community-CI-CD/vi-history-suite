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

describe('windows private release runner lane docs', () => {
  it('keeps the tagged Windows acceptance lane wired through CI, sustainment, and the package flow', () => {
    const gitlabCi = readText('.gitlab-ci.yml');
    const runnerLaneDoc = readText('docs/product/windows-private-release-runner-lane.md');
    const sustainmentDoc = readText('docs/product/post-release-sustainment-rules.md');
    const hostedGovernanceDoc = readText('docs/product/hosted-ci-governance.md');
    const hostedGovernanceJson = readJson<any>('docs/product/hosted-ci-governance.json');
    const packageManifest = readJson<{ scripts?: Record<string, string> }>('package.json');

    expect(gitlabCi).toContain('windows_private_release_acceptance:');
    expect(gitlabCi).toContain('- windows');
    expect(gitlabCi).toContain('- docker-windows');
    expect(gitlabCi).toContain('npm run acceptance:windows:private-release');
    expect(gitlabCi).toContain('- windows_private_release_acceptance');
    expect(gitlabCi).toContain('windows-private-release-evidence/');

    expect(runnerLaneDoc).toContain('resource/plugins/lv_icon.vi');
    expect(runnerLaneDoc).toContain('PowerShell 7 shell executor');
    expect(runnerLaneDoc).toContain('current-user shell runner');
    expect(runnerLaneDoc).toContain('gitlab-runner.exe register');
    expect(runnerLaneDoc).toContain('--shell "pwsh"');
    expect(runnerLaneDoc).toContain('--tag-list "windows,x64,labview-host,docker-windows,private-release"');
    expect(runnerLaneDoc).toContain('windows-private-release-evidence/host/harness-report/**');
    expect(runnerLaneDoc).toContain('windows-private-release-evidence/container/harness-report/**');
    expect(runnerLaneDoc).toContain('linux-assurance-runner-lane.md');
    expect(runnerLaneDoc).toContain('C:\\GitLab-Runner\\config.toml');
    expect(runnerLaneDoc).toContain('request_concurrency = 2');
    expect(runnerLaneDoc).toContain('VIHS Governed Runner Lanes');
    expect(runnerLaneDoc).toContain('apply-governed-runner-lanes.ps1');
    expect(runnerLaneDoc).toContain('start-governed-runner-lanes.ps1');
    expect(runnerLaneDoc).toContain('assert-governed-runner-lanes.ps1');
    expect(runnerLaneDoc).toContain('recover-windows-proof-runtime-surface.ps1');
    expect(runnerLaneDoc).toContain('runWindowsProofRuntimeRecoveryRehearsal.js');
    expect(runnerLaneDoc).toContain('scripts/assertGovernedRunnerLanes.js');
    expect(runnerLaneDoc).toContain('npm run gitlab:runner:assert');
    expect(runnerLaneDoc).toContain('npm run gitlab:runner:windows:recovery:rehearse');
    expect(runnerLaneDoc).toContain('-NoLogo -NoProfile -File');
    expect(runnerLaneDoc).not.toContain('ExecutionPolicy Bypass -File');
    expect(runnerLaneDoc).toContain('fails closed unless exactly one configured');
    expect(runnerLaneDoc).toContain('runner manager remains after apply');
    expect(runnerLaneDoc).toContain('installed bootstrap hash still matches the repo source');
    expect(runnerLaneDoc).toContain('duplicate `gitlab-runner.exe` manager processes');
    expect(runnerLaneDoc).toContain('stale `LabVIEW`,');
    expect(runnerLaneDoc).toContain('`LabVIEWCLI`, and `LVCompare` processes');
    expect(runnerLaneDoc).toContain('taskkill /PID /T /F');
    expect(runnerLaneDoc).toContain('taskkill /IM /T /F');
    expect(runnerLaneDoc).toContain('fails closed if any remain');
    expect(runnerLaneDoc).toContain('proof-run-pre-recovery.txt');
    expect(runnerLaneDoc).toContain('proof-runtime-recovery.txt');
    expect(runnerLaneDoc).toContain('`5000` ms');
    expect(runnerLaneDoc).toContain('repo-owned Windows proof runtime recovery script');
    expect(runnerLaneDoc).toContain('reruns the same host-native proof once');
    expect(runnerLaneDoc).toContain('proofAttemptCount');
    expect(runnerLaneDoc).toContain('boundedRecovery');
    expect(runnerLaneDoc).toContain('.cache/windows-proof-runtime-recovery-rehearsal/latest.json');
    expect(runnerLaneDoc).toContain('headless LabVIEW contamination');
    expect(runnerLaneDoc).toContain('scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh');
    expect(runnerLaneDoc).toContain('scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1');
    expect(runnerLaneDoc).toContain('scripts/gitlab-runner/linux/start-linux-assurance.sh');
    expect(runnerLaneDoc).toContain('powershell.exe -NoLogo -NoProfile -File .\\scripts\\gitlab-runner\\windows\\apply-governed-runner-lanes.ps1');

    expect(sustainmentDoc).toContain('windows-private-release-runner-lane.md');
    expect(sustainmentDoc).toContain('GitLab `windows_private_release_acceptance`');
    expect(sustainmentDoc).toContain('scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1');
    expect(sustainmentDoc).toContain('linux-assurance-runner-lane.md');

    expect(hostedGovernanceDoc).toContain('`windows_private_release_acceptance`');
    expect(hostedGovernanceDoc).toContain('retains the canonical Windows x64 private-release acceptance evidence');
    expect(hostedGovernanceDoc).toContain('VIHS Governed Runner Lanes');
    expect(hostedGovernanceDoc).toContain('apply-governed-runner-lanes.ps1');
    expect(hostedGovernanceDoc).toContain('start-governed-runner-lanes.ps1');
    expect(hostedGovernanceDoc).toContain('assert-governed-runner-lanes.ps1');
    expect(hostedGovernanceDoc).toContain('runWindowsProofRuntimeRecoveryRehearsal.js');
    expect(hostedGovernanceDoc).toContain('scripts/assertGovernedRunnerLanes.js');
    expect(hostedGovernanceDoc).toContain('npm run gitlab:runner:assert');
    expect(hostedGovernanceDoc).toContain('npm run gitlab:runner:windows:recovery:rehearse');
    expect(hostedGovernanceDoc).toContain('request_concurrency = 2');
    expect(hostedGovernanceDoc).toContain('cold-admission fail-closed');
    expect(hostedGovernanceDoc).toContain(
      '`LabVIEW` / `LabVIEWCLI` / `LVCompare` runtime processes'
    );
    expect(hostedGovernanceDoc).toContain('taskkill /PID /T /F');
    expect(hostedGovernanceDoc).toContain('taskkill /IM /T /F');
    expect(hostedGovernanceDoc).toContain('proof-run-pre-recovery.txt');
    expect(hostedGovernanceDoc).toContain('proof-runtime-recovery.txt');
    expect(hostedGovernanceDoc).toContain('`5000` ms');
    expect(hostedGovernanceDoc).toContain('recover-windows-proof-runtime-surface.ps1');
    expect(hostedGovernanceDoc).toContain('retries that host-native proof once');
    expect(hostedGovernanceDoc).toContain('scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1');
    expect(hostedGovernanceJson.authorityGitLab.runnerLanes.windowsPrivateRelease).toEqual(
      expect.objectContaining({
        description: 'ghost',
        runnerContractDoc: 'docs/product/windows-private-release-runner-lane.md',
        operatorModel: expect.objectContaining({
          configPath: 'C:\\GitLab-Runner\\config.toml',
          requestConcurrency: 2,
          bootstrapScript: 'C:\\GitLab-Runner\\start-governed-runner-lanes.ps1',
          scheduledTask: 'VIHS Governed Runner Lanes',
          lifecycleOwner: 'interactive-current-user-scheduled-task',
          repoOwnedApplyScript: 'scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1',
          bootstrapTaskAction: {
            executable: 'powershell.exe',
            arguments:
              '-NoLogo -NoProfile -File "C:\\GitLab-Runner\\start-governed-runner-lanes.ps1"',
            executionPolicy: 'ambient-no-bypass'
          },
          duplicateProcessPolicy: 'collapse-duplicates-per-config',
          coldAdmissionRuntimeCleanup: {
            processNames: ['LabVIEW', 'LabVIEWCLI', 'LVCompare'],
            terminationStrategy: [
              'stop-process-force-by-pid',
              'taskkill-pid-tree',
              'taskkill-image-tree'
            ],
            failurePolicy: 'fail-closed-before-runner-start'
          },
          repoOwnedBootstrapScript: 'scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1',
          repoOwnedAssertScript: 'scripts/gitlab-runner/windows/assert-governed-runner-lanes.ps1',
          repoOwnedRecoveryScript:
            'scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1',
          repoOwnedRecoveryRehearsalScript: 'scripts/runWindowsProofRuntimeRecoveryRehearsal.js',
          repoOwnedLinuxHelperScript: 'scripts/gitlab-runner/linux/start-linux-assurance.sh',
          combinedAssertionScript: 'scripts/assertGovernedRunnerLanes.js',
          combinedAssertionPackageScript: 'npm run gitlab:runner:assert',
          recoveryRehearsal: {
            packageScript: 'npm run gitlab:runner:windows:recovery:rehearse',
            receiptRoot: '.cache/windows-proof-runtime-recovery-rehearsal',
            latestReceipt: '.cache/windows-proof-runtime-recovery-rehearsal/latest.json',
            requestedLabviewVersion: '2026',
            requestedLabviewBitness: 'x64',
            contaminationSeedMode: 'headless-labview-launch',
            recoveryTranscriptLeaf: 'proof-runtime-recovery.txt',
            failurePolicy: 'fail-closed-unless-clean-before-and-after-governed-recovery-rehearsal'
          },
          applyVerification: {
            checks: ['scheduled-task-registered', 'exactly-one-configured-runner-manager'],
            failurePolicy: 'fail-closed-unless-scheduled-task-and-runner-process-are-live'
          },
          assertVerification: {
            checks: [
              'bootstrap-hash-match',
              'scheduled-task-action-match',
              'scheduled-task-logon-trigger',
              'request-concurrency-two',
              'exactly-one-configured-runner-manager'
            ],
            failurePolicy: 'fail-closed-on-live-host-drift'
          }
        })
      })
    );
    expect(
      hostedGovernanceJson.authorityGitLab.jobs.windows_private_release_acceptance
        .runtimeContaminationRecovery
    ).toEqual({
      laneId: 'windows-host-native',
      trigger: 'windows-host-runtime-cleanup-failed',
      recoveryScript: 'scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1',
      recoveryTranscript: 'windows-private-release-evidence/host/proof-runtime-recovery.txt',
      retryDelayMs: 5000,
      maxProofRetries: 1,
      firstFailureTranscript: 'windows-private-release-evidence/host/proof-run-pre-recovery.txt',
      failurePolicy: 'fail-closed-after-repo-recovery-script-and-single-retry'
    });

    expect(packageManifest.scripts?.['acceptance:windows:private-release']).toBe(
      'node ./node_modules/typescript/bin/tsc -p . && node scripts/runWindowsPrivateReleaseAcceptance.js'
    );
    expect(packageManifest.scripts?.['gitlab:runner:assert']).toBe(
      'node scripts/assertGovernedRunnerLanes.js'
    );
    expect(packageManifest.scripts?.['gitlab:runner:windows:recovery:rehearse']).toBe(
      'npm run compile && node scripts/runWindowsProofRuntimeRecoveryRehearsal.js'
    );
  });
});
