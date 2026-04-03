# ISSUE-0407: Public Facade Installer And Windows Acceptance

## Goal

Turn the public `vi-history-suite` GitHub facade repo into the governed public
distribution and support surface for the released product, with a Windows
installer build lane and a Windows 11 VM acceptance lane.

## Status

Active post-release issue.

Activation evidence:

- immutable retained release: `v0.2.0`
- retained pipeline: `2428809456`
- retained release job: `13779604462`

## Scope

- public facade repo release/distribution scaffolding
- immutable VSIX ingestion contract from private GitLab releases
- Windows Docker builder image for installer production
- NSIS-based Windows installer project
- pinned fixture manifest for `ni/labview-icon-editor`
- Windows 11 VM acceptance harness using PowerShell plus Visual Studio Code CLI
- retained manual right-click acceptance worksheet for the human UX gate

## Non-Goals

- exposing private GitLab source repositories publicly
- treating the public GitHub repo as the engineering source of truth
- replacing the Windows 11 VM with container-only proof
- replacing the human right-click gate with CLI-only proof
- bundling the proof repo inside the installer by default
- Marketplace publication in the first slice

## Dependencies

- immutable released `vi-history-suite` VSIX
- retained release evidence proving exact VSIX identity
- public GitHub facade repo bootstrap
- prepared Windows 11 acceptance VM

## Acceptance Criteria

- the public facade repo retains installer/build/acceptance scaffolding that
  explicitly consumes only immutable released VSIX artifacts
- the installer design assumes Visual Studio Code is already installed on the
  acceptance VM unless later requirements say otherwise
- the Windows Docker lane is documented as the installer build surface, not the
  installed-user proof surface
- the Windows 11 VM acceptance lane is documented as the installed-user proof
  surface and includes Visual Studio Code CLI verification plus an explicit
  manual right-click human gate
- the canonical fixture repo and VI are retained in a pinned provisioning
  manifest

## Required Evidence

- public facade repo scaffolding committed and published
- control-plane docs updated in the private source-of-truth repo
- design-gate pass after private-doc updates

## First Active Slice

- activate `TRANCHE-010` and `PROGRAM-0002` in the private repo control plane
- ingest the exact immutable `v0.2.0` release contract into the public facade repo
- pin the canonical `ni/labview-icon-editor` fixture and selected VI path
- align public install, support, acceptance, and license surfaces to current truth
- stop short of claiming installer-build or Windows VM proof closure until those gates run
