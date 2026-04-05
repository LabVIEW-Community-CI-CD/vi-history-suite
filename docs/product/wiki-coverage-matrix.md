# Wiki Coverage Matrix

## Purpose

Define the hard completion contract for the `vi-history-suite` wiki.

The wiki is not finished because it feels broad enough. It is finished only
when every in-scope requirements-and-standards documentation surface is
represented on published wiki pages and the docs gate proves that zero-gap
state.

The machine-readable source of truth for this contract is:

- `docs/product/wiki-coverage-matrix.json`

## Hard Completion Contract

The wiki completion invariant passes only when all of these are true:

1. every in-scope entry in `docs/product/wiki-coverage-matrix.json` has
   `representationStatus = complete`
2. every in-scope entry has `publicationStatus = published`
3. every ADR file under `docs/architecture/adr/` is explicitly listed in the
   matrix
4. every published wiki page is recorded in
   `docs/product/wiki-publication-ledger.json`
5. `docs/product/wiki-publication-ledger.json` retains `nextPage = null`
6. the docs gate passes with the wiki-coverage invariant test enabled

## Accepted ADR Aggregation Rule

The ADR set is represented through an explicit accepted aggregation rule:

- every ADR file still appears as its own matrix row
- the published wiki representation may be collective rather than one-page-per-ADR
- the accepted aggregate pages are:
  - `Architecture.md`
  - `Architecture-Decision-Records.md`

This keeps the ADR set fully represented without pretending that every ADR
needs its own standalone wiki page.

## Scope Summary

The current in-scope authority surfaces are:

- repository entrypoint and release/control docs
- review-scenario and decision-record docs
- benchmark diagnosis control docs
- configuration-management and documentation-control docs
- ship, release-readiness, blocker, queue, and current-state docs
- wiki authority, seed, publication, and cross-repo jump docs
- SRS, RTM, and test plan
- architecture overview and every accepted ADR
- research-control docs that currently participate in wiki-authority generation

## Current Representations

| Source Group | Current Wiki Representation |
| --- | --- |
| Repository entrypoint and release control | `home.md`, `Install-And-Release.md`, `Current-State.md`, `Blocker-Ledger.md`, `Development-Queue.md` |
| Review scenarios and decision records | `Review-Scenarios-And-Decision-Records.md` |
| Benchmark diagnosis control | `Comparison-Reports-And-Dashboard-Review.md`, `Current-State.md` |
| Requirements and verification | `User-Workflow.md`, `Comparison-Reports-And-Dashboard-Review.md`, `Requirements-And-Verification.md` |
| Documentation control plane | `Documentation-Workbench.md`, `Documentation-Coherence-Ledger.md`, `Wiki-Authority-Map.md`, `Program-Repo-Jump.md` |
| Architecture and ADRs | `Architecture.md`, `Architecture-Decision-Records.md` |
| Research-facing control surfaces | `Current-State.md`, `Comparison-Reports-And-Dashboard-Review.md` |

## Operational Rule

Future sessions shall not call the wiki complete, or stop a wiki-completion
tranche, unless the machine-readable matrix remains zero-gap under the docs
gate.

If a new in-scope authority surface is added, the wiki is no longer complete
until:

1. the matrix is updated
2. the derived wiki representation is published
3. the publication ledger and bundled docs are refreshed
4. the docs gate passes again
