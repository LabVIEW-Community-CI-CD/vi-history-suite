# Information For Users Command Reference

Applies to: exact released installed baseline `v1.2.2` plus the active
`develop` authority direction
Last reviewed: `2026-04-14`
Primary audience: maintainers, source evaluators, and advanced installed users
Topic type: reference
Primary entry route: `README.md` or `INSTALL.md`

See also:

- [Plan](./plan.md)
- [FAQ](./faq.md)
- [Documentation Package Workbench](../documentation-workbench.md)
- [Release Procedure](../release-procedure.md)

## Quick-Reference Boundary

- This surface is a compact quick-reference guide and route locator.
- It is not a full user guide, it is not a full command manual, and it is not an API reference.
- Keep stable task walkthroughs in `README.md`, `INSTALL.md`,
  `docs/documentation-workbench.md`, `PROGRAM-0005`, or `ISSUE-0412`.
- Use the FAQ for short answers and reload guidance, then move stable doctrine
  back into the main governed surfaces.
- This repo does not use `MAINTAINING.md`, `OPERATIONS.md`, or `SKILL.md` as
  first-class user entry surfaces.
- temporary workaround answers belong in the FAQ until they stabilize.
- This surface does not own API-doc depth decisions and it does not describe
  chatbot or VRS behavior.

## Public Evaluation And Installed Baseline

`npm run public:repo:clone`

- Purpose: clone a supported public GitHub or GitLab repo for source
  evaluation.
- Use when: you are following the public source-evaluation route instead of
  the exact released installed extension route.

`npm run public:fixture:icon-editor`

- Purpose: clone the canonical governed public sample repository.
- Use when: you want the easiest first proof route for public evaluation.

`npm run public:smoke:linux`

- Purpose: run the public Linux cold-pull smoke lane.
- Use when: checking the public evaluation surface on the governed Linux path.

## Documentation Package Workbench

`npm run docs:workbench:build`

- Purpose: build the repo-native docs-authoring workbench image.
- Use when: iterating on documentation-package changes through the governed
  Docker-backed authoring surface.

`npm run docs:workbench:gate`

- Purpose: run the documentation-package gate inside the repo-native docs
  workbench.
- Use when: validating documentation-package changes against the same
  containerized surface used by the repo workbench.

`npm run docs:workbench:shell`

- Purpose: open an interactive shell inside the repo-native docs workbench.
- Use when: you need to inspect or run docs-authoring steps manually inside
  the workbench container.

`node scripts/run-docs-gate.js`

- Purpose: run the repo-native docs gate from the host.
- Use when: validating documentation-package changes without entering the
  workbench shell.

`npm run docs:ci`

- Purpose: run the retained documentation continuous-integration lane locally.
- Use when: you need the broader docs evidence surface, not only the fast gate.

## Canonical Validation

`node scripts/run-docs-gate.js`

- Purpose: run the canonical repo-native docs gate.
- Use when: validating the bounded document set before broader release checks.

`npm run test`

- Purpose: run the main repo validation suite.
- Use when: a slice changes source, docs guards, or integration behavior beyond
  one narrow local proof.

## Runtime Provider CLI And Proof

`VI History: Prepare Local Runtime Settings CLI`

- Purpose: materialize the governed runtime-settings launchers under the
  extension-global storage root.
- Use when: first preparing the local runtime-provider CLI or refreshing it
  after launcher or runtime changes.
- Notes:
  - the governed materialization root is the extension-global storage path
    reported by the command result
  - supported settings targets are the default user `settings.json` path for
    the current platform or one explicit `--settings-file` override
  - this prepare command is admitted in untrusted workspaces because it only
    materializes the launcher; installed compare remains blocked there

`vihs-runtime-settings --provider <host|docker> --labview-version <major> --labview-bitness <x86|x64> [--settings-file <path>]`

- Purpose: persist the active branch provider request, LabVIEW version, and
  LabVIEW bitness into VS Code settings.
- Use when: switching between host and the bounded expert Docker provider on
  the active branch.
- Notes:
  - the CLI is generated into user-profile storage on first use
  - without `--settings-file`, the governed target is the platform-default
    user `settings.json`; workspace settings are not a supported target
  - if VS Code is already running, reload or restart the window before
    trusting Compare or other runtime-provider surfaces to reflect the updated
    provider and runtime facts

`vihs-runtime-settings --validate [--settings-file <path>]`

- Purpose: report the persisted provider/version/bitness bundle plus the
  bounded runtime-validation outcome for the governed settings target.
- Use when: confirming what the CLI actually persisted before trusting Compare
  or other runtime-provider surfaces.
- Notes:
  - without `--settings-file`, the governed validation target is the
    platform-default user `settings.json`
  - the output retains `runtimeValidationOutcome`, `runtimeProvider`,
    `runtimeEngine`, and `runtimeBlockedReason` without reopening path-picking
    or a panel-side provider picker

