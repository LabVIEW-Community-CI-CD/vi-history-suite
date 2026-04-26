# Information For Users FAQ

## Document Control

- Product or service: `vi-history-suite`
- Applies to: exact released installed baseline `v1.2.2` plus the active
  `develop` authority direction
- Last reviewed: `2026-04-19`
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

### How do I install from PowerShell and choose settings during install?

Use the governed Windows PowerShell bootstrap command:

`irm https://gitlab.com/svelderrainruiz/vi-history-suite/-/raw/develop/scripts/install-vihs-extension.ps1 | iex`

- That bootstrap runs the Marketplace install through
  `code --install-extension svelderrainruiz.vi-history-suite --force`, but raw
  `code --install-extension` alone is not the governed interactive install
  surface.
- The bootstrap derives platform from the current host and asks only for
  provider, LabVIEW year, and bitness.
- If settings are missing, it seeds `host/windows/2026/x64` first, reads the
  current bundle back, and lets you keep each value by pressing `Enter`.
- If PowerShell is not interactive, the bootstrap retains or seeds the
  governed default bundle and prints the exact follow-up `vihs` commands
  instead of hanging on prompts.
- After install, use `vihs` to adjust settings later and `vihs --validate` to
  confirm what the current settings target actually persisted.

### How do I switch between host and Docker on the active branch?

In supported Windows PowerShell sessions and admitted VS Code terminals, type
`vihs`.

- If settings are missing, `vihs` seeds `host/windows/2026/x64` first.
- `vihs` reads back the current provider/platform/version/bitness bundle so you
  can keep each value by pressing `Enter` or stop at one prompt and choose a
  different value.
- Host is the default provider and supports LabVIEW years `2020` through `2026`
  when that exact installation is present on the current machine.
- Docker is the bounded expert path: `2026` / `x64` is the supported
  Windows-container route; Docker years before `2026` are unsupported;
  `docker/linux` is selectable for `2026` only but is not currently
  implemented; `host/linux` is not currently implemented.
- For non-interactive scripting, use the exact command shape:

`vihs --provider <host|docker> --labview-version <major> --labview-bitness <x86|x64>`

The active branch treats host as the default provider and Docker as the
bounded expert path. If VS Code is already running when the CLI updates the
settings file, review Compare or runtime validation again after the update and
reload or restart the window only if that already-running session still shows
stale provider or runtime facts.

### Where does the generated runtime-settings CLI live, and what can it write?

The governed launchers live under the extension-global storage root.

- The published install/bootstrap surface and extension activation both
  materialize the launchers there.
- Extension activation admits bare `vihs` in supported VS Code terminals.
- On Windows, extension admission also persists governed user-scope PATH
  admission so new standalone PowerShell windows can resolve `vihs` by name
  without manual shell-profile editing or machine-wide install doctrine.
- `VI History: Prepare Local Runtime Settings CLI` is the governed repair and
  refresh surface when `vihs` is missing, stale, or a repaired VS Code or
  Node.js runtime needs the entrypoint refreshed.
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
Linux/Docker validated preview route, `ready` is bounded to the selected
provider on the current machine; native Windows LabVIEW and Docker Desktop
Windows-container proof remain deferred. The interactive no-argument `vihs`
flow invokes this same bounded validation after you confirm or change settings.

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

### Is Windows installed-user behavior proven by the current Ubuntu/Docker lane?

No.

The current governed claim is Linux/Docker validated preview. Users can still
evaluate the installed extension on their own Windows setups, but this machine
does not retain native Windows LabVIEW or Docker Desktop Windows-container
proof.

For Marketplace pre-release `1.3.10`, use the community-validation intake
packet when reporting Windows/LabVIEW results:
`docs/product/marketplace-community-validation-intake-v1.3.10.md`.
Selectable means available for validation, not maintainer-proven.

Windows proof remains deferred until a real Windows/LabVIEW host runner exists
and produces retained evidence for:

- native Windows host LabVIEW for the host lane
- Docker Desktop in Windows-container mode for the expert container lane

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

Start with [Release Procedure](../release-procedure.md), then use the release
candidate route in [Public Release Candidate](../product/public-release-candidate.md)
when you need the retained release candidate evidence.
