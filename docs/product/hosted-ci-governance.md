# Hosted CI Governance

## Purpose

Retain one governed hosted-automation matrix so GitLab authority pipelines,
public GitHub required checks, and GitHub experiment workflows stop being
raw-YAML-only truth.

This document is the control-plane summary of the governed `1.1.0` hardening
line. The exact public release is now `v1.1.0`; `main` and `develop` both
carry `1.1.0`, and no newer exact release candidate is active yet.

## Opening Decision

- current exact release line: `v1.1.0`
- current `main` package line: `1.1.0`
- current `develop` package line: `1.1.0`
- no newer exact release candidate line is active yet
- chosen bump: `minor`
- rationale: this line adds a governed hosted branch-protection and CI
  responsibility capability across authority GitLab, the public GitHub facade,
  and GitHub experiment lanes without breaking the exact `v1.0.6` contract

## Branch Model

- `main`: exact release branch and public default branch
- `develop`: integration and public-evaluation branch
- `feature/*`: short-lived merge-request-driven development lane
- `release/*`: release-candidate lane cut from `develop`
- `hotfix/*`: exact-line repair lane cut from `main`

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

Job ownership:

- `docs_link_check`, `docs_continuous_integration`,
  `docs_public_continuous_integration`, `docs_internal_continuous_integration`:
  docs integrity on merge requests, governed branch lanes, and exact tags
- `test_extension`: compile, test, and coverage gate on merge requests,
  governed branch lanes, and exact tags
- `package_extension_preview`: preview VSIX packaging on `develop`, `main`,
  `release/*`, `hotfix/*`, and exact tags; no generic `feature/*` push lane
- `publish_docs_authoring_image`: publication-support lane on `main` and exact
  tags only
- `wiki_workbench_prepare_published`: documentation-publication preparation on
  `main` only
- `release_extension`: exact-version release lane on exact tags only

Design-gate boundary:

- `npm run design:gate` remains a governed local promotion gate for
  governance-heavy slices
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
- affected workflow YAML
