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
| `DEBT-0003` | open | `benchmark` | high | high | `TRANCHE-011` / `ISSUE-0408` / `PROGRAM-0003` | expand the comparable prefix beyond pair `128` or close `PROGRAM-0003` on the bounded comparable-prefix packet |
| `DEBT-0004` | open | `runtime` | high | high | `TRANCHE-011` / `ISSUE-0408` / `PROGRAM-0003` | complete Linux `138/138` truthfully or close the full-window blocker explicitly on the bounded comparable-prefix control plane |
| `DEBT-0005` | retired | `control-plane` | high | high | `TRANCHE-011` / `ISSUE-0408` / `PROGRAM-0003` | retired by `2f4ced0` |
| `DEBT-0006` | open | `control-plane` | high | high | `TRANCHE-013` / `ISSUE-0410` / `PROGRAM-0005` | land the first-class execution-mode contract, canonical execution-request validation, Windows container-capability hard stops, visible Docker pull progress, and transparent provider feedback without silent fallback |

## Notes

- `DEBT-0001` captures the now-retired ambiguity where exact-pair diagnosis
  could admit incomplete selected/base hash bundles or contradictory runtime
  override bundles.
- `DEBT-0002` captures the now-retired contamination seam where explicit
  Windows runtime paths could mix x86 and x64 surfaces when
  `--prefer-bitness` was omitted.
- `DEBT-0003` is the active Windows pair-129 benchmark-proof ceiling, now
  strengthened by governed evidence that the published Windows image exposes
  only x86 `LabVIEWCLI.exe` alongside x64 `LabVIEW.exe` at the blocking seam.
- `DEBT-0004` is the active Linux pair-135 full-window benchmark-proof
  ceiling.
- `DEBT-0005` captures the now-retired admission-control gap where
  CLI/env/default synthesis could materialize an explicit effective runtime
  bundle after a narrower raw-CLI validation pass had already succeeded.
- `DEBT-0006` is the active execution-policy ambiguity around host-only,
  Docker-only, and auto conflict/acquisition behavior for installed users,
  including canonical execution-request validation and Windows
  container-capability truth.

## Operational Rule

Future sessions shall not retire, defer, or accept debt without updating the
machine-readable ledger in the same tranche.
