# GitHub-First Simplification Analysis

Date: 2026-05-24

## Target State

VI History Suite moves from the current GitLab-authority/public-facade model to
a GitHub-first public repository:

- primary repository:
  `https://github.com/LabVIEW-Community-CI-CD/vi-history-suite`
- active branch model: `main` trunk with short-lived feature branches
- license: BSD0 / `0BSD` for the whole repository
- Marketplace identity: keep the published VS Code extension ID stable
- validation posture: devcontainer/Codespaces first, lightweight CI second,
  optional Vagrant for humans who want local Windows/LabVIEW proof
- GitLab role after migration: read-only historical source

## Current Facts

- The working repository started on `develop` with `origin` pointing to
  `https://gitlab.com/svelderrainruiz/vi-history-suite.git`.
- The target GitHub organization repository already exists publicly on `main`
  with a placeholder commit and no releases.
- The Marketplace item currently resolves as
  `svelderrainruiz.vi-history-suite`; package metadata must preserve that
  installed extension identity while links move to the new organization repo.
- Root `LICENSE` was PolyForm Strict before this work, and `package.json`
  used `SEE LICENSE IN LICENSE`.
- `package.json` contained 112 npm scripts, including GitLab authority,
  private release, public source promotion, governed proof, and Vagrant
  release-gate scripts.
- The working tree contained active `.gitlab-ci.yml`, five GitHub workflows,
  a `public-github-source/` facade snapshot, and extensive docs/tests that
  asserted GitLab authority and private-release behavior.

## Question Rounds And Locked Decisions

- Scope: GitHub-first public repo; GitLab becomes historical/read-only.
- Testing contract: devcontainer-primary human validation.
- Cleanup posture: retire historical machinery instead of preserving active
  compatibility.
- License: whole repo becomes BSD0 / `0BSD`.
- Branch model: `main` trunk; retire `develop`, `release/*`, `hotfix/*`
  governance language from active docs.
- Package identity: keep Marketplace identity stable and move metadata URLs.
- Migration history: preserve Git history by replacing the placeholder GitHub
  repo history during the migration.
- Historical material: remove from the active repo, relying on Git history and
  retained tags for detailed old evidence.
- Vagrant role: manual local helper only.
- GitHub CI: one lightweight required workflow for install, typecheck, tests,
  and package/build sanity.
- Contribution policy: accept normal pull requests under BSD0 / `0BSD`.

## Viability Assessment

The desired simplification is viable, but it is not a small metadata-only
change. The old repository encoded release authority in code, tests, workflows,
and product documents. Safe simplification requires deleting or rewriting those
assertions together; otherwise the old tests and docs will continue to pull the
project back toward GitLab authority.

The main implementation risk is package identity. The public Marketplace item
is `svelderrainruiz.vi-history-suite`, while the checked-in package manifest
started with `name: vi-history`. The simplified repo must align the manifest
with the published extension ID unless a separate Marketplace migration is
opened later.

The second risk is over-deleting developer utilities that are still useful.
The cleanup should keep the core extension, devcontainer, source-evaluation
fixture helpers, package/build commands, and optional Vagrant files while
removing only the release-control machinery that no longer matches the target
state.

## Removal And Rewrite Backlog

- Replace PolyForm Strict license text with BSD0 / `0BSD`.
- Align `package.json` identity and URLs with
  `LabVIEW-Community-CI-CD/vi-history-suite`.
- Reduce npm scripts to core development, docs bundle, public fixture helper,
  optional Vagrant validation, tests, and package commands.
- Delete `.gitlab-ci.yml`.
- Replace GitHub workflows with a single lightweight CI workflow.
- Remove `public-github-source/`.
- Remove scripts dedicated to GitLab authority, private release, release
  control, governed proof, public-source promotion, and heavy proof ledgers.
- Replace restrictive contribution text with BSD0 contribution expectations.
- Rewrite README/INSTALL/FIRST-RUN/TROUBLESHOOTING as concise public docs.
- Rewrite architecture docs to describe the active GitHub-first extension,
  not the old control plane.
- Remove tests that assert retired governance, GitLab, private-release,
  public-source-promotion, or Vagrant release-gate behavior.
- Keep Vagrant assets as optional human-local tooling and add a short guide.

## Acceptance Checks

- `npm ci`
- `npm run check`
- `npm test`
- `npm run package`
- `vagrant validate` when Vagrant is installed
- `rg` checks showing active docs/scripts no longer claim GitLab authority,
  private release gates, PolyForm licensing, or old personal GitHub repo URLs
  except where retained in historical changelog text.

## Implementation Pass 1

Completed on 2026-05-24:

- Changed the root license and package metadata to BSD0 / `0BSD`.
- Preserved the Marketplace extension identity while moving repository,
  homepage, and issue links to the GitHub organization repository.
- Replaced the GitHub workflow set with one lightweight CI workflow.
- Removed GitLab CI, the public-source facade snapshot, Docker proof images,
  heavy release-control documents, retired proof scripts, and retired tests.
- Kept the extension source, devcontainer, public fixture clone helper,
  package audit, integration host helpers, and optional Vagrant files.
- Rewrote active user/developer docs around GitHub-first public development,
  devcontainer/Codespaces validation, and optional Vagrant.
- Removed the old harness-backed `vihs validate-fixture` command because it
  depended on the retired proof harness; retained `vihs --validate` for local
  runtime settings validation.

Verification on this workstation:

- `npm ci`: passed.
- `npm run check`: passed.
- `npm test`: passed, 122 tests and 1 skipped test.
- `npm run package`: passed; generated VSIX was removed from the working tree.
- `vagrant validate`: not run because `vagrant` is not installed on this host.
- `rg` cleanup check: only intentional historical references remain in this
  analysis document and negative package-manifest assertions.
