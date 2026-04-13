# Repo-Standards-Review v0.2.9 Pass 2 Gap Inventory

## Purpose

Retain the first released-skill-backed inventory after the GitFlow branch
governance pass closed.

This document answers a different question from pass 1:

- not "what still fails the released gate right now?"
- but "what larger refactor is still warranted even though the released gate
  now passes?"

## Released-Skill Baseline

Using released `repo-standards-review` `v0.2.9` against
`feature/local-labviewcli-selection-and-explicit-compare` now yields:

- `coverage`: `PASS`
- `cm`: `PASS`
- `req`: `PASS`
- `arch`: `PASS`
- `doc`: `PASS`
- `dod`: `N/A`

Interpretation:

- pass 1 is complete
- the branch is now compliant with the current released branch-governance gate
- the next refactor passes are no longer emergency gate repairs

## Released-Skill Evidence Passes

Released-skill passes retained during pass 2:

- audit pass: current branch passes the released release-gate profile
- evidence-pack pass: current branch exposes defensible evidence across REQ,
  ARCH, TEST, CM, and DOC
- uplift pass: the released skill now recommends sustaining the current gates
  rather than a missing-core-artifacts sprint

Interpretation:

- released `v0.2.9` is currently too permissive to force the larger
  normalization work by itself on this branch
- the broader refactor must therefore be driven as a deliberate compliance
  uplift program, not as a current-release blocker

## Structural Inventory

Current scale on this branch:

- requirements files under `docs/requirements/`:
  - `srs.md`
  - `rtm.csv`
- `SyRS` file: missing
- `SRS` requirement rows: `540`
- `RTM` requirement rows: `540`
- ADR documents: `37`
- product issue documents: `12`
- execution-program documents: `6`

What that means:

- the repo now passes the released gate, but it still carries a large and
  potentially expensive standards surface
- the larger refactor should focus first on structure and contradiction risk,
  not on indiscriminate text churn across hundreds of rows

## Confirmed Structural Debt

1. Missing `SyRS`
   - the requirements package still contains only `srs.md` and `rtm.csv`
   - system-level and software-level requirements are not yet split into
     separate governed information items

2. Requirement-system scale risk
   - `540` SRS rows and `540` RTM rows create high contradiction and
     traceability-maintenance risk
   - broad row count alone is not non-compliance, but it makes later
     normalization expensive and error-prone

3. ADR normalization debt
   - the repo carries `37` ADR documents
   - released `v0.2.9` accepts the current architecture gate, but that does
     not prove the ADR package is internally normalized
   - at least one residual naming/path drift remains:
     `ADR-0030-semver-decision-framework-and-gitflow-lite-branch-ci-topology.md`
     still carries the retired `gitflow-lite` filename even after the text was
     corrected to `GitFlow`

4. Control-plane versus package drift risk
   - the branch-governance pass fixed the current CM contradiction
   - the repo still contains a broad set of execution-program, issue, ADR,
     README, current-state, requirements, and test-plan surfaces that can
     drift independently if the next passes are not tranche-based

## Pass 2 Conclusion

The next refactor should not start by editing hundreds of requirement rows.

The right order is:

1. information-item structure
2. contradiction ledger
3. requirement partitioning
4. ADR normalization
5. RTM and test-plan re-trace

That order minimizes churn and reduces the chance of reworking the same rows
multiple times.

## Recommended Next Passes

### Pass 3: Information-Item Package Uplift

Objective:

- introduce `docs/requirements/syrs.md`
- define truthful `SyRS` versus `SRS` ownership
- keep the existing `SRS` and `RTM` valid while establishing the missing
  system-level package

Expected outputs:

- `SyRS`
- updated information-item map
- updated roadmap/queue references to the new package

### Pass 4: Contradiction Ledger

Objective:

- retain one explicit ledger of naming drift, superseded doctrine, and
  package-level contradictions before broad content rewrites begin

Minimum starting entries:

- ADR filename drift such as ADR-0030 still naming `gitflow-lite`
- any requirement or RTM rows whose wording still reflects retired doctrine
- any execution-program or issue surfaces that no longer match the active
  requirement package after the local-LabVIEWCLI/provider rewrite

### Pass 5: Requirement-System Refactor

Objective:

- partition the current `540` requirement rows into the right information-item
  owners
- prune stale rows
- merge duplicates
- re-establish trustworthy traceability before further feature growth

### Pass 6: ADR And Architecture Normalization

Objective:

- treat the architecture description as the primary architecture truth
- keep ADRs as retained decision rationale where they still add value
- mark superseded ADRs explicitly
- retire or rename misleading ADR surfaces when necessary

### Pass 7: RTM And Test-Plan Re-Trace

Objective:

- realign RTM and test-plan coverage after the requirement and ADR refactors
- avoid carrying forward stale links to retired or renamed package elements

### Pass 8: Released-Skill Re-Audit

Objective:

- rerun released `repo-standards-review` after the larger uplift passes
- confirm that the refactor improved structural coherence instead of only
  moving text around

## Operating Rule

Each pass should end with:

- retained audit evidence
- one committed checkpoint
- one update to the compliance roadmap

That keeps the repo-visible control plane ahead of the text churn.
