# Troubleshooting

## `vihs` Is Not Found

Run `VI History: Set Up Comparison Runtime` from the Command Palette,
then open a new integrated terminal and run:

```bash
vihs --validate
```

## Compare Is Blocked

Run:

```bash
vihs --validate
```

Check the selected provider, LabVIEW year, bitness, runtime engine, and any
`VIHS_E_*` error code. Fix the reported runtime state before retrying compare.

## Concurrent LabVIEW Bitness Conflict

If a LabVIEW session is already running at a different bitness than the
extension's selected runtime, compare will be blocked or fail with a
runtime reason of `windows-host-bitness-conflict` (preflight) or
`labview-host-bitness-conflict` (post-failure). The warning toast includes
a `Pick Runtime Provider` action button that opens the runtime quick-pick
so you can change `viHistorySuite.labviewBitness` to match the running
LabVIEW. Alternatively, close the running LabVIEW session, then rerun
comparison report generation. The retained doctor summary names both the
observed running bitness and the currently selected bitness.

## Status Bar Label Does Not Match The CLI Choice

The `VI History runtime` status bar label is sourced from the persisted
selection (`viHistorySuite.runtimeProvider`, `viHistorySuite.labviewVersion`,
`viHistorySuite.labviewBitness`) when all three keys are populated and the
combination is satisfiable on this host. It refreshes immediately when those
keys change.

If `vihs --provider …` (or a `settings.json` edit) does not update the label:

1. Run `VI History: Show Runtime Summary` and inspect the `Drift:` line.
   - `none` means selection and recommendation already align.
   - `selection differs from recommendation: …` means the persisted choice
     is satisfiable but diverges (the label honors the persisted choice).
   - `selection unsatisfiable on this host; falling back to recommendation`
     means LabVIEW for that year/bitness is not installed and Docker is not
     available; clear or change the persisted keys.
2. Click the `VI History runtime` status bar item to open
   `Pick Runtime Provider`. Choosing `(none) — auto-detect` clears the three
   keys and lets detection drive the label.
3. Confirm the CLI wrote to **User** settings (not Workspace). The extension
   reads from the merged `viHistorySuite` configuration; a workspace override
   wins over a user-level CLI write.

## Docker Was Selected

Confirm Docker is running in the same environment that launched VS Code:

```bash
docker version
docker info --format "{{.OSType}}"
```

The first Docker compare can pull a large LabVIEW runtime image.

## VI Preview shows "requires Docker to generate the cache" on the Host runtime

VI previews are **generated on Docker** and **displayed from the render cache**.
On the Host (installed LabVIEW) runtime the editor shows a cached preview when
one exists and otherwise guides you to generate it on Docker, because a live
render is Docker-only. Two ways to see a preview on Host:

- **Generate on Docker, then view on Host.** With `viHistorySuite.preview.enabled`
  on and Docker selected, the background warmer caches the workspace's VIs. Then
  switch to the Host runtime and reopen the VI — the display reads the cache and
  does not run Docker. Note the cache is keyed by the VI file's on-disk identity,
  so this applies to directly-opened `.vi` files (not Source Control diff bases).
- **Let a Docker-less LabVIEW environment render directly.** For a dedicated
  LabVIEW VM with no Docker (for example the Vagrant LabVIEW VM, since Docker and
  Vagrant cannot run at once), set `viHistorySuite.preview.allowHostNativeRender: true`
  so the Host both generates the cache and visualizes previews. Turn on
  `viHistorySuite.preview.blockDiagramInteractive` for the interactive
  pan/zoom/case-stepper view.

## A pinned dev-tools version is not being used

Run **VI History: Show Dev-Tools Status** first — it reports the pinned setting,
whether that version is installed and verified, and which build the MCP server
is actually launching. The pinned build is used only when it is **installed and
integrity-verified in a trusted workspace**; otherwise the extension fails
closed to the bundled build. Common causes:

- **Pinned but not installed.** Run **VI History: Install Pinned Dev-Tools
  Version** (the extension also offers this when it detects a missing pin).
  Reload the window after a successful install so the MCP server relaunches.
- **Untrusted workspace.** Installing and launching a pinned version requires a
  trusted workspace. Trust the workspace, then install.
- **Install failed.** The status message names the reason:
  - `release-not-found` — no published `devtools-vX.Y.Z` release matches the
    pinned tag; check the tag against the dev-tools releases.
  - `download-failed` — network or asset access problem; retry.
  - a digest/`content-digest-mismatch` — the downloaded release failed integrity
    verification and was removed; do not use it.
- **Malformed setting.** `viHistorySuite.devTools.version` must be `bundled` or a
  `devtools-vX.Y.Z` tag; any other value falls back to bundled.

