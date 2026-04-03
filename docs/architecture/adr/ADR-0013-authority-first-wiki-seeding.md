# ADR-0013: Authority-First Wiki Seeding

## Status

Accepted

## Context

Future wiki work for `vi-history-suite` must be derived from governed
documentation, not from source-code spelunking or prior chat state. The repo
already contains a wiki-authority map, but the documentation package still
needs an explicit architecture decision that locks wiki generation to the
requirements, ADR, ship-control, release, and verification surfaces.

Without that decision, wiki drafting can drift from the repo control plane and
reintroduce contradictions that were already resolved in the documentation
package.

## Decision

Adopt an authority-first wiki-seeding model.

Wiki pages shall be drafted incrementally from governed repository
documentation in this order:

1. ship-control and release-readiness docs
2. current state and requirements
3. RTM and test plan
4. architecture overview and ADRs
5. README and research-alignment surfaces

`src/`, `tests/`, transient shell output, and prior chat messages shall not be
used as primary truth sources for wiki generation.

## Consequences

### Positive

- wiki content remains traceable to governed repo docs
- documentation coherence becomes a prerequisite for wiki growth
- future sessions can add wiki pages incrementally without rediscovering
  authority order

### Negative

- wiki work may pause when governed docs are incomplete or contradictory
- new implementation facts must first be promoted into the docs package before
  they can appear in the wiki

## Implementation Surface

- `docs/product/wiki-authority-map.md`
- `docs/product/documentation-coherence-ledger.md`
- `docs/product/wiki-seed-plan.md`
- `docs/documentation-workbench.md`

