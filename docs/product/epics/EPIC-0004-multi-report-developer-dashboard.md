# EPIC-0004: Multi-Report Developer Dashboard

## Outcome

Deliver a first-class developer dashboard inside `vi-history-suite` that
concentrates multiple VI Comparison Reports into one review surface for a
single VI with at least three commits in scope.

The dashboard should reduce the wear and tear of opening individual reports one
by one when a VI has many modifications in an open-source repository.

## Problem

The current product can review commit history and retain pairwise comparison
report evidence, but a human reviewer still has to reason across multiple
separate reports manually. That becomes weak once a VI has several meaningful
changes across a commit window.

That manual per-report workflow becomes actively expensive when a reviewer is
facing a massive amount of changes to one VI and needs to decide where to focus
attention first.

The product needs a dashboard that helps a human reviewer answer a bounded
decision question about one VI after multiple modifications, without hiding the
raw report evidence.

## Scope

- select a commit window covering at least three commits for one VI
- retain multiple selected/base comparison pairs for that window
- aggregate multiple retained comparison-report packets into one review surface
- concentrate large review sets into a smaller set of chronology-aware cues
- show chronology and pair provenance clearly
- surface missing, blocked, or failed report facts next to successful ones
- keep raw packet and raw report navigation available
- preserve factual confidence and limitation language
- support a bounded human decision record for the selected VI review scenario

## Non-Goals

- automatic semantic interpretation of LabVIEW visual changes
- replacing human judgment with automated acceptance
- collapsing multiple comparison reports into a lossy single synthesized claim

## Primary Review Scenario

1. A developer opens `VI History` on one eligible VI.
2. The selected VI has at least three commits in the retained window.
3. The extension concentrates the relevant pairwise comparison reports for that
   window into one dashboard.
4. The human reviewer can inspect chronology, pair provenance, report status,
   and raw artifacts from one place.
5. The reviewer makes a bounded decision with better evidence than a single
   report or a plain commit list would provide.
6. The reviewer does not need to open every individual report just to discover
   where the most important changes are concentrated.

## Child Slices

1. Commit-window model and retained dashboard packet
2. Multi-report storage/index contract
3. Concentration-first dashboard HTML surface inside the extension
4. Developer-facing confidence, limitation, and escalation guidance
5. Review scenario registry and human decision record template
6. Harness proof for a VI with at least three commits and at least two report
   pairs
7. Windows x64 isolated-provider contribution into the same dashboard

## Exit Criteria

- one VI with at least three commits can produce a retained multi-report
  dashboard packet
- the dashboard shows multiple retained pairwise reports with explicit commit
  provenance
- missing or blocked reports are surfaced factually, not hidden
- the human reviewer can navigate from the dashboard to the underlying raw
  packet/report artifacts
- the dashboard improves human decision making without overclaiming what the
  product knows
- the review scenario and human decision outcome can be retained separately from
  the dashboard packet itself
- the dashboard reduces the default need for linear inspection of every
  individual pairwise report
