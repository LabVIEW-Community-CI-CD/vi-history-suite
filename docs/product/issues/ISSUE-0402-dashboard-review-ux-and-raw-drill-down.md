# ISSUE-0402: Dashboard Metadata Concentration UX

## Goal

Turn the concentrated dashboard into the main expert-review surface for
coherent VI Comparison Report metadata instead of a packet-and-artifact viewer.

## Scope

- chronology-first dashboard HTML
- concentrated VI Comparison Report metadata derived from actual NI report
  surfaces
- clear pair provenance presentation
- actual metadata surfaces from retained comparison reports:
  - report title
  - generation time
  - compared VI paths
  - overview section captions and image counts
  - included attributes
  - detailed-information headings and items
- metadata-first wording that avoids ranking or semantic interpretation

## Non-Goals

- progress/cancellation
- provider doctor
- review-scenario registry

## Dependencies

- `ISSUE-0401`

## Acceptance Criteria

- dashboard HTML surfaces chronology and pair ordering clearly
- provider provenance and concentrated comparison metadata are visible without
  opening raw artifacts
- the HTML reflects actual NI comparison-report metadata fields instead of
  invented dashboard cues
- dashboard wording remains factual and does not imply semantic certainty

## Required Evidence

- unit tests for dashboard HTML rendering and artifact actions
- extension-host proof for dashboard-open and artifact-open paths
- design-gate pass

## First Slice

- inventory the actual NI comparison-report metadata surfaces from a generated
  report
- improve dashboard HTML sections around those metadata surfaces
- prove metadata concentration and chronology on the dashboard
