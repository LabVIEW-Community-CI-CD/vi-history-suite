# PROGRAM-0002: Public Source Facade And Public-Product Acceptance

## Status

Closed on the Docker-only public-product acceptance gate. The current exact
public line is `v1.0.5`, and `v1.0.2` is retained as burned.

Closeout facts:

- retained release `v0.2.0` and the retained canonical Windows host pass at
  `2026-04-06T20:48:13.412Z` remain historical evidence for the earlier public
  bundle only
- the installed extension compare workflow is now Docker-only and x64-only
- the public GitHub facade repo is the extension-user front face
- the public GitHub wiki now exists at
  `https://github.com/svelderrainruiz/vi-history-suite.wiki.git`
- Gate D has now passed on the Docker-only installed bundle for the governed
  canonical target `resource/plugins/lv_icon.vi`

## Purpose

Define the governed post-release program for turning `vi-history-suite` into a
publicly usable Docker-only product across the published public GitHub source
repo, the public GitHub user wiki, the bundled installed-user docs, and the
private GitLab authority/control plane.

The historical file id remains the same for trace continuity, but the active
product boundary is now the public source product facade rather than the older
release-kit/setup scaffolding shape.

## Current Gate Truth

This program is now closed again.

Current truth:

- the old canonical Windows host pass remains valid historical evidence for the
  earlier public bundle only
- the public GitHub facade repo is the curated public source product surface,
  with the exact published head retained in
  `docs/product/public-github-source-publication-ledger.md` and
  `docs/product/public-github-source-publication-ledger.json`
- the public GitHub wiki is the public extension-user reader surface, with the
  exact published head retained in
  `docs/product/public-github-wiki-publication-ledger.md` and
  `docs/product/public-github-wiki-publication-ledger.json`
- the internal GitLab wiki remains the maintainer-facing derived reader surface
  for the private control plane
- public GitHub source publication is tracked separately from both wiki
  surfaces in `docs/product/public-github-source-publication-ledger.md` and
  `docs/product/public-github-source-publication-ledger.json`
- public GitHub wiki publication is tracked separately from the internal
  GitLab maintainer wiki
- `docs:ci:public` and `docs:ci:internal` now split the public-user and
  internal-authority docs surfaces while `docs:ci` remains the umbrella lane
- the public smoke surface is `.github/workflows/public-facade-linux-smoke.yml`
  plus `npm run public:smoke:linux`
- the public package-preview publication surface is
  `.github/workflows/public-facade-package-preview.yml`
- the public-source branch model is now explicit: `develop` is the integration
  branch used for public Codespaces evaluation and `main` is the release branch
- the protected-branch posture now depends on required checks instead of direct
  operator memory
- the authority repo now retains `npm run public:gate-d:preflight` and
  `npm run public:gate-d:prepare-cold-pull` so the Linux-engine cold-pull Gate D
  rerun starts from a retained preflight packet instead of chat memory
- GitHub Codespace `novacula` now passes the hosted public smoke, proving
  Debian hosted bootstrap, xauth/Xvfb availability, Docker Linux cold pull,
  and containerized `CreateComparisonReport` reachability on the public
  product surface
- the latest retained human review submission at `2026-04-07T04:06:58.998Z`
  is a real `passed-human-review` on
  `resource/plugins/lv_icon.vi` with note
  `Comparison report is as expected.`
- the earlier same-day failure on `Tooling/deployment/VIP_Pre-Uninstall Custom Action.vi`
  is retained as the diagnosis that exposed the Linux-container staged-path
  seam later retired in the current exact release line
- the local public devcontainer now passes on this machine from a Windows-hosted
  public checkout after retiring the repo-owned `.devcontainer/devcontainer.json`
  `overrideCommand=false` defect that let the base Node image exit before
  `postCreateCommand` finished
- the earlier WSL-path mount failure is explicitly classified as a
  machine-surface mismatch between the broken Linux Docker CLI and Windows
  `docker.exe`, not as a public-repo defect
- the public product now carries an optional governed tester-fixture helper,
  `npm run public:fixture:icon-editor`, which clones
  `ni/labview-icon-editor` into a visible repo-sibling `labview-icon-editor` folder
  for devcontainer/Codespaces evaluation without making that clone a default
  startup dependency
- the new [Public Release Candidate](../public-release-candidate.md) control
  surface now retains the stable exact-release snapshot, including the current
  exact release line, the burned `v1.0.2` fact, the published public heads,
  supporting hosted/local proof, and the retained canonical Gate D human
  review

## Trigger

This program starts only after all of these are true:

- `vi-history-suite` has an immutable released VSIX at the governed target
  version
- the release evidence proves the exact VSIX identity
- the published public GitHub facade repo is aligned to consume that immutable
  release line
- the current Windows 11 host machine is available for installed-user proof

