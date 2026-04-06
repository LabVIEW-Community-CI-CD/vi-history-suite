# ISSUE-0407: Public Facade Release Kit And Host-Machine Acceptance

## Goal

Turn the public `vi-history-suite` GitHub facade repo into the governed public
release-kit, setup, and support surface for the released product, with a
host-machine Windows 11 acceptance lane and a future containerized automation
follow-on.

The public facade is for release, setup, and support only. Private requirements
and design-control documents remain private.

## Status

Reopened post-release issue for the next exact-version line.

Reopen evidence:

- immutable retained release `v0.2.0` and the retained canonical host pass at
  `2026-04-06T20:48:13.412Z` remain historical evidence only
- the installed extension contract is now breaking-change material at `1.0.0`
- the public GitHub user-wiki surface now exists and needs to stay aligned with
  the public release-kit and bundled docs
- Gate D must be rerun on the Docker-only public bundle before this issue can
  close again

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
  human-gate closeout script, acceptance-record template, and retained manual
  right-click checklist for the host-machine lane
- the GitHub workflow now publishes the public release kit only and deletes
  retired legacy installer assets when present
- successful public release-kit publication run `23985908613` on public head
  `9ebee6c` refreshed the public setup checksum asset after the container smoke
  scaffold landed
- the exact retained `v0.2.0` release evidence is staged into the public facade
  repo from GitLab release job `13779604462`
- a local direct-release Windows smoke now succeeds against the public setup
  manifest, the exact VSIX, and the pinned fixture bundle
- `.github/workflows/public-facade-linux-smoke.yml` plus local
  `npm run public:smoke:linux` now define the public Docker smoke lane
- the host-machine automated acceptance lane now succeeds with a retained
  acceptance record at
  `C:\Users\sveld\AppData\Local\VI History Suite\acceptance\host-machine\acceptance-record.json`
- Sergio Velderrain remains the sole named maintainer gate owner for the
  canonical host-machine click proof surface
- the canonical host-machine gate is bounded to the deterministic
  local fixture workspace rather than a OneDrive-backed synced clone
- the old retained host reviews remain useful historical evidence for the
  checkbox flow and compare presentation, but they no longer close the current
  public contract by themselves
- the public GitHub wiki now exists at
  `https://github.com/svelderrainruiz/vi-history-suite.wiki.git`
- public GitHub wiki publication is tracked separately from the internal
  GitLab maintainer wiki
- `docs:ci:public` and `docs:ci:internal` now split the public-user and
  internal-authority docs surfaces while `docs:ci` remains the umbrella lane
- the public Docker smoke surface is `.github/workflows/public-facade-linux-smoke.yml`
  plus `npm run public:smoke:linux`
- the next acceptance run must prove the Docker-only installed bundle rather
  than the earlier host-tolerant contract
- the authority repo still mirrors a GitHub Linux benchmark lane into the
  private `vi-history-suite-source-experiments` repo, but that mirror is now
  documented as benchmark only and belongs to the queued benchmark-proof lane
- the private GitHub experiment mirror is documented as benchmark only and not
  as product authority
- repeatable benchmark proof now has explicit closed ownership under
  `PROGRAM-0003` / `ISSUE-0408` / `TRANCHE-011`, while sustainment is queued
  under `PROGRAM-0004` / `ISSUE-0409` / `TRANCHE-012`

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
- control-plane boundary updates that keep queued benchmark-proof ownership
  explicit

## Non-Goals

- exposing private GitLab source repositories publicly
- treating the public GitHub repo as the engineering source of truth
- treating the private GitHub experiment mirror as authority or as the public
  facade repo
- reintroducing NSIS into the active public toolchain
- avoiding Docker in the default installed extension setup path
- replacing the Windows 11 host-machine proof lane with public-issue feedback
- replacing the human right-click gate with CLI-only proof
- closing deep benchmark proof lanes or comparative benchmark packets here
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
  plus an explicit manual right-click human gate from a deterministic local
  non-OneDrive fixture workspace, and no longer depends on a fresh VM as the
  primary replay surface
- Sergio Velderrain is documented as the sole named maintainer gate owner for
  the host-machine click UX pass
- Docker is documented as a required installed-extension dependency
- the canonical fixture repo and VI are retained in a pinned provisioning
  manifest
- queued benchmark proof and sustainment ownership are explicit so this issue
  closes on the public-release lane rather than silently owning later benchmark
  work

## Required Evidence

- public facade repo scaffolding committed and published
- public GitHub release surfaces aligned to the next exact-version line
- public GitHub user-wiki and bundled installed-user docs aligned to the same
  public contract
- retained host-machine acceptance evidence proves the Docker-only installed
  workflow from the public release kit
- Gate D includes the deterministic Linux-engine cold-pull compare case on the
  canonical fixture workspace
- control-plane docs updated in the private source-of-truth repo
- design-gate pass after private-doc updates

## First Active Slice

- reopen `TRANCHE-010` and `PROGRAM-0002` in the private repo control plane
- align the public facade repo, public GitHub wiki, and bundled installed-user
  docs to the Docker-only installed contract
- keep the canonical `ni/labview-icon-editor` fixture and selected VI path as
  the deterministic acceptance surface
- stop short of claiming closure until the new Docker-only Gate D pass runs
