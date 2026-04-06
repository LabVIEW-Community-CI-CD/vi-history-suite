# PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance

## Status

Reopened post-release program for the next exact-version line.

Reopen facts:

- retained release `v0.2.0` and the retained canonical Windows host pass at
  `2026-04-06T20:48:13.412Z` remain historical evidence for the earlier public
  bundle
- the installed extension contract is now breaking-change material at `1.0.0`
- the public front face now includes a public GitHub user wiki in addition to
  the public facade repo
- Gate D must be rerun on the Docker-only installed bundle before this program
  can close again

## Purpose

Define the governed post-release program for turning `vi-history-suite` into a
publicly setup-capable, publicly supportable Docker-only product without
exposing the private GitLab engineering control plane.

The primary public surface is the public GitHub facade plus its user-facing
documentation surfaces, not the private engineering repo.

## Current Gate Truth

This program is reopened and not yet reclosed.

Current truth:

- the old canonical Windows host pass remains valid historical evidence for the
  earlier public bundle only
- the installed extension compare workflow is now Docker-only and x64-only
- the public GitHub facade repo is the extension-user front face
- the public GitHub wiki now exists at
  `https://github.com/svelderrainruiz/vi-history-suite.wiki.git`, but it is
  only bootstrapped and is not yet the complete public user-doc surface
- the internal GitLab wiki remains the maintainer-facing reader surface for the
  private control plane
- public GitHub wiki publication is tracked separately from the internal
  GitLab maintainer wiki
- `docs:ci:public` and `docs:ci:internal` now split the public-user and
  internal-authority docs surfaces while `docs:ci` remains the umbrella lane
- the public smoke surface is `.github/workflows/public-facade-linux-smoke.yml`
  plus `npm run public:smoke:linux`
- the next Gate D rerun must exercise the deterministic public-release fixture
  workspace on the Docker-only installed bundle
- the planned cold-start acceptance case is explicit now: when Gate D is
  reached, switch Docker Desktop to the Linux engine, remove the stored
  governed Linux image, let the extension cold-pull that Linux image, and
  prove comparison generation on the canonical fixture target

## Trigger

This program starts only after all of these are true:

- `vi-history-suite` has an immutable released VSIX at the governed target
  version
- the release evidence proves the exact VSIX identity
- the public GitHub facade repo is ready to consume that immutable release
- the current Windows 11 host machine is available for installed-user proof

That trigger was satisfied for the earlier closeout. The reopened `1.0.0`
closeout is now queued behind the active `PROGRAM-0005` contract-normalization
work.

## North Star

A user downloads the public release kit from the public GitHub facade, installs
the exact released Docker-only bundle, opens the pinned
`ni/labview-icon-editor` fixture workspace with commit history, and proves the
real compare flow on the canonical VI while the public user docs, bundled docs,
and retained acceptance evidence all agree.

## Authority And Trust Boundary

### Product Truth

- private GitLab release for `vi-history-suite`
- exact released VSIX artifact
- retained release evidence and manifest
- private GitLab source repo and control-plane docs
- internal GitLab wiki for maintainer-facing derived reading

### Public Distribution Truth

- public GitHub facade repo:
  `https://github.com/svelderrainruiz/vi-history-suite`
- public GitHub wiki repo:
  `https://github.com/svelderrainruiz/vi-history-suite.wiki.git`
- public GitHub release assets
- public setup manifest, setup adapters, fixture bundle, checksums, release
  notes, install guidance, support guidance, and public extension-user wiki
  pages

### Execution Truth

- current Windows 11 host machine
- Visual Studio Code CLI for install, verification, and workspace launch
- Docker Desktop plus the current Docker daemon engine
- real human manual compare-review pass for the final UX gate

### Future Reproducibility Truth

- a future published container image that mirrors the public setup contract and
  replaces VM replay as the preferred automation surface
- the current first slice of that lane is the public-facade Linux smoke lane
  through `.github/workflows/public-facade-linux-smoke.yml`

