# ADR-0025: Docker-Only Installed Extension Execution And Engine-Aware Container Acquisition

## Status

Accepted

## Context

The earlier execution-flexibility direction solved one problem but created a
broader product one: installed extension users still had to reason about
host-native versus Docker behavior, ambient LabVIEW state, and multiple mode
knobs even though the main goal is simply "pick two commits and generate a VI
comparison report."

That is now the wrong contract for the installed extension.

The product direction has changed materially:

- Docker is now a dependency of the installed extension compare workflow
- installed users should not need host-runtime path settings or provider-mode
  choices
- installed compare generation should not compete with an already-open host
  LabVIEW session
- some Windows users can run only Linux containers, while others can run
  Windows containers, so the current Docker daemon engine must decide which
  governed image is selected
- host-native proof and diagnosis still matter, but they belong on governed
  maintainer proof surfaces rather than in the installed extension contract

## Decision

Adopt a Docker-only installed extension execution contract.

1. The installed extension shall depend on Docker for comparison generation.
2. The installed extension shall no longer expose:
   - `executionMode`
   - host-native runtime path overrides
   - a user-facing bitness selector
3. Installed comparison generation shall constrain to x64 container execution.
4. On Windows, the extension shall select its governed container provider from
   the current Docker daemon engine:
   - `windows` engine selects the governed Windows image
   - `linux` engine selects the governed Linux image
5. If Docker CLI is missing, the daemon is unreachable, or the current engine
   cannot satisfy the governed request, the installed extension shall fail
   closed and shall not probe host LabVIEW as fallback.
6. If the selected governed image is absent locally, the extension shall
   acquire that exact image through a visible progress surface before runtime
   launch.
7. Runtime doctor and front-facing execution feedback shall surface:
   - selected provider
   - current Docker daemon engine
   - selected governed image
   - acquisition outcome
   - next action
8. Host-native LabVIEW remains a governed maintainer proof surface only. It is
   not part of the installed extension compare contract.
9. `ADR-0006` remains historical context for why isolation matters, but this
   ADR supersedes it as the primary installed extension execution-policy
   decision.
10. Canonical validation of the installed request for this Docker-only policy
    is governed by `ADR-0026`.

## Rationale

- Installed users care about deterministic compare generation, not provider
  mode management.
- Removing host-native selection from the installed extension stops ambient
  host LabVIEW sessions from competing with the extension workflow.
- The current Docker daemon engine is real product truth on Windows because it
  determines which governed image can actually run on that machine.
- Visible image acquisition is part of the usability contract, not a hidden
  implementation detail.
- Separating installed extension policy from maintainer proof surfaces keeps
  host diagnosis available without forcing that complexity onto extension users.

## Consequences

### Positive

- installed compare behavior becomes simpler and more deterministic
- the extension stops competing with ambient host LabVIEW sessions
- Windows users can still run the product under either Docker engine as long as
  the governed matching image can be acquired
- user-facing docs can focus on the compare workflow rather than provider-mode
  decision trees

### Negative

- Docker becomes a hard dependency of the installed extension workflow
- the product must maintain both governed Windows and governed Linux images for
  installed-user execution
- public and internal docs must now stay aligned around a stronger audience
  split

## Implementation Surface

- `docs/product/extension-execution-policy.md`
- `docs/product/development-queue.json`
- `docs/product/current-state.md`
- `docs/product/execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md`
- `docs/product/issues/ISSUE-0410-extension-execution-flexibility-and-runtime-acquisition-ux.md`
- `docs/architecture/adr/ADR-0027-public-github-facade-and-user-wiki-vs-internal-gitlab-control-plane.md`
- `docs/product/debt-ledger.json`
- `docs/product/debt-ledger.md`
- `docs/architecture/overview.md`
- `README.md`
- `docs/requirements/srs.md`
- `docs/requirements/rtm.csv`
- `docs/testing/test-plan.md`
- `package.json`
- `src/reporting/comparisonRuntimeLocator.ts`
- `src/reporting/comparisonRuntimeDoctor.ts`
- `src/reporting/comparisonReportAction.ts`
- `src/ui/historyPanel.ts`
