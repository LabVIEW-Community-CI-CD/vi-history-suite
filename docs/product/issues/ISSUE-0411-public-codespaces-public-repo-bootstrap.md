# ISSUE-0411: Public Codespaces Public-Repo Bootstrap

## Goal

Give public fork owners one governed Codespaces/bootstrap command that can
clone a public GitHub or public GitLab repo without forcing provider selection,
while keeping the canonical icon-editor helper path separate.

## Status

Closed exact-release issue.

Activation facts:

- `TRANCHE-014` closed on the `1.2.0` minor line
- exact `v1.2.0` is now the released public baseline on `main`
- authority `develop` was realigned to exact `main` before `1.2.0` feature work
  continued

## Scope

- one generic public bootstrap command for Codespaces/devcontainer use
- public `github.com` and `gitlab.com` HTTPS repos only
- explicit branch honor when provided
- remote default-branch resolution when the branch is omitted
- visible repo-sibling clone target
- fail-closed behavior on dirty or mismatched existing clones
- maintained public wiki procedures for the canonical helper path and the
  generic public-repo path
- a standalone public reference manual for the generic path instead of a
  quickstart-style clone page
- pre-tag human dry-run review of those wiki procedures from a brand new fork
  and a brand new Codespace

## Non-Goals

- private repo authentication
- SSH clone support
- arbitrary Git hosts beyond public `github.com` and `gitlab.com`
- replacing the canonical `npm run public:fixture:icon-editor` path
- automatic startup cloning as a default side effect

## Dependencies

- truthful `1.2.0` SemVer opening in the control plane
- governed branch-baseline admission
- public and authority documentation-package coherence

## Acceptance Criteria

- a fork owner can run one command to clone a public GitHub or GitLab repo in
  Codespaces or a local devcontainer
- the command does not require a provider flag
- the command honors an explicit branch exactly
- when the branch is omitted, the command resolves the remote default branch
- the clone lands in a visible repo-sibling path derived from the repo name
- the command fails closed on dirty or mismatched existing clones
- the canonical icon-editor helper path remains separate and easier for a
  first-time proof
- the candidate control plane exposes a fail-closed `review-ready` state that
  remains blocked until the maintained public `develop` candidate head and
  maintained public wiki head are both published and retained
- the exact `v1.2.0` tag remains gated on Sergio's maintained public wiki
  procedure dry run from a brand new fork and a brand new Codespace until that
  review is accepted and folded
- governed publication of the maintained public source/wiki surfaces preserves
  unrelated dirty worktree changes and pauses only on direct unresolved
  conflicts

## Required Evidence

- implemented bootstrap scripts and tests
- updated README, current-state, release-candidate, and public-reader docs
- updated requirements, RTM, test plan, and ADR package
- green design and docs gates on the candidate line
- retained `review-ready` state before the next human dry run opens
- retained Sergio wiki-procedure review and accepted rerun before exact
  tagging, using a brand new fork and a brand new Codespace

## First Active Slice

- realign exact `main` into `develop` before continuing `1.2.0`
- add the fail-closed branch-baseline assertion surface
- add the generic public GitHub/GitLab bootstrap surface
- retain the exact-tag human wiki-review gate in the control plane
- retain the review-ready publication boundary and dirty-public-surface
  handling in the same line
