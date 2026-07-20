# ADR-0018: Agent Operating Control-Plane And Repo-Truth Read-Model

- Status: Accepted
- Date: 2026-07-20

> This ADR records the retained design for the agent operating control-plane and
> its first read surface under system requirement VHS-SYS-REQ-013 (CI And
> Developer Environment). The requirements package holds the authoritative text;
> this is the design record.

## Context

An autonomous agent operating in this repository was driving decisions from
prose (AGENTS.md, contributing docs) that drifts from live repository state — for
example acting on a documented merge-queue cadence that no longer matched the
branch ruleset. Documentation is a lagging, unverifiable description of truth;
the repository already emits fail-closed, schema-versioned ground-truth through
gates and read-model scripts (branch-protection audit, coverage map, requirement
health). The gap is that an agent had no single live surface to read that truth
from.

## Decision

Establish an **agent operating control-plane**: expose live repository
ground-truth to agents through **read-only, schema-versioned read-models**, grown
read-first behind a stable schema, with any acting (write) surface kept governed
and default-disabled under a separate requirement.

The first surface is a **repo-truth read-model** (`scripts/readRepoTruth.js`)
that aggregates governance domains into one self-describing
`vi-history-suite/repo-truth-read-model@v1` packet (slice 1: merge-queue policy,
coverage, requirement health). It reuses the shared schema-envelope and
output-contract libraries, reads live GitHub plus existing read-model scripts,
mutates nothing, and gates nothing.

The read surface **fails closed on GitHub authorization**: a missing or
unauthenticated `gh` exits nonzero with an actionable message and emits no
packet, rather than degrading to documented defaults — because a control-plane
that silently substitutes assumptions for truth is worse than one that stops.
Local sibling read-models (coverage, requirement health) degrade to
`available: false` rather than fail the whole read closed, since only the live
GitHub precondition is load-bearing.

## Consequences

- An agent reads current repository truth (e.g. the live merge-queue policy)
  instead of trusting potentially stale prose, closing the drift gap.
- The fail-closed-on-auth posture guarantees the read-model never presents
  assumed defaults as fact; it requires a live-GitHub-capable token to operate.
- The control-plane grows additively: new ground-truth domains and read surfaces
  attach behind the stable schema; any write action is deferred to the governed,
  default-disabled write-path requirement.

## Requirements recorded

VHS-SYS-REQ-013; VHS-REQ-691; VHS-REQ-692; VHS-REQ-693.
