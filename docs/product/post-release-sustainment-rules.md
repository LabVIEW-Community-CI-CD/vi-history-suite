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
- parallel post-release closeout still open: `TRANCHE-010` / `PROGRAM-0002`
  on Sergio Velderrain's manual Windows 11 right-click gate

The sustainment lane operates in parallel with that remaining human gate. It
does not reopen `PROGRAM-0002`, `PROGRAM-0003`, or `PROGRAM-0005`.

## Release Refresh Rules

Release cadence is event-driven, not calendar-driven.

The maintained release surfaces are:

- `main` preview artifacts for governed install testing
- SemVer-tagged exact-version release artifacts
- public release-kit source truth that consumes the immutable release
- docs-authoring workbench publication surfaces tied to the same repo state

Refresh the release package when any of these change:

- `package.json` version
- SemVer tag intent or release-manifest shape
- public release-kit assets or setup/support guidance that must follow the
  exact released VSIX
- release procedure, ship-control, or docs-workbench publication contract

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
- SRS, RTM, and test plan when normative behavior changes
- wiki coverage/publication ledgers when reader-facing authority changes
- published wiki pages that represent the changed authority docs
- bundled docs after published wiki pages change

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
