# Post-Release Sustainment Rules

## Purpose

Retain one canonical sustainment contract for the active post-release lane.

This package makes `PROGRAM-0004` / `ISSUE-0409` executable repo truth instead
of leaving release cadence, benchmark refresh, and operator-surface upkeep
scattered across queue summaries, ship history, and benchmark notes.

## Governing Control Plane

- tranche: `TRANCHE-012`
- issue: `ISSUE-0409`
- execution program: `PROGRAM-0004`
- historical public-closeout record: `TRANCHE-010` / `PROGRAM-0002` is closed
  on the Docker-only public contract
- runtime-provider public-acceptance gate record:
  [runtime-provider-public-acceptance-gate.md](./runtime-provider-public-acceptance-gate.md)
  is now closed cleanly on the retained published candidate heads

The sustainment lane now owns the only active post-release driver seat. It does
not absorb the historical `PROGRAM-0002` closeout, `PROGRAM-0003`,
`PROGRAM-0005`, or the runtime-provider public-acceptance gate record into
generic maintenance language; those surfaces remain explicit when they are
historical or active.

`PROGRAM-0005` now retains the published `v1.3.9` host-default Windows local
`LabVIEWCLI` contract with bounded expert Docker, while `TRANCHE-013` and
`TRANCHE-015` remain the historical Docker-only installed-user baseline.

The current release branch model is explicit too:

- `develop` is the integration branch
- `main` is the protected exact-release line and public default branch
- `feature/*` branches are cut from `develop` and merge back into `develop`
- `release/*` branches are cut from `develop`, merge into `main`, merge back
  into `develop`, and are deleted only after both merges complete
- `hotfix/*` branches are cut from `main`, merge into `main`, merge back into
  `develop`, and are deleted only after both merges complete
- protected-branch promotion shall use required checks instead of operator
  memory
- the next sustained topology is `GitFlow`, adding explicit
  `feature/*`, `release/*`, and `hotfix/*` lanes around those long-lived
  branches instead of treating all post-release work as generic `develop`
  traffic

## Release Refresh Rules

Release cadence is event-driven, not calendar-driven.

The maintained release surfaces are:

- `main` preview artifacts for governed install testing
- SemVer-tagged exact-version release artifacts
- VS Code Marketplace exact publication state for the released VSIX line
- public release-kit source truth that consumes the immutable release
- installed-user entry surfaces on the Marketplace listing, public wiki home,
  root README, public-source README, and public install page
- docs-authoring workbench publication surfaces tied to the same repo state

Refresh the release package when any of these change:

- `package.json` version
- `CHANGELOG.md` head entry for the current package line on `main`
- SemVer tag intent or release-manifest shape
- public release-kit assets or setup/support guidance that must follow the
  exact released VSIX
- release procedure, ship-control, or docs-workbench publication contract

Current version-line contract:

- retained exact-version releases: `v0.2.0`, `v1.0.0`, `v1.0.1`, `v1.0.2`,
  `v1.0.3`, `v1.0.4`, `v1.0.5`, `v1.0.6`, `v1.1.0`, `v1.2.0`, `v1.2.1`,
  `v1.2.2`, `v1.3.0`, `v1.3.1`, `v1.3.2`, `v1.3.3`, `v1.3.4`, `v1.3.5`,
  `v1.3.6`, `v1.3.7`, `v1.3.8`, `v1.3.9`
- burned exact release line: `v1.0.2`
- current exact released line: `v1.3.9`
- current published package line on `main`: `1.3.9`
- current develop package line on `develop`: `1.3.14`
- active exact release candidate line on `develop`: `v1.3.14`
- active release-candidate branch: `release/1.3.14`
- active exact hotfix candidate line on `main`: none
- active hotfix branch: none
- active feature-lane public GitHub release hardening branch on `develop`:
  none
- exact authority `v1.3.9` is now fully published across GitLab authority,
  public GitHub, and VS Code Marketplace, while blocked historical public
  GitHub incident evidence for `v1.3.8` remains retained separately
- pre-tag public-exact proof package script:
  `npm run public:exact:pretag:proof`
- pre-tag public-exact proof GitLab job: `public_exact_pretag_proof`
- public GitHub exact transaction verification package script:
  `npm run public:github:exact:transaction:verify`
- public GitHub exact transaction receipt:
  `.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json`
