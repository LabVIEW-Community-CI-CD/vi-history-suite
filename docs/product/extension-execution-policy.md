# Extension Execution Policy

## Purpose

Define the governed user-facing execution contract for how the installed
extension chooses between host-native and Docker-backed LabVIEW runtime
execution.

This document exists so future sessions do not reconstruct extension execution
behavior from scattered runtime code, benchmark scripts, or prior chat.

## Current Implemented Posture

The current installed extension already exposes these runtime-related settings:

- `viHistorySuite.labviewCliPath`
- `viHistorySuite.lvComparePath`
- `viHistorySuite.labviewExePath`
- `viHistorySuite.preferBitness`
- `viHistorySuite.windowsContainerImage`

Current implemented provider truth remains narrower than the future execution
policy:

- host-native execution remains the active path for bounded Windows x86 and
  other compatible local runtime surfaces
- Windows 64-bit container isolation exists as a governed provider boundary and
  current preferred x64 execution posture when the isolated provider is
  available
- benchmark-proof and exact-pair diagnosis entrypoints now fail closed on
  contaminated or contradictory runtime-override bundles
- the installed extension does not yet expose a first-class `viHistorySuite.executionMode` setting

So current runtime behavior is partially governed, but not yet transparent
enough for a user who wants to choose host-only or Docker-only operation
deliberately.

## Future Execution-Mode Contract

The queued product contract introduces a first-class execution mode:

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

### Auto

`auto` is the default transparent mode.

Its rule is:

- use host-native execution when the governed host runtime surface is
  compatible and conflict-free
- require Docker isolation when a conflicting LabVIEW 2026 host session or
  governed VI Server collision would contaminate host execution
- on Windows, if Docker isolation is selected and the image is missing, show
  visible pull progress while acquiring the governed Windows image

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

When those conditions force Docker isolation but Docker is unavailable, the
required user-facing outcome is a hard stop with actionable guidance:

- close the conflicting LabVIEW session
- or install/enable Docker

The extension is not allowed to silently continue through a contaminated host
surface or silently choose a different provider than the selected execution
mode permits.

## Docker Acquisition Contract

When Docker execution is selected and the required image is not available
locally, the extension shall surface acquisition progress to the user.

The platform rule is explicit:

- on Windows, pull the governed Windows image

Acquisition progress is part of the product contract, not a hidden background
detail, because image pulls are long-running and otherwise look like a frozen
review action.

## Transparency Contract

Future execution UX shall surface these facts directly:

- selected execution mode
- chosen provider
- rejected provider(s) and why they were rejected
- acquisition outcome
- next action

This transparency belongs in:

- runtime doctor
- history-panel action feedback
- progress notifications for long-running acquisition or execution work

## Queue Ownership

The current broader product work is split intentionally:

- benchmark proof stays in `PROGRAM-0003`
- sustainment stays in `PROGRAM-0004`
- extension execution flexibility and runtime acquisition UX are queued under
  `PROGRAM-0005` / `ISSUE-0410` / `TRANCHE-013`

Open debt for this policy is tracked in `docs/product/debt-ledger.json`.

## Read Next

- [Current State](./current-state.md)
- [Development Queue](./development-queue.json)
- [PROGRAM-0005](./execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)
- [ISSUE-0410](./issues/ISSUE-0410-extension-execution-flexibility-and-runtime-acquisition-ux.md)
- [ADR-0025](../architecture/adr/ADR-0025-transparent-extension-execution-flexibility-and-runtime-acquisition-ux.md)
