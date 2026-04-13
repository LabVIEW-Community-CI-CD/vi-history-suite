# ADR-0005: Runtime-Provider Selection And Windows 64-Bit Isolation

- Status: accepted
- Date: 2026-04-02
- Deciders: sole author

## Context

- The authoritative research requires LabVIEW 2026 Q1 runtime/tool detection
  with explicit user overrides, documented install-root scanning, and
  best-effort Windows registry probing.
- The authoritative compare-report contract now treats LabVIEW CLI
  `CreateComparisonReport` as the canonical public compare-report engine.
- Any retained `LVCompare` evidence is internal parity or diagnosis evidence,
  not a public operator-selected fallback contract.
- Author direction adds a new architectural constraint: Windows 64-bit report
  execution should be able to run in an isolated `labview2026q1` Windows
  container so extension users do not collide with an already-open host-native
  LabVIEW 2026 64-bit session.

## Decision

- Introduce a governed runtime-locator module that selects host-native report
  tooling from explicit settings, documented scan roots, and best-effort
  Windows registry evidence.
- Keep report-runtime execution behind an explicit provider boundary:
  - host-native provider is implemented now
  - Windows 64-bit isolated container provider remains available as the
    bounded expert isolation path when governed Docker execution or proof is
    selected
- Keep Windows 32-bit report execution on the host-native path.
- Keep public report generation on canonical `CreateComparisonReport` and fail
  closed when that governed engine is unavailable on the selected surface.
- Retain `LVCompare` only as internal parity or diagnosis support, not as a
  public runtime-selection target.
- Capture the extension-user Windows 64-bit isolation policy in a dedicated
  follow-on ADR so provider selection and user-isolation intent do not drift.

## Rationale

- The locator module gives the repo a truthful runtime contract before live
  NI execution is wired into the report packet path.
- A provider boundary prevents the isolated container path from being bolted
  onto host-native assumptions later.
- Keeping 32-bit host-native and 64-bit container-capable aligns with the
  author’s collision-avoidance requirement while preserving a bounded expert
  Docker path without pretending it is the default installed-user lane.

## Consequences

- Positive:
  - runtime selection becomes testable and traceable
  - host-native and bounded expert container execution are separated cleanly
  - Windows 64-bit isolation is captured as architecture, not chat memory
- Negative:
  - container execution remains more operationally complex than the
    host-default installed-user lane
  - the bounded expert container path still has to stay aligned with workspace
    trust, progress UX, and retained provider-proof surfaces
