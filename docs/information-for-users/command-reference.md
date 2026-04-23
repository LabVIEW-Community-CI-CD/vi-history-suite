# Information For Users Command Reference

Applies to: exact released installed baseline `v1.2.2` plus the active
`develop` authority direction
Last reviewed: `2026-04-19`
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

- The active Windows x64 private-release route does not use the Linux public
  smoke lane.
- Commands prefixed with `public:` below are source-evaluation or maintainer
  surfaces, not the supported installed-user private-release steps.

`npm run public:repo:clone`

- Purpose: clone a supported public GitHub or GitLab repo for source
  evaluation.
- Use when: you are following the public source-evaluation route instead of
  the exact released installed extension route.

`npm run public:fixture:icon-editor`

- Purpose: clone the canonical governed public sample repository.
- Use when: you want the easiest first proof route for public evaluation.

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

This section and the FAQ are the governed installed-user help surface for the
runtime-settings CLI on the active branch.

`irm https://gitlab.com/svelderrainruiz/vi-history-suite/-/raw/develop/scripts/install-vihs-extension.ps1 | iex`

- Purpose: run the governed Windows PowerShell install/bootstrap surface for a
  Marketplace install, first-time settings selection, and immediate `vihs`
  materialization in the same session.
- Use when: installing the maintained candidate from the command line on
  Windows and you want provider/year/bitness selection during installation
  instead of discovering setup later through chat memory or hidden paths.
- Notes:
  - the bootstrap itself runs the Marketplace install through
    `code --install-extension svelderrainruiz.vi-history-suite --force`; raw
    `code --install-extension` alone is not the governed interactive install
    surface
  - on interactive Windows PowerShell sessions, the bootstrap derives platform
    from the current host and prompts only for provider, LabVIEW year, and
    bitness; `Enter` keeps the current or seeded value at each prompt
  - when settings are missing, the bootstrap seeds
    `host/windows/2026/x64` before readback or selection
  - on non-interactive surfaces, the bootstrap retains or seeds that same
    governed default bundle and prints exact follow-up `vihs` commands instead
    of hanging on prompts
  - the bootstrap writes the governed VS Code user `settings.json` target and
    materializes the `vihs` and `vihs-runtime-settings` launchers under the
    extension-global storage root without manual shell-profile editing or
    machine-wide install doctrine

`VI History: Prepare Local Runtime Settings CLI`

- Purpose: repair or refresh the governed `vihs` terminal entrypoint plus the
  compatibility launchers under the extension-global storage root.
- Use when: `vihs` is missing, stale, or a repaired VS Code or Node.js runtime
  needs the governed entrypoint refreshed.
- Notes:
  - the governed materialization root is the extension-global storage path
    reported by the command result
  - the published install/bootstrap surface and extension activation both
    materialize the same admitted `vihs` launchers; use this prepare command
    only when that admitted terminal surface needs repair or refresh
  - extension activation admits bare `vihs` in supported VS Code terminals and,
    on Windows, persists governed user-scope PATH admission so new PowerShell
    windows can resolve `vihs` by name without manual shell-profile editing or
    machine-wide install doctrine
  - the command result reports the current-platform compatibility-launcher path
    plus one exact next command to run without reconstructing the hidden
    extension-global storage layout
  - on Windows, the launcher uses the standard VS Code runtime before falling
    back to global `node.exe`; `VI_HISTORY_SUITE_NODE_EXE` can bind an explicit
    Node runtime when the VS Code runtime is unavailable
  - rerun this same prepare command when the launcher is missing, stale, or a
    repaired VS Code or Node.js runtime needs a refreshed launcher
  - supported settings targets are the default user `settings.json` path for
    the current platform or one explicit `--settings-file` override
  - this prepare command is admitted in untrusted workspaces because it only
    materializes the launcher; installed compare remains blocked there

`vihs`

- Purpose: run the admitted interactive runtime-settings surface.
- Use when: seeding missing settings, reviewing the current provider/runtime
  bundle, or changing provider/runtime selections through the keyboard.
- Notes:
  - on interactive TTY surfaces, `vihs` seeds missing settings to
    `host/windows/2026/x64`, reads back the current provider/platform/version/
    bitness bundle, and lets `Enter` keep the current value at each prompt
  - host supports LabVIEW years `2020` through `2026` when that exact
    installation is present on the current machine
  - Docker is the bounded expert path: `2026` / `x64` is the supported
    Windows-container route; Docker years before `2026` are unsupported;
    `docker/linux` is selectable for `2026` only but not currently implemented
  - `host/linux` is not currently implemented
  - after confirmation, the interactive flow persists the selected settings and
    auto-runs the same bounded validation action exposed by `vihs --validate`
  - on non-interactive surfaces, `vihs` without arguments prints exact
    copyable next commands instead of entering guided selection
  - if VS Code is already running, review compare preflight or runtime
    validation again after the CLI update and reload or restart the window
    only if that session still shows stale provider or runtime facts

