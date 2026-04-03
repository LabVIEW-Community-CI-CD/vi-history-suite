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
- canonical real-history harnesses and smoke lanes
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
8. [PROGRAM-0001: Next Product Layer](./docs/product/execution-programs/PROGRAM-0001-next-product-layer.md)

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
- [SHIP-0001: Releasable VI History Suite](./docs/product/SHIP-0001-releasable-vi-history-suite.md)
- [Release Readiness Matrix](./docs/product/release-readiness-matrix.json)
- [Blocker Ledger](./docs/product/blocker-ledger.json)
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
  `Copy hash`, plus `Open dashboard` for retained three-plus-commit windows
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
  concentration, whole-window detail-item concentration, per-pair metadata
  counts, provider provenance, and retained overview image assets rendered on
  the dashboard through webview-safe URIs
- bounded dashboard progress that surfaces commit-window preparation,
  pair-by-pair concentration, retained-asset finalization, and dashboard
  opening during heavier metadata concentration runs
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
  canonical dashboard evidence flow
- retained design gate that chooses the next tranche from committed evidence
- retained design gate that refreshes `latest-report.{json,md}` after each
  successful stage so a stuck assurance tail does not leave stale tranche
  evidence
- authoritative ship-control surfaces that keep one active tranche, one release
  target, one readiness matrix, and one blocker ledger in the repo itself
- a configured GitLab SemVer release lane that validates tag/package sync,
  packages a versioned VSIX, and retains a machine-readable release manifest
- a `main`-branch preview VSIX artifact lane so extension users can install the
  latest governed build before the first tagged release is retained

## Active Work

The active ship target is:

- `SHIP-0001`: releasable `v0.2.0` VSIX product
- current package baseline: `0.1.0`
- target release artifact: `vi-history-suite-0.2.0.vsix`
- target release manifest: `release-evidence/release-manifest.json`
- remaining release blocker: first successful retained `v0.2.0` tag pipeline

## Install Surface

Current install paths are:

- local package output via `npm run package`
- GitLab `main` pipeline preview artifact:
  `preview-evidence/vi-history-suite-<version>.vsix`
- future governed tagged release artifact:
  `release-evidence/vi-history-suite-<version>.vsix`

The single active tranche is:

- `TRANCHE-009`: ship `vi-history-suite` as a releasable SemVer VSIX

Issue-ready execution program:

- [PROGRAM-0001: Next Product Layer](./docs/product/execution-programs/PROGRAM-0001-next-product-layer.md)

See:

- [Current State](./docs/product/current-state.md)
- [Development Queue](./docs/product/development-queue.json)
- [SHIP-0001: Releasable VI History Suite](./docs/product/SHIP-0001-releasable-vi-history-suite.md)
- [Release Readiness Matrix](./docs/product/release-readiness-matrix.json)
- [Blocker Ledger](./docs/product/blocker-ledger.json)
- [Release Procedure](./docs/release-procedure.md)
- [Research Alignment Matrix](./docs/research/authoritative/research-alignment.md)
- [Next Research Prompt](./docs/research/authoritative/next-research-prompt.md)

## Local Development

```bash
npm ci
npm run design:gate
```

Primary commands:

- `npm run design:gate`
  - compile
  - unit coverage
  - extension-host integration
  - canonical harness smoke
  - standards quick-triage assurance
- `npm run harness:smoke`
- `npm run harness:report:smoke`
- `npm run harness:dashboard:smoke`
- `npm run harness:decision:record`

Primary generated evidence:

- `.cache/design-gate/latest-report.json`
- `.cache/design-gate/latest-report.md`
- `.cache/harness-reports/HARNESS-VHS-001/report.json`
- `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.json`
- `.cache/harness-reports/HARNESS-VHS-001/dashboard-smoke.json`
- `<workspace-storage>/decision-records/<repoId>/<fileId>/<windowId>/<scenarioId>/<decisionId>/decision-record.json`
- `<workspace-storage>/decision-records/<repoId>/<fileId>/<windowId>/<scenarioId>/<decisionId>/decision-record.md`
- `<workspace-storage>/report-history/<repoId>/<fileId>/pairs/<pairId>/source-record.json`
- `<workspace-storage>/dashboards/<repoId>/<fileId>/<windowId>/dashboard.json`
- `<workspace-storage>/dashboards/<repoId>/<fileId>/<windowId>/dashboard.html`

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

See [Harness Definitions](./docs/product/harnesses.md).

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
