# PROGRAM-0004: Post-Release Sustainment And Release Cadence

## Status

Active post-release program.

Activation is now satisfied:

- `PROGRAM-0003` is closed on the benchmark-proof packet under `TRANCHE-011`
- `PROGRAM-0005` is active again on the installed local-`LabVIEWCLI`
  contract reset under `TRANCHE-016`
- the queue has promoted `TRANCHE-012` to `active`

## Purpose

Define the sustained operating program after the public-release closeout and
benchmark-proof programs are complete.

This program keeps `vi-history-suite` from falling back into ad hoc tail work
by giving release cadence, benchmark refresh cadence, operator surfaces, and
control-plane upkeep an explicit home.

Feature-layer execution-policy work is not owned by this sustainment program.
That work remains explicit under active `PROGRAM-0005`, and the public-closeout
record remains explicit under historical `PROGRAM-0002` plus the open
runtime-provider public-acceptance gate.

## North Star

`vi-history-suite` remains a governed released product with:

- a truthful public release-kit surface
- bounded benchmark refresh policy
- sustained operator-facing proof surfaces
- disciplined versioning and documentation upkeep

## Workstreams

1. release cadence, SemVer discipline, and public release-kit upkeep
2. benchmark refresh cadence and proof-surface maintenance
3. operator-surface, documentation-workbench, and control-plane sustainment
4. branch-model and lane-specific CI governance for the line after each exact release
5. requirements/RTM/test-plan evolution from governed findings
6. ADR evolution from governed findings
7. public GitHub workflow responsibility and churn-control governance
8. hosted GitLab/GitHub protection semantics and workflow-lane classification
9. public-source promotion target-root hygiene for local governed publication
10. review-ready candidate publication boundary and dirty-public-surface handling
11. VS Code Marketplace publication governance and retained publication evidence
12. installed-user-first entry-surface redesign for Marketplace readers
13. exact-closeout back-merge follow-through so exact `main` publication is
    not treated as fully closed before `develop` is realigned and green again
14. recurring post-publication installed-user observation so first-time
    installed-user acceptance keeps feeding docs, video-plan, public intake,
    and SemVer decisions without treating publication proof as user acceptance

## Queue Mapping

- `TRANCHE-012`
  - `ISSUE-0409`

## Exit Gates

### Gate A: Release Cadence

- release cadence is explicit and governable
- version bumps and packaged-artifact discipline remain bounded and repeatable

### Gate B: Benchmark Sustainment

- benchmark refresh policy is retained
- benchmark-image contracts and consumer tooling remain truthful

### Gate C: Operator And Public Surface Sustainment

- public release-kit docs and support surface remain truthful
- operator-facing host-review, docs-workbench, and evidence-consumer surfaces
  remain maintained

### Gate D: Control-Plane Stability

- queue, current-state, and sustainment docs reflect the live operating model
- future work enters under an explicit sustained program instead of drifting
  through open-ended tail work

## Delivery Rules

This program is about maintenance discipline, not feature sprawl.

Every slice must preserve:

- versioned release truth
- benchmark evidence truth
- documentation-package coherence
- operator-surface clarity
- explicit SemVer-decision rationale
- explicit branch-lane admission and CI/design-gate posture
- continuous refinement of the requirement package from governed findings
- continuous refinement of the ADR package from governed findings
- explicit public GitHub workflow responsibilities, bounded triggers, and
  churn-control posture
- one governed hosted automation matrix that distinguishes GitLab protected
  pipeline-success admission, GitHub named required checks, and
  characterization-only experiment workflows
- one governed public-source target-root rule so local promotion/check binds
  the intended checkout and fails closed on dirty side worktrees
- one governed review-ready boundary so local authority-green proof does not
  reopen the active expert-agent review gate before the maintained public
  candidate heads are actually
  published and retained
- one governed dirty-public-surface rule so candidate publication preserves
  unrelated dirt and pauses only on direct unresolved conflicts
- one governed expert-agent review gate so exact tagging stays blocked until
  the retained `vi-history-suite-expert-agent-reviewer` verdict against the
  exact published public candidate heads comes back with no findings
- one governed Marketplace publication contract so exact release closeout is
  not treated as complete before the released VSIX is live on the Marketplace
  under the retained publisher/item identity
- one governed exact-closeout back-merge rule so future sessions do not wait
  for a human prompt before realigning exact released `main` back into
  `develop`
- one governed installed-user entry surface so Marketplace readers land on
  local-use guidance first and source-evaluation/fork procedures stay
  explicitly secondary
- one governed post-publication installed-user observation cadence so future
  cycles retain observed, deferred, and blocked facts separately from
  publication proof and route repeated confusion into docs or first-time video
  work before SemVer decisions
- one governed apply-plus-recovery-plus-assert contract for admitted
  runner/operator hosts so live host drift and mid-session proof-host cleanup
  can be proven from the repo instead of trusted from machine memory or
  manual operator intervention

## First Implementation Slice

Continue with [ISSUE-0409 Post-Release Sustainment And Release Cadence](../issues/ISSUE-0409-post-release-sustainment-and-release-cadence.md).

The first sustainment slice is now retained in:

- [post-release-sustainment-rules.md](../post-release-sustainment-rules.md)
- [post-release-sustainment-rules.json](../post-release-sustainment-rules.json)

That retained slice now:

- retain the sustainment operating model in the control plane
- define the first benchmark-refresh and release-refresh rules
- define benchmark non-trigger and reopen rules for the accepted current
  contract
- define the required authority/wiki/bundled-doc refresh steps for future
  sustainment slices
- keep admitted runner/operator upkeep on repo-owned apply plus live
  drift-assert surfaces when those hosts remain part of protected-branch
  admission
- keep admitted Windows proof-host contamination recovery on a repo-owned
  mid-session recovery surface instead of manual host cleanup
- stop short of claiming new product-layer expansion

## Success Condition

This program is complete when `vi-history-suite` has a stable post-benchmark
operating model for releases, benchmark refresh, and documentation/operator
upkeep, with no ambiguity about where ongoing maintenance work belongs while
historical public-closeout, the runtime-provider public-acceptance gate record,
or execution-policy work remains explicitly outside the sustainment bucket.
