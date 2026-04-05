# PROGRAM-0003: Repeatable Benchmark Proof

## Status

Queued follow-on post-release program.

Activation is intentionally deferred until:

- `PROGRAM-0002` closes Gate D under `TRANCHE-010`
- the queue promotes `TRANCHE-011` from `queued` to `active`

## Purpose

Define the governed benchmark-proof program that turns the current benchmark
scaffolding into repeatable comparative evidence for the deep
`HARNESS-VHS-002` / `resource/plugins/lv_icon.vi` target.

This program separates benchmark truth from public-release acceptance truth so
the remaining Sergio-owned host-machine UX gate can close without silently
owning all later benchmark work.

## North Star

One governed comparative benchmark packet proves the same deep-history target
across three explicit proof surfaces:

- the canonical Windows host baseline
- the repeatable Windows benchmark image baseline
- the Linux benchmark image lane

The result must retain explicit comparability status instead of mixing partial
timings, human UX truth, and characterization-only runs into one blurred
control-plane claim.

## Authority And Trust Boundary

### Product And Queue Truth

- private GitLab source repo and control plane
- `docs/product/development-queue.json`
- [PROGRAM-0003](./PROGRAM-0003-repeatable-benchmark-proof.md)
- [ISSUE-0408](../issues/ISSUE-0408-repeatable-benchmark-proof.md)

### Benchmark Truth

- canonical Windows host baseline for the deep target
- published Windows benchmark image for repeatable Windows proof
- Linux benchmark image and retained diagnostics for comparative proof

### Explicit Boundaries

- benchmark truth does not close the public-release human UX gate
- the private GitHub experiment mirror remains benchmark evidence only
- the public GitHub facade repo remains public release/setup/support only
- hosted Windows benchmark execution remains not-yet-governed until local host
  proof exists

## Workstreams

1. retain the late Linux `135/138` blocker truth and promote the accepted
   cross-OS comparable prefix
2. prove the published Windows benchmark image locally on the canonical host
3. produce the governed comparative benchmark packet and normalize it into the
   control plane

The repo-side proof entrypoint for workstream 2 is
`scripts/runHostWindowsBenchmarkImageProof.js`. Until the full Linux deep
window becomes comparable, that runner defaults the Windows image proof to the
retained `HARNESS-VHS-002` comparable-prefix packet rather than silently
claiming the blocked full window, and it pre-seeds the mounted harness cache
from the governed local `ni-labview-icon-editor` clone when that clone is
available on the canonical host while normalizing Git safe-directory handling
for those mounted clones before the image entrypoint runs. The active
Windows-image hardening also restores the governed Windows `-LabVIEWPath`,
forces `LV_RTE_HEADLESS=1`, hardens `LabVIEWCLI.ini` startup timeouts, and
prelaunches headless LabVIEW before benchmark execution so the published image
tracks NI's documented Windows-container startup posture instead of a bare
first-launch `LabVIEWCLI` invocation. The latest retained local proof now
reaches pair `129/134` before retaining a connected-session `Error 66 / Call
By Reference` seam, and the runtime now attempts one governed
`LabVIEWCLI CloseLabVIEW -Headless` session reset plus one retry for that
seam before terminal failure is retained. The bounded comparable-prefix packet
and Windows benchmark summary now retain that seam explicitly as
`labview-cli-call-by-reference`, and the older retained canonical-host
Windows-container proof for pair `129` shows the same connected-session
diagnosis. The governed canonical-host proof runner now also accepts a
targeted `--engine <labview-cli|lvcompare>` override for diagnosis reruns
while preserving the comparable-prefix default and the same proof-root
receipt contract, and shared dashboard-smoke progress now labels Windows
reruns as Windows rather than Linux. A fresh governed `lvcompare` rerun on
the published Windows image times out immediately at pair `1/129`, so
`lvcompare` is not currently a viable Windows workaround for the pair-129
`labview-cli-call-by-reference` seam. The governed harness report-smoke
surface now also accepts an exact selected/base hash pair plus explicit
runtime timeout, and the targeted exact-pair `lvcompare` rerun on
`6dd65df -> 3408654` likewise times out after `120000ms`, which strengthens
the conclusion that Windows pair `129` is not recoverable through a simple
engine swap.

Current retained Linux blocker before activation:

- pair `135/138` is reproducibly failing under the Linux image lane
- fresh Linux container repros now show the same pair does not complete under
  either `LabVIEWCLI` or `LVCompare`
- the retained Linux temp-surface evidence now classifies the blocker as
  `linux-headless-recursive-load`
- the runtime now attempts one governed `LabVIEWCLI CloseLabVIEW -Headless`
  session reset plus one retry after that recursive-load diagnosis, but the
  latest retained full-window benchmark result still predates that recovery
  posture
- older retry experiments after timeout degraded into `-350000` connection
  failure rather than recovering the session
- a governed comparable-prefix packet now retains the accepted cross-OS
  `129`-commit / `128`-pair scope in
  `docs/product/benchmark-packets/HARNESS-VHS-002-comparable-prefix.json`

## Queue Mapping

- `TRANCHE-011`
  - `ISSUE-0408`

## Exit Gates

### Gate A: Linux Deep Benchmark Completion

- either:
  - the deep Linux `HARNESS-VHS-002` benchmark completes `138/138`
  - or the retained comparable-prefix packet remains the accepted cross-OS
    benchmark scope with an explicit full-window blocker rationale
- Linux retains terminal summary, pair receipts, and native diagnostics
- Linux retains supplemental headless artifacts and terminal diagnostic
  reasons when a pair fails or times out
- the accepted comparable scope is explicit:
  - full window when Linux completes
  - bounded prefix when the retained NI Linux blocker remains open

### Gate B: Windows Benchmark-Image Proof

- the published Windows benchmark image is pullable by contract
- the image runs locally on the canonical Windows host with Windows containers
- the host proof is launched through the governed runner at
  `scripts/runHostWindowsBenchmarkImageProof.js`, which retains launch/log
  receipts and the mounted benchmark summary under the canonical AppData proof
  root
- one retained deep `HARNESS-VHS-002` summary exists from the image lane

### Gate C: Comparative Benchmark Packet

- one governed comparison exists across:
  - Windows host baseline
  - Windows benchmark-image baseline
  - Linux benchmark-image result
- the packet states whether the three surfaces are comparable, partially
  comparable, or characterization-only

### Gate D: Control-Plane Normalization

- `current-state`, `README`, `harnesses`, queue docs, requirements, RTM, and
  test plan reflect the accepted benchmark truth
- future sessions can discover the benchmark result without chat history

## Delivery Rules

Every slice in this program must move together:

- retained benchmark evidence
- benchmark control-plane docs
- requirements and traceability when benchmark behavior changes
- image/workflow contracts
- result-consumer tooling
- design-gate evidence

No timing claim is allowed to outrun its retained evidence.

## First Implementation Slice

Start with [ISSUE-0408 Repeatable Benchmark Proof](../issues/ISSUE-0408-repeatable-benchmark-proof.md).

That slice should:

- finish the late Linux failure diagnosis with retained evidence
- retain and normalize the bounded `129`-commit / `128`-pair comparable prefix
- prove the published Windows benchmark image locally
- stop short of claiming final comparability until both image lanes retain
  truthful terminal summaries

## Success Condition

This program is complete when `vi-history-suite` can point to one governed
comparative benchmark packet for the accepted `lv_icon.vi` timing scope, with
retained evidence from the Windows host, Windows benchmark image, and Linux
benchmark image, and with the comparability outcome normalized into the repo
control plane.
