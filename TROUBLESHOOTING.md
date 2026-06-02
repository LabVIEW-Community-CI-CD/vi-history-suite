# Troubleshooting

## `vihs` Is Not Found

Run `VI History: Prepare Local Runtime Settings CLI` from the Command Palette,
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
   the Linux container provider continues to invoke `-Headless` because the
   container's bundled LabVIEW image initializes headless mode correctly.

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
  while running in headless mode. The headless-session-reset retry will
  attempt one recovery; if it also fails, switch to non-headless or use the
  Linux container provider.

If the failure persists, attach the run's full `diagnostics/` directory and
the LabVIEW interactive log
(`/tmp/lvrt_<version>_interactive_<user>_log.txt`) when filing the report.

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
