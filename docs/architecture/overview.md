# Architecture Overview

## System

VI History Suite is a VS Code desktop extension for reviewing LabVIEW VI file
history in Git repositories.

## Runtime Shape

| Area | Responsibility |
| --- | --- |
| Extension manifest | Commands, menus, activation, settings, package metadata |
| Extension runtime | Workspace trust checks, Git access, VI eligibility, command orchestration |
| Git adapter | Bounded Git CLI and built-in VS Code Git API access |
| History panel | Webview review surface for retained commits and explicit pair selection |
| Report subsystem | Runtime preflight, LabVIEW comparison execution, retained report packets |
| Bundled docs | Version-matched installed-user guidance opened from the extension |
| Devcontainer | Primary source-evaluation and contributor test environment |
| GitHub Actions | Branch governance, hosted CI, diagnostic VSIX, and Marketplace release automation |
| Optional Vagrant | Human-run local Windows/LabVIEW helper, not a release gate |

## Public Source Model

The active public repository is
`https://github.com/LabVIEW-Community-CI-CD/vi-history-suite`.

The repository uses a governed branch model. `main` is the Marketplace and
release baseline. `develop` is the integration branch. Feature branches merge
to `develop`; `release/vX.Y.Z` and `hotfix/vX.Y.Z` branches are the normal
promotion paths to `main`. GitLab is historical read-only context after
migration.

## Verification Model

The default verification path is:

```bash
npm ci
npm run check
npm test
npm run package
```

Developers can use the devcontainer or Codespaces for the normal loop. Vagrant
is available only for humans who already have a suitable local Windows/LabVIEW
box and want extra confidence.

## Runtime Dependencies

- VS Code extension host Node runtime
- Git on `PATH`
- local LabVIEW plus matching `LabVIEWCLI` for host comparison
- optional Docker engine for the explicit Docker provider path
- `jsonc-parser` as the only runtime npm dependency