`vihs --provider <host|docker> --labview-version <major> --labview-bitness <x86|x64> [--settings-file <path>]`

- Purpose: persist the active branch provider request, LabVIEW version, and
  LabVIEW bitness into VS Code settings without interactive prompts.
- Use when: scripting or making one exact provider/runtime change directly.
- Notes:
  - after extension admission, supported Windows PowerShell sessions and
    admitted VS Code terminals resolve `vihs` by name; use
    `VI History: Prepare Local Runtime Settings CLI` only when the admitted
    terminal surface needs repair or refresh
  - without `--settings-file`, the governed target is the platform-default
    user `settings.json`; workspace settings are not a supported target
  - for the supported Windows x64 private-release route, use native Windows
    host LabVIEW or Docker Desktop in Windows-container mode; WSL is not an
    admitted dependency for that path
  - the Linux public smoke lane and Linux benchmark lanes are outside this
    installed-user private-release route and remain maintainer/source-evaluation
    proof surfaces
  - if VS Code is already running, review compare preflight or runtime
    validation again after the CLI update and reload or restart the window
    only if that session still shows stale provider or runtime facts

`vihs --validate [--settings-file <path>]`

- Purpose: report the persisted provider/version/bitness bundle plus the
  bounded runtime-validation outcome for the governed settings target.
- Use when: confirming what the CLI actually persisted before trusting Compare
  or other runtime-provider surfaces.
- Notes:
  - use `VI History: Prepare Local Runtime Settings CLI` only when the admitted
    terminal surface needs repair or refresh; otherwise run `vihs --validate`
    directly from supported admitted terminals
  - without `--settings-file`, the governed validation target is the
    platform-default user `settings.json`
  - the output retains `runtimeValidationOutcome`, `runtimeProvider`,
    `runtimeEngine`, and `runtimeBlockedReason` without reopening path-picking
    or a panel-side provider picker
  - the no-argument interactive `vihs` confirmation flow invokes this same
    bounded validation after persisting settings
  - on the current Windows x64 private-release route, treat `ready` as the
    native Windows host or Docker Desktop Windows-container contract; WSL is
    not an admitted dependency for that path

`labviewViHistory.probeRuntimeSettingsLiveSession`

- Purpose: compare persisted runtime-settings facts against active in-session
  VS Code runtime settings and retain one governed probe packet.
- Use when: checking live-session drift after CLI updates in an already-running
  VS Code session.
- Notes:
  - the command retains per-run and latest probe packets under extension-global
    storage
  - probe packets include persisted and live provider/version/bitness plus
    drift booleans, a normalized live-uptake observation, cumulative retained
    history stance counters, and runtime-validation facts
  - this probe surface now applies fail-closed safe-restore around probe
    mutation and retains candidate live-uptake evidence for the admitted
    provider-mutation path, but direct live uptake of updated settings is
    still not fully proven across all runtime facts; reload or restart stays
    the fallback only when stale facts remain after the CLI update

`npm run proof:runtime-settings-live-session`

- Purpose: run the governed extension-host live-session proof lane on the
  current supported host and snapshot the latest probe packet, retained
  history receipt, policy-boundary receipt, and integration logs.
- Use when: refreshing one repo-owned end-to-end receipt for the current
  conditional stale-result guidance boundary.
- Notes:
  - the default receipt root is
    `.cache/runtime-settings-live-session-proof/latest/`
  - the command retains `runtime-settings-live-session-proof.json` and
    `.md`, plus integration stdout/stderr logs and snapshot copies of the
    current per-run probe packet
  - use `--evidence-dir <path>` to retain the receipt somewhere else
  - use `--json` for machine-readable operator output
  - on Windows this command runs the governed native Windows extension-host
    integration lane; on Linux it runs the governed Linux extension-host lane
  - the command fails closed if the retained latest packet or policy boundary
    no longer supports the active conditional stale-result guidance boundary
  - even on a fail-closed run, the receipt directory still keeps the copied
    packet root, integration logs, and top-level proof receipt for review

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
  - fails closed when `mutationTargetPersistedMatch` is not explicitly `true`
    on the latest retained probe packet
  - fails closed when `mutationTargetBaselineChanged` is not explicitly `true`
    on the latest retained probe packet
  - fails closed when latest packet `historyProofStatus` is
    not `re-evaluation-required`
  - fails closed when latest packet `historyStance` is not
    `candidate-live-uptake-observed`
  - fails closed when latest packet `liveUptakeObservation` is
    not `in-session-updated`
  - fails closed when latest packet `safeRestoreVerified` is not `true`
  - fails closed when latest packet `providerDrift` is not `false`
  - fails closed when latest packet baseline/persisted provider facts are not
    explicit `host`/`docker` values
  - fails closed when retained history reports any
    `historyReloadRequiredCount > 0`
  - fails closed when retained history reports any
    `historyInSessionUpdatedCount < 1`
  - fails closed when retained history reports any
    `historyUnknownObservationCount > 0`
  - fails closed when retained `historyTotalRuns` does not exactly equal the
    sum of retained observation-class counts

