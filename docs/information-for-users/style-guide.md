# Information For Users Style Guide

## Related Surfaces

- [Plan](./plan.md)
- [Audience And Task Model](./audience-and-task-model.md)
- [Navigation And Search](./navigation-and-search.md)
- [Delivery Profile](./delivery-profile.md)
- [Glossary](./glossary.md)
- [Command Reference](./command-reference.md)
- [Information Item Map](../information-item-map.md)
- [Public Release Candidate](../product/public-release-candidate.md)

## Design Inputs

- Use the [Audience And Task Model](./audience-and-task-model.md) before
  drafting or reshaping a governed user-information surface.
- Use the [Delivery Profile](./delivery-profile.md) before changing which
  surface owns a user task or fallback path.
- Use the [Information Item Map](../information-item-map.md) to identify the
  authority surface that must change when a command, release rule, or governed
  workflow changes.
- When a recurring question can be answered by an existing governed surface,
  link to it instead of copying the content into a new location.

## Writing Style

- Prefer direct, concrete sentences over promotional language.
- Use imperative phrasing for procedures.
- State whether a sentence applies to the exact released line, the active
  `develop` direction, or both.
- Keep each numbered step focused on one action when practical.

## Language And Usage

- Write governed docs in English using U.S. English spelling.
- Do not normalize literal command output, branch names, file paths, or tool
  messages that must match the repo exactly.
- Prefer the user's task language over maintainer shorthand.

## Topic Types

- Concept topics explain what a surface or route is for.
- Task topics explain how to perform a governed action.
- Reference topics list commands, paths, versions, and stable facts.
- Troubleshooting topics explain failure cases, recovery paths, and validation
  expectations.
- Glossary surfaces define unfamiliar terms in the user's language and stay
  alphabetically ordered.
- Route indexes are allowed only where a surface actually serves as a route
  wrapper, such as `README.md`.

## Topic Titles

- Route indexes are allowed only for entry surfaces.
- Dedicated concept-topic titles use noun phrases.
- Dedicated task-topic titles use verb phrases.
- Troubleshooting titles use the problem in user language.

## Minimum Topic Structure

- Dedicated short-form support docs keep metadata, a scope or boundary section,
  and stable related links.
- Mixed route docs keep a compact `Topic Roles` section.
- Topic titles and usage follow Merriam-Webster and Chicago Manual of Style
  where repo-specific terminology does not override them.

## Metadata Minimum

- Dedicated short-form governed docs with version-sensitive behavior keep
  `Applies to:`, `Last reviewed:`, `Primary audience:`, `Topic type:`,
  `Primary entry route:`, and `See also:` near the top.
- Governance docs keep `Related Surfaces` or equivalent control tables.
- Keep topic metadata separate from information-item governance metadata.

## Navigation And Related Links

- `README.md` is the top-level route.
- `docs/information-item-map.md` is the retained item index.
- `docs/product/public-release-candidate.md` is the durable evidence route for
  public release and publication proof.
- Use `Related Surfaces` in governance docs and `See also:` in dedicated
  support docs.
- Keep paired local links bidirectional when the relationship is stable and
  direct.

## Search Posture

- Governed docs rely on native editor, browser, GitLab, and `rg` search rather
  than a custom repo-owned search subsystem.
- Use the released `repo-standards-review` standards-search helper only for
  standards PDF lookup.

## Glossary Discipline

- Add or revise a glossary entry when a governed surface introduces a term or
  repo-specific meaning likely to be unfamiliar to novice users.
- Define glossary entries in the user's terms, not maintainer shorthand.
- Keep a stable glossary cross-link when the FAQ or command reference uses an
  unfamiliar term without defining it locally.
- When a route doc, the FAQ, or the command reference changes because a
  command, release, governance, or standards term changed, re-check the glossary.

## Terminology

- Use `GitFlow`, `main`, `develop`, `release/*`, and `hotfix/*` exactly.
- Use `provider request`, `compare preflight`, and `exact released line`
  exactly as they are defined in the glossary.
- Use `released compliance workbench` for the published
  `repo-standards-review` outer assurance baseline.

## Formatting

- Use Markdown headings to preserve navigability.
- Use monospace for commands, paths, branch names, tags, env vars, and code
  identifiers.
- Prefer fenced code blocks for runnable command sequences.
- Keep related commands grouped by purpose.

## Accessibility

- Use text-first, searchable Markdown as the default governed format.
- Avoid instructions that depend only on color.
- Use descriptive link text and explicit section titles.
- Avoid unnecessary device references; when a specific device input matters,
  say so directly.
- If a non-text artifact is necessary, include a text alternative that states
  the task-relevant meaning.
- Do not imply repo-specific accessibility controls beyond the text-first
  package posture already retained in this repo.

## Review Rules

- Re-check exact released versus active `develop` wording whenever runtime,
  release, or public publication doctrine changes.
- Re-check metadata blocks, related links, and glossary coverage when a support
  surface grows or shifts role.
- Keep `README.md`, `INSTALL.md`, the docs workbench, the FAQ, and the command
  reference aligned.
- Run the exact released `v0.2.12` information-for-users checker before
  treating this package as review-ready.
