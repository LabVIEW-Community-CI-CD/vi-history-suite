# Release Publication State

This state surface separates GitLab authority truth from downstream publication
truth. GitLab owns protected `develop`, protected `main`, exact tags, CI gates,
release artifacts, the release manifest, and checksum evidence. Public GitHub is
the downstream source/release distribution mirror. VS Code Marketplace is the
final installed-user distribution surface.

## Current State

- Authority system: GitLab
- Authority exact tag: `v1.3.8`
- Authority `main`: `1ceddb3fd63c79c312d9abf41cfa08681cb51f94`
- GitLab release manifest:
  `.cache/gitlab-release-artifacts/v1.3.8/expanded/release-evidence/release-manifest.json`
- Expected VSIX: `vi-history-suite-1.3.8.vsix`
- Expected checksum: `vi-history-suite-1.3.8.vsix.sha256`
- Expected VSIX SHA-256:
  `d365f27836ada8a5279dedfc9fbfc7a86067da560f86324a5b9cdb9279e8f5e2`

## Public GitHub State

- Public GitHub `main`: `4f5f6162bb0f6609eb51f7505ad4321a827b0ec7`
- Public GitHub tag: `v1.3.8`
- Public GitHub release id: `312768592`
- Public GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.8`
- Public GitHub release status: published, immutable, zero assets
- Asset status: `externally-blocked-zero-assets`

## Marketplace State

- Marketplace item: `svelderrainruiz.vi-history-suite`
- Current Marketplace version: `1.3.7`
- Expected version for the blocked authority exact line: `1.3.8`
- Marketplace status: blocked until a complete public GitHub exact release is
  verified.

## Incident Classification

- Incident id: `PUBLICATION-INCIDENT-v1.3.8-IMMUTABLE-ZERO-ASSETS`
- Class: `externally-blocked-publication`
- Blocker code: `published-immutable-release-assets-incomplete`
- Summary: public GitHub release `312768592` for `v1.3.8` is already published
  and immutable with zero assets, so the exact VSIX and checksum cannot be
  uploaded after publication.
- Repair rule: do not attempt in-place asset upload; retain the incident and
  require the next exact release line to use the asset-first publisher.

## Publication Rule

Future public GitHub exact-release publication must be asset-first:

1. Resolve the GitLab authority tag and release manifest.
2. Create a GitHub draft release for the selected exact tag.
3. Upload the VSIX and checksum assets from GitLab authority evidence.
4. Read the draft release back by id.
5. Verify asset names, nonzero sizes, VSIX SHA-256, checksum content, and
   manifest alignment.
6. Publish the draft only after verification passes.

No VS Code Marketplace publication is admitted until the public GitHub exact
release verifies complete.
