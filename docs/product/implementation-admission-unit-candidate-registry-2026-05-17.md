# Implementation Admission Unit Candidate Registry

Recorded: `2026-05-17T13:28:45Z`

Updated: `2026-05-17T19:46:38Z`

Last reviewed: `2026-05-17T20:18:55Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/33`

Spec-lock closeout work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/35`

Observation-model admission work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/36`

Observation-model implementation closeout work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/37`

Observation-model oracle review work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/38`

Public proof-status oracle readiness work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/39`

Machine-readable packet:
[implementation-admission-unit-candidate-registry-2026-05-17.json](./implementation-admission-unit-candidate-registry-2026-05-17.json)

## Purpose

This registry turns "what is next?" into a governed product-family control
surface. It does not admit implementation. It ranks candidate Implementation
Admission Units (IAUs) so the next public MIT clean-room unit is selected from
evidence, redaction risk, environment dependency, and product value instead of
session momentum.

The registry extends the tri-authority model:

- GitLab remains the governed authority for requirements, private evidence,
  release truth, and bridge admission.
- GitHub `vi-history-suite` remains the public Marketplace-continuity
  authority and user-feedback surface.
- GitHub MIT `vi-history` remains idle for code until a named IAU has a
  passing bridge preflight.

## Candidate States

| State | Meaning |
| --- | --- |
| `observed` | A potential unit exists in requirements, evidence, public feedback, or release truth, but it is not yet shaped as an IAU. |
| `candidate` | The unit has enough governed intent to evaluate for bridge readiness. |
| `bridge-ready` | Requirement IDs, public-safe wording, traceability, blocked scope, and expected public packet shape are known. |
| `public-imported` | A sanitized import packet exists in the public target repo. |
| `spec-locked` | Public Spec Kit `spec.md`, `plan.md`, and `tasks.md` are committed and internally consistent. |
| `implementation-admitted` | Redaction, artifact, traceability, analyze, and IAU preflight checks pass. |
| `implemented` | The clean-room implementation and tests have merged in the public target repo. |
| `oracle-reviewed` | Behavior has been compared across authorities and classified. |
| `blocked` | The unit cannot progress until an external environment, proof, decision, or requirement clarification exists. |

Only `implementation-admitted` can start MIT code. All other states are
governance, requirements, bridge, or proof work.

## Scoring Model

Each candidate receives a 0-100 `admissionPriorityScore`:

| Criterion | Weight | Question |
| --- | ---: | --- |
| requirement maturity | 20 | Are stable governed IDs, acceptance behavior, and tests already present? |
| public-safety | 20 | Can the unit be exported without private paths, private evidence, source-copying, or internal tooling references? |
| implementation value | 20 | Does the unit materially improve the MIT authority as an independent product or verification engine? |
| environment independence | 15 | Can the unit progress on normal hosted/local developer machines? |
| clean-room safety | 15 | Can it be implemented from public Spec Kit artifacts without needing inherited source knowledge? |
| oracle value | 10 | Does it improve cross-authority defect classification? |

Higher scores should be considered first. A high score still does not admit
code; it only chooses the next bridge-readiness target.

## Current Ranked Candidates

| Rank | Candidate | State | Score | Direction |
| ---: | --- | --- | ---: | --- |
| 1 | `IAU-candidate-installed-user-observation-public-surface-v1` | `oracle-reviewed` | 88 | `IAU-installed-user-observation-model-v1` completed T009-T013 and oracle review found `no-defect-candidate`; no new implementation starts from this candidate. |
| 2 | `IAU-candidate-public-proof-status-oracle-v1` | `oracle-reviewed` | 79 | Closed through the existing `runtime-contract-host-provider-v1` import and proof-intake IAU; no duplicate import or new implementation IAU. |
| 3 | `IAU-candidate-command-activation-surface-v1` | `observed` | 71 | Selected next for bridge-readiness decision: decide whether MIT should expose an extension package surface next. |
| 4 | `IAU-candidate-labviewcli-execution-boundary-v1` | `observed` | 62 | Requires a new execution-safety bridge packet before command execution can be opened. |
| 5 | `IAU-candidate-windows-docker-desktop-proof-oracle-v1` | `blocked` | 47 | Blocked on real Windows Docker Desktop Windows-container proof under public issue #65. |
| 6 | `IAU-candidate-mit-marketplace-posture-v1` | `blocked` | 35 | Marketplace remains disabled until a later ADR admits publication. |

## Closed Candidate

`IAU-candidate-installed-user-observation-public-surface-v1` is closed for the
first admitted unit:
`IAU-installed-user-observation-model-v1`.

The bridge found `no-defect-candidate` in
[oracle-review-v1.md](./tri-authority-requirements-bridge/installed-user-observation-public-surface-v1/oracle-review-v1.md).
The governed requirement, public Spec Kit feature, and MIT implementation agree
for `T009` through `T013`.

Bridge-readiness was recorded in:

- [bridge-readiness-v1.md](./tri-authority-requirements-bridge/installed-user-observation-public-surface-v1/bridge-readiness-v1.md)
- [bridge-readiness-v1.json](./tri-authority-requirements-bridge/installed-user-observation-public-surface-v1/bridge-readiness-v1.json)

Spec-lock closeout:

- MIT issue #25 `https://github.com/svelderrainruiz/vi-history/issues/25`
  was closed after the import/spec merge.
- MIT PR #26 `https://github.com/svelderrainruiz/vi-history/pull/26`
  merged into `develop` on `2026-05-17`.
- MIT merge commit
  `e0fe22daf80c8300b2543300d9af4547c04e1220` is the public
  `spec-locked` baseline.
