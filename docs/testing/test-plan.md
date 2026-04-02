# Test Plan

## Overview

- Release or baseline: `draft-baseline`
- Owner: sole author
- Scope: first governed extension baseline for content-detected VI history
  review

## Test Items

| Item | Type | Risk | Notes |
| --- | --- | --- | --- |
| VI magic detection | Unit | High | Product entry condition |
| Git output parsing | Unit | High | Eligibility correctness |
| Core history model against a temporary Git repo | Unit | High | Real Git semantics without VS Code host |
| History panel rendering | Unit | Medium | Primary review surface |
| Extension activation and command flow | Integration | High | VS Code runtime behavior |
| Harness smoke against cloned real repo | Smoke | High | Real history path |

## Entry Criteria

- requirements and traceability are current
- TypeScript compiles
- unit test fixtures are present

## Exit Criteria

- unit tests pass
- extension compiles cleanly
- local coverage is generated
- no blocking defect is left in the initial command or history flow

## Coverage Targets

| Metric | Target | Evidence |
| --- | --- | --- |
| Line | 80% | `coverage/cobertura-coverage.xml` |
| Branch | Project-defined by Vitest | `coverage/coverage-summary.json` |

## Initial Test Cases

- `TEST-UNIT-001`: detect `LVIN` and `LVCC`, reject short files, reject wrong
  offsets, and exercise strict-header mode
- `TEST-UNIT-002`: parse `git ls-files -z`, bounded commit-hash output, and
  history-entry output
- `TEST-UNIT-003`: prove cache-key and concurrency helpers behave deterministically
- `TEST-UNIT-004`: render a history panel with factual metadata and action hooks
- `TEST-INTEG-001`: activate extension, compute eligibility context, and open
  the history panel for an eligible file, then assert the rendered HTML retains
  stable semantic anchors plus factual eligibility, signature, path, and commit
  subjects
- `TEST-INTEG-002`: validate non-file URI detection fallback behavior
- `TEST-UNIT-005`: build a temporary Git repo with a content-detected VI and
  assert the shared core history model returns eligible history
- `TEST-SMOKE-001`: run the canonical harness smoke and retain JSON, Markdown,
  and HTML reports under `.cache/harness-reports/`
- `TEST-INTEG-001`: run a real VS Code extension host against a temporary Git
  workspace and prove eligible versus ineligible command flow behavior

## Reporting

- CI artifacts: `coverage/`
- Test report location: Vitest console output plus coverage summary
- Defect tracking link: GitLab issues in this repository
