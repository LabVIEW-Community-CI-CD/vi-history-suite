# vi-history-suite

`vi-history-suite` is a governed TypeScript-first Visual Studio Code extension
for developer-facing review of LabVIEW VI history in Git repositories.

It is no longer just an initial command-and-panel baseline. The repo now
contains:

- content-detected VI eligibility and history review
- governed comparison-report planning, storage, and runtime execution
- pair-archived comparison-report retention by commit pair
- concentrated multi-report dashboard packets and extension dashboard action
- governed review-scenario registry and separate human decision-record artifacts
- deterministic in-IDE host-review submission with canonical-machine binding
- canonical real-history harnesses and smoke lanes
- a private GitHub Linux benchmark lane, mirrored into the private GitHub experiment repo, that defaults hosted runs to the shallower canonical harness while the canonical Windows host owns the deep `lv_icon.vi` benchmark
- a canonical-host in-IDE benchmark-status surface so Linux benchmark progress
  and retained outcome stay visible inside VS Code
- a governed Linux benchmark liveness contract: stalled pair runtime execution
  now times out deterministically, retains per-pair failure receipts, emits
  heartbeat progress while runtime execution is active, and writes terminal
  partial summaries instead of hanging indefinitely, while deep-host results
  remain characterization-only until the Linux lane completes the full
  benchmark window without late runtime failure
- retained design-gate guidance for the next development tranche

## Start Here

If you are new to the repo, read these in order:

1. [Current State](./docs/product/current-state.md)
2. [Research Alignment Matrix](./docs/research/authoritative/research-alignment.md)
3. [Development Queue](./docs/product/development-queue.json)
4. [Architecture Overview](./docs/architecture/overview.md)
5. [Software Requirements Specification](./docs/requirements/srs.md)
6. [SHIP-0001: Releasable VI History Suite](./docs/product/SHIP-0001-releasable-vi-history-suite.md)
7. [Release Readiness Matrix](./docs/product/release-readiness-matrix.json)
8. [Wiki Authority Map](./docs/product/wiki-authority-map.md)
9. [Documentation Coherence Ledger](./docs/product/documentation-coherence-ledger.md)
10. [Wiki Seed Plan](./docs/product/wiki-seed-plan.md)
11. [Wiki Publication Ledger](./docs/product/wiki-publication-ledger.md)
12. [Wiki Publication Ledger JSON](./docs/product/wiki-publication-ledger.json)
13. [Wiki Coverage Matrix](./docs/product/wiki-coverage-matrix.md)
14. [Wiki Coverage Matrix JSON](./docs/product/wiki-coverage-matrix.json)
15. [Debt Retirement Contract](./docs/product/debt-retirement-contract.md)
16. [Debt Taxonomy](./docs/product/debt-taxonomy.md)
17. [Debt Ledger](./docs/product/debt-ledger.md)
18. [Debt Ledger JSON](./docs/product/debt-ledger.json)
19. [Post-Release Sustainment Rules](./docs/product/post-release-sustainment-rules.md)
20. [Post-Release Sustainment Rules JSON](./docs/product/post-release-sustainment-rules.json)
21. [Extension Execution Policy](./docs/product/extension-execution-policy.md)
22. [Documentation Package Workbench](./docs/documentation-workbench.md)
23. [Program Repo Jump](./docs/product/program-repo-jump.md)
24. [PROGRAM-0001: Next Product Layer](./docs/product/execution-programs/PROGRAM-0001-next-product-layer.md)
25. [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)

For machine-friendly repo orientation, start with:

- [Research Implementation Index](./docs/research/authoritative/research-implementation-index.json)

## Research Control Plane

Baseline reference research retained in the repo:

1. [deep-research-report.cleaned.md](./docs/research/authoritative/deep-research-report.cleaned.md)
2. [deep-research-report.md](./docs/research/authoritative/deep-research-report.md)
3. [vi-history-suite-authoritative-research.pdf](./docs/research/authoritative/vi-history-suite-authoritative-research.pdf)

