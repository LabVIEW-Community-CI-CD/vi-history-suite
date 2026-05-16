# Debt Retirement Contract

## Purpose

Define the governed rule that future sessions must use to remove, defer, or
accept technical and documentation debt without leaving it implicit.

The central rule is:

- no silent debt

If a future session discovers debt, it shall not remain only in chat, shell
history, or local memory.

## Contract

Every discovered debt item shall be one of:

1. retired now
2. open debt with an explicit owner, evidence set, next gate, and exit criteria
3. accepted bounded exception with explicit rationale

## Invariants

The repo debt contract is only satisfied when all of these remain true:

- no silent debt:
  discovered debt is retired, ledgered, or explicitly accepted as an exception
- no orphaned fixes:
  changes that retire meaningful debt move code, docs, requirements, and
  reader surfaces together when they affect repo truth
- no contaminated experiments:
  benchmark or runtime evidence is not retained as product truth when the
  launch surface is already known to be contaminated
- no unresolved local truth:
  local retained findings are either normalized into the authority docs or
  explicitly discarded as non-authoritative characterization
- no unbounded carryover:
  open debt has a governing owner and a concrete next gate

## Required Surfaces

The debt package consists of:

- `docs/product/debt-retirement-contract.md`
- `docs/product/debt-taxonomy.md`
- `docs/product/debt-ledger.md`
- `docs/product/debt-ledger.json`

The machine-readable source of truth is:

- `docs/product/debt-ledger.json`

## Required Item Fields

Every debt item retained in `docs/product/debt-ledger.json` shall capture:

- stable id
- title
- debt class
- status
- severity
- contamination risk
- short summary
- owner tranche, issue, and execution program
- authoritative source docs
- repo evidence paths
- discovered context
- next gate when the item is still open
- exit criteria
- retirement commit when the item is retired
- accepted-exception rationale when the item is not meant to be retired now

## Gate

The documentation-package gate is the enforcement surface.

The debt contract fails closed when:

- the debt package is missing from the authority docs
- the machine-readable ledger is malformed
- a debt item is ownerless, unbounded, or missing required evidence fields
- retired items do not retain a retirement commit
- open items do not retain a next gate and exit criteria
- accepted exceptions do not retain an explicit rationale
- reader surfaces drift from the debt package

## Control-Plane Relationship

The debt contract does not replace the active programs.

Instead:

- programs own execution
- the debt contract governs how debt is retained and retired inside that work

Current seed examples:

- retired contamination debt from ambiguous exact-pair diagnosis bundles
- retired contamination debt from mixed explicit Windows x86/x64 runtime path
  bundles
- retired contamination debt from effective proof-admission bundles that used
  to bypass canonical admission control after CLI/env/default synthesis
- accepted bounded exception for the Windows pair-129 benchmark ceiling under
  the current governed image contract
- accepted bounded exception for the Linux pair-135 full-window benchmark
  ceiling under the current governed Linux contract
- retired extension execution-mode and Docker-acquisition UX debt from the
  earlier Docker-only installed baseline, retained as historical evidence after
  the host-default local `LabVIEWCLI` plus bounded expert Docker direction
  became current branch truth

## Operational Rule

Future sessions shall not call work “done” when they already know meaningful
technical or documentation debt remains but is absent from the debt ledger.

If the work changes the debt picture, the same tranche shall update:

- the debt ledger
- the current-state control plane
- the wiki/bundled-doc reader surfaces when they are in scope

before the tranche is treated as complete.
