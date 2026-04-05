# ADR-0017: Bounded Repo-Family Support

- Status: Accepted
- Date: 2026-04-04

## Context

`vi-history-suite` has real proof, benchmark, and human-review evidence only on
bounded open-source LabVIEW history surfaces. Pretending the extension is
equally governed for arbitrary Git repositories would overstate what the
program has actually characterized.

The current truthful repo family is:

- `ni/labview-icon-editor`
- `ni/actor-framework`
- same-name GitHub forks of those upstream repos
- governed retained local fixture clones of those same upstream repos

The current deeper governance is even narrower:

- active review scenarios remain modeled only for the canonical
  `ni/labview-icon-editor` upstream
- the retained deep benchmark and maintainer-owned host review lanes remain
  governed only for the canonical `ni/labview-icon-editor` upstream

## Decision

The extension shall adopt a bounded repo-family support policy.

1. The live VI History model shall classify the current repository into one of:
   - governed upstream
   - governed-family fork
   - unsupported outside the governed repo family
2. The support policy shall normalize canonical GitHub remotes across HTTPS and
   SSH forms so upstream proof does not silently disappear because of a remote
   spelling difference, and it shall also recognize governed retained local
   fixture clones of those upstreams when their remotes are bundle-backed local
   paths instead of GitHub URLs.
3. Core compare and dashboard surfaces remain available only inside the bounded
   repo family.
4. Unsupported repos may still open the chronology surface, but review actions
   must fail closed and the panel must say so explicitly.
5. Decision-record, benchmark, and maintainer host-review lanes remain narrower
   than the repo-family scope and are enabled only where separately governed.

## Consequences

Positive:

- product claims stay aligned with real proof and benchmark evidence
- the UI stops implying that arbitrary repos are equally governed
- `ni/actor-framework` can enter scope without falsely inheriting every
  `labview-icon-editor` scenario or benchmark lane
- same-name GitHub forks stay reviewable without pretending they are certified
- canonical retained local fixture clones stay usable for governed review and
  benchmark flows even when their remotes point to local bundle paths instead
  of GitHub

Negative:

- some previously reachable actions now fail closed outside the governed repo
  family
- the repo now carries one more governed policy surface that must stay aligned
  with requirements and tests

## Follow-on

- add explicit Actor Framework scenarios only after real proof and retained
  evidence exist
- keep benchmark and human-review claims narrower than family membership until
  they are separately governed
