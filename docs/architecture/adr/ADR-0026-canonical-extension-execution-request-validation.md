# ADR-0026: Canonical Extension Execution-Request Validation

## Status

Accepted

## Context

`ADR-0025` defines the future user-facing execution contract for the installed
extension, but transparency alone is not enough.

Provider selection can still become non-canonical if the extension chooses a
runtime from a partially validated blend of:

- `executionMode`
- `preferBitness`
- explicit host runtime path settings
- configured container image
- detected host-runtime facts
- detected Docker capability facts

That matters because Windows execution truth is sensitive to ambient state:

- an already-open LabVIEW 2026 host session can contaminate host-native launch
- multiple installed LabVIEW versions can point at different `LabVIEW.ini`
  files and VI Server ports
- Docker may be installed but unavailable, stopped, or in the wrong container
  mode for the governed Windows image

Without one canonical execution-request validation boundary, future sessions
could keep refining provider choice, image acquisition, or hard-stop behavior
piecemeal while still allowing contradictory or partially inferred launch
conditions to look like product truth.

## Decision

Adopt canonical effective execution-request validation for the future installed
extension execution policy.

1. The extension shall resolve one effective execution request before provider
   selection starts.
2. That effective request shall include:
   - selected execution mode
   - preferred bitness
   - explicit host runtime path settings
   - configured container-image reference
   - selected host-runtime facts, including the governing `LabVIEW.ini`
     surface and derived VI Server TCP port
   - Docker capability facts, including daemon availability and Windows container capability on Windows hosts
3. Provider selection and image acquisition shall validate that effective
   request rather than only raw settings in isolation.
4. `auto` mode shall prefer clean compatible host-native execution and shall
   only require Docker when the validated host surface is contaminated or
   incompatible.
5. `host-only` and `docker-only` shall fail closed when the validated effective
   request cannot run truthfully; they shall not silently substitute the other
   provider.
6. On Windows, Docker-backed execution shall validate Windows container capability before image pull or container launch.
7. Host-runtime conflict detection shall derive the governed VI Server port
   from the selected `LabVIEW.ini` surface rather than a hard-coded default.
8. If the effective execution request is non-canonical, the extension shall
   stop before launch or acquisition and surface the next corrective action.

## Rationale

- Users need one truthful execution decision, not a chain of hidden provider
  inferences.
- A canonical request boundary prevents future experiments and support sessions
  from contaminating retained evidence through ambient host state.
- Windows Docker capability is not binary; installed Docker is not sufficient
  when the daemon is unavailable or not in Windows-container mode.
- Keeping this decision separate from `ADR-0025` distinguishes user-facing
  operating policy from the admission rule that keeps that policy canonical.

## Consequences

### Positive

- future implementation work has one bounded validation surface before any
  provider action starts
- Windows host and Docker diagnostics become easier to explain because the
  chosen request shape is explicit
- provider-selection UX can distinguish clean host execution, Docker-required
  execution, and hard-stop states without ambiguity
- the current implementation can retain specific Windows Docker capability
  facts such as CLI availability, daemon reachability, active container mode,
  and governed image presence instead of reducing Docker truth to one image
  check

### Negative

- the execution-policy package gains another explicit contract and more
  documentation upkeep
- future implementation will need to model Docker capability and selected host
  runtime facts more explicitly than today

## Current Implementation Note

The current repo now lands this contract in bounded slices rather than leaving
it as queued intent only:

- the selector already derives the selected `LabVIEW.ini` surface and governed
  VI Server TCP port before final Windows provider choice
- the selector now also validates Docker CLI availability, daemon
  reachability, active container mode, and governed image presence before the
  Windows Docker provider is selected or rejected
- visible image-pull progress and fuller front-facing acquisition-state UX
  remain open follow-on work under `PROGRAM-0005`

## Implementation Surface

- `docs/product/extension-execution-policy.md`
- `docs/product/current-state.md`
- `docs/product/execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md`
- `docs/product/issues/ISSUE-0410-extension-execution-flexibility-and-runtime-acquisition-ux.md`
- `docs/product/debt-ledger.json`
- `docs/product/debt-ledger.md`
- `docs/architecture/overview.md`
- `README.md`
- `docs/information-item-map.md`
- `docs/requirements/srs.md`
- `docs/requirements/rtm.csv`
- `docs/testing/test-plan.md`
- `tests/unit/executionPolicyDocs.test.ts`
- `src/reporting/comparisonRuntimeLocator.ts`
- `src/reporting/comparisonRuntimeDoctor.ts`
- `src/reporting/comparisonReportAction.ts`
- `src/ui/historyPanel.ts`
