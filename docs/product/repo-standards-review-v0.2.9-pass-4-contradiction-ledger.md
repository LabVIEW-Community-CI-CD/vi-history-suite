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

No open contradictions remain from the original pass-4 ledger. The remaining
passes are now broader normalization passes rather than fixes for one specific
live contradiction.

| ID | Area | Contradiction | Evidence | Impact | Planned Resolution |
| --- | --- | --- | --- | --- | --- |

## Resolved Or Narrowed After Pass 5 Checkpoint 1

| ID | Area | Resolution | Evidence | Remaining Risk |
| --- | --- | --- | --- | --- |
| CONTRA-001 | ADR naming | `ADR-0030` now uses a GitFlow-aligned file path, and the live architecture, RTM, wiki-coverage, and release-governance test surfaces all point at the corrected ADR path. | `docs/architecture/adr/ADR-0030-semver-decision-framework-and-gitflow-branch-ci-topology.md`; `docs/architecture/overview.md`; `docs/requirements/rtm.csv`; `docs/product/wiki-coverage-matrix.json`; `tests/unit/releaseGovernanceDocs.test.ts` | Older retained pass inventory still mentions the historical filename drift, which is correct as historical evidence. |
| CONTRA-005 | Architecture decision package | The active installed-user execution doctrine is now retained in `ADR-0038`, while `ADR-0025` and `ADR-0026` are explicitly superseded historical Docker-only baseline decisions instead of being left as accepted live doctrine. | `docs/architecture/adr/ADR-0038-host-default-local-labviewcli-bounded-expert-docker-and-explicit-compare-preflight.md`; `docs/architecture/adr/ADR-0025-transparent-extension-execution-flexibility-and-runtime-acquisition-ux.md`; `docs/architecture/adr/ADR-0026-canonical-extension-execution-request-validation.md`; `docs/architecture/overview.md`; `docs/product/extension-execution-policy.md`; `tests/unit/executionPolicyDocs.test.ts`; `docs/product/wiki-coverage-matrix.json` | Broader architecture-package cleanup still remains for later passes, but the primary installed-user execution ADR truth and its active trace surfaces are now aligned. |
| CONTRA-002 | Compare workflow | The live history panel now uses explicit compare preflight, renders the selected/base pair plus provider/runtime facts before execution, and blocks compare generation when preflight is not ready. | `src/ui/historyPanel.ts`; `src/commands/openViHistoryCommand.ts`; `src/ui/historyPanelTracker.ts`; `tests/unit/historyPanel.test.ts`; `tests/unit/openViHistoryCommand.test.ts` | Broader documentation cleanup still remains for later passes, but the visible compare interaction now matches the active control-plane direction. |
| CONTRA-004 | Requirement package doctrine | The targeted runtime-provider and compare-flow rows plus their active doc-review traces now distinguish current implemented baseline truth from the active replacement direction instead of claiming one collapsed doctrine. | `docs/requirements/srs.md` (`VHS-REQ-133`, `VHS-REQ-146`, `VHS-REQ-220`, `VHS-REQ-459..475`, `VHS-REQ-498`, `VHS-REQ-499`, `VHS-REQ-530..540`); `docs/requirements/rtm.csv`; `docs/testing/test-plan.md` (`TEST-UNIT-299`, `TEST-DOC-065`, `TEST-UNIT-300`, `TEST-DOC-067`, `TEST-UNIT-317`, `TEST-DOC-105`) | Broader requirement cleanup still remains for later passes, but this specific runtime-provider contradiction cluster is no longer internally self-contradictory and no longer leaves the active ADR package untraced. |
| CONTRA-003 | Runtime provider control plane versus implementation | Installed compare runtime selection now derives effective host-versus-Docker intent from persisted `viHistorySuite.runtimeProvider` settings, and the focused locator plus doctor proofs no longer depend on the legacy `executionMode` inputs to establish installed-user provider choice. | `src/reporting/comparisonReportAction.ts`; `src/reporting/comparisonRuntimeLocator.ts`; `src/reporting/comparisonRuntimeDoctor.ts`; `tests/unit/comparisonReportAction.test.ts`; `tests/unit/comparisonRuntimeLocator.test.ts`; `tests/unit/comparisonRuntimeDoctor.test.ts` | Broader runtime cleanup still remains for later passes, but this installed-user provider-selection contradiction is now narrowed out of the live control plane. |

## Pass 4 Conclusion

The first contradiction cluster is closed. The next refactor should build on
that closure rather than reopen another narrow ADR-only cleanup loop.

The highest-value next move is now:

1. implement the remaining Windows exact-runtime-selection refinement behind
   `VHS-REQ-532`
2. widen the requirement-row normalization beyond the targeted
   runtime-provider cluster
3. keep later missing-document and proof-surface uplift sequenced behind those
   requirement/package corrections

That order keeps the remaining live contradiction surface narrow before the
broader naming and traceability cleanup begins.
