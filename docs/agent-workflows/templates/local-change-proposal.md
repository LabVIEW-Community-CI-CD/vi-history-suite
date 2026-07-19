# Local agent change proposal
#
# A background/sub agent fills this out to communicate a proposed change back to
# the delegating agent, BEFORE anything becomes a real GitHub issue. It mirrors
# the compliant fields of .github/ISSUE_TEMPLATE/requirement_target.yml and the
# PR evidence contract, so a completed proposal can be promoted to a real issue
# or PR without reshaping. Keep entries concise and factual. Delete this comment
# block when filling it in.

## Title

Target VHS-REQ-###: <short imperative summary>

## Target Requirement ID

VHS-REQ-### (one Active id from docs/requirements/srs.md; use "none — infra" only
for non-requirement tooling/docs work)

## Problem Statement

<What behavior, evidence, or maintenance gap should change, and why this target?>

## Files To Inspect

- docs/requirements/srs.md
- docs/requirements/rtm.csv
- src/...
- tests/...

## Acceptance Criteria

- <observable outcome>
- <observable outcome>

## Required Tests

- Add or update tests/unit/...
- Update requirements/RTM tests if requirement references change.

## Validation Commands

```shell
npm run check
npm test
npm run adr:check
```

## Out-Of-Scope Boundaries

- <nearby work intentionally not changed>

## Requirement And RTM Updates

<none | which of SRS, RTM, id-index, traceability-inventory need updates>

## Classification

- Kind: <requirement-target | doc-only | infra/tooling>
- Non-doc follow-up needed: <no | yes — describe so a separate issue can be filed>
