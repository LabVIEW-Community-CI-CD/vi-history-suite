# Hosted CI Governance

## Purpose

Retain one governed hosted-automation matrix so GitLab authority pipelines,
public GitHub required checks, and GitHub experiment workflows stop being
raw-YAML-only truth.

This document is the control-plane summary of the governed historical
`v1.3.0` exact-closeout plus the later exact/public release follow-through.
Authority exact `main` now carries tagged `v1.3.16`, public GitHub and VS Code
Marketplace both publish `1.3.16`, public GitHub release `312768592` for
`v1.3.8` remains retained as immutable zero-asset historical incident
evidence, and later exact lines must reopen through normal GitFlow from this
retained closed baseline.

## Current Exact Closeout State

- current exact release line: `v1.3.0`
- current `main` package line: `1.3.0`
- current `develop` package line: `1.3.0`
- active exact release candidate line on `develop`: none; exact `v1.3.0`
  closeout is complete and the next SemVer line is not open yet
- active release-candidate branch: none
- protected back-merge proof: authority `main` `9587a99` into `develop`
  `04b07bd`
- resulting `develop` pipeline: `2467081960` `success`

## Current Control Decision For Public Exact Hardening

- current exact release line: `v1.3.16`
- current `main` package line: `1.3.16`
- current `develop` package line: `1.3.16`
- active exact release candidate line on `develop`: none
- active release-candidate branch: none
- retained prior release-candidate branch: `release/1.3.16`
- active release-candidate state:
  exact `v1.3.16` is published across GitLab authority, public GitHub, and VS
  Code Marketplace; protected `main` has been merged into the closeout branch
  for protected `develop` retention
- active exact hotfix candidate line on `main`: none
- active hotfix branch: none
- active feature-lane public GitHub release hardening branch on `develop`:
  none
- exact `v1.3.16` is closed across GitLab authority, public GitHub, Windows
  exact-VSIX install proof, and VS Code Marketplace; the next admitted action
  is only closeout retention on protected `develop`
- pre-tag public-exact proof package script:
  `npm run public:exact:pretag:proof`
- pre-tag public-exact proof GitLab job: `public_exact_pretag_proof`
- public GitHub exact transaction verification package script:
  `npm run public:github:exact:transaction:verify`
- chosen bump: patch
- active Marketplace public validation preview line: `1.3.13`
- Marketplace public validation preview status: published and verified for
  `1.3.13`
- Marketplace public validation preview last updated:
  `2026-04-27T04:24:05.457Z`
- rationale: authority exact `v1.3.16` remains tagged on `main`, public
  GitHub release `320824958` is published with exact assets, and VS Code
  Marketplace serves regular `1.3.16`
- rationale: `develop` now carries package line `1.3.16` after the completed
  exact `v1.3.16` GitLab authority, public GitHub, and Marketplace closeout
- rationale: the Vagrant Windows VSIX acceptance lane now has a repo-owned
  evidence assertion contract without expanding the Windows Docker Desktop
  proof claim
- rationale: blocked historical `v1.3.8` incident evidence remains retained,
  exact `v1.3.16` is now closed across GitLab authority, public GitHub, Windows
  exact-VSIX install proof, and VS Code Marketplace; later SemVer lines follow
  normal GitFlow and release branch deletion remains blocked
  unless explicitly admitted separately

## Current Linux/Docker Preview Claim

- active governed develop/package claim: Linux/Docker validated preview
- verified on this machine: Ubuntu self-hosted GitLab runner, Linux Docker
  engine, Linux assurance runner, docs workbench, source build, tests, and
  preview VSIX packaging
- deferred proof: native Windows installed extension behavior, native Windows
  LabVIEW host execution, Docker Desktop Windows-container execution, and
  `windows_private_release_acceptance`
- public GitHub production mutation: not admitted by this claim
- VS Code Marketplace mutation: not admitted by this claim
- Windows installed-user claim rule: do not claim Windows installed-user proof
  until a real Windows/LabVIEW host runner exists and the deferred Windows lane
  produces retained evidence

## Branch Model

- `main`: protected exact-release line and public default branch
- `develop`: integration and public-evaluation branch
- `feature/*`: short-lived development lane cut from `develop` and merged back
  into `develop`
- `release/*`: release-candidate lane cut from `develop`, merged into `main`,
  merged back into `develop`, and deleted only after both merges complete
