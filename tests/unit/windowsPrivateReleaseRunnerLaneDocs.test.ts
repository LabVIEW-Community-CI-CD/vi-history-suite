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

    expect(sustainmentDoc).toContain('windows-private-release-runner-lane.md');
    expect(sustainmentDoc).toContain('GitLab `windows_private_release_acceptance`');
    expect(sustainmentDoc).toContain('linux-assurance-runner-lane.md');

    expect(hostedGovernanceDoc).toContain('`windows_private_release_acceptance`');
    expect(hostedGovernanceDoc).toContain('retains the canonical Windows x64 private-release acceptance evidence');

    expect(packageManifest.scripts?.['acceptance:windows:private-release']).toBe(
      'npm run compile && node scripts/runWindowsPrivateReleaseAcceptance.js'
    );
  });
});