### Queued Benchmark Follow-On Truth

- repeatable benchmark proof now belongs to
  [PROGRAM-0003](./PROGRAM-0003-repeatable-benchmark-proof.md),
  [ISSUE-0408](../issues/ISSUE-0408-repeatable-benchmark-proof.md), and
  `TRANCHE-011`
- the authority repo already mirrors a GitHub Linux benchmark lane into the
  private GitHub experiment repo, and the Windows benchmark image is already
  published, but those benchmark lanes no longer define this program's exit
  gates

### Supplemental Feedback Truth

- public GitHub issues for post-publication drift and field feedback

### Explicit Boundaries

- the GitHub facade repo is not the private engineering source of truth
- the public GitHub wiki is not the internal GitLab wiki
- the private GitHub experiment mirror is not the public facade repo
- GitLab remains the authority source repo and release-control surface
- the internal GitLab wiki remains maintainer-facing and may retain benchmark,
  requirements, and control-plane material that is intentionally absent from
  the public GitHub wiki
- GitHub experiment results are benchmark evidence only; they do not close
  product truth or release truth
- private requirements, design gates, and retained engineering evidence do not
  get published on the public facade repo or the public GitHub wiki
- the GitHub workflow is the active public release-kit publication surface
- NSIS is removed from the active public toolchain
- Docker is now part of the default installed extension setup path
- Visual Studio Code CLI proves install/verify/open surfaces, but does not
  replace the human right-click gate
- Sergio Velderrain is the sole named maintainer authorized to close the
  host-machine human UX gate
- public GitHub issues are supplemental evidence, not gate-closing proof

## Chosen Design

### Lane 1: Immutable Release Ingestion

Use the immutable released VSIX from private GitLab as the only public payload
source.

No public lane may point at:

- a working tree
- a floating preview artifact
- an unpublished package version

### Lane 2: Public Release Kit Distribution

Use the public GitHub repo as the consumer-facing facade for:

- exact VSIX downloads
- public setup manifest publication
- Windows and Linux setup adapters
- fixture bundle and fixture metadata publication
- checksums
- public release notes, install guidance, and support guidance

### Lane 3: Setup Adapters

The primary setup lane is direct setup from public assets:

- Windows: PowerShell setup adapter
- Linux: shell setup adapter
- both consume the public setup manifest
- both install the exact released VSIX and materialize the pinned fixture

Version 1 assumptions:

- the active proof target is the current Windows 11 host machine
- Visual Studio Code and Git may be installed by the Windows adapter when they
  are missing
- Docker is a required installed-extension dependency for comparison
  generation

### Lane 4: Automated Host-Machine Proof

Use the current Windows 11 host machine plus PowerShell and Visual Studio Code
CLI to automate:

- setup-adapter invocation
- exact extension installation verification
- version verification
- workspace launch against the pinned `ni/labview-icon-editor` workspace
  materialized from the bundled Git fixture
- capture of CLI outputs and retained proof artifacts

### Lane 5: Human UX Gate

Use the same Windows 11 host machine for manual proof of the user-real path
that CLI cannot close:

- Sergio Velderrain is the sole named maintainer gate owner for this pass
- right-click invocation on the canonical VI
- wording clarity
- trust prompts
- panel behavior
- first-use friction

### Lane 6: Public Docker Smoke

Use the public-facade Linux smoke lane as the first-class public Docker proof
surface for the GitHub front face.

Current first slice:

- `.github/workflows/public-facade-linux-smoke.yml` with `workflow_dispatch`
- local `npm run public:smoke:linux`
- Linux-engine cold-pull compare characterization for the Docker-only
  installed-extension contract

## Workstreams

