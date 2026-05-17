# MIT Spec Kit Runtime-Contract Implementation Admission

## Decision

The `runtime-contract-host-provider-v1` slice is admitted for the first MIT
clean-room implementation increment in `https://github.com/svelderrainruiz/vi-history`.

The completed foundation IAU is `IAU-runtime-contract-foundation-v1`, covering
tasks `T007` through `T011`.

The current admitted implementation unit is
`IAU-runtime-contract-explicit-compare-v1`, limited to tasks `T012` through
`T015`: selected/base commit retention tests, explicit-action tests,
clean-room compare-action state flow, and pre-execution fact rendering.
Its preflight records `status: pass`, so implementation may start for `T012`
through `T015` only.

## Bridge State

| State | Status |
| --- | --- |
| `candidate` | complete |
| `exported` | complete |
| `public-imported` | complete |
| `spec-locked` | complete |
| `preflight-required` | complete |
| `implementation-admitted` | complete |
| `implemented` | foundation IAU complete; explicit-compare IAU admitted |
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

- IAU: `IAU-runtime-contract-explicit-compare-v1`
- Preflight: `pass`; implementation may start for this IAU only.
- `T012`: commit-pair selection retains selected/base commit facts.
- `T013`: compare does not start before explicit user action.
- `T014`: clean-room compare-action state flow.
- `T015`: selected commit, base commit, provider, version, and bitness render
  before execution.

Tasks `T016` through `T030` remain blocked until the explicit-compare IAU
merges.
