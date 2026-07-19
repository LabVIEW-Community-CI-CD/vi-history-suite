# Agent Workflows

This directory holds the **local, agent-facing templates** used to iterate on
changes fully locally — before anything becomes a real GitHub issue or pull
request. It exists so a delegating agent can hand work to background/sub agents
and receive proposals and evidence in a shape that is already compliant with the
repository's enforced contracts.

## The delegate → template → promote loop

1. **Delegate.** The delegating agent spawns a background/sub agent to research
   or implement a scoped change.
2. **Report with a compliant template.** The background agent returns its
   proposal using [templates/local-change-proposal.md](./templates/local-change-proposal.md)
   and, after implementing, its evidence using
   [templates/local-pr-evidence.md](./templates/local-pr-evidence.md).
3. **Review locally.** The delegating agent reviews the filled template and runs
   the gates. Iteration stays local — no GitHub round-trips.
4. **Promote when ready.** A completed proposal maps field-for-field onto the
   real issue form (`.github/ISSUE_TEMPLATE/requirement_target.yml`) and the
   real PR template (`.github/pull_request_template.md`), so promotion to a real
   issue/PR is a paste, not a rewrite.

## Why the fields match the gates

The local templates deliberately mirror the enforced contracts so a background
agent cannot produce a proposal that would fail promotion:

- The change proposal mirrors the six decision-complete fields required by
  `.github/ISSUE_TEMPLATE/requirement_target.yml` (requirement id, files to
  inspect, acceptance criteria, validation commands, out-of-scope, requirement/
  RTM updates) plus classification for doc-only vs infra work.
- The PR-evidence draft mirrors the seven required anchors in
  `.github/pull_request_template.md` that `scripts/checkDefinitionOfDone.js`
  verifies.

## Scope

These templates are local working artifacts under `docs/`; they are not GitHub
issue forms and are not a scanned traceability surface. The authoritative,
promotable forms remain the real `.github/ISSUE_TEMPLATE/*` and
`.github/pull_request_template.md`.
