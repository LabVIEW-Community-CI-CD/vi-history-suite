# ADR-0009: Pair Archive And Concentration Packet For Dashboard Review

## Status

Accepted

## Context

The pairwise comparison-report subsystem currently produces one retained packet
for a selected/base pair and one governed NI output path. That is sufficient
for one comparison, but it is not sufficient for a multi-report developer
dashboard.

If the product is meant to concentrate multiple VI Comparison Reports across a
commit window, it needs a retained source set that does not get overwritten by
later pair generations for the same VI.

## Decision

The dashboard program will use a pair-archive layer in addition to the mutable
current pairwise packet path.

That means:

- every generated pairwise comparison-report attempt is archived by
  `reportType + baseHash + selectedHash`
- the archive retains packet HTML, metadata, runtime artifacts, and copied
  report assets when they exist
- the multi-report dashboard is built from that retained pair archive, not from
  the single mutable current-pair report directory
- the dashboard persists its own concentrated JSON and HTML packet separately
  from the pair archive
- dashboard entries retain provider provenance from the archived packet so
  mixed-provider commit windows remain reviewable without ambiguity
- the concentrated dashboard is expected to preserve drill-down into archived
  packet/report/metadata/source-record artifacts rather than forcing a reviewer
  back to filesystem spelunking

## Consequences

Positive:

- multiple pairwise reports can coexist for one VI without overwriting
- the dashboard can concentrate successful, failed, blocked, and missing pair
  facts in one review surface
- the pair archive becomes a durable evidence layer for future drill-down and
  human review records

Tradeoffs:

- storage usage increases because packet/report/runtime artifacts are retained
  per pair
- the report subsystem now has two evidence layers:
  - mutable current pair packet
  - retained pair archive for dashboard concentration
- future cleanup and retention policy will need to be explicit

## Follow-On Work

- activate `TRANCHE-006` around the retained dashboard packet
- add dashboard smoke coverage once multiple real pair archives can be produced
- add drill-down actions from the dashboard into raw archived packet/report
  artifacts
- add runtime-doctor and provider-choice guidance once dashboard refresh and
  mixed-provider contribution are live
