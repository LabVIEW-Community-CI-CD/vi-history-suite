# ADR-0014: Agent-Targetable Requirements Contract

- Status: Accepted
- Date: 2026-07-19

> This ADR records the retained design for agent-targetable requirements under
> system requirement VHS-SYS-REQ-014 (Agent-Targetable Requirements). The
> requirements package holds the authoritative text; this is the design record.

## Context

The repository is developed with AI agents as first-class contributors. For that
to work, requirements must be machine- and agent-actionable: each requirement is
a work contract with a stable ID, RTM row, tests, and traceability, and
field-level intake (for example eligibility reports) must be separable so agents
can reason about inputs precisely.

## Decision

Treat requirements as **agent work contracts**: every requirement carries the
structure agents rely on (ID, parent, statement, acceptance criteria, work
scope, implementation and verification references, change guidance), and field
intake for eligibility reports is separated from presentation so the contract
boundary stays clean.

## Consequences

- Agents can target a requirement ID and find its authoritative contract,
  tests, and traceability without guessing.
- Requirement/RTM/inventory coherence is enforceable (the traceability and
  requirements gates depend on this contract).

## Requirements recorded

VHS-SYS-REQ-014; VHS-REQ-601, VHS-REQ-607.