That trigger was satisfied for the earlier closeout. The reopened Docker-only
closeout is now governed by the public-source facade plus Docker-only product
contract.

## North Star

A user clones the public GitHub source repo or opens it in a Docker-capable
Codespace/devcontainer, follows the public GitHub wiki or bundled docs, selects
two commits through the checkbox-only compare flow, and gets a clean comparison
report after first-use governed image acquisition, without relying on host
LabVIEW.

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
- public README, install/support guidance, devcontainer/Codespaces path, public
  smoke workflows, and public extension-user wiki pages

### Execution Truth

- current Windows 11 host machine
- Visual Studio Code
- Docker Desktop plus the current Docker daemon engine
- public GitHub source repo checkout on the host
- real human manual compare-review pass for the final UX gate

### Future Reproducibility Truth

- the public devcontainer/Codespaces surface in the public GitHub source repo
- `.github/workflows/public-facade-linux-smoke.yml`
- `.github/workflows/public-facade-package-preview.yml`

### Queued Benchmark Follow-On Truth

- repeatable benchmark proof belongs to
  [PROGRAM-0003](./PROGRAM-0003-repeatable-benchmark-proof.md),
  [ISSUE-0408](../issues/ISSUE-0408-repeatable-benchmark-proof.md), and
  `TRANCHE-011`
- benchmark truth does not close this program's public-product acceptance gates

### Explicit Boundaries

- the public GitHub facade repo is not the private engineering source of truth
- the public GitHub wiki is not the internal GitLab wiki
- the private GitHub experiment mirror is not the public GitHub facade repo
- GitLab remains the authority source repo and release-control surface
- the internal GitLab wiki remains maintainer-facing and may retain benchmark,
  requirements, and control-plane material that is intentionally absent from
  the public GitHub wiki
- private requirements, design gates, benchmark-control detail, and retained
  engineering evidence do not get published on the public GitHub facade repo or
  the public GitHub wiki
- Docker is part of the default installed extension setup path
- host LabVIEW is not part of the installed extension acceptance contract
- public GitHub issues are supplemental evidence, not gate-closing proof

## Chosen Design

### Lane 1: Immutable Release Ingestion

Use the immutable released VSIX from private GitLab as the only public payload
source.

### Lane 2: Public Source Product Publication

Use the public GitHub repo as the public source product surface for:

- exact VSIX consumption and package preview
- public README, install, support, and contribution guidance
- Docker-only runtime expectations
- devcontainer/Codespaces development and evaluation
- public smoke/workflow validation

### Lane 3: Public User Reader Surface

Use the public GitHub wiki and bundled installed-user docs as the public reader
surfaces for:

- install and release guidance
- user workflow
- current state
- compare/report expectations

### Lane 4: Public Docker Smoke

Use the public-facade Linux smoke lane as the first-class public Docker proof
surface for the GitHub front face.

Current first slice:

- `.github/workflows/public-facade-linux-smoke.yml` with `workflow_dispatch`
- local `npm run public:smoke:linux`
- Linux-engine cold-pull compare characterization for the Docker-only
  installed-extension contract

### Lane 5: Gate D Public/Internal Surface Split

Gate D is now defined against the real public product:

- published public GitHub source repo checkout
- published public GitHub wiki guidance
- bundled installed-user docs
- Docker Desktop switched to the Linux engine
- governed Linux image absent before first use
- canonical fixture workspace with commit history
- checkbox-selected two-commit compare flow
- clean compare presentation on the canonical target
- retained preflight packet for the published public repo commit, published
  public wiki commit, canonical fixture workspace, Docker Linux engine, and
  governed Linux image state before the human compare pass begins

## Workstreams

1. authority-to-public-source promotion tooling and publication ledgering
2. public source repo product shaping
3. public GitHub wiki and bundled-doc alignment
4. public smoke and package-preview validation
5. deterministic Gate D acceptance on the canonical fixture workspace with a
   Linux-engine cold pull
6. explicit boundary documentation that keeps benchmark proof under
   `PROGRAM-0003` / `ISSUE-0408` / `TRANCHE-011`

## Planned Deliverables

- curated public GitHub source repo publication
- curated public GitHub wiki publication
- authority publication ledgers for the public source repo and public GitHub
  wiki
- public devcontainer/Codespaces surface
- public Linux smoke and package-preview workflows
- retained Gate D preflight evidence under `.cache/public-product-gate-d/latest/`
- bundled installed-user docs aligned to the public user story
- retained Gate D acceptance evidence for the public Docker-only product

## Non-Goals

- exposing the private GitLab source repositories publicly
- claiming the public GitHub facade repo is the engineering source of truth
- reintroducing NSIS or the retired setup-adapter release-kit path into the
  active public product
- removing Docker from the installed extension contract
- replacing the human gate with CLI-only proof
- closing benchmark proof or benchmark-image comparability inside this program
- treating public GitHub issues as gate-closing acceptance
- Marketplace publication in this program's first slice

