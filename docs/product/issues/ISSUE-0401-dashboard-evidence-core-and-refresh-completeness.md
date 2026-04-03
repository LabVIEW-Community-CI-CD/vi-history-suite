# ISSUE-0401: Dashboard Evidence Core And Refresh Completeness

## Goal

Make the dashboard packet a complete and deterministic representation of the
commit window for one VI.

## Scope

- explicit adjacent-pair coverage across the retained window
- pair states:
  - archived
  - missing
  - blocked
  - failed
- provider provenance per pair
- deterministic dashboard rebuild from retained pair archives
- explicit completeness facts in the dashboard packet

## Non-Goals

- visual polish
- runtime doctor UX
- human decision records

## Dependencies

- existing pair archive retention
- existing dashboard packet generation
- canonical harness `HARNESS-VHS-001`

## Acceptance Criteria

- every adjacent commit pair in scope appears in the dashboard packet
- missing archived pairs are retained explicitly rather than omitted
- blocked and failed report states are retained explicitly per pair
- provider provenance is retained per pair and surfaced in the dashboard packet
- dashboard rebuild from retained pair archives is deterministic
- no pairwise evidence is overwritten by later refreshes

## Required Evidence

- unit tests for window completeness and archive completeness
- retained dashboard packet for the canonical harness
- design-gate pass

## First Slice

- harden dashboard packet generation so missing pairs are emitted explicitly
- add completeness counters and provider-provenance normalization
- add tests before UI refinement
