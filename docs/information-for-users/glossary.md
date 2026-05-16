# Information For Users Glossary

## Document Control

- Product or service: `vi-history-suite`
- Applies to: exact released installed baseline `v1.3.16` plus the active
  `develop` installed-user direction
- Last reviewed: `2026-05-15`
- Primary audience: installed users, source evaluators, and maintainers
- Primary entry route: `README.md` and `INSTALL.md`

See also:

- [README.md](https://github.com/svelderrainruiz/vi-history-suite/blob/HEAD/README.md)
- [INSTALL.md](https://github.com/svelderrainruiz/vi-history-suite/blob/HEAD/INSTALL.md)
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
| Assurance workbench | The published `repo-standards-review` container used for outer release-gate checks. | published `assurance-workbench:main` lane |
| compare preflight | The explicit workflow that shows the selected pair plus provider, version, and bitness while still allowing Compare to surface exact runtime failures. | current installed runtime contract under `PROGRAM-0005` and `ISSUE-0412` |
| docs workbench | The repo-native Docker-backed authoring surface for documentation-package iteration. | `docs/documentation-workbench.md`, docs gates, and wiki preparation |
| exact released line | The published installed-user baseline that is already live. The current exact released line is `v1.3.16`. It uses host-default Windows local `LabVIEWCLI` and retains Docker as a bounded expert provider. | installed-user truth versus active branch direction |
| prepare command | `VI History: Prepare Local Runtime Settings CLI`, the explicit command that creates or refreshes the local `vihs` launcher. | first-time setup and launcher repair |
| expert Docker provider | The non-default compare provider that remains available only through the generated settings CLI. | runtime-provider selection and fail-closed Docker admission |
| host-default runtime | The current installed-user doctrine where Windows local `LabVIEWCLI` is the default compare provider when the persisted provider is absent. | `PROGRAM-0005`, `ISSUE-0412`, and compare preflight |
| LabVIEWCLI | The local LabVIEW command-line backend used for Windows host-default compare generation. | installed compare runtime resolution |
| provider request | The persisted compare-provider intent, `host` or `docker`, written by the generated runtime-settings CLI. | runtime selection, compare preflight, and runtime-doctor guidance |
| released compliance workbench | The latest tagged `repo-standards-review` assurance-workbench release used when exact released reproduction matters more than the rolling lane. | `v0.2.18` tagged-release reproduction and historical exact-baseline checks |
| Release packet | A retained release-proof bundle or route that records the evidence for a cut or publication state. | release candidate and publication review |
| Self-application | A `repo-standards-review` term for the skill applying its own doctrine to itself; not a first-class `vi-history-suite` release artifact. | external checker interpretation |
