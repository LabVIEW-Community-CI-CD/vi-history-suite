# Research Infrastructure

## Purpose

This document defines how authoritative research becomes governed product work
inside `vi-history-suite`.

It is intentionally forward-looking. It exists so future maintainers and future
LLMs can convert new research into implementation without rediscovering the repo
control plane from chat history.

## Authority Order

Use these surfaces in order:

1. [deep-research-report.cleaned.md](./deep-research-report.cleaned.md)
2. [deep-research-report.md](./deep-research-report.md)
3. [next-round-research.md](./next-round-research.md)
4. [vi-history-suite-authoritative-research.pdf](./vi-history-suite-authoritative-research.pdf)

Status and implementation mapping live here:

- [research-implementation-index.json](./research-implementation-index.json)
- [research-alignment.md](./research-alignment.md)

## Intake Flow

Every new authoritative research round should update these surfaces together:

1. authoritative artifact set under `docs/research/authoritative/`
2. [research-implementation-index.json](./research-implementation-index.json)
3. [research-alignment.md](./research-alignment.md)
4. [docs/product/development-queue.json](../../product/development-queue.json)
5. affected epics under `docs/product/epics/`
6. affected ADRs under `docs/architecture/adr/`
7. [docs/requirements/srs.md](../../requirements/srs.md),
   [docs/requirements/rtm.csv](../../requirements/rtm.csv), and
   [docs/testing/test-plan.md](../../testing/test-plan.md) when behavior becomes
   governed work

## Program Layers

| Layer | Purpose | Primary Artifact |
| --- | --- | --- |
| Research authority | what the repo should do | `deep-research-report.cleaned.md`; `next-round-research.md` |
| Implementation status | what is already live | `research-implementation-index.json`; `research-alignment.md` |
| Product queue | what gets built next | `docs/product/development-queue.json` |
| Product shaping | why a capability exists | `docs/product/epics/` |
| Architecture shaping | how a capability should exist | `docs/architecture/adr/` |
| Governed implementation | what is testable and releasable | `docs/requirements/srs.md`; `docs/requirements/rtm.csv`; `docs/testing/test-plan.md` |

## Dashboard Direction

The next major product leap is a first-class developer dashboard that
concentrates multiple VI Comparison Reports into one review surface for a
single VI.

The minimum governed review scenario is:

- one selected VI
- at least three commits in scope
- at least two retained comparison pairs across that commit window
- a human reviewer making a bounded decision about the VI based on those facts

The dashboard should therefore evolve around:

- commit-window selection, not only one selected/base pair
- aggregation of multiple retained pairwise comparison reports
- chronology-aware navigation across at least three commits
- concentration of retained report artifacts, runtime status, and missing-report
  reasons into one review surface
- concentration-first review for large open-source change sets so the dashboard
  reduces wear from linear report-by-report inspection
- factual confidence and scope boundaries for human reviewers
- explicit review scenarios and human decision records, not only raw report
  storage

## Decision-Support Layer

The dashboard program should be modeled as a decision-support system with:

- a scenario registry for bounded review situations
- a dashboard packet for one VI across a commit window
- a human decision record template

Primary artifacts:

- [review-scenarios.md](../../product/review-scenarios.md)
- [decision-record-template.md](../../product/decision-record-template.md)

## Future Research Questions

The dashboard direction should drive future research rounds on:

- which commit-window shapes are most meaningful for real VI review
- how to summarize multiple pairwise comparison reports without inventing
  semantics
- how to concentrate high-volume report sets into review priorities without
  hiding the raw artifacts
- how to preserve raw report evidence while adding higher-level review cues
- how Windows x64 isolated execution and host-native x32 execution contribute
  reports into one governed dashboard
- how human review outcomes should be retained without claiming automated
  semantic correctness

## Update Rule

When dashboard research lands, update these together:

- this document
- [research-implementation-index.json](./research-implementation-index.json)
- [research-alignment.md](./research-alignment.md)
- [EPIC-0004-multi-report-developer-dashboard.md](../../product/epics/EPIC-0004-multi-report-developer-dashboard.md)
- [ADR-0007-multi-report-review-dashboard.md](../../architecture/adr/ADR-0007-multi-report-review-dashboard.md)
- [review-scenarios.md](../../product/review-scenarios.md)
