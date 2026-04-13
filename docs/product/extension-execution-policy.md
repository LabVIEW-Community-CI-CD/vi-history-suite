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

- default installed-user runtime selection is now anchored to Windows local
  `LabVIEWCLI` rather than public Docker settings
- the extension manifest no longer exposes Docker image settings on the
  installed-user surface
- persisted provider selection now lands through the generated settings CLI,
  while the public installed-user manifest still does not expose a general
  provider setting
- the installed-user surface still does not expose `executionMode`,
  host-runtime path overrides, direct executable-path picking, or image-family
  picking
- both version and bitness remain required by contract even though the later
  host-runtime ambiguity handling and explicit-compare slices are still
  landing
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

- host as the default provider through Windows local `LabVIEWCLI`
- Docker only as a bounded expert provider persisted through the generated
  settings CLI
- required LabVIEW selection through:
  - `viHistorySuite.labviewVersion`
  - `viHistorySuite.labviewBitness`
- optional settings seeding through a generated cross-platform CLI launcher
  under user-profile storage that persists provider, version, and bitness
- both settings are required across both provider classes
- path discovery and Docker image-family selection remain internal rather than
  user-facing
- when Docker is selected, the extension derives the governed Windows or Linux
  image family from the current Docker engine
- compare does not auto-run when the second commit is selected
- the panel must show selected/base commit plus provider, version, and
  bitness before the compare action is allowed to start
- unresolved or unsupported provider/runtime selection must block compare in
  the panel and emit a VS Code warning notification
- Docker `x86` is unsupported and fails closed with corrective guidance toward
  host or `x64`

The manifest/settings slice and generated provider-selection CLI slice have
landed. Exact single-runtime ambiguity handling plus explicit compare
preflight remain active follow-on slices.

## Canonical Installed Execution Request

Under the active replacement direction, provider selection shall not reason
from one setting at a time.

Before comparison execution starts, the installed extension resolves one
canonical installed execution request from:

- current host platform
- persisted provider selection, with host as the default and Docker admitted
  only through the generated settings CLI
- required `viHistorySuite.labviewVersion`
- required `viHistorySuite.labviewBitness`
- local Windows LabVIEW installation discovery when the provider is host
- local `LabVIEWCLI` availability for the requested version + bitness pair
  when the provider is host
- current Docker engine facts when the provider is Docker
- governed image-family derivation from the current Docker engine when the
  provider is Docker

The extension validates that canonical request before:

- runtime launch
- any user-facing claim that comparison generation is runnable

If the request is non-canonical, the extension must fail closed before runtime
work starts.

There is no silent fallback between host and Docker provider classes in this
contract.

## Hard-Stop Rules

The installed execution policy is meant to keep extension-user compare behavior
deterministic and non-invasive.

Important hard-stop factors include:

- `viHistorySuite.labviewVersion` is missing
- `viHistorySuite.labviewBitness` is missing
- the persisted provider selection is missing, unsupported, or contradictory
  to the current develop-line slice admission rules
- no local LabVIEW installation matches the requested version + bitness pair
- the resolved local runtime is ambiguous or incompatible
- the matching local `LabVIEWCLI` surface cannot be resolved
- Docker is selected but the current Docker engine cannot satisfy the governed
  Windows/Linux image-family rule
- Docker is selected together with unsupported `x86` bitness

When any of those conditions hold, the installed extension:

- does not switch provider classes implicitly
- retains the next corrective action explicitly in the runtime surfaces
- tells users to set or correct provider, version, and bitness and then
  install the matching local LabVIEW surface or use Docker `x64` with a
  compatible engine before retrying compare generation

## Public And Internal Reader Surfaces

This execution policy now lives on three different audience surfaces:

- authority/internal control plane in the private GitLab repo
- bundled version-matched extension-user docs inside the VSIX
- public GitHub extension-user surfaces, including the public facade repo and
  the new public GitHub wiki when those pages are materialized

The public extension-user surfaces shall describe:

- host-default local Windows `LabVIEWCLI` as the installed compare dependency
- expert Docker provider selection through the generated settings CLI
- required provider, version, and bitness facts
- fail-closed runtime/provider selection
- compare workflow and next-step guidance

They shall not publish:

- Sergio's canonical host setup details
- internal benchmark-control material
- private requirements or maintainer-only control-plane instructions

The internal GitLab wiki remains the maintainer-facing derived reader surface
for the private control plane.

When those conditions force a hard stop, the required user-facing outcome is
actionable guidance:

- set or correct the required provider, version, and bitness facts
- install the matching local LabVIEW surface when host is selected and missing
- use Docker `x64` or switch back to host when the Docker bundle is
  unsupported
- retry after the requested local runtime resolves cleanly

The extension is not allowed to silently continue past a local-runtime hard
stop or to silently switch provider classes on the installed-user path.

## Bounded Expert Docker Provider

Docker no longer remains the default installed-user dependency, but it also is
not treated as a hidden maintainer-only path.

That means:

- installed-user manifest/settings still do not expose Docker image settings,
  image-family picking, or a general provider picker
- the generated settings CLI is the only admitted installed-user path for
  selecting Docker
- Docker preflight derives the governed Windows or Linux image family from the
  current Docker engine
- Docker `x86` remains unsupported and fails closed with guidance toward host
  or `x64`
- internal benchmark, proof, and maintainer workflows may still retain Docker
  explicitly
- the historical released Docker baseline remains retained only as a separate
  exact-release fact, not as the active installed-user destination
- the planned settings CLI is generated in place on first use instead of being
  shipped as a prebuilt VSIX payload

## Transparency Contract

Execution UX shall surface these facts directly:

- requested provider
- requested LabVIEW version
- requested LabVIEW bitness
- chosen local runtime or governed image family
- hard-stop reason when execution cannot proceed
- next action
- CLI update hint when persisted provider/runtime facts need correction

The installed-user surface is moving toward those facts through the current
manifest/settings slice and the remaining provider-selection, runtime-
preflight, and explicit-compare slices.
- whether the selected governed Docker image was already present locally
- whether the selected governed image still required acquisition or had already
  been acquired when Docker is selected
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

Canonical validation of the active installed execution request is governed by
`ADR-0038`.

`ADR-0025` and `ADR-0026` remain retained only as the exact released
Docker-only baseline decisions.

`DEBT-0006` is now retired in `docs/product/debt-ledger.json`.

## Read Next

- [Current State](./current-state.md)
- [Development Queue](./development-queue.json)
- [PROGRAM-0004](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)
- [PROGRAM-0005](./execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)
- [ISSUE-0412](./issues/ISSUE-0412-installed-local-labviewcli-selection-and-explicit-compare.md)
- [ISSUE-0410](./issues/ISSUE-0410-extension-execution-flexibility-and-runtime-acquisition-ux.md)
- [ADR-0038](../architecture/adr/ADR-0038-host-default-local-labviewcli-bounded-expert-docker-and-explicit-compare-preflight.md)
- [ADR-0025](../architecture/adr/ADR-0025-transparent-extension-execution-flexibility-and-runtime-acquisition-ux.md)
- [ADR-0026](../architecture/adr/ADR-0026-canonical-extension-execution-request-validation.md)
