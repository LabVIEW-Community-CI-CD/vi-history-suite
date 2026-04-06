# Extension Execution Policy

## Purpose

Define the governed user-facing execution contract for how the installed
extension chooses between host-native and Docker-backed LabVIEW runtime
execution.

This document exists so future sessions do not reconstruct extension execution
behavior from scattered runtime code, benchmark scripts, or prior chat.

## Current Implemented Posture

The current installed extension already exposes these runtime-related settings:

- `viHistorySuite.executionMode`
- `viHistorySuite.labviewCliPath`
- `viHistorySuite.lvComparePath`
- `viHistorySuite.labviewExePath`
- `viHistorySuite.preferBitness`
- `viHistorySuite.windowsContainerImage`

Current implemented provider truth now satisfies the governed execution policy:

- the installed extension now exposes a first-class
  `viHistorySuite.executionMode` setting with `auto`, `host-only`, and
  `docker-only`
- host-native execution remains the active path for bounded Windows x86 and
  other compatible local runtime surfaces
- runtime selection now treats `host-only` and `docker-only` as explicit
  provider boundaries and fails closed instead of silently falling back across
  host-native and Docker-backed providers
- on Windows, `auto` now prefers clean compatible host-native execution
  instead of selecting Docker just because a governed Windows image happens to
  exist
- the installed selector now derives the selected `LabVIEW.ini` surface and
  governed VI Server TCP port from the selected host runtime before final
  Windows provider choice
- on Windows, `auto` now routes contaminated host-runtime surfaces to the
  governed Windows container provider when it is available and hard-stops when
  that Docker-backed escape path is unavailable
- `host-only` now fails closed on contaminated Windows host-runtime surfaces
  instead of leaving that ambient conflict implicit
- when Windows Docker-backed execution is evaluated, the selector now validates
  Docker CLI availability, daemon reachability, active container mode, and
  governed image presence before selecting or rejecting the Windows provider
- when Windows container execution is selected and the governed image is
  missing locally, comparison-report generation now surfaces visible governed
  image-pull progress before packet persistence and runtime launch
- runtime doctor and retained comparison-report packet surfaces now carry both
  the Windows container-capability facts and retained acquisition state
  explicitly instead of collapsing them into one image-availability assumption
- the history panel now retains the latest compare-runtime summary in-panel so
  users can see the chosen provider, rejected-provider reasons, execution
  mode, acquisition state, and next action without leaving the panel for a
  retained packet
- blocked or failed compare actions now also emit one concise mode-aware
  warning that reuses the retained provider, rejected-provider reasons,
  execution mode, acquisition state, and next-action truth instead of leaving
  those hard stops implicit in progress logs or packets only
- the history panel now also mirrors governed compare-runtime progress while
  comparison generation is in flight, including runtime-selection,
  Windows-image acquisition, and runtime-execution stages, instead of staying
  idle until the action completes
- the history panel now also renders structured compare-runtime detail rows so
  users can see provider, execution mode, report/runtime status, acquisition
  state, rejected providers, reason, diagnostic reason, and next action as
  separate governed facts instead of inferring them from one compressed
  sentence
- benchmark-proof and exact-pair diagnosis entrypoints now fail closed on
  contaminated or contradictory runtime-override bundles
- canonical effective execution-request validation is now implemented through
  selected Windows host-runtime facts, explicit Windows Docker capability
  validation, a governed Windows image-acquisition step with visible progress,
  retained history-panel and runtime-doctor truth, concise compare-success and
  compare-failure notifications, panel-reopen persistence, and structured
  history-panel compare-runtime detail rendering

So current runtime behavior is no longer implicit at the execution-mode
boundary, and the broader execution policy is now closed as implemented
product truth.

## Broader Execution-Mode Contract

The broader queued product contract retains a first-class execution mode:

- `auto`
- `host-only`
- `docker-only`

Execution mode is distinct from:

- preferred bitness
- explicit tool-path overrides
- the configured Windows container image

Host-native execution remains valid in the future contract for compatible
LabVIEW 2026 Q1 x86 or x64 host surfaces. The execution-mode policy decides
whether host-native execution is allowed at all; bitness and explicit runtime
paths then refine which compatible host surface is selected.

## Canonical Effective Execution Request

Provider selection shall not reason from one setting at a time.

Before execution starts, the extension shall resolve one effective execution
request from:

- `executionMode`
- `preferBitness`
- explicit host runtime path settings such as `labviewCliPath`,
  `labviewExePath`, and `lvComparePath`
- the configured Windows container image
- detected host-runtime facts:
  - compatible LabVIEW 2026 Q1 x86/x64 presence
  - already-open LabVIEW host sessions
  - the selected `LabVIEW.ini` surface
  - the selected `LabVIEW.ini`-derived VI Server TCP port
- detected Docker capability facts:
  - Docker installation
  - daemon availability
  - Windows container capability on Windows hosts
  - image presence or absence

The extension shall validate that effective execution request before:

- provider selection
- Docker acquisition
- host-native launch
- any user-facing claim that a provider is runnable

The currently implemented slice already uses selected Windows host-runtime
facts in that boundary:

