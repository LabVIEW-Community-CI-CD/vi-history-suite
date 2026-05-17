# MIT Spec Kit Runtime-Contract Implementation Admission

## Decision

The `runtime-contract-host-provider-v1` slice is admitted for the first MIT
clean-room implementation increment in `https://github.com/svelderrainruiz/vi-history`.

The completed foundation IAU is `IAU-runtime-contract-foundation-v1`, covering
tasks `T007` through `T011`.

The explicit-compare IAU is `IAU-runtime-contract-explicit-compare-v1`,
covering tasks `T012` through `T015`, and it is implemented in the MIT
authority.

The current admitted implementation unit is
`IAU-runtime-contract-runtime-facts-v1`, limited to tasks `T016` through
`T021`: host-native runtime selection tests, unsupported runtime rejection
tests, missing proof override path tests, runtime discovery/readiness
classification, LabVIEWCLI command-plan creation, and retained runtime fact
rendering. Its preflight records `status: pass`, so implementation may start
for `T016` through `T021` only.

## Bridge State

| State | Status |
| --- | --- |
| `candidate` | complete |
| `exported` | complete |
| `public-imported` | complete |
| `spec-locked` | complete |
| `preflight-required` | complete |
| `implementation-admitted` | complete |
| `implemented` | foundation and explicit-compare IAUs complete; runtime-facts IAU admitted |
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

- IAU: `IAU-runtime-contract-runtime-facts-v1`
- Preflight: `pass`; implementation may start for this IAU only.
- `T016`: supported host-native LabVIEWCLI runtime selection tests.
- `T017`: unsupported LabVIEW 2024-or-older rejection tests.
- `T018`: missing explicit proof override paths fail closed tests.
- `T019`: runtime discovery and readiness classification.
- `T020`: LabVIEWCLI command-plan creation.
- `T021`: report/proof rendering of retained runtime facts.

Tasks `T022` through `T030` remain blocked until the runtime-facts IAU merges.
