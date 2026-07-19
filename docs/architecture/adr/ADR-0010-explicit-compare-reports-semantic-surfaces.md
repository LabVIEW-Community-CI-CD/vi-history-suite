# ADR-0010: Explicit Compare Action, Reports, And Semantic Surfaces

- Status: Accepted
- Date: 2026-07-19

> This ADR records the retained design for the explicit compare action and its
> report and semantic surfaces under system requirement VHS-SYS-REQ-008
> (Explicit Compare Action). The requirements package holds the authoritative
> text; this is the design record.

## Context

Comparing two VI revisions is a deliberate, user-initiated action, not a
background scan. The comparison must resolve revision blobs safely, stage the
correct trees, produce a self-contained shareable report, and expose the result
through additional surfaces (a dashboard, a Source Control hover, a preview, and
an agent-facing semantic model) without changing the explicit-action contract.

## Decision

Keep comparison an **explicit action with a self-contained, factual output** and
layered read surfaces:

- Resolve revision blob specifiers with VI verification, support an explicit
  compare-pair workflow, and stage the newest-revision tree for comparison with
  library-member compared-VI disclosure.
- Produce a self-contained single-file HTML report (with commit body,
  configurable flags, and export for external viewing), a VI History re-entry
  action from the report, working-tree (uncommitted) comparison against a prior
  revision, and dashboard aggregate review.
- Expose derived read surfaces: single-VI interactive preview rendering, a
  Source Control semantic change hover, the VI semantic comparison model plus
  agent MCP surface, and preview/comparison cache warming on VI change.

## Consequences

- Reports are portable and factual, and every derived surface reuses the same
  comparison result rather than re-deriving it.
- The explicit-action boundary is preserved even as preview, hover, dashboard,
  and agent surfaces are added.

## Requirements recorded

VHS-SYS-REQ-008; VHS-REQ-127, VHS-REQ-128, VHS-REQ-133, VHS-REQ-610,
VHS-REQ-624, VHS-REQ-625, VHS-REQ-626, VHS-REQ-638, VHS-REQ-640, VHS-REQ-641,
VHS-REQ-644, VHS-REQ-645, VHS-REQ-659, VHS-REQ-660, VHS-REQ-662, VHS-REQ-664.
