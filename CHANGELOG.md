# Changelog

This changelog is the governed version-line summary for `vi-history-suite`.

Retained exact-version releases now include `v0.2.0`, `v1.0.0`, `v1.0.1`,
`v1.0.2`, `v1.0.3`, `v1.0.4`, `v1.0.5`, `v1.0.6`, `v1.1.0`, `v1.2.0`,
`v1.2.1`, `v1.2.2`, `v1.3.0`, `v1.3.1`, `v1.3.2`, `v1.3.3`, `v1.3.4`,
`v1.3.5`, `v1.3.6`, `v1.3.7`, `v1.3.8`, and `v1.3.9`.

Burned exact-version releases now include `v1.0.2`.

## [1.3.13] - 2026-04-27

### Changed

- Public validation pre-release refresh carries the admitted Windows host
  LabVIEW 2026 x64 proof wording into the public facade and Marketplace
  package line.
- Successful LabVIEWCLI `CreateComparisonReport` diagnostics no longer retain
  a stale success-before-failure note when the operation succeeded.

## [1.3.12] - 2026-04-26

### Added

- `vihs validate-fixture` for running the canonical public
  `ni/labview-icon-editor` / `resource/plugins/lv_icon.vi` compare battery
  from the installed CLI and retaining public proof packets.
- Public proof-status matrix that distinguishes admitted Linux/Docker,
  admitted Linux host LabVIEW, community/deferred Windows host LabVIEW, and
  community/deferred Windows Docker Desktop Windows-container evidence.

### Changed

- Public validation docs now treat the canonical fixture as an executable
  validation recipe, not only retained issue evidence.
- Linux host comparison execution now returns cleanly after `LabVIEWCLI` exits
  even when headless LabVIEW keeps inherited stdio handles open long enough to
  outlive the CLI process.

## [1.3.11] - 2026-04-26

### Added

- Public validation pre-release lane for publishing `1.3.11` to public GitHub
  and VS Code Marketplace so users can report validation success, validation
  failure, bug, and feature-not-implemented results.
- `vihs --validate --proof-out <dir>` proof packets with stable `VIHS_E_*`
  runtime codes, GitHub-ready issue body output, and diagnostic path/env
  evidence with secret-looking environment variables redacted.

### Changed

- Runtime provider selection now keeps all provider/year/bitness variants
  selectable for public validation reporting, including paths that currently
  return not-yet-implemented or blocked runtime codes.

## [1.3.10] - 2026-04-25

### Added

- Marketplace community-validation preview package line for publishing a VS
  Code Marketplace pre-release while Windows installed-user proof remains
  explicitly deferred.
- Proof-status disclosure for selectable Windows/LabVIEW provider, year, and
  bitness settings through `vihs --validate` and the requirements traceability
  matrix.

## [1.3.9] - 2026-04-23

### Changed

- exact authority `v1.3.8` is retained as blocked historical incident
  evidence after public GitHub release `312768592` published immutable with
  zero assets
- `release/1.3.9` opens from the retained `v1.3.8` authority line through the
  asset-first GitHub publication path so the installed `vihs` Windows launcher
  fix can close across GitLab, public GitHub, and VS Code Marketplace

## [1.3.8] - 2026-04-23

### Fixed

- `release/1.3.8` opened from the closed `v1.3.7` public GitHub and VS Code
  Marketplace baseline to promote the installed `vihs` Windows launcher fix
  for users who do not have global `node` on `PATH`
- generated Windows launchers now prefer `VI_HISTORY_SUITE_NODE_EXE`, then
  standard VS Code `Code.exe` with `ELECTRON_RUN_AS_NODE=1`, before falling
  back to ambient `node.exe`

## [1.3.7] - 2026-04-22

### Changed

- exact authority `v1.3.6` on `main` remains immutable while public GitHub
  `main` plus tag already publish `v1.3.6`, but the repo-owned in-place
  GitHub release publish attempt against draft `312363117` now proves an
  external immutable-release boundary (`422 tag_name was used by an immutable
  release`), so `release/1.3.7` opens from merged-green `develop` as the next
  governed exact line
- the repo-owned exact-release publish/verify controller remains retained on
  `develop` so the next exact line can close through one governed GitHub
  release act instead of another draft-only partial transaction

## [1.3.6] - 2026-04-22

### Changed

- exact authority `v1.3.5` on `main` remains immutable while the separate
  public GitHub exact release still serves `v1.3.1` and VS Code Marketplace
  still serves `1.3.0`, so `release/1.3.6` now opens from merged-green
  `develop` for the next governed public-exact retry
- the fail-closed public exact pre-tag proof remains retained directly on
  `develop` while `release/1.3.6` carries the next exact-retry line

## [1.3.5] - 2026-04-21

### Changed

