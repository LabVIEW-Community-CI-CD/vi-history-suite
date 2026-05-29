---
name: requirements-traceability
description: 'Execute requirement-scoped changes in vi-history-suite with SRS and RTM alignment. Use when targeting VHS-REQ IDs, updating requirement-linked behavior, or closing traceability gaps.'
argument-hint: 'Optional requirement ID, for example VHS-REQ-610'
---

# Requirements Traceability

## When To Use
- A task names a requirement ID like VHS-REQ-###.
- A behavior change is tied to SRS acceptance criteria.
- Code, tests, or docs may change requirement evidence paths.
- Traceability audit reports mapping or gap findings.

## Required Inputs
- Target requirement ID.
- Linked issue number for PR evidence.
- Scope boundaries and validation commands.

## Execution Order
1. Read the requirement block in [docs/requirements/srs.md](../../../docs/requirements/srs.md) or [docs/requirements/syrs.md](../../../docs/requirements/syrs.md).
2. Read the matching row in [docs/requirements/rtm.csv](../../../docs/requirements/rtm.csv).
3. Inspect every file in `ImplementationRefs` and `VerificationRefs` before editing.
4. Implement changes with matching test updates.
5. If behavior or evidence paths changed, update requirement artifacts together:
   - [docs/requirements/srs.md](../../../docs/requirements/srs.md)
   - [docs/requirements/rtm.csv](../../../docs/requirements/rtm.csv)
   - [docs/requirements/id-index.csv](../../../docs/requirements/id-index.csv)
   - [docs/requirements/traceability-inventory.csv](../../../docs/requirements/traceability-inventory.csv)
6. Keep out-of-scope boundaries unchanged and explicit in PR evidence.

## Validation Sequence
1. `npm run traceability:audit`
2. `npm run check`
3. `npm test`
4. `npm run docs:links` (when docs changed)
5. `npm run coverage:map` (after `npm test` when risk mapping is needed)
6. `bash .github/skills/testing-automation/scripts/run-pr-gates.sh --skip-install` (before PR handoff)

## Output Contract
Use the required PR evidence fields in [.github/pull_request_template.md](../../../.github/pull_request_template.md):
- Linked issue
- Target requirement
- Validation commands
- Traceability / RTM impact
- Out-of-scope
- Closeout readiness

## References
- [docs/requirements/README.md](../../../docs/requirements/README.md)
- [.github/ISSUE_TEMPLATE/requirement_target.yml](../../../.github/ISSUE_TEMPLATE/requirement_target.yml)
- [docs/testing/test-plan.md](../../../docs/testing/test-plan.md)
- [scripts/auditTraceabilitySteward.js](../../../scripts/auditTraceabilitySteward.js)
- [scripts/mapCoverageToTraceability.js](../../../scripts/mapCoverageToTraceability.js)
- [scripts/checkDefinitionOfDone.js](../../../scripts/checkDefinitionOfDone.js)
