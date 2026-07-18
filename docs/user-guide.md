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

## Navigation

- Primary route: `README.md` for project overview, install links, and workflow entry.
- Secondary route: `docs/quick-reference.md` for repeat commands and evidence routes.
- Search hint: run `rg -n "<term>" README.md docs SUPPORT.md TROUBLESHOOTING.md` from the repo root.
- Related topics: `docs/glossary.md`, `docs/information-item-map.md`, and `docs/information-for-users/navigation-and-search.md`.