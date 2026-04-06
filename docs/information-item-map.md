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
| Current state | `docs/product/current-state.md` | sole author | active tranche, landed ship state, committed capability state, or reading order changes | current state matches development queue, closed ship control, and research alignment |
| Product charter | `docs/product/charter.md` | sole author | mission or scope change | charter matches live repo direction |
| Problem statement | `docs/product/problem-statement.md` | sole author | problem framing changes | statement aligns with current epic |
| Research summary | `docs/research/extension-design-summary.md` | sole author | upstream research changes | design summary remains anchored to source research |
| Research implementation index | `docs/research/authoritative/research-implementation-index.json` | sole author | authoritative research, implementation status, or repo reading order changes | index matches current state and research alignment without lagging committed capability surfaces |
| Research alignment matrix | `docs/research/authoritative/research-alignment.md` | sole author | authoritative research or implementation status changes | alignment matrix matches live code and queue |
| Research infrastructure | `docs/research/authoritative/research-infrastructure.md` | sole author | research intake flow or forward-looking program modeling changes | the infrastructure doc matches the authority stack, queue, epics, and ADRs |
| Ship target | `docs/product/SHIP-0001-releasable-vi-history-suite.md` | sole author | release target, stop rule, landed-ship state, or definition of done changes | ship target matches the landed release objective and closed ship record |
| Release readiness matrix | `docs/product/release-readiness-matrix.json` | sole author | ship criterion state, evidence, blocker, or next action changes | readiness matrix matches the closed ship record and blocker ledger |
| Blocker ledger | `docs/product/blocker-ledger.json` | sole author | ship blocker state or resolution path changes | blocker ledger matches the release readiness matrix and closed ship record |
| Debt retirement contract | `docs/product/debt-retirement-contract.md` | sole author | the no-silent-debt rule, disposition model, or required debt fields change | future sessions can discover the debt-governance contract without relying on chat memory |
| Debt taxonomy | `docs/product/debt-taxonomy.md` | sole author | allowed debt classes, statuses, or severity/contamination semantics change | future sessions classify debt consistently across technical, documentation, benchmark, and control-plane surfaces |
| Debt ledger | `docs/product/debt-ledger.md` | sole author | open, retired, or accepted debt items change | human readers can discover the current governed debt picture without parsing JSON |
| Machine-readable debt ledger | `docs/product/debt-ledger.json` | sole author | debt ownership, status, exit criteria, or retirement commits change | current, past, and future debt items remain machine-checkable and cannot stay implicit |
| Post-release sustainment rules | `docs/product/post-release-sustainment-rules.md` | sole author | sustained release cadence, benchmark refresh triggers, operator-surface upkeep rules, or reopen criteria change | future sessions can discover the active sustainment contract without reconstructing it from queue summaries or benchmark notes |
| Machine-readable post-release sustainment rules | `docs/product/post-release-sustainment-rules.json` | sole author | sustainment cadence, accepted benchmark boundaries, refresh triggers, or required upkeep steps change | the active sustainment operating model remains machine-checkable and aligned to `TRANCHE-012` / `ISSUE-0409` / `PROGRAM-0004` |
| Extension execution policy | `docs/product/extension-execution-policy.md` | sole author | user-facing host-vs-Docker execution rules, canonical execution-request validation, conflict hard stops, acquisition UX, or execution-mode contract changes | future sessions and users can discover the intended `auto` / `host-only` / `docker-only` behavior, Windows container-capability hard stops, selected `LabVIEW.ini` / port truth, and Windows image-pull UX without inferring product intent from source or chat |
| Wiki authority map | `docs/product/wiki-authority-map.md` | sole author | the governed documentation stack or wiki-generation preconditions change | future wiki work can be derived from docs without falling back to source or chat memory |
| Documentation coherence ledger | `docs/product/documentation-coherence-ledger.md` | sole author | documentation-package contradictions are resolved or a fresh coherence pass is completed | the latest docs gate and standards-review pass are reflected with resolved contradictions and residual risks |
| Wiki seed plan | `docs/product/wiki-seed-plan.md` | sole author | wiki page order, source authority, or drafting rules change | future wiki pages can be drafted incrementally from governed docs without falling back to source |
| Wiki publication ledger | `docs/product/wiki-publication-ledger.md` | sole author | a wiki page is actually published or publication metadata changes | the repo can tell which wiki pages are already published and which docs authorized them |
| Machine-readable wiki publication ledger | `docs/product/wiki-publication-ledger.json` | sole author | a published wiki page, page id, next-page target, or publication metadata changes | future automation and packaged-doc generation can resolve the published wiki set without scraping Markdown tables |
| Wiki coverage matrix | `docs/product/wiki-coverage-matrix.json` | sole author | the in-scope requirements-and-standards wiki surface changes or a new authority doc/ADR enters scope | the wiki can only be considered finished when every in-scope row remains complete/published, every ADR file is listed, and the publication ledger retains no next-page target |
| Bundled user documentation pack | `resources/bundled-docs/manifest.json` | sole author | the published wiki set changes or the packaged-doc navigation surface changes | the installed extension can open version-matched packaged docs without repo access |
| Documentation package workbench | `docs/documentation-workbench.md` | sole author | docs-authoring workflow, wiki-workbench commands, published image references, or docs-gate commands change | future requirements/wiki iteration can start from one published workbench, one governed wiki-workbench CLI, and one retained publication-prep flow instead of ad hoc host setup |
| Program repo jump surface | `docs/product/program-repo-jump.md` | sole author | the local repo constellation, private experiment mirror, companion skill entrypoints, or jump commands change | future sessions can jump between `vi-history-suite`, `vi-history-suite-source-experiments`, `vi-history-suite.wiki`, and `repo-standards-review` from one governed map |
| Development queue | `docs/product/development-queue.json` | sole author | tranche order or status changes | queue reflects the active implementation program |
| Dashboard epic | `docs/product/epics/EPIC-0004-multi-report-developer-dashboard.md` | sole author | multi-report dashboard scope changes | epic matches the active product direction and queue |
| Dashboard ADR | `docs/architecture/adr/ADR-0007-multi-report-review-dashboard.md` | sole author | multi-report dashboard architecture changes | ADR rationale matches the product and report-subsystem direction |
| Dashboard concentration ADR | `docs/architecture/adr/ADR-0008-concentration-first-dashboard-for-high-volume-review.md` | sole author | high-volume review design changes | ADR rationale matches the dashboard concentration and drill-down direction |
| Review scenarios | `docs/product/review-scenarios.md` | sole author | human-review scenario or maturity changes | scenario registry matches the dashboard direction and harnesses |
| Decision record template | `docs/product/decision-record-template.md` | sole author | human-review decision model changes | template matches the review scenario and dashboard evidence model |
| Specification | `docs/requirements/srs.md` | sole author | capability change | requirement IDs and fit criteria are current |
| Traceability matrix | `docs/requirements/rtm.csv` | sole author | requirement or test change | every active requirement has at least one proving row |
| Test plan | `docs/testing/test-plan.md` | sole author | verification strategy change | test cases and entry/exit criteria are current, and every governed RTM verification id is enumerated in the plan |
| Architecture packet | `docs/architecture/overview.md` | sole author | design change | containers/components reflect live code |
| ADR | `docs/architecture/adr/ADR-0001-vscode-typescript-baseline.md` | sole author | architectural direction change | ADR status and rationale remain correct |
| CM plan | `docs/cm/cm-plan.md` | sole author | release/control process changes | versioning and accounting rules are current |
| Release procedure | `docs/release-procedure.md` | sole author | release automation or evidence rules change | the procedure matches the live GitLab release job |

## Notes

- Local runtime and design-gate evidence under `.cache/` is regenerated evidence,
  not the committed source of truth for repo meaning.
- Future readers should start with `README.md`, `docs/product/current-state.md`,
  `docs/product/debt-retirement-contract.md`, and
  `docs/research/authoritative/research-implementation-index.json`.
