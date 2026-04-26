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
- Active candidate package version: `1.3.10`
- Active candidate state: Marketplace community-validation preview line

## Develop Preview State

- Active develop preview claim: Linux/Docker validated preview
- Preview state role: retained preview packet evidence
- Develop head tracking policy: do not persist the latest live `develop`
  commit or pipeline in this packet. Read live `develop` head and pipeline
  state from GitLab when that operational status is needed.
- Retained preview packet:
  `docs/product/linux-docker-preview-release-control-packet-2026-04-25.md`
- Retained preview packet JSON:
  `docs/product/linux-docker-preview-release-control-packet-2026-04-25.json`
- Preview evidence commit:
  `5c85f0595065d62d4b2679a3df4bb21ba749d71a`
- Packet evidence pipeline: `2479854355` / `success`
- Retained packet merge commit:
  `ebaf84eab1d779d607f4dcb6e58e990d2946779f`
- Retained packet merge pipeline: `2479875767` / `success`
- Preview VSIX evidence:
  `preview-evidence/vi-history-suite-1.3.9.vsix`
- Preview VSIX SHA-256:
  `7179df117c5b3c9032afbacb0b7c4a24f81229f3fbc0fd99f3ac0ed66a4c7470`
- Preview publication state: non-production integration evidence only
- Windows proof state: Windows installed-user proof deferred
- Public GitHub mutation: not admitted by this preview claim
- VS Code Marketplace mutation: not admitted by this preview claim

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
- Current Marketplace version: `1.3.10`
- Current Marketplace publication kind: community-validation pre-release
- Current regular Marketplace version: `1.3.9`
- Current pre-release Marketplace version: `1.3.10`
- Current pre-release last updated: `2026-04-26T00:05:09.09Z`
- Expected version for the active governed candidate line: `1.3.9`
- Marketplace status: community-validation preview published and verified on
  `1.3.10`, while regular exact release `1.3.9` remains retained.
- Windows exact-VSIX install proof package script:
  `npm run vscode:marketplace:install-proof`
- Windows exact-VSIX install proof receipt:
  `.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json`
- Windows exact-VSIX install proof status: passed for `v1.3.9` with
  `runtimeValidationOutcome=ready`, launcher PATH stripped to the isolated
  launcher root plus `System32`, and no ambient Node requirement.

## Marketplace Community-Validation Preview Path

- Status: published and verified
- Publication claim: community-validation preview
- Target preview version: `1.3.10`
- Published preview version: `1.3.10`
- Preview publication date: `2026-04-25`
- Marketplace last updated: `2026-04-26T00:05:09.09Z`
- Preview VSIX path:
  `preview-evidence/vi-history-suite-1.3.10.vsix`
- Preview VSIX SHA-256:
  `da09af0d288db60870c1a8125667303c710159c80c06ff2deda02a76e5085705`
- Prep package script:
  `npm run vscode:marketplace:community-preview:prepare`
- Prep receipt:
  `.cache/vscode-marketplace-community-validation-preview-prep/latest/vscode-marketplace-community-validation-preview-prep.json`
- Preferred Marketplace mode: VS Code Marketplace pre-release through pinned
  `vsce --pre-release`
- Target version policy: the preview target must use a distinct higher
  `major.minor.patch` Marketplace version than the currently published
  `1.3.9`; the current `1.3.9` package line cannot be republished as a
  preview.
- Publish trigger: user said `publish it now`
- Active evidence claim: Linux/Docker validated preview
- Windows installed-user proof: deferred and not claimed by this preview path
- Windows/LabVIEW feature policy: provider, year, and bitness choices may stay
  selectable when the UI/CLI discloses proof status through `vihs --validate`
  and the traceability matrix.
- Traceability matrix:
  `docs/requirements/rtm.csv`
- Public GitHub mutation: not mutated by community-validation preview
  publication
- VS Code Marketplace mutation: published community-validation preview

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

The community-validation preview path is separate from the exact-release
Marketplace gate. It may publish a Marketplace pre-release package for broader
installed-user validation with Windows proof disclosed as deferred after the
separate `publish it now` instruction is present and the target package
version is distinct from the live Marketplace version. Public GitHub source
and release publication are not required for this community-validation preview
act.
