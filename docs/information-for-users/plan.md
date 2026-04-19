# Information For Users Plan

## Scope

- Product or service: `vi-history-suite`
- Owner: sole author
- Purpose: retain a bounded document set for user-information planning that
  stays truthful to the exact released installed path, the active `develop`
  authority direction, and the public-evaluation routes
- Standards posture: selected process duties in `26514 §§5-6` and selected
  product duties in `26514 §§7-9`, adopted through released
  `repo-standards-review v0.2.18`
- Claim boundary: Markdown-based repo documentation plus release-versioned
  evidence; this package does not assert blanket full conformance to every
  `26514` clause

## Related Surfaces

- [README.md](../../README.md)
- [INSTALL.md](../../INSTALL.md)
- [Current State](../product/current-state.md)
- [Documentation Package Workbench](../documentation-workbench.md)
- [Audience And Task Model](./audience-and-task-model.md)
- [Navigation And Search](./navigation-and-search.md)
- [Delivery Profile](./delivery-profile.md)
- [Style Guide](./style-guide.md)
- [User Guide](../user-guide.md)
- [FAQ](./faq.md)
- [Command Reference](./command-reference.md)
- [Glossary](./glossary.md)
- [PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX](../product/execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)
- [ISSUE-0412: Installed Local LabVIEWCLI Selection And Explicit Compare](../product/issues/ISSUE-0412-installed-local-labviewcli-selection-and-explicit-compare.md)
- [Release Procedure](../release-procedure.md)
- [Public Release Candidate](../product/public-release-candidate.md)
- [Test Plan](../testing/test-plan.md)

## Document Set

This is the bounded information-for-users posture for the current repo-owned
package. The external starter docs now include `docs/user-guide.md`,
`docs/faq.md`, `docs/glossary.md`, and `docs/quick-reference.md`.

## Governed Surfaces

| Surface | Information type mix | Primary audiences | Notes |
| --- | --- | --- | --- |
| `README.md` | route index, concept, quick-start task | installed users, source evaluators, maintainers | top-level route and allowed mixed route surface |
| `INSTALL.md` | task, reference | installed users and source evaluators | exact released install and public evaluation baseline |
| `docs/documentation-workbench.md` | task, reference | maintainers and docs authors | stable docs-authoring route and local workbench contract |
| `docs/information-for-users/audience-and-task-model.md` | concept, reference | maintainers, installed users, source evaluators, reviewers | retained audience and task rationale for this package |
| `docs/information-for-users/navigation-and-search.md` | reference | maintainers, installed users, source evaluators, reviewers | navigation architecture, metadata minimum, and search posture |
| `docs/information-for-users/delivery-profile.md` | concept, reference | maintainers, installed users, source evaluators, reviewers | route-to-task delivery decisions and fallback paths |
| `docs/information-for-users/style-guide.md` | reference | maintainers and docs authors | retained planning and style-governance controls |
| `docs/information-for-users/command-reference.md` | reference | maintainers, source evaluators, advanced installed users | compact quick-reference guide, not a full command manual |
| `docs/information-for-users/faq.md` | troubleshooting, quick answers | installed users, source evaluators, maintainers | dedicated troubleshooting and quick-answer surface |
| `docs/information-for-users/glossary.md` | glossary | all primary audiences | user-language definitions for repo-specific terms |
| `docs/product/public-release-candidate.md` | proof, reference | reviewers, release operators, auditors | durable evidence route for public release and publication state |

## Claim Boundary

| Boundary axis | Current retained posture |
| --- | --- |
| Process duties | bounded document set with selected planning, support-boundary, navigation, review, and maintenance duties |
| Product duties | selected product duties in `26514 §§7-9` for route docs, FAQ, glossary, command reference, audience model, navigation, delivery profile, and style governance |
| Delivery scope | Markdown-based repo documentation scope plus retained release-versioned evidence model |
| Out of scope | blanket `26514` full-conformance claims, copied self-application-only `repo-standards-review` packet paths, video, audio, embedded help, and chatbot or VRS behavior |
| Evidence model | repo-native docs gate plus the released `repo-standards-review v0.2.18` compliance workbench and exact checkers |

## Documentation Planning Inputs

