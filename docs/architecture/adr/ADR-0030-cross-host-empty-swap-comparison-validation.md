# ADR-0030: Cross-Host Empty-Swap Comparison Validation

- Status: Accepted
- Date: 2026-07-22

> Authoritative requirement: VHS-REQ-711 (Cross-Host Empty-Swap Comparison
> Validation), a child of system requirement VHS-SYS-REQ-013 (CI And Developer
> Environment). The requirements package holds the authoritative text; this ADR
> is the retained design record.

## Context

Readiness diagnostics (ADR-0029, VHS-REQ-710) answer whether a LabVIEW runtime is
*set up* to compare. They do not answer the next, sharper question: does that
runtime actually *produce a correct comparison end-to-end*? A runtime can pass
every readiness check and still fail to stage revisions, launch the CLI, or
render a report — and a comparison that runs but reports "no differences" for a
real change is worse than an honest failure.

The comparison is meant to be **cross-platform and cross-host**: the same change
must be validatable on the Linux container (Docker + the NI LabVIEW Linux image),
Linux host-native LabVIEW, and Windows host-native LabVIEW (the Vagrant mirror).
That demands one driver, parameterized by host, emitting a typed, directly
comparable outcome — not a scatter of per-host scripts.

Two facts shape the contract. First, the smallest honest real change is the
**empty-swap fixture**: one tracked path whose bytes move from `empty.vi` (base
revision) to `empty1.vi` (selected revision). Both are real VIs that genuinely
differ, so a *verified* run must actually observe a difference. Second, rendered
LabVIEW comparison reports embed non-deterministic bytes (image renders, absolute
staging paths), so a byte-identical report hash is **not** a valid cross-host
parity key; the semantic outcome is.

## Decision

Establish a versioned, cross-host empty-swap comparison validation capability,
owned by vi-history-suite, split into a **pure testable contract** and a thin
**maintainer harness**:

- A pure module (`src/reporting/comparisonValidation/emptySwapComparisonEvidence.ts`)
  owns option resolution (provider `host`/`docker`, platform, bitness, LabVIEW
  version, container image, and the corpus base/selected revisions — fail-closed
  when a revision is absent), a typed versioned evidence record (schema id
  `vi-history-suite/empty-swap-comparison@v1`), a host-line-ending-stable report
  digest, runtime-outcome summarization, difference-heading detection (matching
  the DOM `class` attribute so CSS selectors are not miscounted), and a
  fail-closed verdict.
- The verdict is `comparison-verified` **only** when the runtime succeeded, the
  report exists, and a difference was detected; any error, block, runtime
  failure, or unproven state yields a non-verified verdict. A validation run is
  never reported verified unless a real comparison actually observed the
  empty-swap change.
- Cross-host parity rests on this **semantic outcome**, not the report hash. The
  digest is normalized for host line endings and retained as evidence only.
- A maintainer `.cjs` harness (`scripts/emptySwapComparisonDriver.cjs`,
  inventory-exempt) performs the single real `CreateComparisonReport` run through
  the shipped comparison primitives (`locateComparisonRuntime`,
  `preflightComparisonReportRevisions`, `persistComparisonReportPacket`,
  `executeComparisonReport` with `materializeSelectedRevisionTreeWithGit`) and
  imports the compiled contract, so the harness validates the *real* pipeline
  rather than a stand-in.

Rejected: folding this into the diagnostics ADR (ADR-0029) — end-to-end
comparison validation is a distinct capability from readiness diagnosis, and
ADR-0029 itself records that a distinct, reusable capability warrants its own
design record; and using a byte-identical report hash as the parity key (invalid
because rendered reports are non-deterministic across hosts and runs).

## Consequences

- The contract is unit-tested without a runtime (option resolution, evidence
  shape, digest normalization, outcome summarization, difference detection, and
  verdict are pure), so the cross-host validation logic is verified
  deterministically; the harness runs the real comparison on a capable host.
- Demonstrated on **real hardware** (linux-container, NI LabVIEW Linux image):
  `runtimeState=succeeded`, `reportExists=true`, `differenceDetected=true`,
  `verdict=comparison-verified` over the real `empty.vi -> empty1.vi` report.
- The Linux host-native variant is currently blocked by a corrupt Getting Started
  Window component in the host LabVIEW install (a LabVIEW-repair concern tracked
  separately); the contract classifies that run `failed`, never `verified`, which
  is the intended fail-closed behavior.
- Follow-on: the same driver runs the Windows host-native (Vagrant) parity pass;
  because parity is the semantic verdict, cross-host results are directly
  comparable. This validation capability never authors `.vi` binaries.
