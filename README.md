# VI History Suite

`vi-history-suite` is a Visual Studio Code extension for reviewing LabVIEW VI
history in Git repositories.

## Install The Extension

Use one of these install surfaces:

- install from the VS Code Extensions view
- run `code --install-extension svelderrainruiz.vi-history-suite`
- install the released VSIX when you intentionally need that exact package

First-time setup:

1. Open or restart VS Code once after installation.
2. Open an integrated terminal and run `vihs`.
3. If `vihs` is not available yet, run
   `VI History: Prepare Local Runtime Settings CLI` from the Command Palette,
   then run `vihs` again.
4. Choose the runtime you want to use, then confirm the LabVIEW year and
   bitness.
5. Run `vihs --validate`.

## Compare A VI

1. Open a trusted Git repository that contains a `.vi`, `.ctl`, or `.vit`
   file.
2. Right-click the file in the Explorer and choose `VI History`, or use the
   `VI History` button in the editor title when the file is open.
3. Select exactly two revisions with the checkbox column.
4. Review the compare preflight.
5. Choose `Compare`.

Installed-user help:

- [Home](https://github.com/svelderrainruiz/vi-history-suite/wiki)
- [Install And Release](https://github.com/svelderrainruiz/vi-history-suite/wiki/Install-And-Release)
- [User Workflow](https://github.com/svelderrainruiz/vi-history-suite/wiki/User-Workflow)
- [Comparison Reports And Dashboard Review](https://github.com/svelderrainruiz/vi-history-suite/wiki/Comparison-Reports-And-Dashboard-Review)
- [FAQ](./docs/information-for-users/faq.md)
- [Command Reference](./docs/information-for-users/command-reference.md)

## Topic Roles

- top-level route:
  this README is still the repo top-level route for installed users,
  maintainers, and release-control readers
- retained item index:
  [docs/information-item-map.md](./docs/information-item-map.md)
- durable evidence route:
  [docs/product/public-release-candidate.md](./docs/product/public-release-candidate.md)

## Information For Users

- plan:
  [docs/information-for-users/plan.md](./docs/information-for-users/plan.md)
- audience and task model:
  [docs/information-for-users/audience-and-task-model.md](./docs/information-for-users/audience-and-task-model.md)
- navigation and search:
  [docs/information-for-users/navigation-and-search.md](./docs/information-for-users/navigation-and-search.md)
- delivery profile:
  [docs/information-for-users/delivery-profile.md](./docs/information-for-users/delivery-profile.md)
- style guide:
  [docs/information-for-users/style-guide.md](./docs/information-for-users/style-guide.md)
- glossary:
  [docs/information-for-users/glossary.md](./docs/information-for-users/glossary.md)
- FAQ:
  [docs/information-for-users/faq.md](./docs/information-for-users/faq.md)
- command reference:
  [docs/information-for-users/command-reference.md](./docs/information-for-users/command-reference.md)

## Supported Today

- Windows defaults to local `LabVIEWCLI`
- run `vihs --validate` before the first compare on a fresh machine
- right-click a `.vi`, `.ctl`, or `.vit` file in the Explorer, or use the
  editor-title `VI History` action, to start a comparison
- if Docker is selected, install or start Docker Desktop or Docker before the
  first compare
- host Windows LabVIEW years `2020` through `2026` are selectable when they
  are installed locally
- `docker/windows` is supported for `2026` `x64` only
- Docker years before `2026` are unsupported
- `docker/linux` for `2026` and `host/linux` are not currently implemented
- blocked or unsupported paths fail closed with explicit next-step guidance

## Report A Problem Or Request Support

If install, `vihs`, `vihs --validate`, or compare do not work as expected, use
the public GitHub issue templates:

- [Issue Chooser](https://github.com/svelderrainruiz/vi-history-suite/issues/new/choose)
- [Bug Report](https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=bug-report.yml)
- [LabVIEW Version Support Request](https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=labview-version-support.yml)
- [Feature Request](https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=feature-request.yml)

Useful issue facts:

- extension version and VS Code version
- whether the problem happened during the install bootstrap, `vihs`,
  `vihs --validate`, or compare
- provider, LabVIEW year, and bitness
- the current `vihs --validate` output
- exact reproduction steps and the current vs expected result

## Common Tasks

- use the installed extension:
  install from the VS Code Extensions view, `code --install-extension`, or an
  exact released VSIX, then run `vihs --validate`, then `VI History`
- run proof surfaces:
  `npm run proof:run -- report-smoke` and
  `npm run proof:run -- host-operation-matrix`
- evaluate a public repo in Codespaces:
  use [INSTALL.md](./INSTALL.md),
  `https://github.com/svelderrainruiz/vi-history-suite/wiki/Review-Public-LabVIEW-VI-Changes`,
  and `npm run public:repo:clone`
- review release/publication evidence:
  use [docs/product/public-release-candidate.md](./docs/product/public-release-candidate.md)

## Troubleshooting

- installed-user questions:
  [docs/information-for-users/faq.md](./docs/information-for-users/faq.md)
- command lookup:
  [docs/information-for-users/command-reference.md](./docs/information-for-users/command-reference.md)
- issue reporting:
  [Issue Chooser](https://github.com/svelderrainruiz/vi-history-suite/issues/new/choose)
- maintainers and release-control:
  use the authority routes below instead of treating the README as the only
  manual

## Evaluate From Source

- [INSTALL.md](./INSTALL.md)
- [Fork Codespace Quickstart](https://github.com/svelderrainruiz/vi-history-suite/wiki/Fork-Codespace-Quickstart)
- [Review Public LabVIEW VI Changes](https://github.com/svelderrainruiz/vi-history-suite/wiki/Review-Public-LabVIEW-VI-Changes)
- [Refresh Codespace Repositories](https://github.com/svelderrainruiz/vi-history-suite/wiki/Refresh-Codespace-Repositories)

## Contribute

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [Issue Chooser](https://github.com/svelderrainruiz/vi-history-suite/issues/new/choose)

## Authority And Release Control

For release/publication truth and maintainer-facing evidence, use these route
documents instead of treating this README as the only manual:

- [SHIP-0001: Releasable VI History Suite](./docs/product/SHIP-0001-releasable-vi-history-suite.md)
- [Release Readiness Matrix](./docs/product/release-readiness-matrix.json)
- [Blocker Ledger](./docs/product/blocker-ledger.json)
- public release candidate:
  [docs/product/public-release-candidate.md](./docs/product/public-release-candidate.md)
- software factory assessment contract:
  [scripts/runSoftwareFactoryOrchestrator.js](./scripts/runSoftwareFactoryOrchestrator.js)
- [Documentation Coherence Ledger](./docs/product/documentation-coherence-ledger.md)
- [Wiki Authority Map](./docs/product/wiki-authority-map.md)
- [Wiki Coverage Matrix](./docs/product/wiki-coverage-matrix.json)
- [Wiki Seed Plan](./docs/product/wiki-seed-plan.md)
- [Wiki Publication Ledger](./docs/product/wiki-publication-ledger.md)
- [Wiki Publication Ledger JSON](./docs/product/wiki-publication-ledger.json)
- [Debt Retirement Contract](./docs/product/debt-retirement-contract.md)
- [Debt Ledger JSON](./docs/product/debt-ledger.json)
- Marketplace publication ledger:
  [docs/product/vscode-marketplace-publication-ledger.md](./docs/product/vscode-marketplace-publication-ledger.md)
- [Hosted CI Governance](./docs/product/hosted-ci-governance.md)
- [Hosted CI Governance JSON](./docs/product/hosted-ci-governance.json)
- [Program Repo Jump](./docs/product/program-repo-jump.md)
- [Public GitHub Source Authority Map](./docs/product/public-github-source-authority-map.md)
- [Public GitHub Source Publication Ledger](./docs/product/public-github-source-publication-ledger.md)
- [Public GitHub Source Publication Ledger JSON](./docs/product/public-github-source-publication-ledger.json)
- [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
- [Release Procedure](./docs/release-procedure.md)
- [Documentation Package Workbench](./docs/documentation-workbench.md)

Authority release facts:

- `SHIP-0001`: releasable `v0.2.0` VSIX product
- landed ship tranche: `TRANCHE-009`
- retained exact-version releases: `v0.2.0`, `v1.0.0`, `v1.0.1`, `v1.0.2`, `v1.0.3`, `v1.0.4`, `v1.0.5`, `v1.0.6`, `v1.1.0`, `v1.2.0`, `v1.2.1`, `v1.2.2`, `v1.3.0`, `v1.3.1`, `v1.3.2`, `v1.3.3`, `v1.3.4`, `v1.3.5`, `v1.3.6`, `v1.3.7`
- burned exact release line: `v1.0.2`
- current exact released line: `v1.3.7`
- current published package line on `main`: `1.3.7`
- current develop package line on `develop`: `1.3.7`
- active exact release candidate line on `develop`: none
- active release-candidate branch: none
- active exact hotfix candidate line on `main`: none
- active hotfix branch: none
- active feature-lane public GitHub release hardening branch on `develop`:
  none
- active software-factory governance branch on `develop`:
  none
- later SemVer openings beyond `1.3.7` are frozen while exact `v1.3.7`
  closeout remains incomplete on the separate Marketplace surface
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
- VS Code Marketplace prep package script:
  `npm run vscode:marketplace:prepare`
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
- retained VS Code Marketplace prep receipt:
  `.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json`
- software-factory phase contract:
  assess, rehearse, and repair remain admitted non-production phases, and
  publish / verify are now retained as guarded non-mutating contract phases
- no later SemVer opening, Marketplace publication, or other production
  mutation is permitted outside the repo-owned factory/orchestrator closeout
  path while exact `v1.3.7` remains open on the separate Marketplace surface
- active Windows x64 private-release-prep slice: historical `release/1.3.1`
- active Windows x64 private-release packet:
  [docs/product/private-release-windows-x64-v1.3.1.md](./docs/product/private-release-windows-x64-v1.3.1.md)
- active Windows x64 private-release packet JSON:
  [docs/product/private-release-windows-x64-v1.3.1.json](./docs/product/private-release-windows-x64-v1.3.1.json)
- current Windows x64 private GitLab release: `private-v1.3.1-windows-x64`
- current private GitLab release URL:
  `https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.1-windows-x64`
- current Windows x64 private-release publish receipt:
  `.cache/private-release-publish/latest/private-release-publish.json`
- retained Windows x64 historical prior-line private-release packet: `v1.3.0`
- fresh `v1.3.1` Windows host/container acceptance receipt set:
  `windows-private-release-evidence/manifest.json`
- separate public GitHub exact release publication: published; public `main`
  now publishes `704e629`, public tag `v1.3.7` is live, GitHub release
  `312517425` is published at
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.7`,
  and the exact assets match the retained authority manifest
- VS Code Marketplace retained published version: `1.3.0`
- VS Code Marketplace publication prep is ready and non-mutating:
  `npm run vscode:marketplace:prepare` proves the public GitHub `v1.3.7`
  verify gate, exact authority VSIX/checksum evidence, live Marketplace
  `1.3.0` readback, local PAT locator, and pinned `vsce` publish command
  shape without retaining secret material or publishing.
- public GitHub default branch: `main`
- public Codespaces evaluation branch: `develop`
- integration branch: `develop`
- protected exact-release line: `main`
- release-candidate branch family: `release/*`
- hotfix branch family: `hotfix/*`
- next-line branch model: `GitFlow`
- hosted automation governance matrix: [docs/product/hosted-ci-governance.md]
- current changelog: [CHANGELOG.md](./CHANGELOG.md)
- `TRANCHE-016`: installed local LabVIEWCLI contract and explicit compare
  workflow with bounded expert Docker
- `TRANCHE-014`: public Codespaces public-repo bootstrap
- `TRANCHE-015`: historical first-run Docker onboarding and fail-closed
- `TRANCHE-010`: public-source facade and public-product acceptance is a closed tranche
- active control-plane direction:
  [PROGRAM-0005](./docs/product/execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md),
  `TRANCHE-012`, `TRANCHE-016`, `ISSUE-0412`, and `ISSUE-0414`
- preview install surface: `preview-evidence/vi-history-suite-<version>.vsix`
- governed tagged release artifact and release manifest live under
  `release-evidence/`
- docs-workbench image:
  `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main`
- assurance-workbench image:
  `registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main`
- Linux Assurance Runner Lane:
  [docs/product/linux-assurance-runner-lane.md](./docs/product/linux-assurance-runner-lane.md)
- debt and wiki coverage control-plane routes:
  `docs/product/debt-retirement-contract.md`,
  `docs/product/debt-ledger.json`,
  and `docs/product/wiki-coverage-matrix.json`
- use `npm run design:gate:assert-complete` before exact release or publication
- private GitHub experiment repo remains a separate source-evaluation surface
