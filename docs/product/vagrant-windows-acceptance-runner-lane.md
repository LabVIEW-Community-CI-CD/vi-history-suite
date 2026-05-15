# Vagrant Windows VSIX Acceptance Runner Lane

## Purpose

Retain a GitLab self-hosted Vagrant lane that installs the packaged VSIX into
a Windows 11 + LabVIEW 2026 Community x86 VirtualBox guest and runs the
governed `HARNESS-VHS-002` report-smoke proof.

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
- large-drive storage root: `/run/media/sergio/Data/vihs-vagrant`

## Runner Storage Topology

The lane uses a fixed three-drive topology:

- active Vagrant execution root: `/run/media/sergio/Data/vihs-vagrant`
- standby Vagrant mirror root: `/run/media/sergio/Data1/vihs-vagrant`
- local evidence vault:
  `/run/media/sergio/MAJOR GENER/VI History Suite Evidence`

Active Vagrant and VirtualBox execution stays on `Data`. `Data1` is a manual
standby/mirror and is not an automatic CI fallback. The Seagate drive is for
retained evidence packets, VSIX snapshots, and release/archive bundles; it is
not used as an active VM execution root. Operator-controlled evidence copies
can use `scripts/local/archiveReleaseEvidence.sh --source <evidence-dir>
--release <version>`, which copies evidence into the Seagate vault and writes
an archive manifest plus SHA-256 list without deleting or moving the source.

The repo-owned storage doctor is `scripts/doctorVagrantStorage.js`, exposed as
`npm run vagrant:storage:doctor`. It runs before the job creates Data-drive
Vagrant directories and retains `vagrant/evidence/vagrant-storage-doctor.json`
plus `vagrant/evidence/vagrant-storage-doctor.md`. The doctor fails closed for
active storage drift: missing or unmounted active root, non-writable active
root, missing active core assets, a `/home/sergio/.vagrant.d/boxes` symlink
that points anywhere other than
`/run/media/sergio/Data/vihs-vagrant/vagrant-home/boxes`, or a
`/home/sergio/.vagrant.d/tmp` symlink that points anywhere other than
`/run/media/sergio/Data/vihs-vagrant/vagrant-home/tmp`. Standby and archive
availability are reported as warnings unless the doctor is explicitly run with
stricter flags.

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
- Vagrant home: `/home/sergio/.vagrant.d`
- Vagrant large box cache: `/run/media/sergio/Data/vihs-vagrant/vagrant-home`
- box output file: `/run/media/sergio/Data/vihs-vagrant/box-cache/windows11.box`
- box export work root: `/run/media/sergio/Data/vihs-vagrant/box-work`
- VirtualBox default machine folder:
  `/run/media/sergio/Data/vihs-vagrant/VirtualBox VMs`
- standby Vagrant mirror root: `/run/media/sergio/Data1/vihs-vagrant`
- evidence vault root:
  `/run/media/sergio/MAJOR GENER/VI History Suite Evidence`
- default Windows boot/WinRM timeout: `1800` seconds each, overridable with
  `VIHS_VAGRANT_BOOT_TIMEOUT` and `VIHS_VAGRANT_WINRM_TIMEOUT`
- default LabVIEW VI Server startup timeout: `60` seconds after the
  interactive scheduled-task launch, overridable with
  `VIHS_VAGRANT_VI_SERVER_TIMEOUT_SEC`; the prelaunch task is manually started
  and also has a near-future trigger inside the wait window
- disposable clone boot policy: Vagrant sets EFI firmware and preserves the
  exported golden VM UEFI variable store so BitLocker sees the same measured
  boot state in the disposable clone
- box refresh script: `scripts/vagrant/refresh-golden-box.sh`
- storage doctor script: `scripts/doctorVagrantStorage.js`
- runner readiness script: `scripts/runVagrantAcceptanceRunnerReadiness.js`
- runner readiness package command: `npm run vagrant:runner:readiness`
- runner readiness history package command:
  `npm run vagrant:runner:readiness:history`
- acceptance pipeline freshness command:
  `npm run vagrant:acceptance:freshness`
- acceptance pipeline freshness evidence:
  `vagrant/evidence/pipeline-freshness`
- runner readiness systemd assets:
  `scripts/gitlab-runner/linux/vihs-vagrant-acceptance-readiness.service` and
  `scripts/gitlab-runner/linux/vihs-vagrant-acceptance-readiness.timer`
- host doctor script: `scripts/vagrant/doctor-vagrant-host.sh`
- Vagrant home prepare script: `scripts/vagrant/prepare-vagrant-home.sh`
- disposable CI VM cleanup script:
  `scripts/vagrant/cleanup-disposable-ci-vm.sh`
- guest cold-prep provisioner: `vagrant/provision/prepare-cold-labview.ps1`
- optional export workspace override:
  `VIHS_VAGRANT_BOX_WORKDIR=<directory with enough free space>`

The golden VM is operator-owned and must be powered off before box refresh. CI
must not run acceptance directly on the golden VM. The GitLab job uses the
registered Vagrant box and names the imported VirtualBox VM `vihs-ci-win11` so
golden-source and CI-runtime state remain distinct.

