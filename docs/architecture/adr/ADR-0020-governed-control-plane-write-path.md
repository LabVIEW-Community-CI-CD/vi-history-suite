# ADR-0020: Governed Control-Plane Write Path

- Status: Accepted
- Date: 2026-07-20

> This ADR records the retained design for the governed control-plane write path
> under system requirement VHS-SYS-REQ-013 (CI And Developer Environment). The
> requirements package holds the authoritative text; this is the design record.

## Context

The Agent Operating Control-Plane (VHS-REQ-691/692) established a read-only
ground-truth read-model, an MCP server (VHS-REQ-693), and a read-only publishing
workflow (VHS-REQ-694). None of these can change the repository or its GitHub
surfaces. The control-plane needs exactly one place where the agent may *act* —
and because acting is the dangerous half, that surface must be governed so it is
impossible to take an action that a human has not explicitly authorized, and so
every action taken is auditable after the fact.

The concrete first use is mirroring already-verified truth onto the GitHub
project board (Status/Evidence transitions) so the human progress interface stays
current without the agent inventing state.

## Decision

Ship the write path **fail-closed and default-disabled**, as the control-plane's
single acting surface (`scripts/controlPlaneWrite.js`).

- **Committed enablement.** A committed `control-plane-write.json` is the only
  thing that can turn the path on (`enabled: true`). Flipping it is a reviewed
  human change. A missing or malformed config **fails closed to disabled** rather
  than defaulting to enabled.
- **Tiered authorization.** `authorizeWrite` refuses every write when the path is
  disabled or the action's tier is not enabled. Tier 1 board-sync (mirroring
  directly-verified read-model truth) requires the enablement flag but no
  per-action approval; every other tier additionally requires a **server-verified**
  approver drawn from the committed allowlist (client-supplied identity is never
  trusted).
- **Verified-only planning.** The Tier 1 planner is pure and proposes only board
  updates it can directly verify — a linked pull request being merged implies the
  item is Done and Proven — and **never infers** state for unverified items.
- **Auditable execution.** The executor applies updates through an injected
  boundary and records each applied write to an append-only log, and does nothing
  when the path is disabled or no executor is provided.

Higher tiers (annotate, merge-queue actions, work creation) are design-only and
remain disabled; they may be added later only behind the same committed
enablement plus server-verified per-action approval.

## Consequences

- The control-plane has exactly one acting surface, and it cannot act unless a
  human has committed the enablement flag — the safe default is inertness.
- Board state mirrors only verified truth, so the live human progress interface
  never reflects agent guesses.
- Every applied write is logged for audit.
- Because enablement is a committed file, turning the path on (or changing its
  security posture) is always a reviewed pull request, not a runtime toggle.

## Requirements recorded

VHS-SYS-REQ-013; VHS-REQ-696.
