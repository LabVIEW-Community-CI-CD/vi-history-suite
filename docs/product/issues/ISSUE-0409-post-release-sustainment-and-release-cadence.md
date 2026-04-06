# ISSUE-0409: Post-Release Sustainment And Release Cadence

## Goal

Give post-benchmark `vi-history-suite` maintenance an explicit governed home
for release cadence, benchmark refresh cadence, operator-surface upkeep, and
control-plane stability.

## Status

Active post-release issue.

Activation is now satisfied:

- `PROGRAM-0003` is now closed on the benchmark-proof packet under
  `TRANCHE-011`
- `PROGRAM-0005` is now closed on the retained execution-policy contract under
  `TRANCHE-013`
- `TRANCHE-012` is now the active queue tranche

## Scope

- release cadence and SemVer discipline after the first public release-kit
  closeout
- benchmark refresh cadence and image contract upkeep
- operator-surface and documentation-workbench sustainment
- post-release control-plane maintenance
- not the now-closed extension execution-flexibility feature layer, which was
  retired under `PROGRAM-0005` / `ISSUE-0410`

## Non-Goals

- reopening the first public-release closeout program
- reopening benchmark proof once it is governed as complete
- unbounded feature growth without a new explicit program

## Dependencies

- completed `PROGRAM-0002`
- completed `PROGRAM-0003`
- completed `PROGRAM-0005`
- truthful current-state and queue surfaces

## Acceptance Criteria

- sustainment operating rules are explicit in the control plane
- release and benchmark refresh cadence are bounded and discoverable
- operator/documentation upkeep has a governed maintenance path
- future work does not fall back into unowned tail iteration

## Required Evidence

- updated queue and program docs
- sustained release and benchmark refresh rules
- green docs and design gates after the sustainment control-plane update

## First Active Slice

- retain the sustainment operating model in the queue and current-state docs
- define the first maintained release-refresh and benchmark-refresh rules
- stop short of opening a new feature-layer program
