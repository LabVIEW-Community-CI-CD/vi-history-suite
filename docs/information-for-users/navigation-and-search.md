# Navigation And Search

Applies to: exact released installed baseline `v1.3.16` plus the active
`develop` installed-user direction
Last reviewed: `2026-05-15`
Primary audience: installed users, source evaluators, and documentation
reviewers
Topic type: navigation and reference policy
Primary entry route: `README.md`

See also:

- [Plan](./plan.md)
- [Audience And Task Model](./audience-and-task-model.md)
- [Delivery Profile](./delivery-profile.md)
- [Command Reference](./command-reference.md)
- [FAQ](./faq.md)
- [User Guide](../user-guide.md)
- [Quick Reference](../quick-reference.md)
- [Maintainer Control Plane Index](../product/maintainer-control-plane-index.md)

Use `docs/user-guide.md` for the starter route and `docs/quick-reference.md`
for the bounded external quick-answer route before dropping into the deeper
internal control docs.

## Route Hierarchy

| Route class | Primary surface | Use it for | Current-location cue |
| --- | --- | --- | --- |
| Top-level route | `README.md` | first orientation and route choice | `Start Here`, route-focused headings, and stable section names |
| Installed/public evaluation route | `INSTALL.md` | exact released install truth and public source-evaluation route | release/version wording and route-specific section titles |
| Docs-authoring route | `docs/documentation-workbench.md` | documentation-package iteration and the repo-native docs workbench | workbench command sections and explicit scope boundary |
| Authority control route | `docs/product/maintainer-control-plane-index.md` | maintainer release-control truth | stable file name plus control-plane headings |
| Short-form secondary route | `docs/information-for-users/command-reference.md` and `docs/information-for-users/faq.md` | quick command lookup, repeated route questions, and short support answers | `Applies to:`, `Last reviewed:`, `Primary entry route:`, and `See also:` |
| Maintainer control plane | `docs/product/maintainer-control-plane-index.md` | governed item lookup, evidence-route discovery, release procedure, and publication proof | authority routes, release facts, and maintainer-only pointers |

## Metadata Policy

- Treat topic metadata and information-item governance metadata as separate
  layers.
- Dedicated short-form support docs keep `Applies to:`, `Last reviewed:`,
  `Primary audience:`, `Topic type:`, `Primary entry route:`, and `See also:`
  near the top.
- Governance and planning docs keep `Related Surfaces` or similar scope-control
  sections instead of front metadata blocks.
- Information-item governance metadata remains reachable through
  `docs/product/maintainer-control-plane-index.md`.

## Related-Topic And Index Policy

- Use `README.md` as the top-level route for entry and orientation.
- Use `docs/product/maintainer-control-plane-index.md` when a maintainer needs
  the retained item index, release procedure, or public publication evidence.
- Use `See also:` in dedicated support docs and `Related Surfaces` in planning
  or governance docs.
- Keep paired local links bidirectional when the relationship is stable and
  direct, such as FAQ and command reference, or plan and delivery profile.
- Do not introduce a repo-owned custom search subsystem while native full-text
  search and `rg` remain sufficient.

## Current-Location And Repeat-Find Cues

- Stable file paths and stable headings are the intended repeat-find posture.
- `Start Here`, `See also:`, `Related Surfaces`, and the metadata block in
  short-form support docs are the minimum answer to "where am I in the
  structure?"
- Do not rely only on editor chrome or GitLab navigation as the governed
  navigation answer.

## Search Posture

- In a local clone, use `rg` or editor full-text search for repo-owned
  Markdown surfaces.
- In GitLab or a browser, use native platform search or find-in-page.
- Use the released `repo-standards-review` standards-search helper only for
  standards lookup, not as the repo's own docs-search engine:

```bash
py -3 "$env:USERPROFILE\\.codex\\skills\\repo-standards-review\\scripts\\search_standards.py" --help
```

- Current example:

```bash
rg -n "provider request|compare preflight|release candidate" docs README.md INSTALL.md
```