- Windows exact-VSIX install proof package script:
  `npm run vscode:marketplace:install-proof`
- Windows exact-VSIX install proof receipt:
  `.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json`
- VS Code Marketplace publication prep package script:
  `npm run vscode:marketplace:prepare`
- VS Code Marketplace publication prep receipt:
  `.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json`
- VS Code Marketplace community-validation preview prep package script:
  `npm run vscode:marketplace:community-preview:prepare`
- VS Code Marketplace community-validation preview prep receipt:
  `.cache/vscode-marketplace-community-validation-preview-prep/latest/vscode-marketplace-community-validation-preview-prep.json`
- current retained public GitHub exact verify gate:
  public release `312994104` is published on `v1.3.9`, release lookup by tag
  returns `200`, readback by id returns `200`, the exact assets match the
  retained authority manifest under
  `.cache/gitlab-release-artifacts/v1.3.9/expanded/release-evidence/`, the
  public-source promotion receipt is `passed`, and the retained verify gate is
  `pass`
- current publication incident history:
  authority exact `v1.3.8` exists on GitLab, public GitHub release
  `312768592` is already published and immutable with zero assets, and VS Code
  Marketplace now serves `1.3.9`; blocker
  `published-immutable-release-assets-incomplete` is retained only as
  historical incident evidence while exact `v1.3.9` remains the current fully
  closed line
- public GitHub default branch: `main`
- public Codespaces evaluation branch: `develop`
- integration branch: `develop`
- protected exact-release line: `main`
- release-candidate branch family: `release/*`
- hotfix branch family: `hotfix/*`
- next-line branch model: `GitFlow`

Current control decision for public exact hardening:

- chosen bump: `patch`
- active Marketplace public validation preview line: `1.3.13`
- Marketplace public validation preview status: published and verified for
  `1.3.13`
- Marketplace public validation preview last updated:
  `2026-04-27T04:24:05.457Z`
- Marketplace public validation preview VSIX SHA-256:
  `3b1d83632b8126b597a9db8c98f2737fd988458ecf6c4d74e4f5c3349d16036f`
- active feature-lane public GitHub release hardening branch:
  none
- rationale: authority exact `v1.3.9` remains tagged on `main` while public
  GitHub release `312994104` is retained as a complete immutable exact release
  and VS Code Marketplace serves regular `1.3.9`
- rationale: `develop` now carries patch candidate package line `1.3.14` for
  release-readiness consolidation after the published `1.3.13` public
  validation pre-release
- rationale: Vagrant Windows VSIX acceptance now has a repo-owned evidence
  assertion surface and retained CI receipt contract
- rationale: blocked historical `v1.3.8` incident evidence remains retained,
  and the active exact release candidate line is `v1.3.14`
- rejected `hotfix`: the installed launcher fix was already merged to
  `develop` and should promote through the normal `release/*` path rather than
  bypassing GitFlow from `main`
- rejected `minor`: the change fixes an existing installed-user entrypoint
  contract without adding a new governed capability or supported workflow
- rejected `major`: no governed public or maintainer contract is being removed;
  the current exact line is already published on GitHub and Marketplace

## Software Factory Governance Contract

- active software-factory branch on `develop`:
  none
- factory assessment package script:
  `npm run software:factory:assess`
- factory rehearsal package script:
  `npm run software:factory:rehearse`
- factory repair package script:
  `npm run software:factory:repair`
- factory publish package script:
  `npm run software:factory:publish`
- factory verify package script:
  `npm run software:factory:verify`
- VS Code Marketplace install-proof package script:
  `npm run vscode:marketplace:install-proof`
- VS Code Marketplace prep package script:
  `npm run vscode:marketplace:prepare`
- VS Code Marketplace community-validation preview prep package script:
  `npm run vscode:marketplace:community-preview:prepare`
- factory assessment receipt:
  `.cache/software-factory-orchestrator/latest/software-factory-state.json`
- factory rehearsal receipt:
  `.cache/software-factory-orchestrator/latest/rehearse/software-factory-state.json`
- factory repair receipt:
  `.cache/software-factory-orchestrator/latest/repair/software-factory-state.json`
- factory publish receipt:
  `.cache/software-factory-orchestrator/latest/publish/software-factory-state.json`
- factory verify receipt:
  `.cache/software-factory-orchestrator/latest/verify/software-factory-state.json`
