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

### Git hooks

This repo ships git hooks under `.githooks/`. They are **auto-enabled** by the npm
`prepare` lifecycle (a plain `npm install`/`npm ci` points `core.hooksPath` at
`.githooks`), so a fresh clone needs no manual step. To enable or re-enable
explicitly:

```bash
npm run hooks:install   # or: git config core.hooksPath .githooks
```

Hooks:

- **pre-push** — runs, in order: branch-flow enforcement first
  (`scripts/branchFlowEnforce.js`, at hosted Branch-Governance parity), then ADR
  infrastructure (`npm run adr:check`), agent-delegation drift (`npm run agent:check`),
  and the repo-standards-review audit (`npm run standards:audit`). In a multi-agent
  context it also takes an advisory agent-gateway lease to serialize the validation
  phase across concurrent agents (advisory-degrade; it never blocks the push).
- **pre-commit** — the environment-consistency gate (VHS-REQ-697). Fails closed
  when `node_modules` is out of sync with `package-lock.json` (which breaks the
  toolchain); run `npm ci` and commit again. Stale compiled `out/` and changed
  requirements are advisory, not blocking.
- **post-merge / post-checkout** — report a stale environment synchronously after
  a pull/checkout (advisory; they always exit 0) and point at the authoritative
  project board for next work. Check the environment any time with
  `npm run env:sync:check`.

Bypass in an emergency with `git push --no-verify` / `git commit --no-verify`.
Note that git cannot prevent `--no-verify` at the hook level; per repository
policy, agents must not use it as a shortcut.

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
