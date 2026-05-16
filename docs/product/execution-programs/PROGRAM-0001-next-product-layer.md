# PROGRAM-0001: Next Product Layer

## Purpose

Define the governed execution program for the next product layer after reliable
Windows 64-bit comparison-report execution.

This program is now subordinate to
[SHIP-0001: Releasable VI History Suite](../SHIP-0001-releasable-vi-history-suite.md).
`PROGRAM-0001` remains the product-layer decomposition, but ship direction is
owned by the repo-wide ship-control surfaces.

This program turns `vi-history-suite` from a strong pairwise report generator
into a first-class human review system for one VI across multiple modifications.

## North Star

A reviewer selects one eligible VI with at least three commits in scope and
uses one extension-native dashboard to:

- review multiple retained VI Comparison Reports from one place
- understand chronology and pair provenance clearly
- see concentrated comparison-report metadata from each retained pair
- make a bounded human decision without opening every pairwise report first

## Program Shape

This product layer is delivered through five issue-ready workstreams:

1. dashboard evidence core and refresh completeness
2. dashboard metadata concentration UX
3. progress, cancellation, and runtime-doctor developer experience
4. review-scenario registry and human decision records
5. dashboard smoke and extension-host proof

## Issue Order

1. [ISSUE-0401 Dashboard Evidence Core And Refresh Completeness](../issues/ISSUE-0401-dashboard-evidence-core-and-refresh-completeness.md)
2. [ISSUE-0402 Dashboard Metadata Concentration UX](../issues/ISSUE-0402-dashboard-review-ux-and-raw-drill-down.md)
3. [ISSUE-0403 Progress Cancellation And Runtime Doctor UX](../issues/ISSUE-0403-progress-cancellation-and-runtime-doctor-ux.md)
4. [ISSUE-0404 Review Scenario Registry And Human Decision Records](../issues/ISSUE-0404-review-scenario-registry-and-human-decision-records.md)
5. [ISSUE-0405 Dashboard Smoke And Extension-Host Proof](../issues/ISSUE-0405-dashboard-smoke-and-extension-host-proof.md)

## Queue Mapping

- `TRANCHE-006`
  - `ISSUE-0401`
  - `ISSUE-0402`
  - `ISSUE-0405`
- `TRANCHE-004`
  - `ISSUE-0403`
  - historical progress-surface tranche now closed by implemented
    notification/status-bar/webview progress, bounded report/dashboard
    progress, cancellation with partial-evidence retention, and trust-loss
    fail-closed behavior
- `TRANCHE-007`
  - `ISSUE-0404`
- `TRANCHE-008`
  - `ISSUE-0403`
  - `ISSUE-0405`

## Exit Gates

### Gate A: Dashboard Evidence Truth

- every adjacent pair in scope is represented explicitly
- archived, missing, blocked, and failed states are retained explicitly
- provider provenance is retained per pair
- dashboard refresh can rebuild from retained pair archives deterministically

### Gate B: Dashboard Review Surface

- dashboard HTML is chronology-first and concentration-first
- dashboard shows only retained comparison-report metadata without semantic
  overreach
- dashboard metadata is derived from actual NI report fields, not invented
  summary cues
- completeness and exception facts remain retained without overtaking the HTML

### Gate C: Developer Experience

- long-running dashboard/report tasks show bounded progress
- cancellation retains partial evidence instead of discarding it
- runtime doctor explains chosen provider, rejected providers, and next actions
- trust gating remains explicit on execution and refresh paths

### Gate D: Decision Support

- at least one canonical review scenario is active
- one human decision record can be retained separately from machine evidence
- the dashboard supports judgment without claiming to replace judgment

### Gate E: Proof And Sustainment

- canonical dashboard smoke artifacts exist
- extension-host proof covers dashboard open, refresh, and drill-down paths
- current-state, alignment, implementation index, and queue all reflect the
  live dashboard state

## Delivery Rules

Every issue in this program must move together:

- requirements
- RTM
- test plan
- code
- tests
- current-state/control-plane docs
- design-gate evidence

No implementation-only slices are allowed.

## First Implementation Slice

Start with [ISSUE-0401 Dashboard Evidence Core And Refresh Completeness](../issues/ISSUE-0401-dashboard-evidence-core-and-refresh-completeness.md).

That first slice should:

- make every adjacent pair in the retained commit window explicit
- normalize provider provenance and pair completeness in the dashboard packet
- prove dashboard rebuild from retained pair archives
- preserve missing, blocked, and failed pair states instead of hiding them

## Success Condition

This program is complete when `vi-history-suite` can produce one governed
dashboard packet and one governed dashboard HTML artifact for one VI across at
least three commits, with enough retained evidence and UX quality that a human
reviewer can use the dashboard as the default review surface rather than a pile
of individual pairwise reports.
