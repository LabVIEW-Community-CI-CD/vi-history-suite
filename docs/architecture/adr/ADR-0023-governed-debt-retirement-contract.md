# ADR-0023: Governed Debt Retirement Contract

## Status

Accepted

## Context

`vi-history-suite` now carries several long-lived control planes at once:

- ship and release-readiness control
- wiki-completion control
- benchmark-proof control
- canonical experiment-admission control

Those surfaces already protect bounded product truth, but they do not yet give
future sessions one explicit rule for technical or documentation debt.

Without that rule, debt can remain implicit in three risky ways:

- a fix lands but the debt it retired is never normalized into repo truth
- a discovered blocker stays only in chat or local notes instead of becoming a
  ledgered repo surface
- future experiments or documentation changes accumulate ambiguous carryover
  that weakens retained evidence, gates, or operator guidance

The repo needs a debt contract that is stronger than “keep the backlog tidy.”
It must make current, past, and future debt explicit and machine-checkable.

## Decision

Adopt a governed debt-retirement contract for `vi-history-suite`.

1. No silent debt.
   - A discovered debt item shall be either:
     - retired now
     - recorded as open debt with owner, evidence, next gate, and exit criteria
     - recorded as an accepted bounded exception with explicit rationale
2. Debt shall be first-class documentation-package truth.
   - The authority repo shall retain:
     - `docs/product/debt-retirement-contract.md`
     - `docs/product/debt-taxonomy.md`
     - `docs/product/debt-ledger.md`
     - `docs/product/debt-ledger.json`
3. Debt ownership remains cross-program but explicit.
   - Each debt item shall map to its governing tranche, issue, and execution
     program instead of floating without an owner.
4. Debt shall be machine-checkable.
   - The documentation-package gate shall fail closed when the debt package is
     missing, malformed, or drifted from the repo control plane.
5. Documentation and reader surfaces shall carry the same contract.
   - README, current-state, workbench docs, wiki-authority surfaces, the live
     wiki, and the bundled docs shall represent the debt contract and current
     debt ledger.
6. Debt retirement is not a separate backlog universe.
   - Active or queued programs still own their debt items; the debt contract
     governs how those items are retained and retired.

## Consequences

### Positive

- future sessions get one explicit no-silent-debt rule
- retired debt becomes discoverable repo truth instead of chat-only history
- open benchmark and runtime blockers stay bounded to a documented owner and
  next gate
- documentation debt and technical debt use one shared control-plane pattern
- the docs gate becomes a ratchet against silent regression

### Negative

- documentation upkeep expands because debt now has mandatory authority,
  machine-readable, and wiki surfaces
- small partial fixes can no longer be left as informal carryover
- sessions must keep debt, queue, requirements, and wiki surfaces aligned

## Implementation Surface

- `docs/product/debt-retirement-contract.md`
- `docs/product/debt-taxonomy.md`
- `docs/product/debt-ledger.md`
- `docs/product/debt-ledger.json`
- `tests/unit/debtLedgerDocs.test.ts`
- `scripts/run-docs-gate.js`
- `README.md`
- `docs/product/current-state.md`
- `docs/documentation-workbench.md`
- `docs/information-item-map.md`
- `docs/product/wiki-authority-map.md`
- `docs/product/wiki-seed-plan.md`
- `docs/product/wiki-publication-ledger.md`
- `docs/product/wiki-publication-ledger.json`
- `docs/product/wiki-coverage-matrix.md`
- `docs/product/wiki-coverage-matrix.json`
