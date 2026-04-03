# Information Item Map

## Scope

- Product or service: `vi-history-suite`
- Repository: `vi-history-suite`
- Baseline: `draft-baseline`
- Owner: sole author

## Information Items

| Item Type | Current Path | Owner | Trigger | Proving Evidence |
| --- | --- | --- | --- | --- |
| Repository entrypoint | `README.md` | sole author | repo orientation or active program meaning changes | README points to authoritative research, current state, and active queue |
| Current state | `docs/product/current-state.md` | sole author | active tranche, committed capability state, or reading order changes | current state matches development queue and research alignment |
| Product charter | `docs/product/charter.md` | sole author | mission or scope change | charter matches live repo direction |
| Problem statement | `docs/product/problem-statement.md` | sole author | problem framing changes | statement aligns with current epic |
| Research summary | `docs/research/extension-design-summary.md` | sole author | upstream research changes | design summary remains anchored to source research |
| Research implementation index | `docs/research/authoritative/research-implementation-index.json` | sole author | authoritative research, implementation status, or repo reading order changes | index matches current state and research alignment |
| Research alignment matrix | `docs/research/authoritative/research-alignment.md` | sole author | authoritative research or implementation status changes | alignment matrix matches live code and queue |
| Research infrastructure | `docs/research/authoritative/research-infrastructure.md` | sole author | research intake flow or forward-looking program modeling changes | the infrastructure doc matches the authority stack, queue, epics, and ADRs |
| Development queue | `docs/product/development-queue.json` | sole author | tranche order or status changes | queue reflects the active implementation program |
| Dashboard epic | `docs/product/epics/EPIC-0004-multi-report-developer-dashboard.md` | sole author | multi-report dashboard scope changes | epic matches the active product direction and queue |
| Dashboard ADR | `docs/architecture/adr/ADR-0007-multi-report-review-dashboard.md` | sole author | multi-report dashboard architecture changes | ADR rationale matches the product and report-subsystem direction |
| Dashboard concentration ADR | `docs/architecture/adr/ADR-0008-concentration-first-dashboard-for-high-volume-review.md` | sole author | high-volume review design changes | ADR rationale matches the dashboard concentration and drill-down direction |
| Review scenarios | `docs/product/review-scenarios.md` | sole author | human-review scenario or maturity changes | scenario registry matches the dashboard direction and harnesses |
| Decision record template | `docs/product/decision-record-template.md` | sole author | human-review decision model changes | template matches the review scenario and dashboard evidence model |
| Specification | `docs/requirements/srs.md` | sole author | capability change | requirement IDs and fit criteria are current |
| Traceability matrix | `docs/requirements/rtm.csv` | sole author | requirement or test change | every active requirement has at least one proving row |
| Test plan | `docs/testing/test-plan.md` | sole author | verification strategy change | test cases and entry/exit criteria are current |
| Architecture packet | `docs/architecture/overview.md` | sole author | design change | containers/components reflect live code |
| ADR | `docs/architecture/adr/ADR-0001-vscode-typescript-baseline.md` | sole author | architectural direction change | ADR status and rationale remain correct |
| CM plan | `docs/cm/cm-plan.md` | sole author | release/control process changes | versioning and accounting rules are current |
| Release procedure | `docs/release-procedure.md` | sole author | release automation or evidence rules change | the procedure matches the live GitLab release job |

## Notes

- Local runtime and design-gate evidence under `.cache/` is regenerated evidence,
  not the committed source of truth for repo meaning.
- Future readers should start with `README.md`, `docs/product/current-state.md`,
  and `docs/research/authoritative/research-implementation-index.json`.
