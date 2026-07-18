# Delivery Profile

## Document Control

- Product or service: vi-history-suite
- Repository: LabVIEW-Community-CI-CD/vi-history-suite
- Baseline: develop governed docs baseline
- Owner: maintainers
- Status: active

See also:

- `docs/information-for-users/plan.md`
- `docs/information-for-users/audience-and-task-model.md`
- `docs/information-for-users/navigation-and-search.md`
- `docs/quick-reference.md`

## Surface Delivery Matrix

| Surface | Format | Primary audience | Urgency | Persistence | Simultaneous-use need | Access route | Fallback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `docs/user-guide.md` | Markdown | new or returning user | planned | durable | medium | repo root or docs tree | `docs/quick-reference.md` or `docs/faq.md` |
| `docs/faq.md` | Markdown | new or returning user | urgent | medium | high | support route or docs search | `docs/user-guide.md` |
| `docs/quick-reference.md` | Markdown | returning user or maintainer | urgent | durable | high | repeat-find route | `README.md` or `docs/user-guide.md` |
| `docs/glossary.md` | Markdown | all audiences | planned | durable | medium | linked term route | `docs/information-for-users/style-guide.md` |
| `TROUBLESHOOTING.md` | Markdown | all audiences | urgent | durable | high | support and FAQ routes | `SUPPORT.md` |
| `docs/maintainer-operations.md` | Markdown | maintainers | planned | durable | medium | maintainer route | `docs/cm/cm-plan.md` |

## Delivery Assumptions

- The repo can be read in a local clone, editor, or Git-hosted web UI.
- Search should work through local text search or the hosting platform's native search.
- Fallback routes should remain text-first and should not depend on chatbot or VRS support.
- Installed bundled documentation remains a product surface, while this pack governs repository documentation routes.

## Update Triggers

- Review this profile when new user-facing surfaces are added or removed.
- Review this profile when the primary access route changes from local clone, docs site, Marketplace listing, or Git hosting.
- Review this profile when release, closeout, support, or troubleshooting routes change.