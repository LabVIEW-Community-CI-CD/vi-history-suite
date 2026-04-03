# ISSUE-0405: Dashboard Smoke And Extension-Host Proof

## Goal

Give the dashboard the same proof discipline that the pairwise comparison-report
path already has.

## Scope

- canonical dashboard smoke lane
- retained dashboard smoke JSON/Markdown/HTML artifacts
- extension-host proof for:
  - open dashboard
  - refresh dashboard
  - drill-down actions
  - missing/blocked pair visibility
- control-plane updates that reflect live dashboard status

## Non-Goals

- new runtime providers
- new repo harnesses beyond proof needs for the canonical lane

## Dependencies

- `ISSUE-0401`
- `ISSUE-0402`
- portions of `ISSUE-0403` where refresh is involved

## Acceptance Criteria

- canonical dashboard smoke artifacts are generated and retained
- extension-host tests prove the dashboard open and drill-down flows
- dashboard refresh evidence is visible in retained local artifacts
- current-state, README, alignment, and implementation index reflect live
  dashboard proof instead of future intent

## Required Evidence

- dashboard smoke artifacts under `.cache/harness-reports/HARNESS-VHS-001/`
- extension-host test lane
- design-gate pass

## First Slice

- add a dedicated dashboard smoke CLI and retained artifact set
- prove dashboard-open and artifact-open behavior in the extension-host lane
