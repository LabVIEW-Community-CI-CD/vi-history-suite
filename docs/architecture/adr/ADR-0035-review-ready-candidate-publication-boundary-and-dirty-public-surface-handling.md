# ADR-0035: Review-Ready Candidate Publication Boundary And Dirty Public Surface Handling

## Status

Accepted

## Context

The `1.2.0` line exposed a control-plane design gap after Sergio's first
brand-new-fork review. The findings were folded locally in authority, but the
maintained public `develop` candidate surface and maintained public wiki
surface had not been republished yet.

That created two failure seams:

- local authority-green proof could feel "done enough" even though the next
  human review would still run against stale published public candidate heads
- dirty public source/wiki worktrees could be treated as a generic reason to
  stop instead of as a governed publication problem that needed narrow,
  conflict-aware patching

The branch model, SemVer posture, and human pre-tag review gate already
existed, but the boundary between local proof and review-ready publication was
not explicit enough.

## Decision

Adopt this candidate-publication boundary:

- retain an explicit ordered candidate-state progression:
  - `local-authority-green`
  - `public-develop-published`
  - `public-wiki-published`
  - `review-ready`
  - `expert-agent-review-findings-received`
  - `expert-agent-review-findings-folded`
  - `tag-eligible`
- treat `review-ready` as a fail-closed state, not as an operator judgment
- require both of these before the next review gate opens:
  - the maintained public `develop` candidate head is actually published
  - the maintained public wiki head is actually published
- retain those published heads in `docs/product/public-release-candidate.{md,json}`
- keep local authority-green proof necessary but insufficient for reopening the
  active expert-agent review gate

Adopt this dirty-public-surface publication rule:

- preserve unrelated dirt in the local public source/wiki worktrees
- inspect overlapping files carefully
- patch only the maintained candidate slice narrowly
- pause only on direct unresolved conflicts
- do not overwrite blindly, and do not stop publication solely because the
  worktree is dirty

## Consequences

Positive:

- future sessions get one explicit boundary between local proof and human
  review readiness
- the maintained public candidate heads become part of the governed review
  truth instead of an implicit publishing assumption
- dirty public publication surfaces are handled deliberately without either
  blind overwrite or premature stoppage

Costs:

- the control plane now has another state boundary to maintain
- candidate publication requires more explicit bookkeeping in the public
  release-candidate package

## Follow-On

- retain this boundary in the SRS, RTM, test plan, sustainment rules, release
  procedure, current-state, `ISSUE-0411`, `PROGRAM-0006`, and the public
  release-candidate package
- keep governance tests fail-closed when local proof is green but review-ready
  publication has not happened yet
