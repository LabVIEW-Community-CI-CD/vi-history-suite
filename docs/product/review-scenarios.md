# Review Scenarios

## Purpose

This document defines the forward-looking review scenarios that the
multi-report developer dashboard is meant to support.

The dashboard is not just a UI feature. It is a decision-support surface for a
human reviewer evaluating one VI across multiple modifications.

## Scenario Maturity

Use these maturity levels:

- `draft`: modeled but not yet exercised by a governed harness or packet
- `active`: queued or partially implemented with a named harness and packet
- `certified`: supported by governed evidence and ready for routine human use

## SCENARIO-VHS-001: Canonical Multi-Report VI Review

- Maturity: `active`
- Harness: `HARNESS-VHS-001`
- Repository: `ni/labview-icon-editor`
- VI target: `Tooling/deployment/VIP_Pre-Install Custom Action.vi`
- Commit-window minimum: `3`
- Comparison-pair minimum: `2`

### Decision Goal

Help a human reviewer make a bounded decision about one VI after multiple
modifications, using concentrated comparison-report evidence rather than a
single pairwise report or a raw commit list.

### Required Inputs

- one eligible VI
- at least three commits in scope
- at least two selected/base report pairs in that window
- retained raw pairwise report artifacts or explicit missing-report facts

### Required Outputs

- one dashboard packet for the selected commit window
- explicit chronology across the retained commits
- explicit pair provenance for every concentrated comparison report
- direct links to underlying packet/report artifacts
- explicit missing, blocked, or failed report facts

### Human Decision Boundary

The dashboard may improve human review decisions, but it shall not claim that
it can decide correctness of a VI automatically.

The human reviewer remains responsible for:

- final judgment
- interpreting binary or visual evidence
- deciding whether additional manual inspection is needed

## Expected Future Scenarios

- `SCENARIO-VHS-002`: high-volume open-source VI review where one VI has many
  retained modifications and the dashboard must reduce the need to inspect each
  pairwise report linearly
- rename-heavy VI history where pair provenance matters more than filename
- noisy or partially missing report windows where absence facts must remain
  reviewable
- mixed-provider windows where x32 host-native and x64 isolated-container
  reports contribute to one dashboard

## SCENARIO-VHS-002: High-Volume Open-Source VI Review

- Maturity: `draft`
- Commit-window shape: larger than the minimum three-commit window
- Primary concern: reviewer wear from too many individual pairwise reports

### Decision Goal

Help a human reviewer triage a large set of changes on one VI without opening
every underlying comparison report by default.

### Expected Dashboard Behavior

- concentrate multiple pairwise report facts into a smaller set of review cues
- surface the highest-priority commit transitions first
- preserve drill-down to raw packets and raw reports for verification
- keep missing-report and failed-report facts visible so the reviewer does not
  mistake absence for lack of change