GitLab first runs `vagrant_runner_admission`, which executes
`npm run vagrant:runner:readiness` and retains
`vagrant-runner-readiness-evidence/` before the long acceptance lane can start.
The same readiness wrapper is also available to the runner host through the
user-mode readiness timer, which publishes latest/timestamped receipts under
`/home/sergio/.gitlab-runner/receipts/vagrant-acceptance-readiness`. Both
checks keep `/run/media/sergio/Data1/vihs-vagrant` as a manual standby mirror:
they tell the operator to mount `/run/media/sergio/Data` or restore the active
mirror, and they do not automatically fall back to the standby drive.
GitLab admission does not allow busy states: if `vihs-ci-win11` is already
running or the golden VM is active, admission fails before the long lane starts.
The systemd timer runs the same wrapper with `--allow-busy` so expected VM
activity is retained as a `status: busy` receipt and does not mark the timer
unit failed; active storage drift and unrelated host-doctor drift still fail.
`npm run vagrant:runner:readiness:history` summarizes those timestamped
receipts for timer tuning. The
`docs/product/vagrant-runner-readiness-timer-decision-2026-05-15.{md,json}`
follow-up retained `212` receipts across the repair and protected-branch proof
window, with p50/p90/p95 receipt intervals of `330/330/330` seconds, `5`
active-storage-drift receipts in `1` incident, and a worst observed active-root
detection window of `687` seconds. Because the same history also contains `39`
busy-context receipts while `vihs-ci-win11` or the golden VM was intentionally
active, the governed timer remains `OnUnitActiveSec=5min`; future cadence
changes should be based on busy-vs-drift history or a separate adaptive design
rather than increasing noisy unhealthy receipts.

CI then creates only workspace-local `vagrant/shared` and `vagrant/evidence`,
then runs `scripts/doctorVagrantStorage.js` again so missing mounts and wrong
Vagrant box-cache links are reported as storage drift before any Data-drive
directories are created. It then runs
`scripts/vagrant/cleanup-disposable-ci-vm.sh`, which refuses to touch the
golden VM, fails if the disposable CI VM is running, deletes only a stopped VM
named `vihs-ci-win11`, unregisters stale inaccessible disposable registry
entries that still point at the governed CI VM folder, retries orphaned
disposable VM directory removal, quarantines that directory under the governed
machine folder when NTFS/FUSE leaves the original directory name present after
retries, and removes the active `.vagrant-ci` state. The job then runs Vagrant with
`VAGRANT_DOTFILE_PATH=.vagrant-ci` and
`VAGRANT_HOME=/home/sergio/.vagrant.d` so Vagrant private-key chmod remains on
the host ext4 filesystem. `scripts/vagrant/prepare-vagrant-home.sh` links
`/home/sergio/.vagrant.d/boxes` to the large-drive box cache at
`/run/media/sergio/Data/vihs-vagrant/vagrant-home/boxes` and links
`/home/sergio/.vagrant.d/tmp` to
`/run/media/sergio/Data/vihs-vagrant/vagrant-home/tmp` so manual box refresh
unpack work cannot fill the root filesystem. The CI job also sets
the VirtualBox default machine folder to
`/run/media/sergio/Data/vihs-vagrant/VirtualBox VMs` before importing the
disposable VM so the root filesystem does not need to hold the large Windows
box or clone. The host doctor fails closed when the active VirtualBox machine
folder does not match this large-drive path, when stale inaccessible
disposable registry entries remain, or when existing Vagrant state for the
active dotfile path points at any VM other than `vihs-ci-win11`.

Golden box refresh is manual and variable-gated. Set
`VIHS_VAGRANT_REFRESH_GOLDEN_BOX=true` only for an operator-controlled refresh.
The bootstrap provisioner configures `vagrant` autologon and WinRM startup
inside the disposable clone, suppresses Windows consumer backup and welcome
prompts for the CI desktop, normalizes public NAT network profiles for WinRM
firewall readiness, creates the `VIHS LabVIEW 2026 VI Server TCP 3363`
Windows Defender Firewall rule for `LabVIEW.exe`, and the job reloads the VM
immediately after bootstrap so the scheduled-task LabVIEW launch has an
interactive desktop session while the Vagrant communicator remains available.
Cold prep closes first-run browser/OOBE interlopers such as Edge, OneDrive, and
UserOOBEBroker before LabVIEW is launched so the scheduled task starts from a
clean desktop. Acceptance repeats that interloper cleanup before the LabVIEW
launch and during the VI Server wait because Edge/WebView prompts can respawn
after the post-bootstrap reload and steal the foreground while LabVIEW is
initializing.
Acceptance retains `vagrant/evidence/labview-startup.json` during the
prelaunch wait so failures distinguish scheduled-task state, LabVIEW process
observation, Explorer session observation, LabVIEW.ini VI Server settings,
interactive window titles, recent Windows event log entries, firewall rule
state, and VI Server listener state before the assertion script is allowed to
run. On VI Server timeout, the receipt also records a machine-readable
`failureCategory`, `startupDurationSec`, `lastObservedLabVIEWState`,
`viServerPortSnapshot`, and `nextAction` so the job trace can stay separated
from storage/admission failures while the retained artifact points at the
interactive-startup repair path. The provisioner also attempts to retain
`vagrant/evidence/labview-timeout-desktop.png` from the interactive `vagrant`
desktop so blocked startup prompts are visible from CI artifacts.
`npm run vagrant:labview-startup:history` summarizes
retained startup evidence; the current governed default is `60` seconds because
the retained successful starts complete well inside that window while stuck
interactive startups should fail quickly with evidence.

