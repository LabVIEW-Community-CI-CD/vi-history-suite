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

## Remaining Focus

- bounded progress for dashboard and report refresh
- cancellation with partial-evidence retention
- trust-aware refresh and execution UX
