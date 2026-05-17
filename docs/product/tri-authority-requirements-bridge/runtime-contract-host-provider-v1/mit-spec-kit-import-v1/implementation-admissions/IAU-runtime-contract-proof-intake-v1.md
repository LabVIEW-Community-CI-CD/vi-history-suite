# IAU-runtime-contract-proof-intake-v1

`IAU-runtime-contract-proof-intake-v1` is admitted for the MIT authority. Its
implementation scope is limited to tasks `T026` through `T030`:

- `T026`: add tests for Linux host LabVIEW proof classification.
- `T027`: add tests rejecting Linux Docker, WSL, host-provider proof, or reports
  without proof packets as Windows Docker Desktop proof.
- `T028`: add tests for `vihs validate-fixture` proof JSON and issue-body
  generation.
- `T029`: implement proof packet writer and issue-body generation.
- `T030`: implement Windows Docker Desktop proof intake validation.

## Admission Boundary

This IAU admits proof packet writing and proof intake validation only. It does
not admit LabVIEWCLI command execution, Docker command execution or container
orchestration, Marketplace publication, or source copying from any other
VI History authority.

## Preflight

`IAU-runtime-contract-proof-intake-v1-preflight-v1` records `status: pass`.
Implementation may start for `T026` through `T030` only.