- `hotfix/*`: exact-line repair lane cut from `main`, merged into `main`,
  merged back into `develop`, and deleted only after both merges complete

## Authority GitLab

Protection semantics:

- protected branches: `main`, `develop`
- merge gate: `only_allow_merge_if_pipeline_succeeds=true`
- named required checks: no; GitLab uses protected-branch plus green-pipeline
  admission instead

Lane admission:

- `feature/*`: merge-request pipelines are the authoritative admission path
- `develop`, `main`, `release/*`, `hotfix/*`: direct branch pipelines are
  admitted
- exact `vX.Y.Z` tags: exact release evidence lane

Runner lanes:

- `linux-assurance`: local authenticated self-hosted Linux shell-runner lane
  for external standards assurance; it pulls the latest published
  `repo-standards-review` assurance-workbench `:main` image before each
  assurance job and is governed by
  [linux-assurance-runner-lane.md](./linux-assurance-runner-lane.md)
- `ubuntu-docker-preview`: local Ubuntu shell-runner admission lane for the
  active Linux/Docker validated preview claim; it retains Docker, Node, npm, and
  runner-readiness evidence before later stages run
- `windows-private-release`: deferred tagged Windows current-user shell-runner
  lane for native Windows host plus Windows-container proof; it is governed by
  [windows-private-release-runner-lane.md](./windows-private-release-runner-lane.md)
  but does not run unless `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true`
- `vagrant-windows-vsix-acceptance`: local Ubuntu shell-runner lane for
  VirtualBox/Vagrant Windows 11 + LabVIEW 2026 VSIX acceptance; it is governed
  by
  [vagrant-windows-acceptance-runner-lane.md](./vagrant-windows-acceptance-runner-lane.md)
  and keeps the golden VM separate from the disposable CI VM

Runner operator hardening:

- `linux-assurance`: admitted config path
  `~/.gitlab-runner/config.toml`, host user `sergio`, runner binary
  `/home/sergio/.local/bin/gitlab-runner`, top-level `concurrent = 2`,
  per-runner `request_concurrency = 2`, and steady-state lifecycle owned by
  user-mode `systemd` unit `gitlab-runner.service`, with repo-owned host
  assets at `scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh`,
  `scripts/gitlab-runner/linux/start-linux-assurance.sh`,
  `scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh`,
  `scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service`, and
  `scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh`, with the
  admitted Windows-host wrappers retained at
  `scripts/doctorGovernedRunnerLanes.js` via `npm run gitlab:runner:doctor`
  and `scripts/assertGovernedRunnerLanes.js` via
  `npm run gitlab:runner:assert`; the Linux apply surface first normalizes
  both concurrency facts and then fails closed unless the admitted service is
  both enabled and active after apply; the helper itself reconciles the live
  config back to `concurrent = 2` plus `request_concurrency = 2`; the Linux
  doctor surface reports current concurrency, user-service, runner binary,
  process, and optional receipt facts; and the Linux assertion surface fails
  closed unless `concurrent = 2` plus `request_concurrency = 2` are still
  present, user-mode `gitlab-runner.service` is enabled and active, the admitted
  `ExecStart` still points at `/home/sergio/.local/bin/gitlab-runner run
  --config /home/sergio/.gitlab-runner/config.toml`, and exactly one configured
  runner process is live
