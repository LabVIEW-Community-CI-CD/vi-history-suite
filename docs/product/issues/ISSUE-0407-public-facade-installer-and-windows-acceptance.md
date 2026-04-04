# ISSUE-0407: Public Facade Release Kit And Host-Machine Acceptance

## Goal

Turn the public `vi-history-suite` GitHub facade repo into the governed public
release-kit, setup, and support surface for the released product, with a
host-machine Windows 11 acceptance lane and a future containerized automation
follow-on.

The public facade is for release, setup, and support only. Private requirements
and design-control documents remain private.

## Status

Active post-release issue.

Activation evidence:

- immutable retained release: `v0.2.0`
- retained pipeline: `2428809456`
- retained release job: `13779604462`

Current landed scaffold state:

- the public facade repo now retains the immutable `v0.2.0` release contract
  plus bounded `release-evidence` staging guidance
- the public facade repo now retains a primary public setup manifest plus
  Windows and Linux setup adapters
- the public facade repo now retains a scaffold validation script and a
  direct-release fixture smoke test
- the public facade repo now retains a pinned
  `ni/labview-icon-editor` fixture bundle with commit history plus the pinned
  fixture manifest and metadata
- `acceptance/windows11/` now contains a PowerShell acceptance harness,
  acceptance-record template, and retained manual right-click checklist for the
  host-machine lane
- the GitHub workflow now publishes the public release kit only and deletes
  retired legacy installer assets when present
- successful public release-kit publication run `23985423058` on public head
  `1b08d92` removed the retired installer assets from GitHub Releases
- the exact retained `v0.2.0` release evidence is staged into the public facade
  repo from GitLab release job `13779604462`
- a local direct-release Windows smoke now succeeds against the public setup
  manifest, the exact VSIX, and the pinned fixture bundle
- the host-machine automated acceptance lane now succeeds with a retained
  acceptance record at
  `C:\Users\sveld\AppData\Local\VI History Suite\acceptance\host-machine\acceptance-record.json`
- only the manual human UX proof gate remains open, and Sergio Velderrain is
  the sole named maintainer gate owner for that host-machine click pass

## Scope

- public facade repo release/distribution scaffolding
- immutable VSIX ingestion contract from private GitLab releases
- GitHub workflow for public release-kit publication
- public setup manifest and Windows/Linux setup adapters
- pinned fixture manifest for `ni/labview-icon-editor`
- pinned fixture bundle for `ni/labview-icon-editor` with commit history
- Windows 11 host-machine acceptance harness using PowerShell plus Visual
  Studio Code CLI
- retained manual right-click acceptance worksheet for the human UX gate
- future container-image automation lane planning

## Non-Goals

- exposing private GitLab source repositories publicly
- treating the public GitHub repo as the engineering source of truth
- reintroducing NSIS into the active public toolchain
- shipping Docker in the default public setup path
- replacing the Windows 11 host-machine proof lane with public-issue feedback
- replacing the human right-click gate with CLI-only proof
- Marketplace publication in the first slice

## Dependencies

- immutable released `vi-history-suite` VSIX
- retained release evidence proving exact VSIX identity
- public GitHub facade repo bootstrap
- current Windows 11 host machine

## Acceptance Criteria

- the public facade repo retains release-kit/setup/support scaffolding that
  explicitly consumes only immutable released VSIX artifacts
- the GitHub workflow is documented as the active public release-kit
  publication surface
- the default public setup lane is the setup-manifest plus setup-adapter path,
  and NSIS is absent from the active public toolchain
- the default public setup lane installs the exact released VSIX and
  materializes the canonical proof workspace from a bundled Git fixture with
  commit history
- the Windows 11 host-machine acceptance lane is documented as the
  installed-user proof surface, includes Visual Studio Code CLI verification
  plus an explicit manual right-click human gate, and no longer depends on a
  fresh VM as the primary replay surface
- Sergio Velderrain is documented as the sole named maintainer gate owner for
  the host-machine click UX pass
- Docker is documented as optional future provider work, not a default public
  prerequisite
- the canonical fixture repo and VI are retained in a pinned provisioning
  manifest

## Required Evidence

- public facade repo scaffolding committed and published
- public GitHub release `v0.2.0` contains the exact VSIX plus the public
  release-kit assets
- retained host-machine acceptance evidence proves automated setup and workspace
  launch from the public release kit
- control-plane docs updated in the private source-of-truth repo
- design-gate pass after private-doc updates

## First Active Slice

- activate `TRANCHE-010` and `PROGRAM-0002` in the private repo control plane
- ingest the exact immutable `v0.2.0` release contract into the public facade repo
- pin the canonical `ni/labview-icon-editor` fixture, bundle strategy, and
  selected VI path
- align public install, support, acceptance, and release-kit surfaces to
  current truth
- stop short of claiming installed-user proof closure until the manual human
  UX gate runs