`npm run proof:runtime-settings-live-session:history`

- Purpose: summarize retained live-session probe history into one policy-facing
  receipt (`live-uptake-not-proven`, `candidate-live-uptake-observed`, or
  `insufficient-evidence`).
- Use when: deciding whether the current retained evidence still supports the
  active conditional stale-result guidance.
- Notes:
  - retained summary now also reports provider-selection coverage from
    `mutationProviderTarget` receipts (`host` and `docker`)
  - retained summary now reports mutation-target alignment counts that show
    whether requested provider selection became persisted provider truth
  - retained summary now reports baseline-switch counts that show whether the
    retained baseline provider changed to the retained persisted provider
  - retained summary now reports explicit proof status:
    `not-fully-proven` or `re-evaluation-required`
  - optional packet-root override:
    `npm run proof:runtime-settings-live-session:history -- --packet-root <path>`
  - use `--json` for machine-readable branch or MR receipts

`npm run proof:runtime-settings-live-session:policy:assert`

- Purpose: fail closed when retained probe history no longer supports the
  current conditional stale-result guidance policy boundary.
- Use when: enforcing `VHS-REQ-542` evidence posture before merge.
- Notes:
  - optional packet-root override:
    `npm run proof:runtime-settings-live-session:policy:assert -- --packet-root <path>`
  - returns non-zero when stance is not
    `candidate-live-uptake-observed`, forcing explicit policy re-evaluation
  - returns non-zero when retained history does not include both `host` and
    `docker` mutation targets, forcing explicit CLI provider-selection
    coverage before merge
  - returns non-zero when retained runs do not carry explicit
    mutation-target alignment receipts or show alignment mismatches
  - returns non-zero when retained runs do not carry explicit baseline-switch
    receipts or show no baseline-to-persisted provider change
  - returns non-zero when latest retained observation is not
    `in-session-updated`
  - returns non-zero when latest retained provider drift is not explicit
    `false`
  - returns non-zero when retained history includes one or more
    `reload-required` observations
  - returns non-zero when retained history includes one or more
    `providerDrift=true` outcomes
  - returns non-zero when retained history lacks explicit `providerDrift`
    receipts on any run
  - returns non-zero when retained history does not show safe-restore
    verification on every retained run
  - returns non-zero when retained history includes one or more unknown
    observations
  - returns non-zero when retained proof status becomes
    anything other than `re-evaluation-required`, forcing explicit policy
    re-evaluation before merge

`npm run test:integration:windows`

- Purpose: prove the Windows integration-host lane, including the `.cmd`
  launcher path and default no-`--settings-file` target.
- Use when: validating the current runtime-provider CLI proof slice.

## Outer Compliance Baseline

## Assurance Execution

`npm run assurance:release-gate`

- Purpose: assess this repo against the published rolling
  `repo-standards-review` assurance-workbench lane through the repo-owned
  audit wrapper.
- Use when: checking the outer standards posture for a branch after the
  repo-native docs gate is already clean.
- Exact tagged-release note: `v0.2.18` is the latest tagged
  `repo-standards-review` release when an exact released baseline must be
  reproduced instead of the rolling lane.

`npm run assurance:26514:authority`

- Purpose: run the bounded authority-doc `26514` documentation-proof lane.
- Use when: advancing the `26514` uptake branches and confirming the next
  precise failure boundary from a clean staged authority-doc target.

`npm run assurance:user-info`

- Purpose: reproduce the governed external user-information checker through the
  repo-owned wrapper.
- Use when: confirming the external user-information pack remains internally
  consistent after support-surface edits.

## Release And Control Surfaces

`npm run assurance:requirements`

- Purpose: check the governed requirements package with the repo-owned
  assurance wrapper.
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
