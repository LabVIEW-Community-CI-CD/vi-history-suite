# ADR-0001: GitHub-First Release And Traceability Governance

- Status: Active
- Date: 2026-05-28

## Context

VI History Suite is maintained as a public VS Code extension with GitHub as the
active source, issue, pull request, CI, and release home. The extension's
product behavior is local-first: it reviews LabVIEW VI history from a user's
workspace and uses installed runtime tooling only when a user explicitly asks
for comparison evidence.

The project also uses requirements, RTM rows, an ID index, and a traceability
inventory as the agent work contract. Those artifacts let maintainers route
implementation, tests, documentation, release evidence, and standards maturity
findings without relying on chat memory.

## Decision

Keep GitHub-first source and release governance together with the requirements,
RTM, and traceability inventory governance path.

GitHub remains the active authority for source, issues, pull requests, CI, exact
release tags, Marketplace publication evidence, and release back-sync. The
requirements package remains the active authority for agent-targeted work,
traceability closure, and standards evidence classification.

This decision is anchored to system requirement VHS-SYS-REQ-016 (Governed
Release Branch Promotion) and realized in software requirement VHS-REQ-609
(Governed Branch Promotion And Marketplace Release Automation).

## Rationale

This keeps release evidence and agent work evidence in one reviewable public
path. Exact-tag Marketplace publication, branch-governed promotion, RTM-backed
requirements, and inventory-backed traceability audits are visible together and
can be checked before closing umbrella issues.

The decision also avoids changing extension behavior for a standards maturity
uplift. Architecture evidence can improve without adding commands, changing
runtime selection, moving storage, or changing Marketplace identity.

## Consequences

- Architecture evidence must describe the current GitHub-first and local-first
  system truth, not a historical GitLab process or aspirational workflow.
- Release work must leave a GitHub trail that connects PRs, merge commits, tags,
  Marketplace workflow runs, live listing checks, and back-sync evidence.
- Agent-targeted implementation work must keep requirements, RTM rows, tests,
  and traceability inventory coherent when behavior changes.
- Standards maturity warnings that do not block the current umbrella issue
  should become ordered follow-up issues instead of silent blockers.
- Future significant architecture decisions may add more ADR files, but small
  architecture evidence updates may remain in the overview when the rationale
  and consequences are clear.
