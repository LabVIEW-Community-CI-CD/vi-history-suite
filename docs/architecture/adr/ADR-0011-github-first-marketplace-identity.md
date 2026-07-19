# ADR-0011: GitHub-First Marketplace Identity

- Status: Accepted
- Date: 2026-07-19

> This ADR records the retained design for Marketplace identity and public
> source metadata under system requirement VHS-SYS-REQ-011 (GitHub-First Source
> Authority). The requirements package holds the authoritative text; this is the
> design record.

## Context

The extension moved its source to the LabVIEW Community CI/CD GitHub
organization while keeping a stable public Marketplace identity. Users and
tooling must be able to trust that the Marketplace listing, install command, and
source/support links agree and point at the current authority.

## Decision

Keep a **stable Marketplace identity with GitHub as source authority**: the
published identity (`svelderrainruiz.vi-history-suite`) is preserved, and the
public source metadata (repository, support, and links) resolves to the org
repository. Disagreements are captured in the onboarding tracker rather than
silently drifting.

## Consequences

- Existing installs and links remain valid across the source move.
- Source, issues, and support consistently resolve to the GitHub org authority
  (see ADR-0001 for the broader GitHub-first governance decision).

## Requirements recorded

VHS-SYS-REQ-011; VHS-REQ-600.
