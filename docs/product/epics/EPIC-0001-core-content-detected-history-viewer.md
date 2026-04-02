# EPIC-0001: Core Content-Detected History Viewer

## Outcome

Deliver the first end-to-end developer story:

- a developer opens a Git repository in VS Code
- right-clicks an eligible content-detected VI
- sees `VI History`
- opens a local history panel with factual commit data and core review actions

## Scope

- VS Code command and Explorer menu contribution
- workspace-trust gating
- tracked-file enumeration
- content-based VI detection
- bounded commit-history eligibility
- webview history panel
- local unit and integration test scaffolding

## Excluded From This Epic

- LabVIEW comparison report generation
- timeline-provider contribution
- Marketplace release pipeline

## Exit Criteria

- command visibility is driven by eligibility context, not file extensions
- at least one real harness is defined against cloned Git history
- the repo has a governed baseline and local CI

## Initial Child Slices

1. Manifest and trust-gating baseline
2. VI magic detection and parsing tests
3. Git eligibility indexer
4. History panel and actions
5. Harness-driven local verification