1. public facade repo release-kit and support scaffolding
2. public setup manifest plus Windows/Linux setup adapters
3. pinned fixture provisioning manifest and Git bundle for `ni/labview-icon-editor`
4. Windows 11 host-machine PowerShell + VS Code CLI acceptance harness
5. retained installed-user evidence pack and human-check worksheet
6. future container-image automation lane
7. explicit boundary documentation that hands benchmark proof to the queued
   `PROGRAM-0003` / `ISSUE-0408` / `TRANCHE-011` lane

## Planned Deliverables

- `releases/v0.2.0/public-setup-manifest.json` in the public facade repo
- `setup/windows/Setup-VIHistorySuite.ps1` and `setup/linux/setup-vi-history-suite.sh`
- `acceptance/windows11/` in the public facade repo
- a pinned fixture manifest and Git bundle for the canonical proof repo and VI
- public `INSTALL.md` / `SUPPORT.md` updates for release-kit setup
- a Windows 11 host-machine acceptance checklist plus a dedicated human-gate closeout script for the manual right-click gate
- a future container-image automation recipe that mirrors the public setup
  manifest
- a real public-facade Linux smoke workflow plus local `npm run public:smoke:linux`
- control-plane truth that benchmark proof is queued under
  `PROGRAM-0003` / `ISSUE-0408` / `TRANCHE-011` rather than closed here

## Non-Goals

- exposing the private GitLab source repositories publicly
- claiming the public facade repo is the engineering source of truth
- reintroducing NSIS into the active public toolchain
- removing Docker from the installed extension contract
- replacing the human gate with CLI-only proof
- closing benchmark proof or benchmark-image comparability inside this program
- treating public GitHub issues as gate-closing acceptance
- Marketplace publication in this program's first slice

## Acceptance Gates

### Gate A: Immutable Release Consumption

- the public release kit consumes only an immutable released VSIX
- the public metadata retains the exact released version and artifact identity

### Gate B: Public Release Kit Publication

- the GitHub workflow can build and publish the public release kit
  deterministically from the exact immutable released VSIX
- the published kit includes the exact VSIX, public setup manifest, setup
  adapters, pinned fixture bundle, fixture metadata, and checksums

### Gate C: Automated Host-Machine Proof

- the current Windows 11 host machine can complete setup using the public
  release kit
- Visual Studio Code CLI can verify the installed extension version
- the proof machine can open the pinned proof workspace deterministically from
  the bundled Git fixture on a local non-OneDrive path

### Gate D: Human UX Gate

- Sergio Velderrain remains the sole named maintainer gate owner for the
  canonical VI acceptance pass
- the manual right-click proof must run from the deterministic local fixture
  workspace instead of a OneDrive-backed synced root
- first-use friction remains retained evidence, not remembered chat context
- the earlier same-day retained host pass at `2026-04-06T19:53:21.713Z`
  remains supporting evidence that the simplified checkbox-selected compare
  flow itself works as expected on an installed surface
- the latest retained canonical review remains a failure on
  `c:\dev\labview-icon-editor` / `resource/plugins/lv_icon.vi`, so the
  canonical public Gate D surface is not yet closed
- the remaining human-facing blocker is now narrowed to the Docker-only public
  acceptance contract: Linux-engine cold-pull compare plus canonical compare
  presentation acceptance on the deterministic fixture workspace
- Gate D remains open

### Gate E: Public Support Surface

- the public facade repo has truthful install, support, and release guidance
- users have a bounded public issue surface that does not expose private GitLab

## First Slice

The current first slice is:

- activate the public-facade program in the private control plane
- define the immutable `v0.2.0` release ingestion contract from retained GitLab
  release evidence
- define the pinned fixture manifest and Git-bundle strategy for
  `ni/labview-icon-editor`
- pivot the public facade from installer-first to release-kit-first
- stop short of claiming user-proof closure until the host-machine proof gates
  run

## Current Landed Scaffold

The public facade repo now retains:

- the immutable `v0.2.0` release contract plus bounded `release-evidence`
  staging guidance
