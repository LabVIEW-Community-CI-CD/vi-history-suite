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

- Date: `2026-04-05`
- Repo docs gate:
  - command: `node scripts/run-docs-continuous-integration.js --skip-links`
  - result: `pass`
- Repo design gate:
  - command: `npm run design:gate`
  - result: `pass`
- Standards-guided release gate:
  - command:
    `py -3 "$env:USERPROFILE\\.codex\\skills\\repo-standards-review\\scripts\\run_assurance.py" . --profile release-gate`
  - result:
    `coverage PASS`, `cm PASS`, `req PASS`, `arch PASS`, `doc PASS`, `dod PASS`

## Resolved Contradictions In This Pass

| Id | Surface | Symptom | Resolution |
| --- | --- | --- | --- |
| DOC-001 | docs gate | `run-docs-gate.js` depended on caller cwd and failed when launched outside repo root | docs gate now derives repo root from the script file path and is proven by unit test plus a successful external invocation |
| DOC-002 | architecture docs | `docs/architecture/overview.md` referenced `ADR-0012` even though the ADR file was absent | `ADR-0012` is now committed as the architecture decision for the docs-authoring workbench image |
| DOC-003 | wiki preparation | wiki generation rules existed, but there was no retained page-seeding surface or coherence ledger to ground incremental work | added this ledger, a wiki seed plan, and `ADR-0013` to keep wiki work authority-first |
| DOC-004 | decision-record docs | repeated reviewer entry in the extension-facing flow was not modeled in requirements/docs | decision-record reviewer defaults are now implemented and reflected in SRS, RTM, test plan, and current state |
| DOC-005 | cross-repo navigation | documentation-package and skill work first spanned three repos and later expanded to a planned fourth experiment mirror, but there was no governed local jump surface tying authority, experiment, wiki, and assurance entrypoints together | added `program-repo-jump-map.json`, `program-repo-jump.md`, `ADR-0014`, a local `program:repos` CLI, and a mirrored `repo_jump.py` surface in `repo-standards-review` |
| DOC-011 | GitHub experiment authority split | the repo had a prepared GitHub Linux benchmark lane, but some docs risked implying the private GitHub mirror already existed instead of clearly marking it as a planned mirror distinct from both GitLab authority and the public facade | tightened the control-plane docs, repo-jump surface, RTM/test plan, and control-plane tests so the mirror is modeled as planned until it is actually created |
| DOC-012 | GitHub experiment realization | the private GitHub experiment mirror was later created and the Linux lane needed a reusable published image, but several governed docs/tests still described the mirror as hypothetical and the benchmark image as only a derived local recipe | updated the control-plane docs, RTM/test plan, repo-jump surface, ADR-0016, and benchmark workflow/tests so they model the existing mirror truthfully and require a published headless Linux benchmark image |
| DOC-013 | wiki authoring system | the repo had a docs-authoring image and authority-first wiki rules, but no deterministic multi-repo workbench flow for staging wiki pages, validating the publication ledger, or retaining publication-prep receipts | added a governed wiki workbench CLI, Docker-first workbench commands, retained workbench manifests and publication-prep receipts, ADR-0019, and docs-gate coverage so wiki iteration no longer depends on ad hoc sibling-path shell work |
| DOC-006 | packaged user guidance | users could read the wiki or repo docs, but the installed extension had no version-matched local documentation surface and no machine-readable published wiki inventory to drive one | added `docs/product/wiki-publication-ledger.json`, `resources/bundled-docs/`, `scripts/syncBundledDocs.js`, `ADR-0015`, and the extension-facing bundled documentation command/panel |
| DOC-007 | requirements traceability | `docs/requirements/rtm.csv` cited proving test ids that `docs/testing/test-plan.md` did not enumerate, while the test plan also contained stale ids that were not traced back through RTM | reconciled RTM and test-plan ids in both directions so the governed verification inventory now matches exactly |
| DOC-008 | research control plane | the research alignment matrix and implementation index still described an older, narrower history-panel and dashboard surface after adaptive history-window and latest-dashboard-run work landed | updated `research-alignment.md` and `research-implementation-index.json` so they now reflect the live history-window packet, `latest-dashboard-run.json`, and current dashboard/history evidence set |
| DOC-009 | recurrence prevention | the repo had no automated docs-gate check that would fail when SRS/RTM/test-plan parity or the key research-facing dashboard/history traces drifted again | added `tests/unit/requirementsDocs.test.ts` to the repo-native docs gate and current-state surface so future drift fails closed in CI and local docs iteration |
| DOC-010 | post-release control plane | the active post-release tranche, issue, and execution program were documented across queue, ship, README, current-state, `PROGRAM-0002`, and `ISSUE-0407`, but there was no dedicated docs-gate check to fail when those identities or the open Gate C-D truth drifted | added `tests/unit/postReleaseControlPlaneDocs.test.ts`, wired it into the docs gate, and reflected that gate in the current-state/docs-package control plane |
| DOC-014 | installed-user docs CI and packaging freshness | the repo could prove authority-doc coherence yet still risk shipping stale bundled installed-user HTML or underemphasizing the Docker-first Windows execution truth that matters most to extension users | added a retained docs continuous-integration lane with installed-user truth checks, made `syncBundledDocs.js` deterministic on unchanged content, and wired `npm run package` to rerun `npm run docs:bundle` so stale bundled docs cannot ship through the governed package path |

