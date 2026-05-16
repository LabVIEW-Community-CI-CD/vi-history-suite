# User Guide

## Document Control

- Product or service: `vi-history-suite`
- Applies to: exact released installed baseline `v1.3.16` plus the active
  `develop` authority direction
- Last reviewed: `2026-05-16`
- Primary audience: installed users, source evaluators, and maintainers
- Primary entry route: `README.md` and `INSTALL.md`

See also:

- [README.md](../README.md)
- [FAQ](./faq.md) at `docs/faq.md`
- [Glossary](./glossary.md) at `docs/glossary.md`
- [Quick Reference](./quick-reference.md) at `docs/quick-reference.md`

## Start Here

- Primary user goal: choose the correct truthful route before spending time in
  the wrong surface.
- First required step: decide whether you are using the exact released
  extension, evaluating the source repo, or working on the active `develop`
  line.
- Safe fallback route: return to `README.md`, then use `INSTALL.md` for the
  exact released installed path or the documentation workbench and current state
  surfaces for source-backed work.

## Audience And Tasks

| Audience | Primary tasks | Assumptions | Failure tolerance |
| --- | --- | --- | --- |
| New user | install the released extension or evaluate the public repo safely | needs fast route selection and minimal repo-internal jargon | low; the route must fail closed instead of implying unsupported behavior |
| Returning user | re-enter the correct route, recheck the current baseline, and find troubleshooting help | already knows the repo exists but may not know the latest released boundary | medium; can follow compact reference routes |
| Maintainer | switch between released user truth, active `develop` truth, and validation routes | can read repo docs and run local checks | higher; maintainer can follow deeper control-plane routes |

## Common Tasks

| Task | Route | Evidence or output |
| --- | --- | --- |
| Start the repo workflow | `README.md`, then `INSTALL.md` if you need the released installed route | correct route selection before compare or docs work starts |
| Check the current baseline | `README.md`, `INSTALL.md`, and `docs/product/current-state.md` | released `v1.3.16` boundary versus active `develop` direction is explicit |
| Find troubleshooting help | `docs/faq.md` and `docs/quick-reference.md` | short recovery path and stable commands or checks |

## Navigation

- Primary route: `README.md` is the top-level route, and `INSTALL.md` is the
  exact released install route.
- Secondary route: `docs/faq.md`, `docs/glossary.md`, and
  `docs/quick-reference.md` provide the bounded external support pack.
- Search hint: use `rg -n "<term>" README.md INSTALL.md docs` or native editor,
  browser, and GitLab search.
- Related topics: the active runtime-provider doctrine and release-control truth
  remain in `docs/product/execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md`,
  `docs/product/issues/ISSUE-0412-installed-local-labviewcli-selection-and-explicit-compare.md`,
  and `docs/release-procedure.md`.
