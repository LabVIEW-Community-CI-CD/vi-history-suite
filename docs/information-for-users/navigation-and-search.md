# Navigation And Search

## Document Control

- Product or service: vi-history-suite
- Repository: LabVIEW-Community-CI-CD/vi-history-suite
- Baseline: develop governed docs baseline
- Owner: maintainers
- Status: active

See also:

- `docs/information-for-users/plan.md`
- `docs/user-guide.md`
- `docs/quick-reference.md`
- `docs/faq.md`

## Route Hierarchy

| Need | Primary route | Secondary route | Notes |
| --- | --- | --- | --- |
| Start here | `README.md` or `docs/user-guide.md` | `docs/quick-reference.md` | keep the fastest safe entry route visible |
| Install or first run | `INSTALL.md` and `FIRST-RUN.md` | `README.md` | keep first-use guidance close to the overview |
| Short support answer | `docs/faq.md` | `docs/user-guide.md` | use FAQ for repeated questions or temporary answers |
| Shared terminology | `docs/glossary.md` | `docs/information-for-users/style-guide.md` | keep user-facing terms aligned |
| Repeat-find lookup | `docs/quick-reference.md` | local or hosted search | keep compact routes stable |
| Runtime or validation failure | `TROUBLESHOOTING.md` | `SUPPORT.md` | route failures to a safe next action |

## Metadata Policy

- Use stable titles that match the route purpose.
- Keep related-topic and see-also routes current after each route change.
- Prefer local file paths that remain valid in both a clone and hosted browsing.
- Keep `Applies to` metadata consistent across starter docs and `Baseline` metadata consistent across governed control docs.

## Search Posture

- Local clones should support plain text search over `README.md`, top-level support docs, and `docs/`.
- Hosted browsing should rely on the platform's native search or find-in-page.
- Search hints should point to the real docs tree, not to external unpublished notes.
- Use `rg` for local search examples because the repository already standardizes on it for fast text search.