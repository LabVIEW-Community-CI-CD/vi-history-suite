# ADR-0019: Governed Wiki Workbench System

## Status

Accepted

## Context

`vi-history-suite` already has:

- a docs-authoring image (`ADR-0012`)
- authority-first wiki seeding rules (`ADR-0013`)
- a governed cross-repo jump map (`ADR-0014`)
- version-matched bundled user documentation (`ADR-0015`)

But those pieces still left a weak operational gap. Future wiki work could
still depend on ad hoc sibling-path shell work, manual publication-ledger
validation, and unretained staging state. That makes wiki iteration harder to
repeat and easier to drift away from the authority docs package.

## Decision

Adopt a governed wiki workbench system as part of the documentation-package
control plane.

The system shall:

1. resolve the authority repo, sibling wiki repo, and optional experiment
   mirror from the governed repo-jump map
2. validate remotes, control files, publication-ledger state, and authority
   doc paths before staging or bundled-doc refresh
3. retain a stable `.cache/wiki-workbench/latest-workbench.json` manifest
4. retain per-page staging bundles and publication-prep receipts under
   `.cache/wiki-workbench/`
5. expose both local `wiki:workbench:*` commands and Docker-first
   `docs:workbench:wiki:*` commands
6. keep the main repo documentation package as authority while treating the
   wiki repo as a derived reader surface

## Consequences

### Positive

- wiki iteration becomes deterministic instead of path-guessing shell work
- future sessions can discover the current wiki state from retained manifests
- bundled-doc sync uses the same governed topology as wiki staging
- Docker-first wiki work no longer depends on chat memory

### Negative

- the repo now sustains another control-plane CLI and retained state surface
- documentation changes must keep the wiki workbench, docs workbench, and
  repo-jump surfaces aligned
- the system prepares publication deterministically but still does not replace
  explicit human review before a real wiki push

## Implementation Surface

- `src/tooling/wikiWorkbench.ts`
- `src/cli/runWikiWorkbench.ts`
- `scripts/syncBundledDocs.js`
- `package.json`
- `docs/documentation-workbench.md`
- `docs/product/wiki-authority-map.md`
- `docs/product/wiki-seed-plan.md`
- `docs/product/wiki-publication-ledger.md`
- `docs/product/program-repo-jump.md`
- `tests/unit/runWikiWorkbenchCli.test.ts`
