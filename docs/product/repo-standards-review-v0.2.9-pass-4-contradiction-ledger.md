# Repo-Standards-Review v0.2.9 Pass 4 Contradiction Ledger

## Purpose

Retain the first explicit contradiction ledger after the `SyRS` uplift so the
next refactor passes can work from a governed evidence list instead of
remembered cleanup themes.

This ledger records live contradiction risk on
`feature/local-labviewcli-selection-and-explicit-compare`.

It does not treat the exact released `v1.2.2` Docker-only installed baseline as
a contradiction. That baseline remains a deliberate historical truth while the
current branch carries the replacement direction.

## Open Contradictions

| ID | Area | Contradiction | Evidence | Impact | Planned Resolution |
| --- | --- | --- | --- | --- | --- |
| CONTRA-001 | ADR naming | `ADR-0030` text now governs `GitFlow`, but the retained file path still names `gitflow-lite`. | `docs/architecture/adr/ADR-0030-semver-decision-framework-and-gitflow-lite-branch-ci-topology.md`; `docs/architecture/overview.md`; `docs/requirements/rtm.csv`; `docs/product/wiki-coverage-matrix.json` | Readers and traceability surfaces still retain the retired doctrine string even though the live content was corrected. | Pass 6 ADR and architecture normalization: rename the ADR path and update all governed references together. |
| CONTRA-002 | Compare workflow | The active execution-policy and requirement package say compare no longer auto-runs after second selection, but the panel still tells users to use the commit checkboxes to generate the comparison report. | `docs/product/extension-execution-policy.md`; `docs/requirements/syrs.md`; `docs/requirements/srs.md` (`VHS-REQ-533`, `VHS-REQ-534`); `docs/testing/test-plan.md` (`TEST-UNIT-343`); `src/ui/historyPanel.ts` | Control-plane truth and the shipped panel workflow are out of sync on one of the most visible user interactions. | Resolve in the remaining `TRANCHE-016` explicit-compare implementation slice, then rerun the released skill and focused UI proof. |
| CONTRA-003 | Runtime provider control plane versus implementation | The active provider doctrine is host-default plus expert Docker through persisted `host|docker` selection, but the runtime locator still carries legacy `executionMode` values and auto-Docker behavior that can disallow host-native execution. | `docs/product/extension-execution-policy.md`; `docs/product/issues/ISSUE-0412-installed-local-labviewcli-selection-and-explicit-compare.md`; `src/reporting/comparisonRuntimeLocator.ts` | Runtime-selection behavior still reflects the older Docker-first or auto-Docker model in key branches of the implementation. | Resolve during the requirement-system and runtime-selection refactor before claiming the provider contract is fully implemented. |
| CONTRA-004 | Requirement package doctrine | The new `SyRS` and execution-policy package define host-default installed execution, but older `SRS` and `RTM` rows still retain Windows-container-preferred x64 doctrine as implemented truth. | `docs/requirements/syrs.md`; `docs/product/extension-execution-policy.md`; `docs/requirements/srs.md` (`VHS-REQ-146`, `VHS-REQ-220`, `VHS-REQ-239`, `VHS-REQ-240`, `VHS-REQ-242`, `VHS-REQ-285`); `docs/requirements/rtm.csv` | Requirement-level traceability still points reviewers and future sessions toward a partially superseded runtime doctrine. | Pass 5 requirement-system refactor and later RTM re-trace: partition or retire conflicting rows instead of patching them ad hoc. |

## Pass 4 Conclusion

The next refactor should not jump straight into broad ADR cleanup or wide RTM
editing.

The highest-value next move is:

1. requirement-system refactor for the provider doctrine
2. explicit-compare implementation and proof
3. ADR rename and architecture-reference cleanup
4. RTM and test-plan re-trace after those corrections land

That order removes the contradictions that affect live product truth before the
pure naming and traceability cleanup.
