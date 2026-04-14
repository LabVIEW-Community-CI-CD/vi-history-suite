# Information For Users Plan

## Scope

- Product or service: `vi-history-suite`
- Owner: sole author
- Purpose: retain a governed baseline for compact information-for-users support
  surfaces that stay truthful to the exact released installed path and the
  active `develop` authority direction
- Standards posture: reusable `ISO/IEC/IEEE 26514:2022` signals adopted from
  released `repo-standards-review v0.2.12`
- Claim boundary: selected planning and support-surface duties only; this
  package does not assert blanket full conformance to every `26514` clause

## Related Surfaces

- [README.md](../../README.md)
- [INSTALL.md](../../INSTALL.md)
- [Current State](../product/current-state.md)
- [Documentation Package Workbench](../documentation-workbench.md)
- [PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX](../product/execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)
- [ISSUE-0412: Installed Local LabVIEWCLI Selection And Explicit Compare](../product/issues/ISSUE-0412-installed-local-labviewcli-selection-and-explicit-compare.md)
- [Release Procedure](../release-procedure.md)
- [Test Plan](../testing/test-plan.md)

## Governed Surfaces

| Surface | Information type mix | Primary audiences | Notes |
| --- | --- | --- | --- |
| `README.md` | concept, route, quick-start task | installed users, source evaluators, maintainers | top-level orientation and branch-boundary surface |
| `INSTALL.md` | task, reference | installed users and source evaluators | exact released install and public evaluation baseline |
| `docs/information-for-users/command-reference.md` | reference | maintainers, source evaluators, advanced installed users | stable compact command locator |
| `docs/information-for-users/faq.md` | troubleshooting, quick answers | installed users, source evaluators, maintainers | short answers for recurring route and support questions |
| `docs/information-for-users/glossary.md` | glossary | all primary audiences | defines repo-specific terms that are easy to misread |

## Claim Boundary

| Boundary axis | Current retained posture |
| --- | --- |
| Process duties | selected planning, governed-scope, support-boundary, and review/maintenance duties for a small support package |
| Product duties | selected support-surface duties for `README.md`, `INSTALL.md`, the command reference, the FAQ, and the glossary |
| Delivery scope | Markdown-based repo documentation plus retained validation evidence |
| Out of scope | blanket `26514` full-conformance claims, self-application-only `repo-standards-review` packet paths, video, audio, embedded help, and chatbot or VRS behavior |
| Evidence model | repo-native docs gate plus the released `repo-standards-review v0.2.12` external assurance baseline |

## Planning Controls

| Control | Current retained decision |
| --- | --- |
| Review cadence | review this package when entry routes, runtime-provider doctrine, docs-workbench commands, or released `repo-standards-review` user-information pressure changes |
| Reuse strategy | keep compact support answers here, but send stable task or policy doctrine back to `README.md`, `INSTALL.md`, `PROGRAM-0005`, `ISSUE-0412`, or the docs workbench surface |
| Version posture | keep the exact released installed baseline explicit as `v1.2.2` Docker-only and x64-only until a later publication tranche changes that truth |
| Branch posture | keep the active `develop` direction explicit as host-default Windows local `LabVIEWCLI` plus one bounded expert Docker provider |
| Validation split | use the repo-native docs workbench for authoring and the released `repo-standards-review v0.2.12` compliance workbench as the outer assurance baseline |

## Authority And Source Inputs

| Input type | Current retained source or rule |
| --- | --- |
| Entry-route authority | `README.md` and `INSTALL.md` own the first-use and public-evaluation route truth |
| Runtime-provider authority | `PROGRAM-0005`, `ISSUE-0412`, `package.json`, and `src/tooling/localRuntimeSettingsCli.ts` define the active branch runtime-provider contract |
| Docs authoring authority | `docs/documentation-workbench.md` owns the repo-native docs-workbench commands and boundaries |
| Release-control authority | `docs/release-procedure.md` and `docs/cm/cm-plan.md` define the governed release path |
| External assurance authority | released `repo-standards-review v0.2.12` is the current outer standards baseline for this tranche |

## Specialized Support Boundary

- The FAQ is a compact support surface for repeated route questions, reload
  guidance, and first-response troubleshooting. It is not the only authority
  for stable product behavior.
- The command reference is a stable quick-reference surface for commands and
  validation routes. It is not a full manual and it is not an API reference.
- The current tranche intentionally seeds support surfaces before the broader
  audience, navigation, delivery, and style package is added.
- Later `26514` branches should expand this package only when the added
  surface is truthful to repo source and release boundaries.

## Tooling And Validation

- Repo-native docs gate: `node scripts/run-docs-gate.js`
- Repo-native docs workbench gate:
  `node scripts/runDocsWorkbenchDocker.js gate`
- Released external release gate:
  `docker run --rm -v /path/to/repo:/target registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:v0.2.12 python3 scripts/run_assurance.py /target --profile release-gate`
- Current released external user-information pressure:
  the exact `v0.2.12` checker stopped first on missing
  `docs/information-for-users/faq.md`

## Review And Maintenance

Update this package when any of the following change:

- the exact released installed-user runtime contract
- the active branch runtime-provider direction
- the docs-workbench command surface
- public source-evaluation routes
- reload or restart guidance after CLI-driven settings mutation
- the released `repo-standards-review` user-information baseline
