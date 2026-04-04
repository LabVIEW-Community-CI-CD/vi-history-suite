# PROGRAM-0002: Public Facade Installer And Windows Acceptance

## Status

Active post-release program.

Trigger satisfied by the retained immutable `v0.2.0` release:

- retained release: `v0.2.0`
- retained pipeline: `2428809456`
- retained release job: `13779604462`
- current queue tranche: `TRANCHE-010`

## Purpose

Define the governed post-release program for turning `vi-history-suite` into a
publicly installable, publicly supportable Windows product without exposing the
private GitLab engineering control plane.

## Trigger

This program starts only after all of these are true:

- `vi-history-suite` has an immutable released VSIX at the governed target
  version
- the release evidence proves the exact VSIX identity
- the public GitHub facade repo is ready to consume that immutable release
- the Windows 11 acceptance VM is prepared for installed-user proof

That trigger is now satisfied for the first executable slice: immutable release
ingestion contract plus public truth alignment.

## North Star

A user downloads a public Windows installer from the public facade repo, runs
it on a fresh Windows 11 VM, installs the exact released `vi-history-suite`
build, opens a pinned `ni/labview-icon-editor` workspace, and can successfully
exercise the real right-click review flow for the canonical VI while retained
evidence is captured for both automation and human review.

## Authority And Trust Boundary

### Product Truth

- private GitLab release for `vi-history-suite`
- exact released VSIX artifact
- retained release evidence and manifest

### Public Distribution Truth

- public GitHub facade repo:
  `https://github.com/svelderrainruiz/vi-history-suite`
- public installer project
- public release notes and issue intake

### Execution Truth

- fresh Windows 11 VM
- Visual Studio Code CLI for install, verification, and workspace launch
- real human manual right-click review pass for the final UX gate

### Explicit Boundaries

- the GitHub facade repo is not the private engineering source of truth
- the GitHub workflow is the active installer build/publication surface
- the retained Windows builder Docker scaffold does not replace the VM as the
  installed-user proof surface
- Visual Studio Code CLI proves install/verify/open surfaces, but does not
  replace the human right-click gate

## Chosen Design

### Lane 1: Immutable Release Ingestion

Use the immutable released VSIX from private GitLab as the only installer
payload source.

No public build lane may point at:

- a working tree
- a floating preview artifact
- an unpublished package version

### Lane 2: Public Facade Distribution

Use the public GitHub repo as the consumer-facing facade for:

- installer downloads
- installation guidance
- support guidance
- public issue intake
- public release notes

The facade repo will not mirror the private GitLab source tree blindly.

### Lane 3: Windows Installer Build

Build a Windows installer from the immutable released VSIX using:

- a GitHub workflow on a Windows runner
- the retained Windows builder scaffold for builder-entrypoint hardening
- NSIS for packaging

Version 1 assumptions:

- the VM is treated as a fresh Windows 11 install with neither Visual Studio
  Code, Git, nor Docker Desktop preinstalled
- the installer is responsible for placing the exact VSIX and related public
  docs/support surfaces, bootstrapping pinned Visual Studio Code, Git, and
  Docker Desktop installers, materializing the pinned `ni/labview-icon-editor`
  proof workspace from a bundled Git fixture with commit history, preparing the
  pinned LabVIEW Windows container image, and then using the Visual Studio Code
  CLI for extension install and proof automation

### Lane 4: Automated Windows 11 Proof

Use the Windows 11 VM plus PowerShell and Visual Studio Code CLI to automate:

- installer invocation
- exact extension installation verification
- version verification
- Docker Desktop Windows-engine verification and pinned image-digest verification
- workspace launch against the pinned `ni/labview-icon-editor` workspace
  materialized from the bundled Git fixture
- capture of CLI outputs and retained proof artifacts

### Lane 5: Human UX Gate

Use the same VM for manual proof of the user-real path that CLI cannot close:

- right-click invocation on the canonical VI
- wording clarity
- trust prompts
- panel behavior
- first-use friction

This is the bounded human gate that promotes the scenario from strong
automation to trustworthy installed-user evidence.

## Workstreams

1. public facade repo release/distribution scaffolding
2. Windows Docker installer-builder image and NSIS project
3. pinned fixture provisioning manifest and Git bundle for `ni/labview-icon-editor`
4. Windows 11 VM PowerShell + VS Code CLI acceptance harness
5. retained installed-user evidence pack and human-check worksheet

