# IAU Runtime Contract Runtime Facts

## State

`IAU-runtime-contract-runtime-facts-v1` is implemented for the MIT authority.
Its preflight records `status: pass`.

## Scope

- `T016`: add tests for supported host-native LabVIEWCLI runtime selection.
- `T017`: add tests for unsupported LabVIEW 2024-or-older rejection.
- `T018`: add tests for missing explicit proof override paths failing closed.
- `T019`: implement runtime discovery and readiness classification.
- `T020`: implement LabVIEWCLI command-plan creation.
- `T021`: implement report/proof rendering of retained runtime facts.

## Boundary

This IAU used the public import packet and Spec Kit feature only. It admitted
runtime discovery, readiness classification, command planning, and retained
runtime fact rendering. It did not admit command execution, provider-policy
implementation, proof intake validation, Marketplace publication, or source
copying from another product line.

## Preflight

`IAU-runtime-contract-runtime-facts-v1-preflight-v1` records `status: pass`.
Implementation completed through PR #15 and merge commit
`ee0e3a057f9ae778be46036fff7b6639e861b53c`.

Tasks `T022` through `T025` are now handled by
`IAU-runtime-contract-provider-policy-v1`. Tasks `T026` through `T030` remain
blocked until separately admitted.