- MIT `spec-gates` run
  `https://github.com/svelderrainruiz/vi-history/actions/runs/25993723704`
  passed on `develop`.
- No implementation was admitted by the spec-lock transition itself.
  Implementation admission came later through work item #36 for the named
  observation-model IAU only.

Implementation admission was recorded in:

- [implementation-admission-v1.md](./tri-authority-requirements-bridge/installed-user-observation-public-surface-v1/implementation-admission-v1.md)
- [implementation-admission-v1.json](./tri-authority-requirements-bridge/installed-user-observation-public-surface-v1/implementation-admission-v1.json)
- [IAU-installed-user-observation-model-v1.md](./tri-authority-requirements-bridge/installed-user-observation-public-surface-v1/implementation-admissions/IAU-installed-user-observation-model-v1.md)
- [IAU-installed-user-observation-model-v1-preflight-v1.md](./tri-authority-requirements-bridge/installed-user-observation-public-surface-v1/implementation-admissions/IAU-installed-user-observation-model-v1-preflight-v1.md)
- [IAU-installed-user-observation-model-v1-closeout-v1.md](./tri-authority-requirements-bridge/installed-user-observation-public-surface-v1/implementation-admissions/IAU-installed-user-observation-model-v1-closeout-v1.md)

The admitted IAU answers:

- Which governed requirement IDs are exported?
- What public-safe fact buckets are allowed?
- What public issue or report fields are retained?
- What remains explicitly blocked?
- What Spec Kit feature owns the public behavior?
- What exact IAU becomes admissible after preflight?

Admitted task scope:

- `T009`: observation-cycle data contract.
- `T010`: observation-fact classification contract.
- `T011`: routing-decision and SemVer recommendation contracts.
- `T012`: tests for `observed`, `deferred`, and `blocked` fact buckets.
- `T013`: tests proving public feedback is input, not release proof.

Implementation closeout:

- MIT issue #27 `https://github.com/svelderrainruiz/vi-history/issues/27`
  is closed.
- MIT PR #29 `https://github.com/svelderrainruiz/vi-history/pull/29`
  merged into `develop` on `2026-05-17`.
- MIT merge commit
  `d357776e232b67b79060c315882fb8a2cf5cbcfd` is the implemented baseline.
- MIT `spec-gates` run
  `https://github.com/svelderrainruiz/vi-history/actions/runs/25995657329`
  passed on `develop`.

Oracle review:

- GitLab work item #38
  `https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/38`
  records the oracle review.
- [oracle-review-v1.md](./tri-authority-requirements-bridge/installed-user-observation-public-surface-v1/oracle-review-v1.md)
  classifies the implemented behavior as `no-defect-candidate`.

## Recommended Next Candidate

The selected next candidate is
`IAU-candidate-command-activation-surface-v1`.

Rationale:

- It is the highest-scored remaining non-blocked candidate.
- The public proof-status candidate is now closed through existing
  runtime-contract proof-intake coverage and oracle review.
- It is backed by `VHS-REQ-594`.
- It can decide whether the MIT authority should expose command activation and
  package-surface metadata without admitting Marketplace publication,
  execution behavior, or source promotion.

## Public Proof-Status Oracle Closeout

Work item #39 reviewed `IAU-candidate-public-proof-status-oracle-v1` and
decided not to create a duplicate public import. The existing
`runtime-contract-host-provider-v1` import already covers `VHS-REQ-588`,
`VHS-REQ-589`, and `VHS-REQ-590`, and MIT PR #19 implemented
`IAU-runtime-contract-proof-intake-v1`.

Records:

- [public-proof-status-oracle-v1/bridge-readiness-v1.md](./tri-authority-requirements-bridge/public-proof-status-oracle-v1/bridge-readiness-v1.md)
- [runtime-contract oracle-review-v1.md](./tri-authority-requirements-bridge/runtime-contract-host-provider-v1/mit-spec-kit-import-v1/oracle-review-v1.md)

## Current Non-Admitted Boundaries

- No MIT implementation outside a newly admitted successor IAU starts from this
  registry.
- No Copilot handoff starts until a new MIT public admission packet and handoff
  issue mirror a governed packet.
- No reporting-surface work starts; `T014` through `T016` remain blocked.
- No LabVIEWCLI command execution is admitted.
- No Docker command execution or container orchestration is admitted.
- No Windows Docker Desktop Windows-container proof claim is admitted without
  real Windows Docker Desktop evidence.
- No Marketplace behavior is admitted for MIT `vi-history`.

## Next Governed Action

The selected next action is `bridge-readiness-decision` for
`IAU-candidate-command-activation-surface-v1`. This action does not admit
implementation. It should decide whether MIT needs an extension package command
activation surface next, and if so what public import/spec scope can be
prepared without opening Marketplace publication or execution behavior.

## Governance Loop

1. Re-score the registry after each portfolio operating cycle, public feedback
   signal, proof-lane change, or release decision.
2. Promote at most one candidate at a time to bridge-readiness analysis unless
   candidates are independent and non-overlapping.
3. Use `spec-kit-authority-bridge` to export/import only after the candidate has
   stable requirement intent and public-safe wording.
4. Admit implementation only after the public import packet, Spec Kit feature,
   analyze gate, artifact validation, redaction validation, and IAU preflight
   pass.
5. After implementation, run the cross-authority bug oracle and update the
   registry state.

## Validation

This registry should be validated with:

- `npm run docs:gate:core`
- `npm run docs:ci:core`
- `python3 /home/sergio/repos/gl/repo-standards-review/scripts/requirements_quality_check.py . --json`
- `python3 /home/sergio/repos/gl/repo-standards-review/scripts/external_user_information_check.py . --json`
- `git diff --check`
