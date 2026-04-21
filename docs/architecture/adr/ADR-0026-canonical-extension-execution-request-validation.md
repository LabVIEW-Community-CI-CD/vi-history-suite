# ADR-0026: Canonical Docker-Only Installed Execution-Request Validation

## Status

Superseded

- superseded by `ADR-0038` for the active develop-line installed-user
  execution request
- retained as the exact released `v1.2.2` Docker-only validation baseline

## Context

`ADR-0025` defined a Docker-only installed extension contract for the exact
released baseline, but that still needed one canonical admission boundary
before the extension claimed a provider was runnable.

Installed comparison execution can still become non-canonical if the extension
mixes partially validated facts such as:

- current host platform
- current Docker daemon engine
- governed Windows and Linux image references
- Docker CLI availability
- Docker daemon reachability
- image presence

That matters because Windows user machines can now validly run the product in
either Docker Windows-engine mode or Docker Linux-engine mode, while host
LabVIEW is intentionally outside the installed compare contract.

Without one canonical validation boundary, future sessions could keep refining
provider choice or image acquisition piecemeal while still allowing
contradictory or incomplete container-launch conditions to look like product
truth.

## Decision

Adopt canonical installed execution-request validation for the Docker-only
installed extension contract.

1. The installed extension shall resolve one canonical execution request before
   provider selection starts.
2. That request shall include:
   - current host platform
   - fixed installed compare bitness: `x64`
   - Docker CLI availability
   - Docker daemon reachability
   - current Docker daemon engine mode
   - governed Windows and Linux image references
   - presence or absence of the selected governed image
3. Provider selection and image acquisition shall validate that effective
   request rather than only raw settings in isolation.
4. On Windows:
   - Docker `windows` engine shall select the governed Windows container
     provider and Windows image
   - Docker `linux` engine shall select the governed Linux container provider
     and Linux image
5. The installed extension shall not probe host LabVIEW as part of this
   validation path.
6. If the effective request is non-canonical, the extension shall stop before
   acquisition or launch and surface the next corrective action.
7. There is no installed-execution bypass path around this validation
   boundary.

## Rationale

- Users need one truthful installed compare decision, not a chain of hidden
  container heuristics.
- The current Docker daemon engine is product truth on Windows because it
  determines which governed image can actually run.
- Keeping host-native execution out of the installed request prevents the
  extension from reintroducing ambient LabVIEW contamination through fallback
  logic.
- Keeping this decision separate from `ADR-0025` distinguishes user-facing
  operating policy from the admission rule that keeps that policy canonical.

## Consequences

### Positive

- future implementation work has one bounded validation surface before any
  provider action starts
- provider-selection UX can distinguish Windows-engine, Linux-engine, and
  hard-stop states without ambiguity
- the implementation can retain explicit Docker capability facts instead of
  reducing Docker truth to one generic installation check

### Negative

- the execution-policy package gains another explicit contract and more
  documentation upkeep
- future implementation must keep the Windows and Linux image contracts aligned
  with the actual Docker-engine selector

## Historical Implementation Note

The current repo now lands this contract in bounded slices rather than leaving
it as queued intent only:

- the installed runtime settings now constrain the extension to Docker-only x64
  execution
- on Windows, runtime selection validates Docker CLI availability, daemon
  reachability, and current Docker engine mode before deciding whether the
  governed Windows or governed Linux image is the canonical target
- visible image-pull progress and front-facing acquisition-state UX are now
  part of the active `PROGRAM-0005` package

## Historical Note

`ADR-0038` supersedes this ADR for the active develop-line installed-user
execution request.

This ADR remains authoritative only for the exact released Docker-only
validation baseline that shipped at `v1.2.2`.

## Implementation Surface

- `docs/product/extension-execution-policy.md`
- `docs/product/current-state.md`
- `docs/product/execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md`
- `docs/product/issues/ISSUE-0410-extension-execution-flexibility-and-runtime-acquisition-ux.md`
- `docs/architecture/adr/ADR-0027-public-github-facade-and-user-wiki-vs-internal-gitlab-control-plane.md`
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
