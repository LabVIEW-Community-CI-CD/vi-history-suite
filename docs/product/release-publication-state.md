# Release Publication State

This state surface separates GitLab authority truth from downstream publication
truth. GitLab owns protected `develop`, protected `main`, exact tags, CI gates,
release artifacts, the release manifest, and checksum evidence. Public GitHub is
the downstream source/release distribution mirror. VS Code Marketplace is the
final installed-user distribution surface.

## Current State

- Authority system: GitLab
- Authority exact tag: `v1.3.9`
- Authority `main`: `2f86063a35926fa67963af5ccd47e971157927c6`
- GitLab release manifest:
  `.cache/gitlab-release-artifacts/v1.3.9/expanded/release-evidence/release-manifest.json`
- Expected VSIX: `vi-history-suite-1.3.9.vsix`
- Expected checksum: `vi-history-suite-1.3.9.vsix.sha256`
- Expected VSIX SHA-256:
  `62c48a2ccdde3557680280a458bff52f2720541673b5a2dc2158f4f35addc353`
- Active candidate release branch: none
- Active candidate tag: none
- Active candidate package version: `1.3.9`

## Public GitHub State

- Public GitHub `main`: `fb0ef2b5342c230d5372e61859dd0fca3dbc0b6a`
- Public GitHub tag: `v1.3.9`
- Public GitHub release id: `312994104`
- Public GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.9`
- Public GitHub release status: published, immutable, exact assets retained
- Asset status: `published-complete`

## Marketplace State

- Marketplace item: `svelderrainruiz.vi-history-suite`
- Current Marketplace version: `1.3.9`
- Expected version for the active governed candidate line: `1.3.9`
- Marketplace status: published and verified on `1.3.9`.
- Windows exact-VSIX install proof package script:
  `npm run vscode:marketplace:install-proof`
- Windows exact-VSIX install proof receipt:
  `.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json`
- Windows exact-VSIX install proof status: passed for `v1.3.9` with
  `runtimeValidationOutcome=ready`, launcher PATH stripped to the isolated
  launcher root plus `System32`, and no ambient Node requirement.

## Incident Classification

- Incident id: `PUBLICATION-INCIDENT-v1.3.8-IMMUTABLE-ZERO-ASSETS`
- Incident status: `retained-history`
- Class: `externally-blocked-publication`
- Blocker code: `published-immutable-release-assets-incomplete`
- Summary: public GitHub release `312768592` for `v1.3.8` is already published
  and immutable with zero assets, so the exact VSIX and checksum could not be
  uploaded after publication; retain this only as blocked historical incident
  evidence while `v1.3.9` remains the fully closed exact line.
- Repair rule: do not attempt in-place asset upload; require the next exact
  release line to use the asset-first publisher.

## Next Admitted Action

- Governed next line: none
- Next admitted action:
  `normal-next-line-governance-after-v1.3.9-retention`

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
release verifies complete; `v1.3.9` is the first retained exact line that
closed that asset-first path end to end.

Before any future mutating VS Code Marketplace publication act, the exact
authority VSIX must also pass the retained Windows isolated install proof by
installing into isolated VS Code user-data/extensions roots and running bare
`vihs` plus `vihs --validate` successfully.