- a primary public setup manifest plus Windows and Linux setup adapters
- a scaffold validation script plus a direct-release fixture smoke test
- a pinned `ni/labview-icon-editor` Git fixture bundle with commit history plus
  `scripts/Sync-PinnedFixtureBundle.ps1`
- a PowerShell acceptance harness, acceptance-record template, and manual
  right-click checklist for the host-machine lane
- a dedicated `Invoke-Windows11HumanGate.ps1` closeout script plus structured
  checklist state in the retained acceptance record
- exact retained release evidence from GitLab release job `13779604462` staged
  under `releases/v0.2.0/release-evidence/`
- a GitHub workflow that now publishes the public release kit only and deletes
  retired legacy installer assets when present
- a successful public release-kit publication run `23985908613` on public head
  `9ebee6c` that refreshed the public setup checksum asset after the container
  smoke scaffold landed
- adjacent benchmark scaffolding already exists in the authority repo and the
  private GitHub experiment mirror, but benchmark proof ownership now sits
  with `PROGRAM-0003` / `ISSUE-0408` / `TRANCHE-011`
- a local direct-release Windows smoke that now succeeds against the public
  setup manifest, exact VSIX, and pinned fixture bundle
- a public-facade Linux smoke workflow at
  `.github/workflows/public-facade-linux-smoke.yml`
- a local `npm run public:smoke:linux` public Docker smoke lane
- a retained automated host-machine proof record at
  `C:\Users\sveld\AppData\Local\VI History Suite\acceptance\host-machine\acceptance-record.json`
- Sergio Velderrain remains the sole named maintainer gate owner for the
  pending host-machine manual right-click pass
- the remaining manual gate is bounded to the deterministic local fixture
  workspace rather than a OneDrive-backed synced clone
- the latest retained host-review artifact now exists at
  `c:\Users\sveld\AppData\Roaming\Code\User\workspaceStorage\0bca0972b9105eae5fae72858e3399d0\svelderrainruiz.vi-history-suite\human-reviews\latest-human-review-submission.json`,
  and its newest manual proof result is now a failed canonical-fixture review
  on `c:\dev\labview-icon-editor` / `resource/plugins/lv_icon.vi`, while the
  earlier same-day repo-agnostic checkbox-flow pass remains separate retained
  supporting evidence rather than the newest closure candidate
- the authority repo now carries repo-side retirement for the additive Gate D
  blocker package: per-pair `Open compare` enablement after dashboard
  completion, grouped overview-image rows with `Block Diagram Overview` before
  `Front Panel Overview`, Review Note draft persistence until successful
  submission, and a concise curated installed-user documentation bundle that
  omits private GitLab plus SRS/RTM authority-link exposure
- the next required proof is therefore a fresh manual rerun on the updated
  installed bundle from the deterministic local fixture workspace on the
  canonical VI path after the compare-report presentation seam is retired

The program still intentionally holds these gates open:

- Gate D Docker-only Linux-engine cold-pull compare proof
- Gate D human right-click proof on the canonical VI after that cold pull

## Approval Outcome

This program was previously approved through `TRANCHE-010` for the earlier
public bundle. It is reopened for the `1.0.0` Docker-only public contract.

The approved trust boundary remains:

- private GitLab remains source truth
- the public GitHub facade repo remains the public release-kit, setup, and
  support surface
- the private GitHub experiment mirror remains distinct from both GitLab
  authority and the public facade repo
- the GitHub workflow remains the release-kit publication surface
- NSIS is removed from the public toolchain
- Docker is now part of the default public setup path for comparison
  generation
- the current Windows 11 host machine plus human right-click gate remain
  execution truth
- a future published container image is the preferred reproducible automation
  follow-on
- queued benchmark proof now belongs to `PROGRAM-0003` / `ISSUE-0408` /
  `TRANCHE-011`
- queued sustainment now belongs to `PROGRAM-0004` / `ISSUE-0409` /
  `TRANCHE-012`
- public GitHub issues remain supplemental field feedback
