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

Current landed scaffold state:

- the public facade repo now retains the immutable `v0.2.0` release contract
  plus a bounded `release-evidence` staging README
- the public facade repo now retains a scaffold validation script for the
  installer/support/acceptance surfaces
- `docker/windows-installer-builder/` now contains a Windows builder Dockerfile
  scaffold plus a PowerShell entrypoint that validates the immutable VSIX
  identity before invoking NSIS, plus a pinned NSIS 3.11 bootstrap reference
  and staging script for the Windows builder lane, plus pinned Visual Studio
  Code and Git bootstrap references for the fresh-VM installer payload
- `installer/nsis/` now contains the public installer scaffold that stages the
  exact released VSIX plus public-facing support materials, bootstraps Visual
  Studio Code and Git on a fresh VM, and installs through the Visual Studio
  Code CLI
- `acceptance/windows11/` now contains a PowerShell acceptance harness,
  acceptance-record template, and the retained manual right-click checklist
- a local Windows `makensis` smoke compile now succeeds against a temporary
  synthetic contract that uses the tag-reproduced `v0.2.0` VSIX plus pinned
  NSIS, Visual Studio Code, and Git bootstrap installers
- the exact retained `v0.2.0` release evidence is now staged into the public
  facade repo from GitLab release job `13779604462`
- the GitHub workflow now builds and publishes the exact public VSIX and the
  NSIS installer to the GitHub release `v0.2.0`
- Windows VM proof and human UX proof gates remain open pending Gates C-D

## Scope

- public facade repo release/distribution scaffolding
- immutable VSIX ingestion contract from private GitLab releases
- GitHub workflow for public installer build and publication
- Windows builder Docker scaffold for future hardening
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
- the installer design treats the Windows 11 VM as a fresh install with neither
  Visual Studio Code nor Git preinstalled and bootstraps those prerequisites as
  part of installer execution
- the GitHub workflow is documented as the active installer build/publication
  surface, with the Windows builder scaffold kept distinct from the
  installed-user proof surface
- the Windows 11 VM acceptance lane is documented as the installed-user proof
  surface and includes Visual Studio Code CLI verification plus an explicit
  manual right-click human gate
- the canonical fixture repo and VI are retained in a pinned provisioning
  manifest

## Required Evidence

- public facade repo scaffolding committed and published
- public GitHub release `v0.2.0` contains the exact VSIX plus the workflow-built
  NSIS installer
- control-plane docs updated in the private source-of-truth repo
- design-gate pass after private-doc updates

## First Active Slice

- activate `TRANCHE-010` and `PROGRAM-0002` in the private repo control plane
- ingest the exact immutable `v0.2.0` release contract into the public facade repo
- pin the canonical `ni/labview-icon-editor` fixture and selected VI path
- align public install, support, acceptance, and license surfaces to current truth
- stop short of claiming installed-user proof closure until Gates C-D run