- `windows-private-release`: admitted config path
  `C:\GitLab-Runner\config.toml`, per-runner
  `request_concurrency = 2`, scheduled bootstrap surface
  `C:\GitLab-Runner\start-governed-runner-lanes.ps1`, scheduled task
  `VIHS Governed Runner Lanes`, duplicate-manager collapse so exactly one
  current-user runner manager remains per config, bounded Linux-distro wake-up
  plus Linux-helper retries fail closed unless the paired Linux assurance
  service comes up after reboot, defaulting to `Ubuntu-24.04` unless
  `VIHS_LINUX_ASSURANCE_DISTRO` overrides the distro name, cold-admission
  fail-closed cleanup of stale
  `LabVIEW` / `LabVIEWCLI` / `LVCompare` runtime processes before the runner
  starts using bounded `Stop-Process` plus `taskkill /PID /T /F` and
  `taskkill /IM /T /F`, the repo-owned bootstrap asset
  `scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1`, the
  repo-owned doctor surface
  `scripts/gitlab-runner/windows/doctor-governed-runner-lanes.ps1`, and the
  repo-owned drift assertion surface
  `scripts/gitlab-runner/windows/assert-governed-runner-lanes.ps1`; the
  combined Windows-host wrappers remain
  `scripts/doctorGovernedRunnerLanes.js` via `npm run gitlab:runner:doctor`
  and `scripts/assertGovernedRunnerLanes.js` via
  `npm run gitlab:runner:assert`;
  the operator-only recovery rehearsal wrapper is
  `scripts/runWindowsProofRuntimeRecoveryRehearsal.js` via
  `npm run gitlab:runner:windows:recovery:rehearse`, retaining the latest
  receipt at `.cache/windows-proof-runtime-recovery-rehearsal/latest.json`;
  the repo-owned apply surface
  `scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1`
  keeps the scheduled-task action on
  `powershell.exe -NoLogo -NoProfile -File "C:\GitLab-Runner\start-governed-runner-lanes.ps1"`
  without `ExecutionPolicy Bypass` and fails closed unless exactly one
  configured runner manager remains after apply, while the Windows assertion
  surface fails closed unless the installed bootstrap hash still matches the
  repo source, that exact scheduled-task action plus its logon trigger remain
  intact, `request_concurrency = 2` remains in
  `C:\GitLab-Runner\config.toml`, and exactly one configured runner manager is
  live; the Windows bootstrap now writes a machine-readable startup receipt
  under `C:\GitLab-Runner\receipts\governed-runner-startup\latest.json`, and
  the Windows doctor surface reports the task, runner-process, startup-receipt,
  and Linux-helper receipt facts without mutating host state
- `vagrant-windows-vsix-acceptance`: admitted host user `sergio` under
  `/home/sergio`, Linux shell executor, runner description
  `local-vagrant-windows-acceptance`, tags
  `linux,x64,virtualbox,vagrant,private-release`, Vagrant box
  `vihs/win11-labview2026`, golden VM
  `vihs-win11-labview2026-golden`, disposable CI VM `vihs-ci-win11`, and
  serialized GitLab `resource_group: vihs-windows-vagrant`, and isolated
  `VAGRANT_DOTFILE_PATH=.vagrant-ci`; the host keeps `VAGRANT_HOME` on
  `/home/sergio/.vagrant.d` so Vagrant private keys stay on a chmod-capable
  ext4 filesystem, while `/run/media/sergio/Data/vihs-vagrant` remains the
  large-drive storage root for box payload cache, export work, and the
  VirtualBox default machine folder; `/run/media/sergio/Data1/vihs-vagrant`
  remains a manual standby mirror, and
  `/run/media/sergio/MAJOR GENER/VI History Suite Evidence`
  remains the local evidence vault rather than an active VM execution root;
  runner creation uses the
  `POST /user/runners` API to set
  tags, locked state, untagged-job behavior, and `maximum_timeout=7200`, then
  registers the local shell runner manager with the returned `glrt-`
  authentication token; the repo-owned readiness wrapper
  `scripts/runVagrantAcceptanceRunnerReadiness.js` is exposed as
  `npm run vagrant:runner:readiness`, retains
  `vagrant-runner-readiness-evidence/` in GitLab admission, and is also run by
  the user-mode
  `scripts/gitlab-runner/linux/vihs-vagrant-acceptance-readiness.timer` to
  publish latest/timestamped receipts under
  `/home/sergio/.gitlab-runner/receipts/vagrant-acceptance-readiness`; the
  readiness wrapper keeps `Data1` as a manual standby mirror and fails closed
  instead of falling back when active `/run/media/sergio/Data` storage drifts;
  the repo-owned storage doctor `scripts/doctorVagrantStorage.js` still runs
  before Data-drive Vagrant directory creation and retains
  `vagrant-storage-doctor.json` plus `vagrant-storage-doctor.md`, failing
  closed when the active storage root is missing, unmounted, not writable,
  missing the governed Windows box cache, or when
  `/home/sergio/.vagrant.d/boxes` points anywhere except the active large-drive
  box cache, or when `/home/sergio/.vagrant.d/tmp` points anywhere except the
  active large-drive Vagrant temp cache; the repo-owned disposable cleanup
  surface `scripts/vagrant/prepare-vagrant-home.sh` links both
  `/home/sergio/.vagrant.d/boxes` and `/home/sergio/.vagrant.d/tmp` to the
  large-drive Vagrant cache before Vagrant runs;
  `scripts/vagrant/cleanup-disposable-ci-vm.sh` refuses to touch the
  golden VM, fails when the disposable CI VM is running, deletes only a stopped
  `vihs-ci-win11`, unregisters stale inaccessible disposable registry entries
  that point at the governed CI VM folder, retries orphaned disposable
  directory removal, quarantines that directory under the governed machine
  folder when NTFS/FUSE leaves the original directory name present after
  retries, and clears active `.vagrant-ci` state before import; the repo-owned
  host doctor
  `scripts/vagrant/doctor-vagrant-host.sh` checks Vagrant,
  VirtualBox, Docker, Node, npm, `gitlab-runner`, the registered box, golden VM
  power state, stale CI VM state, stale inaccessible disposable registry
  entries, real `box.ovf` payload presence, and `vagrant-reload`, and verifies
  that VirtualBox imports target the large-drive machine folder with enough
  free space; the repo-owned refresh surface
  `scripts/vagrant/refresh-golden-box.sh` updates the local box only when
  `VIHS_VAGRANT_REFRESH_GOLDEN_BOX=true`, and fails early when the export work
  root or box output directory lacks enough free space unless
  `VIHS_VAGRANT_BOX_WORKDIR` or `VIHS_VAGRANT_BOX_FILE` points at a larger
  filesystem; and the guest cold-prep
  provisioner `vagrant/provision/prepare-cold-labview.ps1` fails closed unless
  stale `LabVIEW`, `LabVIEWCLI`, and `LVCompare` processes plus VI Server port
  `3363` are cleared before acceptance; CI removes ignored legacy
  `vagrant/.vagrant` state before boot, and the cleanup/doctor surfaces fail
  closed when any active Vagrant machine ID points at a VM other than
  `vihs-ci-win11`

