# Maintainer Control Plane Index

## Purpose

This is the maintainer route for release/publication truth, authority routes,
and retained control-plane facts. The Marketplace README is installed-user
first and intentionally does not carry this dashboard.

## Authority And Release Control

For release/publication truth and maintainer-facing evidence, use these route
documents:

- [SHIP-0001: Releasable VI History Suite](./SHIP-0001-releasable-vi-history-suite.md)
- [Release Readiness Matrix](./release-readiness-matrix.json)
- [Blocker Ledger](./blocker-ledger.json)
- [Public Release Candidate](./public-release-candidate.md)
- software factory assessment contract:
  [scripts/runSoftwareFactoryOrchestrator.js](../../scripts/runSoftwareFactoryOrchestrator.js)
- [Documentation Coherence Ledger](./documentation-coherence-ledger.md)
- [Wiki Authority Map](./wiki-authority-map.md)
- [Wiki Coverage Matrix](./wiki-coverage-matrix.json)
- [Wiki Seed Plan](./wiki-seed-plan.md)
- [Wiki Publication Ledger](./wiki-publication-ledger.md)
- [Wiki Publication Ledger JSON](./wiki-publication-ledger.json)
- [Debt Retirement Contract](./debt-retirement-contract.md)
- [Debt Ledger JSON](./debt-ledger.json)
- [VS Code Marketplace Publication Ledger](./vscode-marketplace-publication-ledger.md)
- [Hosted CI Governance](./hosted-ci-governance.md)
- [Hosted CI Governance JSON](./hosted-ci-governance.json)
- [Program Repo Jump](./program-repo-jump.md)
- [Information Item Map](../information-item-map.md)
- [Public GitHub Source Authority Map](./public-github-source-authority-map.md)
- [Public GitHub Source Publication Ledger](./public-github-source-publication-ledger.md)
- [Public GitHub Source Publication Ledger JSON](./public-github-source-publication-ledger.json)
- [Work Item 0001 Installed-User Onboarding Publication Route](./work-item-0001-installed-user-onboarding-publication-route-2026-05-15.md)
- [Post-Publication Installed-User Acceptance Campaign](./post-publication-installed-user-acceptance-campaign-2026-05-15.md)
- [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
- [Release Procedure](../release-procedure.md)
- [Documentation Package Workbench](../documentation-workbench.md)

## Authority Release Facts

### Retained Historical Ship Evidence

- `SHIP-0001`: releasable `v0.2.0` VSIX product
- landed ship tranche: `TRANCHE-009`
- historical ship-control line: `v0.2.0` is retained for the first immutable
  ship record and must not be presented as the current installed-user release
  line

### Current Exact Release Truth

- retained exact-version releases: `v0.2.0`, `v1.0.0`, `v1.0.1`, `v1.0.2`, `v1.0.3`, `v1.0.4`, `v1.0.5`, `v1.0.6`, `v1.1.0`, `v1.2.0`, `v1.2.1`, `v1.2.2`, `v1.3.0`, `v1.3.1`, `v1.3.2`, `v1.3.3`, `v1.3.4`, `v1.3.5`, `v1.3.6`, `v1.3.7`, `v1.3.8`, `v1.3.9`, `v1.3.14`, `v1.3.15`, `v1.3.16`
- burned exact release line: `v1.0.2`
- current exact released line: `v1.3.16`
- current fully published exact package line: `1.3.16`
- current authority package line on `main`: `1.3.16`
- current develop package line on `develop`: `1.3.16`
- active exact release candidate line on `develop`: none
- active release-candidate branch: none; retained release-candidate branches:
  `release/1.3.15`, `release/1.3.16`
- active release-candidate state:
  none; exact `v1.3.16` is published across GitLab authority, public GitHub,
  and VS Code Marketplace, with protected `main` merged into the closeout
  branch for `develop` retention
- active exact hotfix candidate line on `main`: none
- active hotfix branch: none
- active feature-lane public GitHub release hardening branch on `develop`:
  none
- active software-factory governance branch on `develop`:
  none
- exact authority `v1.3.16` is now fully published across GitLab authority,
  public GitHub, and VS Code Marketplace, while blocked historical public
  GitHub incident evidence for `v1.3.8` remains retained separately
- active pre-tag public-exact proof package script:
  `npm run public:exact:pretag:proof`
- active pre-tag public-exact proof GitLab job: `public_exact_pretag_proof`
- public GitHub exact transaction verification package script:
  `npm run public:github:exact:transaction:verify`
- retained public GitHub exact transaction receipt:
  `.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json`
- VS Code Marketplace publication prep package script:
  `npm run vscode:marketplace:prepare`
- retained VS Code Marketplace publication prep receipt:
  `.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json`
- VS Code Marketplace community-validation preview prep package script:
  `npm run vscode:marketplace:community-preview:prepare`
- retained VS Code Marketplace community-validation preview prep receipt:
  `.cache/vscode-marketplace-community-validation-preview-prep/latest/vscode-marketplace-community-validation-preview-prep.json`
- software factory assessment package script:
  `npm run software:factory:assess`
- software factory rehearsal package script:
  `npm run software:factory:rehearse`
- software factory repair package script:
  `npm run software:factory:repair`
- software factory publish package script:
  `npm run software:factory:publish`
- software factory verify package script:
  `npm run software:factory:verify`
- retained software factory assessment receipt:
  `.cache/software-factory-orchestrator/latest/software-factory-state.json`
- retained software factory rehearsal receipt:
  `.cache/software-factory-orchestrator/latest/rehearse/software-factory-state.json`
- retained software factory repair receipt:
  `.cache/software-factory-orchestrator/latest/repair/software-factory-state.json`
- retained software factory publish receipt:
  `.cache/software-factory-orchestrator/latest/publish/software-factory-state.json`
- retained software factory verify receipt:
  `.cache/software-factory-orchestrator/latest/verify/software-factory-state.json`
- software-factory phase contract:
  assess, rehearse, and repair remain admitted non-production phases, and
  publish / verify are retained as guarded non-mutating contract phases
- exact authority `v1.3.16` is fully closed across public GitHub and VS Code
  Marketplace; later SemVer openings return to normal GitFlow governance while
  `v1.3.8` remains retained as blocked historical publication evidence
- active governed release claim: none; the `v1.3.16` exact release is published
  and retained
- next admitted release-control action:
  `retain-v1.3.16-marketplace-closeout-on-protected-develop`
- next product-observation action:
  `run-post-publication-installed-user-acceptance-campaign`
- post-publication installed-user acceptance campaign:
  [post-publication-installed-user-acceptance-campaign-2026-05-15.md](./post-publication-installed-user-acceptance-campaign-2026-05-15.md)
- post-publication installed-user observation cadence:
  [post-publication-installed-user-observation-cadence-2026-05-16.md](./post-publication-installed-user-observation-cadence-2026-05-16.md)
- installed-user observation cadence model:
  `event-driven-with-monthly-review-while-public-intake-open`
- next installed-user observation cycle: run on the next public intake signal,
  installed-user proof change, candidate-opening decision that affects
  onboarding, or no later than `2026-06-14` while public intake issue `#98`
  remains open
- campaign boundary: published Marketplace state is not first-time
  installed-user acceptance proof
- current Marketplace stable version: `1.3.16`
- retained Marketplace public validation target: `1.3.13`
- active public validation publication trigger:
  published through public GitHub PR #46 and pinned `vsce --pre-release`
- retained Windows x64 private-release-prep slice: historical `release/1.3.1`
- retained Windows x64 private-release packet:
  [private-release-windows-x64-v1.3.1.md](./private-release-windows-x64-v1.3.1.md)
- retained Windows x64 private-release packet JSON:
  [private-release-windows-x64-v1.3.1.json](./private-release-windows-x64-v1.3.1.json)
- current Windows x64 private GitLab release: `private-v1.3.1-windows-x64`
- current private GitLab release URL:
  `https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.1-windows-x64`
- current Windows x64 private-release publish receipt:
  `.cache/private-release-publish/latest/private-release-publish.json`
- retained Windows x64 historical prior-line private-release packet: `v1.3.0`
- Windows host/container acceptance receipt set:
  `windows-private-release-evidence/manifest.json` is deferred on this
  Ubuntu-only machine unless `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true`
- separate public GitHub exact release publication: published; public tag
  `v1.3.16` peels to `f679023ed760963779d9331a9395128ad01c7e54`, GitHub
  release `320824958` is published at
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.16`,
  and the exact assets match the retained authority manifest under
  `.cache/gitlab-release-artifacts/v1.3.16/expanded/release-evidence/`
- current public GitHub source publication: public `main` now publishes
  `12798e46f14d6cac14eaf7381bbb62cc5ee012db` after public PRs #93-#97 adopted
  the Windows proof handoff, installed-user troubleshooting guide, runtime
  bitness UX, history-panel decluttering, and focused UX tests following public
  PR #91's first-run local LabVIEW guide, public PR #90's intake-surface
  normalization, and public PR #89's installed-user support matrix adoption; the
  exact `v1.3.16` source remains retained at
  `f679023ed760963779d9331a9395128ad01c7e54` after public PR #88, and public
  PR #69, PR #68, and PR #60 remain retained historical public-facade evidence
  for earlier source, intake, and fixture-docs promotions at `f1cb609`,
  `220111e`, and `ce6dbd0`
- public GitHub public-validation pre-release:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.13-public-validation-prerelease-1`
- VS Code Marketplace retained published version: `1.3.16`
- VS Code Marketplace community-validation preview published version:
  `1.3.13`
- VS Code Marketplace public validation target version: `1.3.13`
- VS Code Marketplace stable published version: `1.3.16`
- VS Code Marketplace community-validation preview Marketplace last updated:
  `2026-04-27T04:24:05.457Z`
- VS Code Marketplace community-validation preview VSIX SHA-256:
  `3b1d83632b8126b597a9db8c98f2737fd988458ecf6c4d74e4f5c3349d16036f`
- blocked historical publication incident: public GitHub release `312768592`
  for `v1.3.8` is published and immutable with zero assets; retain it as
  historical evidence only while the current live Marketplace version is
  `1.3.16`
- VS Code Marketplace publication prep and final publication are retained:
  `npm run vscode:marketplace:prepare` proves the public GitHub `v1.3.16`
  verify gate, exact authority VSIX/checksum evidence, live Marketplace
  `1.3.16` readback, local PAT locator, and pinned `vsce` publish command
  shape without retaining secret material.
- public GitHub default branch: `main`
- public Codespaces evaluation branch: `develop`
- integration branch: `develop`
- protected exact-release line: `main`
- release-candidate branch family: `release/*`
- hotfix branch family: `hotfix/*`
- next-line branch model: `GitFlow`
- hosted automation governance matrix:
  [hosted-ci-governance.md](./hosted-ci-governance.md)
- current changelog:
  [CHANGELOG.md](../../CHANGELOG.md)
- `TRANCHE-016`: installed local LabVIEWCLI contract and explicit compare
  workflow with bounded expert Docker
- `TRANCHE-014`: public Codespaces public-repo bootstrap
- `TRANCHE-015`: historical first-run Docker onboarding and fail-closed
- `TRANCHE-010`: public-source facade and public-product acceptance is a closed
  tranche
- public source clone command:
  `npm run public:repo:clone`
- governed proof commands:
  `npm run proof:run -- report-smoke` and
  `npm run proof:run -- host-operation-matrix`
- active control-plane direction:
  [PROGRAM-0005](./execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md),
  `TRANCHE-012`, `TRANCHE-016`, `ISSUE-0412`, `ISSUE-0414`, and `ISSUE-0415`
- preview install surface: `preview-evidence/vi-history-<version>.vsix`
- governed tagged release artifact and release manifest live under
  `release-evidence/`
- docs-workbench image:
  `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main`
- assurance-workbench image:
  `registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main`
- Linux Assurance Runner Lane:
  [linux-assurance-runner-lane.md](./linux-assurance-runner-lane.md)
- debt and wiki coverage control-plane routes:
  `docs/product/debt-retirement-contract.md`,
  `docs/product/debt-ledger.json`,
  and `docs/product/wiki-coverage-matrix.json`
- use `npm run design:gate:assert-complete` before exact release or publication
- private GitHub experiment repo remains a separate source-evaluation surface
