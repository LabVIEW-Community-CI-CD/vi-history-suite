# vi-history-suite

`vi-history-suite` is a governed TypeScript-first Visual Studio Code extension
for developer-facing review of LabVIEW VI history in Git repositories.

It is no longer just an initial command-and-panel baseline. The repo now
contains:

- content-detected VI eligibility and history review
- governed comparison-report planning, storage, and runtime execution
- pair-archived comparison-report retention by commit pair
- concentrated multi-report dashboard packets and extension dashboard action
- canonical real-history harnesses and smoke lanes
- retained design-gate guidance for the next development tranche

## Start Here

If you are new to the repo, read these in order:

1. [Current State](./docs/product/current-state.md)
2. [Research Alignment Matrix](./docs/research/authoritative/research-alignment.md)
3. [Development Queue](./docs/product/development-queue.json)
4. [Architecture Overview](./docs/architecture/overview.md)
5. [Software Requirements Specification](./docs/requirements/srs.md)
6. [PROGRAM-0001: Next Product Layer](./docs/product/execution-programs/PROGRAM-0001-next-product-layer.md)

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
- review-oriented history panel with `Open at commit`, `Diff vs previous`, and
  `Copy hash`, plus `Open dashboard` for retained three-plus-commit windows
- comparison-report preflight, staging, packet storage, and packet webview
- LabVIEW 2026 Q1 runtime detection plus reliable Windows 64-bit isolated
  container report execution on the canonical harness
- first runtime-doctor summaries on retained comparison-report packet and panel
  surfaces
- retained runtime-diagnostic facts that distinguish governed container-log
  path mapping, positive LabVIEW launch confirmation, and explicit zero-process
  observations
- pairwise dashboard-source archiving so multiple report attempts for one VI can
  coexist without overwriting
- concentrated dashboard JSON and HTML packets that recollect retained VI
  Comparison Report metadata, including report title, generation time,
  compared VI paths, overview section/image counts, included-attribute facts,
  detailed NI report sections, and provider provenance
- governed dashboard artifact-opening rules that accept only retained
  `report-packet.html`, `report-metadata.json`, `source-record.json`, and
  `*-report-*.html` files from workspace-scoped extension storage
- canonical real-history smoke and canonical comparison-report smoke on
  `HARNESS-VHS-001`
- retained design gate that chooses the next tranche from committed evidence

## Active Work

The active product queue is:

- `TRANCHE-006`: first-class multi-report developer dashboard
- `TRANCHE-004`: progress-surface uplift for indexing and report generation
- `TRANCHE-007`: review-scenario registry and human decision records
- `TRANCHE-008`: runtime-doctor and dashboard-refresh developer experience

Issue-ready execution program:

- [PROGRAM-0001: Next Product Layer](./docs/product/execution-programs/PROGRAM-0001-next-product-layer.md)

See:

- [Current State](./docs/product/current-state.md)
- [Development Queue](./docs/product/development-queue.json)
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

Primary generated evidence:

- `.cache/design-gate/latest-report.json`
- `.cache/design-gate/latest-report.md`
- `.cache/harness-reports/HARNESS-VHS-001/report.json`
- `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.json`
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
