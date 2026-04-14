# FAQ

## Document Control

- Product or service: `vi-history-suite`
- Applies to: exact released installed baseline `v1.2.2` plus the active
  `develop` authority direction
- Last reviewed: `2026-04-13`
- Primary audience: installed users, source evaluators, and maintainers
- Primary entry route: `README.md` and `INSTALL.md`

See also:

- [README.md](../../README.md)
- [INSTALL.md](../../INSTALL.md)
- [Command Reference](./command-reference.md)
- [Documentation Package Workbench](../documentation-workbench.md)

## Questions

### How do I start?

Use the route that matches your real task.

- If you are using the exact released extension, start with `README.md` and
  `INSTALL.md`. The current exact released line, `v1.2.2`, still uses the
  Docker-only and x64-only installed path.
- If you are evaluating the source repo on public GitHub or GitLab content,
  start with the public-evaluation routes in `README.md` and the generic
  `npm run public:repo:clone` command.
- If you are editing the authority docs package, start with
  `docs/documentation-workbench.md` and the docs-workbench gate.

### How do I switch between host and Docker on the active branch?

Use the generated runtime-settings CLI on the active branch:

`vihs-runtime-settings --provider <host|docker> --labview-version <major> --labview-bitness <x86|x64>`

The active branch treats host as the default provider and Docker as the
bounded expert path. If VS Code is already running when the CLI updates the
settings file, reload or restart the window before using Compare so the new
settings are picked up.

### Where do I find the key commands or checks?

Use [Command Reference](./command-reference.md) for the compact stable command
surface.

The important route split is:

- repo-native docs authoring and docs validation stay in the `vi-history-suite`
  docs workbench
- outer standards verification for this tranche uses released
  `repo-standards-review v0.2.12`

### What should I do when the expected route fails?

- If a docs-package change is involved, run `node scripts/run-docs-gate.js`
  first, then the docs-workbench gate if you need the containerized authoring
  surface.
- If Compare is still showing stale provider or runtime facts after a CLI
  update, reload or restart the VS Code window.
- If you are checking the broader standards posture for this branch, use the
  released `repo-standards-review v0.2.12` baseline instead of older parked
  roadmap branches.