| Input | Current retained decision |
| --- | --- |
| Standards source | released `repo-standards-review v0.2.18` plus truthful `vi-history-suite` authority surfaces |
| Stable skill contract reference | `vi-history-suite` has no `SKILL.md`; use `README.md`, `INSTALL.md`, and `docs/documentation-workbench.md` instead |
| Team and roles | one maintainer authoring the package, with installed users, source evaluators, and reviewers as the primary user families |
| Deliverables inventory | `README.md`, `INSTALL.md`, docs workbench, audience model, navigation, delivery profile, style guide, glossary, FAQ, command reference, and durable release/public evidence routes |
| Localization posture | English only for now; no translated deliverables are claimed |
| Metadata minimum | dedicated support docs keep `Applies to:`, `Last reviewed:`, `Primary audience:`, `Topic type:`, `Primary entry route:`, and `See also:` near the top |

## Planning Controls

| Control | Current retained decision |
| --- | --- |
| Review cadence | review this package when entry routes, runtime-provider doctrine, docs-workbench commands, public publication routes, or released `repo-standards-review` user-information pressure changes |
| Reuse strategy | keep compact support answers here, but move stable task or policy doctrine back into `README.md`, `INSTALL.md`, `PROGRAM-0005`, `ISSUE-0412`, `docs/documentation-workbench.md`, or release/public evidence surfaces |
| Version posture | keep the exact released installed baseline explicit as `v1.2.2` Docker-only and x64-only until a later publication tranche changes that truth |
| Branch posture | keep the active `develop` direction explicit as host-default Windows local `LabVIEWCLI` plus one bounded expert Docker provider |
| Validation split | use the repo-native docs workbench for authoring and the released `repo-standards-review v0.2.18` compliance workbench as the outer assurance baseline |

## Authority And Source Inputs

| Input type | Current retained source or rule |
| --- | --- |
| Entry-route authority | `README.md` and `INSTALL.md` own the first-use and public-evaluation route truth |
| Runtime-provider authority | `PROGRAM-0005`, `ISSUE-0412`, `package.json`, and `src/tooling/localRuntimeSettingsCli.ts` define the active branch runtime-provider contract |
| Docs authoring authority | `docs/documentation-workbench.md` owns the repo-native docs-workbench commands and boundaries |
| Release-control authority | `docs/release-procedure.md` and `docs/cm/cm-plan.md` define the governed release path |
| Durable evidence route | `docs/product/public-release-candidate.md` plus the public source/wiki publication ledgers are the retained public evidence path |
| External assurance authority | released `repo-standards-review v0.2.18` is the current outer standards baseline for this tranche |

The stable skill contract reference for this repo is the explicit absence of a repo-local `SKILL.md` plus the governed entry-route set above.

## Audiences And Tasks

The retained audience and task model lives in
[Audience And Task Model](./audience-and-task-model.md).

This package is currently optimized for:

- installed users trying to understand the exact released route
- source evaluators using the public evaluation route
- maintainers switching between docs authoring, runtime-provider work, and release/publication control
- reviewers reading durable public evidence without reconstructing it from chat memory

## Navigation Metadata And Search

The retained navigation architecture lives in
[Navigation And Search](./navigation-and-search.md).

Current navigation architecture:

- `README.md` is the top-level route
- `docs/information-item-map.md` is the retained item index
- `docs/product/public-release-candidate.md` is the primary durable evidence route
- stable file paths, stable headings, and explicit metadata blocks are the repeat-find posture
- repo search uses native editor/browser search and `rg`, not a custom docs-search subsystem

## Topic Architecture And Information Model

This section is the section-to-topic-role map for the current bounded package.

| Topic role | Current retained surfaces | Boundary note |
| --- | --- | --- |
| Concept | `README.md`, audience model, delivery profile | concept surfaces explain routes and user context, not every step |
| Task | `INSTALL.md`, docs workbench, release procedure | task surfaces own ordered actions and preconditions |
| Reference | command reference, navigation and search, current state, information item map | reference surfaces carry stable facts, routes, and command syntax |
| Troubleshooting | FAQ | the FAQ is a dedicated troubleshooting and quick-answer surface, not the only copy of stable procedures |
| Glossary | glossary | glossary entries stay in user-language and do not become a duplicate command manual |
| Route index | `README.md` | the route index stays an allowed mixed route surface rather than splitting the entrypoint artificially |

## Governed Surface Topic Map