To return to the shipped build, set `viHistorySuite.devTools.version` back to
`bundled` (optionally run **Uninstall Dev-Tools Version** to reclaim storage).

## Windows + Docker (Linux container) compare fails instantly with a bash parse error

### Symptom

On a **Windows host** with the **Docker** runtime selected and Docker running in
**Linux-container mode** (an NI LabVIEW **Linux** image such as
`nationalinstruments/labview:2026q1-linux`), the compare fails in well under a
second. The retained diagnostics show:

- `diagnostics/attempt-1/failure-classification.json` with
  `failureReason: "command-exited-nonzero"` and `exitCode: 2`, and
- `diagnostics/attempt-1/runtime-stderr.txt` containing a bash parse error whose
  quotes have been stripped from the in-container script, ending in:

  ```text
  lv_dir=$(dirname: -c: line 17: unexpected EOF while looking for matching `)'
  ```

LabVIEW never launches; the failure is in shell parsing. The same compare
succeeds on a Linux host (for example a Codespace) with the same provider and
image.

### Fix

This is fixed in `vi-history-suite` after 1.32.0: the Linux container provider
now spawns `docker` directly on a Windows host instead of routing the command
through `powershell.exe`, so the container bash script keeps its quoting.

### Workaround on 1.32.0 and earlier

Until you can update to a build that contains the fix, use any one of:

- Run the extension through **Remote-WSL** (open the repository in WSL) so the
  host platform is Linux and the working direct-`docker` path is used, or
- Switch to the **host-native** Windows LabVIEW provider (LabVIEW 2025 or newer
  with the LabVIEW CLI installed), or
- Switch to the **Windows-container** provider (Docker in Windows-container mode
  with a Windows LabVIEW image), which is unaffected.

## Cold-launch comparison failures (-350000 / `labview-cli-connection-failed`)

### Symptom

The first comparison after VS Code starts (no LabVIEW already running) fails
with retained-runtime evidence containing
`failureReason: "labview-cli-connection-failed"` and a stderr line ending in
`(-350000)` from `LabVIEWCLI.exe`. Subsequent compares succeed because the
LabVIEW process spawned by the failed attempt is still running.

### What changed (VHS-REQ-148)

`vi-history-suite` now writes the NI LabVIEWCLI connect-window keys
`OpenAppReferenceTimeoutInSecond` and
`AfterLaunchOpenAppReferenceTimeoutInSecond` into the active
`LabVIEWCLI.ini` before each Windows host-native LabVIEW CLI compare. NI's
default of 60 s is shorter than a true cold LabVIEW launch on most hosts;
the extension's default of 180 s matches the value already used on the
Windows-container path.

The hardening is:

- atomic (write tempfile + rename),
- idempotent (no write when both keys already match the requested value),
- fail-soft (any error is recorded in the diagnostics bundle; the compare
  is not blocked by an ini failure), and
- one-shot for the backup: a `LabVIEWCLI.ini.vhs-backup` sidecar is created
  the first time the helper rewrites the file and is never overwritten.

Linux and Windows-container compares are unchanged.

### Tuning the connect window

Configure `viHistorySuite.runtime.cliConnectTimeoutSeconds` (integer, default
`180`, range `30`–`600`) in user or workspace settings. A higher value is
appropriate when LabVIEW takes longer than 180 s to come up cold (slow disks,
heavy startup VIs, anti-virus scanning); a lower value is appropriate when
you want the CLI to fail fast against a clearly broken LabVIEW install.

The configured value is recorded in every diagnostics bundle so retained
evidence stays internally consistent if the setting changes between runs.

### Confirming the fix took effect

Open the run's diagnostics manifest and look for the
`environmentFingerprint.cliConnectTimeoutHardening` block:

```jsonc
{
  "applied": true,
  "requestedValue": 180,
  "iniPath": "C:/Program Files/National Instruments/Shared/LabVIEW CLI/LabVIEWCLI.ini",
  "previousValues": { "OpenAppReferenceTimeoutInSecond": "60", "AfterLaunchOpenAppReferenceTimeoutInSecond": "60" },
  "currentValues": { "OpenAppReferenceTimeoutInSecond": "180", "AfterLaunchOpenAppReferenceTimeoutInSecond": "180" },
  "backupCreated": true
}
```

`applied: true` with matching `currentValues` means the connect window is
hardened. Subsequent runs typically show `applied: false` with
`reason: "already-current"` — that is the expected idempotent steady state,
not a failure.

If `applied` is `false` and `reason` is one of `no-candidate`,
`read-failed`, `write-failed`, `rename-failed`, or `invalid-value`, the
ini was not rewritten this run; check that `LabVIEWCLI.ini` exists in one
of NI's standard locations and that the VS Code process can write to it.

### When `-350000` still occurs after hardening

If a cold compare still fails with `-350000` after `cliConnectTimeoutHardening.applied`
shows the keys at your configured value, attach the run's full
`diagnostics/` directory (manifest, environment fingerprint, every
`attempt-N/` subdir, runtime stdout/stderr) when filing the report. The
manifest path is shown at the top of the comparison-report panel.

You can also widen the window further (for example to `300` or `600`) and
re-run; `vi-history-suite` enforces the same value on every compare so the
new ceiling applies immediately.

### Restoring NI's defaults

Stop VS Code, then either delete `LabVIEWCLI.ini` (NI recreates it on next
use) or restore it from the `LabVIEWCLI.ini.vhs-backup` sidecar that the
extension wrote the first time it hardened the file. To stop the extension
from re-hardening, set `viHistorySuite.runtime.cliConnectTimeoutSeconds` to
`60` (NI's default) — the keys will then be rewritten to match NI's value
and stay there.

## Linux host-native compare fails with LabVIEW error 8 (`File permission error`) or hangs in headless mode

### Symptom

On Linux, the host-native LabVIEW CLI compare either:

- fails quickly with retained evidence containing
  `LabVIEW: (Hex 0x8) File permission error.` followed by
  `CreateComparisonReport operation failed.`, or
- runs for minutes without producing a report and the operator must cancel.

The same compare succeeds when the runtime selection is the Linux Docker
container.

### Root causes

Two independent issues can cause this on a Linux host running LabVIEW 2026:

1. **VI Server TCP/IP is disabled.** `LabVIEWCLI` connects to LabVIEW over
   VI Server TCP. If the LabVIEW install has not enabled the VI Server TCP
   listener (default port `3363`), the CLI cannot drive `CreateComparisonReport`,
   the GSW splash path runs to completion, and the run eventually fails with
   LabVIEW error 8.
2. **`HeadlessManager` is broken on the active LabVIEW build.** On at least
   LabVIEW 2026 `26.1.1f1`, the headless manager logs
   `Failed to initialize headless LabVIEW.` every 10 seconds and never binds
   a working session, so any `-Headless` invocation hangs until the operator
   cancels.

### Fix

1. Enable VI Server TCP/IP in LabVIEW (Tools → Options → VI Server) and
   confirm port `3363` (or your configured port) is listening:

   ```bash
   ss -lnt | grep 3363
   ```

   `vi-history-suite` reads the active `labview.conf` before launching
   LabVIEWCLI (searched in `~/natinst/.config/LabVIEW-<version>/`,
   `~/.config/natinst/LabVIEW-<version>/`, then
   `/etc/natinst/LabVIEW-<version>/`) and blocks the run with
   `runtimeExecution.blockedReason = 'linux-vi-server-tcp-disabled'` when
   `server.tcp.enabled` is `False` or absent. When enabled, the resolved
   `server.tcp.port` (default `3363`) is passed to LabVIEWCLI as
   `-PortNumber`.

2. Leave the comparison invocation **non-headless** on Linux host-native.
   `vi-history-suite` keeps Linux host-native runs non-headless by default;
   the Linux container provider continues to invoke `-Headless` against the
   container's bundled LabVIEW Professional executable
   (`/usr/local/natinst/LabVIEW-<year>-64/labviewprofull`), which engages
   headless mode and completes comparison reports.

3. Only set `LV_RTE_LINUX_HEADLESS=1` (in the VS Code extension host
   environment, e.g. `~/.profile` or a shell that launches `code`) if your
   active LabVIEW build's headless manager is known to work.

### Confirming the fix took effect

Open the retained packet for a Linux host-native run and confirm that:

- `runtimeExecution.args` does **not** contain `-Headless` (default), or
  contains `-Headless` only when you explicitly opted in.
- `runtimeExecution.state` is `succeeded` and `runtimeExecution.reportExists`
  is `true`.

### When a Linux host-native compare still fails

Check the retained `runtimeExecution.diagnosticReason`:

- `linux-vi-server-tcp-disabled`: VI Server TCP/IP is off in `labview.conf`
  (or the file is missing). Enable VI Server in LabVIEW Tools → Options →
  VI Server. The blocked run records the inspected `labviewIniPath` so you
  can see which config file was read.
- `labview-cli-create-report-permission-error`: LabVIEW returned error 8.
  Confirm VI Server TCP/IP is enabled and reachable from the extension host.
- `linux-headless-init-failed`: Your LabVIEW build cannot initialize
  headless mode. Unset `LV_RTE_LINUX_HEADLESS` (or set it to anything other
  than `1`) to drop back to the non-headless path.
- `linux-headless-recursive-load`: A recursive GSW LEIF load was observed
  while running in headless mode. LabVIEW logs this line during Getting
  Started Window initialization and usually recovers, so it is only reported
  when the run **also** failed (it is suppressed on a successful run). If the
  run failed, the headless-session-reset retry will attempt one recovery; if
  that also fails, switch to non-headless or use the Linux container provider.

If the failure persists, attach the run's full `diagnostics/` directory and
the LabVIEW interactive log
(`/tmp/lvrt_<version>_interactive_<user>_log.txt`) when filing the report.

### LabVIEW stays open after a Linux host-native comparison

On Linux host-native runs, `LabVIEWCLI` launches LabVIEW to generate the
comparison report and **leaves it running** after the operation completes
(`CreateComparisonReport operation succeeded`). This is expected: the resident
LabVIEW process keeps the VI Server session warm so subsequent comparisons
start faster instead of paying the cold-launch cost again. The retained
packet's `runtimeExecution.diagnosticNotes` records this so it is not mistaken
for a leak.

The process runs under the `labview` name (a symlink to the installed
executable such as `labviewcommunity`), so a cleanup that matches only
`labviewcommunity` will miss it. When you no longer need the warm session:

- Quit LabVIEW from its own window, or
- Match the resident process by its full path, for example:

  ```bash
  pkill -f '/usr/local/natinst/LabVIEW-<version>-64/labview'
  ```

The container and headless paths do not leave a GUI behind (the container is
ephemeral, and the headless path fails closed), so this note applies only to
the Linux host-native, non-headless provider.

### Linux container compare reports "VI path invalid" (Docker bind-mount not visible)

If the Linux **container** provider runs but `CreateComparisonReport` reports
`VI 1 path invalid or does not exist: /workspace/staging/...` even though the
staged VI files exist on the host, the container almost certainly cannot see
the bind-mounted report directory. The most common cause is **snap-packaged
Docker confinement**: a snap `docker` can only bind-mount paths it has been
granted access to. By default the `home` interface is connected (so paths
under `$HOME` mount correctly), but `/tmp` and removable media are **not**;
mounting such a path silently yields an empty `tmpfs` at `/workspace`.

Confirm with:

```bash
snap connections docker | grep -E 'home|removable-media'
docker run --rm -v "$HOME/some/dir:/workspace" <image> ls -la /workspace
```

Resolve it by keeping the extension's report storage under `$HOME` (the
default VS Code `workspaceStorage` location already qualifies), or connect the
required snap interface (for removable media, `sudo snap connect
docker:removable-media`). Native (non-snap) Docker is unaffected.

When this happens, the comparison report's retained diagnostics now name this
cause directly: a failed Linux **container** compare whose bind-mounted report
directory is outside your home directory attaches an actionable
bind-mount-visibility note pointing at the fix above (VHS-REQ-663), so you do
not have to infer it from the raw `path invalid` error.

## `npm run compile` Cannot Find tsc

If `npm run compile`, `npm run check`, or the F5 **Run VI History Suite** launch
fails with:

- Windows: `'tsc' is not recognized as an internal or external command`
- macOS / Linux: `tsc: command not found`

then the local development dependencies are missing or incomplete. The build
uses the `typescript` compiler installed under `node_modules`, so this happens
after a fresh clone, after `node_modules` is deleted, or when an install omitted
dev dependencies.

The `precompile` / `precheck` preflight (`scripts/checkDevDependencies.js`, also
runnable as `npm run deps:check`) detects this and prints the remedy before the
raw compiler runs. Install dependencies from the repository root:

```bash
npm ci
```

Then re-run your command. If `npm ci` still does not restore `typescript`,
confirm dev dependencies are not being omitted (neither `NODE_ENV` nor
`npm_config_omit` should be set to `dev` or `production`). See
[INSTALL.md](./INSTALL.md) for the full source-evaluation setup.

## Source Evaluation

Inside a devcontainer or Codespace, reset the basic loop with:

```bash
npm ci
npm run check
npm test
```

## Closeout Evidence Registry Access Fails

If closeout evidence fails while inspecting or pulling the published standards
workbench image:

```bash
npm run closeout:evidence -- --kind standards --issue <issue-number> --standards-runner docker --save-dir assurance-closeout-evidence
```

Use these failure signatures to choose remediation:

- `error getting credentials`, `credential helper`, `credsStore`, or
  `credHelpers`: Docker credential-helper configuration is invalid for the
  current environment. Fix `~/.docker/config.json` helper settings and retry.
- `unauthorized`, `access forbidden`, `requested access ... denied`, or
  `pull access denied`: refresh credentials and rerun
  `docker login registry.gitlab.com`.
- `manifest unknown`, `name unknown`, or repository not found: verify published
  image availability before retry.

For non-interactive environments, set auth upfront:

```bash
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=/absolute/path/to/askpass-helper.sh
printf '%s' "$RSR_PAT" | docker login registry.gitlab.com -u oauth2 --password-stdin
```
