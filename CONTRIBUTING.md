# Contributing

Thanks for helping VI History Suite get simpler and more useful.

## Development Loop

Use the devcontainer or Codespace path when possible:

```bash
npm ci
npm run check
npm test
npm run package
```

Then press `F5` in VS Code to launch the extension development host.

## Pull Requests

Pull requests are welcome. By opening a pull request, you agree that your
contribution is provided under the repository license, BSD0 / `0BSD`.

Keep changes focused, include tests when behavior changes, and update the
README or install notes when user-facing behavior changes.

Use GitHub Issues for bugs and feature requests. Do not open public issues for
security vulnerabilities; use [SECURITY.md](./SECURITY.md) instead.

## Branch and PR Flow

This repository follows a GitFlow-style model. The hosted CI **Branch
Governance** step enforces these rules on every pull request, so name branches
accordingly:

- **`feature/<issue#>-<slug>`** — normal development. A feature branch MUST
  reference an issue in its name (for example `feature/235-branch-policy-docs`).
  Branch from and merge back into `develop`.
- **`fix/<slug>`** — a focused fix that MUST merge into a `feature/*` branch,
  never directly into `develop` or `main`.
- **`release/vX.Y.Z`** — branch from `develop`, stabilize, then merge into
  `main`; back-sync `main` into `develop` after publication.
- **`hotfix/vX.Y.Z`** — branch from `main`, merge into `main`, then back-sync
  into `develop`.
- **`dependabot/*`** — automated dependency PRs opened by Dependabot against
  `develop` (see [.github/dependabot.yml](./.github/dependabot.yml)). Allowed to
  target `develop` only, and still gated by the full CI suite.

```text
fix/* ─▶ feature/<issue#>-* ─▶ develop ─▶ release/vX.Y.Z ─▶ main
                                  ▲                            │
                                  └──────── back-sync ─────────┘
```

Allowed pull-request targets enforced by CI:

| PR base | Allowed head branches |
| --- | --- |
| `main` | `release/vX.Y.Z`, `hotfix/vX.Y.Z` |
| `develop` | `feature/<issue#>-*`, `release/vX.Y.Z`, `hotfix/vX.Y.Z`, `main` (back-sync), `dependabot/*` |
| `feature/*` | `fix/*`, `feature/<issue#>-*` |

See [docs/maintainer-operations.md](./docs/maintainer-operations.md#branch-model)
for the full branch model and release flow.

## Optional Test Repositories

To clone the standard public fixture:

```bash
npm run public:fixture:icon-editor
```

To clone another public repository for review:

```bash
npm run public:repo:clone -- --repo-url https://github.com/<owner>/<repo>.git
```
