# Wiki Authority Map

## Purpose

Define how future wiki content for `vi-history-suite` shall be generated from
governed repository documentation instead of from source-code spelunking or
chat memory.

## Authority Order

When future sessions create or refresh wiki pages, use this order:

1. [SHIP-0001: Releasable VI History Suite](./SHIP-0001-releasable-vi-history-suite.md)
2. [release-readiness-matrix.json](./release-readiness-matrix.json)
3. [blocker-ledger.json](./blocker-ledger.json)
4. [development-queue.json](./development-queue.json)
5. [current-state.md](./current-state.md)
6. [srs.md](../requirements/srs.md)
7. [rtm.csv](../requirements/rtm.csv)
8. [test-plan.md](../testing/test-plan.md)
9. [documentation-coherence-ledger.md](./documentation-coherence-ledger.md)
10. [wiki-seed-plan.md](./wiki-seed-plan.md)
11. [wiki-publication-ledger.md](./wiki-publication-ledger.md)
12. [overview.md](../architecture/overview.md)
13. `docs/architecture/adr/`
14. [README.md](../../README.md)
15. [research-alignment.md](../research/authoritative/research-alignment.md)
16. [research-implementation-index.json](../research/authoritative/research-implementation-index.json)

If two documents disagree, the higher document in this list wins until the
lower document is corrected.

## Excluded Inputs

Future wiki generation shall not use these as primary truth sources:

- `src/`
- `tests/`
- transient shell output
- prior chat messages

Those surfaces may only be used to locate evidence paths that must then be
verified back against the governed documentation stack above.

## Readiness Gate Before Wiki Work

Do not create or refresh wiki pages until these are true:

- the latest retained design-gate report is `pass`, or `pass` with only the
  known quiet `standards-assurance` tail still running
- `current-state.md` aligns with the active tranche and blocker state in
  `development-queue.json`, `release-readiness-matrix.json`, and
  `blocker-ledger.json`
- README, SRS, RTM, test plan, architecture overview, and active ADRs describe
  the same implemented product truth without unresolved contradiction
- the documentation-package workbench has been updated when the wiki-relevant
  docs stack changed materially
- the documentation coherence ledger records no unresolved internal
  contradiction across the audited authority surfaces
- the wiki publication ledger is updated when a page is actually pushed to the
  wiki repository

## Incremental Wiki Workflow

1. Read the authority order from top to bottom.
2. Draft or update only the wiki page sections touched by the latest completed
   tranche.
3. Prefer requirement and ADR wording over inferred implementation detail.
4. Cite repo-relative doc paths for every substantive product claim.
5. If a needed fact exists only in source or tests, stop and first promote that
   fact into the governed docs stack.
6. When substantial documentation-package edits are needed, use the documented
   workbench in [../documentation-workbench.md](../documentation-workbench.md)
   before widening into wiki drafting.

## Current High-Value Wiki Inputs

- install and release: `SHIP-0001`, release readiness matrix, release procedure
- user workflow: README, current state, SRS
- architecture: architecture overview plus ADRs
- documentation-package iteration: `docs/documentation-workbench.md`
- documentation coherence: `docs/product/documentation-coherence-ledger.md`
- incremental wiki page order: `docs/product/wiki-seed-plan.md`
- published wiki inventory: `docs/product/wiki-publication-ledger.md`
- proof and verification: RTM, test plan, retained design-gate and harness
  evidence paths
