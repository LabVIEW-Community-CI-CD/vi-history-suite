# AGENTS

Public GitHub agent work in this repository must stay public-safe and scoped to
the assigned issue.

## GitHub Agent Workflow

1. Read the full issue, comments, and handoff instructions.
2. Keep the patch narrowly scoped to the requested public-safe change.
3. Run the listed verification before opening a PR:
   - `npm ci`
   - `npm run check`
   - `npm test`
   - run docs-specific checks too when they exist for the change
4. Open a PR to `main`.
5. Summarize verification results and any blockers/evidence in the PR.

## Forbidden Public-Agent Actions

Public agents must not:

- create exact Git tags used for release authority
- publish GitHub releases
- mutate Marketplace state
- admit release proof without retained, verifiable evidence
- delete release branches
- run protected release operations in GitLab

## Routing Labels

- `ready-for-github-agent`: issue is ready for public GitHub agent execution.
- `needs-refinement`: issue needs clearer scope or acceptance criteria first.
- `authority-only`: requires governed authority-lane handling, not public agent execution.
- `blocked-local-windows`: blocked pending local Windows prerequisites or validation.
- `public-facade`: work touches the public facade surface intended for GitHub.
- `installed-user-ux`: installed-user interaction or UX changes.
- `user-docs`: public documentation or onboarding changes.
- `ci-hardening`: CI/workflow reliability hardening in the public lane.
- `release-proof`: release proof/evidence packet preparation or review.
- `marketplace-release`: Marketplace release readiness tracking.
- `windows-host`: Windows host runtime, setup, or validation scope.

## Public-to-Governed Adoption Requirement

Public source changes merged in GitHub must be adopted back into the governed
GitLab `public-github-source/` facade before the next public promotion.

## Copilot Handoff Instructions (Standard Block)

Implement this only in the public GitHub repository. Open a PR to `main`. Do
not create tags, publish releases, mutate Marketplace state, admit release
proof, delete evidence, or alter release authority. Keep the change scoped to
this issue. Report verification results in the PR. If the issue requires
private GitLab context, Windows Docker Desktop, LabVIEW activation, or
protected release operations, stop and document the blocker instead of
inventing evidence.
