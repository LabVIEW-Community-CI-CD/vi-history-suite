# Troubleshooting Compare Report Generation

Use this guide when `Compare`, `vihs --validate`, or `vihs validate-fixture`
fails while generating a VI Comparison Report.

For setup-first onboarding, use [FIRST-RUN.md](./FIRST-RUN.md). For admitted
provider/year/bitness coverage, use the
[README Installed-user LabVIEW support matrix](./README.md#installed-user-labview-support-matrix).

## Symptom → likely cause → next action

| Symptom | Likely cause | Next action |
| --- | --- | --- |
| `runtimeErrorCode=VIHS_E_LABVIEW_VERSION_UNSUPPORTED` or guidance that LabVIEW `2024`/older is not supported | Selected LabVIEW version cannot create the VI Comparison Report in this workflow | Install/use LabVIEW `2025`, `2026`, or newer, then run `vihs` to select that runtime and run `vihs --validate` to confirm readiness. |
| `runtimeBlockedReason=labview-exe-not-found` or `runtimeBlockedReason=labview-cli-not-found-for-bitness` | Selected year/bitness is not installed locally | Re-run `vihs`, select the installed year/bitness, then run `vihs --validate`. |
| Output says an alternative bitness was detected | Requested bitness does not match the installed LabVIEW bitness | Select the matching bitness manually. VI History Suite reports alternatives but does not auto-switch bitness. |
| `LabVIEWCLI` not found (or CLI path missing) | LabVIEWCLI is absent or not discoverable for the selected runtime | Confirm LabVIEW `2025`+ is installed, then run `vihs --validate` and verify the reported CLI path and bitness match your install. |
| `runtimeFailureReason=labview-cli-connection-failed`, `runtimeBlockedReason=windows-host-runtime-surface-contaminated`, or other VI Server/session readiness failure | Stale LabVIEW/LabVIEWCLI session, VI Server port conflict, or contradictory runtime surface facts | Close stale LabVIEW/LabVIEWCLI processes, clear competing VI Server listeners, then run `vihs --validate` before retrying `Compare`. |
| Docker compare path is blocked/not implemented for the selected variant | Docker is a bounded expert provider; many selectable bundles are validation/reporting only | Use an admitted host path first when available, or switch to an admitted Docker bundle from the support matrix; do not expect automatic provider fallback. |

## Where logs, proof, and evidence files are written

- `vihs --validate` prints runtime diagnostics to the terminal, including
  `runtimeErrorCode` on failure.
- `vihs --validate --proof-out <dir>` writes retained validation packet files in
  `<dir>`, including `vihs-runtime-validation-proof.json` and
  `vihs-runtime-validation-issue.md`.
- `vihs validate-fixture ... --proof-out <dir>` writes fixture evidence in
  `<dir>`, including `vihs-fixture-validation-proof.json`,
  `vihs-fixture-validation-issue.md`, and report artifacts under
  `<dir>/reports/HARNESS-VHS-002/` (for example
  `comparison-report-smoke.json`, `comparison-report-smoke.md`,
  `comparison-report-smoke.html`).

Windows-container proof on Docker Desktop remains community/deferred until
retained evidence for that lane is completed in
[public issue #65](https://github.com/svelderrainruiz/vi-history-suite/issues/65).
