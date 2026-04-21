# ADR-0038: Host-Default Local LabVIEWCLI, Bounded Expert Docker, And Explicit Compare Preflight

## Status

Accepted

## Context

The exact released installed extension baseline at `v1.2.2` is still
Docker-only, and `ADR-0025` plus `ADR-0026` retain that historical truth.

The active develop-line control plane has moved materially beyond that
baseline:

- installed compare now defaults to Windows local `LabVIEWCLI`
- Docker remains available only as a bounded expert provider persisted through
  the generated settings CLI
- installed users must select LabVIEW version and bitness explicitly
- compare generation must no longer start automatically when a second commit
  is selected
- the panel must expose one factual compare-preflight state before execution
  begins

Without one active ADR for that replacement direction, the architecture
package would keep forcing readers to treat the historical Docker-only
baseline as live installed-user doctrine even while the code, control plane,
and requirement package have moved.

## Decision

Adopt this active develop-line installed-user execution contract:

1. Host is the default installed compare provider through Windows local
   `LabVIEWCLI`.
2. Docker remains admitted only as a bounded expert provider selected through
   the generated settings CLI.
3. The installed-user manifest and panel shall not expose:
   - a general provider picker
   - `executionMode`
   - host-runtime path overrides
   - direct executable-path picking
   - Docker image-family picking
4. Both `viHistorySuite.labviewVersion` and
   `viHistorySuite.labviewBitness` remain required across both provider
   classes.
5. Installed compare shall resolve one canonical execution request from:
   - selected provider
   - selected LabVIEW version
   - selected LabVIEW bitness
   - local Windows LabVIEW plus `LabVIEWCLI` discovery when host is selected
   - current Docker engine facts and governed image-family derivation when
     Docker is selected
6. There is no silent fallback between host and Docker provider classes.
7. The history-panel compare workflow shall enter explicit compare preflight
   when two commits are selected and shall not start compare automatically.
8. Compare preflight shall show:
   - selected commit
   - base commit
   - provider
   - LabVIEW version
   - LabVIEW bitness
9. Compare generation shall stay blocked until compare preflight is ready, and
   the product shall emit one explicit VS Code warning when provider/runtime
   preflight is not canonical.
10. `ADR-0025` and `ADR-0026` remain retained as the exact released
    `v1.2.2` Docker-only baseline. They are not the active develop-line
    installed-user doctrine.

## Consequences

Positive:

- the architecture package now matches the active develop-line control plane
- the historical Docker-only release baseline remains explicit instead of
  being erased
- installed-user compare now has one clear review boundary before execution

Costs:

- the repo now has to retain both historical release doctrine and active
  develop-line doctrine honestly
- future slices must keep the provider-selection, runtime-preflight, and
  compare-preflight surfaces aligned instead of updating them independently

## Follow-On

- keep `docs/architecture/overview.md` aligned to this ADR as the active
  installed-user architecture truth
- keep `docs/product/extension-execution-policy.md` explicit about the split
  between historical release baseline and active develop-line doctrine
- keep `SRS`, `RTM`, and `test-plan` rows aligned to this ADR for the active
  replacement direction
- retain `ADR-0025` and `ADR-0026` only as historical exact-release context
