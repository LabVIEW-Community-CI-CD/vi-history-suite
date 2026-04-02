# vi-history-suite

`vi-history-suite` is a TypeScript-first Visual Studio Code extension project
for developer-facing VI history review in Git repositories.

The first product target is narrow and factual:

- detect LabVIEW VIs by content, not by file extension
- show an Explorer context-menu command `VI History` only for eligible files
- require the file to be tracked in Git and touched by at least two commits
- open a review-oriented history panel with commit facts and core actions

The initial governed baseline is anchored to the user-supplied design research
captured in [docs/research/extension-design-summary.md](./docs/research/extension-design-summary.md).

## Product Docs

- [Product Charter](./docs/product/charter.md)
- [Problem Statement](./docs/product/problem-statement.md)
- [First Epic](./docs/product/epics/EPIC-0001-core-content-detected-history-viewer.md)
- [Harness Definitions](./docs/product/harnesses.md)
- [Software Requirements Specification](./docs/requirements/srs.md)
- [Architecture Overview](./docs/architecture/overview.md)
- [Test Plan](./docs/testing/test-plan.md)

## Local Development

```bash
npm ci
npm run compile
npm run test
```

## Current Scope

Included in the first baseline:

- VS Code command and Explorer menu contribution
- content-based VI detection for `LVIN` / `LVCC` at offset `8`
- Git-backed eligibility indexing using tracked files and bounded file history
- basic webview history panel with commit list and review actions

Deferred beyond the first baseline:

- LabVIEW comparison report generation
- timeline-provider integration
- marketplace publishing and release automation beyond local CI

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