## GitLab Job

The blocking proof job is `vagrant_windows_vsix_acceptance`; the blocking
readiness gate is `vagrant_runner_admission`.

The proof job runs in the `test` stage on the Vagrant runner tags, serializes
access with `resource_group: vihs-windows-vagrant`, and declares
`needs: [vagrant_runner_admission]` so it can start as an early DAG job only
after the readiness gate passes. The GitLab resource group is configured with
`process_mode: newest_ready_first` so duplicate merge-request pipelines do not
force the latest merge gate to wait behind an older ready Vagrant proof. It
first runs `npm run vagrant:acceptance:freshness` and writes
`vagrant/evidence/pipeline-freshness`; when an older stale duplicate
merge-request pipeline discovers a newer non-canceled MR pipeline, it retains
that freshness receipt and exits before storage checks, package work, or VM
boot. CI gives the check a 5000 ms settle window so same-second duplicate
pipelines can become visible before the decision is written, and bounds each
GitLab API query at 10000 ms so API uncertainty cannot stall the runner before
the VM proof. Protected branch, tag, and freshness-API-uncertain jobs run
fail-open so the Vagrant proof is preserved when freshness cannot be proven. It then
packages the VSIX, stages it under
`vagrant/shared/`, optionally refreshes the local box, runs the host doctor,
boots the disposable VM, runs bootstrap, reloads once for the `vagrant`
interactive desktop session, runs the guest cold-prep provisioner, runs
acceptance, forces the generated `vihs` runtime-settings launcher to persist
`host/2026/x86` so stale golden-VM user settings cannot retain x64, explicitly
admits the governed prelaunched interactive LabVIEW host session for the
installed-user proof, bounds harness Git acquisition with
`VI_HISTORY_SUITE_GIT_TIMEOUT_MS=300000`, validates the latest manifest and
harness output through `npm run vagrant:acceptance:assert`, and always halts
the VM.
The assertion requires the manifest and harness report to prove LabVIEW `2026` `x86`,
`runtimeProvider=host-native`, `runtimeEngine=labview-cli`, and
`runtimeExecutionState=succeeded`.

The job retains `vagrant/evidence/`, including:

- `vagrant-storage-doctor.json`
- `vagrant-storage-doctor.md`
- `vagrant-host-doctor.log`
- `refresh-golden-box.log` when a manual refresh is requested
- `labview-cold-prep.log`
- `acceptance-provision.log`
- `labview-startup.json`
- `assertion/vagrant-vsix-acceptance-assertion.json`
- `assertion/vagrant-vsix-acceptance-assertion.md`
- `*/manifest.json`
- `*/proof-run.txt`
- `*/harness-report/**`

## Stop Rules

The lane fails closed when:

- the active storage root `/run/media/sergio/Data/vihs-vagrant` is missing,
  unmounted, or not writable
- the active storage root is missing the governed Windows box cache assets
- `/home/sergio/.vagrant.d/boxes` points at any target other than
  `/run/media/sergio/Data/vihs-vagrant/vagrant-home/boxes`
- `/home/sergio/.vagrant.d/tmp` points at any target other than
  `/run/media/sergio/Data/vihs-vagrant/vagrant-home/tmp`
- `gitlab-runner`, Vagrant, VirtualBox, Docker, Node, npm, or `vagrant-reload`
  are missing from the host contract
- the registered `vihs/win11-labview2026` box is missing
- the registered box is missing its VirtualBox `box.ovf` payload
- the golden VM is missing or not powered off during host doctor/refresh
- the refresh work root or box output directory does not have enough free space
- the configured VirtualBox machine folder is not the large-drive path or lacks
  enough free space for a one-VM import estimate
- the disposable clone does not boot with the golden VM's exported UEFI state
- a stale `vihs-ci-win11` VM is already running during cleanup
- local Vagrant metadata points at any VM other than `vihs-ci-win11`
- ignored local Vagrant metadata for the active dotfile path points at a VM other than
  `vihs-ci-win11`
- cold prep cannot clear `LabVIEW`, `LabVIEWCLI`, `LVCompare`, or VI Server
  port `3363`
- canonical harness Git acquisition does not finish within `300000` ms
- acceptance does not exercise the cold scheduled-task LabVIEW launch path
- the repo-owned acceptance assertion cannot prove the latest manifest is
  schema-valid, `proofExitCode = 0`, `runtimeExecutionState = succeeded`,
  `runtimeProvider = host-native`, `runtimeEngine = labview-cli`,
  `generatedReportExists = true`, generated report HTML is nonempty, and the
  cold-start markers are present