Job ownership:

- `ubuntu_docker_runner_admission`: blocking Linux/Docker `admission` stage lane
  on merge requests, governed branch lanes, and exact tags; it retains
  `governed-runner-admission-evidence/` with runner, Docker, Node, npm, and
  explicit Windows-proof-deferred facts before docs, assurance, test, package,
  and release jobs run
- `linux_docker_provider_lane`: blocking Linux Docker Desktop/Docker Engine
  provider lane on merge requests, governed branch lanes, and exact tags; it
  runs `npm run linux:docker:provider:lane`, retains
  `linux-docker-provider-lane-evidence/`, proves the persisted
  `docker` / `2026` / `x64` settings bundle validates as
  `runtimeProvider=linux-container` with `runtimeEngine=labview-cli`, and
  records Windows/LabVIEW installed-user proof as community/deferred evidence
- `governed_runner_admission`: deferred Windows-host `admission` stage lane; it
  runs only when `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true` and still uses
  `npm run gitlab:runner:doctor -- --surface all --fail-on-drift --evidence-dir governed-runner-admission-evidence`
  when a real Windows/LabVIEW host runner exists
- `vagrant_runner_admission`: blocking Vagrant-runner `admission` stage lane on
  merge requests, governed branch lanes, and exact tags; it runs
  `npm run vagrant:runner:readiness`, retains
  `vagrant-runner-readiness-evidence/`, and fails before Vagrant acceptance
  when active storage or host readiness drifts
- `public_exact_pretag_proof`: blocking pre-tag public-facade proof lane on
  merge requests, `develop`, `main`, `release/*`, and `hotfix/*`; it runs
  `npm run public:exact:pretag:proof -- --evidence-dir public-exact-pretag-proof-evidence`
  so any later exact reopen fails closed before tag creation when the promoted
  public facade still diverges from authority truth
- `docs_link_check`: blocking README/docs link integrity lane on merge
  requests, governed branch lanes, and exact tags; it runs `lychee` from the
  pinned Alpine image
  `lycheeverse/lychee:latest-alpine@sha256:1b2f74f0b6816dc3ee4e5f457d11f1b2ed6c1cf8ebcbaa18cbfe057d5e2ccb00`
  so the lane no longer depends on drift-prone `lycheeverse/lychee:latest`
  images that can outpace the shared Linux runner glibc baseline
