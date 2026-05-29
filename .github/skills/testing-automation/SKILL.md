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

## Failure Triage Flow
1. Run the smallest command that reproduces the failure.
2. Fix code and tests together in the same change.
3. Re-run the failing command, then re-run the next gate in sequence.
4. Confirm docs/traceability gates if requirements or docs changed.

## Evidence Checklist
- Mention exact commands used in PR notes.
- Include whether failures were unit, integration, packaging, or DoD gates.
- If threshold or gate behavior changes, update:
  - [docs/testing/test-plan.md](../../../docs/testing/test-plan.md)
  - [vitest.config.ts](../../../vitest.config.ts)

## References
- [docs/testing/test-plan.md](../../../docs/testing/test-plan.md)
- [docs/development.md](../../../docs/development.md)
- [TROUBLESHOOTING.md](../../../TROUBLESHOOTING.md)
