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
- Active candidate tag: `v1.3.12-public-validation-prerelease`
- Active candidate package version: `1.3.12`
- Active candidate state: public validation pre-release published and verified

## Develop Preview State

- Active develop preview claim: Linux/Docker and Linux host LabVIEW validated
  preview
- Preview state role: retained provider-lane and Linux host packet evidence
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
- Linux host LabVIEW 2026 evidence:
  `docs/product/benchmark-packets/HARNESS-VHS-002-linux-host-labview-2026-create-comparison-proof-2026-04-26.md`
- Linux host LabVIEW 2026 evidence JSON:
  `docs/product/benchmark-packets/HARNESS-VHS-002-linux-host-labview-2026-create-comparison-proof-2026-04-26.json`
- Linux host LabVIEW 2026 traceability: `VHS-REQ-588`
- Linux host validated facts: Ubuntu `25.10`, LabVIEW Community
  `2026` / `x64`, `runtimeValidationOutcome=ready`,
  `runtimeProvider=host-native`, `runtimeEngine=labview-cli`,
  `runtimeBlockedReason=<none>`, and `VIHS_OK`
- Linux host LabVIEW executable:
  `/usr/local/natinst/LabVIEW-2026-64/labview`
- Linux host canonical fixture:
  `https://github.com/ni/labview-icon-editor` `resource/plugins/lv_icon.vi`
  from `ab94f6c4b375062492036c63a6dab7ea8824748a` to
  `8741bb08026c104100720c0ef48621e4ab7762fd`
- Linux host compare proof: `LabVIEWCLI CreateComparisonReport` exited `0`,
  generated `diff-report-lv_icon.vi.html`, retained report size `214412`
  bytes, and logged `CreateComparisonReport operation succeeded.`
- Linux host compatibility fixes retained: installed `libglu1-mesa` and
  cleared the executable-stack marking on
  `/usr/local/lib64/LabVIEW-2026-64/liblvrt.so.26.1.1`
- Preview publication state: develop provider-lane and Linux host LabVIEW
  evidence only
- Linux host proof state: admitted local maintainer proof
- Windows proof state: Windows installed-user LabVIEW proof community/deferred
- Linux host proof may prove Windows installed-user LabVIEW behavior: no
- Public GitHub mutation: not performed by this packet
- VS Code Marketplace mutation: not performed by this packet

## Public GitHub State

- Public GitHub `main`: `ce6dbd0b1b5783f7015b9d0589f3803636564789`
- Public GitHub tag: `v1.3.9`
- Public GitHub release id: `312994104`
- Public GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.9`
- Public GitHub release status: published, immutable, exact assets retained
- Asset status: `published-complete`
- Public GitHub source status: current public `main` publishes
  `ce6dbd0b1b5783f7015b9d0589f3803636564789` after public PR #60 promoted the
  canonical Docker fixture docs; the earlier community-validation intake facade
  remains retained at `b56fde1`, and exact release tag `v1.3.9` remains
  retained separately at `fb0ef2b`
- Public validation source status: `1.3.11` facade published through public
  PR #46, then canonical fixture docs promoted through public PR #60
- Public validation facade closeout PR:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/60`
- Public validation facade closeout checks:
  Public Source Package Preview `24965599550` / success, Public Windows
  Installed-User Contract `24965599548` / success, and Public Linux
  Installed-User Smoke `24965599557` / success