- VS Code Marketplace install-proof receipt:
  `.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json`
- VS Code Marketplace prep receipt:
  `.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json`
- VS Code Marketplace community-validation preview prep receipt:
  `.cache/vscode-marketplace-community-validation-preview-prep/latest/vscode-marketplace-community-validation-preview-prep.json`
- current factory phases:
  `assess`, `rehearse`, `repair`, `publish`, `verify`
- sole production recovery target: none
- production mutation policy:
  exact authority `v1.3.9` is fully closed across public GitHub and VS Code
  Marketplace; later SemVer openings now return to normal GitFlow while
  `v1.3.8` remains retained as blocked historical publication evidence
- authority boundary:
  GitLab `develop` -> `release/*` -> protected `main`
- staging boundary:
  GitFlow `feature/*`, `release/*`, and `hotfix/*` lanes with required checks
  and retained receipts before protected promotion
- production boundary:
  public GitHub `main` / tag / release plus the VS Code Marketplace listing
- recovery boundary:
  retained partial-public incidents are repair-in-place first; the current
  exact GitHub and VS Code Marketplace acts are fully closed for `v1.3.9`
  while `v1.3.8` is retained as blocked historical incident evidence
- trust model:
  operator host, self-hosted runners, local token locators, GitLab authority,
  public GitHub, Marketplace, and retained receipts are governed system
  surfaces rather than ambient assumptions
- environment baseline:
  standard Windows installs plus admitted `Ubuntu-24.04` Linux assurance lane
- rehearsal policy:
  production is not the first proof surface; retain assess, rehearse, the
  non-mutating repair contract, and guarded non-mutating publish/verify
  contracts before any later mutating production phase opens
- approval model:
  assess, rehearse, and repair are automatic and repo-owned non-production
  phases; publish and verify are automatic guarded non-mutating contract
  phases; later VS Code Marketplace publish phases still require explicit
  production approval
- Marketplace prep rule:
  `npm run vscode:marketplace:install-proof` must pass and retain its receipt
  before any mutating VS Code Marketplace publication act; it installs the
  exact authority VSIX into isolated VS Code user-data/extensions roots,
  runs bare `vihs` plus `vihs --validate`, and fails closed unless
  `runtimeValidationOutcome=ready`, the launcher PATH is stripped to the
  isolated launcher root plus `System32`, and ambient Node is not required.
- Marketplace prep rule:
  `npm run vscode:marketplace:prepare` must pass and retain its receipt before
  any mutating VS Code Marketplace publication act; for the current retained
  exact line it verifies the GitHub `v1.3.9` verify gate, exact
  VSIX/checksum evidence, live Marketplace version, local PAT locator, and
  pinned `vsce` command shape without retaining secret material or publishing.
- asset-first GitHub release rule:
  no public GitHub exact release may be published until the repo-owned
  publisher has created a draft, uploaded the VSIX and checksum from GitLab
  authority evidence, read the draft back by id, and verified asset names,
  nonzero sizes, VSIX SHA-256, checksum content, and manifest alignment.
- immutable incomplete release rule:
  a published immutable public GitHub release with missing or mismatched assets
  is `externally-blocked-publication` and blocks VS Code Marketplace
  publication.

Historical opening decision that opened exact `v1.3.1`:

- chosen bump: `patch`
- target exact candidate line: `v1.3.1`
- rationale: the next line hardens the published host-default Windows local
  `LabVIEWCLI` workflow and retained live-session proof/control surfaces
  without adding another governed capability line
- rationale: exact `v1.3.0` remains the truthful published baseline while
  `v1.3.1` opens on `develop` for `ISSUE-0414` proof-depth and
  release-control follow-through
- rejected `minor`: the remaining active work hardens and clarifies the
  published `v1.3.0` host-default contract instead of adding another governed
  capability line
- rejected `major`: no exact `v1.3.0` public or maintainer contract is being
  intentionally broken or removed; the published baseline remains supported
  while `v1.3.1` opens

Historical opening decision that opened exact `v1.3.0`:

- chosen bump: `minor`
- target exact candidate line: `v1.3.0`
- rationale: the next line adds a governed installed-user capability and
  supported workflow by promoting host-default Windows local `LabVIEWCLI` with
  bounded expert Docker instead of only hardening the exact released
  Docker-only surface
- rationale: the `v1.3.0` line keeps exact `v1.2.2` as the truthful published
  baseline while opening the next candidate line required for runtime-provider
  public publication work