## Planned Deliverables

- `installer/nsis/` in the public facade repo
- `docker/windows-installer-builder/` in the public facade repo
- `acceptance/windows11/` in the public facade repo
- a pinned fixture manifest and Git bundle for the canonical proof repo and VI
- public `INSTALL.md` / `SUPPORT.md` updates for installer-based use
- a VM acceptance checklist for the manual right-click gate

## Non-Goals

- exposing the private GitLab source repositories publicly
- claiming the public facade repo is the engineering source of truth
- replacing the Windows 11 VM with container-only proof
- replacing the human gate with CLI-only proof
- Marketplace publication in this program's first slice

## Acceptance Gates

### Gate A: Immutable Release Consumption

- the installer build consumes only an immutable released VSIX
- the installer metadata retains the exact released version and artifact
  identity

### Gate B: Public Installer Build

- the GitHub workflow can build and publish the installer deterministically from
  the exact immutable released VSIX
- NSIS packaging emits a versioned installer artifact with retained metadata

### Gate C: Automated VM Proof

- the Windows 11 VM can install the product using the produced installer
- Visual Studio Code CLI can verify the installed extension version
- the VM can verify Docker Desktop on the Windows containers engine with the
  pinned LabVIEW image digest present
- the VM can open the pinned proof workspace deterministically from the bundled
  Git fixture

### Gate D: Human UX Gate

- a human can complete the real right-click flow on the canonical VI
- first-use friction is retained as evidence, not just remembered in chat

### Gate E: Public Support Surface

- the public facade repo has truthful install, support, and release guidance
- users have a bounded public issue surface that does not expose private GitLab

## First Slice

The current first slice is:

- activate the public-facade program in the private control plane
- define the immutable `v0.2.0` release ingestion contract from retained GitLab release evidence
- define the pinned fixture manifest and Git-bundle strategy for `ni/labview-icon-editor`
- align the public facade docs and license to current truth
- stop short of claiming user-proof closure until the VM gates run

## Current Landed Scaffold

The public facade repo now retains:

- the immutable `v0.2.0` release contract plus bounded `release-evidence`
  staging guidance
- a scaffold validation script for the public release/support/build surfaces
- `docker/windows-installer-builder/Dockerfile` and
  `docker/windows-installer-builder/Invoke-InstallerBuild.ps1`
- a pinned NSIS 3.11 bootstrap reference plus
  `docker/windows-installer-builder/Stage-NsisBootstrap.ps1`
- pinned Visual Studio Code, Git, and Docker Desktop bootstrap references plus
  `docker/windows-installer-builder/Stage-VsCodeBootstrap.ps1` and
  `docker/windows-installer-builder/Stage-GitBootstrap.ps1` and
  `docker/windows-installer-builder/Stage-DockerDesktopBootstrap.ps1`
- a pinned `ni/labview-icon-editor` Git fixture bundle with commit history plus
  `scripts/Sync-PinnedFixtureBundle.ps1`
- `installer/nsis/vi-history-suite-installer.nsi`
- `installer/nsis/Invoke-HarnessBootstrap.ps1`
- `acceptance/windows11/Invoke-Windows11Acceptance.ps1`
- `acceptance/windows11/acceptance-record.template.json`
- `acceptance/windows11/manual-right-click-checklist.md`
- a local Windows `makensis` smoke compile succeeded against a temporary
  synthetic contract that used the tag-reproduced `v0.2.0` VSIX plus the
  pinned NSIS, Visual Studio Code, Git, and Docker Desktop bootstrap installers
- exact retained release evidence from GitLab release job `13779604462` staged
  under `releases/v0.2.0/release-evidence/`
- GitHub workflow run `23972941672` published the exact public VSIX and NSIS
  installer assets to GitHub release `v0.2.0` after the 32-bit PowerShell
  harness fix

The program still intentionally holds these gates open:

- Gate C automated Windows 11 VM proof
- Gate D human right-click proof

## Approval Outcome

This program was approved and is now active through `TRANCHE-010`.

The approved trust boundary remains:

- private GitLab remains source truth
- the public GitHub facade repo remains the installer/distribution/support surface
- the GitHub workflow remains the installer build/publication surface
- the Windows builder Docker scaffold remains an optional hardening surface
- the Windows 11 VM plus human right-click gate remain execution truth
