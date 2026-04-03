# ISSUE-0403: Progress Cancellation And Runtime Doctor UX

## Goal

Make long-running dashboard/report work understandable and interruptible without
requiring raw-log inspection.

## Scope

- bounded progress for indexing and dashboard/report refresh
- cancellation with partial-evidence retention
- runtime doctor surface with:
  - chosen provider
  - chosen engine
  - rejected providers
  - missing tools/config
  - next user action
- trust-aware execution and refresh UX

## Non-Goals

- dashboard decision records
- new harness shapes

## Dependencies

- reliable pairwise runtime execution
- dashboard packet and archive baseline

## Acceptance Criteria

- dashboard/report refresh exposes bounded progress
- cancellation retains partial evidence instead of discarding work silently
- runtime doctor explains why a provider was chosen or rejected
- trust-gated refusal is explicit and actionable
- users can troubleshoot runtime/provider problems without raw logs first

## Required Evidence

- unit tests for progress, cancellation, and runtime-doctor summaries
- extension-host proof for progress and cancellation surfaces
- design-gate pass

## First Slice

- add bounded progress state for dashboard/report refresh
- add the first provider-doctor summary surface using existing runtime facts on
  the retained comparison-report packet and live comparison-report panel

## Implemented So Far

- compact runtime-doctor summary on stored packet and live panel
- structured provider-decision facts for selected and rejected providers
- provider-decision runtime-doctor lines on stored packet and live panel
- trust-aware report and dashboard action refusal with explicit
  `workspace-untrusted` outcomes
- stable warning surfaces when trust is lost after the history panel is already
  open
- bounded progress stages for comparison-report generation and dashboard
  generation
- notification progress wrapping on panel-triggered report and dashboard
  actions
- cancellation with partial-evidence retention for dashboard and comparison
  report actions
- stable informational cancellation surfaces on the history panel command flow
- governed dashboard artifact action validation for malformed messages,
  storage-root targets, and kind/path mismatches
- cancellable eligibility refresh that preserves the previous eligible-path
  snapshot when cancellation is requested mid-refresh
- fail-closed eligibility refresh behavior that clears the eligible-path context
  if workspace trust is lost during an in-flight refresh

## Remaining Focus

- extend the same governed progress/cancellation semantics beyond eligibility
  refresh and current action-level boundaries where additional long-running
  refresh lanes are introduced
