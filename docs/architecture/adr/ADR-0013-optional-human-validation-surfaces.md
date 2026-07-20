# ADR-0013: Optional Human Validation And Maintainer Surfaces

- Status: Accepted
- Date: 2026-07-19

> This ADR records the retained design for optional human validation and
> maintainer surfaces under system requirement VHS-SYS-REQ-013 (Optional Human
> Validation Surfaces). The requirements package holds the authoritative text;
> this is the design record.

## Context

The product is local-first and safety-gated, but some capabilities are optional,
human-driven, or maintainer-only: workspace trust boundaries, source evaluation
in a devcontainer, trusted Windows/Linux LabVIEW maintainer workflows, an
optional Vagrant helper, diagnostic VSIX distribution, an on-demand semantic PR
review, and the release supply-chain surfaces (dev-tools release channel,
supply-chain state, and the mandatory Vagrant release attestation).

## Decision

Keep these surfaces **optional, trust-gated, and fail-closed**:

- Workspace trust is the safety boundary: full capability only in trusted
  workspaces, limited capability when untrusted; devcontainer source evaluation
  is supported.
- Maintainer surfaces (trusted Windows/LabVIEW and Linux/LabVIEW workflows, the
  optional Vagrant helper, diagnostic test VSIX distribution, and the on-demand
  VI semantic PR review) are opt-in and clearly separated from the everyday user
  path.
- Release supply-chain surfaces are gated: the versioned dev-tools GitHub
  release channel, the supply-chain state read-model, and the mandatory local
  Vagrant release attestation guard publication.

## Consequences

- Everyday users are never required to touch maintainer or validation surfaces.
- Release publication is guarded by explicit, evidenced, fail-closed gates (see
  ADR-0006 for the dev-tools versioning decisions that build on this).

## Requirements recorded

VHS-SYS-REQ-013; VHS-REQ-012, VHS-REQ-084, VHS-REQ-596, VHS-REQ-598,
VHS-REQ-599, VHS-REQ-608, VHS-REQ-652, VHS-REQ-661, VHS-REQ-666, VHS-REQ-667,
VHS-REQ-668, VHS-REQ-686, VHS-REQ-687.
