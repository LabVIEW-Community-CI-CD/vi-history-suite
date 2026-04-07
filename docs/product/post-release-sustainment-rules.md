# Post-Release Sustainment Rules

## Purpose

Retain one canonical sustainment contract for the active post-release lane.

This package makes `PROGRAM-0004` / `ISSUE-0409` executable repo truth instead
of leaving release cadence, benchmark refresh, and operator-surface upkeep
scattered across queue summaries, ship history, and benchmark notes.

## Governing Control Plane

- tranche: `TRANCHE-012`
- issue: `ISSUE-0409`
- execution program: `PROGRAM-0004`
- parallel public-closeout lane: `TRANCHE-010` / `PROGRAM-0002` is reopened on
  the `1.0.0` Docker-only public contract

The sustainment lane now owns the only active post-release driver seat. It does
not absorb `PROGRAM-0002`, `PROGRAM-0003`, or `PROGRAM-0005` into generic
maintenance language; those programs remain explicit when they reopen or stay
active.

The current release branch model is explicit too:

- `develop` is the integration branch
- `main` is the release branch
- protected-branch promotion shall use required checks instead of operator
  memory
- the next sustained topology is `gitflow-lite`, adding explicit
  `feature/*`, `release/*`, and `hotfix/*` lanes around those long-lived
  branches instead of treating all post-release work as generic `develop`
  traffic

## Release Refresh Rules

Release cadence is event-driven, not calendar-driven.

The maintained release surfaces are:

- `main` preview artifacts for governed install testing
- SemVer-tagged exact-version release artifacts
- public release-kit source truth that consumes the immutable release
- docs-authoring workbench publication surfaces tied to the same repo state

Refresh the release package when any of these change:

- `package.json` version
- `CHANGELOG.md` head entry for the current package line on `main`
- SemVer tag intent or release-manifest shape
- public release-kit assets or setup/support guidance that must follow the
  exact released VSIX
- release procedure, ship-control, or docs-workbench publication contract

Current version-line contract:

- retained exact-version releases: `v0.2.0`, `v1.0.0`, `v1.0.1`, `v1.0.2`,
  `v1.0.3`, `v1.0.4`, `v1.0.5`, `v1.0.6`
- burned exact release line: `v1.0.2`
- current exact released line: `v1.0.6`
- current published package line on `main`: `1.0.6`
- current develop package line on `develop`: `1.0.6`
- no newer exact release candidate line is active on `develop` yet
- public GitHub default branch: `main`
- public Codespaces evaluation branch: `develop`
- integration branch: `develop`
- release branch: `main`
- next-line branch model: `gitflow-lite`

Strict SemVer rule after an exact release:

- once an exact release is published, the current published package line on
  `main` shall match that exact release line
- when `develop` carries post-release work, the develop package line shall
  advance to the next exact release candidate before public-facing
  normalization continues
- any further repo change intended for publication shall advance
  `package.json` and the top `CHANGELOG.md` heading to the next SemVer line
  before the changed state is normalized or published further
- future sessions shall not treat an unreleased SemVer bump as complete until
  the matching public tag and public GitHub release are both published
- future sessions shall not keep landing post-release changes on the previous
  exact release version number
- future sessions shall not treat a burned exact release as the green release
  baseline for later publication

Decision framework for choosing `major`, `minor`, or `patch`:

- choose `major` when a governed public or maintainer contract is intentionally
  broken, removed, or flipped in a way that invalidates an already-published
  workflow, branch expectation, install path, or runtime surface
- choose `minor` when a new governed capability or supported workflow is added
  without breaking the currently exact released line
- choose `patch` when the change fixes, hardens, clarifies, or governs an
  existing capability, release rule, procedure, branch policy, or CI posture
  without changing the current exact released contract
- default governance-only hardening to `patch` unless the hardening itself
  changes a governed contract in a breaking or additive way
- record the chosen bump rationale in the control plane before further
  publication or release normalization continues

Do not reopen release refresh just because:

- benchmark-only diagnosis changed without affecting shipped release surfaces
- local characterization receipts changed without a governed release claim
- an unrelated feature/doc note changed without affecting install or release
  truth

## Benchmark Refresh Rules

Benchmark refresh is event-driven and bounded by the current accepted proof
contract.

Current accepted benchmark truth:

- comparable prefix: `129` commits / `128` pairs
- Windows current-contract ceiling: pair `129`
- Windows blocker characterization: `mixed-bitness-call-by-reference-seam`
- Linux full-window blocker: pair `135/138` as
  `linux-headless-recursive-load` / `labview-cli-connection-failed` after one
  governed `CloseLabVIEW -Headless` recovery attempt

Refresh benchmark proof when any of these change:

- benchmark harness logic, packet derivation, or benchmark consumer tooling
- comparison-report runtime execution in a way that can change `HARNESS-VHS-002`
  truth
- governed Windows benchmark image contract
- governed Linux runtime or benchmark image contract
- a release or public claim would otherwise imply changed benchmark truth

Do not reopen benchmark proof just because:

- UI or docs-only work changed without altering benchmark surfaces
- the public release-kit changed without altering benchmark contracts
- out-of-scope alternative Windows x86 provisioning is merely observed in other
  experiments without becoming part of the governed image contract