## Acceptance Gates

### Gate A: Immutable Release Consumption

- the public product consumes only an immutable released VSIX
- the public metadata retains the exact released version and artifact identity

### Gate B: Public Source Product Publication

- the published public GitHub source repo is coherent as a standalone product
  surface
- the public GitHub wiki and bundled installed-user docs tell the same user
  story

### Gate C: Public Smoke And Packaging

- `.github/workflows/public-facade-linux-smoke.yml` remains truthful
- `.github/workflows/public-facade-package-preview.yml` remains truthful
- local `npm run public:smoke:linux` and `npm run package` remain viable on the
  public repo

### Gate D: Public/Internal Surface Split

- Sergio Velderrain remains the sole named maintainer gate owner for the
  canonical acceptance pass
- the public GitHub source repo plus public GitHub wiki are the public-facing
  truth surfaces for the acceptance rerun
- the deterministic canonical fixture workspace remains the compare target
- the governed Linux image must be absent before the rerun so first-use pull is
  exercised truthfully
- retained preflight preparation already proves the canonical fixture commit,
  Docker Linux engine state, and governed Linux image absence before and after
  preparation ahead of the human compare pass; exact public heads remain in the
  publication ledgers and the retained preflight packet
- the earlier same-day retained host pass at `2026-04-06T19:53:21.713Z`
  remains supporting evidence that the simplified checkbox-selected compare flow
  itself works as expected on an installed surface
- the newer retained VIP_Post-Install pass is also supporting evidence only; it
  does not close Gate D because the governed canonical target remains
  `resource/plugins/lv_icon.vi`
- Gate D is closed by the retained cold-pull public-product rerun on the
  canonical target `resource/plugins/lv_icon.vi`

### Gate E: Public Support Surface

- the public GitHub facade repo has truthful install, support, and release
  guidance
- users have a bounded public issue surface that does not expose private GitLab

## Current Landed Scaffold

The public product now retains:

- published public GitHub source repo baseline retained in
  `docs/product/public-github-source-publication-ledger.md` and
  `docs/product/public-github-source-publication-ledger.json`
- published public GitHub wiki refresh retained in
  `docs/product/public-github-wiki-publication-ledger.md` and
  `docs/product/public-github-wiki-publication-ledger.json`
- a public devcontainer/Codespaces surface
- a public package-preview workflow
- a public Linux smoke workflow at
  `.github/workflows/public-facade-linux-smoke.yml`
- local `npm run public:smoke:linux` and public `npm run package` paths
- authority-side `npm run public:gate-d:preflight` and
  `npm run public:gate-d:prepare-cold-pull` operator surfaces for retained Gate D
  preparation
- retained Gate D preflight preparation under `.cache/public-product-gate-d/latest/`,
  proving canonical fixture state, Docker Linux engine state, and governed
  Linux image absence before the closing human compare pass
- retained GitHub Codespace `novacula` hosted smoke pass, proving hosted public
  design-contract viability, Debian bootstrap, Docker Linux cold pull, and
  containerized `CreateComparisonReport` reachability on the public surface
  apart from final human acceptance
- public README, `INSTALL.md`, `SUPPORT.md`, and `CONTRIBUTING.md`
- bundled installed-user docs aligned to the checkbox-selected compare flow and
  Docker-only runtime story
- authority-side public-source promotion tooling through
  `npm run public:source:promote`
- separate publication ledgers for the public source repo and public GitHub wiki
- explicit control-plane truth that benchmark proof ownership sits with
  `PROGRAM-0003` / `ISSUE-0408` / `TRANCHE-011`

The program now retains these closed public-acceptance facts:

- Gate D Linux-engine cold-pull compare proof passed on the canonical fixture
  workspace
- Gate D canonical compare-presentation acceptance passed on the public
  product
- the newly fixed Linux-container path is now closed by the retained human
  pass on `resource/plugins/lv_icon.vi`

## Approval Outcome

This program was previously approved through `TRANCHE-010` for the earlier
public bundle. It is now reclosed for the Docker-only public contract with
current exact release `v1.0.3`.

The approved trust boundary remains:

- private GitLab remains source truth
- the public GitHub facade repo remains the extension-user front face
- the public GitHub wiki remains the public extension-user reader surface
- the private GitHub experiment mirror remains distinct from both GitLab
  authority and the public facade repo
- Docker is part of the default public product path for comparison generation
- the current Windows 11 host machine remains the human acceptance surface, but
  the acceptance contract is now the public Docker-only product rather than a
  host-LabVIEW or release-kit path
- queued benchmark proof belongs to `PROGRAM-0003` / `ISSUE-0408` /
  `TRANCHE-011`
- queued sustainment belongs to `PROGRAM-0004` / `ISSUE-0409` / `TRANCHE-012`
- public GitHub issues remain supplemental field feedback
