# Information For Users Command Reference

Applies to: exact released installed baseline `v1.3.16` plus the active
`develop` installed-user direction
Last reviewed: `2026-05-15`
Primary audience: installed users, source evaluators, and advanced installed users
Topic type: reference
Primary entry route: `README.md` or `INSTALL.md`

See also:

- [README.md](https://github.com/svelderrainruiz/vi-history-suite/blob/HEAD/README.md)
- [INSTALL.md](https://github.com/svelderrainruiz/vi-history-suite/blob/HEAD/INSTALL.md)
- [First Run](https://github.com/svelderrainruiz/vi-history-suite/blob/HEAD/FIRST-RUN.md)
- [Troubleshooting](https://github.com/svelderrainruiz/vi-history-suite/blob/HEAD/TROUBLESHOOTING.md)
- [FAQ](./faq.md)

## Quick-Reference Boundary

- This surface is a compact quick-reference guide and route locator.
- It is not a full user guide, it is not a full command manual, and it is not an API reference.
- Keep stable installed-user task walkthroughs in `README.md`, `INSTALL.md`,
  `FIRST-RUN.md`, or the bundled installed docs.
- Use the FAQ for short answers and reload guidance, then move stable doctrine
  back into the main governed surfaces.
- This repo does not use `MAINTAINING.md`, `OPERATIONS.md`, or `SKILL.md` as
  first-class user entry surfaces.
- temporary workaround answers belong in the FAQ until they stabilize.
- This surface does not own API-doc depth decisions and it does not describe
  chatbot or VRS behavior.

## Public Evaluation And Installed Baseline

- The active governed preview route is Linux/Docker, Linux host LabVIEW, and
  Windows host LabVIEW 2026 x86 validated; Windows host x64 remains selectable
  when manually installed, and Windows Docker Desktop
  Windows-container proof remains community/deferred until public issue #65
  receives an admissible packet from a real Windows host with Docker Desktop
  OSType `windows`.
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
- Fixture: `https://github.com/ni/labview-icon-editor` at
  `resource/plugins/lv_icon.vi`.
- Retained commits:
  `ab94f6c4b375062492036c63a6dab7ea8824748a` to
  `8741bb08026c104100720c0ef48621e4ab7762fd`.
- Retained Docker battery: positive historical compare succeeded, no-change
  compare succeeded, and missing-file control blocked before Docker at
  `left-blob-read-failed`.
- Docker note: the first compare may pull
  `nationalinstruments/labview:2026q1-linux`, about `1.4 GB`.
- Executable installed-user proof route:
  `vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out ./vihs-fixture-proof`
- Proof boundary: Linux/Docker `2026` `x64`, Linux host LabVIEW `2026`
  `x64`, and Windows host LabVIEW `2026` `x86` are admitted for their selected
  machines; Windows host LabVIEW `2026` `x64` remains selectable when manually
  installed; Windows Docker Desktop Windows-container proof remains
  community/deferred.

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
runtime-settings CLI.

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
    `host/windows/2026/x86` before readback or selection
  - on non-interactive surfaces, the bootstrap retains or seeds that same
    governed default bundle and prints exact follow-up `vihs` commands instead
    of hanging on prompts
  - the bootstrap writes the governed VS Code user `settings.json` target and
    materializes the `vihs` and `vihs-runtime-settings` launchers under the
    extension-global storage root without manual shell-profile editing or
    machine-wide install doctrine

`VI History: Prepare Local Runtime Settings CLI`

- Purpose: prepare, repair, or refresh the governed `vihs` terminal entrypoint
  plus the compatibility launchers under the extension-global storage root.
- Use when: first setting up the extension, when `vihs` is missing or stale, or
  when a repaired VS Code or Node.js runtime needs the governed entrypoint
  refreshed.
- Notes:
  - the governed materialization root is the extension-global storage path
    reported by the command result
  - opening documentation, selecting the extension, and VS Code startup do not
    materialize the launchers
  - on Windows, the prepare command persists governed user-scope PATH admission
    so new PowerShell windows can resolve `vihs` by name without manual
    shell-profile editing or machine-wide install doctrine
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
    `host/windows/2026/x86`, reads back the current provider/platform/version/
    bitness bundle, and lets `Enter` keep the current value at each prompt
  - host supports LabVIEW `2025`, LabVIEW `2026`, and newer local LabVIEW
    versions when that exact installation and bitness are present on the
    current machine; Windows Community installs `x86` first, while `x64`
    remains selectable after a manual x64 install
  - LabVIEW `2024` and older cannot create the VI Comparison Report that VI
    History Suite uses; select LabVIEW `2025` or newer even when the VI being
    reviewed was saved by an older LabVIEW version
  - Docker is the bounded expert path: the Docker provider uses the latest
    supported NI LabVIEW Docker image family for the governed Docker platform;
    the current Linux Docker default maps to the LabVIEW 2026 image family, NI
    LabVIEW Docker images are 64-bit only by image/platform, and Docker bitness
    is not a user-facing choice
  - `host/linux` is selectable; `2026` / `x64` is admitted when LabVIEW
    Community 2026 is installed on Linux, while unsupported or missing local
    host bundles still report stable fail-closed runtime codes
  - after confirmation, the interactive flow persists the selected settings and
    auto-runs the same bounded validation action exposed by `vihs --validate`
  - on non-interactive surfaces, `vihs` without arguments prints exact
    copyable next commands instead of entering guided selection
  - if VS Code is already running, review compare preflight or runtime
    validation again after the CLI update and reload or restart the window
    only if that session still shows stale provider or runtime facts

`vihs --provider <host|docker> --labview-version <major> --labview-bitness <x86|x64> [--settings-file <path>]`

- Purpose: persist the current provider request, LabVIEW version, and
  LabVIEW bitness into VS Code settings without interactive prompts.
- Use when: scripting or making one exact provider/runtime change directly.
- Notes:
  - after the explicit prepare command, supported Windows PowerShell sessions
    and admitted VS Code terminals resolve `vihs` by name
  - without `--settings-file`, the governed target is the platform-default
    user `settings.json`; workspace settings are not a supported target
  - Windows host LabVIEW 2026 x86 is admitted through the governed Windows
    Community/golden-VM installed-user fixture proof; x64 remains selectable
    when manually installed, and the Ubuntu/Docker evidence lane still does not
    prove Docker Desktop Windows-container behavior
  - for the `1.3.16` installed-user direction, report local
    Windows/LabVIEW and Docker results through the public GitHub validation
    templates and include provider, LabVIEW year, bitness, `runtimeErrorCode`,
    and the proof packet
  - Linux public smoke, Linux benchmark, Ubuntu/Docker preview, and Windows
    host proof lanes are distinct proof surfaces; do not use one provider lane
    as proof for a different provider lane
  - if VS Code is already running, review compare preflight or runtime
    validation again after the CLI update and reload or restart the window
    only if that session still shows stale provider or runtime facts

`vihs --validate [--settings-file <path>] [--proof-out <dir>]`

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
    `runtimeEngine`, `runtimeBlockedReason`, `runtimeErrorCode`,
    `runtimeProofStatus`, and `runtimeImplementationStatus` without reopening
    path-picking or a panel-side provider picker
  - `--proof-out` writes `vihs-validation-proof.json` and
    `vihs-validation-issue.md` for public GitHub reporting
  - proof packets retain diagnostic paths and environment facts; secret-looking
    environment variables are redacted while path-like diagnostic values remain
    visible
  - the no-argument interactive `vihs` confirmation flow invokes this same
    bounded validation after persisting settings
  - on the current public validation route, treat `VIHS_OK` as proof for the
    selected provider on the current machine; for Docker, this means daemon
    reachability and runtime selection are valid, while the first compare may
    still pull `nationalinstruments/labview:2026q1-linux` on Linux or the
    governed Windows image on Docker Desktop Windows-container hosts; Windows
    host LabVIEW 2026 x64 proof is admitted separately through the canonical
    fixture

`vihs validate-fixture [--provider <host|docker>] [--labview-version <major>] [--labview-bitness <x86|x64>] [--settings-file <path>] [--proof-out <dir>] [--runtime-timeout-ms <ms>]`

- Purpose: execute the canonical public `ni/labview-icon-editor`
  `resource/plugins/lv_icon.vi` compare fixture and write a public proof
  packet.
- Use when: validating the pre-release on a machine that should exercise a
  real compare path, not only runtime selection.
- Fixture:
  - repository: `https://github.com/ni/labview-icon-editor`
  - VI: `resource/plugins/lv_icon.vi`
  - old commit: `ab94f6c4b375062492036c63a6dab7ea8824748a`
  - new commit: `8741bb08026c104100720c0ef48621e4ab7762fd`
- Notes:
  - `--provider docker --labview-version 2026 --labview-bitness x64` exercises
    the Linux/Docker admitted fixture lane and may pull
    `nationalinstruments/labview:2026q1-linux`, about `1.4 GB`, on first
    compare
  - `--provider host --labview-version 2026 --labview-bitness x64` exercises
    the Linux host LabVIEW admitted lane when LabVIEW Community 2026 is
    installed on Linux, and the Windows host x64 lane when LabVIEW 2026 x64 is
    manually installed on Windows
  - `--provider host --labview-version 2026 --labview-bitness x86` exercises
    the governed Windows Community/default lane when LabVIEW 2026 x86 is
    installed on Windows
  - Windows Docker Desktop Windows-container results are community/deferred
    until users file proof packets from those machines. For public issue #65,
    switch Docker Desktop to Windows containers, confirm
    `docker info --format "{{.OSType}} {{.OperatingSystem}}"` reports
    `windows`, and run
    `vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out .\vihs-fixture-proof --runtime-timeout-ms 300000`.
    Admissible success reports should include
    `runtimeProvider=windows-container`, `runtimeEngine=labview-cli`,
    `runtimeExecutionState=succeeded`, and `generatedReportExists=true`.

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
