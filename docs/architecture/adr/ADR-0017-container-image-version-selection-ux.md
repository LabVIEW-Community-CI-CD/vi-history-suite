# ADR-0017: Container Image Version Selection UX

- Status: Accepted
- Date: 2026-07-19

> This ADR records the retained design for the container image version selection
> experience under system requirement VHS-SYS-REQ-019 (Selectable LabVIEW
> Container Runtime Versions), complementing ADR-0003 and ADR-0004. The
> requirements package holds the authoritative text; this is the design record.

## Context

ADR-0003 and ADR-0004 established selectable, version-aware LabVIEW container
execution. Choosing an image and pulling it needs a usable experience: the pick
should chain naturally after selecting the Docker provider, and a long image
pull should show clear, stable progress rather than appearing to hang.

## Decision

Make container image selection and pull **guided and observable**: chain the
image-version pick after Docker provider selection, and surface live image pull
progress as a stable byte-percentage with explicit pull-phase signaling.

## Consequences

- Selecting Docker leads directly into choosing a runnable image version.
- A large pull reports steady progress and phase, so it is never mistaken for a
  hang.

## Requirements recorded

VHS-SYS-REQ-019; VHS-REQ-651, VHS-REQ-654, VHS-REQ-655, VHS-REQ-656.
