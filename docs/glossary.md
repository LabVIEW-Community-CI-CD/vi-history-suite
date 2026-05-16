# Glossary

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
- [Quick Reference](./quick-reference.md) at `docs/quick-reference.md`

## Terms

| Term | Meaning | Where it matters |
| --- | --- | --- |
| active `develop` direction | The branch truth that may already be implemented locally but is not yet the exact released installed baseline. | source-backed evaluation and branch-specific work |
| exact released line | The currently published installed-user truth. In this repo, the current exact released line is `v1.3.16`. | choosing the correct workflow before compare or validation |
| provider request | The stored compare-provider intent, `host` or `docker`, used by the active branch runtime-provider work. | current runtime-provider selection and compare preflight |
| release gate | The outer standards-validation run retained through released `repo-standards-review` baselines. | release readiness, standards intake, and drift checks |
