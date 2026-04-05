# PROGRAM-0004: Post-Release Sustainment And Release Cadence

## Status

Queued follow-on post-release program.

Activation is intentionally deferred until:

- `PROGRAM-0003` closes the benchmark-proof packet under `TRANCHE-011`
- the queue promotes `TRANCHE-012` from `queued` to `active`

## Purpose

Define the sustained operating program after the public-release closeout and
benchmark-proof programs are complete.

This program keeps `vi-history-suite` from falling back into ad hoc tail work
by giving release cadence, benchmark refresh cadence, operator surfaces, and
control-plane upkeep an explicit home.

Feature-layer extension execution flexibility and runtime-acquisition UX are
not owned by this sustainment program. They are queued separately under
`PROGRAM-0005` so the repo does not hide user-facing execution-policy work
inside generic maintenance language.

## North Star

`vi-history-suite` remains a governed released product with:

- a truthful public release-kit surface
- bounded benchmark refresh policy
- sustained operator-facing proof surfaces
- disciplined versioning and documentation upkeep

## Workstreams

1. release cadence, SemVer discipline, and public release-kit upkeep
2. benchmark refresh cadence and proof-surface maintenance
3. operator-surface, documentation-workbench, and control-plane sustainment

## Queue Mapping

- `TRANCHE-012`
  - `ISSUE-0409`

## Exit Gates

### Gate A: Release Cadence

- release cadence is explicit and governable
- version bumps and packaged-artifact discipline remain bounded and repeatable

### Gate B: Benchmark Sustainment

- benchmark refresh policy is retained
- benchmark-image contracts and consumer tooling remain truthful

### Gate C: Operator And Public Surface Sustainment

- public release-kit docs and support surface remain truthful
- operator-facing host-review, docs-workbench, and evidence-consumer surfaces
  remain maintained

### Gate D: Control-Plane Stability

- queue, current-state, and sustainment docs reflect the live operating model
- future work enters under an explicit sustained program instead of drifting
  through open-ended tail work

## Delivery Rules

This program is about maintenance discipline, not feature sprawl.

Every slice must preserve:

- versioned release truth
- benchmark evidence truth
- documentation-package coherence
- operator-surface clarity

## First Implementation Slice

Start with [ISSUE-0409 Post-Release Sustainment And Release Cadence](../issues/ISSUE-0409-post-release-sustainment-and-release-cadence.md).

That slice should:

- retain the sustainment operating model in the control plane
- define the first benchmark-refresh and release-refresh rules
- stop short of claiming new product-layer expansion

## Success Condition

This program is complete when `vi-history-suite` has a stable post-benchmark
operating model for releases, benchmark refresh, and documentation/operator
upkeep, with no ambiguity about where ongoing maintenance work belongs.
