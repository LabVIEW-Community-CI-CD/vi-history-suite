# Information For Users Glossary

## Document Control

- Product or service: `vi-history-suite`
- Applies to: exact released installed baseline `v1.2.2` plus the active
  `develop` authority direction
- Last reviewed: `2026-04-18`
- Primary audience: installed users, source evaluators, and maintainers
- Primary entry route: `README.md` and `INSTALL.md`

See also:

- [README.md](../../README.md)
- [INSTALL.md](../../INSTALL.md)
- [FAQ](./faq.md)
- [Command Reference](./command-reference.md)

## Scope Boundary

- This glossary is for novice users first and defines terms in the user's terms.
- It is not a duplicate command manual.
- It does not replace the route docs, the FAQ, or the command reference.

## Entry And Review Rules

- Add or revise a glossary entry when a command, release, governance, or
  standards term is likely to confuse a first-time reader.
- Prefer the user's terms over maintainer shorthand.
- When a route doc, the FAQ, or the command reference introduces a term without
  defining it locally, add or refresh the glossary entry.

## Terms

| Term | Meaning | Where it matters |
| --- | --- | --- |
| Assurance workbench | The published `repo-standards-review` container used for outer release-gate checks. | external `v0.2.18` baseline |
| compare preflight | The explicit branch workflow that shows the selected pair plus provider, version, and bitness before compare starts. | active `develop` direction under `PROGRAM-0005` and `ISSUE-0412` |
| docs workbench | The repo-native Docker-backed authoring surface for documentation-package iteration. | `docs/documentation-workbench.md`, docs gates, and wiki preparation |
| exact released line | The published installed-user baseline that is already live. The current exact released line is `v1.2.2`. | installed-user truth versus active branch direction |
| expert Docker provider | The non-default compare provider that remains available on the active branch only through the generated settings CLI. | runtime-provider selection and fail-closed Docker admission |
| host-default runtime | The active branch direction where Windows local `LabVIEWCLI` is the default compare provider when the persisted provider is absent. | `PROGRAM-0005`, `ISSUE-0412`, and compare preflight |
| LabVIEWCLI | The local LabVIEW command-line backend used by the active branch for Windows host-default compare generation. | installed compare runtime resolution on the active branch |
| provider request | The persisted compare-provider intent, `host` or `docker`, written by the generated runtime-settings CLI. | runtime selection, compare preflight, and runtime-doctor guidance |
| released compliance workbench | The published `repo-standards-review` assurance-workbench image used as the outer standards-verification baseline. | `v0.2.18` intake and future `26514` branch validation |
| Release packet | A retained release-proof bundle or route that records the evidence for a cut or publication state. | release candidate and publication review |
| Self-application | A `repo-standards-review` term for the skill applying its own doctrine to itself; not a first-class `vi-history-suite` release artifact. | external checker interpretation |
