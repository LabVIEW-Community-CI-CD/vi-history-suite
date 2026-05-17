# IAU Runtime Contract Runtime Facts

## State

`IAU-runtime-contract-runtime-facts-v1` is admitted for the MIT authority. Its
preflight records `status: pass`.

## Scope

- `T016`: add tests for supported host-native LabVIEWCLI runtime selection.
- `T017`: add tests for unsupported LabVIEW 2024-or-older rejection.
- `T018`: add tests for missing explicit proof override paths failing closed.
- `T019`: implement runtime discovery and readiness classification.
- `T020`: implement LabVIEWCLI command-plan creation.
- `T021`: implement report/proof rendering of retained runtime facts.

## Boundary

This IAU uses the public import packet and Spec Kit feature only. It admits
runtime discovery, readiness classification, command planning, and retained
runtime fact rendering. It does not admit command execution, Docker provider
behavior, proof intake validation, Marketplace publication, or source copying
from another product line.

## Preflight

`IAU-runtime-contract-runtime-facts-v1-preflight-v1` records `status: pass`.
Implementation may start for `T016` through `T021` only.

Tasks `T022` through `T030` remain blocked until this IAU merges.
