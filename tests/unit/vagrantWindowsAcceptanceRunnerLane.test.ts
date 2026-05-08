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
    const coldPrep = readText('vagrant/provision/prepare-cold-labview.ps1');
    const hostDoctor = readText('scripts/vagrant/doctor-vagrant-host.sh');
    const refreshBox = readText('scripts/vagrant/refresh-golden-box.sh');
    const cleanupCiVm = readText('scripts/vagrant/cleanup-disposable-ci-vm.sh');
    const laneDoc = readText('docs/product/vagrant-windows-acceptance-runner-lane.md');
    const hostedGovernanceDoc = readText('docs/product/hosted-ci-governance.md');
    const hostedGovernanceJson = readJson<any>('docs/product/hosted-ci-governance.json');
    const packageManifest = readJson<{ scripts?: Record<string, string> }>('package.json');

    expect(gitlabCi).toContain('vagrant_windows_vsix_acceptance:');
    expect(gitlabCi).toContain('resource_group: vihs-windows-vagrant');
    expect(gitlabCi).toContain('needs: []');
    expect(gitlabCi).toContain('VAGRANT_DOTFILE_PATH: .vagrant-ci');
    expect(gitlabCi).toContain('bash scripts/vagrant/cleanup-disposable-ci-vm.sh');
    expect(gitlabCi).toContain('rm -rf vagrant/.vagrant');
    expect(gitlabCi).toContain('- virtualbox');
    expect(gitlabCi).toContain('- vagrant');
    expect(gitlabCi).toContain('VIHS_VAGRANT_GOLDEN_VM_NAME: vihs-win11-labview2026-golden');
    expect(gitlabCi).toContain('VIHS_VAGRANT_CI_VM_NAME: vihs-ci-win11');
    expect(gitlabCi).toContain('VIHS_VAGRANT_STORAGE_ROOT: /run/media/sergio/Data/vihs-vagrant');
    expect(gitlabCi).toContain('VAGRANT_HOME: /run/media/sergio/Data/vihs-vagrant/vagrant-home');
    expect(gitlabCi).toContain('VIHS_VAGRANT_BOX_FILE: /run/media/sergio/Data/vihs-vagrant/box-cache/windows11.box');
    expect(gitlabCi).toContain('VIHS_VAGRANT_BOX_WORKDIR: /run/media/sergio/Data/vihs-vagrant/box-work');
    expect(gitlabCi).toContain('VIHS_VIRTUALBOX_MACHINE_FOLDER: "/run/media/sergio/Data/vihs-vagrant/VirtualBox VMs"');
    expect(gitlabCi).toContain('VBoxManage setproperty machinefolder "${VIHS_VIRTUALBOX_MACHINE_FOLDER}"');
    expect(gitlabCi).toContain('bash scripts/vagrant/doctor-vagrant-host.sh');
    expect(gitlabCi).toContain('bash scripts/vagrant/refresh-golden-box.sh');
    expect(gitlabCi).toContain('vagrant reload --no-provision');
    expect(gitlabCi).toContain('vagrant provision --provision-with cold-labview');
    expect(gitlabCi).toContain('vagrant provision --provision-with acceptance');
    expect(gitlabCi).toContain('vagrant halt --force');
    expect(gitlabCi).toContain('runtimeExecutionState');
    expect(gitlabCi).toContain('- vagrant_windows_vsix_acceptance');
    expect(gitlabCi).toContain('- vagrant/evidence/');

    expect(vagrantfile).toContain('VIHS_VAGRANT_CI_VM_NAME');
    expect(vagrantfile).toContain('VM_NAME     = ENV.fetch("VIHS_VAGRANT_CI_VM_NAME", "vihs-ci-win11")');
    expect(vagrantfile).toContain('BOOT_TIMEOUT = ENV.fetch("VIHS_VAGRANT_BOOT_TIMEOUT", "1800").to_i');
    expect(vagrantfile).toContain('WINRM_TIMEOUT = ENV.fetch("VIHS_VAGRANT_WINRM_TIMEOUT", "1800").to_i');
    expect(vagrantfile).toContain('vb.name   = VM_NAME');
    expect(vagrantfile).toContain('vb.customize ["modifyvm", :id, "--firmware", "efi"]');
    expect(vagrantfile).toContain("Preserve the exported golden VM's UEFI variable store");
    expect(vagrantfile).not.toContain('modifynvram');
    expect(vagrantfile).toContain('config.winrm.timeout       = WINRM_TIMEOUT');
    expect(vagrantfile).toContain('config.vm.boot_timeout = BOOT_TIMEOUT');
    expect(vagrantfile).toContain('config.vm.provision "cold-labview"');
    expect(vagrantfile).toContain('path:       "provision/prepare-cold-labview.ps1"');
    expect(vagrantfile).not.toContain('vb.name   = "windows11"');

    expect(coldPrep).toContain("'LabVIEW'");
    expect(coldPrep).toContain("'LabVIEWCLI'");
    expect(coldPrep).toContain("'LVCompare'");
    expect(coldPrep).toContain('taskkill.exe /PID $Process.Id /T /F');
    expect(coldPrep).toContain('taskkill.exe /IM "$processName.exe" /T /F');
    expect(coldPrep).toContain('Port $ViServerPort is no longer LISTENING.');
    expect(coldPrep).toContain('throw "Port $ViServerPort remained LISTENING');

    expect(bootstrap).toContain('AutoAdminLogon');
    expect(bootstrap).toContain('ForceAutoLogon');
    expect(bootstrap).toContain('DefaultUserName');
    expect(bootstrap).toContain('DefaultPassword');
    expect(bootstrap).toContain('Configuring vagrant autologon for interactive LabVIEW launch');
    expect(bootstrap).toContain('Configuring WinRM for Vagrant communicator after reload');
    expect(bootstrap).toContain('sc.exe config winrm start= auto');
    expect(bootstrap).toContain('winrm quickconfig -quiet');

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
    expect(hostDoctor).toContain("Golden VM '$GOLDEN_VM_NAME' exists but is '$vm_state'");
    expect(hostDoctor).toContain("Vagrant CI VM '$CI_VM_NAME' is already running");
    expect(hostDoctor).toContain('Local Vagrant state points at');
    expect(hostDoctor).toContain('remove $VAGRANT_DOTFILE_ROOT before booting CI');

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
    expect(cleanupCiVm).toContain('Disposable CI VM');
    expect(cleanupCiVm).toContain('is running; halt it before cleanup');
    expect(cleanupCiVm).toContain('VBoxManage unregistervm "$CI_VM_NAME" --delete');
    expect(cleanupCiVm).toContain('Removed orphaned disposable VM directory');
    expect(cleanupCiVm).toContain('rm -rf "$VAGRANT_DOTFILE_ROOT"');

    expect(githubWorkflow).toContain('VIHS_VAGRANT_GOLDEN_VM_NAME');
    expect(githubWorkflow).toContain('VIHS_VAGRANT_CI_VM_NAME');
    expect(githubWorkflow).toContain('VIHS_VAGRANT_STORAGE_ROOT');
    expect(githubWorkflow).toContain('VAGRANT_HOME');
    expect(githubWorkflow).toContain('VIHS_VIRTUALBOX_MACHINE_FOLDER');
    expect(githubWorkflow).toContain('VBoxManage setproperty machinefolder "${VIHS_VIRTUALBOX_MACHINE_FOLDER}"');
    expect(githubWorkflow).toContain('VAGRANT_DOTFILE_PATH: .vagrant-ci');
    expect(githubWorkflow).toContain('bash scripts/vagrant/cleanup-disposable-ci-vm.sh');
    expect(githubWorkflow).toContain('rm -rf vagrant/.vagrant');
    expect(githubWorkflow).toContain('bash scripts/vagrant/doctor-vagrant-host.sh');
    expect(githubWorkflow).toContain('bash scripts/vagrant/refresh-golden-box.sh');
    expect(githubWorkflow).toContain('vagrant reload --no-provision');
    expect(githubWorkflow).toContain('vagrant provision --provision-with cold-labview');
    expect(githubWorkflow).not.toContain('.github/scripts/vagrant/prepare-existing-vm-box.sh');
    expect(githubWorkflow).not.toContain('VBoxManage guestcontrol');

    expect(laneDoc).toContain('local-vagrant-windows-acceptance');
    expect(laneDoc).toContain('glrt-');
    expect(laneDoc).toContain('POST /user/runners');
    expect(laneDoc).toContain('not to legacy registration-token arguments');
    expect(laneDoc).not.toContain('--tag-list "linux,x64,virtualbox,vagrant,private-release"');
    expect(laneDoc).toContain('vihs-win11-labview2026-golden');
    expect(laneDoc).toContain('vihs-ci-win11');
    expect(laneDoc).toContain('/run/media/sergio/Data/vihs-vagrant');
    expect(laneDoc).toContain('preserves the');
    expect(laneDoc).toContain('exported golden VM UEFI variable store');
    expect(laneDoc).toContain('vagrant/.vagrant');
    expect(laneDoc).toContain('VAGRANT_DOTFILE_PATH=.vagrant-ci');
    expect(laneDoc).toContain('VIHS_VAGRANT_REFRESH_GOLDEN_BOX=true');
    expect(laneDoc).toContain('VIHS_VAGRANT_BOX_WORKDIR');
    expect(laneDoc).toContain('bootstrap provisioner configures `vagrant` autologon and WinRM startup');
    expect(laneDoc).toContain('job reloads the VM immediately after');
    expect(laneDoc).toContain('vagrant_windows_vsix_acceptance');
    expect(laneDoc).toContain('needs: []');
    expect(laneDoc).toContain('not replace the deferred native Windows x64 private-release proof');

    expect(hostedGovernanceDoc).toContain('vagrant-windows-vsix-acceptance');
    expect(hostedGovernanceDoc).toContain('vagrant_windows_vsix_acceptance');
    expect(hostedGovernanceDoc).toContain('resource_group: vihs-windows-vagrant');
    expect(hostedGovernanceDoc).toContain('scripts/vagrant/doctor-vagrant-host.sh');
    expect(hostedGovernanceDoc).toContain('scripts/vagrant/refresh-golden-box.sh');

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
          vagrantDotfilePath: '.vagrant-ci',
          storageRoot: '/run/media/sergio/Data/vihs-vagrant',
          vagrantHome: '/run/media/sergio/Data/vihs-vagrant/vagrant-home',
          boxFile: '/run/media/sergio/Data/vihs-vagrant/box-cache/windows11.box',
          boxWorkdir: '/run/media/sergio/Data/vihs-vagrant/box-work',
          virtualBoxMachineFolder: '/run/media/sergio/Data/vihs-vagrant/VirtualBox VMs',
          repoOwnedDoctorScript: 'scripts/vagrant/doctor-vagrant-host.sh',
          repoOwnedRefreshScript: 'scripts/vagrant/refresh-golden-box.sh',
          repoOwnedCleanupScript: 'scripts/vagrant/cleanup-disposable-ci-vm.sh',
          repoOwnedColdPrepScript: 'vagrant/provision/prepare-cold-labview.ps1',
          bootstrapInteractiveSessionPolicy: 'bootstrap-configures-vagrant-autologon-and-winrm-then-job-reloads-before-cold-labview',
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
    expect(hostedGovernanceJson.authorityGitLab.jobs.vagrant_windows_vsix_acceptance).toEqual(
      expect.objectContaining({
        classification: 'required-vagrant-windows-vsix-acceptance',
        stage: 'test',
        resourceGroup: 'vihs-windows-vagrant',
        requiredNeeds: [],
        dagStart: true,
        evidenceRoot: 'vagrant/evidence/'
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
    expect(packageManifest.scripts?.['vagrant:ci:cleanup']).toBe(
      'bash scripts/vagrant/cleanup-disposable-ci-vm.sh'
    );
    expect(packageManifest.scripts?.['vagrant:golden:refresh']).toBe(
      'bash scripts/vagrant/refresh-golden-box.sh'
    );
  });
});