## Current Internal Status

- No unresolved contradiction is currently retained across the audited
  authority surfaces above.
- The repo-native docs gate plus retained docs continuous-integration lane now
  enforce SRS/RTM parity, RTM/test-plan parity, bundled-doc drift detection,
  installed-user execution-policy truth checks, the key research-facing
  history-panel/dashboard trace surfaces, and active post-release control-plane
  coherence for `TRANCHE-010` / `ISSUE-0407` / `PROGRAM-0002`.
- The cross-repo jump surface now distinguishes authority repo, private GitHub
  experiment mirror, public facade, wiki repo, and assurance skill without
  confusing the experiment mirror with authority or public distribution.
- Active tranche, active ship issue, release target, and open blocker ids agree
  across ship-control docs.
- Wiki preparation is now constrained to the documentation package, not source.
- Published wiki state now also drives a packaged bundled-doc surface that can
  ship inside the installed extension.
- The first incremental wiki seed is now published and tracked in
  `docs/product/wiki-publication-ledger.md`.

## Residual External Risks

- The companion `repo-standards-review` release on this machine is now
  `v0.2.18`; older local references such as `v0.2.2` are historical and
  should not be treated as the current outer assurance baseline.
- The docs-authoring image is fully wired in the repo and CI, but local Docker
  runtime proof is still environment-dependent on this machine.
- `research-implementation-index.json` remains a curated capability-status
  surface rather than a full 1:1 requirement-trace database, so future audits
  should continue treating SRS plus RTM as the primary formal trace surfaces.

## Next Documentation Moves

1. Keep the docs gate and standards-review release gate green after each
   documentation tranche.
2. Treat `tests/unit/requirementsDocs.test.ts` as the first stop when
   requirements, RTM, test-plan, or research-control-plane edits fail the docs
   gate, and widen that test rather than relying on ad hoc manual audits.
3. Treat `npm run docs:ci` as the retained closeout surface for documentation
   tranches, and keep the installed-user truth checks focused on the
   Windows Docker-first execution rule before widening secondary doc detail.
4. Treat `tests/unit/postReleaseControlPlaneDocs.test.ts` as the first stop
   when post-release queue, ship, program, or issue docs drift, and widen that
   test instead of relying on manual control-plane reconciliation.
5. Keep the `repo-standards-review` jump resolver and docs-workbench discovery
   surfaces aligned with `docs/product/program-repo-jump-map.json`.
6. Continue wiki drafting in the incremental order retained in
   `wiki-seed-plan.md`, with each publication recorded in
   `docs/product/wiki-publication-ledger.md`.
