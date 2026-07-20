# ADR-0019: Agent Environment Consistency Gate

- Status: Accepted
- Date: 2026-07-20

> This ADR records the retained design for the local agent-environment-consistency
> git hooks under system requirement VHS-SYS-REQ-013 (CI And Developer
> Environment). The requirements package holds the authoritative text; this is the
> design record.

## Context

Local agents (and humans) repeatedly lost time to an inconsistent working
environment after a `git pull`/checkout: a changed lockfile with un-reinstalled
`node_modules` surfaces as `tsc: command not found`, and stale compiled `out/` or
un-read requirement changes cause avoidable rework. These are exactly the pitfalls
documented in AGENTS.md, but documentation is not enforcement.

A naive implementation comparing file mtimes is actively wrong here: `git
checkout` and `git reset` rewrite `package-lock.json`'s mtime to "now", so an
mtime comparison reports `node_modules` stale after precisely the git operations
the hooks run in — a false positive on every pull.

## Decision

Ship **blocking, content-based agent-environment-consistency git hooks**. A single
testable core (`scripts/checkEnvSync.js`) evaluates environment-sync facts into a
problem list and a hard-stale verdict. Only a **node_modules-vs-lockfile mismatch**
is hard (it breaks the toolchain); missing/stale `out/` and changed requirements
are **advisory**.

node_modules staleness is detected **by content, not mtime**: the npm `prepare`
lifecycle records `sha256(package-lock.json)` into a git-ignored marker under
`node_modules/`, and the check compares the current hash against it (a missing
marker — e.g. wiped `node_modules` — is stale). Enforcement is split by what git
honors: `pre-commit` fails closed on a hard-stale environment (git honors its exit
code), while `post-merge`/`post-checkout` report synchronously and **always exit
zero** because git ignores their exit codes. `prepare` also idempotently points
`core.hooksPath` at `.githooks` so a fresh clone auto-enables the hooks.

## Consequences

- Agents stop proceeding against a broken toolchain: a stale `node_modules`
  blocks the next commit with an actionable `npm ci` remedy.
- Detection is immune to the mtime churn of ordinary git operations, so the gate
  does not cry wolf.
- The commit block is minimal by design (toolchain-breaking only); advisory
  signals inform without obstructing doc-only work.
- The block is not absolute: `git commit --no-verify` bypasses all client-side
  hooks and git offers no hook-level prevention. This is forbidden by repository
  policy (AGENTS.md), not guaranteed technically.

## Requirements recorded

VHS-SYS-REQ-013; VHS-REQ-697.
