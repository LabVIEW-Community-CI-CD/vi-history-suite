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

1. close the late Linux `135/138` failure and complete the deep Linux run
2. prove the published Windows benchmark image locally on the canonical host
3. produce the governed comparative benchmark packet and normalize it into the
   control plane

## Queue Mapping

- `TRANCHE-011`
  - `ISSUE-0408`

## Exit Gates

### Gate A: Linux Deep Benchmark Completion

- the deep Linux `HARNESS-VHS-002` benchmark completes `138/138`
- Linux retains terminal summary, pair receipts, and native diagnostics
- Linux is either promoted to comparable benchmark truth or explicitly retained
  as a bounded exception with a standards-grade rationale

### Gate B: Windows Benchmark-Image Proof

- the published Windows benchmark image is pullable by contract
- the image runs locally on the canonical Windows host with Windows containers
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
- prove the published Windows benchmark image locally
- stop short of claiming final comparability until both image lanes retain
  truthful terminal summaries

## Success Condition

This program is complete when `vi-history-suite` can point to one governed
comparative benchmark packet for the deep `lv_icon.vi` target, with retained
evidence from the Windows host, Windows benchmark image, and Linux benchmark
image, and with the comparability outcome normalized into the repo control
plane.
