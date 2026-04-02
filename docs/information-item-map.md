# Information Item Map

## Scope

- Product or service: `vi-history-suite`
- Repository: `vi-history-suite`
- Baseline: `draft-baseline`
- Owner: sole author

## Information Items

| Item Type | Current Path | Owner | Trigger | Proving Evidence |
| --- | --- | --- | --- | --- |
| Product charter | `docs/product/charter.md` | sole author | mission or scope change | charter matches live repo direction |
| Problem statement | `docs/product/problem-statement.md` | sole author | problem framing changes | statement aligns with current epic |
| Research summary | `docs/research/extension-design-summary.md` | sole author | upstream research changes | design summary remains anchored to source research |
| Specification | `docs/requirements/srs.md` | sole author | capability change | requirement IDs and fit criteria are current |
| Traceability matrix | `docs/requirements/rtm.csv` | sole author | requirement or test change | every active requirement has at least one proving row |
| Test plan | `docs/testing/test-plan.md` | sole author | verification strategy change | test cases and entry/exit criteria are current |
| Architecture packet | `docs/architecture/overview.md` | sole author | design change | containers/components reflect live code |
| ADR | `docs/architecture/adr/ADR-0001-vscode-typescript-baseline.md` | sole author | architectural direction change | ADR status and rationale remain correct |
| CM plan | `docs/cm/cm-plan.md` | sole author | release/control process changes | versioning and accounting rules are current |
| Release procedure | `docs/release-procedure.md` | sole author | release automation or evidence rules change | the procedure matches the live GitLab release job |

## Notes

- This map is intentionally small for the first baseline.
- Add release and operational items when packaging and publishing become active
  work.