- Public validation facade closeout Marketplace mutation: not performed
- Public validation pre-release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.11-public-validation`
- Public validation release id: `313782074`
- Public validation asset status: published complete with VSIX and checksum
- Public validation release tag: `v1.3.11-public-validation`
- Nominal package tag: `v1.3.11`; GitHub retained that exact tag name after an
  immediately deleted zero-asset immutable release attempt, so the asset-bearing
  public validation release uses `v1.3.11-public-validation`.

## Marketplace State

- Marketplace item: `svelderrainruiz.vi-history-suite`
- Current Marketplace version: `1.3.12`
- Current Marketplace publication kind: public-validation pre-release
- Current regular Marketplace version: `1.3.9`
- Current pre-release Marketplace version: `1.3.12`
- Current pre-release last updated: `2026-04-27T00:36:15.800Z`
- Expected exact-candidate version for the active governed candidate line:
  `1.3.12`
- Marketplace status: public validation pre-release `1.3.12` published and
  verified through pinned `vsce --pre-release` and official gallery readback.
- Windows exact-VSIX install proof package script:
  `npm run vscode:marketplace:install-proof`
- Windows exact-VSIX install proof receipt:
  `.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json`
- Windows exact-VSIX install proof status: passed for `v1.3.9` with
  `runtimeValidationOutcome=ready`, launcher PATH stripped to the isolated
  launcher root plus `System32`, and no ambient Node requirement.

## Marketplace Community-Validation Preview Path

- Status: published and verified
- Publication claim: public validation pre-release
- Target preview version: `1.3.12`
- Published preview version: `1.3.12`
- Preview publication date: `2026-04-27`
- Marketplace last updated: `2026-04-27T00:36:15.800Z`
- Preview VSIX path:
  `preview-evidence/vi-history-suite-1.3.12.vsix`
- Preview VSIX SHA-256:
  `e0d72bc198756d0f3302779830fc4e187d4bc63818769ffedaedaffb23d4dc25`
- Prep package script:
  `npm run vscode:marketplace:community-preview:prepare`
- Prep receipt:
  `.cache/vscode-marketplace-community-validation-preview-prep/latest/vscode-marketplace-community-validation-preview-prep.json`
- Preferred Marketplace mode: VS Code Marketplace pre-release through pinned
  `vsce --pre-release`
- Target version policy: the preview target must use a distinct higher
  `major.minor.patch` Marketplace version than the currently published
  `1.3.11`; the current `1.3.11` package line cannot be republished as a
  preview.
- Publish trigger: maintainer authorized public GitHub and Marketplace public
  validation publication for `1.3.12` after GitLab authority is green
- Active evidence claim: Linux/Docker and Linux host LabVIEW validated preview
- Windows installed-user proof: community/deferred and not claimed as current
  `1.3.12` proof
- Windows/LabVIEW feature policy: all provider, year, and bitness choices may
  stay selectable when the UI/CLI discloses proof status through stable
  `VIHS_E_*` runtime codes, `vihs --validate --proof-out ./vihs-proof`,
  `vihs validate-fixture --proof-out ./vihs-fixture-proof`, and the
  traceability matrix.
- Traceability matrix:
  `docs/requirements/rtm.csv`
- Public validation packet:
  `docs/product/public-validation-prerelease-v1.3.12.md`
- Public validation packet JSON:
  `docs/product/public-validation-prerelease-v1.3.12.json`
- Prepared public issue template source:
  `public-github-source/.github/ISSUE_TEMPLATE/community-validation-windows-labview.yml`
- Prepared public label manifest:
  `public-github-source/.github/labels.yml`
- Public GitHub intake promotion plan: superseded by the `1.3.11` public
  validation lane packet
- Public GitHub intake promotion state: published and verified through public
  PR #46
- Latest public GitHub facade docs promotion: published and verified through
  public PR #60 on `ce6dbd0b1b5783f7015b9d0589f3803636564789`
- Public GitHub intake labels: applied
- Public GitHub intake mutation: performed through protected public PR #46
- Public GitHub release/tag mutation: published and verified as
  `v1.3.12-public-validation-prerelease`
- Public GitHub wiki mutation: not in scope for this lane
- VS Code Marketplace mutation: published and verified

## Public Validation Pre-Release 1.3.12

- Status: published and verified
- Packet:
  `docs/product/public-validation-prerelease-v1.3.12.md`
- Packet JSON:
  `docs/product/public-validation-prerelease-v1.3.12.json`
- Public GitHub release target: `v1.3.12-public-validation-prerelease`
- Marketplace target: `1.3.12` pre-release, published and verified
- Public GitHub PR:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/63`
- Public GitHub main commit:
  `1853a4332eff40665e30db6e632febaa9821cf98`
