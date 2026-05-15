# Delivery Profile

Applies to: exact released installed baseline `v1.3.16` plus the active
`develop` installed-user direction
Last reviewed: `2026-05-15`
Primary audience: installed users, source evaluators, and documentation
reviewers
Topic type: concept and reference
Primary entry route: `README.md`

See also:

- [Plan](./plan.md)
- [Audience And Task Model](./audience-and-task-model.md)
- [Navigation And Search](./navigation-and-search.md)
- [Quick Reference](../quick-reference.md)
- [FAQ](./faq.md)
- [Command Reference](./command-reference.md)
- [Maintainer Control Plane Index](../product/maintainer-control-plane-index.md)

Version applicability or update trigger: update this surface when route
ownership, release packet evidence paths, repo support boundaries, or the
external starter pack change.

## Delivery Rules

- Use `README.md` as the orientation route while the user is still deciding
  which deeper surface applies.
- Use `INSTALL.md` as the primary route for the exact released install path
  and public source-evaluation route.
- Use the maintainer control-plane index as the exit route for
  documentation-package authoring, validation, and release control.
- Use the command reference as the simultaneous-use quick reference for
  installed-user commands and source-evaluation commands.
- Use the FAQ as a short-answer fallback for recurring questions, not as the
  only authority for a stable procedure.
- Use the public release candidate and publication ledgers as the durable
  evidence fallback when the live route docs are insufficient for review.

## Surface Delivery Matrix

| Audience | Task | Information type | Primary surface | Secondary surface | Urgency | Persistence | Simultaneous-use requirement | Access method or entry route | Fallback path | Update trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Installed user | Start from the exact released route | concept, task, reference | `README.md` | `INSTALL.md` and FAQ | high | persistent | no | `README.md` -> `INSTALL.md` -> FAQ | local clone of `README.md` and `INSTALL.md` | update when the exact released runtime contract changes |
| Source evaluator | Evaluate the source repo | concept, task, reference | `README.md` | `INSTALL.md` and command reference | medium | persistent | yes | `README.md` -> `INSTALL.md` -> command reference | local clone of those surfaces plus current state when needed | update when public-evaluation commands or route boundaries change |
| Maintainer | Switch runtime provider on the active branch | task, reference | `PROGRAM-0005` and `ISSUE-0412` | command reference and FAQ | high | persistent | yes | current state -> program/issue docs -> command reference | local clone of the governing docs and runtime-settings CLI help | update when provider request, version/bitness contract, or reload guidance changes |
| Maintainer | Author documentation-package changes | task, reference | docs workbench | command reference and style guide | high | persistent | yes | docs workbench -> command reference -> style guide | local clone plus repo-native docs workbench container | update when docs-authoring commands or validation split changes |
| Publication reviewer | Inspect public release and publication evidence | proof, reference | public release candidate | public source/wiki publication ledgers | medium | persistent | no | public release candidate -> ledgers | retained publication ledgers and release evidence | update when exact release or public publication state changes |

## Delivery Assumptions

- The exact released installed-user contract is `v1.3.16` with
  prepare-CLI-first setup.
- The active `develop` direction may describe host-default Windows local
  `LabVIEWCLI` plus bounded expert Docker, but that branch direction does not
  silently replace the exact released install route.
- The docs package remains text-first Markdown; no additional media channels
  are currently claimed.
- `MAINTAINING.md` and `OPERATIONS.md` are not first-class `vi-history-suite`
  user-information entry surfaces.
- The release packet route for public publication evidence remains the public
  release candidate and related ledgers, not a copied self-application packet.
- The external starter pack routes through
  `docs/information-for-users/navigation-and-search.md` and
  `docs/quick-reference.md` instead of duplicating deeper command-reference or
  release-procedure content.

## Update Triggers

- update this surface when route ownership changes
- update this surface when the released install route or the active branch route
  split changes
- update this surface when `docs/information-for-users/navigation-and-search.md`
  or `docs/quick-reference.md` changes enough to alter fallback or entry-route
  meaning