- rejected `patch`: the slice now opens a new governed capability line instead
  of only hardening the already-published exact `v1.2.2` contract
- rejected `major`: no exact `v1.2.2` public or maintainer contract is being
  intentionally broken or removed; the published baseline remains intact until
  the next candidate is actually published

Strict SemVer rule after an exact release:

- once an exact release is published, the current published package line on
  `main` shall match that exact release line
- when `develop` carries post-release work, the develop package line shall
  advance to the next exact release candidate before public-facing
  normalization continues
- any further repo change intended for publication shall advance
  `package.json` and the top `CHANGELOG.md` heading to the next SemVer line
  before the changed state is normalized or published further
- future sessions shall not treat an unreleased SemVer bump as complete until
  the matching public tag, public GitHub release, and VS Code Marketplace
  version are all published
- future sessions shall not keep landing post-release changes on the previous
  exact release version number
- future sessions shall not treat a burned exact release as the green release
  baseline for later publication
- future sessions shall not treat an exact release as fully closed until the
  matching released `main` line has been back-merged into `develop` through
  the protected path and the resulting `develop` pipeline is green
- future sessions shall assess any partially public exact GitHub transaction
  through `npm run public:github:exact:transaction:assess` before any further
  public GitHub release or VS Code Marketplace act
- future sessions shall retain the controller's non-mutating
  draft-publishability probe before any in-place public GitHub release repair
  attempt
- future sessions shall not open a later SemVer line while the current exact
  line still retains a blocked public GitHub or VS Code Marketplace
  transaction
- future sessions shall repair the current exact line in place instead of
  burning a new version whenever public GitHub `main`, the exact tag, or a
  draft release already exist for that same exact line unless the retained
  transaction controller proves that repair is impossible
- future sessions shall not treat a candidate line as `review-ready` until the
  maintained public `develop` candidate head and maintained public wiki head
  are both published and retained in the authority candidate package
- future sessions shall keep exact tagging blocked until the post-publication
  expert-agent review gate closes with no findings against the exact published
  public candidate heads retained in the authority candidate package
- optional product-owner exploratory review may happen separately, but it
  shall not replace the clean expert-agent review gate for exact tagging

Decision framework for choosing `major`, `minor`, or `patch`:

- choose `major` when a governed public or maintainer contract is intentionally
  broken, removed, or flipped in a way that invalidates an already-published
  workflow, branch expectation, install path, or runtime surface
- choose `minor` when a new governed capability or supported workflow is added
  without breaking the currently exact released line
- choose `patch` when the change fixes, hardens, clarifies, or governs an
  existing capability, release rule, procedure, branch policy, or CI posture
  without changing the current exact released contract
- default governance-only hardening to `patch` unless the hardening itself
  changes a governed contract in a breaking or additive way
- record the chosen bump rationale in the control plane before further
  publication or release normalization continues

Do not reopen release refresh just because:

- benchmark-only diagnosis changed without affecting shipped release surfaces
- local characterization receipts changed without a governed release claim
- an unrelated feature/doc note changed without affecting install or release
  truth

Candidate publication boundary:

- candidate-state progression is:
  - `local-authority-green`
  - `public-develop-published`
  - `public-wiki-published`
  - `review-ready`
  - `expert-agent-review-findings-received`
  - `expert-agent-review-findings-folded`
  - `tag-eligible`
- local authority-green proof is necessary but not sufficient for
  `review-ready`
- the next expert-agent review gate opens only after the maintained public
  `develop` candidate head and maintained public wiki head are both live and
  retained in `docs/product/public-release-candidate.{md,json}`
- the expert-agent review gate uses the retained
  `vi-history-suite-expert-agent-reviewer` skill against those exact published
  heads and exact tagging stays blocked until the latest retained verdict has
  no findings
- if the governed public source or public wiki worktree is dirty during
  publication:
  - preserve unrelated dirt
  - inspect overlapping files
  - patch only the maintained candidate slice narrowly
  - pause only on direct unresolved conflicts
  - do not treat unrelated dirty worktrees as a generic reason to stop
    candidate publication

## Benchmark Refresh Rules

Benchmark refresh is event-driven and bounded by the current accepted proof
contract.

Current accepted benchmark truth:

- comparable prefix: `129` commits / `128` pairs
- Windows current-contract ceiling: pair `129`
- Windows blocker characterization: `mixed-bitness-call-by-reference-seam`
- Linux full-window blocker: pair `135/138` as
  `linux-headless-recursive-load` / `labview-cli-connection-failed` after one
  governed `CloseLabVIEW -Headless` recovery attempt

Refresh benchmark proof when any of these change:

- benchmark harness logic, packet derivation, or benchmark consumer tooling
- comparison-report runtime execution in a way that can change `HARNESS-VHS-002`
  truth
- governed Windows benchmark image contract
- governed Linux runtime or benchmark image contract
- a release or public claim would otherwise imply changed benchmark truth

Do not reopen benchmark proof just because:

- UI or docs-only work changed without altering benchmark surfaces
- the public release-kit changed without altering benchmark contracts
- out-of-scope alternative Windows x86 provisioning is merely observed in other
  experiments without becoming part of the governed image contract

Reopen the bounded benchmark contract only when:

- the current governed Windows benchmark image contract gains same-bitness x86
  provisioning
- the governed NI Linux runtime or benchmark-image contract changes enough to
  justify a new full-window proof attempt
- another in-scope benchmark provider becomes accepted authority truth

## Operator And Documentation Upkeep Rules

When sustainment-affecting truth changes, update these surfaces together:

- `development-queue.json`
- `current-state.md`
- active sustainment program and issue docs
- `SHIP-0001` only where it points to the active driver-seat post-release lane
- `CHANGELOG.md` when the current published package line on `main` or retained release history changes
- `docs/product/vscode-marketplace-publication-ledger.md` and
  `docs/product/vscode-marketplace-publication-ledger.json` when Marketplace
  publication truth changes
- `hosted-ci-governance.md` and `hosted-ci-governance.json` when hosted
  branch-protection or workflow responsibility changes
- `windows-private-release-runner-lane.md` when the tagged Windows private-release
  acceptance lane, runner identity, or retained evidence contract changes
- `linux-assurance-runner-lane.md` when the separate Linux assurance runner
  lane, external image-auth contract, or retained blocking/advisory assurance
  lane ownership changes
- SRS, RTM, and test plan when normative behavior changes
- wiki coverage/publication ledgers when reader-facing authority changes
- published wiki pages that represent the changed authority docs
- bundled docs after published wiki pages change
- installed-user entry surfaces when the Marketplace, README, public-source
  README, or public install guidance changes

Required branch-model and CI posture:

- integration work lands on `develop`
- release promotion lands on `main`
- the public GitHub default branch remains `main` so casual readers and fork
  owners land on the latest exact released line by default
- protected-branch promotion uses required checks instead of direct operator
  trust
- `feature/*` lanes are cut from `develop` and merge back into `develop`
- `npm run branch:governance:assert` shall fail closed before a new candidate
  line opens when `develop` does not yet contain the exact released `main`
  baseline, and `npm run design:gate` shall keep that assertion first in the
  governed gate order
- exact release closeout remains incomplete until the exact released `main`
  line has been back-merged into `develop` through the protected path and the
  resulting `develop` pipeline is green
- `release/*` lanes are cut from `develop`, validate the release candidate,
  merge to `main`, merge back into `develop`, and are deleted only after both
  merges complete
- `hotfix/*` lanes are cut from `main`, fix one exact release line, merge to
  `main`, merge back into `develop`, and are deleted only after both merges
  complete
- local public-source promotion/check binds the intended checkout through
  `--target-root` or `VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT` and fails closed
  when the target repo is dirty
- the required checks are:
  - GitLab `ubuntu_docker_runner_admission`
  - GitLab `linux_docker_provider_lane`
  - GitLab `public_exact_pretag_proof`
  - GitLab `docs_continuous_integration`
  - GitLab `docs_public_continuous_integration`
  - GitLab `docs_internal_continuous_integration`
  - GitLab `test_extension`
  - GitLab `package_extension_preview`
  - GitHub `Public Source Package Preview / public-source-package-preview`
  - GitHub `Public Linux Installed-User Smoke / public-linux-installed-user-smoke`
  - GitHub `Public Windows Installed-User Contract / public-windows-installed-user-contract`

Hosted automation governance is now retained explicitly:

- GitLab authority branch protection relies on protected branches plus
  `only_allow_merge_if_pipeline_succeeds=true`; it does not have GitHub-style
  named required checks
