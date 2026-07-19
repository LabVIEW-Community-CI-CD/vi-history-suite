# ADR-0012: Lightweight Public Verification And Definition Of Done

- Status: Accepted
- Date: 2026-07-19

> This ADR records the retained design for public verification and the
> definition-of-done operating model under system requirement VHS-SYS-REQ-012
> (Lightweight Public Verification). The requirements package holds the
> authoritative text; this is the design record.

## Context

As a public extension, verification must be trustworthy but lightweight: hosted
CI should stay fast and hypervisor-free, dependencies should be maintained
automatically, and "done" must mean a consistent, checkable set of gates rather
than ad-hoc judgement.

## Decision

Keep verification **lightweight, automated, and contract-driven**:

- Hosted CI is lightweight and needs no hypervisor; dependency maintenance is
  automated (Dependabot targeting the integration branch).
- A definition-of-done operating requirement defines the gate set (checks,
  tests, traceability, docs links, customization audit, coverage mapping, and
  requirement health) so closeout is objective and repeatable.

## Consequences

- CI stays fast and reproducible on hosted runners.
- Contributors and agents share one objective definition of done, which the
  local `quality:local` script and PR gates enforce.

## Requirements recorded

VHS-SYS-REQ-012; VHS-REQ-597, VHS-REQ-602, VHS-REQ-615.