There is no active unresolved research-round artifact checked into the repo.
Consumed research rounds are deleted after their findings are normalized into
the committed implementation, queue, ADR, and requirement surfaces.

Use these repo-native control-plane entrypoints instead:

1. [Research Alignment Matrix](./docs/research/authoritative/research-alignment.md)
2. [Research Implementation Index](./docs/research/authoritative/research-implementation-index.json)
3. [Current State](./docs/product/current-state.md)
4. [Development Queue](./docs/product/development-queue.json)
5. [Next Research Prompt](./docs/research/authoritative/next-research-prompt.md)

## Product Docs

- [Current State](./docs/product/current-state.md)
- [Product Charter](./docs/product/charter.md)
- [Problem Statement](./docs/product/problem-statement.md)
- [Development Queue](./docs/product/development-queue.json)
- [First Epic](./docs/product/epics/EPIC-0001-core-content-detected-history-viewer.md)
- [Dashboard Epic](./docs/product/epics/EPIC-0004-multi-report-developer-dashboard.md)
- [NI Comparison Report Metadata Inventory](./docs/product/ni-comparison-report-metadata-inventory.md)
- [PROGRAM-0001: Next Product Layer](./docs/product/execution-programs/PROGRAM-0001-next-product-layer.md)
- [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
- [SHIP-0001: Releasable VI History Suite](./docs/product/SHIP-0001-releasable-vi-history-suite.md)
- [Release Readiness Matrix](./docs/product/release-readiness-matrix.json)
- [Blocker Ledger](./docs/product/blocker-ledger.json)
- [Wiki Authority Map](./docs/product/wiki-authority-map.md)
- [Documentation Coherence Ledger](./docs/product/documentation-coherence-ledger.md)
- [Wiki Seed Plan](./docs/product/wiki-seed-plan.md)
- [Wiki Publication Ledger](./docs/product/wiki-publication-ledger.md)
- [Wiki Publication Ledger JSON](./docs/product/wiki-publication-ledger.json)
- [Wiki Coverage Matrix](./docs/product/wiki-coverage-matrix.md)
- [Wiki Coverage Matrix JSON](./docs/product/wiki-coverage-matrix.json)
- [Debt Retirement Contract](./docs/product/debt-retirement-contract.md)
- [Debt Taxonomy](./docs/product/debt-taxonomy.md)
- [Debt Ledger](./docs/product/debt-ledger.md)
- [Debt Ledger JSON](./docs/product/debt-ledger.json)
- [Post-Release Sustainment Rules](./docs/product/post-release-sustainment-rules.md)
- [Post-Release Sustainment Rules JSON](./docs/product/post-release-sustainment-rules.json)
- [Extension Execution Policy](./docs/product/extension-execution-policy.md)
- [Documentation Package Workbench](./docs/documentation-workbench.md)
- [Program Repo Jump](./docs/product/program-repo-jump.md)
- [Review Scenarios](./docs/product/review-scenarios.md)
- [Harness Definitions](./docs/product/harnesses.md)
- [Software Requirements Specification](./docs/requirements/srs.md)
- [Architecture Overview](./docs/architecture/overview.md)
- [Test Plan](./docs/testing/test-plan.md)
- [Information Item Map](./docs/information-item-map.md)
- [Research Infrastructure](./docs/research/authoritative/research-infrastructure.md)
- [Next Research Prompt](./docs/research/authoritative/next-research-prompt.md)

## Implemented Now

Committed and governed today:

- content-based VI detection using `LVIN` and `LVCC` bytes at offset `8`
- command visibility through both `explorer/context` and `editor/title/context`
- trust-gated and Git-backed eligibility indexing
- review-oriented history panel with `Open at commit`, stateful retained-pair
  actions (`Generate compare`, `Refresh compare`, `Open compare`), and
  `Copy hash`, `Open docs`, plus `Open dashboard` for retained three-plus-commit windows
- comparison-report preflight, staging, packet storage, and packet webview
- LabVIEW 2026 Q1 runtime detection plus reliable Windows 64-bit isolated
  container report execution on the canonical harness
- first runtime-doctor summaries on retained comparison-report packet and panel
  surfaces
- retained runtime-diagnostic facts that distinguish governed container-log
  path mapping, positive LabVIEW launch confirmation, and explicit zero-process
  observations
- comparison-report action proof for post-archive cancellation retention and
  exact non-empty exit-process rendering on the expert panel
- governed host-specific Windows-container image probing for provider selection
- governed container command-rewrite contracts for LabVIEW CLI and LVCompare
- governed comparison-report cancellation stage coverage through runtime
  selection and runtime execution
- governed dashboard refusal handling for missing workspace storage and
  insufficient retained commits on the history command surface
- governed runtime diagnostic-path fail-closed behavior and blank
  `-LabVIEWPath` override handling in the executor/runtime-doctor path
- pairwise dashboard-source archiving so multiple report attempts for one VI can
  coexist without overwriting
- concentrated dashboard JSON and HTML packets that recollect retained VI
  Comparison Report metadata, including report title, generation time,
  compared VI paths, whole-window overview-caption concentration,
  whole-window included-attribute concentration, whole-window
  detailed-information heading concentration, whole-window compared-path
  concentration, whole-window detail-item concentration, chronology-aware
  pair-position references in those whole-window summaries, a chronology-first
  pair metadata ledger, per-pair metadata counts, provider provenance, and
  retained overview image assets rendered on the dashboard through webview-safe
  URIs
- bounded dashboard progress that surfaces commit-window preparation,
  pair-evidence backfill for missing or stale adjacent pairs, pair-by-pair
  concentration, retained-asset finalization, dashboard opening, and a
  bounded minutes-and-seconds estimate during pair-evidence backfill once at
  least one pair has completed
- retained pair-level ETA accuracy characterization for dashboard pair
  preparation, including a dashboard summary and sidecar evidence that exclude
  previously retained pairs and non-generated prepared pairs from the
  current-session accuracy measurement
- canonical dashboard smoke retention for pair-level ETA characterization,
  including actual-vs-estimated preparation timing per prepared pair and a
  retained `dashboard-pair-eta-accuracy.json` sidecar
- stable `latest-dashboard-run.json` retention at the workspace-storage
  dashboards root plus a local consumer script so future sessions can discover
  the newest dashboard run without manually surfacing hashed storage paths,
  including retained history-window mode, effective ceiling, known total file
  history count, truncation state, phase timings, and progress events
- stable `latest-human-review-submission.json` retention at the
  workspace-storage human-review root plus an extension-global canonical
  host-machine fingerprint, so Sergio's maintainer click-pass submission stays
  hidden from other installs, reports submit success or blockage explicitly in
  the panel, and can be consumed deterministically without shell notes
- a canonical-host `Open benchmark status` action in the history panel so the
  retained Windows `lv_icon.vi` baseline, retained host Linux launch/log/summary
  state, explicit run/stop benchmark controls, and live pair-preparation
  progress stay visible inside VS Code
- direct local rendering for retained comparison packets and dashboard HTML
  artifacts, with injected base-path/CSP controls and soft iframe fallback if a
  local HTML artifact is unavailable
- governed dashboard artifact-opening rules that accept only retained
  `report-packet.html`, `report-metadata.json`, `source-record.json`, and
  `*-report-*.html` files from workspace-scoped extension storage
- canonical real-history smoke and canonical comparison-report smoke on
  `HARNESS-VHS-001`
- canonical dashboard smoke on `HARNESS-VHS-001`, with retained three-commit
  concentration artifacts under `.cache/harness-reports/HARNESS-VHS-001/`
- real extension-host dashboard proof for dashboard-open, dashboard-refresh,
  and governed artifact-open behavior
- canonical scenario registry and separate decision-record generation for the
  canonical dashboard evidence flow plus extension-facing `Create decision
  record` UX for three-plus-commit retained review windows
- decision-record cancellation that now stops cleanly after dashboard build,
  before decision-record persistence, and before Markdown open while preserving
  already-built dashboard or decision-record artifacts
- compare generation that now preserves the current comparison view while
  keeping `Generate compare` truthful whenever governed retained archive
  persistence was unavailable or failed, plus retained-open validation that now
  fails closed on malformed render-critical archived packet payloads
- retained design gate that chooses the next tranche from committed evidence
- retained design gate that refreshes `latest-report.{json,md}` after each
  successful stage so a stuck assurance tail does not leave stale tranche
  evidence
- authoritative ship-control surfaces that retain one landed release target,
  one readiness matrix, and one blocker ledger in the repo itself while the
  development queue carries the single active post-release tranche
- a published docs-authoring workbench image plus a repo-native docs gate for
  iterating on requirements, ADRs, release-readiness docs, and future
  wiki-source material in a governed environment
- a governed wiki workbench that resolves the authority repo and sibling wiki
  repo from the cross-repo map, stages page-authority bundles, retains
  `latest-workbench.json` and publication-prep receipts under
  `.cache/wiki-workbench/`, and supports both local and Docker-first wiki
  iteration commands
- a zero-gap wiki completion invariant retained in
  `docs/product/wiki-coverage-matrix.{md,json}` so the standards-facing wiki
  tranche is only considered finished when every in-scope control,
  requirements, verification, and ADR source is represented on published wiki
  pages
- a governed debt-retirement contract retained in
  `docs/product/debt-retirement-contract.md`, `docs/product/debt-taxonomy.md`,
  and `docs/product/debt-ledger.{md,json}` so technical and documentation debt
  cannot remain implicit across future sessions, with retired debt, open debt,
  and accepted exceptions all bound to explicit owner programs and next gates
- a governed extension-execution-policy package that queues transparent
  `auto` / `host-only` / `docker-only` execution, Docker-required hard stops,
  and Windows image-acquisition UX as explicit product truth instead of future
  chat-only guidance
- a governed cross-repo jump surface that resolves the product repo, wiki repo,
  and companion `repo-standards-review` skill repo from one local map and one
  CLI entrypoint
- local evidence-consumer scripts for the newest dashboard run and newest human
  review submission via `npm run dashboard:latest`,
  `npm run dashboard:latest:host`, and `npm run review:latest`
- a GitHub-hosted Linux dashboard benchmark lane that pins
  `nationalinstruments/labview:2026q1-linux`, defaults hosted runs to
  `HARNESS-VHS-001` / `Tooling/deployment/VIP_Pre-Install Custom Action.vi`,
  and retains machine-readable benchmark summaries under
  `.cache/github-experiments/linux-dashboard-benchmark/` while the canonical
  Windows host owns the deep `HARNESS-VHS-002` / `resource/plugins/lv_icon.vi`
  benchmark
- a scaffolded Windows benchmark-image lane that pins
  `nationalinstruments/labview:2026q1-windows`, retains deep
  `HARNESS-VHS-002` benchmark summaries under
  `.cache/github-experiments/windows-dashboard-benchmark/`, retains a canonical
  host proof runner at `scripts/runHostWindowsBenchmarkImageProof.js` that
  pulls the published GHCR image, pre-seeds the mounted harness cache from the
  governed local `ni-labview-icon-editor` clone when available, normalizes Git
  safe-directory handling for those mounted clones, defaults deep host proof to
  the tracked comparable-prefix commit window while the Linux full window
  remains blocked, and writes launch/log/summary receipts under
  `C:\Users\sveld\AppData\Local\VI History Suite\windows-benchmark-image-proof`,
  now snapshots immutable per-run `dashboard-smoke` artifacts beside each
  timestamped Windows benchmark summary so future packet derivation can prefer
  the latest eligible proof instead of trusting only mutable `latest-*` files,
  while hosted Windows benchmark execution remains explicitly not-yet-governed
- a retained documentation coherence ledger and wiki seed plan so future wiki
  work starts from governed docs instead of source or chat memory
- a retained wiki publication ledger so actual published wiki pages are tracked
  from the main repo control plane instead of being inferred from the wiki repo
- a machine-readable wiki publication ledger plus a generated bundled-docs pack
  under `resources/bundled-docs/` so published user docs can ship inside the
  VSIX instead of requiring repo access
- a configured GitLab SemVer release lane that validates tag/package sync,
  packages a versioned VSIX, and retains a machine-readable release manifest
- a fail-closed package-runtime audit that keeps the shipped VSIX surface
  compiled-only and blocks runtime `node_modules`, `.cache`, or `.vscode-test`
  leakage before packaging
- packaging-only npm tooling is kept out of the default `npm ci` surface for
  compile/test/benchmark work and is invoked only on demand by the guarded
  packaging path
- a `main`-branch preview VSIX artifact lane so extension users can install the
  latest governed build before the first tagged release is retained
- explicit Linux and Windows extension-host proof scripts plus a least-privilege
  Linux VS Code bootstrap command for faster autonomous iteration
- explicit GitHub Linux benchmark preparation via
  `npm run benchmark:github:linux:canonical` for the cheaper hosted canonical
  harness and `npm run benchmark:github:linux:lv-icon` for the explicit deep
  `lv_icon.vi` lane in the authority repo, mirrored into the private GitHub
  experiment repo with a published benchmark image and a retained consumer at
  `npm run benchmark:github:latest`, while the canonical host in-IDE Linux
  benchmark resolves the canonical `vi-history-suite` authority workspace even
  when the current VI History target lives in a different repo, stages that
  authority workspace into a fresh Windows-local benchmark workspace before
  launch without repo-local transient/test-runtime artifacts such as
  `.vscode-test`, defaults each host run to the current published benchmark
  image tag unless an explicit override is configured, filters raw `npm warn`
  noise out of the front-facing progress channel, fails closed when only a
  stale launch receipt remains and no live host Linux benchmark container
  exists, keeps the hosted GitHub lane on the shallower canonical harness, and
  requires host-versus-GitHub timing comparisons to use the same authority
  commit pushed to both GitLab authority and the private GitHub experiment
  mirror while GitLab remains the authority source repo and release-control
  surface; the deep Linux lane now enforces per-pair runtime timeouts, writes
  machine-readable per-pair failure receipts, emits heartbeat progress during
  runtime execution, and retains terminal partial summaries for failed runs,
  retains native Linux NI diagnostic logs under governed report storage, and
  discards stale reused report HTML when a nonzero-exit pair leaves the
  previous pair's output behind, now also copies Linux headless artifacts such
  as `LVStatus.txt` and current `labview_*_headless_*_cur.txt` files into
  governed report storage, surfaces retained terminal diagnostic reasons in
  the host benchmark-status panel, and now attempts one governed
  `LabVIEWCLI CloseLabVIEW -Headless` session reset plus one retry when a pair
  retains `linux-headless-recursive-load`; the latest deep-host `lv_icon.vi`
  run still retains a full-window Linux blocker at pair `135/138` because the
  accepted benchmark truth has not widened beyond the last retained rerun,
  while bounded fresh-session repros showed the same pair times out under
  `LVCompare` and degrades into `-350000` connection failure on retry; the
  accepted cross-OS timing truth is now the retained comparable-prefix packet in
  `docs/product/benchmark-packets/HARNESS-VHS-002-comparable-prefix.json`,
  which captures the first `129` commits / `128` pairs across the governed
  Windows host, Linux host, and Windows benchmark-image surfaces before the
  first invalid retained boundary

## Active Work

Latest landed ship target:

- `SHIP-0001`: releasable `v0.2.0` VSIX product
- landed ship tranche: `TRANCHE-009`
- landed ship issue: `ISSUE-0406`
- current package baseline: `0.2.0`
- target release artifact: `vi-history-suite-0.2.0.vsix`
- target release manifest: `release-evidence/release-manifest.json`
- docs-authoring image: `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main`
- retained release evidence: GitLab release `v0.2.0`, tag pipeline `2428809456`,
  release job `13779604462`
- remaining release blockers: none

## Install Surface

Current install paths are:

- local package output via `npm run package`
- guarded package audit via `npm run package:audit` before any local or CI
  VSIX packaging
- GitLab `main` pipeline preview artifact:
  `preview-evidence/vi-history-suite-<version>.vsix`
- governed tagged release artifact:
  `release-evidence/vi-history-suite-<version>.vsix`
- packaged bundled user docs surfaced through
  `VI History: Open Documentation` and the history-panel `Open docs` action
- documentation-package workbench image:
  `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main`

The current active tranches are:

- `TRANCHE-010`: public facade release kit and host-machine acceptance
- active issue: `ISSUE-0407`
- `TRANCHE-012`: post-release sustainment and release cadence
- active sustainment rules:
  `docs/product/post-release-sustainment-rules.md`
- closed follow-on tranches:
  - `TRANCHE-011`: repeatable Windows and Linux benchmark proof
  - `TRANCHE-013`: extension execution flexibility, canonical execution-request
    validation, and runtime acquisition UX, now closed on transparent provider
    and acquisition truth

Issue-ready execution programs:

- [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
- [PROGRAM-0003: Repeatable Benchmark Proof](./docs/product/execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md)
- [PROGRAM-0004: Post-Release Sustainment And Release Cadence](./docs/product/execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)
- [PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX](./docs/product/execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)

See:

- [Current State](./docs/product/current-state.md)
- [Development Queue](./docs/product/development-queue.json)
- [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
- [PROGRAM-0003: Repeatable Benchmark Proof](./docs/product/execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md)
- [PROGRAM-0004: Post-Release Sustainment And Release Cadence](./docs/product/execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)
- [PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX](./docs/product/execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)
- [Post-Release Sustainment Rules](./docs/product/post-release-sustainment-rules.md)
- [Post-Release Sustainment Rules JSON](./docs/product/post-release-sustainment-rules.json)
- [Extension Execution Policy](./docs/product/extension-execution-policy.md)
- [SHIP-0001: Releasable VI History Suite](./docs/product/SHIP-0001-releasable-vi-history-suite.md)
- [Release Readiness Matrix](./docs/product/release-readiness-matrix.json)
- [Blocker Ledger](./docs/product/blocker-ledger.json)
- [Wiki Authority Map](./docs/product/wiki-authority-map.md)
- [Documentation Coherence Ledger](./docs/product/documentation-coherence-ledger.md)
- [Wiki Seed Plan](./docs/product/wiki-seed-plan.md)
- [Wiki Publication Ledger](./docs/product/wiki-publication-ledger.md)
- [Documentation Package Workbench](./docs/documentation-workbench.md)
- [Program Repo Jump](./docs/product/program-repo-jump.md)
- [Release Procedure](./docs/release-procedure.md)
- [Fast VS Code Loop](./docs/dev-fast-loop.md)
- [Research Alignment Matrix](./docs/research/authoritative/research-alignment.md)
- [Next Research Prompt](./docs/research/authoritative/next-research-prompt.md)

## Local Development

```bash
npm ci
npm run design:gate
```

If you are checking retained gate evidence instead of waiting on the live
process, fail closed with:

```bash
npm run design:gate:assert-complete
```

Primary commands:

- `npm run design:gate`
  - compile
  - unit coverage
  - extension-host integration
  - canonical harness smoke
  - repo-local mirrored standards quick-triage assurance when the available
    skill path resolves under `/mnt`
  - fail-closed timeout on a stalled standards-assurance tail instead of
    waiting indefinitely
- `npm run design:gate:assert-complete`
  - verifies the retained latest report is both `pass` and
    `completionState: complete`
- `npm run harness:smoke`
- `npm run harness:report:smoke`
- `npm run harness:dashboard:smoke`
- `npm run harness:decision:record`
- `npm run docs:gate`
- `npm run docs:workbench:build`
- `npm run docs:workbench:gate`
- `npm run docs:workbench:shell`
- `npm run dev:watch`
- `npm run dev:workspace`
- `npm run dev:host`
- `npm run test:integration:linux`
- `npm run test:integration:windows`
- `npm run preview:refresh`

Fast inner loop:

1. `npm run dev:watch`
2. `npm run dev:host`
3. inside the dev host, use `Developer: Reload Window` after code changes

Use `npm run preview:refresh` only when a slice needs a refreshed installable
VSIX. The dedicated dev host is the default inner loop.

Linux integration-host bootstrap:

```bash
sudo /usr/local/bin/vihs-bootstrap-vscode-linux-host install
```

Primary generated evidence:

- `.cache/design-gate/latest-report.json`
- `.cache/design-gate/latest-report.md`
- `.cache/harness-reports/HARNESS-VHS-001/report.json`
- `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.json`
- `.cache/harness-reports/HARNESS-VHS-001/dashboard-smoke.json`
- `<workspace-storage>/dashboards/<repoId>/<fileId>/<windowId>/dashboard-pair-eta-accuracy.json`
- `<workspace-storage>/dashboards/latest-dashboard-run.json`
- `<workspace-storage>/decision-records/<repoId>/<fileId>/<windowId>/<scenarioId>/<decisionId>/decision-record.json`
- `<workspace-storage>/decision-records/<repoId>/<fileId>/<windowId>/<scenarioId>/<decisionId>/decision-record.md`
- `<workspace-storage>/report-history/<repoId>/<fileId>/pairs/<pairId>/source-record.json`
- `<workspace-storage>/dashboards/<repoId>/<fileId>/<windowId>/dashboard.json`

Dashboard-run discovery:

- `npm run dashboard:latest`
- `npm run dashboard:latest:json`
- `npm run dashboard:latest:host`
- `npm run dashboard:latest:host:json`

The helper searches the stable `latest-dashboard-run.json` manifest first, then
falls back to legacy retained `dashboard-pair-eta-accuracy.json` plus
`dashboard.json` evidence when needed. The `:host` variants fail closed against
repo-local `.vscode-test` and harness artifacts so host-machine proof does not
silently degrade into test evidence.
- `<workspace-storage>/dashboards/<repoId>/<fileId>/<windowId>/dashboard.html`

GitHub Linux benchmark discovery:

- `npm run benchmark:github:latest`
- `npm run benchmark:github:latest:json`

The helper prefers the latest successful `workflow_dispatch` artifact from the
private GitHub experiment mirror and falls back to cached downloads under
`.cache/github-experiment-downloads/` when needed. That hosted consumer is
expected to resolve the cheaper canonical harness by default; the deep
`lv_icon.vi` benchmark remains owned by the canonical host lane. The Linux
liveness requirements in `VHS-REQ-409` through `VHS-REQ-412` are now closed,
and the current deep-host retained result is still characterization-only, but
it now fails truthfully late in the window with retained headless diagnostic
reasoning instead of stalling indefinitely or collapsing into a generic
container exit.

The generated `.cache/` evidence is local and regenerated. The committed source
now retains the accepted cross-OS comparable timing scope in
`docs/product/benchmark-packets/HARNESS-VHS-002-comparable-prefix.json`, while
the full Linux deep window remains an explicit retained blocker because the
latest official NI Linux truth still failed at pair `135/138` with
`labview-cli-connection-failed (linux-headless-recursive-load)`.

Host-runnable Windows benchmark image proof:

- `node scripts/runHostWindowsBenchmarkImageProof.js`

The runner pulls the published Windows benchmark image, defaults
`HARNESS-VHS-002` to the retained comparable-prefix dashboard window from
`docs/product/benchmark-packets/HARNESS-VHS-002-comparable-prefix.json` unless
you override `--dashboard-commit-window`, pre-seeds the mounted harness cache
from the governed local `ni-labview-icon-editor` clone when that clone is
available on this host, normalizes Git safe-directory handling for those
mounted clones before invoking the image entrypoint, and writes
`latest-launch.json`, `run-*.log`, and the mounted `latest-summary.json` under
`C:\Users\sveld\AppData\Local\VI History Suite\windows-benchmark-image-proof`.
The published image now also forces `LV_RTE_HEADLESS=1`, hardens
`LabVIEWCLI.ini` startup timeouts, prelaunches headless LabVIEW before the
benchmark CLI starts, and the Windows `labview-cli` execution plan now retains
the governed `-LabVIEWPath` instead of silently dropping the selected LabVIEW
executable. The latest retained proof now reaches pair `129/134` before
retaining a connected-session `Error 66 / Call By Reference` seam, and the
runtime now attempts one governed `LabVIEWCLI CloseLabVIEW -Headless` session
reset plus one retry for that seam before terminal failure is retained.
A newer contaminated rerun on the canonical host also exposed a separate
false-green seam: stale host-side LabVIEW state could leave every prepared pair at
`runtimeExecutionState=not-available` while the retained summary still looked
completed. The Windows benchmark summary now fails closed on that condition,
surfaces the retained blocked reason, and leaves the comparable-prefix packet
on the last eligible proof instead of treating contamination as benchmark success.

The generated `.cache/` evidence is local and regenerated. The committed source
of truth for implemented-versus-partial research work is the documentation stack
linked above.

## Canonical Harness

The canonical real-history harness is `HARNESS-VHS-001`, backed by
`ni/labview-icon-editor`, with:

- history smoke via `npm run harness:smoke`
- comparison-report smoke via `npm run harness:report:smoke`
- dashboard smoke via `npm run harness:dashboard:smoke`
- scenario decision-record generation via `npm run harness:decision:record`

The explicit deep-history benchmark harness is `HARNESS-VHS-002` for
`resource/plugins/lv_icon.vi`. Sergio's canonical Windows host remains the UX
and human-review surface for that target, the Windows benchmark image is the
repeatable deep benchmark baseline, and GitHub-hosted Linux experiments default
to `HARNESS-VHS-001`.

See [Harness Definitions](./docs/product/harnesses.md).

## Bounded Repo Support

The governed repo family is currently bounded to:

- `ni/labview-icon-editor`
- `ni/actor-framework`
- same-name GitHub forks of those upstream repos
- governed retained local fixture clones of those same upstream repos

That bounded family does not mean every governed surface is equally broad.

- Core compare and dashboard surfaces stay inside the bounded repo family.
- Unsupported repos fail closed in the live VI History UI instead of looking
  equivalent to governed repos.
- Decision-record, deep-benchmark, and maintainer host-review lanes remain
  narrower and are still governed separately from generic family membership.

## License

This repository is licensed under [PolyForm Strict 1.0.0](./LICENSE).

That means, in practical terms:

- third parties may use this software only for noncommercial purposes
- third parties may not redistribute this software
- third parties may not modify this software or create derivative works from it
- this repository is not open source

If you need commercial rights, modification rights, redistribution rights, or a
different license grant, contact the licensor directly.

## Contributions

External contributions are not accepted by default.

This repository is currently maintained by its sole author. If that ever
changes, any exception for invited contributions will be handled through a
separate private written agreement, not through the public repository files.

See [CONTRIBUTING.md](./CONTRIBUTING.md).