- GitHub public branch protection relies on named required checks
  `public-source-package-preview`,
  `public-linux-installed-user-smoke`, and
  `public-windows-installed-user-contract`
- GitLab `linux_docker_provider_lane` owns
  `npm run linux:docker:provider:lane` and retained
  `linux-docker-provider-lane-evidence/` so preview and exact package lanes
  prove the Linux Docker provider before artifact publication while Windows
  installed-user LabVIEW proof stays deferred
- GitHub benchmark workflows are characterization-only experiment lanes and
  are not exact-release required checks
- GitLab `governed_runner_admission` and
  `windows_private_release_acceptance` remain deferred Windows/LabVIEW proof
  lanes behind `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true`; they are required
  before any Windows installed-user proof claim, but they are not required for
  the active Linux/Docker validated preview claim
- When enabled, GitLab `windows_private_release_acceptance` retains one bounded
  host-native retry when the shared Windows cleanup seam fails before proof
  execution, preserving
  `windows-private-release-evidence/host/proof-run-pre-recovery.txt`, running
  `scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1`,
  retaining `windows-private-release-evidence/host/proof-runtime-recovery.txt`,
  and still failing closed after that single retry if the repo-owned recovery
  step cannot restore a clean proof surface
- GitLab runner upkeep now uses repo-owned startup-receipt, doctor, apply, and
  live drift-assert surfaces:
  `ubuntu_docker_runner_admission` now runs in the `admission` stage for the
  active Linux/Docker preview claim, while deferred `governed_runner_admission`
  runs
  `npm run gitlab:runner:doctor -- --surface all --fail-on-drift --evidence-dir governed-runner-admission-evidence`
  only when `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true`;
  `scripts/gitlab-runner/windows/doctor-governed-runner-lanes.ps1`
  and `scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh` are the
  lane-local non-destructive doctor surfaces, and
  `scripts/doctorGovernedRunnerLanes.js` via `npm run gitlab:runner:doctor`
  is the admitted Windows-host wrapper for those doctor reads;
  `scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1` keeps the
  scheduled task on ambient execution policy without `ExecutionPolicy Bypass`
  and fails closed unless exactly one configured Windows runner manager
  remains after apply; `scripts/gitlab-runner/windows/assert-governed-runner-lanes.ps1`
  fails closed unless the installed bootstrap hash, exact scheduled-task
  action plus logon trigger, `request_concurrency = 2`, and one live
  configured Windows runner manager remain intact; while
  `scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1` also wakes
  the admitted Linux assurance distro, defaulting to `Ubuntu-24.04` unless
  `VIHS_LINUX_ASSURANCE_DISTRO` overrides it, and retries the repo-owned
  Linux assurance helper until it proves the paired Linux service is enabled,
  active, and singular, writing the latest Windows startup receipt to
  `C:\GitLab-Runner\receipts\governed-runner-startup\latest.json`;
  `scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh` fails closed
  unless `~/.gitlab-runner/config.toml` retains `concurrent = 2` plus
  `request_concurrency = 2` and
  `vihs-linux-assurance-runner.service` finishes `enabled` and `active`;
  `scripts/gitlab-runner/linux/start-linux-assurance.sh` now reconciles the
  live config back to that dual-concurrency contract, restarts the admitted
  service when needed, and writes the latest Linux startup receipt to
  `$HOME/.gitlab-runner/receipts/linux-assurance-startup/latest.json`;
  `scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh` fails closed
  unless `concurrent = 2`, `request_concurrency = 2`, the admitted user-mode
  service fragment and `ExecStart`, enabled/active service state, and one live
  configured Linux runner process remain intact; and the admitted Windows-host wrapper
  for both lane assertions is `scripts/assertGovernedRunnerLanes.js` via
  `npm run gitlab:runner:assert`; the operator-only Windows recovery rehearsal
  wrapper is `scripts/runWindowsProofRuntimeRecoveryRehearsal.js` via
  `npm run gitlab:runner:windows:recovery:rehearse`, and it fails closed
  unless the admitted Windows host starts clean, seeds one headless LabVIEW
  contamination, runs that same repo-owned recovery script, and refreshes the
  latest retained rehearsal receipt at
  `.cache/windows-proof-runtime-recovery-rehearsal/latest.json`
