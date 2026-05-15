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

describe('Vagrant Windows acceptance runner lane', () => {
  it('wires the GitLab Vagrant job, host assets, golden VM contract, and governance docs together', () => {
    const gitlabCi = readText('.gitlab-ci.yml');
    const githubWorkflow = readText('.github/workflows/vagrant-vsix-acceptance.yml');
    const vagrantfile = readText('vagrant/Vagrantfile');
    const bootstrap = readText('vagrant/provision/bootstrap.ps1');
    const acceptance = readText('vagrant/provision/run-acceptance.ps1');
    const coldPrep = readText('vagrant/provision/prepare-cold-labview.ps1');
    const hostDoctor = readText('scripts/vagrant/doctor-vagrant-host.sh');
    const storageDoctor = readText('scripts/doctorVagrantStorage.js');
    const runnerReadiness = readText('scripts/runVagrantAcceptanceRunnerReadiness.js');
    const pipelineFreshness = readText('scripts/checkGitLabVagrantPipelineFreshness.js');
    const runnerReadinessService = readText(
      'scripts/gitlab-runner/linux/vihs-vagrant-acceptance-readiness.service'
    );
    const runnerReadinessTimer = readText(
      'scripts/gitlab-runner/linux/vihs-vagrant-acceptance-readiness.timer'
    );
    const prepareHome = readText('scripts/vagrant/prepare-vagrant-home.sh');
    const refreshBox = readText('scripts/vagrant/refresh-golden-box.sh');
    const cleanupCiVm = readText('scripts/vagrant/cleanup-disposable-ci-vm.sh');
    const laneDoc = readText('docs/product/vagrant-windows-acceptance-runner-lane.md');
    const hostedGovernanceDoc = readText('docs/product/hosted-ci-governance.md');
    const hostedGovernanceJson = readJson<any>('docs/product/hosted-ci-governance.json');
    const timerDecisionDoc = readText(
      'docs/product/vagrant-runner-readiness-timer-decision-2026-05-15.md'
    );
    const timerDecisionJson = readJson<any>(
      'docs/product/vagrant-runner-readiness-timer-decision-2026-05-15.json'
    );
    const packageManifest = readJson<{ scripts?: Record<string, string> }>('package.json');

    expect(gitlabCi).toContain('vagrant_runner_admission:');
    expect(gitlabCi).toContain('npm run vagrant:runner:readiness');
    expect(gitlabCi).toContain('vagrant-runner-readiness-evidence/');
    expect(gitlabCi).toContain('vagrant_windows_vsix_acceptance:');
    expect(gitlabCi).toContain('resource_group: vihs-windows-vagrant');
    expect(gitlabCi).toContain('needs:\n    - vagrant_runner_admission');
    expect(gitlabCi).toContain('VAGRANT_DOTFILE_PATH: .vagrant-ci');
    expect(gitlabCi).toContain('VAGRANT_HOME: /home/sergio/.vagrant.d');
    expect(gitlabCi).toContain('VIHS_VAGRANT_BOX_CACHE_HOME: /run/media/sergio/Data/vihs-vagrant/vagrant-home');
    expect(gitlabCi).toContain('bash scripts/vagrant/prepare-vagrant-home.sh');
    expect(gitlabCi).toContain('bash scripts/vagrant/cleanup-disposable-ci-vm.sh');
    expect(gitlabCi).toContain('rm -rf vagrant/.vagrant');
    expect(gitlabCi).toContain('- virtualbox');
    expect(gitlabCi).toContain('- vagrant');
    expect(gitlabCi).toContain('VIHS_VAGRANT_GOLDEN_VM_NAME: vihs-win11-labview2026-golden');
    expect(gitlabCi).toContain('VIHS_VAGRANT_CI_VM_NAME: vihs-ci-win11');
    expect(gitlabCi).toContain('VIHS_VAGRANT_STORAGE_ROOT: /run/media/sergio/Data/vihs-vagrant');
    expect(gitlabCi).toContain('VIHS_VAGRANT_STANDBY_ROOT: /run/media/sergio/Data1/vihs-vagrant');
    expect(gitlabCi).toContain('VIHS_VAGRANT_VI_SERVER_TIMEOUT_SEC: "60"');
    expect(gitlabCi).toContain('VIHS_VAGRANT_BOX_FILE: /run/media/sergio/Data/vihs-vagrant/box-cache/windows11.box');
    expect(gitlabCi).toContain('VIHS_VAGRANT_BOX_WORKDIR: /run/media/sergio/Data/vihs-vagrant/box-work');
    expect(gitlabCi).toContain('VIHS_VIRTUALBOX_MACHINE_FOLDER: "/run/media/sergio/Data/vihs-vagrant/VirtualBox VMs"');
    expect(gitlabCi).toContain('mkdir -p vagrant/shared vagrant/evidence');
    expect(gitlabCi).toContain(
      'npm run vagrant:acceptance:freshness -- --evidence-dir vagrant/evidence/pipeline-freshness --settle-ms 5000 --api-timeout-ms 10000'
    );
    expect(gitlabCi).toContain('vagrant/evidence/pipeline-freshness/skip-vagrant-acceptance');
    expect(gitlabCi).toContain('Skipping stale Vagrant acceptance pipeline before VM boot.');
    expect(gitlabCi).toContain('node scripts/doctorVagrantStorage.js --active-root "${VIHS_VAGRANT_STORAGE_ROOT}"');
    expect(gitlabCi).toContain('--standby-root "${VIHS_VAGRANT_STANDBY_ROOT}"');
    expect(gitlabCi).toContain('--archive-root "${VIHS_EVIDENCE_ARCHIVE_ROOT}"');
    expect(gitlabCi).toContain('--evidence-dir vagrant/evidence --fail-on-active-drift');
    expect(gitlabCi).toContain('VBoxManage setproperty machinefolder "${VIHS_VIRTUALBOX_MACHINE_FOLDER}"');
    expect(gitlabCi).toContain('bash scripts/vagrant/doctor-vagrant-host.sh');
    expect(gitlabCi).toContain('bash scripts/vagrant/refresh-golden-box.sh');
    expect(gitlabCi).toContain('vagrant reload --no-provision');
    expect(gitlabCi).toContain('vagrant provision --provision-with cold-labview');
    expect(gitlabCi).toContain('vagrant provision --provision-with acceptance');
    expect(gitlabCi).toContain('vagrant halt --force');
    expect(gitlabCi).toContain('npm run vagrant:acceptance:assert -- --receipt-dir vagrant/evidence/assertion');
    expect(gitlabCi).toContain('- vagrant_windows_vsix_acceptance');
    expect(gitlabCi).toContain('- vagrant/evidence/');

    expect(vagrantfile).toContain('VIHS_VAGRANT_CI_VM_NAME');
    expect(vagrantfile).toContain('VM_NAME     = ENV.fetch("VIHS_VAGRANT_CI_VM_NAME", "vihs-ci-win11")');
    expect(vagrantfile).toContain('BOOT_TIMEOUT = ENV.fetch("VIHS_VAGRANT_BOOT_TIMEOUT", "1800").to_i');
    expect(vagrantfile).toContain('WINRM_TIMEOUT = ENV.fetch("VIHS_VAGRANT_WINRM_TIMEOUT", "1800").to_i');
    expect(vagrantfile).toContain(
      'VI_SERVER_TIMEOUT = ENV.fetch("VIHS_VAGRANT_VI_SERVER_TIMEOUT_SEC", "60").to_i'
    );
    expect(vagrantfile).toContain('vb.name   = VM_NAME');
    expect(vagrantfile).toContain('vb.customize ["modifyvm", :id, "--firmware", "efi"]');
    expect(vagrantfile).toContain("Preserve the exported golden VM's UEFI variable store");
    expect(vagrantfile).not.toContain('modifynvram');
    expect(vagrantfile).toContain('config.winrm.timeout       = WINRM_TIMEOUT');
    expect(vagrantfile).toContain('config.vm.boot_timeout = BOOT_TIMEOUT');
    expect(vagrantfile).toContain('config.vm.provision "cold-labview"');
    expect(vagrantfile).toContain('path:       "provision/prepare-cold-labview.ps1"');
    expect(vagrantfile).toContain('args:       ["-ViServerTimeoutSec", VI_SERVER_TIMEOUT.to_s]');
    expect(vagrantfile).not.toContain('vb.name   = "windows11"');

    expect(coldPrep).toContain("'LabVIEW'");
    expect(coldPrep).toContain("'LabVIEWCLI'");
    expect(coldPrep).toContain("'LVCompare'");
    expect(coldPrep).toContain('taskkill.exe /PID $Process.Id /T /F');
    expect(coldPrep).toContain('taskkill.exe /IM "$processName.exe" /T /F');
    expect(coldPrep).toContain('$startupInterloperProcessNames');
    expect(coldPrep).toContain("'msedge'");
    expect(coldPrep).toContain("'OneDrive'");
    expect(coldPrep).toContain("'UserOOBEBroker'");
    expect(coldPrep).toContain('Closing first-run desktop interlopers before LabVIEW launch');
    expect(coldPrep).toContain('Port $ViServerPort is no longer LISTENING.');
    expect(coldPrep).toContain('throw "Port $ViServerPort remained LISTENING');

    expect(bootstrap).toContain('AutoAdminLogon');
    expect(bootstrap).toContain('ForceAutoLogon');
    expect(bootstrap).toContain('DefaultUserName');
    expect(bootstrap).toContain('DefaultPassword');
    expect(bootstrap).toContain('Configuring vagrant autologon for interactive LabVIEW launch');
    expect(bootstrap).toContain('Suppressing Windows consumer backup and welcome prompts for CI desktop');
    expect(bootstrap).toContain('DisableWindowsConsumerFeatures');
    expect(bootstrap).toContain('DisableCloudOptimizedContent');
    expect(bootstrap).toContain('DisableConsumerAccountStateContent');
    expect(bootstrap).toContain('DisableWindowsSpotlightWindowsWelcomeExperience');
    expect(bootstrap).toContain('DisableFileSyncNGSC');
    expect(bootstrap).toContain('ScoobeSystemSettingEnabled');
    expect(bootstrap).toContain('HideFirstRunExperience');
    expect(bootstrap).toContain('BrowserSignin');
    expect(bootstrap).toContain('SyncDisabled');
    expect(bootstrap).toContain('Configuring WinRM for Vagrant communicator after reload');
    expect(bootstrap).toContain('sc.exe config winrm start= auto');
    expect(bootstrap).toContain('Set-NetConnectionProfile');
    expect(bootstrap).not.toContain('Enable-PSRemoting');
    expect(bootstrap).toContain('Test-WSMan -ComputerName localhost');
    expect(bootstrap).toContain('VIHS LabVIEW 2026 VI Server TCP 3363');
    expect(bootstrap).toContain('New-NetFirewallRule');
    expect(bootstrap).toContain('-Program $lvExe');
    expect(bootstrap).toContain('-LocalPort 3363');

    expect(acceptance).toContain('[int]   $ViServerTimeoutSec = 60');
    expect(acceptance).toContain('[int]   $GitTimeoutMs = 300000');
    expect(acceptance).toContain(
      "$LabVIEWStartupEvidencePath = Join-Path $EvidenceRoot 'labview-startup.json'"
    );
    expect(acceptance).toContain(
      "$LabVIEWActivationDialogEvidencePath = Join-Path $EvidenceRoot 'labview-activation-dialog.json'"
    );
    expect(acceptance).toContain(
      "$LabVIEWTimeoutScreenshotPath = Join-Path $EvidenceRoot 'labview-timeout-desktop.png'"
    );
    expect(acceptance).toContain(
      'New-ScheduledTaskAction -Execute $lvExe -WorkingDirectory (Split-Path -Parent $lvExe)'
    );
    expect(acceptance).toContain('New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(15)');
    expect(acceptance).toContain('-AllowStartIfOnBatteries');
    expect(acceptance).toContain("Write-LabVIEWStartupEvidence -Phase 'timeout'");
    expect(acceptance).toContain('labviewIni              = Get-LabVIEWIniSnapshot');
    expect(acceptance).toContain('firewallRules           = @(Get-LabVIEWFirewallSnapshot)');
    expect(acceptance).toContain('interactiveWindows      = @(Get-InteractiveWindowSnapshot)');
    expect(acceptance).toContain('recentEvents            = @(Get-RecentLabVIEWEventSnapshot)');
    expect(acceptance).toContain('timeoutDesktopScreenshot = $desktopScreenshot');
    expect(acceptance).toContain('principalLogonType');
    expect(acceptance).toContain('lastTaskResultHex  = Format-UnsignedHex32');
    expect(acceptance).toContain("vihs-lv-timeout-screenshot");
    expect(acceptance).toContain("vihs-lv-activation-dialog-rescue");
    expect(acceptance).toContain("UIAutomationClient");
    expect(acceptance).toContain("'Begin 7 Day Trial'");
    expect(acceptance).toContain("Invoke-LabVIEWActivationDialogRescue -Reason 'during VI Server wait'");
    expect(acceptance).toContain('[System.Windows.Forms.Screen]::PrimaryScreen.Bounds');
    expect(acceptance).toContain('-WindowStyle Hidden -EncodedCommand $encodedScreenshotCommand');
    expect(acceptance).toContain('$desktopInterloperProcessNames');
    expect(acceptance).toContain("'msedge'");
    expect(acceptance).toContain("'msedgewebview2'");
    expect(acceptance).toContain("'UserOOBEBroker'");
    expect(acceptance).toContain("Stop-DesktopInterloperProcesses -Reason 'before LabVIEW launch'");
    expect(acceptance).toContain("Stop-DesktopInterloperProcesses -Reason 'during VI Server wait'");
    expect(acceptance).toContain('netstat -ano');
    expect(acceptance).toContain(
      'Scheduled task triggered with a near-future fallback. Waiting up to ${ViServerTimeoutSec}s for LabVIEW to initialise VI Server'
    );
    expect(acceptance).toContain('Wait-LabVIEWPort -TimeoutSec $ViServerTimeoutSec');
    expect(acceptance).toContain('$runtimeSettingsLauncher');
    expect(acceptance).toContain('--labview-version $LabVIEWVersion');
    expect(acceptance).toContain('--labview-bitness $LabVIEWBitness');
    expect(acceptance).toContain("'--allow-existing-windows-host-runtime'");
    expect(acceptance).toContain('$env:VI_HISTORY_SUITE_GIT_TIMEOUT_MS = $GitTimeoutMs.ToString()');
    expect(acceptance).toContain("$env:NPM_CONFIG_UPDATE_NOTIFIER = 'false'");
    expect(acceptance).toContain("$env:NO_UPDATE_NOTIFIER = '1'");
    expect(acceptance).toContain(
      "cmd.exe /d /s /c 'npm.cmd install --omit=dev --no-audit --no-fund --update-notifier=false --loglevel=error 2>&1'"
    );

    expect(hostDoctor).toContain('VIHS_VAGRANT_REQUIRE_GITLAB_RUNNER');
    expect(hostDoctor).toContain('VAGRANT_DOTFILE_PATH');
    expect(hostDoctor).toContain('VAGRANT_HOME');
    expect(hostDoctor).toContain('VIHS_VIRTUALBOX_MACHINE_FOLDER');
    expect(hostDoctor).toContain('VirtualBox default machine folder matches VIHS_VIRTUALBOX_MACHINE_FOLDER');
    expect(hostDoctor).toContain('VirtualBox machine folder has enough free space for one VM-size import estimate');
    expect(hostDoctor).toContain('vihs-win11-labview2026-golden');
    expect(hostDoctor).toContain('vihs-ci-win11');
    expect(hostDoctor).toContain('vagrant-reload plugin installed');
    expect(hostDoctor).toContain('Vagrant VirtualBox box payload contains box.ovf');
    expect(hostDoctor).toContain('missing a virtualbox/box.ovf payload');
    expect(hostDoctor).toContain('Docker Engine reachable');
    expect(hostDoctor).toContain("check_command gitlab-runner");
    expect(hostDoctor).toContain('Stale inaccessible disposable VM registry entry');
    expect(hostDoctor).toContain('run scripts/vagrant/cleanup-disposable-ci-vm.sh before booting CI');
    expect(hostDoctor).toContain("Golden VM '$GOLDEN_VM_NAME' exists but is '$vm_state'");
    expect(hostDoctor).toContain("Vagrant CI VM '$CI_VM_NAME' is already running");
    expect(hostDoctor).toContain('Local Vagrant state points at');
    expect(hostDoctor).toContain('remove $VAGRANT_DOTFILE_ROOT before booting CI');

    expect(storageDoctor).toContain('vi-history-suite/vagrant-storage-doctor@v1');
    expect(storageDoctor).toContain('/run/media/sergio/Data/vihs-vagrant');
    expect(storageDoctor).toContain('/run/media/sergio/Data1/vihs-vagrant');
    expect(storageDoctor).toContain('/run/media/sergio/MAJOR GENER/VI History Suite Evidence');
    expect(storageDoctor).toContain('vagrant-storage-doctor.json');
    expect(storageDoctor).toContain('vagrant-storage-doctor.md');
    expect(storageDoctor).toContain('Vagrant active storage drift detected');
    expect(storageDoctor).toContain('Vagrant ${label} symlink points at');
    expect(storageDoctor).toContain('expectedTmpTarget');

    expect(runnerReadiness).toContain('vi-history-suite/vagrant-acceptance-runner-readiness@v1');
    expect(runnerReadiness).toContain('vagrant-runner-readiness-evidence');
    expect(runnerReadiness).toContain('Mount ${activeMountPoint} or restore the active mirror');
    expect(runnerReadiness).toContain('vagrant-acceptance-readiness');
    expect(pipelineFreshness).toContain('vi-history-suite/vagrant-acceptance-pipeline-freshness@v1');
    expect(pipelineFreshness).toContain('vagrant/evidence/pipeline-freshness');
    expect(pipelineFreshness).toContain('skip-vagrant-acceptance');
    expect(pipelineFreshness).toContain('head_pipeline');
    expect(pipelineFreshness).toContain('api-timeout-ms');
    expect(pipelineFreshness).toContain('Freshness API query failed, so run fail-open');
    expect(pipelineFreshness).toContain('A newer non-canceled merge-request pipeline exists');
    expect(runnerReadinessService).toContain('vihs-vagrant-acceptance-readiness.service');
    expect(runnerReadinessService).toContain('/home/sergio/repos/gl/vi-history-suite');
    expect(runnerReadinessService).toContain('npm run vagrant:runner:readiness');
    expect(runnerReadinessService).toContain('--allow-busy');
    expect(runnerReadinessService).toContain('VIHS_VAGRANT_READINESS_ALLOW_BUSY=true');
    expect(runnerReadinessService).toContain(
      '/home/sergio/.gitlab-runner/receipts/vagrant-acceptance-readiness'
    );
    expect(runnerReadinessTimer).toContain('OnStartupSec=2min');
    expect(runnerReadinessTimer).toContain('OnUnitActiveSec=5min');

    expect(prepareHome).toContain('prepare-vagrant-home');
    expect(prepareHome).toContain('VAGRANT_HOME supports chmod');
    expect(prepareHome).toContain('VIHS_VAGRANT_BOX_CACHE_HOME');
    expect(prepareHome).toContain('Linked Vagrant $name to $target');
    expect(prepareHome).toContain('link_cache_path boxes');
    expect(prepareHome).toContain('link_cache_path tmp');
    expect(prepareHome).toContain('does not support chmod');
    expect(prepareHome).toContain('exists and is not an empty directory');

    expect(refreshBox).toContain('VIHS_VAGRANT_GOLDEN_VM_NAME');
    expect(refreshBox).toContain('VIHS_VIRTUALBOX_VM_NAME');
    expect(refreshBox).toContain('VIHS_VAGRANT_STORAGE_ROOT');
    expect(refreshBox).toContain('VAGRANT_HOME');
    expect(refreshBox).toContain('VIHS_VAGRANT_BOX_WORKDIR');
    expect(refreshBox).toContain('vihs-win11-labview2026-golden');
    expect(refreshBox).toContain('must be powered off before packaging');
    expect(refreshBox).toContain('has insufficient free space');
    expect(refreshBox).toContain('mapfile -t exported_files');
    expect(refreshBox).toContain("grep -Fx 'box.ovf'");
    expect(refreshBox).toContain('VBoxManage export "$GOLDEN_VM_NAME"');
    expect(refreshBox).toContain('vagrant box add --force --provider virtualbox "$BOX_NAME" "$BOX_FILE"');

    expect(cleanupCiVm).toContain('cleanup-disposable-ci-vm');
    expect(cleanupCiVm).toContain('Refusing to clean CI VM because it matches golden VM name');
    expect(cleanupCiVm).toContain('VIHS_VIRTUALBOX_MACHINE_FOLDER');
    expect(cleanupCiVm).toContain('Local Vagrant state points at golden VM');
    expect(cleanupCiVm).toContain('Deleting disposable import VM');
    expect(cleanupCiVm).toContain('outside expected disposable machine folder');
    expect(cleanupCiVm).toContain('cleanup_inaccessible_disposable_registry_entries');
    expect(cleanupCiVm).toContain('Unregistering stale inaccessible disposable VM registry entry');
    expect(cleanupCiVm).toContain('Disposable CI VM');
    expect(cleanupCiVm).toContain('is running; halt it before cleanup');
    expect(cleanupCiVm).toContain('VBoxManage unregistervm "$CI_VM_NAME" --delete');
    expect(cleanupCiVm).toContain('Removed orphaned disposable VM directory');
    expect(cleanupCiVm).toContain('Removal attempt $attempt for orphaned disposable VM directory');
    expect(cleanupCiVm).toContain('Quarantined orphaned disposable VM directory');
    expect(cleanupCiVm).toContain('Could not remove or quarantine orphaned disposable VM directory');
    expect(cleanupCiVm).toContain('rm -rf "$VAGRANT_DOTFILE_ROOT"');

    expect(githubWorkflow).toContain('VIHS_VAGRANT_GOLDEN_VM_NAME');
    expect(githubWorkflow).toContain('VIHS_VAGRANT_CI_VM_NAME');
    expect(githubWorkflow).toContain('VIHS_VAGRANT_STORAGE_ROOT');
    expect(githubWorkflow).toContain('VIHS_VAGRANT_STANDBY_ROOT');
    expect(githubWorkflow).toContain('VIHS_EVIDENCE_ARCHIVE_ROOT');
    expect(githubWorkflow).toContain('VIHS_VAGRANT_VI_SERVER_TIMEOUT_SEC');
    expect(githubWorkflow).toContain('VAGRANT_HOME');
    expect(githubWorkflow).toContain('VIHS_VIRTUALBOX_MACHINE_FOLDER');
    expect(githubWorkflow).toContain('node scripts/doctorVagrantStorage.js');
    expect(githubWorkflow).toContain('--fail-on-active-drift');
    expect(githubWorkflow).toContain('VBoxManage setproperty machinefolder "${VIHS_VIRTUALBOX_MACHINE_FOLDER}"');
    expect(githubWorkflow).toContain('VAGRANT_DOTFILE_PATH: .vagrant-ci');
    expect(githubWorkflow).toContain('bash scripts/vagrant/cleanup-disposable-ci-vm.sh');
    expect(githubWorkflow).toContain('rm -rf vagrant/.vagrant');
    expect(githubWorkflow).toContain('bash scripts/vagrant/doctor-vagrant-host.sh');
    expect(githubWorkflow).toContain('bash scripts/vagrant/refresh-golden-box.sh');
    expect(githubWorkflow).toContain('vagrant reload --no-provision');
    expect(githubWorkflow).toContain('vagrant provision --provision-with cold-labview');
    expect(githubWorkflow).toContain(
      'npm run vagrant:acceptance:assert -- --receipt-dir vagrant/evidence/assertion'
    );
    expect(githubWorkflow).not.toContain('.github/scripts/vagrant/prepare-existing-vm-box.sh');
    expect(githubWorkflow).not.toContain('VBoxManage guestcontrol');

    expect(laneDoc).toContain('local-vagrant-windows-acceptance');
    expect(laneDoc).toContain('Windows 11 + LabVIEW 2026 Community x86 VirtualBox guest');
    expect(laneDoc).toContain('glrt-');
    expect(laneDoc).toContain('POST /user/runners');
    expect(laneDoc).toContain('not to legacy registration-token arguments');
    expect(laneDoc).not.toContain('--tag-list "linux,x64,virtualbox,vagrant,private-release"');
    expect(laneDoc).toContain('vihs-win11-labview2026-golden');
    expect(laneDoc).toContain('vihs-ci-win11');
    expect(laneDoc).toContain('/run/media/sergio/Data/vihs-vagrant');
    expect(laneDoc).toContain('/run/media/sergio/Data1/vihs-vagrant');
    expect(laneDoc).toContain('/run/media/sergio/MAJOR GENER/VI History Suite Evidence');
    expect(laneDoc).toContain('scripts/doctorVagrantStorage.js');
    expect(laneDoc).toContain('vagrant-storage-doctor.json');
    expect(laneDoc).toContain('preserves the');
    expect(laneDoc).toContain('exported golden VM UEFI variable store');
    expect(laneDoc).toContain('vagrant/.vagrant');
    expect(laneDoc).toContain('VAGRANT_DOTFILE_PATH=.vagrant-ci');
    expect(laneDoc).toContain('quarantines that directory under the');
    expect(laneDoc).toContain('VIHS_VAGRANT_REFRESH_GOLDEN_BOX=true');
    expect(laneDoc).toContain('VIHS_VAGRANT_BOX_WORKDIR');
    expect(laneDoc).toContain('default LabVIEW VI Server startup timeout: `60` seconds');
    expect(laneDoc).toContain('npm run vagrant:labview-startup:history');
    expect(laneDoc).toContain('near-future trigger inside the wait window');
    expect(laneDoc).toContain('labview-startup.json');
    expect(laneDoc).toContain('labview-timeout-desktop.png');
    expect(laneDoc).toContain('interactive window titles');
    expect(laneDoc).toContain('recent Windows event');
    expect(laneDoc).toContain('suppresses Windows consumer backup and welcome');
    expect(laneDoc).toContain('closes first-run browser/OOBE interlopers');
    expect(laneDoc).toContain('bootstrap provisioner configures `vagrant` autologon and WinRM startup');
    expect(laneDoc).toContain('VIHS LabVIEW 2026 VI Server TCP 3363');
    expect(laneDoc).toContain('immediately after bootstrap');
    expect(laneDoc).toContain('vagrant_windows_vsix_acceptance');
    expect(laneDoc).toContain('needs: [vagrant_runner_admission]');
    expect(laneDoc).toContain('npm run vagrant:acceptance:freshness');
    expect(laneDoc).toContain('vagrant/evidence/pipeline-freshness');
    expect(laneDoc).toContain('5000 ms settle window');
    expect(laneDoc).toContain('10000 ms');
    expect(laneDoc).toContain('older stale duplicate\nmerge-request pipeline');
    expect(laneDoc).toContain('vagrant_runner_admission');
    expect(laneDoc).toContain('vagrant-runner-readiness-evidence/');
    expect(laneDoc).toContain('/home/sergio/.gitlab-runner/receipts/vagrant-acceptance-readiness');
    expect(laneDoc).toContain('npm run vagrant:runner:readiness:history');
    expect(laneDoc).toContain(
      'docs/product/vagrant-runner-readiness-timer-decision-2026-05-15.{md,json}'
    );
    expect(laneDoc).toContain('p50/p90/p95 receipt intervals of `330/330/330` seconds');
    expect(laneDoc).toContain('status: busy');
    expect(laneDoc).toContain('npm run vagrant:acceptance:assert');
    expect(laneDoc).toContain('stale golden-VM');
    expect(laneDoc).toContain('LabVIEW `2026` `x86`');
    expect(laneDoc).toContain('`runtimeProvider=host-native`');
    expect(laneDoc).toContain('`runtimeEngine=labview-cli`');
    expect(laneDoc).toContain('assertion/vagrant-vsix-acceptance-assertion.json');
    expect(laneDoc).toContain('not replace the deferred native Windows x64 private-release proof');
    expect(laneDoc).toContain('VI_HISTORY_SUITE_GIT_TIMEOUT_MS=300000');

    expect(hostedGovernanceDoc).toContain('vagrant-windows-vsix-acceptance');
    expect(hostedGovernanceDoc).toContain('vagrant_windows_vsix_acceptance');
    expect(hostedGovernanceDoc).toContain('resource_group: vihs-windows-vagrant');
    expect(hostedGovernanceDoc).toContain('process_mode: newest_ready_first');
    expect(hostedGovernanceDoc).toContain('npm run vagrant:acceptance:freshness');
    expect(hostedGovernanceDoc).toMatch(/skip stale duplicate\s+merge-request pipelines/);
    expect(hostedGovernanceDoc).toContain('scripts/doctorVagrantStorage.js');
    expect(hostedGovernanceDoc).toContain('vagrant-storage-doctor.json');
    expect(hostedGovernanceDoc).toContain('scripts/vagrant/doctor-vagrant-host.sh');
    expect(hostedGovernanceDoc).toContain('scripts/vagrant/refresh-golden-box.sh');
    expect(hostedGovernanceDoc).toContain('quarantines that directory under the governed machine');
    expect(hostedGovernanceDoc).toContain('near-future scheduled-task');
    expect(hostedGovernanceDoc).toContain('npm run vagrant:acceptance:assert');
    expect(hostedGovernanceDoc).toContain(
      'docs/product/vagrant-runner-readiness-timer-decision-2026-05-15.{md,json}'
    );
    expect(hostedGovernanceDoc).toMatch(/`5`\s+active-storage-drift receipts in `1` incident/);

    expect(timerDecisionDoc).toContain('Keep the current `300` second timer.');
    expect(timerDecisionDoc).toContain('Busy-context receipts: `39`');
    expect(timerDecisionJson).toEqual(
      expect.objectContaining({
        schema: 'vi-history-suite/vagrant-runner-readiness-timer-decision@v1',
        decision: 'keep-current-timer',
        currentTimerSeconds: 300,
        recommendedTimerSeconds: 300,
        adaptiveCandidate: true,
        evidenceSummary: expect.objectContaining({
          receiptCount: 212,
          intervalStatsSec: expect.objectContaining({ p50: 330, p90: 330, p95: 330 })
        }),
        timerDecisionSignals: expect.objectContaining({
          activeStorageDriftIncidentCount: 1,
          activeStorageDriftReceiptCount: 5,
          activeStorageWorstDetectionWindowSec: 687,
          busyContextReceiptCount: 39
        })
      })
    );

    expect(hostedGovernanceJson.authorityGitLab.runnerLanes.vagrantWindowsVsixAcceptance).toEqual(
      expect.objectContaining({
        description: 'local-vagrant-windows-acceptance',
        classification: 'self-hosted-vagrant-windows-vsix-acceptance-lane',
        runnerContractDoc: 'docs/product/vagrant-windows-acceptance-runner-lane.md',
        operatorModel: expect.objectContaining({
          hostUser: 'sergio',
          hostHome: '/home/sergio',
          executor: 'shell',
          shell: 'bash',
          vagrantBox: 'vihs/win11-labview2026',
          goldenVmName: 'vihs-win11-labview2026-golden',
          ciVmName: 'vihs-ci-win11',
          resourceGroup: 'vihs-windows-vagrant',
          resourceGroupProcessMode: 'newest_ready_first',
          vagrantDotfilePath: '.vagrant-ci',
          storageRoot: '/run/media/sergio/Data/vihs-vagrant',
          standbyStorageRoot: '/run/media/sergio/Data1/vihs-vagrant',
          evidenceVaultRoot: '/run/media/sergio/MAJOR GENER/VI History Suite Evidence',
          vagrantHome: '/home/sergio/.vagrant.d',
          vagrantBoxCacheHome: '/run/media/sergio/Data/vihs-vagrant/vagrant-home',
          vagrantTmpCacheHome: '/run/media/sergio/Data/vihs-vagrant/vagrant-home/tmp',
          boxFile: '/run/media/sergio/Data/vihs-vagrant/box-cache/windows11.box',
          boxWorkdir: '/run/media/sergio/Data/vihs-vagrant/box-work',
          virtualBoxMachineFolder: '/run/media/sergio/Data/vihs-vagrant/VirtualBox VMs',
          repoOwnedStorageDoctorScript: 'scripts/doctorVagrantStorage.js',
          repoOwnedStorageDoctorPackageScript: 'npm run vagrant:storage:doctor',
          repoOwnedRunnerReadinessScript: 'scripts/runVagrantAcceptanceRunnerReadiness.js',
          repoOwnedRunnerReadinessPackageScript: 'npm run vagrant:runner:readiness',
          runnerReadinessSchema: 'vi-history-suite/vagrant-acceptance-runner-readiness@v1',
          runnerReadinessEvidenceRoot: 'vagrant-runner-readiness-evidence/',
          runnerReadinessReceiptRoot:
            '/home/sergio/.gitlab-runner/receipts/vagrant-acceptance-readiness',
          runnerReadinessSystemdService:
            'scripts/gitlab-runner/linux/vihs-vagrant-acceptance-readiness.service',
          runnerReadinessSystemdTimer:
            'scripts/gitlab-runner/linux/vihs-vagrant-acceptance-readiness.timer',
          runnerReadinessSystemdBusyMode: '--allow-busy',
          runnerReadinessBusyStatus: 'busy',
          runnerReadinessAdmissionBusyPolicy:
            'fail-closed-before-vagrant-windows-vsix-acceptance',
          runnerReadinessHistoryPackageScript: 'npm run vagrant:runner:readiness:history',
          runnerReadinessTimerDecision: expect.objectContaining({
            packet: 'docs/product/vagrant-runner-readiness-timer-decision-2026-05-15.json',
            decision: 'keep-current-timer',
            currentTimerSeconds: 300,
            recommendedTimerSeconds: 300,
            observedCadenceP50Seconds: 330,
            observedCadenceP90Seconds: 330,
            observedCadenceP95Seconds: 330,
            activeStorageDriftIncidentCount: 1,
            activeStorageDriftReceiptCount: 5,
            activeStorageWorstDetectionWindowSeconds: 687,
            busyContextReceiptCount: 39,
            adaptiveCandidate: true
          }),
          repoOwnedPipelineFreshnessScript: 'scripts/checkGitLabVagrantPipelineFreshness.js',
          repoOwnedPipelineFreshnessPackageScript: 'npm run vagrant:acceptance:freshness',
          pipelineFreshnessSchema:
            'vi-history-suite/vagrant-acceptance-pipeline-freshness@v1',
          pipelineFreshnessEvidenceRoot: 'vagrant/evidence/pipeline-freshness',
          staleMergeRequestPipelinePolicy:
            'skip-stale-duplicate-merge-request-pipeline-before-vagrant-boot',
          repoOwnedDoctorScript: 'scripts/vagrant/doctor-vagrant-host.sh',
          repoOwnedRefreshScript: 'scripts/vagrant/refresh-golden-box.sh',
          repoOwnedPrepareHomeScript: 'scripts/vagrant/prepare-vagrant-home.sh',
          repoOwnedCleanupScript: 'scripts/vagrant/cleanup-disposable-ci-vm.sh',
          disposableDirectoryCleanupPolicy:
            'retry-orphaned-ci-vm-directory-removal-then-quarantine-under-governed-machine-folder',
          repoOwnedColdPrepScript: 'vagrant/provision/prepare-cold-labview.ps1',
          repoOwnedAcceptanceAssertionScript: 'scripts/assertVagrantVsixAcceptanceEvidence.js',
          repoOwnedAcceptanceAssertionPackageScript: 'npm run vagrant:acceptance:assert',
          bootstrapInteractiveSessionPolicy: 'bootstrap-configures-vagrant-autologon-and-winrm-then-job-reloads-before-cold-labview',
          bootstrapPromptSuppressionPolicy:
            'disable-windows-consumer-backup-and-welcome-prompts-before-post-bootstrap-reload',
          coldPrepDesktopInterloperPolicy:
            'close-first-run-browser-oobe-interlopers-before-labview-launch',
          acceptanceDesktopInterloperPolicy:
            'close-first-run-browser-oobe-interlopers-before-and-during-vi-server-wait',
          labviewPrelaunchFallbackPolicy:
            'manual-start-plus-near-future-one-shot-trigger-inside-vi-server-wait-window',
          labviewViServerTimeoutSeconds: 60,
          labviewStartupHistoryPackageScript: 'npm run vagrant:labview-startup:history',
          harnessGitTimeoutMs: 300000,
          labviewStartupEvidencePath: 'vagrant/evidence/labview-startup.json',
          labviewTimeoutScreenshotPath: 'vagrant/evidence/labview-timeout-desktop.png',
          goldenRefreshVariable: 'VIHS_VAGRANT_REFRESH_GOLDEN_BOX=true',
          goldenRefreshWorkdirVariable: 'VIHS_VAGRANT_BOX_WORKDIR'
        })
      })
    );
    expect(
      hostedGovernanceJson.authorityGitLab.runnerLanes.vagrantWindowsVsixAcceptance.operatorModel
        .registration
    ).toEqual(
      expect.objectContaining({
        tokenType: 'runner-authentication-token',
        tokenPrefix: 'glrt-',
        creationApi: 'POST /user/runners',
        locked: true,
        runUntagged: false,
        maximumTimeoutSeconds: 7200
      })
    );
    expect(
      hostedGovernanceJson.authorityGitLab.runnerLanes.vagrantWindowsVsixAcceptance.operatorModel
        .hostDoctorChecks
    ).toContain('no-stale-inaccessible-disposable-registry-entry');
    expect(
      hostedGovernanceJson.authorityGitLab.runnerLanes.vagrantWindowsVsixAcceptance.operatorModel
        .hostDoctorChecks
    ).toContain('continuous-readiness-receipt');
    expect(
      hostedGovernanceJson.authorityGitLab.runnerLanes.vagrantWindowsVsixAcceptance.operatorModel
        .storageDoctorChecks
    ).toContain('active-root-mounted');
    expect(
      hostedGovernanceJson.authorityGitLab.runnerLanes.vagrantWindowsVsixAcceptance.operatorModel
        .cleanupChecks
    ).toContain('unregister-stale-inaccessible-disposable-registry-entry');
    expect(hostedGovernanceJson.authorityGitLab.jobs.vagrant_runner_admission).toEqual(
      expect.objectContaining({
        classification: 'required-vagrant-runner-readiness-admission',
        stage: 'admission',
        evidenceRoot: 'vagrant-runner-readiness-evidence/',
        readinessScript: 'scripts/runVagrantAcceptanceRunnerReadiness.js',
        readinessPackageScript: 'npm run vagrant:runner:readiness',
        failurePolicy: 'fail-closed-in-admission-before-vagrant-windows-vsix-acceptance'
      })
    );
    expect(hostedGovernanceJson.authorityGitLab.jobs.vagrant_windows_vsix_acceptance).toEqual(
      expect.objectContaining({
        classification: 'required-vagrant-windows-vsix-acceptance',
        stage: 'test',
        resourceGroup: 'vihs-windows-vagrant',
        resourceGroupProcessMode: 'newest_ready_first',
        requiredNeeds: ['vagrant_runner_admission'],
        dagStart: true,
        evidenceRoot: 'vagrant/evidence/',
        pipelineFreshnessScript: 'scripts/checkGitLabVagrantPipelineFreshness.js',
        pipelineFreshnessPackageScript: 'npm run vagrant:acceptance:freshness',
        pipelineFreshnessEvidenceRoot: 'vagrant/evidence/pipeline-freshness',
        staleMergeRequestPipelinePolicy:
          'skip-stale-duplicate-merge-request-pipeline-before-vagrant-boot',
        storageDoctorScript: 'scripts/doctorVagrantStorage.js',
        storageDoctorPackageScript: 'npm run vagrant:storage:doctor',
        assertionPackageScript: 'npm run vagrant:acceptance:assert',
        assertionReceiptRoot: 'vagrant/evidence/assertion'
      })
    );
    expect(hostedGovernanceJson.authorityGitLab.jobs.package_extension_preview.requiredNeeds).toContain(
      'vagrant_windows_vsix_acceptance'
    );
    expect(hostedGovernanceJson.authorityGitLab.jobs.release_extension.requiredNeeds).toContain(
      'vagrant_windows_vsix_acceptance'
    );

    expect(packageManifest.scripts?.['vagrant:host:doctor']).toBe(
      'bash scripts/vagrant/doctor-vagrant-host.sh'
    );
    expect(packageManifest.scripts?.['vagrant:home:prepare']).toBe(
      'bash scripts/vagrant/prepare-vagrant-home.sh'
    );
    expect(packageManifest.scripts?.['vagrant:ci:cleanup']).toBe(
      'bash scripts/vagrant/cleanup-disposable-ci-vm.sh'
    );
    expect(packageManifest.scripts?.['vagrant:storage:doctor']).toBe(
      'node scripts/doctorVagrantStorage.js'
    );
    expect(packageManifest.scripts?.['vagrant:runner:readiness']).toBe(
      'node scripts/runVagrantAcceptanceRunnerReadiness.js'
    );
    expect(packageManifest.scripts?.['vagrant:runner:readiness:history']).toBe(
      'node scripts/summarizeVagrantRunnerReadinessHistory.js'
    );
    expect(packageManifest.scripts?.['vagrant:acceptance:freshness']).toBe(
      'node scripts/checkGitLabVagrantPipelineFreshness.js'
    );
    expect(packageManifest.scripts?.['vagrant:labview-startup:history']).toBe(
      'node scripts/summarizeVagrantLabviewStartupHistory.js'
    );
    expect(packageManifest.scripts?.['vagrant:golden:refresh']).toBe(
      'bash scripts/vagrant/refresh-golden-box.sh'
    );
    expect(packageManifest.scripts?.['vagrant:acceptance:assert']).toBe(
      'node scripts/assertVagrantVsixAcceptanceEvidence.js'
    );
  });
});
