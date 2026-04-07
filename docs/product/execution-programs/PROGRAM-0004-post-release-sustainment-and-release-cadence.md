# PROGRAM-0004: Post-Release Sustainment And Release Cadence

## Status

Active post-release program.

Activation is now satisfied:

- `PROGRAM-0003` is closed on the benchmark-proof packet under `TRANCHE-011`
- `PROGRAM-0005` is active again on the breaking `1.0.0` Docker-only contract
- the queue has promoted `TRANCHE-012` to `active`

## Purpose

Define the sustained operating program after the public-release closeout and
benchmark-proof programs are complete.

This program keeps `vi-history-suite` from falling back into ad hoc tail work
by giving release cadence, benchmark refresh cadence, operator surfaces, and
control-plane upkeep an explicit home.

Feature-layer execution-policy work is not owned by this sustainment program.
That work remains explicit under active `PROGRAM-0005`, and the public-closeout
rerun remains explicit under reopened `PROGRAM-0002`.

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
4. branch-model and lane-specific CI governance for the line after each exact release
5. requirements/RTM/test-plan evolution from governed findings
6. ADR evolution from governed findings
7. public GitHub workflow responsibility and churn-control governance

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
- explicit SemVer-decision rationale
- explicit branch-lane admission and CI/design-gate posture
- continuous refinement of the requirement package from governed findings
- continuous refinement of the ADR package from governed findings
- explicit public GitHub workflow responsibilities, bounded triggers, and
  churn-control posture

## First Implementation Slice

Continue with [ISSUE-0409 Post-Release Sustainment And Release Cadence](../issues/ISSUE-0409-post-release-sustainment-and-release-cadence.md).

The first sustainment slice is now retained in:

- [post-release-sustainment-rules.md](../post-release-sustainment-rules.md)
- [post-release-sustainment-rules.json](../post-release-sustainment-rules.json)

That retained slice now:

- retain the sustainment operating model in the control plane
- define the first benchmark-refresh and release-refresh rules
- define benchmark non-trigger and reopen rules for the accepted current
  contract
- define the required authority/wiki/bundled-doc refresh steps for future
  sustainment slices
- stop short of claiming new product-layer expansion

## Success Condition

This program is complete when `vi-history-suite` has a stable post-benchmark
operating model for releases, benchmark refresh, and documentation/operator
upkeep, with no ambiguity about where ongoing maintenance work belongs while
reopened public-closeout or execution-policy work remains explicitly outside
the sustainment bucket.