- `docs_continuous_integration`, `docs_public_continuous_integration`,
  `docs_internal_continuous_integration`: docs integrity on merge requests,
  governed branch lanes, and exact tags
- `assurance_release_gate`: blocking Linux-assurance lane on merge requests,
  governed branch lanes, and exact tags; it stages the bounded repo scope,
  pulls the latest published
  `registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main`
  image on the local authenticated self-hosted Linux runner, and runs the
  bounded `release-gate` audit against that staged target through the
  repo-owned wrapper
- `assurance_26514_authority`: blocking Linux-assurance lane that stages the
  governed authority-docs scope and retains the `documentation-proof` output
- `assurance_requirements_quality`: blocking Linux-assurance lane that runs the
  governed requirements-quality checker
- `assurance_external_user_information`: blocking Linux-assurance lane that
  runs the governed external user-information checker
- `assurance_audit_packet`: advisory Linux-assurance lane that retains the
  bounded `evidence-pack` and `compliance-uplift` outputs without blocking
  packaging
- `test_extension`: compile, test, and coverage gate on merge requests,
  governed branch lanes, and exact tags
  - `windows_private_release_acceptance`: deferred tagged Windows shell-runner
    lane that retains the canonical Windows x64 private-release acceptance
    evidence for `resource/plugins/lv_icon.vi` on both host-native and
    Windows-container providers when `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true`;
    it is required before any Windows installed-user proof claim, but it is not
    required for the active Linux/Docker validated preview claim. When the
    host-native proof exits at the shared Windows cleanup seam, it retains
    `windows-private-release-evidence/host/proof-run-pre-recovery.txt`, runs
    `scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1`,
    retains `windows-private-release-evidence/host/proof-runtime-recovery.txt`,
    waits `5000` ms, retries that host-native proof once, and fails closed if
    the repo-owned recovery step plus retry still cannot restore a clean host
    surface; the same admitted Windows host also retains one governed recovery
    rehearsal surface via
    `scripts/runWindowsProofRuntimeRecoveryRehearsal.js` /
    `npm run gitlab:runner:windows:recovery:rehearse`, which fails closed
    unless the host starts clean, seeds one headless LabVIEW contamination,
    runs that same recovery script, and refreshes
    `.cache/windows-proof-runtime-recovery-rehearsal/latest.json`
- `vagrant_windows_vsix_acceptance`: blocking Vagrant Windows VSIX acceptance
  lane on merge requests, governed branch lanes, and exact tags; it runs on
  `linux,x64,virtualbox,vagrant,private-release`, serializes with
  `resource_group: vihs-windows-vagrant`, declares
  `needs: [vagrant_runner_admission]` so it can still start early after the
  readiness gate, packages the VSIX, stages it under `vagrant/shared/`, runs
  the storage doctor again as defense in depth before creating Data-drive
  Vagrant directories, optionally refreshes the local box when
  `VIHS_VAGRANT_REFRESH_GOLDEN_BOX=true`, runs the host doctor, boots the
  disposable `vihs-ci-win11` VM, runs bootstrap, suppresses Windows consumer
  backup and welcome prompts for the CI desktop, reloads once so `vagrant`
  autologon creates the interactive LabVIEW desktop session while clone-local
  WinRM network/firewall readiness remains available for Vagrant, runs the
  guest cold-prep provisioner to clear stale LabVIEW processes and first-run
  browser/OOBE interlopers, runs acceptance with a near-future scheduled-task
  fallback for LabVIEW prelaunch, repeats first-run browser/OOBE interloper
  cleanup before and during the VI Server wait, waits `60` seconds by default
  for VI Server while retaining `labview-startup.json` with interactive window
  titles, recent Windows event entries, decoded scheduled-task result hex, and
  a best-effort `labview-timeout-desktop.png` screenshot on VI Server timeout,
  validates the latest acceptance
  manifest, cold-start markers, host-native LabVIEWCLI facts, and generated
  report output through `npm run vagrant:acceptance:assert`, always halts the
  VM, and retains `vagrant/evidence/`; its acceptance provisioner sets
  `VI_HISTORY_SUITE_GIT_TIMEOUT_MS=300000` so canonical harness acquisition
  fails closed instead of silently exhausting the runner no-output window; this
  job pins
  `VAGRANT_HOME`, the box file, the export work root, Vagrant temp cache, and
  the VirtualBox machine folder to `/run/media/sergio/Data/vihs-vagrant` so the
  large Windows box, box-unpack temp files, and disposable VM clone do not land
  on the root filesystem; this
  is Vagrant VSIX
  acceptance evidence, not a substitute for the deferred native Windows x64
  private-release and Windows-container proof lane
