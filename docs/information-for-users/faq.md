# Information For Users FAQ

## Document Control

- Product or service: `vi-history-suite`
- Applies to: exact released installed baseline `v1.2.2` plus the active
  `develop` authority direction
- Last reviewed: `2026-04-13`
- Primary audience: installed users, source evaluators, and maintainers
- Topic type: troubleshooting and quick-reference support
- Primary entry route: `README.md` and `INSTALL.md`

See also:

- [README.md](../../README.md)
- [INSTALL.md](../../INSTALL.md)
- [Command Reference](./command-reference.md)
- [Documentation Package Workbench](../documentation-workbench.md)
- [Release Procedure](../release-procedure.md)

## Scope Boundary

- This FAQ is a governed quick-answer and troubleshooting surface for recurring
  route questions.
- Do not keep the only copy of a stable step-by-step procedure in the FAQ.
- It does not own a FAQ-only search subsystem; the governed repo search posture
  stays with native editor, browser, GitLab, and `rg` search.
- The FAQ may retain temporary workarounds, but stable doctrine belongs back in
  the main route docs or control docs.

## Lifecycle Rules

- Temporary workarounds stay here only until the stable route or control doc can
  incorporate it there as soon as feasible.
- When a question becomes stable doctrine, shorten, redirect, or retire the FAQ
  entry and keep the durable version in the route doc, the command reference,
  or the release candidate evidence path.
- Keep the release candidate route visible when a question affects publication,
  audit, or release-facing review.
- Keep answers short enough to scan quickly; if an answer grows toward ten or more
  lines of stable procedure, move it into a dedicated route doc.

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

### How do I run the canonical gate?

Use the command surface that matches the task:

- for repo-native doc validation, run `node scripts/run-docs-gate.js`
- for the containerized authoring surface, run `npm run docs:workbench:gate`
- for the broader branch line, run `npm run test`

### How do I search the governed docs quickly?

Use the governed repo search posture:

- editor or GitLab search for broad browsing
- `rg -n "<term>" docs README.md INSTALL.md` for exact local search
- the FAQ does not define a FAQ-only search subsystem

### What accessibility features does this docs package provide?

- the package is text-first and uses copyable commands
- instructions avoid color-only meaning and use non-color-dependent instructions
- the package requires a text-first route and relies on native capabilities
  of Markdown readers, editors, and browsers rather than claiming extra
  repo-specific accessibility controls

### What should I do when the expected route fails?

- If a docs-package change is involved, run `node scripts/run-docs-gate.js`
  first, then the docs-workbench gate if you need the containerized authoring
  surface.
- If Compare is still showing stale provider or runtime facts after a CLI
  update, reload or restart the VS Code window.
- If you are checking the broader standards posture for this branch, use the
  released `repo-standards-review v0.2.12` baseline instead of older parked
  roadmap branches.

### Where do I start when I need to cut a release?

Start with [Release Procedure](../release-procedure.md), then use the release
candidate route in [Public Release Candidate](../product/public-release-candidate.md)
when you need the retained release candidate evidence.
