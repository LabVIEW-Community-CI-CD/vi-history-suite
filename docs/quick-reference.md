# Quick Reference

## Document Control

- Product or service: vi-history-suite
- Applies to: vi-history-suite user-information baseline
- Last reviewed: 2026-07-13
- Primary audience: Returning users and maintainers who need a compact route list.
- Primary entry route: `README.md`

See also:

- `README.md`
- `docs/user-guide.md`
- `docs/faq.md`
- `docs/glossary.md`

## Key Routes

| Need | Route | Notes |
| --- | --- | --- |
| Start here | `README.md` | Project overview, install route, and main workflow entry. |
| Main user guide | `docs/user-guide.md` | Audience, tasks, and navigation for the governed user-information pack. |
| Short answers | `docs/faq.md` | Compact answers for repeated start, command, and fallback questions. |
| Shared terms | `docs/glossary.md` | Terms used across requirements, testing, release, and standards evidence. |
| Troubleshooting | `TROUBLESHOOTING.md` | Runtime, Git, LabVIEWCLI, Docker, and validation failure paths. |
| Support policy | `SUPPORT.md` | Support boundaries and escalation route. |

## Common Commands Or Checks

| Purpose | Command or route | Notes |
| --- | --- | --- |
| Search the local docs tree | `rg -n "<query>" README.md docs SUPPORT.md TROUBLESHOOTING.md` | Use when a route or term is unclear. |
| Run the main validation or check | `npm run check && npm test` | Baseline local validation for implementation changes. |
| Run requirement health | `npm run requirements:verify:strict` | Single-pane strict requirement health signal. |
| Run traceability audit | `npm run traceability:audit` | Required when docs, inventory, requirements, tests, or mappings change. |
| Run docs link check | `npm run docs:links` | Required when Markdown or bundled docs links change. |
| Open the release or change-control route | `docs/maintainer-operations.md` and `docs/cm/cm-plan.md` | Use for release, closeout, Marketplace, and standards evidence. |