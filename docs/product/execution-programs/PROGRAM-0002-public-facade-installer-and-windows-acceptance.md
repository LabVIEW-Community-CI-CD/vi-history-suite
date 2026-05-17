# PROGRAM-0002: Public Source Facade And Public-Product Acceptance

## Status

Closed as historical Docker-only public-product acceptance evidence for the
pre-split facade model. This record remains valid through the shared `v1.3.16`
baseline; ADR-0040 governs post-split sibling-authority work. The exact public
line for this closeout was `v1.1.0`, and `v1.0.2` is retained as burned.

Closeout facts:

- retained release `v0.2.0` and the retained canonical Windows host pass at
  `2026-04-06T20:48:13.412Z` remain historical evidence for the earlier public
  bundle only
- the installed extension compare workflow was Docker-only and x64-only for
  this historical public-product closeout
- the public GitHub repo was the extension-user front face under the historical
  facade model; after `v1.3.16`, it is the public sibling product authority
- the public GitHub wiki now exists at
  `https://github.com/svelderrainruiz/vi-history-suite.wiki.git`
- Gate D has now passed on the Docker-only installed bundle for the governed
  canonical target `resource/plugins/lv_icon.vi`

## Purpose

Retain the governed historical post-release program that turned
`vi-history-suite` into a publicly usable Docker-only product across the
published public GitHub source repo, the public GitHub user wiki, the bundled
installed-user docs, and the private GitLab authority/control plane.

The historical file id remains the same for trace continuity, but the active
post-`v1.3.16` product boundary is now the dual-authority sibling model in
ADR-0040. This file remains the retained public-source facade and Gate D
closeout record, not the future source-promotion model.

## Current Gate Truth

This program is closed and historical for post-`v1.3.16` work. Current
post-split authority truth is retained in ADR-0040 and
`docs/product/dual-authority-split-manifest.json`.

Current truth:

- the old canonical Windows host pass remains valid historical evidence for the
  earlier public bundle only
- the public GitHub repo was the curated public source product surface for this
  closeout, with the exact published head retained in
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
- the public Linux installed-user smoke surface is `.github/workflows/public-linux-installed-user-smoke.yml`
  plus `npm run public:smoke:linux`
- the public source package-preview publication surface is
  `.github/workflows/public-source-package-preview.yml`
- the public Windows installed-user contract surface is
  `.github/workflows/public-windows-installed-user-contract.yml`
- the public-source branch model is now explicit: `develop` is the integration
  branch used for public Codespaces evaluation, `release/*` is the
  release-candidate lane, and `main` remains the protected exact-release line
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
- the historical public GitHub facade repo was aligned to consume that
  immutable release line
- the current Windows 11 host machine is available for installed-user proof

That trigger was satisfied for the earlier closeout. The reopened Docker-only
closeout was governed by the public-source facade plus Docker-only product
contract; future work is governed by the sibling-authority bridge unless a
later issue explicitly admits a porting/adoption action.

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
- `.github/workflows/public-linux-installed-user-smoke.yml`
- `.github/workflows/public-source-package-preview.yml`
- `.github/workflows/public-windows-installed-user-contract.yml`

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

### Lane 1: Historical Immutable Release Ingestion

Use the immutable released VSIX from private GitLab as the only public payload
source for this historical closeout.

### Lane 2: Historical Public Source Product Publication

Use the public GitHub repo as the public source product surface for the
historical facade closeout:

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

### Lane 4: Historical Public Docker Smoke

Use the public sibling Linux smoke lane as the retained public Docker proof
surface for the GitHub product line.

Current first slice:

- `.github/workflows/public-linux-installed-user-smoke.yml` with `workflow_dispatch`
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

1. retained authority-to-public-source publication/adoption tooling and
   ledgering for the historical facade line
2. public source repo product shaping
3. public GitHub wiki and bundled-doc alignment
4. public admission-matrix validation
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
- public source-preview, Linux smoke, and Windows installed-user workflows
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

- `.github/workflows/public-linux-installed-user-smoke.yml` remains truthful
- `.github/workflows/public-source-package-preview.yml` remains truthful
- `.github/workflows/public-windows-installed-user-contract.yml` remains truthful
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
- a public source package-preview workflow
- a public Linux installed-user smoke workflow at
  `.github/workflows/public-linux-installed-user-smoke.yml`
- a public Windows installed-user contract workflow at
  `.github/workflows/public-windows-installed-user-contract.yml`
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
- retained historical public-source publication/adoption tooling through
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

The approved historical trust boundary was:

- private GitLab was source truth for this closeout; after `v1.3.16`, GitLab
  is the governed sibling product authority
- the public GitHub repo was the extension-user front face; after `v1.3.16`,
  it is the public sibling product authority
- the public GitHub wiki remains the public extension-user reader surface
- the private GitHub experiment mirror remains distinct from both GitLab
  authority and the public sibling product
- Docker was part of the default public product path for comparison generation
  in this closed line; current installed extension defaults are governed by
  the host-default local `LabVIEWCLI` contract
- the current Windows 11 host machine remains the human acceptance surface, but
  the acceptance contract is now the public Docker-only product rather than a
  host-LabVIEW or release-kit path
- queued benchmark proof belongs to `PROGRAM-0003` / `ISSUE-0408` /
  `TRANCHE-011`
- queued sustainment belongs to `PROGRAM-0004` / `ISSUE-0409` / `TRANCHE-012`
- public GitHub issues remain supplemental field feedback
