# ADR-0016: Coverage-Led Assurance Operating Model

- Status: Accepted
- Date: 2026-07-19

> This ADR records the retained design for the coverage-led assurance operating
> model under system requirement VHS-SYS-REQ-017 (Coverage-Led Assurance
> Operating Model). The requirements package holds the authoritative text; this
> is the design record.

## Context

Test quality must be steered by risk, not vanity coverage, and the test suite
must orchestrate VS Code, CLI, and container behaviors deterministically. The
project needs a way to map coverage to requirement risk and a harness
architecture that keeps tests deterministic and harness-first.

## Decision

Adopt a **coverage-led assurance model with a dedicated harness architecture**:
coverage intelligence maps tests to requirement risk (a mapped file below the
risk threshold fails the coverage gate), and a test harness architecture
orchestrates VS Code and runtime behaviors so unit tests stay deterministic and
injectable.

## Consequences

- Coverage is evaluated against requirement risk, catching under-tested mapped
  surfaces rather than rewarding raw percentages.
- Tests remain deterministic and harness-first, runnable without external
  runtimes.

## Requirements recorded

VHS-SYS-REQ-017; VHS-REQ-613, VHS-REQ-614.