- the fail-closed pre-tag public-exact proof lane now runs
  `npm run public:exact:pretag:proof -- --evidence-dir public-exact-pretag-proof-evidence`
  before any later exact reopen or tag act can truthfully proceed
- the authoritative matrix for those distinctions is:
  - `docs/product/hosted-ci-governance.md`
  - `docs/product/hosted-ci-governance.json`

Lane-specific CI and gate responsibilities:

- `feature/*`: focused tests plus any affected doc/design gates before merge to
  `develop`; public-exact validation hardening also retains
  `npm run public:exact:pretag:proof` before any later exact reopen is allowed
- `develop`: required checks plus `npm run design:gate` and
  `npm run design:gate:assert-complete` for governance or architecture work
- `release/*`: full required checks, design gates, release-readiness
  normalization, and public-facade proof before merge to `main`
- `hotfix/*`: focused regression checks, affected docs/design gates, and the
  exact released-line package audit before merge to `main`
- `main`: protected exact-release branch; exact SemVer tags are cut only after
  merged `main` is green

Public GitHub admission matrix:

- `Public Source Package Preview / public-source-package-preview`
  - owns `npm run compile`
  - owns `npm run test:design-contract`
  - owns preview VSIX packaging and preview-artifact upload
  - admits `workflow_dispatch` plus bounded `push`/`pull_request` changes on
    `develop`, `main`, `release/*`, and `hotfix/*`
  - uses per-workflow/per-ref concurrency to cancel stale in-progress runs
- `Public Linux Installed-User Smoke / public-linux-installed-user-smoke`
  - owns Docker Linux engine verification
  - owns `npm run public:smoke:linux`
  - owns retained smoke-evidence upload
  - admits `workflow_dispatch` plus bounded `push`/`pull_request` changes on
    `develop`, `main`, `release/*`, and `hotfix/*`
  - uses per-workflow/per-ref concurrency to cancel stale in-progress runs
- `Public Windows Installed-User Contract / public-windows-installed-user-contract`
  - owns `npm run public:contract:windows-installed-user`
  - owns Windows installed-user launcher/runtime-settings contract evidence
  - admits `workflow_dispatch` plus bounded `push`/`pull_request` changes on
    `develop`, `main`, `release/*`, and `hotfix/*`
  - uses per-workflow/per-ref concurrency to cancel stale in-progress runs
- none of the public GitHub admission workflows use a `feature/*` push lane

Requirement-evolution discipline:

- every governed finding shall be classified before slice closeout as either
  `requirements-update-required` or `no-requirement-impact`
- when a finding changes public workflow truth, release truth, branch policy,
  CI posture, runtime boundaries, or user/operator documentation behavior, the
  same slice shall update SRS, RTM, and test-plan coverage
- when a finding does not change normative behavior, the same slice shall
  retain an explicit no-impact rationale in the control plane instead of
  silently skipping requirement review

ADR-evolution discipline:

- every governed finding shall also be classified before slice closeout as
  either `adr-update-required` or `no-adr-impact`
- when a finding changes architectural boundaries, public/private product
  surfaces, release topology, default-branch policy, runtime-provider
  strategy, required-check posture, or public GitHub workflow responsibility
  matrix, the same slice shall update an existing ADR or introduce a new ADR
- when a finding does not change sustained decision truth, the same slice
  shall retain an explicit no-impact rationale in the control plane instead of
  silently skipping ADR review

Required closeout checks for any sustainment slice:

- relevant focused tests
- `npm run docs:bundle`
- `npm run docs:gate:core`
- `npm run design:gate`
- `npm run design:gate:assert-complete`

## Stop Rules

Sustainment may:

- preserve release truth
- preserve bounded benchmark truth
- preserve operator/documentation/control-plane truth

Sustainment may not:

- hide new feature work inside generic maintenance wording
- silently reopen closed benchmark or execution-policy programs
- introduce an execution-policy bypass that skips canonical execution-request
  validation or governed provider hard stops
- introduce PowerShell `ExecutionPolicy Bypass` on governed benchmark-image or
  host-proof helper surfaces
- treat characterization receipts as new governed product truth without
  control-plane normalization

## Next Slice Boundary

Future `PROGRAM-0004` slices should either:

- refresh this sustainment contract because a maintained surface changed, or
- execute one of these retained rules and normalize the outcome

If work instead expands product behavior, it must reopen under a new explicit
program.
