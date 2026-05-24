# GitHub Cutover Runbook

Date: 2026-05-24

## Purpose

Move VI History Suite from the GitLab-hosted working repository to the public
GitHub organization repository while preserving Git history, keeping the
Marketplace identity stable, and leaving release/version publication for a
separate phase.

## Fixed Inputs

- GitLab source remote before cutover:
  `https://gitlab.com/svelderrainruiz/vi-history-suite.git`
- GitHub destination remote:
  `https://github.com/LabVIEW-Community-CI-CD/vi-history-suite.git`
- Current GitHub placeholder `main` SHA:
  `7f48c039753b8c731b4bc93f5c07b8158507c31d`
- Simplification implementation commit before this runbook:
  `7b2a297c9cf7fd4b6117bdb4077c1a67e7a6386e`
- Placeholder backup ref:
  `refs/heads/archive/github-placeholder-main-2026-05-24`
- Final local branch used for cutover:
  `feature/github-simplification-analysis`

## Preflight

Run from a clean working tree on `feature/github-simplification-analysis`:

```powershell
git status --short --branch
npm ci
npm run check
npm test
npm run package
rg -n "gitlab:private-release|private-release|PolyForm|svelderrainruiz/vi-history-suite|public-github-source|governed|Governed|governance|Governance" README.md INSTALL.md CONTRIBUTING.md FIRST-RUN.md TROUBLESHOOTING.md LICENSE package.json .github docs resources vagrant .devcontainer .vscode scripts src tests/unit
```

The `rg` command may report only intentional historical references in
`docs/simplification/*` and negative assertions in manifest tests.

Remove the generated VSIX after packaging if it appears in the working tree:

```powershell
Remove-Item -LiteralPath .\vi-history-suite-0.1.0.vsix -Force -ErrorAction SilentlyContinue
```

## Remote Layout

Rename the existing GitLab remote and make GitHub the new `origin`:

```powershell
git remote rename origin gitlab
git remote add origin https://github.com/LabVIEW-Community-CI-CD/vi-history-suite.git
git remote -v
```

If the GitHub remote already exists, update it instead:

```powershell
git remote set-url origin https://github.com/LabVIEW-Community-CI-CD/vi-history-suite.git
```

## Guarded GitHub Push

Confirm GitHub `main` still points to the placeholder commit:

```powershell
git ls-remote --heads origin main
```

Expected:

```text
7f48c039753b8c731b4bc93f5c07b8158507c31d refs/heads/main
```

Create the backup branch before replacing `main`:

```powershell
git push origin 7f48c039753b8c731b4bc93f5c07b8158507c31d:refs/heads/archive/github-placeholder-main-2026-05-24
```

Force-update GitHub `main` using a lease tied to the expected placeholder SHA:

```powershell
$cutoverSha = git rev-parse HEAD
git push --force-with-lease=refs/heads/main:7f48c039753b8c731b4bc93f5c07b8158507c31d origin "$cutoverSha`:refs/heads/main"
```

Publish public release tags only. Do not push `private-*` tags:

```powershell
$publicTags = @(git tag --list "v*")
$publicTags += "rc-v1.3.17"
git push origin $publicTags
```

Do not push GitLab `develop`, `release/*`, or feature branches to GitHub.

## Verification

Verify GitHub refs:

```powershell
git ls-remote --heads origin
git ls-remote --tags origin
```

Expected heads:

- `refs/heads/main` points to the cutover SHA.
- `refs/heads/archive/github-placeholder-main-2026-05-24` points to
  `7f48c039753b8c731b4bc93f5c07b8158507c31d`.
- No `develop`, `release/*`, or feature branches exist on GitHub.

Verify from a fresh clone:

```powershell
git clone https://github.com/LabVIEW-Community-CI-CD/vi-history-suite.git vi-history-suite-cutover-check
cd vi-history-suite-cutover-check
npm ci
npm run check
npm test
```

GitHub Actions must pass the `Build, Test, Package` job on `main`.

## GitHub Admin Checklist

Complete these settings in GitHub after the first successful `main` CI run:

- Enable Issues.
- Keep Discussions disabled.
- Keep Wiki disabled.
- Make `main` the default branch.
- Protect `main`.
- Require the `Build, Test, Package` status check.
- Require pull requests before merging.
- Disallow direct pushes after migration.

## GitLab Admin Checklist

Complete these settings in GitLab after GitHub verification:

- Update the project description to point to
  `https://github.com/LabVIEW-Community-CI-CD/vi-history-suite`.
- Archive the GitLab project as read-only historical context.
- Do not rewrite GitLab `main`.
- Do not add a GitLab-only README pointer.
- Do not import GitLab issues into GitHub.

## Rollback

If the GitHub `main` force-update succeeds but verification fails:

```powershell
git push --force-with-lease origin 7f48c039753b8c731b4bc93f5c07b8158507c31d:refs/heads/main
```

Leave the archive branch in place. Do not delete tags unless a wrong tag was
published by mistake; if that happens, delete only the specific incorrect tag
after confirming it is not used by a release.
