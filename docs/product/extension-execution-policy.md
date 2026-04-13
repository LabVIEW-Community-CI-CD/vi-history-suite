# Extension Execution Policy

## Purpose

Define the governed installed-extension execution contract for comparison
generation.

This document exists so future sessions do not reconstruct installed runtime
behavior from scattered code, benchmark scripts, or prior chat.

## Current Implemented Posture

The active installed-extension settings surface now exposes only these
runtime-related settings:

- `viHistorySuite.labviewVersion`
- `viHistorySuite.labviewBitness`

Current develop-line implementation truth is:

- installed-user runtime selection is now anchored to Windows local
  `LabVIEWCLI` rather than public Docker settings
- the extension manifest no longer exposes Docker image settings on the
  installed-user surface
- the installed-user surface still does not expose `executionMode`,
  host-runtime path overrides, or direct executable-path picking
- both version and bitness remain required by contract even though the later
  runtime-preflight and explicit-compare slices are still landing
- execution-policy bypass is not allowed: no hidden flag, experimental switch,
  or alternate compare path may skip canonical installed-request validation

## Exact Released Historical Baseline

The exact released installed extension at `v1.2.2` remains a separate
historical baseline:

- comparison generation is Docker-only in the released installed extension
- the released package depends on Docker CLI plus a reachable Docker daemon
- Windows selects the governed Windows or Linux image from the current Docker
  daemon engine
- first-use acquisition, missing-Docker guidance, and Docker-only hard stops
  remain truthful for that released line

This document keeps that baseline explicit so future sessions do not confuse
the historical release contract with the current develop-line replacement
direction.

## Active Control-Plane Direction

The active installed-user direction is no longer “keep Docker-only installed
compare execution.”

Under `PROGRAM-0005` / `ISSUE-0412` / `TRANCHE-016`, the installed-user
contract is:

- Windows local `LabVIEWCLI` instead of Docker
- settings-only LabVIEW selection through:
  - `viHistorySuite.labviewVersion`
  - `viHistorySuite.labviewBitness`
- optional settings seeding through a generated cross-platform CLI launcher
  under user-profile storage
- both settings are required by contract
- path discovery remains internal rather than user-facing
- compare does not auto-run when the second commit is selected
- the panel must show selected/base commit plus version and bitness before the
  compare action is allowed to start
- unresolved runtime selection must block compare in the panel and emit a VS
  Code warning notification
- Docker remains internal-only rather than part of the installed-user compare
  contract

The manifest/settings slice has landed. Runtime-resolution gating, explicit
compare preflight, and warning behavior remain active follow-on slices.

## Canonical Installed Execution Request

Provider selection shall not reason from one setting at a time.

Before comparison execution starts, the installed extension resolves one
canonical installed execution request from:

- current host platform
- required `viHistorySuite.labviewVersion`
- required `viHistorySuite.labviewBitness`
- local Windows LabVIEW installation discovery
- local `LabVIEWCLI` availability for the requested version + bitness pair

The extension validates that canonical request before:

- provider selection
- runtime launch
- any user-facing claim that comparison generation is runnable

If the request is non-canonical, the extension must fail closed before runtime
work starts.

There is no installed Docker fallback path in this contract.

## Hard-Stop Rules

The installed execution policy is meant to keep extension-user compare behavior
deterministic and non-invasive.

Important hard-stop factors include:

- `viHistorySuite.labviewVersion` is missing
- `viHistorySuite.labviewBitness` is missing
- no local LabVIEW installation matches the requested version + bitness pair
- the resolved local runtime is ambiguous or incompatible
- the matching local `LabVIEWCLI` surface cannot be resolved

When any of those conditions hold, the installed extension:

- does not fall back to Docker on the installed-user path
- does not fall back to a different provider class
- retains the next corrective action explicitly in the runtime surfaces
- tells users to set or correct version + bitness and install the matching
  local LabVIEW surface before retrying compare generation

## Public And Internal Reader Surfaces

