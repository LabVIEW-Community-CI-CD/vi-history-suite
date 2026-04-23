# Hosted CI Governance

## Purpose

Retain one governed hosted-automation matrix so GitLab authority pipelines,
public GitHub required checks, and GitHub experiment workflows stop being
raw-YAML-only truth.

This document is the control-plane summary of the governed historical
`v1.3.0` exact-closeout plus the later exact/public release follow-through.
Authority exact `main` now carries tagged `v1.3.7`, `develop` now also carries
`1.3.7`, public GitHub `main`, tag, and release now publish the exact
`v1.3.7` transaction, the Marketplace listing now serves `1.3.7`, no exact
hotfix lane is currently open, no active feature-lane public GitHub hardening
branch remains open, and the final publication closeout is retained directly
on `develop`.

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

- current exact release line: `v1.3.7`
- current `main` package line: `1.3.7`
- current `develop` package line: `1.3.7`
- active exact release candidate line on `develop`: none
- active release-candidate branch: none
- active exact hotfix candidate line on `main`: none
- active hotfix branch: none
- active feature-lane public GitHub release hardening branch on `develop`:
  none
- later SemVer openings beyond `1.3.7` return to normal GitFlow governance
  after the retained public GitHub and Marketplace closeout
- pre-tag public-exact proof package script:
  `npm run public:exact:pretag:proof`
- pre-tag public-exact proof GitLab job: `public_exact_pretag_proof`
- public GitHub exact transaction verification package script:
  `npm run public:github:exact:transaction:verify`
- chosen bump: `patch`
- rationale: authority exact `v1.3.7` is already tagged on `main` while
  public GitHub `main`, tag, and GitHub release are now published with exact
  manifest-matched assets, and VS Code Marketplace now serves `1.3.7`
- rationale: the repo-owned public GitHub exact-release transaction controller
  now retains a completed verify gate for `v1.3.7`, and later openings may
  proceed only after this final publication act is retained

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
- `windows-private-release`: tagged Windows current-user shell-runner lane for
  native Windows host plus Windows-container proof; it is governed by
  [windows-private-release-runner-lane.md](./windows-private-release-runner-lane.md)

Runner operator hardening:

- `linux-assurance`: admitted config path
  `~/.gitlab-runner/config.toml`, top-level `concurrent = 2`, per-runner
  `request_concurrency = 2`, and steady-state lifecycle owned by the admitted
  Linux assurance distro `systemd` unit `vihs-linux-assurance-runner.service`,
  defaulting to `Ubuntu-24.04`, with repo-owned host
  assets at `scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh`,
  `scripts/gitlab-runner/linux/start-linux-assurance.sh`,
  `scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh`,
  `scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service`, and
  `scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh`, with the
  admitted Windows-host wrappers retained at
  `scripts/doctorGovernedRunnerLanes.js` via `npm run gitlab:runner:doctor`
  and `scripts/assertGovernedRunnerLanes.js` via
  `npm run gitlab:runner:assert`; the Linux apply surface first normalizes
  both concurrency facts and then fails closed unless the admitted `systemd`
  service is both enabled and active after apply; the Windows bootstrap now
  retries the Linux helper as a bounded post-reset readiness gate; the helper
  itself reconciles the live config back to `concurrent = 2` plus
  `request_concurrency = 2`, restarts the admitted service when needed, and
  writes a machine-readable startup receipt under
  `$HOME/gitlab-runner/receipts/linux-assurance-startup/latest.json`; the
  Linux doctor surface reports current concurrency, service, process, and
  receipt facts; and the Linux assertion surface fails closed unless the
  installed helper and service unit still match the repo asset pack,
  `concurrent = 2` plus `request_concurrency = 2` are still present, the
  admitted fragment path/user/working directory remain exact, the service is
  still enabled and active, and exactly one configured runner process is live
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

Job ownership:

- `governed_runner_admission`: blocking Windows-host `admission` stage lane on
  merge requests, governed branch lanes, and exact tags; it runs
  `npm run gitlab:runner:doctor -- --surface all --fail-on-drift --evidence-dir governed-runner-admission-evidence`
  so docs, assurance, test, package, and release jobs fail fast on post-reset
  runner drift instead of waiting behind missing or degraded runner capacity
- `public_exact_pretag_proof`: blocking pre-tag public-facade proof lane on
  merge requests, `develop`, `main`, `release/*`, and `hotfix/*`; it runs
  `npm run public:exact:pretag:proof -- --evidence-dir public-exact-pretag-proof-evidence`
  so any later exact reopen fails closed before tag creation when the promoted
  public facade still diverges from authority truth
- `docs_link_check`, `docs_continuous_integration`,
  `docs_public_continuous_integration`, `docs_internal_continuous_integration`:
  docs integrity on merge requests, governed branch lanes, and exact tags
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
  - `windows_private_release_acceptance`: tagged Windows shell-runner lane that
    retains the canonical Windows x64 private-release acceptance evidence for
    `resource/plugins/lv_icon.vi` on both host-native and Windows-container
    providers before preview or exact packaging continues; when the host-native
    proof exits at the shared Windows cleanup seam, it retains
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
- `package_extension_preview`: preview VSIX packaging on merge requests into
  protected branch lanes, on `develop`, `main`, `release/*`, `hotfix/*`, and
  exact tags; it now depends on the blocking Linux assurance lanes
  `assurance_release_gate`, `assurance_26514_authority`,
  `assurance_requirements_quality`, and
  `assurance_external_user_information`, plus `test_extension` and
  `windows_private_release_acceptance`, and there is still no generic
  `feature/*` push lane
- `publish_docs_authoring_image`: publication-support lane on `main` and exact
  tags only
- `wiki_workbench_prepare_published`: documentation-publication preparation on
  `main` only
- `release_extension`: exact-version release lane on exact tags only, now
  blocked on the same blocking Linux assurance lanes, `test_extension`, and
  `windows_private_release_acceptance`

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
  - `package-preview`
  - `public-facade-linux-smoke`

Workflow ownership:

- `Public Facade Package Preview`
  - owns compile, `test:design-contract`, preview VSIX packaging, and preview
    artifact upload
  - admits bounded `push` on `develop`, `main`, `release/*`, and `hotfix/*`
  - admits bounded `pull_request` into `develop` and `main`
  - uses per-workflow/per-ref concurrency
- `Public Facade Linux Smoke`
  - owns Docker Linux engine verification, `public:smoke:linux`, and retained
    smoke-evidence upload
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
- affected workflow YAML
