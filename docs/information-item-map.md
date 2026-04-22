# Information Item Map

## Scope

- Product or service: `vi-history-suite`
- Repository: `vi-history-suite`
- Baseline: `draft-baseline`
- Owner: sole author

## Authority And Metadata Expectations

- Dedicated short-form information-for-users docs keep `Applies to:`,
  `Last reviewed:`, `Primary audience:`, `Topic type:`, `Primary entry route:`,
  and `See also:` near the top.
- Those dedicated support docs also keep version applicability and review
  metadata explicit.
- Governance and planning docs keep explicit scope and neighboring authority
  surfaces through `Related Surfaces` or equivalent control sections.
- This map keeps owner, trigger, and proving-evidence fields explicit.
- The table below is the retained item index for governed artifacts and durable
  evidence routes, not only a file inventory. It uses owner, trigger, and
  proving-evidence fields to keep responsibility and validation discoverable.
- The map distinguishes product authority surfaces and control authority surfaces.
- The package is first-class information-for-users work.
- candidate provenance is retained when a feature branch or release-ready
  checkpoint changes the package truth.
- Durable evidence routes for public release and publication are retained in
  `docs/product/public-release-candidate.md` plus the public source/wiki
  publication ledgers.
- The information-for-users package is now treated as first-class
  information-for-users work rather than as a side note in the product docs.
- This map is also the bridge between topic architecture, topic-title rules,
  minimum structure expectations, product authority surfaces, control authority
  surfaces, primary and secondary surfaces, simultaneous-use routes, fallback
  paths, and section-to-topic-role mapping.
- The support-lifecycle rule for this package is explicit: temporary answers are incorporated or retired when they stabilize.
- Triggers now include quick-reference-boundary change, compact quick-reference
  scope, specialized-support surfaces, API-doc depth, chatbot or VRS behavior,
  release-proof change, tailored `26514` claim summary, and candidate
  provenance such as candidate tag, source branch, and source whenever those
  meanings affect a governed surface.

## Information Items

