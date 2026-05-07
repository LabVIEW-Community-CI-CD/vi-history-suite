# Vagrant Windows VSIX Acceptance Runner Lane

## Purpose

Retain a GitLab self-hosted Vagrant lane that installs the packaged VSIX into
a Windows 11 + LabVIEW 2026 VirtualBox guest and runs the governed
`HARNESS-VHS-002` report-smoke proof.

This lane proves the Vagrant VM acceptance path for the extension package. It
does not replace the deferred native Windows x64 private-release proof or the
Windows-container proof retained in
[windows-private-release-runner-lane.md](./windows-private-release-runner-lane.md).

## Runner Identity

Governed registration contract:

- description: `local-vagrant-windows-acceptance`
- executor: Linux shell executor
- admitted host user: `sergio`
- admitted host home: `/home/sergio`
- tags:
  - `linux`
  - `x64`
  - `virtualbox`
  - `vagrant`
  - `private-release`
- locked: `true`
- run untagged: `false`
- maximum timeout: `7200`
- large-drive storage root: `/run/media/sergio/Data1/vihs-vagrant`

Registration uses GitLab's current runner creation workflow: create the runner
configuration first, receive a runner authentication token with the `glrt-`
prefix, then register the local runner manager with that token. Tags, locked
state, untagged-job behavior, and maximum timeout belong to the runner
configuration created in GitLab, not to legacy registration-token arguments.

API runner configuration creation:

```bash
curl --request POST \
  --header "PRIVATE-TOKEN: <personal-access-token>" \
  --url "https://gitlab.com/api/v4/user/runners" \
  --data "runner_type=project_type" \
  --data "project_id=<vi-history-suite-project-id>" \
  --data "description=local-vagrant-windows-acceptance" \
  --data "tag_list=linux,x64,virtualbox,vagrant,private-release" \
  --data "locked=true" \
  --data "run_untagged=false" \
  --data "maximum_timeout=7200"
```

Local runner-manager registration:

```bash
gitlab-runner register \
  --non-interactive \
  --url "https://gitlab.com/" \
  --token "<runner-auth-token>" \
  --executor "shell" \
  --shell "bash" \
  --description "local-vagrant-windows-acceptance"
```

Official GitLab references:

- [Registering runners](https://docs.gitlab.com/runner/register/)
- [The Shell executor](https://docs.gitlab.com/runner/executors/shell/)
- [POST /user/runners](https://docs.gitlab.com/api/users/#create-a-runner-linked-to-a-user)

## Golden VM Contract

- golden VM name: `vihs-win11-labview2026-golden`
- disposable CI VM name: `vihs-ci-win11`
- Vagrant box: `vihs/win11-labview2026`
- Vagrantfile surface: `vagrant/Vagrantfile`
- Vagrant dotfile path: `vagrant/.vagrant-ci`
- Vagrant home: `/run/media/sergio/Data1/vihs-vagrant/vagrant-home`
- box output file: `/run/media/sergio/Data1/vihs-vagrant/box-cache/windows11.box`
- box export work root: `/run/media/sergio/Data1/vihs-vagrant/box-work`
- VirtualBox default machine folder:
  `/run/media/sergio/Data1/vihs-vagrant/VirtualBox VMs`
- default Windows boot/WinRM timeout: `1800` seconds each, overridable with
  `VIHS_VAGRANT_BOOT_TIMEOUT` and `VIHS_VAGRANT_WINRM_TIMEOUT`
- box refresh script: `scripts/vagrant/refresh-golden-box.sh`
- host doctor script: `scripts/vagrant/doctor-vagrant-host.sh`
- disposable CI VM cleanup script:
  `scripts/vagrant/cleanup-disposable-ci-vm.sh`
- guest cold-prep provisioner: `vagrant/provision/prepare-cold-labview.ps1`
- optional export workspace override:
  `VIHS_VAGRANT_BOX_WORKDIR=<directory with enough free space>`

The golden VM is operator-owned and must be powered off before box refresh. CI
must not run acceptance directly on the golden VM. The GitLab job uses the
registered Vagrant box and names the imported VirtualBox VM `vihs-ci-win11` so
golden-source and CI-runtime state remain distinct.

CI first runs `scripts/vagrant/cleanup-disposable-ci-vm.sh`, which refuses to
touch the golden VM, fails if the disposable CI VM is running, deletes only a
stopped VM named `vihs-ci-win11`, and removes the active `.vagrant-ci` state.
The job then runs Vagrant with `VAGRANT_DOTFILE_PATH=.vagrant-ci` and
`VAGRANT_HOME=/run/media/sergio/Data1/vihs-vagrant/vagrant-home`. The CI job
also sets the VirtualBox default machine folder to
`/run/media/sergio/Data1/vihs-vagrant/VirtualBox VMs` before importing the
disposable VM so the root filesystem does not need to hold the large Windows
box or clone. The host doctor fails closed when the active VirtualBox machine
folder does not match this large-drive path, or when existing Vagrant state for
the active dotfile path points at any VM other than `vihs-ci-win11`.

Golden box refresh is manual and variable-gated. Set
`VIHS_VAGRANT_REFRESH_GOLDEN_BOX=true` only for an operator-controlled refresh.

## GitLab Job

The blocking job is `vagrant_windows_vsix_acceptance`.

It runs in the `test` stage on the Vagrant runner tags, serializes access with
`resource_group: vihs-windows-vagrant`, and declares `needs: []` so it can
start as an independent DAG job without waiting for the separate Linux
assurance runner lane. It packages the VSIX, stages it under `vagrant/shared/`,
optionally refreshes the local box, runs the host doctor, boots the disposable
VM, runs bootstrap, runs the guest cold-prep provisioner, runs acceptance,
validates the latest manifest, and always halts the VM.

The job retains `vagrant/evidence/`, including:

- `vagrant-host-doctor.log`
- `refresh-golden-box.log` when a manual refresh is requested
- `labview-cold-prep.log`
- `acceptance-provision.log`
- `*/manifest.json`
- `*/proof-run.txt`
- `*/harness-report/**`

## Stop Rules

The lane fails closed when:

- `gitlab-runner`, Vagrant, VirtualBox, Docker, Node, npm, or `vagrant-reload`
  are missing from the host contract
- the registered `vihs/win11-labview2026` box is missing
- the registered box is missing its VirtualBox `box.ovf` payload
- the golden VM is missing or not powered off during host doctor/refresh
- the refresh work root or box output directory does not have enough free space
- the configured VirtualBox machine folder is not the large-drive path or lacks
  enough free space for a one-VM import estimate
- a stale `vihs-ci-win11` VM is already running during cleanup
- local Vagrant metadata points at any VM other than `vihs-ci-win11`
- ignored local Vagrant metadata for the active dotfile path points at a VM other than
  `vihs-ci-win11`
- cold prep cannot clear `LabVIEW`, `LabVIEWCLI`, `LVCompare`, or VI Server
  port `3363`
- acceptance does not exercise the cold scheduled-task LabVIEW launch path
- the latest acceptance manifest does not report `proofExitCode = 0` and
  `runtimeExecutionState = succeeded`