- exact authority `v1.3.4` on `main` remains immutable while the public GitHub
  exact release still serves `v1.3.1` and VS Code Marketplace still serves
  `1.3.0`, so `v1.3.5` reopens the exact line narrowly from `main`
- the authority-side public-source validation surfaces now relax the remaining
  stale public facade changelog expectation before the next public GitHub exact-release retry

## [1.3.4] - 2026-04-21

### Changed

- exact authority `v1.3.3` on `main` remains immutable while the public GitHub
  exact release still serves `v1.3.1` and VS Code Marketplace still serves
  `1.3.0`, so `v1.3.4` reopens the exact line narrowly from `main`
- the authority-side public-source validation surfaces now fix the last stale
  public facade changelog expectation before the next public GitHub exact-release retry

## [1.3.3] - 2026-04-21

### Changed

- exact authority `v1.3.2` on `main` remains immutable while the public GitHub
  exact release still serves `v1.3.1` and VS Code Marketplace still serves
  `1.3.0`, so `v1.3.3` reopens the exact line narrowly from `main`
- the authority-side public-source validation surfaces now align with the
  promoted public facade by expecting the current README source-evaluation
  headings and the reopened `1.3.3` package/changelog line before the next
  public GitHub exact-release retry

## [1.3.2] - 2026-04-21

### Changed

- exact public GitHub `v1.3.1` remains immutable while VS Code Marketplace
  still serves `1.3.0`, so `v1.3.2` opens as a governed hotfix line from
  exact `main` instead of mutating the already-published `v1.3.1` GitHub
  asset
- the packaged extension surface now carries the first governed Marketplace
  icon path at `resources/marketplace/vi-history-suite-icon.png` through the
  extension manifest instead of relying on listing-only operator memory

## [1.3.1] - 2026-04-20

### Changed

- `v1.3.0` remains the exact public release line on `main`, while `develop`
  now carries `1.3.1` as the next exact candidate line
- the `1.3.1` opening decision is now governed as a `patch` line because the
  remaining active work hardens the published host-default Windows local
  `LabVIEWCLI` workflow and retained live-session proof/control surfaces
  without adding a new public workflow or breaking the exact `v1.3.0`
  contract
- the first `ISSUE-0414` implementation slice now aligns the installed
  settings CLI, compare-preflight, and runtime-doctor guidance to the retained
  conditional stale-result rule: review Compare or runtime validation again
  after CLI updates and reload or restart only if the current session still
  shows stale provider or runtime facts
- the retained `ISSUE-0414` proof bundle now also carries and enforces
  bidirectional provider-selection coverage plus explicit
  alignment/baseline-switch receipts on latest-packet, policy-boundary, and
  proof-receipt surfaces, and a fresh governed Windows proof receipt dated
  `2026-04-21T06:48:16.064Z` satisfies that strengthened boundary on the
  admitted host
- exact `v1.3.0` closeout remains retained complete on authority, while
  `v1.3.1` remains a pre-release candidate line that still requires current
  public-candidate review plus later exact-release publication gates

## [1.3.0] - 2026-04-14

### Changed

- `v1.2.2` remains the exact public release line on `main`, while `develop`
  now carries `1.3.0` as the next exact candidate line
- the `1.3.0` opening decision is now governed as a `minor` line because the
  active branch adds a new installed-user capability and supported workflow:
  host-default Windows local `LabVIEWCLI` with bounded expert Docker instead
  of only hardening the released Docker-only path
- the public candidate package now distinguishes the published exact `v1.2.2`
  baseline from the unreleased `v1.3.0` candidate line, keeping the next
  public/wiki publication and expert-agent review gates explicit instead of
  continuing to treat exact `1.2.2` publication closeout as the active
  candidate state

## [1.2.2] - 2026-04-07

### Changed

- `v1.2.1` remains the exact public release line on `main`, while `develop`
  now carries `1.2.2` as the next exact candidate line
- exact release closeout now remains incomplete until the exact released
  `main` line has been back-merged into `develop` through the protected path
  and the resulting `develop` pipeline is green, so future sessions do not
  wait for Sergio to elicit that follow-through explicitly
- the sustainment control plane now treats missing or not-yet-running Docker
  as an expected first-run installed-user boundary instead of assuming image
  acquisition is always the first runtime step on a fresh machine
- installed-user entry docs and runtime-doctor next actions now tell first-use
  users to install or start Docker, confirm `docker info` works, and then
  retry the checkbox-selected compare flow without implying host-LabVIEW
  fallback

## [1.2.1] - 2026-04-07

### Changed

- `v1.2.1` is now the exact public release line on `main`, while `develop`
  remains aligned to `1.2.1` until the next exact release candidate opens
- exact release closeout is now governed through a retained VS Code
  Marketplace publication surface for `svelderrainruiz.vi-history-suite`
  instead of relying on operator memory after the GitHub release and GitLab
  tag are already green
