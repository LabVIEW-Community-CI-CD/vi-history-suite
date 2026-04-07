# ISSUE-0407: Public Source Facade And Public-Product Acceptance

## Goal

Turn the public `vi-history-suite` GitHub facade repo into the governed public
source product surface for the released Docker-only extension, with the public
GitHub wiki as the user-reader surface and a final public-product Gate D
acceptance rerun on the canonical fixture workspace.

Private requirements, benchmark-control truth, and design-control documents
remain private in GitLab.

## Status

Closed on exact public-product acceptance for the Docker-only public line. The
current exact release line is `v1.1.0`, and `v1.0.2` is retained as burned.

Closeout evidence:

- immutable retained release `v0.2.0` and the retained canonical host pass at
  `2026-04-06T20:48:13.412Z` remain historical evidence only
- the installed extension contract is now breaking-change material at `1.0.0`
- the public GitHub user-wiki surface now exists and needs to stay aligned with
  the public source repo and bundled docs
- Gate D has now passed on the Docker-only public bundle for
  `resource/plugins/lv_icon.vi`

Current landed state:

- the public GitHub source repo publication head is retained in
  `docs/product/public-github-source-publication-ledger.md` and
  `docs/product/public-github-source-publication-ledger.json`
- the public GitHub wiki publication head is retained in
  `docs/product/public-github-wiki-publication-ledger.md` and
  `docs/product/public-github-wiki-publication-ledger.json`
- `.github/workflows/public-facade-linux-smoke.yml` plus local
  `npm run public:smoke:linux` define the public Docker smoke surface
- `.github/workflows/public-facade-package-preview.yml` defines the public
  package-preview lane
- the public-source branch model is now explicit: `develop` is the integration
  branch used for public Codespaces evaluation and `main` is the release branch
- protected-branch promotion now depends on required checks rather than direct
  operator memory
- the authority repo now retains `npm run public:gate-d:preflight` and
  `npm run public:gate-d:prepare-cold-pull` so the Linux-engine cold-pull Gate D
  rerun begins from a retained preflight packet
- retained Gate D preflight preparation already proves canonical fixture state,
  Docker Linux engine state, and governed Linux image absence before and after
  preparation; exact public heads remain in the publication ledgers and the
  retained preflight packet
- the latest retained Gate D review at `2026-04-07T01:37:37.885Z` is a real
  failure on `Tooling/deployment/VIP_Pre-Uninstall Custom Action.vi`: the first
  cold pull completed, then subsequent Linux-container compare attempts failed
  as `command-exited-nonzero`
- the latest retained human review submission at `2026-04-07T04:06:58.998Z`
  is a real `passed-human-review` on
  `resource/plugins/lv_icon.vi` with note
  `Comparison report is as expected.`
- retained runtime stderr and packet evidence narrowed that failure to a
  repo-owned Linux `CreateComparisonReport` path seam: the container runtime
  launched and connected to LabVIEW, then rejected space-containing staged VI
  paths under `/workspace/staging/...`
- that earlier failure is now retained as the diagnosis that exposed the
  Linux-container staged-path seam later retired in the current exact release
  line
- the local public devcontainer now passes on this machine from a Windows-hosted
  public checkout after retiring the repo-owned `.devcontainer/devcontainer.json`
  `overrideCommand=false` defect that let the base Node image exit before
  `postCreateCommand` finished
- the earlier WSL-path mount failure is now explicitly classified as a
  machine-surface mismatch between the broken Linux Docker CLI and Windows
  `docker.exe`, not as a public-repo devcontainer defect
- the public product now carries an optional governed tester-fixture helper,
  `npm run public:fixture:icon-editor`, which clones
  `ni/labview-icon-editor` into a visible repo-sibling `labview-icon-editor`
  folder
  for devcontainer/Codespaces evaluation without making that clone a default
  startup dependency
