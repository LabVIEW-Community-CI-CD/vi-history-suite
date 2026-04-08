# Extension Execution Policy

## Purpose

Define the governed installed-extension execution contract for comparison
generation.

This document exists so future sessions do not reconstruct installed runtime
behavior from scattered code, benchmark scripts, or prior chat.

## Current Implemented Posture

The installed extension now exposes only these runtime-related settings:

- `viHistorySuite.windowsContainerImage`
- `viHistorySuite.linuxContainerImage`

Current installed truth is:

- comparison generation is Docker-only in the installed extension
- the installed extension no longer exposes `executionMode`, host-runtime path
  overrides, or a user-facing bitness selector
- installed comparison generation now constrains to x64 container execution
- host-native LabVIEW remains available for governed maintainer proof surfaces,
  but it is no longer part of the extension-user compare workflow
- on Windows hosts, the extension chooses the governed container provider from
  the current Docker daemon engine instead of assuming Windows containers only:
  - Docker daemon `OSType=windows` selects the governed Windows container image
  - Docker daemon `OSType=linux` selects the governed Linux container image
- when the selected governed image is missing locally, the extension surfaces
  visible acquisition progress before comparison runtime launch
- first use assumes Docker is already installed and running only when the host
  actually proves that through the Docker CLI plus daemon checks; otherwise
  the extension blocks before image acquisition and tells the user to install
  or start Docker first
- if Docker CLI is missing, the daemon is unreachable, or the current engine
  cannot satisfy the governed request, the extension fails closed with
  actionable user-facing guidance
- the extension does not probe host LabVIEW as fallback when Docker is absent,
  misconfigured, or running the other engine
- the history panel, retained packet, and runtime-doctor surfaces retain the
  selected provider, current Docker engine mode, selected image, acquisition
  outcome, and next action as explicit runtime truth
- execution-policy bypass is not allowed: no hidden flag, experimental switch,
  or alternate compare path may skip canonical installed-request validation,
  Docker-only boundaries, or governed provider hard stops

So the installed compare contract is now explicit: Docker is a dependency of
the extension, and the current Docker daemon engine decides whether the
governed Windows or Linux image is used.

## Canonical Installed Execution Request

Provider selection shall not reason from one setting at a time.

Before comparison execution starts, the installed extension resolves one
canonical installed execution request from:

- current host platform
- fixed installed compare bitness: `x64`
- Docker CLI availability
- Docker daemon reachability
- current Docker daemon engine mode (`windows` or `linux`)
- governed Windows and Linux image references
- presence or absence of the selected governed image

The extension validates that canonical request before:

- provider selection
- image acquisition
- container launch
- any user-facing claim that comparison generation is runnable

If the request is non-canonical, the extension must fail closed before runtime
work starts.

There is no installed host-fallback path in this contract.

## Windows Engine Matrix

| Docker daemon engine on Windows | Selected provider | Selected image | Required outcome |
| --- | --- | --- | --- |
| `windows` | `windows-container` | `viHistorySuite.windowsContainerImage` | Run through the governed Windows container provider. Acquire the image first when it is missing locally. |
| `linux` | `linux-container` | `viHistorySuite.linuxContainerImage` | Run through the governed Linux container provider. Acquire the image first when it is missing locally. |
| unavailable | none | none | Hard stop with guidance to install, start, or repair Docker Desktop. Do not probe host LabVIEW. |

## Hard-Stop Rules

The installed execution policy is meant to keep extension-user compare behavior
deterministic and non-invasive.

Important hard-stop factors include:

- Docker CLI is missing from the current host surface
- Docker is installed but the daemon is not reachable
- the daemon reports neither governed `windows` nor governed `linux` container
  mode
- the selected governed image reference is invalid or not pullable
- governed image acquisition fails

When any of those conditions hold, the installed extension:

- does not probe host LabVIEW
- does not fall back to a different provider class
- retains the next corrective action explicitly in the runtime surfaces
- tells first-time users to install or start Docker and confirm it is working
  before retrying compare generation

## Public And Internal Reader Surfaces

This execution policy now lives on three different audience surfaces:

- authority/internal control plane in the private GitLab repo
- bundled version-matched extension-user docs inside the VSIX
- public GitHub extension-user surfaces, including the public facade repo and
  the new public GitHub wiki when those pages are materialized

The public extension-user surfaces shall describe:

- Docker as the installed compare dependency
- current-engine Windows-versus-Linux image selection
- image-acquisition behavior
- compare workflow and next-step guidance

They shall not publish:

- Sergio's canonical host setup details
- internal benchmark-control material
- private requirements or maintainer-only control-plane instructions

The internal GitLab wiki remains the maintainer-facing derived reader surface
for the private control plane.

When those conditions force a hard stop, the required user-facing outcome is
actionable guidance:

- install, start, repair, or authenticate Docker as needed
- on Windows, keep or switch the Docker daemon to the engine whose governed
  image the user intends to exercise
- retry after the selected governed image can be pulled successfully

The extension is not allowed to silently continue past a Docker hard stop or
to probe host LabVIEW as an alternate compare path.

## Docker Acquisition Contract

When Docker execution is selected and the required image is not available
locally, the extension shall surface acquisition progress to the user.

That progress contract must be explicit enough to show:

- which image is being considered
- whether the image is already present locally
- when the image is being pulled
- when the pull completes
- when the pull fails
- what the next user action is if acquisition cannot complete

The platform rule is explicit:

- on Windows, pull the governed image that matches the current Docker daemon
  engine
- on Linux hosts, pull the governed Linux image

Acquisition progress is part of the product contract, not a hidden background
detail, because image pulls are long-running and otherwise look like a frozen
review action.

The currently landed acquisition slice now satisfies that contract for the
comparison-report action path: when the selected governed image is missing, the
user sees pull progress, completion, or acquisition failure before runtime
launch continues.

## Transparency Contract

Execution UX shall surface these facts directly:

- chosen provider
- current Docker daemon engine
- selected governed image
- selected Docker-capability facts
- acquisition outcome
- hard-stop reason when execution cannot proceed
- next action

The currently landed execution-policy slices now retain these facts when the
Docker-only path is evaluated:

- chosen provider
- whether Docker CLI was available
- whether the Docker daemon was reachable
- which container mode was active
- which governed image was selected from that engine
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
- the Docker-only installed contract plus public/internal normalization remain
  active under `PROGRAM-0005` / `ISSUE-0410` / `TRANCHE-013`

Canonical validation of the effective execution request for this future work is
governed by `ADR-0026`.

`DEBT-0006` is now retired in `docs/product/debt-ledger.json`.

## Read Next

- [Current State](./current-state.md)
- [Development Queue](./development-queue.json)
- [PROGRAM-0004](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)
- [PROGRAM-0005](./execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)
- [ISSUE-0410](./issues/ISSUE-0410-extension-execution-flexibility-and-runtime-acquisition-ux.md)
- [ADR-0025](../architecture/adr/ADR-0025-transparent-extension-execution-flexibility-and-runtime-acquisition-ux.md)
- [ADR-0026](../architecture/adr/ADR-0026-canonical-extension-execution-request-validation.md)