| Item Type | Current Path | Owner | Trigger | Proving Evidence |
| --- | --- | --- | --- | --- |
| Repository entrypoint | `README.md` | sole author | repo orientation or active program meaning changes | README points to authoritative research, current state, and active queue |
| Changelog | `CHANGELOG.md` | sole author | package baseline, retained release history, or next exact-version line changes | future sessions can recover the active development version and retained release history without reconstructing chat context |
| Current state | `docs/product/current-state.md` | sole author | active tranche, landed ship state, committed capability state, or reading order changes | current state matches development queue, closed ship control, and research alignment |
| Software factory orchestrator contract | `scripts/runSoftwareFactoryOrchestrator.js` | sole author | production-boundary governance, software-factory phase contract, or frozen recovery-case classification changes | future sessions can assess authority/staging/production/recovery boundaries and the current blocked production recovery state through one repo-owned receipt surface instead of reconstructing publication state from chat memory |
| Software factory assessment receipt | `.cache/software-factory-orchestrator/latest/software-factory-state.json` | sole author | repo-owned software-factory assessment facts change | future sessions can recover the active assess-only factory contract, the frozen `v1.3.6` recovery target, and the current production-mutation boundary without rerunning discovery from scratch |
| Windows host `CreateComparisonReport` proof packet | `docs/product/benchmark-packets/HARNESS-VHS-001-windows-host-create-comparison-proof-2026-04-14.md` | sole author | canonical Windows host report-admission truth changes | the tracked packet retains the exact x64/x86 host-bundle blocker receipts and points to the raw governed proof roots without relying on ignored `.cache` state alone |
| Machine-readable Windows host `CreateComparisonReport` proof packet | `docs/product/benchmark-packets/HARNESS-VHS-001-windows-host-create-comparison-proof-2026-04-14.json` | sole author | canonical Windows host report-admission truth changes | future sessions can recover the exact x64/x86 blocker fields without scraping Markdown or trusting chat memory |
| Product charter | `docs/product/charter.md` | sole author | mission or scope change | charter matches live repo direction |
| Problem statement | `docs/product/problem-statement.md` | sole author | problem framing changes | statement aligns with current epic |
| Research summary | `docs/research/extension-design-summary.md` | sole author | upstream research changes | design summary remains anchored to source research |
| Research implementation index | `docs/research/authoritative/research-implementation-index.json` | sole author | authoritative research, implementation status, or repo reading order changes | index matches current state and research alignment without lagging committed capability surfaces |
| Research alignment matrix | `docs/research/authoritative/research-alignment.md` | sole author | authoritative research or implementation status changes | alignment matrix matches live code and queue |
| Research infrastructure | `docs/research/authoritative/research-infrastructure.md` | sole author | research intake flow or forward-looking program modeling changes | the infrastructure doc matches the authority stack, queue, epics, and ADRs |
| Ship target | `docs/product/SHIP-0001-releasable-vi-history-suite.md` | sole author | release target, stop rule, landed-ship state, or definition of done changes | ship target matches the landed release objective and closed ship record |
| Release readiness matrix | `docs/product/release-readiness-matrix.json` | sole author | ship criterion state, evidence, blocker, or next action changes | readiness matrix matches the closed ship record and blocker ledger |
| Blocker ledger | `docs/product/blocker-ledger.json` | sole author | ship blocker state or resolution path changes | blocker ledger matches the release readiness matrix and closed ship record |
| Windows x64 private-release packet | `docs/product/private-release-windows-x64-v1.3.0.md` | sole author | Windows-only private-release scope, retained proof roots, package identity, or next branch sequence changes | the packet binds the Windows x64 support claim, package fingerprint, and retained host/container proof roots without relying on ignored `.cache` paths alone |
| Machine-readable Windows x64 private-release packet | `docs/product/private-release-windows-x64-v1.3.0.json` | sole author | Windows-only private-release scope, retained proof roots, package identity, or next branch sequence changes | future sessions and automation can recover the Windows x64 packet facts without scraping Markdown or reconstructing chat state |
| Windows private-release runner lane | `docs/product/windows-private-release-runner-lane.md` | sole author | tagged Windows runner identity, acceptance CLI, retained artifact contract, or manual registration pack changes | the runner-lane contract keeps the Windows private-release CI surface recoverable without relying on untracked machine memory or leaked runner tokens |
| Linux assurance runner lane | `docs/product/linux-assurance-runner-lane.md` | sole author | Linux assurance runner identity, external registry auth contract, blocking/advisory assurance-lane ownership, or retained artifact contract changes | the separate Linux assurance lane keeps external standards validation recoverable and distinct from Windows private-release proof without relying on shared-runner image semantics or chat memory |
| Governed runner host asset pack | `scripts/gitlab-runner/` | sole author | Windows apply/bootstrap/doctor/assert scripts, Linux apply/helper/doctor/assert scripts, Linux service unit, cross-lane runner-doctor/assert wrappers, startup-receipt contract, or host-apply/host-doctor/host-assert contract changes | the admitted runner startup, startup-receipt, host-apply, doctor, and live drift-assert surfaces remain versioned in the repo and recoverable after host restart, manual host edits, or rebuild without relying on untracked machine files |
| Debt retirement contract | `docs/product/debt-retirement-contract.md` | sole author | the no-silent-debt rule, disposition model, or required debt fields change | future sessions can discover the debt-governance contract without relying on chat memory |
| Debt taxonomy | `docs/product/debt-taxonomy.md` | sole author | allowed debt classes, statuses, or severity/contamination semantics change | future sessions classify debt consistently across technical, documentation, benchmark, and control-plane surfaces |
| Debt ledger | `docs/product/debt-ledger.md` | sole author | open, retired, or accepted debt items change | human readers can discover the current governed debt picture without parsing JSON |
| Machine-readable debt ledger | `docs/product/debt-ledger.json` | sole author | debt ownership, status, exit criteria, or retirement commits change | current, past, and future debt items remain machine-checkable and cannot stay implicit |
| Post-release sustainment rules | `docs/product/post-release-sustainment-rules.md` | sole author | sustained release cadence, benchmark refresh triggers, operator-surface upkeep rules, or reopen criteria change | future sessions can discover the active sustainment contract without reconstructing it from queue summaries or benchmark notes |
| Machine-readable post-release sustainment rules | `docs/product/post-release-sustainment-rules.json` | sole author | sustainment cadence, accepted benchmark boundaries, refresh triggers, or required upkeep steps change | the active sustainment operating model remains machine-checkable and aligned to `TRANCHE-012` / `ISSUE-0409` / `PROGRAM-0004` |
| Hosted CI governance | `docs/product/hosted-ci-governance.md` | sole author | hosted branch-protection semantics, workflow ownership, or lane admission changes | future sessions can distinguish GitLab authority admission, GitHub required checks, and characterization-only experiment workflows without inferring policy from raw YAML or live settings |
| Machine-readable hosted CI governance | `docs/product/hosted-ci-governance.json` | sole author | hosted branch-protection semantics, workflow ownership, lane admission, or active opening-decision facts change | the hosted automation model remains machine-checkable and aligned to sustainment rules, release procedure, and workflow files |
| Extension execution policy | `docs/product/extension-execution-policy.md` | sole author | installed compare runtime dependency, Docker-engine selection, canonical execution-request validation, acquisition UX, or public/internal execution-doc audience split changes | future sessions and users can discover the intended Docker-only x64 compare behavior, current-engine Windows-versus-Linux image selection, container-capability hard stops, and image-pull UX without inferring product intent from source or chat |
| Information-for-users plan | `docs/information-for-users/plan.md` | sole author | the bounded user-information package, support-surface claim boundary, validation split, or tailored `26514` claim summary changes | future sessions can recover the selected `26514`-style support scope and the repo-workbench versus compliance-workbench split without reconstructing it from chat memory |
| Information-for-users audience and task model | `docs/information-for-users/audience-and-task-model.md` | sole author | user families, task patterns, or route responsibilities change | future sessions can see which audiences and tasks the package is actually optimized for instead of inferring that from ad hoc doc wording |
| Information For Users Navigation And Search | `docs/information-for-users/navigation-and-search.md` | sole author | route hierarchy, metadata minimum, search posture, durable evidence routes, or top-level route changes | future sessions can recover the top-level route, retained item index, durable evidence route, and navigation architecture without reconstructing navigation rules from chat memory |
| Information For Users Delivery Profile | `docs/information-for-users/delivery-profile.md` | sole author | audience-task delivery decisions, simultaneous-use routes, fallback paths, or route applicability change | future sessions can tell which surface owns which user task, what the primary and secondary surfaces are, and what fallback path still remains truthful |
| Information For Users Style Guide | `docs/information-for-users/style-guide.md` | sole author | wording discipline, metadata rules, glossary discipline, accessibility baseline, minimum structure expectations, or review rules change | future sessions can keep user-information docs consistent with the exact released boundary, active branch direction, text-first posture, and support-lifecycle expectations |
| Information-for-users glossary | `docs/information-for-users/glossary.md` | sole author | key user-facing repo terms, user-language definitions, or active runtime-provider terminology changes | future sessions and readers can interpret branch and release terms consistently without inferring meaning from scattered product docs |
| Information-for-users FAQ | `docs/information-for-users/faq.md` | sole author | recurring support questions, route guidance, temporary answers, or released-user baseline boundaries change | future sessions and readers can recover the compact first-response support posture without searching across broader control-plane docs |
| Information-for-users command reference | `docs/information-for-users/command-reference.md` | sole author | stable command routes, docs-workbench commands, quick-reference-boundary change, compact quick-reference scope, or released assurance commands change | future sessions and readers can find the compact governed command surface without reconstructing it from README, INSTALL, and control-plane docs |
| External user guide | `docs/user-guide.md` | sole author | released install route, source-evaluation route, or active branch route split changes | future sessions and external readers can recover the starter external route pack without inferring it from the internal information-for-users package |
| External FAQ | `docs/faq.md` | sole author | repeated external route questions, fallback guidance, or released-versus-branch boundary language changes | future sessions and external readers can recover the compact external support posture without reading deeper control docs first |
| External glossary | `docs/glossary.md` | sole author | external route vocabulary, release language, or branch-language definitions change | future sessions and external readers can interpret release and branch terms consistently in the external pack |
| External quick reference | `docs/quick-reference.md` | sole author | starter routes, stable checks, or release/control pointers change | future sessions and external readers can find the bounded external route and check surface without searching the deeper command-reference package |
| Public GitHub source authority map | `docs/product/public-github-source-authority-map.md` | sole author | the public source repo boundary, authority stack, or one-way promotion rules change | future sessions can publish the public GitHub source repo from governed authority without mirroring the internal control plane blindly |
| Public GitHub source publication ledger | `docs/product/public-github-source-publication-ledger.md` | sole author | the public source repo is actually published or publication metadata changes | the authority repo can tell which public GitHub source commit is live without treating source publication as implied by internal normalization |
| Machine-readable public GitHub source publication ledger | `docs/product/public-github-source-publication-ledger.json` | sole author | the public source repo publication state or published commit changes | future automation can resolve the current public GitHub source publication state without scraping Markdown |
| VS Code Marketplace publication ledger | `docs/product/vscode-marketplace-publication-ledger.md` | sole author | the Marketplace listing is actually published or publication metadata changes | the authority repo can tell which Marketplace version is live and which publisher/item identity owns it without treating Marketplace publication as implied by a GitHub or GitLab release |
| Machine-readable VS Code Marketplace publication ledger | `docs/product/vscode-marketplace-publication-ledger.json` | sole author | Marketplace publication state, item identity, homepage, or published version changes | future automation can resolve the current Marketplace publication state without scraping Markdown |
| Wiki authority map | `docs/product/wiki-authority-map.md` | sole author | the governed documentation stack or wiki-generation preconditions change | future wiki work can be derived from docs without falling back to source or chat memory |
| Documentation coherence ledger | `docs/product/documentation-coherence-ledger.md` | sole author | documentation-package contradictions are resolved or a fresh coherence pass is completed | the latest docs gate and standards-review pass are reflected with resolved contradictions and residual risks |
| Wiki seed plan | `docs/product/wiki-seed-plan.md` | sole author | wiki page order, source authority, or drafting rules change | future wiki pages can be drafted incrementally from governed docs without falling back to source |
| Wiki publication ledger | `docs/product/wiki-publication-ledger.md` | sole author | a wiki page is actually published or publication metadata changes | the repo can tell which wiki pages are already published and which docs authorized them |
| Machine-readable wiki publication ledger | `docs/product/wiki-publication-ledger.json` | sole author | a published wiki page, page id, next-page target, or publication metadata changes | future automation and packaged-doc generation can resolve the published wiki set without scraping Markdown tables |
| Wiki coverage matrix | `docs/product/wiki-coverage-matrix.json` | sole author | the in-scope requirements-and-standards wiki surface changes or a new authority doc/ADR enters scope | the wiki can only be considered finished when every in-scope row remains complete/published, every ADR file is listed, and the publication ledger retains no next-page target |
| Bundled user documentation pack | `resources/bundled-docs/manifest.json` | sole author | the published wiki set changes or the packaged-doc navigation surface changes | the installed extension can open version-matched packaged docs without repo access |
| Documentation package workbench | `docs/documentation-workbench.md` | sole author | docs-authoring workflow, wiki-workbench commands, published image references, or docs-gate commands change | future requirements/wiki iteration can start from one published workbench, one governed wiki-workbench CLI, and one retained publication-prep flow instead of ad hoc host setup |
| Program repo jump surface | `docs/product/program-repo-jump.md` | sole author | the local repo constellation, public/internal reader surfaces, public source facade, private experiment mirror, or jump commands change | future sessions can jump between `vi-history-suite`, `vi-history-suite.public`, `vi-history-suite.github.wiki`, `vi-history-suite-source-experiments`, `vi-history-suite.wiki`, and `repo-standards-review` from one governed map |
| Repo-standards-review compliance roadmap | `docs/product/repo-standards-review-v0.2.9-compliance-roadmap.md` | sole author | an external released-skill pass closes, reopens, or reorders a compliance refactor pass | future sessions can resume the standards uplift from repo truth instead of reconstructing the pass order from chat memory |
| Repo-standards-review contradiction ledger | `docs/product/repo-standards-review-v0.2.9-pass-4-contradiction-ledger.md` | sole author | a released-skill-backed contradiction is discovered, retired, or reclassified | future sessions can see which contradictions still drive the next uplift passes and which historical baselines are intentionally retained |
| Repo-standards-review closeout packet | `docs/product/repo-standards-review-v0.2.9-pass-8-closeout.md` | sole author | a released-skill compliance pass reaches or loses clean closeout on the active branch | future sessions can distinguish completed compliance closeout from remaining feature or publication work without reconstructing audit status from chat memory |
| ISSUE-0412 promotion and publication handoff | `docs/product/issue-0412-promotion-and-publication-handoff.md` | sole author | the retained branch-transition context after `TRANCHE-016` compliance closeout changes | future sessions can distinguish historical branch-transition facts from the live public-acceptance gate |
| Runtime-provider public-acceptance gate | `docs/product/runtime-provider-public-acceptance-gate.md` | sole author | the host-default installed-user publication boundary or public acceptance meaning changes | future sessions can recover the latest gate state for the published host-default contract without reopening the historical Docker-only public closeout |
| Machine-readable runtime-provider public-acceptance gate | `docs/product/runtime-provider-public-acceptance-gate.json` | sole author | the host-default installed-user publication boundary or public acceptance meaning changes | automation and future sessions can recover the latest gate state, historical closeout reference, and admission evidence without scraping Markdown |
| Development queue | `docs/product/development-queue.json` | sole author | tranche order or status changes | queue reflects the active implementation program |
| Dashboard epic | `docs/product/epics/EPIC-0004-multi-report-developer-dashboard.md` | sole author | multi-report dashboard scope changes | epic matches the active product direction and queue |
| Dashboard ADR | `docs/architecture/adr/ADR-0007-multi-report-review-dashboard.md` | sole author | multi-report dashboard architecture changes | ADR rationale matches the product and report-subsystem direction |
| Dashboard concentration ADR | `docs/architecture/adr/ADR-0008-concentration-first-dashboard-for-high-volume-review.md` | sole author | high-volume review design changes | ADR rationale matches the dashboard concentration and drill-down direction |
| Review scenarios | `docs/product/review-scenarios.md` | sole author | human-review scenario or maturity changes | scenario registry matches the dashboard direction and harnesses |
| Decision record template | `docs/product/decision-record-template.md` | sole author | human-review decision model changes | template matches the review scenario and dashboard evidence model |
| System Specification | `docs/requirements/syrs.md` | sole author | system boundary, runtime-provider doctrine, release-control model, or information-item ownership changes | system-level intent and fit criteria are current |
| Software Specification | `docs/requirements/srs.md` | sole author | software capability, implementation-level fit criterion, or software boundary change | software requirement IDs and fit criteria are current |
| Traceability matrix | `docs/requirements/rtm.csv` | sole author | requirement or test change | every active requirement has at least one proving row |
| Critical-path traceability matrix | `docs/requirements/rtm-release-gate.csv` | sole author | published release-gate parser budget changes or critical-path requirement admission changes | at least one critical Req -> Test -> Code row remains parseable by the published assurance workbench |
| Test plan | `docs/testing/test-plan.md` | sole author | verification strategy change | test cases and entry/exit criteria are current, and every governed RTM verification id is enumerated in the plan |
| Architecture packet | `docs/architecture/overview.md` | sole author | design change | containers/components reflect live code |
| ADR | `docs/architecture/adr/ADR-0001-vscode-typescript-baseline.md` | sole author | architectural direction change | ADR status and rationale remain correct |
| CM plan | `docs/cm/cm-plan.md` | sole author | release/control process changes | versioning and accounting rules are current |
| Release procedure | `docs/release-procedure.md` | sole author | release automation or evidence rules change | the procedure matches the live GitLab release job |

## Notes

- Local runtime and design-gate evidence under `.cache/` is regenerated evidence,
  not the committed source of truth for repo meaning.
- Future readers should start with `README.md`, `docs/product/current-state.md`,
  `docs/requirements/syrs.md`, `docs/product/debt-retirement-contract.md`, and
  `docs/research/authoritative/research-implementation-index.json`.
