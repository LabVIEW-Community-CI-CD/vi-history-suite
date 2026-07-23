# ADR-0032: Deterministic Packet-Derived Agent Feedback With Screenshot Cross-Check

- Status: Accepted
- Date: 2026-07-23

> Authoritative requirements: VHS-REQ-710 (NI LabVIEW setup diagnostics, the
> calibration surface family) and VHS-REQ-707 (Mirror-Mode dual real-runtime
> validation, the perfmon capture + agent-consumption family). The requirements
> package holds the authoritative text; this ADR is the retained design record.
> It mirrors the authority repo `mprr`'s ADR-0041 (Successor Schema Paired Sealed
> Segments And Deterministic Agent Feedback) into `vi-history-suite`, which is
> `mprr`'s first governed fixture repo.

## Context

`mprr` is the authority repo for the governed record/replay transport, the
fiducial + stopwatch surfaces, the calibration surface, and the zero-copy
rolling-block capture substrate; `vi-history-suite` is its first governed fixture
repo and the consumer of that replay. The consumer that matters here is the
**agent**: while helping a human troubleshoot, the agent needs awareness of the
current surface and of resource behavior (CPU, RAM, disk, LabVIEW footprint)
correlated across multiple interactive sessions.

The naive approach makes screenshots the primary awareness surface. `mprr`'s
ADR-0041 rejects that: it establishes that the primary agent-feedback surface is
**packet-derived** (a deterministic representation reconstructed from the sealed
payload), and that a **screenshot is a fallback proof and cross-check surface
only**. It also bounds the sealed-feedback path to a 10-second target, keeps the
result advisory, and never lets it override the authority floor (raw replay and
stop-path).

The calibration north star for `vi-history-suite` is to prove the `mprr`
calibration surface on a non-Windows (Ubuntu) host. `mprr` renders and validates
that surface with a Windows-only WinForms + ffmpeg path. To reach the north star
faithfully — not by inventing a parallel, screenshot-first design — the fixture
repo needs one governed decision that mirrors ADR-0041's boundary: the
authoritative calibration truth is packet-derived (the deterministic surface the
repo renders from the `mprr` marker contract), and a headless screenshot is only
the independent cross-check witness.

Prior related decisions: ADR-0028 (Mirror-Mode dual real-runtime validation) and
ADR-0029 (Agent-Facing Runtime And Container Diagnostics), which already own the
mirror capture surfaces and the fiducial/stopwatch synchronization analyzer.

## Decision

`vi-history-suite` shall adopt `mprr` ADR-0041's boundary for its calibration and
agent-feedback surfaces, as a set of pure, deterministic, additive modules that
leave the shipped comparison and runtime contracts unchanged:

- The **primary agent-feedback surface is packet-derived**. For calibration, the
  authoritative truth is the deterministic surface rendered from the `mprr`
  `review-capture-calibration-surface-v1` contract (eight edge fiducials at fixed
  screen-relative rectangles and expected colors, plus the black border). A
  screenshot is the **fallback proof and cross-check surface only**.
- Calibration feedback is **authoritative only when the independent screenshot
  witness agrees** with the packet-derived contract (every fiducial within the
  maximum Euclidean color distance of 60 and the geometry intact) **and the
  sealed-feedback latency is within budget** (ADR-0041's 10-second target). Above
  budget it **fails closed**; within budget but without agreement it is
  **advisory** agent/operator assistance that never overrides the authority floor.
- The **primary lookup key is the packet timestamp**, with a shared segment
  identity binding the paired sealed segment, consistent with ADR-0041.
- Consumption is **bounded**: the agent consumes the replay through a
  deterministic rolling-block ring that mirrors `mprr`'s zero-copy rolling-block
  memory IP (single preallocated continuous byte ring, SPSC, three-45s-block
  admission control, short-before-long degradation) so RAM cannot overflow.
- Cross-session resource behavior is summarized into a deterministic pattern
  (trends, monotonic leak signals, z-score anomalies) the agent interprets for
  longitudinal troubleshooting; this is a **diagnostic overlay**, not authority.

Explicitly rejected: making the screenshot the primary/authoritative surface;
an unbounded live-tail consumer that can exhaust RAM; and blocking the authority
floor on advisory agent feedback.

## Consequences

- The fixture repo reaches the Ubuntu calibration north star by rendering the
  packet-derived surface and cross-checking it against a headless screenshot,
  using the same distance-60 contract `mprr` proved on Windows, rather than a
  divergent screenshot-first design.
- Agent feedback is deterministic, bounded, cross-checked, and advisory, so it
  can be trusted for troubleshooting without becoming a correctness authority.
- The decision is additive: it introduces pure modules
  (`mprrCalibrationSurface`, `mprrCalibrationSurfaceRenderer`,
  `mprrAgentFeedbackCrossCheck`, `deterministicRollingBlockRing`,
  `perfmonSessionPattern`, `perfmonMprrSync`) under VHS-REQ-710 and VHS-REQ-707
  and changes no shipped comparison or transport contract.
- Follow-on work this enables: a real Ubuntu calibration proof artifact, a
  paired-sealed-segment reader, and (deferred, as in ADR-0041) a dashboard
  consumer. It constrains future feedback work to keep the packet-derived surface
  primary and the screenshot a cross-check.
