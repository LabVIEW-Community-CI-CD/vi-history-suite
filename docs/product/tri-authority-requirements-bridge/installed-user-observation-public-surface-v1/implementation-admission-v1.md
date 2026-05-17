# MIT Spec Kit Installed-User Observation Implementation Admission

## Decision

The `installed-user-observation-public-surface-v1` slice has completed one MIT
clean-room implementation increment in
`https://github.com/svelderrainruiz/vi-history`.

The implemented unit is `IAU-installed-user-observation-model-v1`, limited to
tasks `T009` through `T013`: observation-cycle data contract,
observation-fact classification contract, routing-decision and SemVer
recommendation contracts, bucket classification tests, and tests proving public
feedback remains input rather than release proof.

The preflight recorded `status: pass`. GitHub PR #29 merged the public MIT
implementation to `develop`, and GitHub Issue #27 is closed.

Work item #38 completes the oracle review with classification
`no-defect-candidate`.

## Bridge State

| State | Status |
| --- | --- |
| `candidate` | complete |
| `exported` | complete |
| `public-imported` | complete |
| `spec-locked` | complete |
| `preflight-required` | complete |
| `implementation-admitted` | complete for `IAU-installed-user-observation-model-v1` |
| `implemented` | complete for `IAU-installed-user-observation-model-v1` |
| `oracle-reviewed` | complete for `IAU-installed-user-observation-model-v1` |

## Admission Basis

- `VHS-REQ-595` is implemented and traced in the governed GitLab authority.
- The governed release line supports requirement maturity. It does not
  authorize source reuse in the MIT authority.
- MIT PR #26 merged the public import packet, Spec Kit feature, admission
  ledger, and repository validation coverage.
- The public feature already scopes `T009` through `T013` as the observation
  model candidate and keeps `T014` through `T016` blocked as a later reporting
  surface candidate.
- Spec Kit prerequisite checks resolve the feature directory and tasks.
- Public redaction and bridge artifact checks passed before admission.
- Marketplace publication remains disabled until a later governing decision.

## Completed IAU

- IAU: `IAU-installed-user-observation-model-v1`
- Preflight: `pass`.
- Closeout: `pass`; MIT PR #29 merged to `develop` at
  `d357776e232b67b79060c315882fb8a2cf5cbcfd`.
- Oracle review: `pass`; [oracle-review-v1.md](./oracle-review-v1.md)
  records `no-defect-candidate`.
- `T009`: define an observation-cycle data contract.
- `T010`: define an observation-fact classification contract.
- `T011`: define routing-decision and SemVer recommendation contracts.
- `T012`: add tests for `observed`, `deferred`, and `blocked` fact buckets.
- `T013`: add tests that public feedback is input, not release proof.

## Still Blocked

- `T014` through `T016`: observation report rendering and blocked-claim
  rendering.
- LabVIEWCLI command execution.
- Docker command execution or orchestration.
- Windows Docker Desktop Windows-container proof claims.
- Marketplace publication.
- Source copying from another product line.

## Successor Rule

No new public MIT branch starts from this IAU. The next public MIT
implementation requires a separate named IAU, public preflight, and bounded
handoff issue.

The selected next governed candidate is
`IAU-candidate-public-proof-status-oracle-v1` for bridge-readiness analysis,
not implementation.
