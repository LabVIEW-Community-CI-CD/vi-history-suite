# Documentation Coherence Ledger

## Purpose

Retain the latest documentation-package coherence pass for `vi-history-suite`
so release work and future wiki work start from governed repo truth instead of
source inference or chat memory.

## Audited Authority Surfaces

- `docs/product/SHIP-0001-releasable-vi-history-suite.md`
- `docs/product/release-readiness-matrix.json`
- `docs/product/blocker-ledger.json`
- `docs/product/development-queue.json`
- `docs/product/current-state.md`
- `docs/requirements/srs.md`
- `docs/requirements/rtm.csv`
- `docs/testing/test-plan.md`
- `docs/architecture/overview.md`
- `docs/architecture/adr/`
- `README.md`
- `docs/product/wiki-authority-map.md`
- `docs/product/wiki-seed-plan.md`
- `docs/product/wiki-publication-ledger.md`
- `docs/product/wiki-publication-ledger.json`
- `docs/product/program-repo-jump.md`
- `docs/product/program-repo-jump-map.json`
- `docs/documentation-workbench.md`
- `docs/release-procedure.md`
- `resources/bundled-docs/manifest.json`
- `docs/research/authoritative/research-alignment.md`
- `docs/research/authoritative/research-implementation-index.json`

## Latest Coherence Pass

- Date: `2026-04-03`
- Repo docs gate:
  - command: `node scripts/run-docs-gate.js --skip-links`
  - result: `pass`
- Standards-guided release gate:
  - command:
    `python3 /mnt/c/Users/sveld/.codex/skills/repo-standards-review/scripts/run_assurance.py /home/sveld/code/standards/vi-history-suite --profile release-gate`
  - result:
    `coverage PASS`, `cm PASS`, `req PASS`, `arch PASS`, `doc PASS`, `dod N/A`

## Resolved Contradictions In This Pass

| Id | Surface | Symptom | Resolution |
| --- | --- | --- | --- |
| DOC-001 | docs gate | `run-docs-gate.js` depended on caller cwd and failed when launched outside repo root | docs gate now derives repo root from the script file path and is proven by unit test plus a successful external invocation |
| DOC-002 | architecture docs | `docs/architecture/overview.md` referenced `ADR-0012` even though the ADR file was absent | `ADR-0012` is now committed as the architecture decision for the docs-authoring workbench image |
| DOC-003 | wiki preparation | wiki generation rules existed, but there was no retained page-seeding surface or coherence ledger to ground incremental work | added this ledger, a wiki seed plan, and `ADR-0013` to keep wiki work authority-first |
| DOC-004 | decision-record docs | repeated reviewer entry in the extension-facing flow was not modeled in requirements/docs | decision-record reviewer defaults are now implemented and reflected in SRS, RTM, test plan, and current state |
| DOC-005 | cross-repo navigation | documentation-package and skill work spanned three repos, but there was no governed local jump surface tying product, wiki, and assurance entrypoints together | added `program-repo-jump-map.json`, `program-repo-jump.md`, `ADR-0014`, a local `program:repos` CLI, and a mirrored `repo_jump.py` surface in `repo-standards-review` |
| DOC-006 | packaged user guidance | users could read the wiki or repo docs, but the installed extension had no version-matched local documentation surface and no machine-readable published wiki inventory to drive one | added `docs/product/wiki-publication-ledger.json`, `resources/bundled-docs/`, `scripts/syncBundledDocs.js`, `ADR-0015`, and the extension-facing bundled documentation command/panel |

## Current Internal Status

- No unresolved contradiction is currently retained across the audited
  authority surfaces above.
- Active tranche, active ship issue, release target, and open blocker ids agree
  across ship-control docs.
- Wiki preparation is now constrained to the documentation package, not source.
- Published wiki state now also drives a packaged bundled-doc surface that can
  ship inside the installed extension.
- The first incremental wiki seed is now published and tracked in
  `docs/product/wiki-publication-ledger.md`.

## Residual External Risks

- The companion `repo-standards-review` release is tagged locally as `v0.2.2`,
  but GitLab release-publication proof could not be confirmed through the local
  API path on this machine.
- The docs-authoring image is fully wired in the repo and CI, but local Docker
  runtime proof is still environment-dependent on this machine.
- The public GitHub facade installer/support surface is scaffolded, but it has
  not yet ingested the immutable `v0.2.0` release artifact set.

## Next Documentation Moves

1. Keep the docs gate and standards-review release gate green after each
   documentation tranche.
2. Keep the `repo-standards-review` jump resolver and docs-workbench discovery
   surfaces aligned with `docs/product/program-repo-jump-map.json`.
3. Continue wiki drafting in the incremental order retained in
   `wiki-seed-plan.md`, with each publication recorded in
   `docs/product/wiki-publication-ledger.md`.
