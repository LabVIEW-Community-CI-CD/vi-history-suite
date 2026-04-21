# VI History Suite

`vi-history-suite` is a Visual Studio Code extension for reviewing LabVIEW VI
history in Git repositories.

## Install And Use

If you want to install the extension and use it locally, start here. You do
not need to fork this repo, learn the branch model, or read the internal
release-control material first.

In Windows PowerShell, run:

```powershell
irm https://gitlab.com/svelderrainruiz/vi-history-suite/-/raw/develop/scripts/install-vihs-extension.ps1 | iex
```

The bootstrap:

- installs or updates the Marketplace extension
- seeds missing settings to `host/windows/2026/x64`
- reads back the current settings so you can press `Enter` to keep them or
  change provider, LabVIEW year, and bitness
- prints the follow-up `vihs` commands for later changes and validation

Then:

1. Run `vihs --validate`.
2. Open a trusted Git repo containing an eligible LabVIEW VI.
3. Run `VI History`.
4. Select exactly two retained revisions with the commit checkboxes.
5. Review the explicit compare preflight.
6. Choose `Compare`.

Installed-user help:

- Home:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki`
- Install and release:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki/Install-And-Release`
- User workflow:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki/User-Workflow`
- Comparison reports and dashboard review:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki/Comparison-Reports-And-Dashboard-Review`
- FAQ:
  [docs/information-for-users/faq.md](./docs/information-for-users/faq.md)
- Command reference:
  [docs/information-for-users/command-reference.md](./docs/information-for-users/command-reference.md)

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

- issue chooser:
  `https://github.com/svelderrainruiz/vi-history-suite/issues/new/choose`
- bug report:
  `https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=bug-report.yml`
- LabVIEW version support request:
  `https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=labview-version-support.yml`
- feature request:
  `https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=feature-request.yml`

Useful issue facts:

- extension version and VS Code version
- whether the problem happened during the install bootstrap, `vihs`,
  `vihs --validate`, or compare
- provider, LabVIEW year, and bitness
- the current `vihs --validate` output
- exact reproduction steps and the current vs expected result

## Common Tasks

- use the installed extension:
  run the Windows PowerShell bootstrap, then `vihs --validate`, then `VI History`
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
  `https://github.com/svelderrainruiz/vi-history-suite/issues/new/choose`
- maintainers and release-control:
  use the authority routes below instead of treating the README as the only
  manual

## Need Source Evaluation Or Contribution?

Installed users can stop above. Source evaluation and contribution are
separate from the first-use install path:

- public install and evaluation guide:
  [INSTALL.md](./INSTALL.md)
- contribution guide:
  [CONTRIBUTING.md](./CONTRIBUTING.md)
- public sample quickstart:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki/Fork-Codespace-Quickstart`
- review any public repo:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki/Review-Public-LabVIEW-VI-Changes`
- refresh an existing Codespace:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki/Refresh-Codespace-Repositories`

Use `main` when you only need the latest exact released source. Use `develop`
when you are evaluating the next public candidate.

## Authority And Release Control

For release/publication truth and maintainer-facing evidence, use these route
documents instead of treating this README as the only manual:

- [SHIP-0001: Releasable VI History Suite](./docs/product/SHIP-0001-releasable-vi-history-suite.md)
- [Release Readiness Matrix](./docs/product/release-readiness-matrix.json)
- [Blocker Ledger](./docs/product/blocker-ledger.json)
- public release candidate:
  [docs/product/public-release-candidate.md](./docs/product/public-release-candidate.md)
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
- retained exact-version releases: `v0.2.0`, `v1.0.0`, `v1.0.1`, `v1.0.2`, `v1.0.3`, `v1.0.4`, `v1.0.5`, `v1.0.6`, `v1.1.0`, `v1.2.0`, `v1.2.1`, `v1.2.2`, `v1.3.0`
- burned exact release line: `v1.0.2`
- current exact released line: `v1.3.0`
- current published package line on `main`: `1.3.0`
- current develop package line on `develop`: `1.3.1`
- active exact release candidate line on `develop`: `v1.3.1`
- active release-candidate branch: `release/1.3.1`
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
