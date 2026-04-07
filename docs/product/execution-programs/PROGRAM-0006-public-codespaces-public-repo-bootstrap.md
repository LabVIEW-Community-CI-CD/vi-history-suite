# PROGRAM-0006: Public Codespaces Public-Repo Bootstrap

## Status

Active candidate program.

Activation facts:

- `TRANCHE-014` is active on the `1.2.0` minor line
- exact public `v1.1.0` remains the released `main` baseline
- the first `1.2.0` move repaired `develop` by back-merging exact `main`
  before feature work continued

## Purpose

Implement one governed public Codespaces/bootstrap capability for public
GitHub and GitLab repos without replacing the canonical icon-editor helper
path.

## North Star

A fork owner can:

- open the repo in Codespaces or a local devcontainer
- run one command with a public GitHub or GitLab HTTPS repo URL
- optionally specify a branch, or rely on remote default-branch resolution
- land on a visible cloned repo path that is easy to open in VS Code
- follow maintained public wiki procedures that are reviewed before exact
  release tagging from a brand new fork and a brand new Codespace

## Workstreams

1. branch-governance baseline repair and fail-closed admission
2. generic public GitHub/GitLab bootstrap command
3. canonical helper-path separation and public-reader docs
4. requirements, ADR, and design-gate normalization
5. review-ready boundary and controlled public-candidate publication
6. pre-tag human wiki-procedure review and exact-release promotion

## Queue Mapping

- `TRANCHE-014`
  - `ISSUE-0411`

## Exit Gates

### Gate A: Governed Baseline

- `develop` is realigned to exact released `main` before candidate work
  continues
- branch-baseline admission fails closed when that realignment has not happened

### Gate B: Generic Public Bootstrap

- one command clones a public GitHub or GitLab HTTPS repo without provider
  selection
- explicit branch honor and remote default-branch resolution are both governed
- existing dirty or mismatched clones fail closed

### Gate C: Public Reader Surface

- the canonical icon-editor helper path remains separate from the generic
  bootstrap path
- README and the public wiki reference manual explain both paths without
  conflating them
- the generic public-repo page is goal-first and reader-facing, not control
  plane wording exported into the public surface

### Gate D: Human Procedure Review

- Gate D opens only after the candidate is marked `review-ready`
- `review-ready` requires the maintained public `develop` candidate head and
  maintained public wiki head to be published and retained in the authority
  candidate package
- Sergio dry-runs the maintained public wiki procedures from a brand new fork
  and a brand new Codespace
- findings from that dry run are folded before exact tagging

### Gate E: Exact Release Promotion

- protected `develop` and `main` promotion paths are green
- the exact `v1.2.0` public and authority tags are cut only after Gate D is
  closed

## Delivery Rules

Every slice shall preserve:

- public-only repo support for this line
- no provider selector
- no silent fallback on dirty or mismatched clones
- no collapse of the canonical helper path into the generic path
- no human review gate against unpublished public candidate surfaces
- no stop-at-the-wrong-boundary behavior just because the public publication
  worktrees are dirty
- no exact tag before human wiki-procedure review from a brand new fork and a
  brand new Codespace

## Success Condition

This program is complete when `vi-history-suite` can govern a public
Codespaces/bootstrap path for public GitHub and GitLab repos, retains the
canonical icon-editor quickstart separately, and closes exact `v1.2.0`
only after the maintained public wiki procedures are accepted.
