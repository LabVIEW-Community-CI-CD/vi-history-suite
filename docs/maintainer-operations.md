# Maintainer Operations

This repository uses a lightweight GitHub-first operating model. Hosted CI is
the public merge gate. Maintainer-only validation is used for local
Windows/LabVIEW confidence and release evidence, but it is not a public pull
request gate.

## Release Flow

1. Prepare the release on `main` through a pull request.
2. Confirm hosted CI passes.
3. Tag the exact release on the merged `main` commit.
4. Create the GitHub Release from the existing tag.
5. Package and publish to the VS Code Marketplace manually.
6. Verify the Marketplace version and links with:

   ```powershell
   node scripts/runPinnedVsce.js show svelderrainruiz.vi-history-suite --json
   ```

The Marketplace extension identity remains `svelderrainruiz.vi-history-suite`.
Source, support, and release links point to
`https://github.com/LabVIEW-Community-CI-CD/vi-history-suite`.

Do not attach VSIX files to GitHub Releases unless a future release plan makes
GitHub a second install channel. The Marketplace is the install channel.

## Token Handling

Marketplace publishing tokens are local, short-lived maintainer secrets.

- Do not commit tokens.
- Do not store tokens in this repository.
- Do not add Marketplace tokens to GitHub Actions secrets for the first
  operations pass.
- Delete temporary token files immediately after use.
- Revoke or rotate temporary Marketplace tokens after publication.

GitHub secret scanning and push protection are enabled for this repository.

## Validation Surfaces

| Surface | Role | Release Claim |
| --- | --- | --- |
| Hosted GitHub CI | Required public merge gate on Ubuntu | Required before merge |
| Codespaces/devcontainer | Primary source-evaluation path | Human/source confidence |
| Maintainer Windows/LabVIEW runner | Trusted installed-user validation | Maintainer evidence only |
| Vagrant | Optional isolated local helper | Not a release gate |

## Windows/LabVIEW Runner

The self-hosted runner is a repository-level maintainer runner for trusted refs
only. It must not run arbitrary pull request code.

Runner settings:

- Runner name: `vihs-win-labview-sveld`
- Custom label: `vihs-windows-labview-maintainer`
- Mode: interactive `run.cmd`, not a Windows service
- Scope: `LabVIEW-Community-CI-CD/vi-history-suite`

Expected host prerequisites:

- Node.js and npm
- VS Code
- LabVIEW 2026
- LabVIEWCLI
- Git
- GitHub Actions runner application
- a PowerShell execution policy for the runner user that allows GitHub's
  temporary `.ps1` scripts, such as `CurrentUser RemoteSigned`

The runner workflow must be `workflow_dispatch` only, use read-only repository
permissions, and hard-fail unless the ref is `main` or an exact `v*` tag.
The workflow file is `.github/workflows/windows-labview-maintainer.yml`.

Start the runner only when needed:

```powershell
cd C:\dev\github-actions-runners\vi-history-suite
.\run.cmd
```

Stop it after validation by closing the runner terminal or pressing `Ctrl+C`.

## Evidence

Maintainer evidence should be small and repeatable:

- workflow run URL
- commit or tag
- Node/npm versions
- VS Code path
- LabVIEW/LabVIEWCLI paths
- command outcomes
- packaged VSIX artifact from that run

Do not claim Vagrant evidence unless the Vagrant issue is run on a
Vagrant-capable host and recorded separately.
