# ADR-0039: GitLab Authority And Asset-First Public GitHub Release Publication

## Status

Accepted.

## Context

GitLab is the authority plane for `vi-history-suite`: protected `develop`,
protected `main`, exact tags, CI gates, release artifacts, release manifest,
checksum, and release evidence originate there. Public GitHub is a downstream
distribution mirror, and VS Code Marketplace is the final installed-user
distribution surface.

Public GitHub release `312768592` for `v1.3.8` was published while immutable and
with zero assets. GitHub then rejected asset upload with
`422 Cannot upload assets to an immutable release`. That made `v1.3.8`
externally blocked as a Marketplace source, even though the GitLab authority
tag and public GitHub source/tag existed.

## Decision

The repo shall govern public GitHub exact release publication as an asset-first
transaction sourced from GitLab authority artifacts.

The mutating GitHub publish path must:

1. Require an explicit `--tag vX.Y.Z`.
2. Resolve the GitLab authority release manifest, VSIX, and checksum for that
   selected tag.
3. Create a GitHub draft release when no release exists.
4. Upload the exact VSIX and checksum assets to the draft.
5. Read the draft back by release id.
6. Verify asset names, nonzero sizes, VSIX SHA-256, checksum content, and
   manifest alignment before publication.
7. Publish the draft only after that verification passes.

An existing draft may be repaired before publication. A published immutable
release with missing or mismatched assets is externally blocked and shall not be
mutated. VS Code Marketplace publication remains blocked until the public
GitHub exact release is verified complete.

## Consequences

- GitLab remains the source of truth for release evidence.
- Public GitHub release creation becomes a controlled downstream transaction
  instead of manual release choreography.
- A future empty immutable GitHub release is caught before publication.
- Marketplace publication cannot proceed from a public GitHub release that lacks
  verified exact assets.
- Historical incident values such as `v1.3.8` and release `312768592` may
  appear in incident ledgers, but reusable code and tests must be parameterized.
