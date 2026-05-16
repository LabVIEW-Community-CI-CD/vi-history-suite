# Quick Reference

## Document Control

- Product or service: `vi-history-suite`
- Applies to: exact released installed baseline `v1.3.16` plus the active
  `develop` authority direction
- Last reviewed: `2026-05-16`
- Primary audience: installed users, source evaluators, and maintainers
- Primary entry route: `README.md` and `INSTALL.md`

See also:

- [README.md](../README.md)
- [User Guide](./user-guide.md) at `docs/user-guide.md`
- [FAQ](./faq.md) at `docs/faq.md`
- [Glossary](./glossary.md) at `docs/glossary.md`

## Key Routes

| Need | Route | Notes |
| --- | --- | --- |
| Start here | `README.md` | top-level route and first read order |
| Main user guide | `docs/user-guide.md` | compact external route summary before deeper internal docs |
| Short answers | `docs/faq.md` | repeated route and failure questions |
| Shared terms | `docs/glossary.md` | compact vocabulary for release and branch language |

## Common Commands Or Checks

| Purpose | Command or route | Notes |
| --- | --- | --- |
| Search the local docs tree | `rg -n "<query>" README.md INSTALL.md docs` | fast repo-native search without a custom docs subsystem |
| Run the main validation or check | `npm run test` | use when a slice changes code, docs guards, or integration behavior |
| Open the release or change-control route | `docs/release-procedure.md` | use when the task is release-, publication-, or proof-facing |