- Corrected public GitHub release id: `313840265`
- Superseded immutable public GitHub release:
  `v1.3.12-public-validation` / `313840031`
- Corrected VSIX SHA-256:
  `e0d72bc198756d0f3302779830fc4e187d4bc63818769ffedaedaffb23d4dc25`
- Executable canonical fixture command:
  `vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out ./vihs-fixture-proof`
- Linux host canonical fixture command:
  `vihs validate-fixture --provider host --labview-version 2026 --labview-bitness x64 --proof-out ./vihs-fixture-proof`
- Retained Linux/Docker `validate-fixture` proof:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-docker-2026-v1.3.12-2026-04-27.md`
- Retained Linux/Docker `validate-fixture` proof JSON:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-docker-2026-v1.3.12-2026-04-27.json`
- Retained Linux host `validate-fixture` proof:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-host-2026-v1.3.12-2026-04-26.md`
- Retained Linux host `validate-fixture` proof JSON:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-host-2026-v1.3.12-2026-04-26.json`
- Windows installed-user LabVIEW proof: community/deferred
- Public `develop` branch sync: PR #64 was checked and mergeable, but closed
  because repository branch protection forbids merge commits; squash/rebase
  would not satisfy the ancestry requirement that public `develop` contain
  public `main`.

## Public Validation Pre-Release 1.3.11

- Status: published and verified
- Packet:
  `docs/product/public-validation-prerelease-v1.3.11.md`
- Packet JSON:
  `docs/product/public-validation-prerelease-v1.3.11.json`
- Authority branch: GitLab `develop`
- Authority merge commit: `129cfe1f40698a6efaf51845ba47cf2e101d0e7e`
- Authority develop pipeline: `2480723883` / success
- Public GitHub target: `github.com/svelderrainruiz/vi-history-suite`
- Public GitHub release target: `v1.3.11-public-validation` pre-release
  with `preview-evidence/vi-history-suite-1.3.11.vsix` and checksum assets
- Public GitHub release:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.11-public-validation`
- Public GitHub release id: `313782074`
- Public GitHub PR:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/46`
- Public GitHub current main commit:
  `ce6dbd0b1b5783f7015b9d0589f3803636564789`
- Public GitHub latest facade PR:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/60`
- VSIX SHA-256:
  `21a21f7638d5348274ef66a9e58e0ba8d58918b72937e1b8c2e104bc6a0136ff`
- Marketplace target: `svelderrainruiz.vi-history-suite` pre-release
  `1.3.11`
- Marketplace last updated: `2026-04-26T16:51:22.260Z`
- Selectable variant policy: all CLI variants remain selectable for validation
  reporting
- Runtime proof command:
  `vihs --validate --proof-out ./vihs-proof`
- Runtime proof files:
  `vihs-validation-proof.json`; `vihs-validation-issue.md`
- Windows installed-user LabVIEW proof: community/deferred
- Prior Windows x64 LabVIEW proof: retained confidence context, not the current
  `1.3.11` proof claim
- Canonical public Docker fixture: `https://github.com/ni/labview-icon-editor`
  `resource/plugins/lv_icon.vi`
- Canonical fixture commits:
  `ab94f6c4b375062492036c63a6dab7ea8824748a` to
  `8741bb08026c104100720c0ef48621e4ab7762fd`
- Canonical Docker battery: positive historical compare succeeded with
  `diff-report-lv_icon.vi.html` at about `112` seconds and `395 KB`;
  no-change compare succeeded at about `24.7` seconds; missing-file control
  blocked before Docker at `left-blob-read-failed`
