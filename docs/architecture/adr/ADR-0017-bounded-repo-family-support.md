# ADR-0017: Repo-Agnostic Support With Separate Governance Depth

- Status: Accepted
- Date: 2026-04-04

## Context

`vi-history-suite` now needs to remain usable on arbitrary Git repositories
without pretending that every repository carries the same depth of benchmark,
scenario, and maintainer-host-review evidence.

The canonical evidence family is still:

- `ni/labview-icon-editor`
- `ni/actor-framework`
- same-name GitHub forks of those upstream repos
- governed retained local fixture clones of those same upstream repos

The current deeper governance is narrower still:

- active review scenarios remain modeled only for the canonical
  `ni/labview-icon-editor` upstream
- the retained deep benchmark and maintainer-owned host review lanes remain
  governed only for the canonical `ni/labview-icon-editor` upstream

Earlier bounded-family fail-closed behavior was truthful about evidence depth
but too restrictive as a product boundary. It prevented extension use on
arbitrary repos even when the extension could still provide chronology,
comparison, dashboard, and decision-support value there.

## Decision

The extension shall adopt repo-agnostic support with separate governance depth.

1. The live VI History model shall classify the current repository into one of:
   - governed upstream
   - governed-family fork
   - generic repository
2. The support policy shall normalize canonical GitHub remotes across HTTPS and
   SSH forms so upstream proof does not silently disappear because of a remote
   spelling difference, and it shall also recognize governed retained local
   fixture clones of those upstreams when their remotes are bundle-backed local
   paths instead of GitHub URLs.
3. Core compare, dashboard, and decision-record surfaces remain available on
   generic repositories instead of failing closed solely because the repo is
   outside the canonical evidence family.
4. The panel shall surface the repo classification and the deeper-governance
   boundary explicitly so generic repositories do not masquerade as carrying
   canonical benchmark or maintainer-review proof.
5. When no repo-specific review scenario exists, the decision-record flow shall
   synthesize the generic active `SCENARIO-VHS-ANY` scenario rather than fail
   closed on missing scenario modeling alone.
6. Canonical benchmark ownership and maintainer host-review evidence remain
   separately governed and deeper on the canonical evidence family than on
   generic repositories.

## Consequences

Positive:

- product claims stay aligned with real proof and benchmark evidence
- the UI stops implying that arbitrary repos are equally governed while still
  remaining usable there
- `ni/actor-framework` can enter scope without falsely inheriting every
  `labview-icon-editor` scenario or benchmark lane
- same-name GitHub forks stay reviewable without pretending they are certified
- canonical retained local fixture clones stay usable for governed review and
  benchmark flows even when their remotes point to local bundle paths instead
  of GitHub

Negative:

- docs, UI text, and tests must distinguish “supported for use” from “deeply
  governed by retained benchmark and human-review evidence”
- the repo now carries one more governed policy surface that must stay aligned
  with requirements and tests

## Follow-on

- add explicit repo-specific scenarios only when real proof and retained
  evidence justify them
- keep benchmark and human-review claims narrower than general extension
  availability until they are separately governed
