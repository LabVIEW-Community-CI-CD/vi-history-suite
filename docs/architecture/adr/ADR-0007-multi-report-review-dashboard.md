# ADR-0007: Multi-Report Review Dashboard

## Status

Accepted

## Context

`vi-history-suite` already has:

- a history review surface
- governed pairwise comparison-report planning and storage
- a live runtime-proof lane for pairwise report generation

That is necessary but not sufficient for the broader developer-review goal.
Real VI review often spans multiple modifications across a commit window, not
just one selected/base pair. A human reviewer needs a concentrated review
surface that keeps multiple pairwise comparison reports in one place while
preserving chronology and raw evidence.

## Decision

The product will evolve toward a first-class multi-report developer dashboard as
the primary review surface for deeper VI decision making.

The dashboard will:

- be centered on one VI and a commit window, not just one pair
- require at least three commits in scope for the full dashboard path
- aggregate multiple retained pairwise comparison-report packets
- remain separate from the human decision record so the raw dashboard evidence
  and the reviewer outcome are not conflated
- remain separate from the deterministic host-machine human-review submission so
  concentrated dashboard evidence, reviewer submission, and downstream
  acceptance records are not conflated
- preserve explicit selected/base provenance for every report
- surface missing, blocked, or failed report facts alongside successful reports
- keep raw packet and raw HTML report navigation available

## Consequences

Positive:

- the product becomes more useful for real human review decisions
- pairwise report generation remains reusable instead of being replaced
- chronology becomes a first-class concern rather than an implied one
- the dashboard can evolve into a concentration-first review surface for
  high-volume open-source VI review
- the product can retain one stable latest-dashboard manifest and one stable
  latest-human-review manifest without mutating concentrated evidence packets

Tradeoffs:

- the report subsystem must evolve from one packet to a commit-window packet
- product docs must define review scenarios and a decision-record model in
  addition to dashboard rendering
- UI complexity increases because raw evidence and concentrated review cues must
  coexist
- harness proof must cover multi-commit scenarios, not only one pair
- future dashboard work must preserve drill-down to raw reports even when the
  primary surface becomes less linear
- the canonical host-machine closeout path now needs its own governed
  retention contract instead of ad hoc notes or shell transcripts
- the maintainer-only host-review submission surface must stay hidden off the
  canonical Sergio-owned Windows 11 host and must confirm success or blockage
  explicitly inside the panel so the human gate is trustworthy

## Follow-On Work

- [EPIC-0004-multi-report-developer-dashboard.md](../../product/epics/EPIC-0004-multi-report-developer-dashboard.md)
- update the development queue with a dedicated dashboard tranche
- define the retained dashboard packet and storage contract
- add harness proof for at least one VI with three or more commits and multiple
  pairwise reports
