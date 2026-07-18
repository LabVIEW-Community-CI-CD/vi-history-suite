# Information For Users Plan

## Document Control

- Product or service: vi-history-suite
- Repository: LabVIEW-Community-CI-CD/vi-history-suite
- Baseline: develop governed docs baseline
- Owner: maintainers
- Status: active
- Primary audience: LabVIEW developers, maintainers, and reviewers using the repository documentation.
- Primary entry route: `README.md`

See also:

- `docs/user-guide.md`
- `docs/information-for-users/audience-and-task-model.md`
- `docs/information-for-users/delivery-profile.md`
- `docs/information-for-users/navigation-and-search.md`
- `docs/information-for-users/style-guide.md`
- `docs/faq.md`
- `docs/glossary.md`
- `docs/quick-reference.md`
- `docs/information-item-map.md`

## Claim Boundary

- This package supports a bounded information-for-users posture for this repo.
- It does not by itself claim blanket full conformance to every `26514` duty.
- The package covers Markdown user, support, route, and documentation-control surfaces retained in the repository.
- The package does not replace installed bundled documentation shipped under `resources/bundled-docs/`.

## Document Set

| Surface | Purpose | Primary audience | Review trigger |
| --- | --- | --- | --- |
| `docs/user-guide.md` | Main entry and task route | user or maintainer | task, install, runtime, or workflow change |
| `docs/faq.md` | Short answers and fallback support | new or returning user | repeated question or workaround change |
| `docs/glossary.md` | Shared terminology | all audiences | command, release, governance, or standards term change |
| `docs/quick-reference.md` | Compact repeat-find route | returning user or maintainer | command, route, or validation lane change |
| `docs/information-for-users/audience-and-task-model.md` | Audience profile and task assumptions | docs owner | user, context, role, or failure-tolerance change |
| `docs/information-for-users/delivery-profile.md` | Surface selection and fallback | docs owner | delivery path, hosting, or access-route change |
| `docs/information-for-users/navigation-and-search.md` | Navigation, metadata, and search policy | docs owner | route, heading, or metadata change |
| `docs/information-for-users/style-guide.md` | Writing, terminology, and accessibility rules | docs owner | style, term, or accessibility rule change |
| `docs/information-item-map.md` | Information-item ownership and evidence map | maintainer or QA | assurance-pack, traceability, or release evidence change |

## Quality Goals

| Goal | Evidence | Acceptance signal |
| --- | --- | --- |
| Routes stay findable | linked docs surfaces and stable headings | users can reach the main guide, support, and fallback surfaces quickly |
| Audience assumptions stay explicit | retained audience and task model | user roles, assumptions, and failure tolerance are visible |
| Delivery choices stay intentional | retained delivery profile | each surface has a primary route, fallback, and update trigger |
| Wording stays consistent | style guide and glossary | titles, commands, and terms remain aligned across surfaces |
| Standards evidence stays repeatable | `assurance-*-evidence/` outputs and traceability inventory | multi-profile standards audit can identify route or support gaps |

## Review And Update Triggers

| Trigger | Surfaces to review | Owner |
| --- | --- | --- |
| Major workflow or task change | user guide, quick reference, FAQ, delivery profile | maintainers |
| Audience, support, or onboarding change | audience and task model, user guide, FAQ | maintainers |
| Route, metadata, or doc-tree change | navigation and search, quick reference, information item map | maintainers |
| Terminology, standards, or governance change | glossary, style guide, information item map | maintainers |
| Release or closeout evidence change | information item map, CM plan, maintainer operations, test plan | maintainers |