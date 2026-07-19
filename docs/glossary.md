# Glossary

## Document Control

- Product or service: vi-history-suite
- Applies to: vi-history-suite user-information baseline
- Last reviewed: 2026-07-13
- Primary audience: Users, maintainers, and reviewers who need shared terms for docs, validation, and release evidence.
- Primary entry route: `docs/user-guide.md`

See also:

- `README.md`
- `docs/user-guide.md`
- `docs/faq.md`
- `docs/quick-reference.md`

## Terms

| Term | Meaning | Where it matters |
| --- | --- | --- |
| baseline | A known version, branch, tag, or evidence state used as the comparison reference. | Release prep, CM, traceability, and standards audits. |
| bundled dev-tools build | The dev-tools (MCP server and companion tooling) shipped inside the extension and used by default. | `viHistorySuite.devTools.version` = `bundled`, `docs/devtools-release.md`. |
| closeout evidence | Retained local and standards-review output that supports closing an issue or release lane. | `docs/maintainer-operations.md`, `docs/cm/cm-plan.md`. |
| comparison report | The HTML or retained artifact produced from a VI comparison run. | User workflow, report export, dashboard review. |
| dev-tools release line | The independently versioned (`devtools-vX.Y.Z`, SemVer 2.0) release stream of the dev-tools toolset, separate from the extension's Marketplace version. | `docs/devtools-release.md`. |
| interactive block-diagram preview | A pannable, zoomable VI block-diagram view with a Case/Event/Sequence case stepper, instead of a static picture. | `viHistorySuite.preview.blockDiagramInteractive`. |
| Marketplace pre-release channel | The VS Code pre-release lane; an odd extension minor version (for example `1.35.x`) is a pre-release, an even minor (for example `1.34.x`) is stable. | `INSTALL.md`, Extensions view "Install Pre-Release Versions". |
| pinned dev-tools | An independently released dev-tools version selected with `viHistorySuite.devTools.version` and installed on demand, run instead of the bundled build. | Install/Uninstall/Show Dev-Tools Status commands, `docs/devtools-release.md`. |
| preview cache | The content-addressed store of rendered VI previews the extension builds so previews open instantly and can be shared across machines. | `viHistorySuite.preview.*`, `docs/architecture/preview-cache-fabric.md`. |
| requirement target | A scoped change tied to a VHS-REQ ID, RTM row, validation commands, and PR evidence. | `docs/requirements/README.md`, issue and PR templates. |
| release candidate | A candidate version under validation for Marketplace or release publication. | Release workflow, package validation, Marketplace verification. |
| standards workbench | The repo-standards-review toolchain used for 29148, 29119, 42010, 10007/12207, 15289, and 26514 evidence scans. | Standards audit, closeout evidence, local issue triage. |