This execution policy now lives on three different audience surfaces:

- authority/internal control plane in the private GitLab repo
- bundled version-matched extension-user docs inside the VSIX
- public GitHub extension-user surfaces, including the public facade repo and
  the new public GitHub wiki when those pages are materialized

The public extension-user surfaces shall describe:

- local Windows `LabVIEWCLI` as the installed compare dependency
- required version + bitness settings
- fail-closed local runtime selection
- compare workflow and next-step guidance

They shall not publish:

- Sergio's canonical host setup details
- internal benchmark-control material
- private requirements or maintainer-only control-plane instructions

The internal GitLab wiki remains the maintainer-facing derived reader surface
for the private control plane.

When those conditions force a hard stop, the required user-facing outcome is
actionable guidance:

- set the required version + bitness settings
- install the matching local LabVIEW surface when it is missing
- retry after the requested local runtime resolves cleanly

The extension is not allowed to silently continue past a local-runtime hard
stop or to fall back to Docker on the installed-user path.

## Internal Docker Containment

Docker remains available only on internal maintainer and proof surfaces.

That means:

- internal benchmark, proof, and maintainer workflows may still retain Docker
  explicitly
- installed-user manifest/settings and installed-user reader surfaces no longer
  present Docker as the compare contract
- the historical released Docker baseline remains retained only as a separate
  exact-release fact, not as the active installed-user destination
- the planned settings CLI is generated in place on first use instead of being
  shipped as a prebuilt VSIX payload

## Transparency Contract

Execution UX shall surface these facts directly:

- requested LabVIEW version
- requested LabVIEW bitness
- chosen local runtime
- hard-stop reason when execution cannot proceed
- next action

The installed-user surface is moving toward those facts through the current
manifest/settings slice and the remaining runtime-preflight and explicit-
compare slices.
- whether the selected governed image was already present locally
- whether the selected governed image still required acquisition or had already
  been acquired
- what the next user action is when acquisition or Docker capability blocks
  runtime truth

The retained state model is now:

- `selected`
- `hard-stop`
- `required`
- `acquired`
- `failed`

This transparency belongs in:

- runtime doctor
- history-panel action feedback
- progress notifications for long-running acquisition or execution work
- concise compare completion and failure notifications

The currently landed history-panel slice now also seeds the compare-runtime
block from the last retained tracker-backed compare result when the user
reopens VI History, instead of resetting that block to idle every time the
panel is recreated.

The closeout slice now also renders those retained facts as separate
history-panel detail rows, so front-facing execution and acquisition truth is
no longer limited to one status sentence plus transient notifications.

## Queue Ownership

The current broader product work is split intentionally:

- benchmark proof stays in `PROGRAM-0003`
- sustainment remains active under `PROGRAM-0004` / `ISSUE-0409` /
  `TRANCHE-012`
- the active installed-user replacement direction now remains under
  `PROGRAM-0005` / `ISSUE-0412` / `TRANCHE-016`
- the current released Docker-only installed baseline remains retained
  historically under `ISSUE-0410` / `TRANCHE-013` / `TRANCHE-015`

Canonical validation of the effective execution request for this future work is
governed by `ADR-0026`.

`DEBT-0006` is now retired in `docs/product/debt-ledger.json`.

## Read Next

- [Current State](./current-state.md)
- [Development Queue](./development-queue.json)
- [PROGRAM-0004](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)
- [PROGRAM-0005](./execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)
- [ISSUE-0412](./issues/ISSUE-0412-installed-local-labviewcli-selection-and-explicit-compare.md)
- [ISSUE-0410](./issues/ISSUE-0410-extension-execution-flexibility-and-runtime-acquisition-ux.md)
- [ADR-0025](../architecture/adr/ADR-0025-transparent-extension-execution-flexibility-and-runtime-acquisition-ux.md)
- [ADR-0026](../architecture/adr/ADR-0026-canonical-extension-execution-request-validation.md)
