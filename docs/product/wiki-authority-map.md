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
12. [wiki-publication-ledger.json](./wiki-publication-ledger.json)
13. [overview.md](../architecture/overview.md)
14. `docs/architecture/adr/`
15. [README.md](../../README.md)
16. [Documentation Package Workbench](../documentation-workbench.md)
17. [program-repo-jump.md](./program-repo-jump.md)
18. [program-repo-jump-map.json](./program-repo-jump-map.json)
19. [release-procedure.md](../release-procedure.md)
20. [information-item-map.md](../information-item-map.md)
21. [cm-plan.md](../cm/cm-plan.md)
22. [research-alignment.md](../research/authoritative/research-alignment.md)
23. [research-implementation-index.json](../research/authoritative/research-implementation-index.json)

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
- `npm run wiki:workbench:doctor` or `npm run docs:workbench:wiki:doctor`
  reports no `error` issues against the current authority/wiki topology
- the documentation coherence ledger records no unresolved internal
  contradiction across the audited authority surfaces
- the wiki publication ledger is updated when a page is actually pushed to the
  wiki repository
- packaged bundled docs are refreshed when the published wiki set changes and
  the packaged user-doc surface is meant to stay version-matched to that set

## Hard Completion Contract

The wiki is not complete until the zero-gap completion invariant passes.

That requires:

- `docs/product/wiki-coverage-matrix.json` to list every in-scope
  requirements-and-standards source plus every ADR file
- every matrix row to remain `complete` and `published`
- the accepted ADR aggregation rule to be satisfied
- every published wiki page to be recorded in the publication ledger
- `docs/product/wiki-publication-ledger.json` to retain `nextPage = null`
- the docs gate to pass with the wiki-coverage invariant test enabled

## Incremental Wiki Workflow

1. Read the authority order from top to bottom.
2. Run `npm run wiki:workbench:plan` or
   `npm run docs:workbench:wiki:plan` to resolve the current published page set
   and next-page target from the governed ledger.
3. Draft or update only the wiki page sections touched by the latest completed
   tranche.
4. Prefer requirement and ADR wording over inferred implementation detail.
5. Cite repo-relative doc paths for every substantive product claim.
6. If a needed fact exists only in source or tests, stop and first promote that
   fact into the governed docs stack.
7. Use `npm run wiki:workbench:prepare` or
   `npm run docs:workbench:wiki:prepare` to retain the page-authority bundle
   and publication-prep receipt before any real wiki publication step.
8. When substantial documentation-package edits are needed, use the documented
   workbench in [../documentation-workbench.md](../documentation-workbench.md)
   before widening into wiki drafting.

## Current High-Value Wiki Inputs

- install and release: `SHIP-0001`, release readiness matrix, release procedure
- user workflow: README, current state, SRS
- architecture: architecture overview plus ADRs
- documentation-package iteration: `docs/documentation-workbench.md`
- cross-repo orientation: `docs/product/program-repo-jump.md`
- documentation coherence: `docs/product/documentation-coherence-ledger.md`
- incremental wiki page order: `docs/product/wiki-seed-plan.md`
- published wiki inventory: `docs/product/wiki-publication-ledger.md`
- machine-readable published wiki inventory:
  `docs/product/wiki-publication-ledger.json`
- wiki completion invariant:
  `docs/product/wiki-coverage-matrix.json`
- proof and verification: RTM, test plan, retained design-gate and harness
  evidence paths