Reopen the bounded benchmark contract only when:

- the current governed Windows benchmark image contract gains same-bitness x86
  provisioning
- the governed NI Linux runtime or benchmark-image contract changes enough to
  justify a new full-window proof attempt
- another in-scope benchmark provider becomes accepted authority truth

## Operator And Documentation Upkeep Rules

When sustainment-affecting truth changes, update these surfaces together:

- `development-queue.json`
- `current-state.md`
- active sustainment program and issue docs
- `SHIP-0001` only where it points to the active driver-seat post-release lane
- `CHANGELOG.md` when the current published package line on `main` or retained release history changes
- SRS, RTM, and test plan when normative behavior changes
- wiki coverage/publication ledgers when reader-facing authority changes
- published wiki pages that represent the changed authority docs
- bundled docs after published wiki pages change

Required branch-model and CI posture:

- integration work lands on `develop`
- release promotion lands on `main`
- the public GitHub default branch remains `main` so casual readers and fork
  owners land on the latest exact released line by default
- protected-branch promotion uses required checks instead of direct operator
  trust
- `feature/*` lanes target `develop`
- `release/*` lanes are cut from `develop`, validate the release candidate, and
  merge to `main` plus back into `develop`
- `hotfix/*` lanes are cut from `main`, fix one exact release line, and merge
  to `main` plus back into `develop`
- the required checks are:
  - GitLab `docs_continuous_integration`
  - GitLab `docs_public_continuous_integration`
  - GitLab `docs_internal_continuous_integration`
  - GitLab `test_extension`
  - GitLab `package_extension_preview`
  - GitHub `Public Facade Package Preview / package-preview`
  - GitHub `Public Facade Linux Smoke / public-facade-linux-smoke`

Lane-specific CI and gate responsibilities:

- `feature/*`: focused tests plus any affected doc/design gates before merge to
  `develop`
- `develop`: required checks plus `npm run design:gate` and
  `npm run design:gate:assert-complete` for governance or architecture work
- `release/*`: full required checks, design gates, release-readiness
  normalization, and public-facade proof before merge to `main`
- `hotfix/*`: focused regression checks, affected docs/design gates, and the
  exact released-line package audit before merge to `main`
- `main`: protected exact-release branch; exact SemVer tags are cut only after
  merged `main` is green

Public GitHub workflow responsibility matrix:

- `Public Facade Package Preview / package-preview`
  - owns `npm run compile`
  - owns `npm run test:design-contract`
  - owns preview VSIX packaging and preview-artifact upload
  - admits `workflow_dispatch` plus bounded `push`/`pull_request` changes on
    `develop`, `main`, `release/*`, and `hotfix/*`
  - uses per-workflow/per-ref concurrency to cancel stale in-progress runs
- `Public Facade Linux Smoke / public-facade-linux-smoke`
  - owns Docker Linux engine verification
  - owns `npm run public:smoke:linux`
  - owns retained smoke-evidence upload
  - admits `workflow_dispatch` plus bounded `push`/`pull_request` changes on
    `develop`, `main`, `release/*`, and `hotfix/*`
  - uses per-workflow/per-ref concurrency to cancel stale in-progress runs
- neither public GitHub workflow uses a `feature/*` push lane

Requirement-evolution discipline:

- every governed finding shall be classified before slice closeout as either
  `requirements-update-required` or `no-requirement-impact`
- when a finding changes public workflow truth, release truth, branch policy,
  CI posture, runtime boundaries, or user/operator documentation behavior, the
  same slice shall update SRS, RTM, and test-plan coverage
- when a finding does not change normative behavior, the same slice shall
  retain an explicit no-impact rationale in the control plane instead of
  silently skipping requirement review

ADR-evolution discipline:

- every governed finding shall also be classified before slice closeout as
  either `adr-update-required` or `no-adr-impact`
- when a finding changes architectural boundaries, public/private product
  surfaces, release topology, default-branch policy, runtime-provider
  strategy, required-check posture, or public GitHub workflow responsibility
  matrix, the same slice shall update an existing ADR or introduce a new ADR
- when a finding does not change sustained decision truth, the same slice
  shall retain an explicit no-impact rationale in the control plane instead of
  silently skipping ADR review

Required closeout checks for any sustainment slice:

- relevant focused tests
- `npm run docs:bundle`
- `npm run docs:gate:core`
- `npm run design:gate`
- `npm run design:gate:assert-complete`

## Stop Rules

Sustainment may:

- preserve release truth
- preserve bounded benchmark truth
- preserve operator/documentation/control-plane truth

Sustainment may not:

- hide new feature work inside generic maintenance wording
- silently reopen closed benchmark or execution-policy programs
- introduce an execution-policy bypass that skips canonical execution-request
  validation or governed provider hard stops
- introduce PowerShell `ExecutionPolicy Bypass` on governed benchmark-image or
  host-proof helper surfaces
- treat characterization receipts as new governed product truth without
  control-plane normalization

## Next Slice Boundary

Future `PROGRAM-0004` slices should either:

- refresh this sustainment contract because a maintained surface changed, or
- execute one of these retained rules and normalize the outcome

If work instead expands product behavior, it must reopen under a new explicit
program.