- selected `LabVIEW.ini`
- derived governed VI Server TCP port
- existing LabVIEW-related host processes
- existing listener on the governed VI Server port

That front-facing provider/acquisition transparency debt is now retired: the
history panel renders separate compare-runtime detail rows and preserves them
through panel reopen instead of collapsing everything back to one summary-only
surface.

This is the canonical validation boundary for the installed extension. If the
request is non-canonical, the product must fail closed before runtime work
starts.

### Auto

`auto` is the default transparent mode.

Its rule is:

- use host-native execution when the governed host runtime surface is
  compatible and conflict-free
- require Docker isolation when a conflicting LabVIEW 2026 host session or
  governed VI Server collision would contaminate host execution
- on Windows, if Docker isolation is selected and the image is missing, show
  visible pull progress while acquiring the governed Windows image
- on Windows, do not select or acquire Docker when the compatible host runtime
  surface is already clean and conflict-free

### Host-Only

`host-only` means:

- Docker shall not be used
- the extension shall not silently fall back to Docker
- if the host runtime is contaminated or incompatible, the run fails closed
  with explicit guidance

### Docker-Only

`docker-only` means:

- host-native execution shall not be used
- the extension shall not silently fall back to host-native
- if Docker is unavailable or acquisition fails, the run fails closed

## Conflict And Hard-Stop Rules

The execution policy is meant to prevent contaminated launches from looking
like product behavior.

Important host-runtime contamination factors include:

- an already-open non-headless LabVIEW 2026 session on the host
- an already-open LabVIEW 2026 session on the host when the selected execution
  mode is `auto` and host-native reuse would contaminate the governed launch
  surface
- multiple installed LabVIEW versions whose ambient state could influence the
  launch surface
- a governed VI Server port that is already occupied

Important Windows Docker capability factors include:

- Docker CLI is missing from the current host surface
- Docker is installed but the daemon is not running or reachable
- Docker is available only in Linux-container mode when the governed Windows
  image is required
- the governed image is not present locally when a Windows Docker run is
  selected
- the configured image reference is invalid or not pullable

### Windows Mode Matrix

| Mode | Canonical condition | Required outcome |
| --- | --- | --- |
| `auto` | Clean compatible host LabVIEW 2026 Q1 surface, no conflicting open session, no governed port collision | Use host-native execution and do not acquire Docker. |
| `auto` | Conflicting open LabVIEW 2026 host session or governed VI Server collision, and Windows-capable Docker is available | Use Docker isolation. If the governed Windows image is missing, acquire it with visible progress. |
| `auto` | Same host conflict, but Docker is unavailable or not Windows-capable | Hard stop with guidance to close LabVIEW or install/enable/switch Docker. |
| `host-only` | Clean compatible host LabVIEW 2026 Q1 surface | Use host-native execution only. |
| `host-only` | Host surface is contaminated, incompatible, or contradictory | Hard stop. Tell the user to close LabVIEW, resolve the governed port conflict, correct the selected host runtime, or change execution mode. |
| `docker-only` | Windows-capable Docker is available | Use Docker only. If the image is missing, acquire it with visible progress. |
| `docker-only` | Docker is unavailable, stopped, or not in Windows-container mode | Hard stop. Tell the user to install/enable/switch Docker or change execution mode. |

When those conditions force Docker isolation but Docker is unavailable, the
required user-facing outcome is a hard stop with actionable guidance:

- close the conflicting LabVIEW session
- or install/enable Docker

The guidance must remain mode-aware:

- `auto`: close LabVIEW or install/enable/switch Docker
- `host-only`: close LabVIEW, resolve the selected host-runtime conflict, or
  change execution mode
- `docker-only`: install/enable/switch Docker or change execution mode

The extension is not allowed to silently continue through a contaminated host
surface or silently choose a different provider than the selected execution
mode permits.

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

- on Windows, pull the governed Windows image

Acquisition progress is part of the product contract, not a hidden background
detail, because image pulls are long-running and otherwise look like a frozen
review action.

The currently landed acquisition slice now satisfies that contract for the
comparison-report action path on Windows: when Windows container execution is
selected and the governed image is missing, the user sees pull progress,
completion, or acquisition failure before runtime launch continues.

## Transparency Contract

Execution UX shall surface these facts directly:

- selected execution mode
- chosen provider
- rejected provider(s) and why they were rejected
- selected host-runtime facts when host-native execution is in play
- selected Docker-capability facts when Docker execution is in play
- acquisition outcome
- next action

The currently landed execution-policy slices now retain these facts when
Windows Docker evaluation is in play:

- selected execution mode
- chosen provider plus rejected provider reasons
- whether Docker CLI was available
- whether the Docker daemon was reachable
- which container mode was active
- whether the governed image was already present locally
- whether the governed image still required acquisition or had already been
  acquired
- what the next user action is when acquisition or Windows Docker capability
  blocks runtime truth

The retained state model is now:

- `selected`
- `rejected`
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
- sustainment is now the active driver-seat lane under `PROGRAM-0004` /
  `ISSUE-0409` / `TRANCHE-012`
- extension execution flexibility and runtime acquisition UX are now closed
  under `PROGRAM-0005` / `ISSUE-0410` / `TRANCHE-013`

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
