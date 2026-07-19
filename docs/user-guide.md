# User Guide

## Document Control

- Product or service: vi-history-suite
- Applies to: vi-history-suite user-information baseline
- Last reviewed: 2026-07-13
- Primary audience: LabVIEW developers and maintainers who need to review VI history or retained comparison evidence.
- Primary entry route: `README.md`

See also:

- `README.md`
- `docs/faq.md`
- `docs/glossary.md`
- `docs/quick-reference.md`

## Start Here

- Primary user goal: review VI changes from Git history without replacing the repository's normal source-control workflow.
- First required step: install the extension, open a Git-backed LabVIEW workspace, and open VI History from a supported VI file.
- Safe fallback route: use `TROUBLESHOOTING.md` for runtime failures and `SUPPORT.md` for support boundaries.

## Audience And Tasks

| Audience | Primary tasks | Assumptions | Failure tolerance |
| --- | --- | --- | --- |
| New user | Install the extension, open the history panel, and run a first comparison. | Needs a visible route from README to install and first-run guidance. | Low; failures need a direct troubleshooting path. |
| Returning user | Compare retained revisions, export reports, and inspect dashboard evidence. | Knows the workspace and needs compact commands or routes. | Medium; can recover with quick-reference and troubleshooting paths. |
| Maintainer | Validate releases, close issues, and retain standards evidence. | Understands branch, requirement, and PR evidence rules. | High; can follow maintainer operations and CM procedures. |

## Common Tasks

| Task | Route | Evidence or output |
| --- | --- | --- |
| Install and start the extension | `README.md`, `INSTALL.md`, `FIRST-RUN.md` | Extension installed and first run completed. |
| Review VI history | `README.md`, bundled installed documentation | History panel with selectable retained revisions. |
| Export or retain comparison evidence | `docs/quick-reference.md`, `docs/maintainer-operations.md` | HTML report, dashboard evidence, or closeout packet. |
| Validate a change before PR handoff | `docs/testing/test-plan.md`, `docs/requirements/README.md` | Local validation commands and PR evidence. |
| Find troubleshooting help | `TROUBLESHOOTING.md`, `SUPPORT.md`, `docs/faq.md` | Diagnosed runtime, Git, or environment next action. |

## Commands And Settings

All extension commands are under the **VI History** category in the Command
Palette (`Ctrl`/`Cmd`+`Shift`+`P`), and all settings live under
`viHistorySuite.*` in the Settings UI. For the full catalogue of every command
ID and setting ID, see [docs/quick-reference.md](quick-reference.md).

Common entry points:

- **Review VI History** — open the history view for a selected `.vi`/`.ctl`/`.vit`.
- **Export Comparison Report (HTML)** — save the current comparison as a
  standalone HTML report.
- **Runtime & Report Settings** / **Set Up Comparison Runtime** — choose whether
  comparisons run on your installed LabVIEW (Host) or an NI container (Docker),
  pick the LabVIEW version/bitness or container image, and set which change
  types the report includes.
- **Show Runtime Summary** / **Detect Runtime Now** — inspect or re-detect the
  LabVIEW comparison runtime.

### VI Preview

Turn on `viHistorySuite.preview.enabled` (Docker runtime) to render a VI as a
read-only picture of its front panel and block diagram when you open it; the
extension caches the rest of the workspace in the background so later previews
open instantly. Set `viHistorySuite.preview.blockDiagramInteractive` to view the
block diagram as an interactive, pannable and zoomable diagram with a
Case/Event/Sequence case stepper (`◀ n/N ▶` or the arrow keys) instead of a
static picture.

### Dev-tools version (advanced)

The extension ships with a bundled dev-tools build (the compiled MCP server and
companion tooling). You can instead pin an independently released dev-tools
version without waiting for a Marketplace update:

- Set `viHistorySuite.devTools.version` to a `devtools-vX.Y.Z` tag (the default
  `bundled` uses the shipped build and never uses the network).
- Run **Install Pinned Dev-Tools Version** to download and integrity-verify that
  release into the extension's storage (trusted workspace only). It is
  fail-closed: until a pin is installed and verified, the bundled build is used.
- **Show Dev-Tools Status** reports which build is active and what is installed;
  **Uninstall Dev-Tools Version** removes an installed version.
- `viHistorySuite.devTools.checkForUpdates` (off by default) opts in to a notice
  when a newer stable dev-tools version is available.

See [docs/devtools-release.md](devtools-release.md#pinning-a-dev-tools-version-in-the-extension)
for details.

## Navigation

- Primary route: `README.md` for project overview, install links, and workflow entry.
- Secondary route: `docs/quick-reference.md` for repeat commands and evidence routes.
- Search hint: run `rg -n "<term>" README.md docs SUPPORT.md TROUBLESHOOTING.md` from the repo root.
- Related topics: `docs/glossary.md`, `docs/information-item-map.md`, and `docs/information-for-users/navigation-and-search.md`.