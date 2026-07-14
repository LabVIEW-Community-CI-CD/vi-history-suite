# Style Guide

## Document Control

- Product or service: vi-history-suite
- Repository: LabVIEW-Community-CI-CD/vi-history-suite
- Baseline: develop governed docs baseline
- Owner: maintainers
- Status: active

See also:

- `docs/information-for-users/plan.md`
- `docs/glossary.md`
- `docs/user-guide.md`
- `docs/quick-reference.md`

## Writing Rules

- Prefer plain user-language over internal shorthand when the audience is mixed.
- Keep titles short and route-specific so users can distinguish concept, task, reference, and troubleshooting surfaces.
- Keep commands, paths, environment variables, and identifiers in monospace formatting.
- Keep stable answers in governed task or reference surfaces, not only in the FAQ.
- Use `TROUBLESHOOTING.md` for failure diagnosis and `SUPPORT.md` for support boundaries.

## Terminology Rules

- Define unfamiliar or overloaded terms in `docs/glossary.md`.
- Reuse the same term for the same concept across guide, FAQ, and quick-reference surfaces.
- Review glossary entries when command names, release terms, governance terms, or standards references change.
- Prefer requirement IDs and exact command names over vague labels when documenting validation or closeout evidence.

## Accessibility Baseline

- Keep the package text-first and readable in a local clone or hosted web view.
- Use descriptive headings and link text so find-in-page and screen readers have stable cues.
- Avoid making critical routes depend on color, images, generated artifacts, or hover-only interactions.
- Keep route tables compact enough to scan without losing the fallback path.