- the release control plane now records the governed publisher id, Marketplace
  item id, publication URL, publication mode, and exact published version in a
  dedicated Marketplace publication ledger
- exact SemVer closeout now remains incomplete until the matching VSIX version
  is verified on the VS Code Marketplace, and the release procedure now
  records both the pinned `vsce` path and the manual portal-upload fallback
- the packaged extension homepage now points Marketplace users to the
  maintained public wiki home surface instead of the repo root, so the next
  exact release does not route installed users into branch-specific source
  guidance first
- the root README, public source README, public install page, and public wiki
  home/install pages now lead with the installed-extension local workflow and
  keep repo/fork/Codespaces evaluation as an explicit secondary lane
- the exact public GitHub release `v1.2.1` now publishes merged public `main`
  commit `2547344`, and the VS Code Marketplace item
  `svelderrainruiz.vi-history-suite` now verifies `1.2.1` through the
  official gallery extension query after pinned `vsce` publication

## [1.2.0] - 2026-04-07

### Changed

- `v1.2.0` is now the exact public release line on `main`, while `develop`
  remains the public evaluation branch and still carries `1.2.0` until the
  next exact release candidate opens
- the `release/1.2.0` promotion lane is now closed, and no newer exact public
  release candidate is active yet
- the `1.2.0` line opens one governed public Codespaces/bootstrap capability
  for public `github.com` and `gitlab.com` HTTPS repos, with explicit branch
  honor, remote default-branch resolution when the branch is omitted, and a
  visible repo-sibling clone target instead of a hidden cache path
- `npm run design:gate` now begins with a governed branch-baseline assertion so
  future candidate work fails closed when `develop` has not yet been realigned
  to the exact released `main` line
- Sergio's brand-new-fork and brand-new-Codespace acceptance rerun has now
  passed on `Examples/Logging with Helper-VIs.vi`, and moved-VI compare pairs
  now resolve the historical repo-relative path per revision instead of
  failing closed with `left-blob-read-failed`
- bundled compare-flow docs now retire stale `Diff prev` and retained-pair
  wording in favor of the checkbox-selected pair review path

## [1.1.0] - 2026-04-07

### Changed

- `v1.1.0` is now the exact public release line on `main`, while `develop`
  remains the public evaluation branch and still carries `1.1.0` until the
  next exact release candidate opens
- the `release/1.1.0` promotion lane is now closed, and no newer exact public
  release candidate is active yet
- the control plane now retains one explicit hosted branch-protection and CI
  governance matrix across authority GitLab, the public GitHub facade, and the
  GitHub experiment workflows instead of leaving those boundaries scattered
  across YAML and branch-protection settings
- the authority GitLab package-preview lane is now admitted on `develop`,
  `main`, `release/*`, `hotfix/*`, and exact tags, while feature work relies
  on merge-request admission instead of a generic branch-push preview lane
- the configuration-management and release-control docs now fail closed on the
  real branch model: `develop` is the integration branch, `main` is the exact
  release branch, and GitHub's default branch stays `main` while `develop`
  carries the next candidate

## [1.0.6] - 2026-04-07

### Changed

- `v1.0.6` is now the exact public release line on `main`, while `develop`
  remains the public evaluation branch and still carries `1.0.6` until the
  next exact release candidate opens
- the public branch model now explicitly keeps GitHub's default branch on
  `main` for exact released truth while first-time Codespaces and devcontainer
  evaluation continue to use `develop`
- the public workflow pair now has an explicit responsibility matrix in which
  `Public Facade Package Preview` owns compile, design-contract, and preview
  packaging while `Public Facade Linux Smoke` owns Docker Linux proof, with
  bounded `develop`/`main`/`release/*`/`hotfix/*` triggers and per-ref
  concurrency to reduce CI churn
- the `VI History` panel now fails closed when an in-flight progress or result
  update races a disposed webview instead of surfacing a disposed-webview
  exception through the public review flow

## [1.0.5] - 2026-04-07

### Changed

- the public release line is now exact `v1.0.5` on `main`, and `develop`
  remains aligned to `1.0.5` until the next exact release candidate is opened
- the public fork-owner first-use Codespaces procedure is now tighter for a
  LabVIEW-first reader: it keeps the `develop` fork requirement, the
  `Codespaces` `...` -> `New with options` path, the `16-core` machine
  selection, the browser build message, the top-left three-line menu, the port
  `6010` forwarding dialog, and the exact `VI History` panel wording, while
  removing stale Vitest-popup guidance from the first-use flow
- the first-use quickstart and refresh workflow are now governed by a public
  docs CI test that reads the published public wiki checkout directly, so the
  fork-owner procedure can no longer drift silently from the authority/public
  source contract

## [1.0.4] - 2026-04-07

