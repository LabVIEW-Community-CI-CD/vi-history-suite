# ISSUE-0410: Extension Execution Flexibility And Runtime Acquisition UX

## Goal

Retain the historical landed record for the Docker-only installed-extension
contract that was current before the local-`LabVIEWCLI` replacement direction
reopened this surface.

## Status

Closed historical issue, superseded by `ISSUE-0412`.

Historical closeout facts:

- `TRANCHE-013` landed the Docker-only installed-extension contract and the
  initial public/internal documentation split normalization
- `TRANCHE-015` landed first-time installed-user Docker onboarding, explicit
  missing-Docker guidance, and fail-closed first-run next actions
- the runtime/package layer removed installed host-mode/path knobs from the
  released extension surface
- this direction remains the current released baseline on exact `v1.2.2`, but
  it is no longer the active product direction
- `ISSUE-0412` / `TRANCHE-016` now own the replacement path to Windows local
  `LabVIEWCLI`

## Scope

- historical Docker-only installed compare execution
- current-Docker-engine selection of governed Windows versus governed Linux
  image on Windows hosts
- canonical Docker-only request validation
- visible image-acquisition and front-facing runtime feedback
- first-run missing-Docker onboarding and fail-closed recovery guidance
- public/internal reader-surface normalization for the released Docker-only
  contract

## Non-Goals

- reopening this issue as the active installed-user direction
- defining the Windows local-`LabVIEWCLI` replacement contract
- unbounded runtime expansion without a clear installed contract

## Dependencies

- truthful current-state, queue, and execution-policy surfaces
- the dedicated ADR package for Docker-only execution and public/internal
  audience split
- historical tranche retention under `TRANCHE-013` and `TRANCHE-015`

## Acceptance Criteria

- the historical Docker-only installed contract remains discoverable as the
  exact released baseline that landed before the reopened replacement work
- `ISSUE-0412` can supersede this direction without erasing what exact
  `v1.2.2` still implements
- future sessions do not mistake this issue for the active product destination

## Required Evidence

- retained queue, program, and current-state references that classify this
  issue as superseded rather than active
- a retained active successor issue: `ISSUE-0412`
- green docs gates after the supersession rewrite

## Historical Landed Slice

- account explicitly for a first-time installed-extension user whose machine
  does not yet have Docker installed or running
- harden runtime-doctor, blocked-next-action, and installed-user reader
  surfaces so they explain the missing-Docker boundary without assuming prior
  Docker familiarity
- preserve the Docker-only compare contract and no-host-fallback rule while
  making the prerequisite and recovery path clearer

## Active Successor

- [ISSUE-0412: Installed Local LabVIEWCLI Selection And Explicit Compare](./ISSUE-0412-installed-local-labviewcli-selection-and-explicit-compare.md)
