# Information For Users FAQ

## Document Control

- Product or service: `vi-history-suite`
- Applies to: exact released installed baseline `v1.3.16` plus the active
  `develop` installed-user direction
- Last reviewed: `2026-05-15`
- Primary audience: installed users and source evaluators
- Topic type: troubleshooting and quick-reference support
- Primary entry route: `README.md` and `INSTALL.md`

See also:

- [README.md](https://github.com/svelderrainruiz/vi-history-suite/blob/HEAD/README.md)
- [INSTALL.md](https://github.com/svelderrainruiz/vi-history-suite/blob/HEAD/INSTALL.md)
- [First Run](https://github.com/svelderrainruiz/vi-history-suite/blob/HEAD/FIRST-RUN.md)
- [Troubleshooting](https://github.com/svelderrainruiz/vi-history-suite/blob/HEAD/TROUBLESHOOTING.md)
- [Command Reference](./command-reference.md)

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

- If you are using the exact released extension, start with `README.md`,
  `INSTALL.md`, and `FIRST-RUN.md`. Prepare the local runtime-settings CLI
  first, then run `vihs`, choose provider/year/bitness, and run
  `vihs --validate`.
- If you are evaluating the source repo on public GitHub or GitLab content,
  start with the public-evaluation routes in `README.md` and the generic
  `npm run public:repo:clone` command.
- If you are maintaining release-control docs, leave this installed-user FAQ
  and start with `docs/product/maintainer-control-plane-index.md`.

### How do I install from PowerShell and choose settings during install?

Use the governed Windows PowerShell bootstrap command:

`irm https://gitlab.com/svelderrainruiz/vi-history-suite/-/raw/develop/scripts/install-vihs-extension.ps1 | iex`

- That bootstrap runs the Marketplace install through
  `code --install-extension svelderrainruiz.vi-history-suite --force`, but raw
  `code --install-extension` alone is not the governed interactive install
  surface.
- The bootstrap derives platform from the current host and asks only for
  provider, LabVIEW year, and bitness.
- If settings are missing, it seeds `host/windows/2026/x86` first, reads the
  current bundle back, and lets you keep each value by pressing `Enter`.
- If PowerShell is not interactive, the bootstrap retains or seeds the
  governed default bundle and prints the exact follow-up `vihs` commands
  instead of hanging on prompts.
- After install, use `vihs` to adjust settings later and `vihs --validate` to
  confirm what the current settings target actually persisted.

### How do I switch between host and Docker?

In supported Windows PowerShell sessions and admitted VS Code terminals, type
`vihs`.

- If settings are missing, `vihs` seeds `host/windows/2026/x86` first.
- `vihs` reads back the current provider/platform/version/bitness bundle so you
  can keep each value by pressing `Enter` or stop at one prompt and choose a
  different value.
- Host is the default provider and supports LabVIEW `2025`, LabVIEW `2026`,
  and newer local LabVIEW versions when that exact installation and bitness are
  present on the current machine. Windows Community installs `x86` first; select
  `x64` only after installing that bitness intentionally.
- LabVIEW `2024` and older cannot create the VI Comparison Report that VI
  History Suite uses. Use LabVIEW `2025` or newer even for older VIs; those
  newer LabVIEW versions can open prior-version VIs without migrating them.
- Docker is the bounded expert path: `2026` / `x64` is supported for
  `docker/windows` on Windows Docker Desktop Windows-container hosts and for
  `docker/linux` on Linux Docker Desktop/Docker Engine hosts; Docker years
  before `2026` are unsupported; `host/linux` `2026` / `x64` is admitted when
  LabVIEW Community 2026 is installed on Linux.
- Docker images are 64-bit only. If the selected Windows host bitness is not
  installed, VI History Suite may mention the detected other bitness, but it
  does not auto-switch because bitness-specific dependencies can differ.
- For non-interactive scripting, use the exact command shape:

`vihs --provider <host|docker> --labview-version <major> --labview-bitness <x86|x64>`

The current installed-user contract treats host as the default provider and
Docker as the bounded expert path. If VS Code is already running when the CLI
updates the settings file, review Compare or runtime validation again after the update and
reload or restart the window only if that already-running session still shows
stale provider or runtime facts.

### Where does the generated runtime-settings CLI live, and what can it write?

The governed launchers live under the extension-global storage root after the
explicit prepare command runs.

- `VI History: Prepare Local Runtime Settings CLI` is the governed prepare,
  repair, and refresh surface when `vihs` is missing, stale, or a repaired VS
  Code or Node.js runtime needs the entrypoint refreshed.
- Extension startup, opening documentation, and selecting the extension do not
  materialize the launchers, activate Git, start eligibility indexing, or touch
  LabVIEW.
- On Windows, the prepare command admits governed user-scope PATH state so new
  standalone PowerShell windows can resolve `vihs` by name without manual
  shell-profile editing or machine-wide install doctrine.
- The command reference and this FAQ are the governed installed-user help and
  recovery surfaces for that CLI.
- The governed settings targets are the platform-default user
  `settings.json` path or one explicit `--settings-file` override.
- Workspace settings are not a supported target for this CLI surface.
- The prepare command is admitted in untrusted workspaces because it only
  prepares launcher files, but installed compare remains blocked there.
- On Windows, the launcher uses the standard VS Code runtime before falling
  back to global `node.exe`; set `VI_HISTORY_SUITE_NODE_EXE` only when an
  explicit Node runtime override is needed.
- If the launcher is missing, stale, or VS Code/Node.js was repaired, rerun the
  same prepare command to refresh it.

### How do I check what the runtime-settings CLI actually persisted?

Run the governed validation action:

`vihs --validate [--settings-file <path>]`

It reports the persisted `viHistorySuite.runtimeProvider`,
`viHistorySuite.labviewVersion`, and `viHistorySuite.labviewBitness` facts,
plus `runtimeValidationOutcome`, `runtimeProvider`, `runtimeEngine`, and
`runtimeBlockedReason`. This keeps validation on one bounded CLI surface
without reopening path-picking or a panel-side provider picker. On the current
public validation route, `ready` is bounded to the selected provider on the
current machine; Linux/Docker, Linux host LabVIEW 2026 x64, and Windows host
LabVIEW 2026 x64 are admitted through separate retained fixture proof packets.
Docker Desktop Windows-container proof remains deferred. The interactive
no-argument `vihs` flow invokes this same bounded validation after you confirm
or change settings.

### How do I check live-session drift after changing runtime settings?

Use the repo-owned proof command when you need one retained end-to-end receipt,
or the lower-level probe and gates when you need to inspect each surface:

- run `npm run proof:runtime-settings-live-session` to execute the governed
  extension-host proof lane on the current supported host and snapshot the
  latest probe packet, retained history summary, policy-boundary receipt, and
  integration logs under `.cache/runtime-settings-live-session-proof/latest/`
  even when the command fails closed on stale policy evidence

- run `labviewViHistory.probeRuntimeSettingsLiveSession` to retain a probe
  packet comparing persisted and active in-session provider/version/bitness
  facts plus an explicit live-uptake observation (`in-session-updated` or
  `reload-required`)
- run `npm run proof:runtime-settings-live-session:assert` to fail closed if
  the latest retained packet is missing, malformed, or does not keep
  `mutationTargetPersistedMatch=true`,
  `mutationTargetBaselineChanged=true`, and
  `historyProofStatus=re-evaluation-required`,
  `historyStance=candidate-live-uptake-observed`, with latest
  `liveUptakeObservation=in-session-updated`,
  `safeRestoreVerified=true`, latest `providerDrift=false`, explicit
  baseline/persisted provider `host`/`docker` facts, and retained
  `historyReloadRequiredCount=0` plus
  `historyUnknownObservationCount=0`, with retained history total/count
  integrity preserved
- run `npm run proof:runtime-settings-live-session:history` to summarize
  retained runs into one live-uptake stance
- run `npm run proof:runtime-settings-live-session:policy:assert` to fail
  closed when retained evidence no longer supports the current conditional
  stale-result guidance boundary, latest retained provider drift is no longer
  explicit `false`, or retained history includes `reload-required`,
  `providerDrift=true`, or missing provider-drift
  receipts

This narrows the proof gap and now includes one repo-owned end-to-end proof
receipt plus fail-closed probe safe-restore. It now observes in-session
provider uptake on the admitted bidirectional provider-mutation path, but it
still does not prove live uptake of every runtime fact in every already-running
session surface; reload or restart remains the fallback only when stale facts
remain after the CLI update.

### Where do I find the key commands or checks?

Use [Command Reference](./command-reference.md) for the compact stable command
surface.

The important route split is:

- repo-native docs authoring and docs validation stay in the `vi-history-suite`
  docs workbench
- outer standards verification for this tranche uses the published
  `repo-standards-review` assurance-workbench `:main` lane; `v0.2.18`
  remains the latest tagged release when an exact released baseline is needed

### How do I run the canonical gate?

Use the command surface that matches the task:

- for repo-native doc validation, run `node scripts/run-docs-gate.js`
- for the containerized authoring surface, run `npm run docs:workbench:gate`
- for the broader branch line, run `npm run test`

### Is Windows installed-user behavior proven?

Partly.

The Ubuntu/Docker lane does not prove Windows behavior by itself. A separate
Windows 11 VirtualBox installed-user run now admits Windows host LabVIEW 2026
x64 for the canonical `lv_icon.vi` fixture. Docker Desktop Windows-container
proof remains deferred until public issue #65 receives an admissible packet
from a real Windows host with Docker Desktop OSType `windows`.

For the `1.3.16` installed-user direction, use the public
validation templates when reporting Windows/LabVIEW or Docker Desktop results.
Selectable means available for validation, not automatically maintainer-proven
for every provider/year/bitness variant.

The remaining Windows proof gap is:

- Docker Desktop in Windows-container mode for the expert container lane

To work that gap, switch Docker Desktop to Windows containers, confirm
`docker info --format "{{.OSType}} {{.OperatingSystem}}"` reports `windows`,
and run:

`vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out .\vihs-fixture-proof --runtime-timeout-ms 300000`

WSL is retained historical context only; it is not proof of native Windows
installed-user behavior.

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
  update, reload or restart the VS Code window and review Compare again.
- If a live-session proof packet is required for admission, run
  `npm run proof:runtime-settings-live-session:assert` and treat failure as a
  hard stop.
- If you are checking the broader standards posture for this branch, use the
  repo-owned assurance wrapper such as `npm run assurance:release-gate` on the
  current branch. The governed Linux assurance runner lane still pulls the
  published `repo-standards-review` assurance-workbench `:main` image in CI.
  Use `v0.2.18` only when you need the latest tagged released baseline instead
  of the rolling lane.

### Where do I start when I need to cut a release?

Start with [Maintainer Control Plane Index](../product/maintainer-control-plane-index.md).
That route points to release procedure and retained release-candidate evidence
without making the installed-user FAQ carry maintainer-only details.
