# ADR-0004: Report-Generation Subsystem Baseline

- Status: accepted
- Date: 2026-04-02
- Deciders: sole author

## Context

- The authoritative second-round research identifies comparison-report
  generation as the first unresolved engineering workstream.
- The same research recommends an isolated report-generation subsystem with
  planner, engine, report store, and UI integration boundaries.
- The current repo already has governed requirements for report generation, but
  no implementation surface for naming, storage layout, or command planning.

## Decision

- Introduce a pure report-planning subsystem first.
- Use LabVIEW CLI `CreateComparisonReport` as the canonical planned engine.
- Keep any retained `LVCompare` planning logic as internal parity-only support,
  not as a public engine-selection contract.
- Keep naming, staging, and storage-layout planning deterministic and
  test-heavy before wiring live runtime execution.

## Rationale

- The research makes report naming, same-name staging, and storage layout
  deterministic even before live LabVIEW execution is added.
- A pure planning boundary allows high-fidelity unit coverage without
  overclaiming live runtime support.
- This keeps the repo aligned to the authoritative research while minimizing
  churn in existing history-viewer code.

## Consequences

- Positive:
  - report-generation work can land in atomic slices
  - naming and storage policy become testable now
  - future runtime integration can reuse the same governed plans
- Negative:
  - report execution remains a later tranche
  - some report-generation requirements stay planned until runtime wiring exists
