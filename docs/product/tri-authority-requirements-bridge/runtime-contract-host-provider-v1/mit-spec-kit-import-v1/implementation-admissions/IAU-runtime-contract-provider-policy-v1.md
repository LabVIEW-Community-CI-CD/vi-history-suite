# IAU-runtime-contract-provider-policy-v1

`IAU-runtime-contract-provider-policy-v1` is admitted for the MIT authority.
Its implementation scope is limited to tasks `T022` through `T025`:

- `T022`: add tests for host-native default provider selection.
- `T023`: add tests for explicit Docker expert-provider selection.
- `T024`: add tests that Docker is never selected implicitly.
- `T025`: implement provider policy selection and failure guidance.

## Admission Boundary

This IAU admits provider policy selection only. It does not admit LabVIEWCLI
command execution, Docker command execution or container orchestration, proof
packet writing, proof intake validation, Windows Docker Desktop proof
classification, Marketplace publication, or source copying from any other
VI History authority.

## Preflight

`IAU-runtime-contract-provider-policy-v1-preflight-v1` records `status: pass`.
Implementation may start for `T022` through `T025` only.

Tasks `T026` through `T030` remain blocked until this IAU merges.
