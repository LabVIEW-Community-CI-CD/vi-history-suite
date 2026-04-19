# Hosted CI Governance

## Purpose

Retain one governed hosted-automation matrix so GitLab authority pipelines,
public GitHub required checks, and GitHub experiment workflows stop being
raw-YAML-only truth.

This document is the control-plane summary of the governed `1.3.0` candidate
opening. The exact public release remains `v1.2.2`; `main` carries `1.2.2`,
`develop` now carries `1.3.0`, and the line retains the protected
post-publication acceptance gates before exact tagging can reopen.

## Opening Decision

- current exact release line: `v1.2.2`
- current `main` package line: `1.2.2`
- current `develop` package line: `1.3.0`
- active exact release candidate line on `develop`: `v1.3.0`
- no newer `release/*` branch is active yet
- chosen bump: `minor`
- rationale: this line opens a new governed installed-user capability and
  supported workflow by promoting host-default Windows local `LabVIEWCLI`
  with bounded expert Docker
- rationale: exact `v1.2.2` remains the truthful published baseline while the
  next public candidate and review gates are reopened on `v1.3.0`

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
  `~/.gitlab-runner/config.toml`, per-runner
  `request_concurrency = 2`, and steady-state lifecycle owned by Ubuntu
  `systemd` unit `vihs-linux-assurance-runner.service`, with repo-owned host
  assets at `scripts/gitlab-runner/linux/start-linux-assurance.sh` and
  `scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service`
- `windows-private-release`: admitted config path
  `C:\GitLab-Runner\config.toml`, per-runner
  `request_concurrency = 2`, scheduled bootstrap surface
  `C:\GitLab-Runner\start-governed-runner-lanes.ps1`, scheduled task
  `VIHS Governed Runner Lanes`, duplicate-manager collapse so exactly one
  current-user runner manager remains per config, and the repo-owned bootstrap
  asset `scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1`

Job ownership:

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
  providers before preview or exact packaging continues
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
- exact release closeout also remains incomplete until the protected
  back-merge of exact released `main` into `develop` and the resulting green
  `develop` pipeline are retained as part of the same release follow-through
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
