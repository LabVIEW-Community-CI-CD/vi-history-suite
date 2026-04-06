# Debt Ledger

## Purpose

Retain the current and retired technical/documentation debt items that the repo
has already normalized into its authority control plane.

The machine-readable companion surface is:

- `docs/product/debt-ledger.json`

The governing contract and taxonomy are:

- `docs/product/debt-retirement-contract.md`
- `docs/product/debt-taxonomy.md`

## Current Ledger

| Debt Id | Status | Class | Severity | Contamination Risk | Owner | Next Gate / Retirement |
| --- | --- | --- | --- | --- | --- | --- |
| `DEBT-0001` | retired | `control-plane` | high | high | `TRANCHE-011` / `ISSUE-0408` / `PROGRAM-0003` | retired by `3dab8fda2f1a924b22f3d1614df6c3c070377844` |
| `DEBT-0002` | retired | `benchmark` | high | high | `TRANCHE-011` / `ISSUE-0408` / `PROGRAM-0003` | retired by `44891ebe541ad8f9d1da1c3990aafeb947a049bc` |
| `DEBT-0003` | accepted-exception | `benchmark` | high | high | `TRANCHE-011` / `ISSUE-0408` / `PROGRAM-0003` | reopen only if the governed Windows benchmark image contract changes to provide a coherent same-bitness `labview-cli` bundle |
| `DEBT-0004` | accepted-exception | `runtime` | high | high | `TRANCHE-011` / `ISSUE-0408` / `PROGRAM-0003` | reopen only if the governed NI Linux runtime/benchmark-image contract changes or another in-scope Linux benchmark provider becomes the accepted authority surface |
| `DEBT-0005` | retired | `control-plane` | high | high | `TRANCHE-011` / `ISSUE-0408` / `PROGRAM-0003` | retired by `2f4ced0` |
| `DEBT-0006` | retired | `control-plane` | high | high | `TRANCHE-013` / `ISSUE-0410` / `PROGRAM-0005` | retired by the `PROGRAM-0005` closeout slice that lands structured history-panel compare-runtime detail rows |

## Notes

- `DEBT-0001` captures the now-retired ambiguity where exact-pair diagnosis
  could admit incomplete selected/base hash bundles or contradictory runtime
  override bundles.
- `DEBT-0002` captures the now-retired contamination seam where explicit
  Windows runtime paths could mix x86 and x64 surfaces when
  `--prefer-bitness` was omitted.
- `DEBT-0003` is now an accepted bounded exception: the current governed
  Windows benchmark image contract retains a mixed-bitness-only `labview-cli`
  surface at pair `129`, with x86 `LabVIEWCLI.exe`, x64 `LabVIEW.exe`, and no
  coherent same-bitness `labview-cli` bundle in scope for the current image
  recipe.
- `DEBT-0004` is now an accepted bounded exception: a fresh governed
  canonical-host rerun on April 6, 2026 still failed at pair `135/138` as
  `labview-cli-connection-failed (linux-headless-recursive-load)` after one
  governed `CloseLabVIEW -Headless` reset exited `1`, so the current Linux
  contract remains bounded at that late full-window seam.
- `DEBT-0005` captures the now-retired admission-control gap where
  CLI/env/default synthesis could materialize an explicit effective runtime
  bundle after a narrower raw-CLI validation pass had already succeeded.
- `DEBT-0006` is now retired: the installed extension now exposes `auto` /
  `host-only` / `docker-only`, rejects silent provider fallback, retains
  canonical effective execution-request validation as part of provider choice,
  makes Windows `auto` conflict-aware through selected `LabVIEW.ini` /
  VI Server port facts, and now validates Docker CLI availability, daemon
  reachability, active container mode, and governed image presence before the
  Windows provider is selected or rejected; governed Windows image acquisition
  now runs with visible progress and retained acquisition state, and the
  history panel now retains the latest compare-runtime provider/acquisition
  summary plus rejected-provider reasons in-panel, blocked or failed compare
  actions now emit one concise mode-aware warning, the history panel mirrors
  governed runtime/acquisition progress while the action is still running, and
  the closeout slice now renders separate history-panel detail rows for
  provider, execution mode, report/runtime status, acquisition state, rejected
  providers, reason, diagnostic reason, and next action instead of leaving
  that last front-facing transparency gap open.

## Operational Rule

Future sessions shall not retire, defer, or accept debt without updating the
machine-readable ledger in the same tranche.
