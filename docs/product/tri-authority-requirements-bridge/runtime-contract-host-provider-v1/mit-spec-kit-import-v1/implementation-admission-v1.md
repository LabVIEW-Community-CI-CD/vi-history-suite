# MIT Spec Kit Runtime-Contract Implementation Admission

## Decision

The `runtime-contract-host-provider-v1` slice is admitted for MIT clean-room
implementation increments in `https://github.com/svelderrainruiz/vi-history`.

The completed foundation IAU is `IAU-runtime-contract-foundation-v1`, covering
tasks `T007` through `T011`.

The explicit-compare IAU is `IAU-runtime-contract-explicit-compare-v1`,
covering tasks `T012` through `T015`, and it is implemented in the MIT
authority.

The runtime-facts IAU is `IAU-runtime-contract-runtime-facts-v1`, covering
tasks `T016` through `T021`, and it is implemented in the MIT authority.

The current admitted implementation unit is
`IAU-runtime-contract-proof-intake-v1`, limited to tasks `T026` through
`T030`: Linux host proof classification tests, evidence-class rejection tests,
`vihs validate-fixture` proof JSON and issue-body tests, proof packet writer
and issue-body generation, and Windows Docker Desktop proof intake validation.
Its preflight records `status: pass`, so implementation may start for `T026`
through `T030` only.

## Bridge State

| State | Status |
| --- | --- |
| `candidate` | complete |
| `exported` | complete |
| `public-imported` | complete |
| `spec-locked` | complete |
| `preflight-required` | complete |
| `implementation-admitted` | complete |
| `implemented` | foundation, explicit-compare, runtime-facts, and provider-policy IAUs complete; proof-intake IAU admitted |
| `oracle-reviewed` | pending |

## Admission Basis

- The governed GitLab extension release supports requirement maturity.
- That release does not authorize source reuse in the MIT authority.
- The MIT target receives public requirements, public Spec Kit artifacts, and
  clean-room implementation tasks only.
- Public redaction and bridge artifact checks passed before admission.
- Marketplace publication remains disabled until a later governing decision.

## Completed IAU

- `T007`: runtime selection data contract.
- `T008`: LabVIEWCLI `CreateComparisonReport` command-plan contract.
- `T009`: proof packet contract.
- `T010`: provider policy contract.
- `T011`: traceability tests from implementation contracts to imported RTM IDs.

## Current IAU

- IAU: `IAU-runtime-contract-proof-intake-v1`
- Preflight: `pass`; implementation may start for this IAU only.
- `T026`: Linux host LabVIEW proof classification tests.
- `T027`: evidence-class substitution rejection tests.
- `T028`: `vihs validate-fixture` proof JSON and issue-body generation tests.
- `T029`: proof packet writer and issue-body generation.
- `T030`: Windows Docker Desktop proof intake validation.

LabVIEWCLI command execution, Docker command execution or container
orchestration, Marketplace publication, and source copying remain blocked.
