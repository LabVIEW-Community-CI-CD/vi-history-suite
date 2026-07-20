# ADR-0021: Governance Gate-Tooling Integrity

- Status: Accepted
- Date: 2026-07-20

> This ADR records the retained design for the governance gate-tooling integrity
> gate under system requirement VHS-SYS-REQ-013 (CI And Developer Environment).
> It is the first theme of the dev-only-mapping sweep (epic #2159) under the
> Agent Operating Control-Plane program (#2144). The requirements package holds
> the authoritative text; this is the design record.

## Context

The repository's governance and CI posture is enforced by a set of gate scripts
— the ADR index check, agent-delegation drift check, branch-protection audit,
dev-dependency preflight, and documentation workbench check. Each is invoked
through a committed npm alias, and several are wired into git hooks or CI steps.

Before this requirement these scripts were unmapped `dev-only` traceability
surface. Nothing prevented one from being deleted, renamed, or silently unwired
from its npm alias: the alias could be repointed at a different script, or the
script removed, and no gate would notice until the governance check it enforces
quietly stopped running. The gate tools that protect the repo were themselves
unprotected.

## Decision

Declare the governance gate tools as a **manifest** and ship a gate
(`scripts/checkGovernanceGates.js`, `npm run governance:gates`) that **fails
closed** on any integrity problem.

- The manifest (`GOVERNANCE_GATES`) declares each gate by `id`, repo-relative
  `script` path, and committed npm `alias`.
- The evaluation (`evaluateGovernanceGates`) is pure and injectable — it takes
  the package scripts and a file-existence probe — so it is unit-tested with a
  synthetic manifest and no real filesystem.
- It reports a problem, and the gate fails, when a declared gate script is
  missing on disk, its npm alias is absent, the alias no longer invokes the
  declared script, or a manifest entry is malformed or duplicated.
- The shipped manifest is verified to pass against the real repository.

This also reclassifies the five declared gate scripts from `dev-only` to
requirement-mapped (VHS-REQ-681) in the traceability inventory and RTM, so they
are covered by the coverage-risk and traceability gates like any mapped surface.

## Consequences

- The governance gate tools can no longer be silently deleted, renamed, or
  unwired from their npm alias without failing `governance:gates`.
- The gate is pure/injectable, so its own logic is deterministically tested
  without touching the real filesystem.
- Adding a new governance gate script now carries an explicit obligation: add it
  to the manifest, or it is not protected. This is stated in the requirement's
  Agent Work Scope.
- The five gate scripts are now mapped; each already exceeds the coverage-risk
  threshold, so the reclassification does not weaken any gate.

## Requirements recorded

VHS-SYS-REQ-013; VHS-REQ-681, VHS-REQ-700, VHS-REQ-701.
