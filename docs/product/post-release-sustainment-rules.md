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
  `v1.0.3`
- burned exact release line: `v1.0.2`
- current exact released line: `v1.0.3`
- current published package line on `main`: `1.0.3`
- current develop package line on `develop`: `1.0.4`
- active exact release candidate line on `develop`: `v1.0.4`
- public Codespaces evaluation branch: `develop`
- integration branch: `develop`
- release branch: `main`

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
- protected-branch promotion uses required checks instead of direct operator
  trust
- the required checks are:
  - GitLab `docs_continuous_integration`
  - GitLab `docs_public_continuous_integration`
  - GitLab `docs_internal_continuous_integration`
  - GitLab `test_extension`
  - GitLab `package_extension_preview`
  - GitHub `Public Facade Package Preview / package-preview`
  - GitHub `Public Facade Linux Smoke / public-facade-linux-smoke`

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
