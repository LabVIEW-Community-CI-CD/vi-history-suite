---
name: testing-automation
description: 'Run, debug, and harden testing workflows in vi-history-suite. Use when writing tests, triaging CI failures, validating pull requests, or preparing release evidence.'
argument-hint: 'Optional scope: fast, full, integration, release'
---

# Testing Automation

## When To Use
- Add or update tests for changed code.
- Reproduce and fix failing CI checks.
- Validate a pull request before review.
- Build evidence for release-readiness decisions.

## Priority Workflow
Follow this order to minimize rework and get fast feedback:

1. `npm run check`
2. `npm test`
3. `npm run test:integration:compile` (when integration surfaces changed)
4. `bash .github/skills/testing-automation/scripts/run-pr-gates.sh --skip-install` (before PR handoff)

Use `bash .github/skills/testing-automation/scripts/run-pr-gates.sh` when you need a clean dependency install with `npm ci`.

For a single-pane requirement-verification signal across structural integrity, requirement linkage, criterion citation, coverage risk, and mutation, run `npm run requirements:verify` (`:strict` fails locally when health is not green). Stryker mutation testing runs nightly and advisory via `.github/workflows/mutation.yml`; run it locally with `npm run test:mutation` (`src/domain` scope).

## Failure Triage Flow
1. Run the smallest command that reproduces the failure.
2. Fix code and tests together in the same change.
3. Re-run the failing command, then re-run the next gate in sequence.
4. Confirm docs/traceability gates if requirements or docs changed.

## Docs Link Hygiene
- `npm run docs:links` checks committed Markdown and bundled documentation, not retained run output. If a failure points into generated roots such as `win-validation/`, `.cache/`, `assurance-*-evidence/`, `release-evidence/`, coverage/package output, or Vagrant evidence folders, harden the skip policy and tests instead of editing copied staging docs.

## Evidence Checklist
- Mention exact commands used in PR notes.
- Include whether failures were unit, integration, packaging, or DoD gates.
- If threshold or gate behavior changes, update:
  - [docs/testing/test-plan.md](../../../docs/testing/test-plan.md)
  - [vitest.config.ts](../../../vitest.config.ts)
- When adding new source or test files, update [docs/requirements/traceability-inventory.csv](../../../docs/requirements/traceability-inventory.csv) classification to keep `npm run traceability:audit` green.

## References
- [docs/testing/test-plan.md](../../../docs/testing/test-plan.md)
- [docs/development.md](../../../docs/development.md)
- [TROUBLESHOOTING.md](../../../TROUBLESHOOTING.md)
