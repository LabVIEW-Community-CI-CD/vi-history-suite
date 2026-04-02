# ADR-0002: Published Review Surface Uses WebviewPanel

- Status: accepted
- Date: 2026-04-02
- Deciders: sole author

## Context

- The authoritative research treats `TimelineProvider` as a proposed API and
  therefore not a publishable Marketplace surface.
- The current product already uses a `WebviewPanel` for the first governed
  developer-review experience.
- The repo needs one stable published review surface while future report
  generation is added.

## Decision

- Keep the published review surface on `WebviewPanel`.
- Treat `TimelineProvider` as out of the published extension path until it is a
  stable API and the product explicitly chooses to adopt it.

## Rationale

- Webviews are stable and support the richer packet/report layout the research
  expects.
- Avoiding proposed APIs keeps the extension publishable and reduces platform
  ambiguity.

## Consequences

- Positive:
  - published UI path remains stable and testable
  - report linking and progress UX can evolve on one known surface
- Negative:
  - no native Timeline integration in the published product for now