`labviewViHistory.probeRuntimeSettingsLiveSession`

- Purpose: compare persisted runtime-settings facts against active in-session
  VS Code runtime settings and retain one governed probe packet.
- Use when: checking live-session drift after CLI updates in an already-running
  VS Code session.
- Notes:
  - the command retains per-run and latest probe packets under extension-global
    storage
  - probe packets include persisted and live provider/version/bitness plus
    drift booleans, a normalized live-uptake observation, and
    runtime-validation facts
  - this probe surface now applies fail-closed safe-restore around probe
    mutation, but direct live uptake of updated settings is still unproven;
    reload or restart guidance remains active when drift is detected

`npm run proof:runtime-settings-live-session:assert`

- Purpose: fail closed when the retained latest live-session probe packet is
  missing or malformed.
- Use when: asserting local admission for the current live-session probe
  evidence before merge or handoff.
- Notes:
  - optional packet override: `npm run proof:runtime-settings-live-session:assert -- --packet <path>`
  - environment fallback: `VIHS_RUNTIME_SETTINGS_LIVE_SESSION_PACKET=<path>`
  - default packet target resolves to the VS Code user global-storage path for
    `svelderrainruiz.vi-history-suite`

`npm run proof:runtime-settings-live-session:history`

- Purpose: summarize retained live-session probe history into one policy-facing
  receipt (`live-uptake-not-proven`, `candidate-live-uptake-observed`, or
  `insufficient-evidence`).
- Use when: deciding whether reload-or-restart guidance remains required for
  the current retained evidence set.
- Notes:
  - optional packet-root override:
    `npm run proof:runtime-settings-live-session:history -- --packet-root <path>`
  - use `--json` for machine-readable branch or MR receipts

`npm run proof:runtime-settings-live-session:policy:assert`

- Purpose: fail closed when retained probe history no longer supports the
  current unconditional reload-or-restart policy boundary.
- Use when: enforcing `VHS-REQ-542` evidence posture before merge.
- Notes:
  - optional packet-root override:
    `npm run proof:runtime-settings-live-session:policy:assert -- --packet-root <path>`
  - returns non-zero when stance is `candidate-live-uptake-observed` or
    `insufficient-evidence`, forcing explicit policy re-evaluation

`npm run test:integration:windows`

- Purpose: prove the Windows integration-host lane, including the `.cmd`
  launcher path and default no-`--settings-file` target.
- Use when: validating the current runtime-provider CLI proof slice.

## Outer Compliance Baseline

## Assurance Execution

`docker run --rm -v /path/to/repo:/target registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:v0.2.13 python3 scripts/run_assurance.py /target --profile release-gate`

- Purpose: assess this repo against the released `repo-standards-review v0.2.13`
  assurance baseline from the published compliance workbench.
- Use when: checking the outer standards posture for a branch after the
  repo-native docs gate is already clean.

`python3 /tmp/repo-standards-review-v0.2.13-tag/scripts/external_user_information_check.py /home/sveld/code/standards/vi-history-suite-user-rounds --json`

- Purpose: reproduce the exact released `v0.2.13` external user-information boundary in
  the current local environment.
- Use when: advancing the `26514` uptake branches and confirming the next
  precise failure boundary.

## Release And Control Surfaces

`python3 /tmp/repo-standards-review-v0.2.13-tag/scripts/requirements_quality_check.py /home/sveld/code/standards/vi-history-suite-user-rounds --json`

- Purpose: check the governed requirements package with the released skill.
- Use when: a branch changes `docs/requirements/srs.md`, `docs/requirements/syrs.md`,
  or `docs/requirements/rtm.csv`.

## Release Control

`git checkout develop && git pull`

- Purpose: return to the current integration baseline before cutting a new
  feature or release slice.
- Use when: resyncing the repo control plane.

`git checkout -b feature/<name>`

- Purpose: cut the next GitFlow feature slice from `develop`.
- Use when: a new truthful documentation or source-backed branch is starting.

## Standards Lookup

`python3 scripts/pipeline.py validate-skill`

- Purpose: validate the local `repo-standards-review` skill clone when the
  external standards tool itself is under inspection.
- Use when: the released checker points you back to its own retained doctrine.

`python3 scripts/search_standards.py`

- Purpose: search retained standards packets in a local `repo-standards-review`
  workspace.
- Use when: a `26514` token or standards clause needs to be verified directly.

## Documentation Search

`rg -n "<term>" README.md docs`

- Purpose: search the governed repo docs quickly without a custom search
  subsystem.
- Use when: locating routes, release language, or support-boundary phrases.

`npm run test`

- Purpose: run the main repo validation suite.
- Use when: a slice changes source, docs guards, or integration behavior beyond
  one narrow local proof.
