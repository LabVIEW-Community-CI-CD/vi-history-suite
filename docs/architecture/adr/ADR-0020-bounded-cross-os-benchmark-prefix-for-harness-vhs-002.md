# ADR-0020: Bounded Cross-OS Benchmark Prefix For HARNESS-VHS-002

## Status

Accepted

## Context

`HARNESS-VHS-002` targets the deep `resource/plugins/lv_icon.vi` history in
`ni/labview-icon-editor`.

The retained Windows host lane completed the full 139-commit / 138-pair window.
The retained Linux host lane did not. Under the latest official NI Linux image
family, the deep Linux run progressed through the first 134 generated reports
and then failed at pair `135/138` with the retained diagnostic reason
`linux-headless-recursive-load`.

Additional retained evidence narrowed the boundary:

- `nationalinstruments/labview:latest-linux` and
  `nationalinstruments/labview:2026q1-linux` resolved to the same official NI
  image content
- bounded fresh-session repros did not make pair `135` complete under either
  `LabVIEWCLI` or `LVCompare`
- attempting to fall back to `2025q3-linux` failed because the staged VI
  revision version was newer than that runtime

So the full 138-pair Linux deep window is currently blocked by the latest
official NI Linux runtime truth, not by a missing benchmark liveness surface.

## Decision

Adopt a governed bounded cross-OS comparable prefix for `HARNESS-VHS-002`.

1. The full deep target remains `139` commits / `138` pairs for the Windows
   host lane and the Windows benchmark-image lane.
2. The accepted cross-OS comparable window is the first `135` commits /
   `134` pairs, ending at retained pair id `2a28a2b984d9`.
3. The repo shall retain a machine-readable comparable-prefix packet that
   records:
   - the full window
   - the bounded comparable prefix
   - the retained Windows host timing for that prefix
   - the retained Linux timing for that prefix
   - the full-window Linux blocker reason and artifacts
4. The full Linux `138`-pair result remains governed blocker truth until NI
   changes the official Linux runtime/image truth or the benchmark design
   changes.
5. The Windows benchmark image still must prove the same bounded comparable
   prefix before the comparative benchmark program can close.

## Consequences

### Positive

- the benchmark program can retain truthful cross-OS evidence now instead of
  waiting on an unsupported Linux full-window outcome
- the full Linux blocker stays explicit rather than being hidden behind a
  vague “partial” label
- future benchmark refreshes have a stable comparable scope to test

### Negative

- benchmark truth now has two scopes:
  - full deep window
  - bounded cross-OS comparable prefix
- future sessions must not mix the bounded comparable packet with full-window
  claims
- if NI fixes the Linux headless seam later, this bounded exception needs to be
  revisited

## Implementation Surface

- `scripts/buildComparablePrefixBenchmarkPacket.js`
- `docs/product/benchmark-packets/HARNESS-VHS-002-comparable-prefix.json`
- `docs/product/benchmark-packets/HARNESS-VHS-002-comparable-prefix.md`
- `docs/product/harnesses.md`
- `docs/product/execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md`
- `docs/product/issues/ISSUE-0408-repeatable-benchmark-proof.md`
- `docs/product/current-state.md`
- `docs/product/development-queue.json`
- `tests/unit/buildComparablePrefixBenchmarkPacketScript.test.ts`