- Canonical Docker image: `nationalinstruments/labview:2026q1-linux`; first
  uncached compare may pull about `1.4 GB`
- Canonical evidence issues:
  `https://github.com/svelderrainruiz/vi-history-suite/issues/48`,
  `https://github.com/svelderrainruiz/vi-history-suite/issues/49`, and
  `https://github.com/svelderrainruiz/vi-history-suite/issues/59`
- Closed docs/testability gaps: public issues `#55`, `#57`, `#58`, and `#59`
- Public facade docs promotion decision:
  completed through public PR #60 after the GitLab authority MR went green
- Public facade docs promotion post-merge checks:
  Public Source Package Preview `24965599550` / success, Public Windows
  Installed-User Contract `24965599548` / success, and Public Linux
  Installed-User Smoke `24965599557` / success
- Public GitHub mutation during the GitLab authority fixture-battery closeout:
  not performed; the later docs promotion was the separate public PR #60 act
- VS Code Marketplace mutation during the public facade docs promotion: not
  performed
- Exact-release gate blocked by missing Windows proof: false for this public
  validation lane
- Public GitHub and Marketplace mutation: performed for the scoped `1.3.11`
  public validation publication

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

## Exact Release Candidate Reassessment

- Status: prepared
- Reassessment:
  `docs/product/exact-release-candidate-reassessment-2026-04-26.md`
- Reassessment JSON:
  `docs/product/exact-release-candidate-reassessment-2026-04-26.json`
- Source branch: `develop`
- Source commit:
  `14243fd0ee647736124b06edb5a9947eae178d38`
- Source pipeline: `2480546719` / `success`
- Candidate package version: `1.3.10`
- Selected candidate path:
  `community-deferred-windows-labview-claim`
- Current admissible candidate claim:
  Linux/Docker validated exact-candidate source with Windows/LabVIEW
  selectable as community/deferred
- Release branch opening: admissible as next governed action
- Exact release branch: not opened by this reassessment
- Exact tag: not admitted
- Candidate source VSIX SHA-256:
  `afb9a78ccd4ef73f588deb8dbb0a73f1465431d3510db5d4a8a1b7a2f90b2783`
- Admitted external Windows proof arrived: false
- Public GitHub exact mutation: gated and not performed
- VS Code Marketplace exact mutation: gated and not performed

This reassessment does not replace release-branch proof. It only selects the
claim boundary that lets the next governed `release/1.3.10` branch open from
`14243fd` without making a Windows installed-user LabVIEW proof claim.

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

- Governed next line: collect and triage public community-validation reports
  for the published `1.3.12` public validation preview
- Next admitted action:
  `collect-community-validation-reports-and-triage-public-issues`

## Publication Rule

Future public GitHub exact-release publication must be asset-first:

1. Resolve the GitLab authority tag and release manifest.
2. Create a GitHub draft release for the selected exact tag.
3. Upload the VSIX and checksum assets from GitLab authority evidence.
4. Read the draft release back by id.
5. Verify asset names, nonzero sizes, VSIX SHA-256, checksum content, and
   manifest alignment.
6. Publish the draft only after verification passes.

No VS Code Marketplace exact-release publication is admitted until the public
GitHub exact release verifies complete; `v1.3.9` is the first retained exact
line that closed that asset-first path end to end.

Before any future mutating VS Code Marketplace exact-release act, the exact
authority VSIX must also pass the retained Windows isolated install proof by
installing into isolated VS Code user-data/extensions roots and running bare
`vihs` plus `vihs --validate` successfully.

The public validation pre-release path is separate from the exact-release
Marketplace gate. It may publish a Marketplace pre-release package and a public
GitHub pre-release with VSIX assets for broader installed-user validation with
Windows proof disclosed as community/deferred. The retained `1.3.11` public
validation lane is published and verified. For `1.3.12`, the maintainer has
authorized public GitHub and Marketplace mutation after GitLab authority is green;
exact-release promotion remains a separate later claim.
