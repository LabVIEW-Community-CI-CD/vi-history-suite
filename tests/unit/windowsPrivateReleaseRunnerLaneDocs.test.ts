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
    expect(runnerLaneDoc).toContain('start-governed-runner-lanes.ps1');
    expect(runnerLaneDoc).toContain('duplicate `gitlab-runner.exe` manager processes');
    expect(runnerLaneDoc).toContain('stale `LabVIEW`,');
    expect(runnerLaneDoc).toContain('`LabVIEWCLI`, and `LVCompare` processes');
    expect(runnerLaneDoc).toContain('fails closed if any remain');
    expect(runnerLaneDoc).toContain('scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1');
    expect(runnerLaneDoc).toContain('scripts/gitlab-runner/linux/start-linux-assurance.sh');
    expect(runnerLaneDoc).toContain("Register-ScheduledTask -TaskName 'VIHS Governed Runner Lanes'");

    expect(sustainmentDoc).toContain('windows-private-release-runner-lane.md');
    expect(sustainmentDoc).toContain('GitLab `windows_private_release_acceptance`');
    expect(sustainmentDoc).toContain('linux-assurance-runner-lane.md');

    expect(hostedGovernanceDoc).toContain('`windows_private_release_acceptance`');
    expect(hostedGovernanceDoc).toContain('retains the canonical Windows x64 private-release acceptance evidence');
    expect(hostedGovernanceDoc).toContain('VIHS Governed Runner Lanes');
    expect(hostedGovernanceDoc).toContain('start-governed-runner-lanes.ps1');
    expect(hostedGovernanceDoc).toContain('request_concurrency = 2');
    expect(hostedGovernanceDoc).toContain('cold-admission fail-closed');
    expect(hostedGovernanceDoc).toContain(
      '`LabVIEW` / `LabVIEWCLI` / `LVCompare` runtime processes'
    );
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
          duplicateProcessPolicy: 'collapse-duplicates-per-config',
          coldAdmissionRuntimeCleanup: {
            processNames: ['LabVIEW', 'LabVIEWCLI', 'LVCompare'],
            failurePolicy: 'fail-closed-before-runner-start'
          },
          repoOwnedBootstrapScript: 'scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1',
          repoOwnedLinuxHelperScript: 'scripts/gitlab-runner/linux/start-linux-assurance.sh'
        })
      })
    );

    expect(packageManifest.scripts?.['acceptance:windows:private-release']).toBe(
      'npm run compile && node scripts/runWindowsPrivateReleaseAcceptance.js'
    );
  });
});
