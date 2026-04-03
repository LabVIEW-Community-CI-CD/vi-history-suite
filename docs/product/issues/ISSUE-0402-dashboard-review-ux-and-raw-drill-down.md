# ISSUE-0402: Dashboard Review UX And Raw Drill-Down

## Goal

Turn the concentrated dashboard into the main expert-review surface instead of
just a packet renderer.

## Scope

- chronology-first dashboard HTML
- factual concentration cues
- clear pair provenance presentation
- raw drill-down actions for:
  - packet HTML
  - NI report HTML
  - metadata JSON
  - source-record JSON
- explicit missing-report and missing-asset visibility
- reviewer wording for scope, limits, and escalation

## Non-Goals

- progress/cancellation
- provider doctor
- review-scenario registry

## Dependencies

- `ISSUE-0401`

## Acceptance Criteria

- dashboard HTML surfaces chronology and pair ordering clearly
- provider provenance and concentration cues are visible without opening raw
  artifacts
- raw drill-down actions are present for all available artifacts
- missing artifacts are stated explicitly
- dashboard wording remains factual and does not imply semantic certainty

## Required Evidence

- unit tests for dashboard HTML rendering and artifact actions
- extension-host proof for dashboard-open and artifact-open paths
- design-gate pass

## First Slice

- improve dashboard HTML sections and cue layout
- prove drill-down actions and missing-artifact states