| Surface | Primary topic role | Reason it exists |
| --- | --- | --- |
| `README.md` | route index | entrypoint and first routing surface |
| `INSTALL.md` | task/reference | exact released install route and public evaluation route |
| `docs/documentation-workbench.md` | task/reference | docs-authoring workbench contract |
| `docs/information-for-users/audience-and-task-model.md` | concept/reference | audience and task depth for the package |
| `docs/information-for-users/navigation-and-search.md` | reference | navigation architecture and metadata minimum |
| `docs/information-for-users/delivery-profile.md` | concept/reference | delivery profile and fallback decisions |
| `docs/information-for-users/style-guide.md` | reference | information planning and style governance |
| `docs/information-for-users/faq.md` | troubleshooting | temporary workarounds, quick answers, and route redirects |
| `docs/information-for-users/command-reference.md` | reference | stable compact command locator, not a full command manual |
| `docs/information-for-users/glossary.md` | glossary | command, release, governance, or standards terms change here first |
| `docs/product/public-release-candidate.md` | proof/reference | release-facing quality evidence and public publication state |

## Glossary Governance

- Define terms in user-language for novice users, not maintainer shorthand.
- Add or revise glossary entries when command, release, governance, or
  standards terms change.
- When a route doc, the FAQ, or the command reference uses a term likely to
  confuse a first-time reader, add or refresh the glossary entry.
- When a FAQ answer turns into stable doctrine, shorten, redirect, or retire
  the FAQ answer and keep the durable definition in the glossary or the
  governing route doc.

## Specialized Support Boundary

- The FAQ is a supplemental support surface for repeated route questions,
  reload guidance, and first-response troubleshooting. Do not keep the only
  copy of a stable step-by-step procedure in the FAQ.
- The command reference is a compact quick-reference guide. It is not a full
  command manual, it is not an API reference, it is not API-doc scope, and it
  does not describe chatbot or VRS behavior.
- Temporary workarounds belong in the FAQ only until the stable route doc can
  incorporate it there as soon as feasible. When that happens, shorten, redirect, or retire the FAQ answer.

## Accessibility And Usability

- Use text-first, searchable Markdown as the default format.
- When a non-text artifact is needed, include a text alternative that states
  the task-relevant meaning.
- Avoid unnecessary device references; explain device-specific input only when
  it matters.
- Current feature-disclosure answer: this package relies on native platform
  capabilities plus text-first docs conventions; it does not claim extra
  repo-specific accessibility features beyond copyable commands, searchable
  Markdown, and non-color-dependent instructions.
- The device-reference rules and metadata minimum stay in the
  [Style Guide](./style-guide.md).

## Documentation Quality Acceptance

## Quality Goals

- keep the external starter pack truthful to the exact released line and the
  active `develop` direction without collapsing them into one route
- keep the internal control docs aligned to the released external checker rather
  than to older parked baselines
- keep routes and validation commands explicit enough that a future session can
  resume from repo truth instead of reconstructing the package from chat memory

- Findability acceptance: a user can find the correct route and summarize the task correctly without browsing unrelated internal control-plane docs first.
- Consistency acceptance: exact released `v1.2.2` boundaries and active
  `develop` boundaries are not collapsed into one ambiguous statement.
- Minimal-completeness acceptance: a reader can complete the task correctly on the first try for the supported route that the doc claims to cover.
- Release-facing quality evidence:
  - repo-native docs gate
  - repo-native docs workbench gate
  - released `repo-standards-review v0.2.18` exact checker set
  - released `repo-standards-review v0.2.18` compliance workbench release gate

## Tooling And Validation

- Repo-native docs gate: `node scripts/run-docs-gate.js`
- Repo-native docs workbench gate:
  `node scripts/runDocsWorkbenchDocker.js gate`
- Released external release gate:
  `docker run --rm -v /path/to/repo:/target registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:v0.2.18 python3 scripts/run_assurance.py /target --profile release-gate`
- Released external user-information checker:
  `py -3 "$env:USERPROFILE\\.codex\\skills\\repo-standards-review\\scripts\\external_user_information_check.py" . --json`

## Review And Update Triggers

Update this package when any of the following change:

- the exact released installed-user runtime contract
- the active branch runtime-provider direction
- the docs-workbench command surface
- public source-evaluation or release/publication evidence routes, including the durable release candidate route
- reload or restart guidance after CLI-driven settings mutation
- the released `repo-standards-review` user-information baseline
- the route translation between `README.md`, `INSTALL.md`, `docs/documentation-workbench.md`, and the repo's lack of `MAINTAINING.md` or `OPERATIONS.md`
