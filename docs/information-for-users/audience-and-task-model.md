# Audience And Task Model

Applies to: exact released installed baseline `v1.3.16` plus the active
`develop` installed-user direction
Last reviewed: `2026-05-15`
Primary audience: installed users, source evaluators, maintainers, and
publication reviewers
Topic type: concept and reference
Primary entry route: `README.md`

## Related Surfaces

See also:

- [Plan](./plan.md)
- [Navigation And Search](./navigation-and-search.md)
- [Delivery Profile](./delivery-profile.md)
- [Style Guide](./style-guide.md)
- [FAQ](./faq.md)
- [Command Reference](./command-reference.md)
- [Glossary](./glossary.md)
- [Maintainer Control Plane Index](../product/maintainer-control-plane-index.md)

The governing control surfaces for this topic are
`docs/information-for-users/plan.md` and
`docs/information-for-users/delivery-profile.md`.

## Audience Hierarchy And Overlap

| Audience family | Audience | Similar interaction with the repo | Role-overlap note |
| --- | --- | --- | --- |
| Direct product user | Installed user | installs or evaluates the exact released extension path and needs truthful runtime prerequisites | may also become a source evaluator when the public repo route is used instead of the VSIX |
| Direct product user | Source evaluator | clones the repo, follows the public evaluation route, and may run proof or docs commands locally | may also act as an advanced installed user during branch evaluation |
| Core operator | Maintainer | edits source, docs, and release-control surfaces while switching between local proof and public publication routes | may also act as the publication reviewer or release operator |
| Evidence reviewer | Publication reviewer | reads public release and publication evidence without re-running the whole control plane | may overlap with the maintainer during exact release closeout |

## Audience Translation From Released `repo-standards-review`

- `Assessed repo owner` maps most closely to the source evaluator in this repo.
- `Engineering leader` appears here only as an occasional evidence consumer of
  release or publication proof, not as a primary docs-package operator.
- `Auditor` appears here only as an occasional reviewer of retained public
  evidence, not as a primary product user.

## Audience Profiles

| Audience | Role family | Background and training | Learning stage | Usage frequency | Operational context | Preferred surfaces |
| --- | --- | --- | --- | --- | --- | --- |
| Installed user | direct product user | familiar with VS Code and LabVIEW, but not necessarily repo governance | first-time to occasional | low | exact released extension use and troubleshooting | `README.md`, `INSTALL.md`, FAQ |
| Source evaluator | direct product user | comfortable cloning repos and running package scripts locally | occasional | medium | public evaluation, branch checkout, and targeted proof | `README.md`, `INSTALL.md`, command reference |
| Maintainer | core operator | already familiar with the repo control plane and release/publication rules | regular to advanced | high | local terminal use, docs authoring, CI follow-up, and release readiness | docs workbench, command reference, current state, release procedure |
| Publication reviewer | evidence reviewer | inspects public release and publication evidence rather than editing source directly | occasional | low | public source/wiki verification and release sign-off | public release candidate, publication ledgers, glossary |

## Content Decisions Driven By This Model

| Surface | Included because | Current exclusion or boundary note |
| --- | --- | --- |
| `README.md` | installed users and source evaluators need a fast route split before opening deeper docs | it is a route index, not the only copy of release or runtime doctrine |
| `INSTALL.md` | installed users need the exact released install route and source evaluators need the public evaluation route | host-default local `LabVIEWCLI` plus bounded expert Docker is current installed-user doctrine; deeper proof and publication details stay in authority docs |
| `docs/documentation-workbench.md` | maintainers need repeatable docs-authoring instructions under local and containerized paths | it is for documentation-package work only, not all runtime proof |
| `docs/information-for-users/command-reference.md` | maintainers and source evaluators need simultaneous-use command lookup while acting in the terminal | it stays compact rather than becoming a full command manual |
| `docs/information-for-users/faq.md` | installed users and source evaluators need short answers and recovery hints without re-reading all route docs | stable doctrine must still move back into the governing route doc when it settles |
| `docs/product/public-release-candidate.md` | publication reviewers need one durable evidence route for exact release and public publication state | it is proof/reference, not a replacement for release procedure steps |

## Task Profiles

| Task | Why it is performed | Frequency | Preconditions | Operational mode | Fault tolerance | Consequence if missed | Priority surfaces |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Start from the exact released route | confirm the installed baseline and first-use path without mixing in unreleased branch doctrine | high | exact released package line known | browser or local Markdown review | low | users may follow an unreleased path and get the wrong runtime expectation | `README.md`, `INSTALL.md`, FAQ |
| Evaluate the source repo | inspect the source checkout and public evaluation route locally | medium | local clone and package dependencies available | terminal plus docs review | medium | source evaluators may use stale commands or miss the public route split | `README.md`, `INSTALL.md`, command reference |
| Switch runtime provider | select between host-default Windows local `LabVIEWCLI` and bounded expert Docker | medium | exact installed line or source checkout with generated CLI available | terminal, then VS Code reload if needed | low | provider settings can drift from what Compare is actually reading | `PROGRAM-0005`, `ISSUE-0412`, command reference, FAQ |
| Author or review documentation-package changes | validate docs-package changes with the repo-native workbench and gates | medium | local Docker-backed docs workbench available | terminal and docs editing | low | the package can drift from the enforced docs gate or published workbench | docs workbench, command reference, style guide |
| Inspect public release and publication evidence | verify the retained state of the exact release, public source, public wiki, and Marketplace surfaces | low | retained evidence available | GitLab and Markdown review | low | publication claims can drift from retained public evidence | public release candidate, release procedure, information item map |

## Audience-Task Matrix

Use `Primary`, `Secondary`, and `Review` to distinguish ownership from lighter
participation.

| Task | Installed user | Source evaluator | Maintainer | Publication reviewer |
| --- | --- | --- | --- | --- |
| Start from the exact released route | Primary | Secondary | Secondary | Review |
| Evaluate the source repo |  | Primary | Secondary |  |
| Switch runtime provider |  | Secondary | Primary |  |
| Author or review documentation-package changes |  |  | Primary | Review |
| Inspect public release and publication evidence |  | Secondary | Secondary | Primary |

## Delivery Priorities

- Installed users need the exact released line to lead with host-default local
  `LabVIEWCLI`, while historical Docker-only wording remains clearly bounded
  as retained evidence.
- Source evaluators need route and command guidance that stays truthful to the
  local repo rather than older parked plans.
- Maintainers need simultaneous-use quick reference while switching between
  terminals, docs, and public-evidence surfaces.
- Publication reviewers need a durable evidence route and stable terminology,
  not implementation detail.

## Review Notes

- Review this surface when the released starter pack changes shape, when the
  route split between the exact released line and active `develop` changes, or
  when `docs/information-for-users/plan.md` or
  `docs/information-for-users/delivery-profile.md` changes enough to alter
  audience ownership.
