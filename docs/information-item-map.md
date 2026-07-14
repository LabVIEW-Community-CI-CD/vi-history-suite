# Information Item Map

## Scope

- Product or service: vi-history-suite
- Repository: LabVIEW-Community-CI-CD/vi-history-suite
- Baseline: develop governed docs baseline
- Owner: maintainers

## Information Items

| Item Type | Current Path | Owner | Trigger | Proving Evidence |
| --- | --- | --- | --- | --- |
| Information For Users Plan | `docs/information-for-users/plan.md` | Maintainers | audience, route, or support change | external user-information check and docs link check stay green |
| User Guide | `docs/user-guide.md` | Maintainers | workflow or install route change | guide links to start, task, and fallback routes |
| FAQ | `docs/faq.md` | Maintainers | repeated support question or temporary workaround | FAQ answers point back to governed durable routes |
| Glossary | `docs/glossary.md` | Maintainers | command, release, governance, or standards term change | shared terms stay aligned across user and maintainer docs |
| Quick Reference | `docs/quick-reference.md` | Maintainers | command or route change | repeat-find commands stay current with validation lanes |
| Plan | `docs/testing/test-plan.md` | QA/maintainers | validation or release evidence change | CI and local validation references remain current |
| System Specification | `docs/requirements/syrs.md` | Maintainers | system capability change | active system requirement IDs and criteria stay current |
| Software Specification | `docs/requirements/srs.md` | Maintainers | software capability or governance change | active software requirement IDs and criteria stay current |
| Report | `docs/maintainer-operations.md` | Maintainers | closeout, release, or standards evidence change | retained closeout and release evidence routes stay accurate |
| Procedure | `docs/cm/cm-plan.md` | Maintainers | release, baseline, branch, or status-accounting change | CM plan names the governing release and closeout procedures |

## Notes

- Keep owner, trigger, and proving-evidence fields aligned with `docs/information-for-users/plan.md`.
- Prefer live repo paths over external document links so the pack works in a clone and in hosted browsing.
- Review this map whenever traceability inventory, release evidence, or documentation workbench status changes.