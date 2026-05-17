# IAU Runtime Contract Explicit Compare

## Decision

`IAU-runtime-contract-explicit-compare-v1` is admitted for the MIT authority.
It is the first user-story implementation unit after the foundation contracts.

## Scope

- `T012`: add tests for commit-pair selection retaining selected/base commit
  facts.
- `T013`: add tests proving compare does not start before explicit user action.
- `T014`: implement clean-room compare-action state flow.
- `T015`: render selected commit, base commit, provider, version, and bitness
  facts before execution.

## Boundary

The unit consumes the existing public import packet and Spec Kit feature only.
It does not permit source copying, private evidence import, Marketplace work, or
runtime-provider implementation beyond the explicit compare-action behavior.

## Preflight

`IAU-runtime-contract-explicit-compare-v1-preflight-v1` records `status:
pass`. Implementation may start for `T012` through `T015` only.

Tasks `T016` through `T030` remain blocked until this IAU merges.
