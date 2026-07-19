# ADR-0015: Release State Read-Model And Gated Publish Authority

- Status: Accepted
- Date: 2026-07-19

> This ADR records the retained design for the release-state read-model under
> system requirement VHS-SYS-REQ-016 (Governed Release Branch Promotion),
> complementing ADR-0001's governance decision. The requirements package holds
> the authoritative text; this is the design record.

## Context

Driving a Marketplace release idempotently and resumably requires knowing where
a version is in its release progression and whether the gated publish authority
is complete, derived from ground truth rather than guessed. ADR-0001 established
GitHub-first governed promotion; this records the read-model that makes a
release drivable and fail-closed.

## Decision

Provide a **read-only, ground-truth release-state read-model with a gated
publish-authority posture**: a schema-versioned packet reports each durable
release stage and a single-principal authority posture, and the release-
readiness verdict fails closed on definitively incomplete authority in a release
context while degrading to a pass when authority cannot be verified.

## Consequences

- A release can be driven idempotently and resumably from ground truth.
- Publication fails closed when authority is provably incomplete, without
  false-blocking advisory reads.

## Requirements recorded

VHS-SYS-REQ-016; VHS-REQ-670.