- `package_extension_preview`: preview VSIX packaging on merge requests into
  protected branch lanes, on `develop`, `main`, `release/*`, `hotfix/*`, and
  exact tags; it now depends on the blocking Linux assurance lanes
  `assurance_release_gate`, `assurance_26514_authority`,
  `assurance_requirements_quality`, and
  `assurance_external_user_information`, plus `test_extension` and
  `linux_docker_provider_lane`, and now waits for
  `vagrant_windows_vsix_acceptance`; the deferred
  `windows_private_release_acceptance` need remains optional unless explicitly
  enabled, and there is still no generic `feature/*` push lane
- `publish_docs_authoring_image`: publication-support lane on `main` and exact
  tags only
- `wiki_workbench_prepare_published`: documentation-publication preparation on
  `main` only
- `release_extension`: exact-version release lane on exact tags only, now
  blocked on the same blocking Linux assurance lanes, `test_extension`, and
  `linux_docker_provider_lane`, plus `vagrant_windows_vsix_acceptance`; any
  exact package produced without the deferred Windows private-release lane
  remains a Linux/Docker plus Vagrant-VSIX validated artifact and cannot be used
  as native Windows installed-user proof

Design-gate boundary:

- `npm run design:gate` remains a governed local promotion gate for
  governance-heavy slices
- `npm run design:gate` now starts with `npm run branch:governance:assert`
  so the gate fails closed when `develop` has not yet absorbed exact `main`
- exact release closeout only becomes complete after the protected back-merge
  of exact released `main` into `develop` and the resulting green `develop`
  pipeline are retained as part of the same release follow-through
- `npm run design:gate:assert-complete` remains the retained assertion surface
- GitLab does not pretend that local design-gate proof is a GitHub-style named
  required check

## Public GitHub

Protection semantics:

- protected branches: `main`, `develop`
- named required checks:
  - `public-source-package-preview`
  - `public-linux-installed-user-smoke`
  - `public-windows-installed-user-contract`

Workflow ownership:

- `Public Source Package Preview`
  - owns compile, `test:design-contract`, preview VSIX packaging, and preview
    artifact upload
  - admits bounded `push` on `develop`, `main`, `release/*`, and `hotfix/*`
  - admits bounded `pull_request` into `develop` and `main`
  - uses per-workflow/per-ref concurrency
- `Public Linux Installed-User Smoke`
  - owns Docker Linux engine verification, `public:smoke:linux`, and retained
    smoke-evidence upload
  - admits bounded `push` on `develop`, `main`, `release/*`, and `hotfix/*`
  - admits bounded `pull_request` into `develop` and `main`
  - uses per-workflow/per-ref concurrency
- `Public Windows Installed-User Contract`
  - owns `public:contract:windows-installed-user` and retained Windows
    installed-user contract evidence
  - admits bounded `push` on `develop`, `main`, `release/*`, and `hotfix/*`
  - admits bounded `pull_request` into `develop` and `main`
  - uses per-workflow/per-ref concurrency

## GitHub Experiment Lanes

These are governed but not release-required:

- `Linux Runtime Benchmark Experiment`
- `Windows Runtime Benchmark Image`

Rules:

- classification: characterization-only experiment automation
- required for exact release: no
- admitted refs: `main` and `experiment/*`
- purpose: benchmark-image and benchmark-characterization upkeep, not public
  release admission

## Anti-Drift Rule

When hosted automation truth changes, update together:

- `docs/cm/cm-plan.md`
- `docs/release-procedure.md`
- `docs/product/post-release-sustainment-rules.md`
- `docs/product/post-release-sustainment-rules.json`
- `docs/product/current-state.md`
- `README.md`
- `docs/requirements/srs.md`
- `docs/requirements/rtm.csv`
- `docs/testing/test-plan.md`
- this hosted governance package
- `docs/product/windows-private-release-runner-lane.md`
- `docs/product/linux-assurance-runner-lane.md`
- `docs/product/vagrant-windows-acceptance-runner-lane.md`
- affected workflow YAML
- `docker/docs-authoring/Dockerfile`
