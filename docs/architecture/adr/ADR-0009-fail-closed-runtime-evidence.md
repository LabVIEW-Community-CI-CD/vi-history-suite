# ADR-0009: Fail-Closed Runtime Evidence And Diagnostics

- Status: Accepted
- Date: 2026-07-19

> This ADR records the retained design for fail-closed comparison-runtime
> evidence and diagnostics under system requirement VHS-SYS-REQ-007 (Fail-Closed
> Runtime Evidence). The requirements package holds the authoritative text; this
> is the design record.

## Context

When a comparison cannot run correctly, the failure must be actionable and
leave evidence, rather than producing a partial or misleading report. Failures
span several environments: the LabVIEW CLI connection, VI Server (TCP) being
disabled, Docker not installed or its daemon not running, Linux/Win32
host-native invocation specifics, and Linux container bind-mount visibility.

## Decision

Treat runtime failure as a **first-class, evidenced, fail-closed** outcome:

- Retain runtime execution evidence and comparison-runtime discovery
  diagnostics for every attempt.
- Give actionable guidance for VI Server disabled and for a LabVIEW CLI
  connection failure, and for Docker daemon-not-running / Docker-not-installed
  as explicit toasts.
- Support Linux and Win32 host-native headless comparison invocation (including
  32-bit LabVIEW parity), Windows host-native VI Server TCP preflight parity,
  Linux container bind-mount visibility diagnostics, and serialized local VI
  Server acquisition so concurrent attempts do not corrupt each other.

## Consequences

- A blocked comparison always explains why and what to do next, and leaves a
  retained diagnostic artifact.
- Host-native and container execution behave consistently across platforms and
  bitnesses.

## Requirements recorded

VHS-SYS-REQ-007; VHS-REQ-148, VHS-REQ-155, VHS-REQ-156, VHS-REQ-623,
VHS-REQ-628, VHS-REQ-630, VHS-REQ-642, VHS-REQ-643, VHS-REQ-663, VHS-REQ-665,
VHS-REQ-669.
