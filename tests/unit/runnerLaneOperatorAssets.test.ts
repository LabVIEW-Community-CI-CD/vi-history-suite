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

describe('runner lane operator assets', () => {
  it('retains the repo-owned Windows bootstrap, Linux helper, Linux service unit, and the control-plane references to them', () => {
    const windowsApply = readText(
      'scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1'
    );
    const windowsBootstrap = readText(
      'scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1'
    );
    const linuxApply = readText('scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh');
    const linuxHelper = readText('scripts/gitlab-runner/linux/start-linux-assurance.sh');
    const linuxService = readText(
      'scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service'
    );
    const windowsLaneDoc = readText('docs/product/windows-private-release-runner-lane.md');
    const linuxLaneDoc = readText('docs/product/linux-assurance-runner-lane.md');
    const hostedGovernanceDoc = readText('docs/product/hosted-ci-governance.md');
    const hostedGovernanceJson = readJson<any>('docs/product/hosted-ci-governance.json');
    const privateReleasePacketDoc = readText('docs/product/private-release-windows-x64-v1.3.0.md');
    const privateReleasePacketJson = readJson<any>('docs/product/private-release-windows-x64-v1.3.0.json');
    const informationItemMap = readText('docs/information-item-map.md');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const releaseProcedure = readText('docs/release-procedure.md');

    expect(windowsApply).toContain("Register-ScheduledTask -TaskName $TaskName");
    expect(windowsApply).toContain('-NoLogo -NoProfile -File');
    expect(windowsApply).not.toContain('ExecutionPolicy Bypass');
    expect(windowsApply).toContain('expected exactly one configured gitlab-runner manager after apply');

    expect(windowsBootstrap).toContain("$runnerRoot = 'C:\\GitLab-Runner'");
    expect(windowsBootstrap).toContain("Start-Process -FilePath $runnerExe");
    expect(windowsBootstrap).toContain('Stop-Process -Id $duplicateWindowsRunner.ProcessId -Force');
    expect(windowsBootstrap).toContain(
      "wsl.exe -d Ubuntu bash -lc '$HOME/gitlab-runner/start-linux-assurance.sh' | Out-Null"
    );

    expect(linuxApply).toContain('EXPECTED_USER="sveld"');
    expect(linuxApply).toContain('sudo systemctl enable --now "$SERVICE_NAME"');
    expect(linuxApply).toContain('systemctl is-enabled "$SERVICE_NAME"');
    expect(linuxApply).toContain('systemctl is-active "$SERVICE_NAME"');
    expect(linuxApply).toContain('is not active after apply');

    expect(linuxHelper).toContain('RUNNER_BIN="$HOME/gitlab-runner/bin/gitlab-runner"');
    expect(linuxHelper).toContain('CONFIG="$HOME/.gitlab-runner/config.toml"');
    expect(linuxHelper).toContain('pgrep -af "$RUNNER_BIN run --config $CONFIG"');
    expect(linuxHelper).toContain(
      'nohup "$RUNNER_BIN" run --config "$CONFIG" >>"$LOG_DIR/stdout.log" 2>>"$LOG_DIR/stderr.log" </dev/null &'
    );

    expect(linuxService).toContain('Description=VIHS Linux assurance GitLab runner');
    expect(linuxService).toContain('User=sveld');
    expect(linuxService).toContain('WorkingDirectory=/home/sveld');
    expect(linuxService).toContain(
      'ExecStart=/home/sveld/gitlab-runner/bin/gitlab-runner run --config /home/sveld/.gitlab-runner/config.toml'
    );
    expect(linuxService).toContain('Restart=always');
    expect(linuxService).toContain('WantedBy=multi-user.target');

    expect(windowsLaneDoc).toContain('scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1');
    expect(windowsLaneDoc).toContain('scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1');
    expect(windowsLaneDoc).not.toContain('ExecutionPolicy Bypass -File "C:\\GitLab-Runner\\start-governed-runner-lanes.ps1"');
    expect(windowsLaneDoc).toContain('fails closed unless exactly one configured');
    expect(windowsLaneDoc).toContain('runner manager remains after apply');
    expect(windowsLaneDoc).toContain('scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh');
    expect(windowsLaneDoc).toContain('scripts/gitlab-runner/linux/start-linux-assurance.sh');
    expect(windowsLaneDoc).toContain('powershell.exe -NoLogo -NoProfile -File .\\scripts\\gitlab-runner\\windows\\apply-governed-runner-lanes.ps1');
    expect(linuxLaneDoc).toContain('scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh');
    expect(linuxLaneDoc).toContain('scripts/gitlab-runner/linux/start-linux-assurance.sh');
    expect(linuxLaneDoc).toContain('scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service');
    expect(linuxLaneDoc).toContain('bash ./scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh');

    expect(hostedGovernanceDoc).toContain('scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1');
    expect(hostedGovernanceDoc).toContain('scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1');
    expect(hostedGovernanceDoc).toContain('scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh');
    expect(hostedGovernanceDoc).toContain('scripts/gitlab-runner/linux/start-linux-assurance.sh');
    expect(hostedGovernanceDoc).toContain('scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service');
    expect(hostedGovernanceJson.authorityGitLab.runnerLanes.linuxAssurance.operatorModel).toEqual(
      expect.objectContaining({
        repoOwnedApplyScript: 'scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh',
        repoOwnedHelperScript: 'scripts/gitlab-runner/linux/start-linux-assurance.sh',
        repoOwnedServiceUnit: 'scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service'
      })
    );
    expect(hostedGovernanceJson.authorityGitLab.runnerLanes.windowsPrivateRelease.operatorModel).toEqual(
      expect.objectContaining({
        repoOwnedApplyScript: 'scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1',
        repoOwnedBootstrapScript: 'scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1',
        repoOwnedLinuxHelperScript: 'scripts/gitlab-runner/linux/start-linux-assurance.sh'
      })
    );

    expect(privateReleasePacketDoc).toContain('scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1');
    expect(privateReleasePacketDoc).toContain('scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1');
    expect(privateReleasePacketDoc).toContain('scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh');
    expect(privateReleasePacketDoc).toContain('scripts/gitlab-runner/linux/start-linux-assurance.sh');
    expect(privateReleasePacketDoc).toContain('scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service');
    expect(privateReleasePacketJson.gitlabRunnerLane).toEqual(
      expect.objectContaining({
        hostInstallState: 'current-user-scheduled-task-bootstrap-active',
        repoOwnedOperatorAssets: {
          windowsApplyScript: 'scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1',
          windowsBootstrapScript: 'scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1',
          linuxApplyScript: 'scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh',
          linuxHelperScript: 'scripts/gitlab-runner/linux/start-linux-assurance.sh',
          linuxServiceUnit: 'scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service'
        }
      })
    );

    expect(informationItemMap).toContain(
      '| Governed runner host asset pack | `scripts/gitlab-runner/` |'
    );
    expect(readme).toContain('scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1');
    expect(readme).toContain('scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1');
    expect(readme).toContain('scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh');
    expect(readme).toContain('scripts/gitlab-runner/linux/start-linux-assurance.sh');
    expect(currentState).toContain('repo-owned runner host asset pack and apply surfaces:');
    expect(currentState).toContain('scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1');
    expect(currentState).toContain('scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh');
    expect(currentState).toContain('scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service');
    expect(releaseProcedure).toContain('The repo-owned runner host asset pack and apply surfaces for those lanes are:');
    expect(releaseProcedure).toContain('scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1');
    expect(releaseProcedure).toContain('scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1');
    expect(releaseProcedure).toContain('scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh');
  });

  it('retains cold-admission Windows proof runtime cleanup in the bootstrap and linked control-plane docs', () => {
    const windowsBootstrap = readText(
      'scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1'
    );
    const windowsLaneDoc = readText('docs/product/windows-private-release-runner-lane.md');
    const hostedGovernanceDoc = readText('docs/product/hosted-ci-governance.md');
    const hostedGovernanceJson = readJson<any>('docs/product/hosted-ci-governance.json');
    const privateReleasePacketDoc = readText('docs/product/private-release-windows-x64-v1.3.0.md');
    const privateReleasePacketJson = readJson<any>('docs/product/private-release-windows-x64-v1.3.0.json');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const releaseProcedure = readText('docs/release-procedure.md');

    expect(windowsBootstrap).toContain('$windowsProofRuntimeProcessNames = @(');
    expect(windowsBootstrap).toContain("'LabVIEW'");
    expect(windowsBootstrap).toContain("'LabVIEWCLI'");
    expect(windowsBootstrap).toContain("'LVCompare'");
    expect(windowsBootstrap).toContain('$windowsProofRuntimeImageNames = @(');
    expect(windowsBootstrap).toContain("'LabVIEW.exe'");
    expect(windowsBootstrap).toContain("'LabVIEWCLI.exe'");
    expect(windowsBootstrap).toContain("'LVCompare.exe'");
    expect(windowsBootstrap).toContain('Get-WindowsProofRuntimeProcesses');
    expect(windowsBootstrap).toContain('Clear-WindowsProofRuntimeSurface');
    expect(windowsBootstrap).toContain('taskkill.exe /PID $runtimeProcess.Id /T /F');
    expect(windowsBootstrap).toContain('taskkill.exe /IM $runtimeImageName /T /F');
    expect(windowsBootstrap).toContain('Start-Sleep -Milliseconds $windowsProofRuntimeCleanupPollMilliseconds');
    expect(windowsBootstrap).toContain(
      'Windows proof runtime cleanup failed before cold runner admission; remaining processes:'
    );
    expect(windowsBootstrap).toMatch(
      /if \(\$windowsRunners\.Count -eq 0\) \{\r?\n  Clear-WindowsProofRuntimeSurface\r?\n  Start-Process -FilePath \$runnerExe/
    );

    expect(windowsLaneDoc).toContain('stale `LabVIEW`,');
    expect(windowsLaneDoc).toContain('`LabVIEWCLI`, and `LVCompare` processes');
    expect(windowsLaneDoc).toContain('fails closed if any remain');
    expect(hostedGovernanceDoc).toContain('cold-admission fail-closed');
    expect(hostedGovernanceDoc).toContain(
      '`LabVIEW` / `LabVIEWCLI` / `LVCompare` runtime processes'
    );
    expect(hostedGovernanceJson.authorityGitLab.runnerLanes.windowsPrivateRelease.operatorModel)
      .toEqual(
        expect.objectContaining({
          coldAdmissionRuntimeCleanup: {
            processNames: ['LabVIEW', 'LabVIEWCLI', 'LVCompare'],
            terminationStrategy: [
              'stop-process-force-by-pid',
              'taskkill-pid-tree',
              'taskkill-image-tree'
            ],
            failurePolicy: 'fail-closed-before-runner-start'
          }
        })
      );

    expect(privateReleasePacketDoc).toContain(
      'that Windows bootstrap clears stale `LabVIEW`, `LabVIEWCLI`, and'
    );
    expect(privateReleasePacketDoc).toContain('fails closed if');
    expect(privateReleasePacketDoc).toContain('contamination remains');
    expect(privateReleasePacketJson.gitlabRunnerLane).toEqual(
      expect.objectContaining({
        coldAdmissionRuntimeCleanup: {
          processNames: ['LabVIEW', 'LabVIEWCLI', 'LVCompare'],
          terminationStrategy: [
            'stop-process-force-by-pid',
            'taskkill-pid-tree',
            'taskkill-image-tree'
          ],
          failurePolicy: 'fail-closed-before-runner-start'
        }
      })
    );

    expect(readme).toContain(
      'the Windows bootstrap clears stale `LabVIEW`, `LabVIEWCLI`, and'
    );
    expect(currentState).toContain(
      'the Windows bootstrap clears stale `LabVIEW`, `LabVIEWCLI`, and'
    );
    expect(releaseProcedure).toContain(
      'The Windows bootstrap clears stale `LabVIEW`, `LabVIEWCLI`, and `LVCompare`'
    );
  });
});
