# Comparison Runtime Diagnostics Bundle

When a comparison report run completes (success or failure), the runtime emits a
**diagnostics bundle** under each report directory. The bundle is designed as a
self-describing, versioned set of files that humans and LLM-based analyzers can
consume without re-running the failure or re-instrumenting the codebase.

## Layout

```
<reportDirectory>/
├── diff-report-*.html              # NI-generated comparison report (when produced)
├── report-packet.html              # User-facing packet
├── report-metadata.json            # Full ComparisonReportPacketRecord
├── runtime-stdout.txt              # Latest CLI stdout
├── runtime-stderr.txt              # Latest CLI stderr
├── runtime-diagnostic-log.txt      # Latest LabVIEW CLI diagnostic log copy
├── runtime-process-observation.json
└── diagnostics/
    ├── diagnostics-manifest.json   # Open this first
    ├── environment-fingerprint.json
    └── attempt-1/
        ├── pre-launch-baseline.json
        └── failure-classification.json   # Only when the attempt failed
    └── attempt-2/                  # Present only when a recovery retry ran
        └── …
```

## File contracts

All files start with `schemaVersion: 1`. Bump the constant
`DIAGNOSTICS_SCHEMA_VERSION` in
[`src/reporting/diagnostics/diagnosticsRecorder.ts`](../../src/reporting/diagnostics/diagnosticsRecorder.ts)
when changing any payload shape, and document the new shape here.

### `diagnostics-manifest.json`

Index of every artifact in the bundle. Read this file first.

| Field | Purpose |
| --- | --- |
| `schemaVersion` | Version gate for analyzers |
| `generatedAt` | ISO timestamp of the manifest write |
| `reportDirectory` | Absolute path the bundle belongs to |
| `diagnosticsDirectory` | Absolute path to `diagnostics/` |
| `analysisHint` | Short human-readable hint for first-time readers |
| `entries[]` | Each entry has `kind`, `filename`, `filePath`, optional `attemptIndex` |

`kind` values currently emitted: `environment-fingerprint`,
`pre-launch-baseline`, `failure-classification`, `runtime-stdout`,
`runtime-stderr`, `runtime-diagnostic-log`, `runtime-process-observation`,
`report-metadata`, `report-packet`. Future `kind` values may be added without a
schema bump as long as existing entries remain backward-compatible.

### `environment-fingerprint.json`

Captured once per `executeComparisonReport` invocation.

- `os`: platform, release, arch, hostname.
- `node`: Node.js version.
- `extensionVersion`: package.json version of the active extension.
- `reportingProvider`: `provider`, `engine`, `bitness`, `platform` from the
  selected runtime.
- `toolchain`: paths and `mtime` of `LabVIEW.exe`, `LabVIEWCLI.exe`,
  `LVCompare.exe`; `LabVIEW.ini` `mtime`, `sha256`, and a key-only summary of
  startup-relevant settings (`server.tcp.enabled`, `server.tcp.port`,
  `LoadAddOns`, `RestoreOnLaunch`, `showWelcomeOnLaunch`, `autoLoadProject`,
  `recentProjectsListSize`); resolved `labviewTcpPort`.
- `cliConnectTimeoutHardening` (Windows host-native + `labview-cli` only;
  VHS-REQ-148): outcome of writing the configurable connect-window timeout
  into `LabVIEWCLI.ini` before the CLI is spawned. Fields:
  - `applied` — `true` when both `OpenAppReferenceTimeoutInSecond` and
    `AfterLaunchOpenAppReferenceTimeoutInSecond` were rewritten this run.
    `false` when the helper short-circuited or failed (see `reason`).
  - `requestedValue` — the integer seconds requested via
    `viHistorySuite.runtime.cliConnectTimeoutSeconds` (default 180).
  - `iniPath` — the first existing candidate path, when one was found.
  - `previousValues` / `currentValues` — key→value snapshots before and
    after the write (omitted when no candidate was found).
  - `backupCreated` — `true` only the first time the helper rewrites the
    file; the `LabVIEWCLI.ini.vhs-backup` sidecar is never overwritten.
  - `reason` — `already-current` (idempotent short-circuit),
    `no-candidate`, `read-failed`, `write-failed`, `rename-failed`, or
    `invalid-value`. Absent when `applied` is `true`.

### `attempt-N/pre-launch-baseline.json`

Captured immediately before the LabVIEWCLI invocation for attempt `N`
(`attempt-1` is the initial attempt, `attempt-2` is the headless-recovery
retry, etc.).

- `applicable: false` when the host is non-Windows or the observation deps were
  not injected; `notApplicableReason` explains why.
- `processObservation`: snapshot of `LabVIEW.exe`, `LabVIEWCLI.exe`,
  `LVCompare.exe` PIDs already running before launch.
- `listenerObservations[]`: TCP listener entries on the requested port.
- `observedListenerOnRequestedPort`: convenience boolean — `true` means
  LabVIEW was already serving the configured VI Server port before the attempt
  started.

### `attempt-N/failure-classification.json`

Written only when an attempt produced a `failureReason`. Captures the matched
fragment (`matchedFragment`, clamped to 500 chars + `…`), the matched source
(`stdout` | `stderr` | `diagnostic-log`), exit code, signal, duration, and
links to that attempt's stdout/stderr/diagnostic-log/process-observation.

## Reading the bundle as a future analyzer

1. Open `diagnostics-manifest.json`.
2. Read `environment-fingerprint.json` to anchor the host snapshot.
3. For each `attempt-N/`:
   - Read `pre-launch-baseline.json` to learn whether LabVIEW was already up
     and whether the VI Server port was bound.
   - Read `failure-classification.json` (when present) to map symptom →
     classified `failureReason`.
4. Cross-reference with `runtime-stdout.txt` / `runtime-stderr.txt` /
   `runtime-diagnostic-log.txt` for raw evidence.

## Best-effort guarantee

All bundle writes are wrapped in try/catch and **must never** fail the
comparison run. A missing artifact in the manifest entries set is itself a
diagnostic signal (e.g. `failure-classification` absent for a run with a
`failureReason` indicates the recorder write itself failed).

## Known follow-ups

- Per-attempt archiving of `runtime-stdout.txt` / `runtime-stderr.txt` /
  `runtime-diagnostic-log.txt` so a successful retry does not overwrite the
  failed attempt's evidence.
- In-flight observation timeline (`runtime-observation-timeline.jsonl`) sampled
  every 2 s while the CLI is running, enabling cold-start latency analysis.
- Wider matched-fragment capture from the live classification call site.
