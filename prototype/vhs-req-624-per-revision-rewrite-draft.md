# VHS-REQ-624 rewrite draft (single-selected-tree -> per-revision-tree staging)

Handoff for the coupled 706 two-tree staging fix (LINUX requirements-steward draft -> WIN carries in the runtime PR, per co-land option A). Replace the current `### VHS-REQ-624` block in `docs/requirements/srs.md` with the block below, and update the RTM row (see end). Attribution: root cause proven by LINUX (single-variable staging contrast, SerialPortNuggets 740KB + lv_icon.vi 965KB green with per-revision worktrees).

## Gate analysis (answers WIN's referenceAgreement question)

- `referenceAgreement` is driven by SRS-refs <-> RTM-refs AGREEMENT, NOT prose. Neither the runtime code change nor this prose rewrite trips it, PROVIDED the Implementation/Verification ref LISTS in `srs.md` and `rtm.csv` stay identical. This draft keeps the ref lists UNCHANGED (same impl refs comparisonReportPlan/RuntimeExecution/Packet; same verification refs incl the `manual:` tag), so `referenceAgreement` is trivially satisfied.
- The REAL co-land drivers (why option A / one atomic PR is right):
  1. TESTS: `comparisonReportRuntimeExecution.test.ts` (L4067-4068) asserts BOTH `leftFilePath` and `rightFilePath` start with one `plan.treeRoot`; the two-tree change breaks that assertion, so the tests must update in the same PR (test gate).
  2. `requirements:criteria:enforce`: each VHS-REQ-624 acceptance criterion is cited by a verification test; this rewrite keeps the criteria structure parallel (same topics, inverted single->per-revision) so the criterion citations map cleanly, but the tests that cite them must move with the criteria.
  3. Accuracy: the SRS must not describe stale single-tree behavior once the code is per-revision.
- If your runtime fix ADDS a new module/helper or a new test file, tell me and I add it to BOTH `srs.md` refs AND the `rtm.csv` row AND `traceability-inventory.csv` (else `referenceAgreement` + `missingInventoryEntries` fail). Otherwise refs are unchanged.
- NOTE: VHS-REQ-624 was a DELIBERATE simplification ("Optimize for dependency load success and simplicity; do not claim per-revision dependency fidelity"), which explicitly disclosed that the base VI loads against newer deps and "may recompile it and distort the rendered diff." The 706 finding is that on Linux host-native this tradeoff does not merely distort -- it FAILS (GSW recursive LEIF load). So this is a requirement EVOLUTION, not just a bug patch; the rewrite inverts the fidelity guidance.

## New SRS block (paste into srs.md)

### VHS-REQ-624: Per-Revision Tree Staging For Comparison

- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Comparison Reports
- Statement: Comparison staging shall materialize each compared revision's
  surrounding tree separately -- the base revision into a base-side tree and the
  selected revision into a selected-side tree -- and place each revision's
  compared VI blob at the compared VI's normalized repository-relative path
  within its own revision tree, under distinct left and right filenames, so
  LabVIEW resolves each VI's in-repo dependencies as they existed at that VI's
  revision when CreateComparisonReport runs.
- Acceptance Criteria:
  - Two trees are materialized: one from the base revision carrying the left
    (base) VI, and one from the selected revision carrying the right (selected)
    VI; neither VI is loaded against the other revision's dependencies.
  - Each tree materialization faithfully reproduces every file tracked at that
    revision, including paths excluded from `git archive` by
    `.gitattributes export-ignore`, so each VI's in-repo dependencies are present
    beside it at load time instead of being dropped.
  - Contents of submodules recorded at each revision are materialized at their
    repo-relative paths (including nested submodules) on a best-effort basis per
    side, so dependencies tracked through a submodule resolve at load time. When
    a submodule's objects are unavailable, it is skipped without failing the
    comparison.
  - Each compared VI blob is written at the compared VI's normalized
    repo-relative path inside its own revision's tree, under distinct left and
    right filenames, so the two top-level VIs never collide on qualified name in
    one LabVIEW session.
  - The left filename carries the base blob in the base-revision tree and the
    right filename carries the selected blob in the selected-revision tree;
    CreateComparisonReport receives them as VI1 and VI2.
  - When either revision's tree cannot be materialized, the run degrades to a
    factual blocked state with a recorded reason and the runtime is not invoked.
  - The report and retained packet disclose that each VI was evaluated against
    its own revision's in-repo dependencies (per-revision dependency fidelity),
    so dependency changes between the two revisions are reflected rather than
    masked, and neither VI is recompiled against the other revision's newer
    dependencies.
  - When per-revision trees were materialized, the report and retained packet
    also disclose that only files tracked in the repository are staged, so
    dependencies outside the repository (for example LabVIEW-installed paths such
    as `vi.lib`, `instr.lib`, `user.lib`, or the `resource` directory, and
    absolute-path references) are not staged and may render as placeholder
    (white) items as a staging limitation rather than a change in the VI.
  - Staged inputs and a per-revision materialized-tree manifest are retained as
    runtime evidence consistent with VHS-REQ-147 and VHS-REQ-148.
- Agent Work Scope:
  - Change staging-plan construction (per-side tree roots and revisions),
    host-native execution-context preparation, and the report and packet caveat
    text together; add deterministic unit coverage for the two-tree layout and
    the fail-closed path on each side.
- Implementation References:
  - `src/reporting/comparisonReportPlan.ts`
  - `src/reporting/comparisonReportRuntimeExecution.ts`
  - `src/reporting/comparisonReportPacket.ts`
- Verification References:
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
  - `tests/unit/comparisonReportPacket.test.ts`
  - `manual:dependency-harness-newest-tree-staging`
- Change Guidance:
  - Provide true per-revision dependency fidelity: load each VI against its own
    revision's in-repo dependencies (the base VI is no longer loaded against the
    selected revision's dependencies). This supersedes the prior
    newest-revision-only simplification that traded fidelity for a single tree.
  - Materialize each tree with a faithful working-tree checkout (for example a
    temporary-index `git read-tree` then `git checkout-index`), not
    `git archive`, so files excluded by `.gitattributes export-ignore` are not
    dropped from either staged tree.
  - Recurse into submodule gitlinks best-effort per side (skip on failure) so
    submodule contents resolve; keep each superproject materialization
    fail-closed.
  - Rename only the top-level compared VI on each side to avoid the
    same-qualified-name collision; never rename dependencies.

## RTM row (docs/requirements/rtm.csv, row for VHS-REQ-624)

- Change the requirement TITLE column from `Newest-Revision Tree Staging For Comparison` to `Per-Revision Tree Staging For Comparison` (keep it in sync with the SRS heading; requirements:integrity checks title agreement).
- Keep ImplementationRefs / VerificationRefs IDENTICAL to the SRS block above (no ref-list change -> referenceAgreement satisfied). Only sync them if the runtime fix adds a new file, in which case add it to SRS refs + this RTM row + traceability-inventory.csv together.

## After paste

- Run `npm run requirements:integrity` (referenceAgreement + title agreement), `npm run requirements:criteria:enforce` (criterion citations), and `npm run traceability:audit`.
- The optional `manual:` tag rename (`newest-tree-staging` -> `per-revision-tree-staging`) is cosmetic; if you rename it, change it in BOTH the SRS Verification References and the RTM VerificationRefs identically.
