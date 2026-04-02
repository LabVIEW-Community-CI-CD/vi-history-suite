# ADR-0006: Windows 64-Bit Container Isolation For Extension Users

- Status: accepted
- Date: 2026-04-02
- Deciders: sole author

## Context

- The authoritative runtime research requires explicit LabVIEW 2026 Q1
  selection and discourages ambient defaults such as "most recently used" or
  "currently registered" LabVIEW when generating comparison reports.
- The current architecture already preserves a provider boundary for future
  Windows 64-bit isolation, but that boundary is bundled with runtime-locator
  design and does not state the extension-user operating policy strongly
  enough.
- Author direction adds an explicit user concern: extension users may already
  have a host-native LabVIEW 2026 64-bit session open for unrelated work, and
  report execution should not collide with that session or require users to
  reshape their host setup.

## Decision

- Treat a `labview2026q1` Windows container provider as the preferred
  architecture target for Windows 64-bit comparison-report execution.
- Keep Windows 32-bit report execution on the host-native path.
- Do not treat host-native Windows 64-bit execution as the ambient default
  once the isolated provider exists; it remains an explicit provider choice,
  not an assumed fallback.
- Keep the current repo self-contained by retaining this as an architectural
  commitment first, with live container execution remaining a later governed
  tranche.

## Rationale

- Extension users should be able to generate 64-bit reports without colliding
  with an already-open host LabVIEW 2026 64-bit installation.
- A dedicated container provider lets the extension own the execution
  environment instead of inheriting host process state.
- Keeping 32-bit host-native preserves the author-directed split where the
  32-bit lane remains tied to native Windows LabVIEW 2026 Q1 x32, while the
  64-bit lane gains isolation from host-session drift.
- Making this its own ADR prevents the user-isolation policy from being lost
  inside the broader runtime-detection decision.

## Consequences

- Positive:
  - extension-user isolation for Windows 64-bit becomes an explicit product
    policy
  - future runtime work can implement the container provider without changing
    the product intent later
  - host-native 64-bit collision avoidance is retained as architecture, not
    chat memory
- Negative:
  - live container execution is still not implemented
  - future runtime execution must handle container availability, trust gating,
    and report-artifact exchange explicitly