- GitHub Codespace `novacula` now passes the hosted public smoke at
  `2026-04-07T03:39:45.470Z` on published public repo commit `4a8b27b`,
  proving Debian hosted bootstrap, xauth/Xvfb availability, Docker Linux cold
  pull, and containerized `CreateComparisonReport` reachability on the public
  product surface apart from final Gate D human judgment
- the new [Public Release Candidate](../public-release-candidate.md) control
  surface now retains the stable exact-release snapshot, including the current
  exact release line, the burned `v1.0.2` fact, the published public heads,
  supporting hosted/local proof, and the retained canonical Gate D human
  review
- the public GitHub wiki now exists at
  `https://github.com/svelderrainruiz/vi-history-suite.wiki.git`
- public GitHub wiki publication is tracked separately from the internal
  GitLab maintainer wiki
- public GitHub source publication is tracked separately from both wiki
  surfaces
- `docs:ci:public` and `docs:ci:internal` now split the public-user and
  internal-authority docs surfaces while `docs:ci` remains the umbrella lane
- the next acceptance run must prove the Docker-only installed bundle from the
  public product surfaces, not from the older release-kit/setup shape
- the canonical `resource/plugins/lv_icon.vi` pass remains the retained human
  acceptance fact for the Docker-only line, while `v1.0.2` is now retained as a
  burned exact release because authority docs CI failed after publication
- repeatable benchmark proof now has explicit closed ownership under
  `PROGRAM-0003` / `ISSUE-0408` / `TRANCHE-011`, while sustainment is queued
  under `PROGRAM-0004` / `ISSUE-0409` / `TRANCHE-012`

## Scope

- public GitHub source repo publication and validation
- public GitHub wiki publication and validation
- bundled installed-user docs alignment
- public Linux smoke and package-preview workflows
- deterministic Gate D rerun on the canonical fixture workspace with a
  Linux-engine cold pull
- control-plane boundary updates that keep benchmark-proof ownership explicit

## Non-Goals

- exposing private GitLab source repositories publicly
- treating the public GitHub repo as the engineering source of truth
- treating the private GitHub experiment mirror as authority or as the public
  facade repo
- reintroducing NSIS or the retired setup-adapter release-kit path into the
  active public product
- avoiding Docker in the default installed extension setup path
- replacing the human right-click gate with CLI-only proof
- closing deep benchmark proof lanes or comparative benchmark packets here
- Marketplace publication in the first slice

## Dependencies

- immutable released `vi-history-suite` VSIX
- retained release evidence proving exact VSIX identity
- published public GitHub source repo
- current Windows 11 host machine with Docker Desktop

## Acceptance Criteria

- the public GitHub source repo is a coherent standalone public product surface
- the public GitHub wiki and bundled installed-user docs are aligned to the
  same public user story
- the GitHub workflow set truthfully represents Linux smoke and package preview
- Docker is documented as a required installed-extension dependency
- the deterministic canonical fixture repo and VI remain the governed acceptance
  target
- Gate D includes the deterministic Linux-engine cold-pull compare case on the
  canonical fixture workspace
- control-plane docs are updated in the private source-of-truth repo
- the authority design gate passes after the private-doc updates

## Required Evidence

- public GitHub source repo published
- public GitHub user-wiki and bundled installed-user docs aligned to the same
  public contract
- retained public Linux smoke evidence
- retained Gate D preflight evidence under `.cache/public-product-gate-d/latest/`
- retained Gate D acceptance evidence proves the Docker-only installed workflow
  from the public product surfaces
- control-plane docs updated in the private source-of-truth repo
- design-gate pass after private-doc updates

## First Active Slice

- reopen `TRANCHE-010` and `PROGRAM-0002` in the private repo control plane
- align the public GitHub source repo, public GitHub wiki, and bundled
  installed-user docs to the Docker-only installed contract
- keep the canonical `ni/labview-icon-editor` fixture and selected VI path as
  the deterministic acceptance surface
- retain the new Docker-only Gate D pass as the closure fact for this issue
