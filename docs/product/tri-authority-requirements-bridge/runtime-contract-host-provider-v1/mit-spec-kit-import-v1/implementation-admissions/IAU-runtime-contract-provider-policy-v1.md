# IAU-runtime-contract-provider-policy-v1

`IAU-runtime-contract-provider-policy-v1` is implemented for the MIT authority.
Its implementation scope was limited to tasks `T022` through `T025`:

- `T022`: add tests for host-native default provider selection.
- `T023`: add tests for explicit Docker expert-provider selection.
- `T024`: add tests that Docker is never selected implicitly.
- `T025`: implement provider policy selection and failure guidance.

## Admission Boundary

This IAU admitted provider policy selection only. It did not admit LabVIEWCLI
command execution, Docker command execution or container orchestration, proof
packet writing, proof intake validation, Windows Docker Desktop proof
classification, Marketplace publication, or source copying from any other
VI History authority.

## Preflight

`IAU-runtime-contract-provider-policy-v1-preflight-v1` records `status: pass`.
Implementation completed through PR #17 and merge commit
`28f3ae6042758b6edf99e44fa619cfa7333f0b8d`.

Tasks `T026` through `T030` are now handled by
`IAU-runtime-contract-proof-intake-v1`.
