# ISSUE-0413: Planned Requirements 085-098 Closeout Roadmap

## Status

Closed on April 14, 2026.

## Goal

Close the remaining planned requirement set in `docs/requirements/rtm.csv`
without reopening already-implemented runtime-provider work.

The closeout scope was:

- `VHS-REQ-085`
- `VHS-REQ-086`
- `VHS-REQ-087`
- `VHS-REQ-088`
- `VHS-REQ-089`
- `VHS-REQ-090`
- `VHS-REQ-091`
- `VHS-REQ-092`
- `VHS-REQ-093`
- `VHS-REQ-097`
- `VHS-REQ-098`

## Scope

- `vi-history-suite` repository only (`develop`-based feature branches)
- closeout sequencing for the remaining planned requirements above
- no work on `github-experiment/main`

## Delivery Sequence

1. `feature/req-085-088-review-surface-and-progress-closeout`
   Requirements:
   `VHS-REQ-085`, `VHS-REQ-086`, `VHS-REQ-087`, `VHS-REQ-088`
   Goal:
   finalize WebviewPanel review-surface boundary and progress UX reporting
   contract across indexing and report generation.
   Exit criteria:
   implementation and tests land, RTM rows move to `Implemented`, and docs/test
   plan reflect the shipped behavior.

2. `feature/req-089-093-compare-artifact-governance-closeout`
   Requirements:
   `VHS-REQ-089`, `VHS-REQ-090`, `VHS-REQ-091`, `VHS-REQ-092`, `VHS-REQ-093`
   Goal:
   harden compare preflight and report artifact governance (VI content checks,
   deterministic report naming, same-name extraction safety, storage boundary,
   and report-link rendering safety).
   Exit criteria:
   unit/integration coverage proves each artifact boundary; RTM rows move to
   `Implemented`.

3. `feature/req-097-098-desktop-boundary-and-packaging-guidance-closeout`
   Requirements:
   `VHS-REQ-097`, `VHS-REQ-098`
   Goal:
   finalize desktop-only published target boundary and packaging guidance for
   `vsce`, local VSIX install, and Marketplace publish prerequisites.
   Exit criteria:
   docs + tests + control-plane surfaces are aligned and RTM rows move to
   `Implemented`.

## Completion Record

All three planned sequence branches merged to `develop`:

1. `feature/req-085-088-review-surface-and-progress-closeout`
2. `feature/req-089-093-compare-artifact-governance-closeout`
3. `feature/req-097-098-desktop-boundary-and-packaging-guidance-closeout`

`docs/requirements/rtm.csv` now records `VHS-REQ-085..093` and `VHS-REQ-097..098`
as `Implemented`, and no `Planned` rows remain in the RTM.

## Execution Rules

- each branch must carry requirement-to-test trace updates in RTM and test plan
- merge only on green pipeline; no bypass
- after each merge, re-scan RTM planned rows and either:
  - advance next branch in sequence, or
  - close this issue when no planned rows remain

## Required Proof Per Branch

- focused unit/integration test run for touched requirements
- docs gate run (`docs:ci` or narrower equivalent when applicable)
- RTM status transition for requirement rows closed by that branch

## Closeout Condition

This issue is complete when all eleven requirement rows above are `Implemented`
and no new planned rows are introduced for the same scope.

Condition met.
