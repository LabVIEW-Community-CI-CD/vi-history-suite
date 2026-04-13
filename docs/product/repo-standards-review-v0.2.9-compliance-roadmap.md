# Repo-Standards-Review v0.2.9 Compliance Roadmap

## Purpose

Retain the multi-pass refactor plan for bringing `vi-history-suite` into
released `repo-standards-review` `v0.2.9` compliance without collapsing the
work into one unsafe rewrite.

This roadmap exists so the compliance refactor stays visible in the repo
instead of living in chat memory.

## Current Position

- released assurance baseline: `repo-standards-review` `v0.2.9`
- first proving target: `feature/local-labviewcli-selection-and-explicit-compare`
- pass 1 status: complete
- pass 1 outcome: released-skill CM gate now passes after the GitFlow branch
  governance rewrite on this branch
- pass 3 status: checkpoint 1 in progress
- pass 3 checkpoint 1 target: introduce `SyRS` and make `SyRS` versus `SRS`
  ownership explicit before widening into requirement partitioning

## Pass Order

1. Pass 1: Branch-governance baseline
   - objective: make the repo compliant with the released skill's GitFlow CM
     doctrine before widening the refactor
   - status: complete on this branch
   - retained proof: released `v0.2.9` audit now returns `cm: PASS`

2. Pass 2: Baseline gap inventory and contradiction map
   - objective: run the released skill in repeated audit and evidence-pack
     passes against this branch and `develop`, then classify findings by
     standards area instead of editing ad hoc
   - output:
     - missing-information-item inventory
     - contradiction ledger
     - obsolete-artifact ledger
     - uplift backlog grouped by `REQ`, `ARCH`, `CM`, `DOC`, and `TEST`
   - retained inventory packet:
     [repo-standards-review-v0.2.9-pass-2-gap-inventory.md](./repo-standards-review-v0.2.9-pass-2-gap-inventory.md)

3. Pass 3: Information-item package uplift
   - objective: add the missing governed package expected by the released
     skill, including `SyRS`, aligned `SRS`, `RTM`, architecture description,
     release-control package, and information-item map updates
   - status: checkpoint 1 complete on this branch
   - checkpoint 1 scope:
     - add `docs/requirements/syrs.md`
     - update `SRS` to declare its parent `SyRS`
     - update the information-item map to split system versus software
       ownership explicitly
   - focus:
     - separate system-level and software-level scope truthfully
     - stop relying on partial package coverage
     - make the repo apply the same standards discipline it is using for its
       external contract

4. Pass 4: Contradiction ledger
   - objective: retain one explicit ledger of naming drift, superseded
     doctrine, and package-level contradictions before broad content rewrites
     begin
   - status: complete on this branch
   - retained ledger:
     [repo-standards-review-v0.2.9-pass-4-contradiction-ledger.md](./repo-standards-review-v0.2.9-pass-4-contradiction-ledger.md)

5. Pass 5: Requirement-system refactor
   - objective: normalize the large requirement corpus instead of patching it
     piecemeal
   - focus:
     - split `SyRS` versus `SRS` ownership cleanly
     - merge duplicates
     - retire stale or contradictory requirement rows
     - restore truthful `REQ -> TEST -> CODE/DOC` traceability

6. Pass 6: Architecture and ADR refactor
   - objective: align the large ADR package to the released skill's current
     architecture expectations
   - focus:
     - keep the architecture description as primary truth
     - keep ADRs as retained decision rationale where they still add value
     - mark superseded or contradictory ADRs explicitly instead of leaving
       them as live doctrine

7. Pass 7: Missing-document and proof-surface uplift
   - objective: add or repair the remaining documentation and proof surfaces
     needed for compliance
   - likely scope:
     - CM and release-control gaps outside pass 1
     - test-plan gaps
     - release and publication evidence
     - any missing information items exposed by pass 2

8. Pass 8: Release-candidate compliance closeout
   - objective: rerun the released skill until the target branch reaches a
     clean external audit result across the governed gates
   - closeout rule:
     - no external compliance claim is made until the released skill passes on
       the exact target branch under review

## Operating Rules

- Every pass uses the released skill first, not unreleased local doctrine.
- Every pass ends with retained audit evidence plus a checkpoint commit.
- Contradictions found during later passes are treated as first-class backlog,
  not as incidental cleanup.
- Broad package refactors do not start until the previous pass has a retained
  audit result.

## Immediate Next Move

Start pass 5 on the same branch:

- use the contradiction ledger to target the runtime-provider rows that no
  longer fit the host-default doctrine
- keep requirement partitioning narrow and evidence-led instead of editing the
  full `540`-row package at once
- leave ADR renames and RTM-wide cleanup for the later dedicated passes