### Changed

- the public fork-owner Codespaces pages are now rewritten as atomic
  first-time-only procedures for LabVIEW users: they explicitly call out the
  fork dialog `Copy the main branch only` checkbox, the Codespaces `...` ->
  `New with options` path, the `16-core` machine choice, the browser build
  message, the top-left VS Code menu button, the expected port `6010`
  forwarding dialog, and the `VI History` panel wording
- public refresh steps are now split into a separate
  `Refresh-Codespace-Repositories` page instead of being embedded into the
  first-time procedures
- the public release line is now exact `v1.0.4` on `main`, and `develop`
  remains aligned to `1.0.4` until the next published change advances it again
- the authority/public wiki-root contract is now split between
  `VIHS_INTERNAL_WIKI_REPO_ROOT` and
  `VIHS_PUBLIC_GITHUB_WIKI_REPO_ROOT`, so public wiki overrides can no longer
  poison internal-authority docs tests or packaging lanes

## [1.0.3] - 2026-04-07

### Changed

- `v1.0.2` is now retained as a burned release because immutable main/tag
  pipelines failed after publication on stale authority-side package-manifest
  expectations, so `v1.0.3` is the next exact green line
- the authority release contract now treats `develop` as the integration branch
  and `main` as the release branch, instead of relying on direct-to-main
  operator memory
- the authority/public control plane now records the public-product branch
  model, the burned `v1.0.2` line, and the requirement to use CI required
  checks before protected-branch promotion
- the stale authority package-manifest contract now admits the governed
  `tests/unit/preparePublicTestFixtureScript.test.ts` design-contract test so
  docs CI no longer burns a tagged release on an outdated script inventory
- the public `VI History` explorer/title action now surfaces immediately for
  `.vi`, `.ctl`, and `.vit` files instead of waiting for background eligibility
  indexing to finish, while the runtime eligibility check still fails closed
- the public `Public Facade Package Preview` workflow now creates its
  `artifacts/` directory before packaging so the required-check upload step
  cannot fail after a successful VSIX build

## [1.0.2] - 2026-04-07

### Changed

- the public fork-owner Codespaces path now uses the governed `develop` branch
  instead of teaching `main`
- the governed `public:fixture:icon-editor` helper now defaults to upstream
  `develop`, clones full Git history instead of a shallow single-commit copy,
  repairs old shallow or wrong-branch clones automatically when they are clean,
  and stages the sample repo in a visible sibling `labview-icon-editor`
  folder so `lv_icon.vi` remains eligible for the `VI History` context menu
- the public fork-owner procedures are now rewritten for LabVIEW-first users:
  they explicitly call out the `16-core` Codespace machine, the browser build
  message, the exact open-folder path, and the manual `ni/actor-framework`
  example path without hidden `.cache` navigation
- the public Codespaces/devcontainer surface continues to avoid recommending
  `vitest.explorer`, and the fork-owner guidance now treats any browser-profile
  Vitest popup as unrelated to the VI History flow instead of implying that the
  tester must install Vitest

## [1.0.1] - 2026-04-07

### Changed

- the public fork-owner Codespaces procedures now spell out `Code` ->
  `Codespaces` -> `New with options`, the `16-core` machine selection, the
  browser build message, and the exact folder-open path for the canonical
  `lv_icon.vi` flow
- the public Codespaces/devcontainer surface no longer recommends
  `vitest.explorer`, so fork owners are not prompted to install Vitest for the
  LabVIEW review workflow

## [1.0.0] - 2026-04-07

### Added

- one public governed proof entrypoint, `runGovernedProof`, across smoke,
  report-smoke, dashboard-smoke, decision-record, and benchmark proof
  surfaces
- a Docker-only installed-extension compare contract that no longer depends on
  host-native LabVIEW runtime selection in the extension-user workflow
- documentation continuous integration with bundled-doc drift checks and
  version-matched package refresh before VSIX packaging
- deterministic host-review submission with canonical-host retention and a
  fail-closed non-OneDrive boundary
- explicit post-release sustainment rules for release cadence, benchmark
  refresh, and operator-surface upkeep

### Changed

- the repo cut the exact `v1.0.0` line because the installed extension
  contract is breaking-change material: extension compare execution depends on
  Docker, no longer exposes host-vs-Docker mode choice to extension users, and
  no longer competes with ambient host LabVIEW sessions
- the public proof contract is now canonical `LabVIEWCLI CreateComparisonReport`
  rather than multiple public proof scripts or a public engine selector

## [0.2.0] - 2026-04-03

### Added

- the first retained exact-version VSIX release for `vi-history-suite`
- governed GitLab release evidence for `v0.2.0`, including release pipeline
  `2428809456` and kept release job `13779604462`
- an exact-version install surface at `vi-history-suite-0.2.0.vsix`
