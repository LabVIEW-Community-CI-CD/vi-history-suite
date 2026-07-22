# ADR-0028: Mirror-Mode Dual Real-Runtime LabVIEW Validation

- Status: Accepted
- Date: 2026-07-22

<!--
Authoritative requirement: VHS-REQ-707 (Mirror-Mode Dual Real-Runtime LabVIEW
Validation). The text below is the design record for that requirement and
amends the hosted-CI posture set by ADR-0012.
-->

## Context

Real 64-bit-Windows LabVIEW validation currently has a single origin: the
maintainer's local Vagrant "Golden" VM, whose result is recorded as a committed
attestation in the runtime-validation ledger (VHS-REQ-666) that hosted CI reads
fail-closed (VHS-REQ-599 keeps Vagrant out of workflow YAML). That is one
operator, one machine, one bitness lane (x86 LabVIEW Community). ADR-0012
established that hosted CI stays lightweight and hypervisor-free, and ADR-0013
established optional human/maintainer validation surfaces.

Two forces motivate a second, independent real-runtime channel:

- **Correctness oracle.** A binary-format comparison/preview tool is best
  validated by *agreement between independent runtimes* on the same VI, not by a
  single runtime asserting success. Different bitness (x86 vs x64) on different
  isolation technology (VirtualBox VM vs Windows container) is a strong
  differential-testing oracle.
- **Bus factor and coverage.** The current truth depends on one laptop being
  powered on, and the x64 Windows bitness is not covered locally.

The NI LabVIEW Windows container image (`nationalinstruments/labview:2026q1-windows`)
is licensed but available for open-source use; this repository qualifies. That
makes an x64 Docker channel on GitHub-hosted infrastructure legitimate — while
LabVIEW's personal Community license stays on the maintainer's personal Vagrant
VM.

## Decision

Adopt **Mirror Mode**: two independent real-runtime LabVIEW validation channels
that produce the same comparison/preview truth, reconciled by a subsequent
deterministic step. This amends ADR-0012 to admit one heavy *mirror* lane whose
result reaches the required gate only through a committed/published ledger — the
required gate itself stays lightweight.

- **Left channel — Vagrant local** (VirtualBox "Golden" VM, LabVIEW Community
  2026 **x86**): the left-channel producer and the **sole VI-authoring surface**.
- **Right channel — Docker Windows LabVIEW** (`nationalinstruments/labview:2026q1-windows`,
  **x64**) on hosted CI, **run-only**: it executes the shipped compiled runtime
  and never serves as a development environment.
- **Reconciler**: a subsequent deterministic step that ingests **both** channel
  outputs as data at rest (committed ledger or published CI artifact, never live
  cross-machine IPC), unifies them by a shared key, and asserts parity (same
  fixture → same report/preview digest). Divergence is a red signal.

Invariants (explicitly chosen, and what is rejected):

1. **VI authorship is human-only and Vagrant-only.** Sergio Velderrain is the
   sole author of LabVIEW VIs and authors/edits them only on the Vagrant box.
   The Docker channel and all automation are consumers of authored VIs; they
   never create or modify `.vi` binaries. (Rejected: agent/automation VI
   authoring; authoring inside the container or on the Linux host.)
2. **The Docker container is run-only.** It runs the shipped compiled runtime;
   in-container development is forbidden. (Rejected: building/developing inside
   the licensed image.)
3. **Sequencing.** The Vagrant left channel is the precondition: a PR enters the
   merge queue only after it passes, and the merge queue's `merge_group` event
   then triggers the hosted Docker right channel; the reconciler unifies both
   ledgers. (Rejected: running the multi-GB pull on every per-PR push.)
4. **Queue safety.** The required merge gate is a deterministic ledger-read /
   parity check, never a live multi-GB image pull, so an image-registry outage
   cannot brick the merge queue. The heavy pull/run is a best-effort evidence
   producer. (Rejected: making the live pull itself the blocking check.)
5. **Licensing separation.** The NI Windows image is used under its open-source
   allowance in hosted CI; the maintainer's personal LabVIEW Community license
   stays on the personal Vagrant VM.

This ADR is the Phase 0 governance foundation. Producers, the shared
comparison-report digest helper, the ledger mirror tracks, and the reconciler
gate are delivered in later phases under VHS-REQ-707's child requirements.

### Relationship to the existing VHS-REQ-699 hosted x64 lane

The repository already contains `.github/workflows/windows-container-vi-compare.yml`
(mapped under VHS-REQ-699): a manual-dispatch, best-effort hosted-CI workflow
that runs the Windows-container provider with 64-bit LabVIEW and publishes an
evidence artifact. Mirror Mode's Docker right channel **reuses and hardens that
existing lane rather than replacing it** — that workflow is the seed of the
right channel. It counts as the *current* best-effort x64 evidence origin;
Mirror Mode adds, around it, (a) a `merge_group` trigger, (b) an idempotent
ledger track, and (c) the reconciler that unifies it with the Vagrant left
channel. Later phases therefore extend the VHS-REQ-699 workflow; they must not
introduce a second, duplicate Windows-container producer.

## Consequences

- Two independent real-runtime signals (Vagrant x86 + Docker x64) corroborate
  the same comparison/preview truth; disagreement becomes an actionable
  regression signal rather than silent single-runtime trust.
- Hosted CI gains one deliberately heavy but best-effort mirror lane at
  merge-queue time; the required gate stays lightweight and deterministic,
  preserving ADR-0012's fast/reproducible hosted-CI posture and VHS-REQ-599's
  no-Vagrant-in-YAML rule.
- A clean, human-authored, single-origin corpus of minimal intentional VI
  deltas becomes the foundation for labeled ML training/evaluation samples
  (ties to ADR-0027 research rails), with unambiguous provenance. The ledger is
  projectable into an ML-consumable, sample-traceable parity corpus with a
  cross-OS performance signal (VHS-REQ-708).
- Follow-on obligations: a shared deterministic comparison-report digest, ledger
  mirror tracks, the Vagrant left producer, the `merge_group` Docker right lane,
  and the reconciler gate. This ADR amends ADR-0012 (hosted CI stays lightweight)
  and complements ADR-0013 (human validation surfaces) and ADR-0024
  (self-hosted lanes); it supersedes none.
