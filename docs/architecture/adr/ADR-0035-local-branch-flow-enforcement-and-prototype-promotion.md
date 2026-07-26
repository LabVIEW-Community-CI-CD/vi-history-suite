# ADR-0035: Local Branch-Flow Enforcement And Explicit Prototype Promotion

- Status: Accepted
- Date: 2026-07-25

> This ADR records the retained design for the local branch-flow enforcement
> pre-push hook and the explicit prototype-promotion tool under system
> requirement VHS-SYS-REQ-011 (GitHub-First Source). The requirements package
> holds the authoritative text (VHS-REQ-719); this ADR is the design record.

## Context

The repository branch flow (`feature/<issue#>-*` into `develop` into `main`,
alongside `fix/*`, `release/v*`, and `hotfix/v*`) is enforced by the hosted-CI
**Branch Governance** step. That backstop is correct, but its failure mode is
expensive and disguised: a mis-named branch, a direct push to a protected
branch, or a `feature/<issue#>` branch whose issue does not exist surfaces only
after a full CI run, and only as a **`Build, Test, Package` job FAILURE** whose
real failed step (`Branch Governance`, `decision: blocked`) is visible only in
the per-step drill-down — a documented AGENTS.md pitfall that repeatedly cost
agents time chasing a nonexistent test or build regression.

The two-agent (LINUX and WIN) mirror-mode collaboration made a second gap
concrete: prototype work living on a long-lived `prototype/*` branch was being
folded into the governed flow ad hoc, with no auditable record of what was
promoted from where.

Documentation named both hazards; documentation is not enforcement.

## Decision

Ship a **local, blocking pre-push branch-flow gate** and an **explicit
prototype-promotion tool**, each a pure, injected-dependency core with a thin
CLI so both are exercised deterministically without touching git or GitHub.

`scripts/branchFlowEnforce.js` — `evaluateBranchFlow({ refs, issueExists,
ruleCVerifiable })` returns an allow/block decision with per-rule reasons over
three rules: (A) **no direct push to a protected branch** (`develop`/`main`),
remedied by opening a PR; (B) a develop-flow **branch name must match an allowed
pattern** (`feature/<issue#>-*`, `fix/*`, `release/v*`, `hotfix/v*`, or a
`dependabot/` branch), with `wip/*`, `spike/*`, and `prototype/*` **exempt** and
tag refs skipped; and (C) a `feature/<issue#>` branch's **referenced issue must
exist**. Rule C **self-skips when unverifiable** (no `gh`/network) with an audit
note instead of blocking, so the gate never fails closed on a missing credential
or an offline plane. The CLI parses the pre-push stdin ref lines and wires
`ghIssueExists` plus the agent-environment identity from `deriveAgentEnvironment`
(ADR-0019), exiting non-zero on any block.

`scripts/collabPromote.js` — `runPromote` performs an explicit, auditable
promotion of prototype work into the develop flow: it **gates strictly before
push**, then opens the PR and arms auto-merge, with a branch-collision precheck,
a **reconcile-requires-provenance** rule, and a `Prototype-Source` commit trailer
that records the promoted origin.

`.githooks/pre-push` runs the branch-flow check **first**, ahead of the ADR,
agent-delegation, and standards gates, so the cheapest and most common misstep
is reported with an actionable remedy before the slower gates run.

## Consequences

- A mis-named, protected-branch, or issue-less push is caught **locally** with
  an actionable remedy, instead of surfacing downstream as a disguised hosted-CI
  `Build, Test, Package` failure whose true cause is the Branch Governance step.
- Rule C's skip-when-unverifiable keeps the gate usable on gh-less / offline
  planes (for example the Docker validation plane): it degrades to an audit note
  and never raises a false block.
- Prototype promotion becomes deliberate and traceable — prototype-only work
  enters the governed flow through one gated path carrying a `Prototype-Source`
  trailer, not by accident.
- Both cores are pure over injected dependencies, so the rules and the promotion
  contract are covered deterministically without git/GitHub side effects.
- Client-side hooks are bypassable with `--no-verify`; this is forbidden by
  repository policy (AGENTS.md), not guaranteed technically. Hosted-CI Branch
  Governance remains the authoritative backstop.

## Requirements recorded

VHS-SYS-REQ-011; VHS-REQ-719.
