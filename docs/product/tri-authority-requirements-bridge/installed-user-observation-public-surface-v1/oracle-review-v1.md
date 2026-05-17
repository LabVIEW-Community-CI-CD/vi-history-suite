# Installed-User Observation Oracle Review

Recorded: `2026-05-17T19:46:38Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/38`

Machine-readable packet:
[oracle-review-v1.json](./oracle-review-v1.json)

## Decision

`IAU-installed-user-observation-model-v1` is **oracle-reviewed**.

The governed GitLab requirement, the public GitHub Suite feedback signal, the
public MIT Spec Kit feature, and the MIT clean-room implementation agree for
the admitted `T009` through `T013` scope. The bridge records
`no-defect-candidate`.

No requirement-defect candidate, implementation-defect candidate, or
requirement-clarification candidate was found for the admitted observation
model behavior.

## Scope Reviewed

- `T009`: observation-cycle data contract.
- `T010`: observation-fact classification contract.
- `T011`: routing-decision and SemVer recommendation contracts.
- `T012`: tests for `observed`, `deferred`, and `blocked` fact buckets.
- `T013`: tests proving public feedback is input, not release proof.

## Evidence

| Authority | Evidence |
| --- | --- |
| GitLab governed | `VHS-REQ-595`, the installed-user observation cadence packet, sustainment rules, SRS, RTM, test plan, bridge readiness, admission, preflight, and closeout records |
| GitHub Suite continuity | `https://github.com/svelderrainruiz/vi-history-suite/issues/98` as public feedback input, not release proof |
| GitHub MIT Spec Kit | MIT issue #27, PR #29, merge commit `d357776e232b67b79060c315882fb8a2cf5cbcfd`, and passing `spec-gates` run `25995657329` |

## Oracle Findings

| Topic | Classification | Result |
| --- | --- | --- |
| Observation-cycle trigger contract | `consistent` | MIT retains due reasons, public feedback IDs, no-later-than review, requirement IDs, and `releaseProofAccepted=false`. |
| Observation fact buckets | `consistent` | MIT accepts only `observed`, `deferred`, and `blocked`, and preserves observation-input status. |
| Public feedback as input only | `consistent` | MIT treats feedback as observation input and rejects it as release proof. |
| Routing and SemVer recommendation | `consistent` | MIT routes confusion/documentation cases and defaults sustainment-only unless a published update is required. |
| Blocked behavior boundary | `consistent-blocked` | MIT did not add report rendering, command execution, Docker orchestration, proof promotion, Marketplace behavior, or source copying. |

## Bug Oracle Classification

- Overall: `no-defect-candidate`.
- Same wrong behavior across authorities:
  none observed.
- One-authority wrong behavior:
  none observed.
- Ambiguous admitted behavior:
  none observed.

`T014` through `T016` remain blocked successor scope. Their absence is not a
requirement clarification because the admitted IAU explicitly stopped at
`T013`.

## Next Governed Action

The selected next candidate is
`IAU-candidate-public-proof-status-oracle-v1`, with action
`bridge-readiness-analysis`.

No implementation is admitted. The next candidate must still pass bridge
readiness, public import/spec work, redaction checks, artifact validation, and
IAU preflight before any MIT implementation handoff starts.
