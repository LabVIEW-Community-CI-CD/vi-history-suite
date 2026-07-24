# ADR-0033: Full Perfmon Metadata via Additive Generic Channels

- Status: Accepted
- Date: 2026-07-24

> Authoritative requirement: VHS-REQ-715 (Full Perfmon Metadata Capture and
> Generic Channel Series), a child of system requirement VHS-SYS-REQ-013 (CI and
> Developer Environment). The requirements package holds the authoritative text;
> this ADR is the retained design record. Extends VHS-REQ-707 (Mirror-Mode dual
> real-runtime validation) and its capture plan VHS-REQ-707.14; feeds the
> benchmark-correlation horizon (epic #2348 Phase D).

## Context

The mirror-mode perfmon capture (VHS-REQ-707.14, `perfmonCapturePlan.ts`) recorded
only five counters — three always-on system counters (`\Processor(_Total)\%
Processor Time`, `\Memory\Available MBytes`, `\PhysicalDisk(_Total)\% Disk Time`)
plus two optional LabVIEW process counters (`% Processor Time`, `Working Set`) —
and the parser (`perfmonSampleSeries.ts`) hard-coded a fixed five-key series
model, so it structurally could not carry more.

`typeperf -q` on a real Windows host shows ~100 counters available (`\Process` 28,
`\Memory` 36, `\Processor` 15, `\PhysicalDisk` 21). The agent-readable VI change
intelligence horizon (epic #2348 Phase D) correlates a VI change with its
performance impact, so the richer and more faithful the captured profile — CPU
user/privileged split, memory commit + paging pressure, disk throughput + queue
depth, and per-process private/virtual bytes, IO throughput, handle/thread growth
— the more an agent can infer. A live `typeperf` sample confirmed the expanded
set records real values in the same PDH-CSV format the parser already consumes.

## Decision

Expand perfmon capture to the full available metadata surface **additively**,
without a breaking schema change:

- **Generic channels in the parser.** `parsePdhCsv` now emits, alongside the
  unchanged named `series`/`peaks`, a `channels` array: every captured counter
  column as `{ counterPath, samples, peak }`, in header order, with the leading
  `\\HOST` machine prefix stripped so paths are host-independent and comparable
  across a developer host and CI. This is a superset of the named series. The
  schema id stays `vi-history-suite/perfmon-sample-series@v1` because the change
  is purely additive (a new field; the named channels and all existing consumers
  are untouched).
- **Tiered counter profiles in the capture plan.** `buildWindowsPerfmonCapturePlan`
  keeps the minimal profile as the default (byte-for-byte the prior behavior) and
  adds an opt-in `profile: 'full'` (the curated expanded system + per-process
  sets) plus `extraCounters` for arbitrary verbatim counter paths, deduped with
  order preserved so `logman` never sees a duplicate `-c`.

Rejected: a breaking `@v2` series schema (would ripple through ~11 consumers for
no functional gain when a superset field is additive); capturing literally every
counter object by default (noise + large CSVs — the curated full profile plus
opt-in `extraCounters` covers real needs); and reproducing lvkit-style per-counter
name normalization beyond host-prefix stripping (counter paths are already
canonical).

## Consequences

- A consumer (and the future MCP benchmark-correlation surface) can read any
  counter the plan captured, not just the five named channels — the full
  per-process and system performance profile of a run.
- Channels are host-independent (prefix-stripped), so the same VI's benchmark is
  comparable across hosts and over time, which is what the correlation horizon
  needs.
- Default behavior is unchanged: the minimal profile and the named series/peaks
  are preserved, existing consumers compile and pass untouched, and the schema id
  stays `@v1`.
- The real `logman` capture of the full profile around a LabVIEW render remains a
  maintainer validation step (Windows-only, elevated) rather than a hosted CI
  gate; the pure plan + parser round-trip is unit-tested in CI.
