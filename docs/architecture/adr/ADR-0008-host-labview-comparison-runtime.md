# ADR-0008: Host LabVIEW Comparison Runtime Selection And Gating

- Status: Accepted
- Date: 2026-07-19

> This ADR records the retained design for host-native comparison runtime
> selection and pre-open gating under system requirement VHS-SYS-REQ-004 (Host
> LabVIEW Comparison Path). The requirements package holds the authoritative
> text; this is the design record.

## Context

Comparisons default to the LabVIEW installed on the user's machine (the host
path). Producing a correct comparison requires the right LabVIEW year and
bitness, a reachable LabVIEW CLI, and Git; a wrong or missing runtime must be
detected and explained before work starts rather than failing partway. The
extension must also let a user inspect, select, and override the runtime, and
must never silently switch provider, year, or bitness during a compare.

## Decision

Make host-runtime selection **explicit, auto-repairing, and fail-closed at the
gate**:

- Auto-select a satisfiable runtime and repair stale settings; surface the
  choice through a reactive provider quick-pick and status surface, with a
  missing-runtime notification and first-run Git guidance.
- Stage comparison inputs deterministically and prepare local runtime settings
  through the CLI.
- Gate VI History open on real prerequisites — LabVIEW CLI presence with an
  install offer and an authoritative host fallback, and pre-panel gates for
  bitness conflict, version mismatch, and "VI version too new" — plus
  concurrent-LabVIEW bitness/version conflict diagnostics and host install
  catalog parity, with a manual path override for unusual installs.

## Consequences

- A comparison never starts against an unsafe runtime; each block names a next
  step instead of failing mid-run.
- Runtime choice is user-visible and user-controllable, and the persisted
  selection is honored (no silent switching).

## Requirements recorded

VHS-SYS-REQ-004; VHS-REQ-147, VHS-REQ-612, VHS-REQ-616, VHS-REQ-617,
VHS-REQ-619, VHS-REQ-621, VHS-REQ-622, VHS-REQ-629, VHS-REQ-632, VHS-REQ-633,
VHS-REQ-634, VHS-REQ-636, VHS-REQ-637, VHS-REQ-653, VHS-REQ-658.
