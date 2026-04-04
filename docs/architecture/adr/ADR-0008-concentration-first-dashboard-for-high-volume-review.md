# ADR-0008: Concentration-First Dashboard For High-Volume Review

## Status

Accepted

## Context

Users of `vi-history-suite` are expected to review open-source repositories
where one VI may accumulate many modifications across a meaningful commit
window. Reviewing individual VI Comparison Reports one by one creates wear and
tear for human reviewers and does not scale well as the number of comparisons
grows.

The developer dashboard therefore needs a stronger purpose than “show multiple
reports”. Its job is to concentrate a large set of pairwise comparison facts
into one review surface that helps a human decide where to drill down.

## Decision

The multi-report developer dashboard will be concentration-first rather than a
gallery of individual reports.

That means the dashboard should:

- reduce the need to open every individual VI Comparison Report
- surface chronology-aware hotspots, missing-report gaps, and review priorities
- preserve drill-down to raw pairwise packet/report artifacts for verification
- keep all higher-level cues factual and traceable back to retained evidence
- hand off the final maintainer judgment to a separate deterministic host-review
  submission surface on the canonical Windows 11 machine instead of embedding
  free-form human outcome text inside the concentrated dashboard packet

## Consequences

Positive:

- the dashboard becomes useful for large open-source review workloads
- human reviewers can focus on the most decision-relevant changes first
- raw pairwise reports remain available without becoming the default linear
  workflow
- the canonical host machine can retain an immutable human-review trail that
  references the dashboard without mutating the dashboard packet itself

Tradeoffs:

- the product must distinguish concentrated cues from raw evidence clearly
- dashboard packet design becomes more important than individual report storage
- review scenarios must cover high-volume commit windows, not only minimal
  three-commit cases
- the canonical host-machine proof lane now needs explicit fingerprint and
  latest-review retention rules so human closeout stays deterministic

## Follow-On Work

- refine [EPIC-0004-multi-report-developer-dashboard.md](../../product/epics/EPIC-0004-multi-report-developer-dashboard.md)
- expand [review-scenarios.md](../../product/review-scenarios.md) with
  high-volume open-source review scenarios
- keep raw artifact drill-down explicit in future dashboard packet design
