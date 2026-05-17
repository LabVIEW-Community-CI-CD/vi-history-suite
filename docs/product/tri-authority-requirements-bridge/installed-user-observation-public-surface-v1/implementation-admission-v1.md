# MIT Spec Kit Installed-User Observation Implementation Admission

## Decision

The `installed-user-observation-public-surface-v1` slice is admitted for one
MIT clean-room implementation increment in
`https://github.com/svelderrainruiz/vi-history`.

The admitted unit is `IAU-installed-user-observation-model-v1`, limited to
tasks `T009` through `T013`: observation-cycle data contract,
observation-fact classification contract, routing-decision and SemVer
recommendation contracts, bucket classification tests, and tests proving public
feedback remains input rather than release proof.

The preflight records `status: pass`. Implementation may start only for
`T009` through `T013` after the MIT public admission records and handoff issue
are created from this governed packet.

## Bridge State

| State | Status |
| --- | --- |
| `candidate` | complete |
| `exported` | complete |
| `public-imported` | complete |
| `spec-locked` | complete |
| `preflight-required` | complete |
| `implementation-admitted` | complete for `IAU-installed-user-observation-model-v1` |
| `implemented` | pending |
| `oracle-reviewed` | pending |

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

## Current IAU

- IAU: `IAU-installed-user-observation-model-v1`
- Preflight: `pass`; implementation may start for this IAU only after the MIT
  public admission packet is committed.
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

## Handoff Rule

The next public MIT branch may add admission/preflight records and a bounded
handoff issue for `IAU-installed-user-observation-model-v1`. Copilot or human
implementation starts only from that public packet, targets `develop`, and
stays within `T009` through `T013`.
