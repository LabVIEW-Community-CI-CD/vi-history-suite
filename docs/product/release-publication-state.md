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
- Preview state role: retained provider-lane packet evidence
- Develop head tracking policy: do not persist the latest live `develop`
  commit or pipeline in this packet. Read live `develop` head and pipeline
  state from GitLab when that operational status is needed.
- Retained preview packet:
  `docs/product/linux-docker-provider-lane-release-control-packet-2026-04-26.md`
- Retained preview packet JSON:
  `docs/product/linux-docker-provider-lane-release-control-packet-2026-04-26.json`
- Preview evidence commit:
  `21774a91710b71c6b63629cc0cf3cf37ce9abc0a`
- Packet evidence pipeline: `2480195741` / `success`
- Packet merge tracking policy: do not retain a moving packet-merge commit in
  this state surface; packet retention is governed by Git history and CI.
- Preview VSIX evidence:
  `preview-evidence/vi-history-suite-1.3.10.vsix`
- Preview VSIX SHA-256:
  `bbe08e60d3d9a0275e5f734b002d115e648ab1a75b5b2641f34d7cf9f33a2c02`
- Linux Docker provider evidence:
  `npm run linux:docker:provider:lane` / GitLab
  `linux_docker_provider_lane` job `14091891709`, retaining
  `linux-docker-provider-lane-evidence/` with schema
  `vi-history-suite/linux-docker-provider-lane@v1`
- Linux Docker provider validated facts: Docker OSType `linux`, persisted
  `docker` / `2026` / `x64` settings through `vihs`,
  `runtimeValidationOutcome=ready`, `runtimeProvider=linux-container`,
  `runtimeEngine=labview-cli`, and `runtimeBlockedReason=<none>`
- Preview publication state: develop provider-lane evidence only
- Windows proof state: Windows installed-user LabVIEW proof community/deferred
- Public GitHub mutation: not performed by this packet
- VS Code Marketplace mutation: not performed by this packet

## Public GitHub State

- Public GitHub `main`: `b56fde158fe151a736fe72c833efdfd0874d8537`
- Public GitHub tag: `v1.3.9`
- Public GitHub release id: `312994104`
- Public GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.9`
- Public GitHub release status: published, immutable, exact assets retained
- Asset status: `published-complete`
- Public GitHub source status: community-validation intake facade published on
  `b56fde1`; exact release tag `v1.3.9` remains retained separately at
  `fb0ef2b`

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
- Community-validation intake packet:
  `docs/product/marketplace-community-validation-intake-v1.3.10.md`
- Community-validation intake packet JSON:
  `docs/product/marketplace-community-validation-intake-v1.3.10.json`
- Prepared public issue template source:
  `public-github-source/.github/ISSUE_TEMPLATE/community-validation-windows-labview.yml`
- Prepared public label manifest:
  `public-github-source/.github/labels.yml`
- Public GitHub intake promotion plan:
  `docs/product/public-github-community-validation-intake-promotion-plan-v1.3.10.md`
- Public GitHub intake promotion plan JSON:
  `docs/product/public-github-community-validation-intake-promotion-plan-v1.3.10.json`
- Public GitHub intake promotion state: published and verified on public
  `main` commit `b56fde1`
- Public GitHub intake publication PR:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/45`
- Public GitHub intake labels: applied and verified
- Public GitHub intake mutation: performed after explicit
  `publish the public intake now`
- Public GitHub release/tag mutation: not performed by the intake publication
- Public GitHub wiki mutation: not performed by the intake publication
- Public GitHub mutation by community-validation preview publication:
  Marketplace preview publication itself did not mutate public GitHub; the
  later public intake publication is recorded separately here
- VS Code Marketplace mutation: published community-validation preview

## Exact Release Readiness Assessment

- Current assessment:
  `docs/product/exact-release-readiness-assessment-2026-04-26.md`
- Current assessment JSON:
  `docs/product/exact-release-readiness-assessment-2026-04-26.json`
- Assessed branch: `develop`
- Assessed commit:
  `42d1f581874c9fad8f6dcbc96c8827bb07e3b508`
- Assessed pipeline: `2480212103` / `success`
- Candidate package version: `1.3.10`
- Exact-release readiness: blocked
- Current admissible claim: Linux/Docker validated preview only
- Blocking reason:
  missing native Windows installed-user LabVIEW proof for `1.3.10`
- Windows installed-user LabVIEW proof state: community/deferred
- Preview VSIX evidence:
  `preview-evidence/vi-history-suite-1.3.10.vsix`
- Preview VSIX SHA-256:
  `f516b8ebec261c854e9e6d048a92ce8cb6f67a04114b9da945b916e37b0621a6`
- Public GitHub exact mutation: not admitted and not performed
- VS Code Marketplace exact mutation: not admitted and not performed
- Community proof intake checklist:
  `docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.md`
- Community proof intake checklist JSON:
  `docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.json`
- Exact candidate conversion paths:
  Windows-proof claim with admitted Windows/LabVIEW receipts, or
  community-deferred claim with no Windows installed-user proof claim

The current `develop` line is healthy as a Linux/Docker validated preview and
community-validation package line. It is not ready for exact-release promotion
until the missing Windows installed-user LabVIEW proof for the selected exact
VSIX is retained or the exact release claim is explicitly narrowed and
re-governed.

## Windows/LabVIEW Community Proof Intake Checklist

- Status: prepared, no mutation
- Checklist:
  `docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.md`
- Checklist JSON:
  `docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.json`
- Prepared from `develop` commit:
  `3c0404a5cc51f3e131dfb29474fb36a338aec4ec`
- Source readiness assessment:
  `docs/product/exact-release-readiness-assessment-2026-04-26.md`
- Source assessed pipeline: `2480212103` / `success`
- Candidate package version: `1.3.10`
- Proof-status ladder:
  `community-reported`, `intake-complete`, `needs-more-evidence`,
  `maintainer-reproduction-pending`, `maintainer-reproduced`,
  `admitted-proof`, `deferred-no-host`, and
  `rejected-insufficient-evidence`
- Community reports become maintainer proof automatically: false
- Linux/Docker proof may prove Windows/LabVIEW installed-user behavior: false
- Public GitHub mutation: not performed
- VS Code Marketplace mutation: not performed

The checklist is the intake path for turning the blocked assessment into a
later admissible exact-release candidate decision. It keeps the crowd-testing
model alive while requiring the exact release claim to choose one of two
truthful paths: retain admitted Windows/LabVIEW proof before making a Windows
claim, or narrow the exact release claim so Windows/LabVIEW remains selectable
with community/deferred proof status.

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
