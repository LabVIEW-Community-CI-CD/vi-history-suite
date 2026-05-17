# ISSUE-0409: Post-Release Sustainment And Release Cadence

## Goal

Give post-benchmark `vi-history-suite` maintenance an explicit governed home
for release cadence, benchmark refresh cadence, operator-surface upkeep, and
control-plane stability.

## Status

Active post-release issue.

Activation is now satisfied:

- `PROGRAM-0003` is now closed on the benchmark-proof packet under
  `TRANCHE-011`
- `PROGRAM-0005` is active again under `TRANCHE-016`
- `TRANCHE-012` is now the active queue tranche

## Scope

- release cadence and SemVer discipline after the first public release-kit
  closeout
- explicit major/minor/patch decision criteria for post-release work
- branch-model and lane-specific CI/design-gate governance after each exact release
- continuous refinement of SRS, RTM, and test-plan coverage from governed findings
- continuous refinement of ADR coverage from governed findings
- explicit public GitHub workflow responsibility, trigger-boundary, and
  churn-control governance
- explicit hosted GitLab/GitHub branch-protection and workflow-lane
  classification so required checks and characterization-only lanes are not
  conflated
- explicit public-source target-root governance so local promotion/check does
  not act on a stale dirty side checkout by mistake
- explicit review-ready candidate publication governance so local
  authority-green proof does not reopen human review before maintained public
  candidate heads are actually published and retained
- explicit dirty-public-surface handling so public candidate publication does
  not stop prematurely just because the maintained worktrees are dirty
- explicit VS Code Marketplace publication governance so Marketplace
  publication, verification, and retained evidence are part of exact release
  closeout instead of a chat-memory side step
- explicit exact-closeout back-merge governance so future sessions do not stop
  after exact `main` publication and wait for Sergio to ask for the required
  `develop` realignment
- explicit installed-user entry-surface redesign so Marketplace readers land on
  local-use documentation first instead of repo/fork/branch guidance
- benchmark refresh cadence and image contract upkeep
- operator-surface and documentation-workbench sustainment
- repo-owned recovery plus live drift assertion surfaces for sustained
  runner/operator contracts
- post-release control-plane maintenance
- not the active extension execution-contract program under `PROGRAM-0005`
- not the historical Docker-only public closeout under `PROGRAM-0002`
- not the runtime-provider public-acceptance gate record

## Non-Goals

- reopening benchmark proof once it is governed as complete
- unbounded feature growth without a new explicit program

## Dependencies

- completed `PROGRAM-0003`
- active `PROGRAM-0005`
- historical `PROGRAM-0002` closeout
- explicit runtime-provider public-acceptance gate
- truthful current-state and queue surfaces

## Acceptance Criteria

- sustainment operating rules are explicit in the control plane
- release and benchmark refresh cadence are bounded and discoverable
- operator/documentation upkeep has a governed maintenance path
- sustained runner/operator lanes retain repo-owned apply, recovery, plus
  live drift-assert surfaces instead of depending on host memory between
  applies or mid-session operator intervention
- future release lines carry an explicit SemVer-decision and branch-lane CI model
- future governed findings either update the requirement package in the same
  slice or retain an explicit no-impact rationale
- future governed findings either update the ADR package in the same slice or
  retain an explicit no-impact rationale
- the public GitHub workflow pair retains explicit owned responsibilities,
  bounded triggers, and churn-control instead of raw-YAML-only truth
- hosted GitLab and GitHub protection semantics are retained explicitly in one
  governed matrix instead of being inferred from live settings
- local historical public-source publication/adoption checks bind the intended
  checkout explicitly and fail closed on dirty target repos before reporting
  drift
- candidate lines retain an explicit fail-closed `review-ready` state before
  the next expert-agent review gate opens
- public candidate publication preserves unrelated dirt and pauses only on
  direct unresolved conflicts instead of stopping on any dirty worktree
- exact release closeout retains Marketplace publication evidence under the
  governed publisher/item identity
- exact release closeout remains incomplete until exact released `main` has
  been back-merged into `develop` through the protected path and the resulting
  `develop` pipeline is green
- the first-contact installed-user documentation surface is useful to
  Marketplace users who only want to install and use the extension locally
- post-publication installed-user observation is recurring after the one-time
  campaign: public intake, repeated confusion, first-time video-plan
  observations, exact Marketplace publication closeout, and SemVer candidate
  decisions can trigger a new cycle, with a no-later-than review while public
  intake remains open
- future work does not fall back into unowned tail iteration

## Required Evidence

- updated queue and program docs
- retained sustainment rules in Markdown and JSON form
- updated SRS/RTM/test-plan coverage or an explicit retained no-impact rationale
- updated ADR coverage or an explicit retained no-impact rationale
- sustained release and benchmark refresh rules
- green docs and design gates after the sustainment control-plane update

## First Active Slice

- retain the sustainment operating model in the queue and current-state docs
- define the first maintained release-refresh and benchmark-refresh rules
- retain those rules explicitly in `docs/product/post-release-sustainment-rules.md`
  and `docs/product/post-release-sustainment-rules.json`
- keep extending the sustainment package when new release-control findings
  expose missing boundaries such as `review-ready` publication gating or
  dirty-public-surface handling
- keep extending the sustainment package when a real publication surface such
  as the VS Code Marketplace or its installed-user documentation entry surface
  becomes live but is still weakly governed
- keep extending the sustainment package when required release follow-through,
  such as the back-merge of exact `main` into `develop`, still depends on
  operator prompting instead of retained closeout rules
- keep extending the sustainment package when admitted runner hosts have
  repo-owned apply surfaces but still lack repo-owned live drift assertions
  for their current installed state
- keep extending the sustainment package when admitted Windows proof lanes
  still need manual operator cleanup instead of a retained repo-owned
  mid-session recovery surface
- keep extending the sustainment package when exact-tag eligibility still
  depends on ad hoc manual review instead of a retained expert-agent review
  skill and no-findings verdict against the exact published public candidate
  surfaces
- keep extending the sustainment package when installed-user acceptance needs
  another observation cycle, while keeping observed, deferred, and blocked
  facts separate from publication proof and keeping Windows Docker Desktop
  proof under `ISSUE-0415`
- stop short of absorbing the active `PROGRAM-0005`, the historical
  `PROGRAM-0002` closeout, or the explicit runtime-provider public-acceptance
  gate into generic sustainment language
