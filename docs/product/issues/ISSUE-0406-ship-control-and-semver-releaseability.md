# ISSUE-0406: Ship Control And SemVer Releaseability

## Goal

Turn `vi-history-suite` into a directed ship program with one active tranche and
one explicit SemVer release target.

## Status

Closed for the first immutable release target:

- retained release: `v0.2.0`
- retained pipeline: `2428809456`
- retained release job: `13779604462`

The ship-control surfaces retained by this issue are now closed historical
evidence for `SHIP-0001`. Current repo-active work moved to
`TRANCHE-010` / `ISSUE-0407` after the immutable `v0.2.0` release landed.

## Scope

- authoritative ship target
- release-readiness matrix
- blocker ledger
- exactly one active tranche in the development queue
- current package baseline versus target release version
- target VSIX artifact and release-manifest identity
- GitLab SemVer-tag validation, VSIX packaging, and release-manifest retention
- SemVer-governed VSIX releaseability evidence expectations
- published docs-authoring workbench image plus docs gate for requirements,
  ADR, release-readiness, and wiki-authority iteration
- retained documentation coherence ledger and wiki seed plan for future
  authority-first wiki work
- retained wiki publication ledger once wiki seeding begins

## Non-Goals

- Marketplace credential setup
- feature work that does not remove a ship blocker

## Dependencies

- reliable comparison-report execution
- dashboard baseline
- canonical scenario baseline

## Acceptance Criteria

- the repo has one authoritative ship target with a named SemVer target
- the repo has one machine-readable release-readiness matrix
- the repo has one machine-readable blocker ledger
- `development-queue.json` has exactly one active tranche
- the ship surfaces retain the current package baseline and the target release
  artifact identity without ambiguity
- the GitLab release lane fails closed when the tag and package version drift
- the GitLab release lane packages a versioned VSIX and retains a release
  manifest
- the active tranche maps to the release target and explicit ship blockers
- the repo publishes a docs-authoring workbench image and retained
  docs-workbench manifest through GitLab CI
- the repo documents how future documentation-package and wiki-preparation work
  should use that workbench instead of ad hoc host setup
- the repo retains a documentation coherence ledger and wiki seed plan that
  future sessions can use before drafting wiki content
- the repo retains a wiki publication ledger once pages are actually pushed to
  the wiki

## Required Evidence

- unit validation for ship-control invariants
- doc review for README/current-state/release procedure alignment
- design-gate pass

## First Slice

- create the ship target, readiness matrix, and blocker ledger
- rebase the queue onto one active tranche
- make releaseability an explicit governed goal instead of an implied follow-up
