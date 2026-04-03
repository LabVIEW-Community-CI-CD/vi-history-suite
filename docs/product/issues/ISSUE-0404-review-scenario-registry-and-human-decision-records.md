# ISSUE-0404: Review Scenario Registry And Human Decision Records

## Goal

Model the dashboard as a decision-support system with explicit review scenarios
and separate retained human decisions.

## Scope

- review-scenario registry
- canonical active scenario for `HARNESS-VHS-001`
- commit-window contracts per scenario
- separate human decision record artifact
- explicit decision boundaries between machine evidence and human judgment

## Non-Goals

- automatic approval logic
- semantic interpretation of VI changes

## Dependencies

- `ISSUE-0401`
- `ISSUE-0402`

## Acceptance Criteria

- at least one scenario is active and linked to canonical harness evidence
- one human decision record can be created without modifying the dashboard
  packet itself
- scenario contracts define minimum commits and comparison pairs
- docs and retained artifacts clearly distinguish evidence from decision

## Required Evidence

- doc review for scenario registry and decision-record template
- unit or schema validation for decision-record generation if code is added
- design-gate pass

## First Slice

- activate `SCENARIO-VHS-001` with explicit evidence expectations
- normalize the decision-record template into a governed scenario flow

## Implemented So Far

- governed review-scenario registry with active `SCENARIO-VHS-001`
- scenario-contract validation for harness, repository, VI path, minimum
  commit window, and minimum comparison-pair count
- separate decision-record artifact persistence under workspace-scoped
  `decision-records/...` storage
- canonical harness decision-record command that reuses dashboard smoke
  evidence and explicit human reviewer inputs

## Remaining Focus

- extension-facing decision-record creation UX on top of the retained
  scenario/decision-record artifact flow
- additional scenario activation beyond the canonical baseline
