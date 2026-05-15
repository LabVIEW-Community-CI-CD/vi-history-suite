# Release Publication State

This state surface separates GitLab authority truth from downstream publication
truth. GitLab owns protected `develop`, protected `main`, exact tags, CI gates,
release artifacts, the release manifest, and checksum evidence. Public GitHub is
the downstream source/release distribution mirror. VS Code Marketplace is the
final installed-user distribution surface.

## Current State

- Authority system: GitLab
- Fully closed authority exact tag: `v1.3.16`
- Fully closed authority `main`: `9c8e0a8503a84cba5d0ea722dd1497a35f52326c`
- Current authority exact tag: `v1.3.16`
- Current authority `main`: `9c8e0a8503a84cba5d0ea722dd1497a35f52326c`
- GitLab release manifest:
  `.cache/gitlab-release-artifacts/v1.3.16/expanded/release-evidence/release-manifest.json`
- Expected VSIX: `vi-history-suite-1.3.16.vsix`
- Expected checksum: `vi-history-suite-1.3.16.vsix.sha256`
- Expected VSIX SHA-256:
  `56bc9b222ec859f530ea523eed215b2efde4ce96fa9fcc4974f6589da3b81170`
- Active candidate release branch: none; retained release branches include
  `release/1.3.15` and `release/1.3.16`
- Active candidate tag: none
- Active candidate package version: none
- Active candidate state: exact `v1.3.16` is published across GitLab
  authority, public GitHub, and VS Code Marketplace; protected `main` has been
  merged into the closeout branch for protected `develop` retention

## Develop Preview State

- Active develop preview claim: Linux/Docker, Linux host LabVIEW, Windows host
  LabVIEW 2026 x64, and Vagrant Windows VSIX acceptance validated preview
- Preview state role: retained provider-lane, Linux host, Windows host, and
  Vagrant acceptance evidence
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
- Windows host LabVIEW 2026 evidence:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-windows-host-labview-2026-v1.3.12-2026-04-26.md`
- Windows host LabVIEW 2026 evidence JSON:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-windows-host-labview-2026-v1.3.12-2026-04-26.json`
- Windows host validated facts: Windows 11 VirtualBox installed-user VM,
  exact public `1.3.12` pre-release VSIX, `runtimeValidationOutcome=ready`,
  `runtimeProvider=host-native`, `runtimeEngine=labview-cli`, and `VIHS_OK`
- Windows host compare proof: `LabVIEWCLI CreateComparisonReport` exited `0`,
  generated `diff-report-lv_icon.vi.html`, retained report size `146915`
  bytes, and logged `CreateComparisonReport operation succeeded.`
- Vagrant Windows VSIX acceptance evidence:
  protected `develop` pipeline `2511040377` passed GitLab job `14284054131`
  (`vagrant_windows_vsix_acceptance`) after running
  `npm run vagrant:acceptance:assert`; the job retained
  `vagrant/evidence/assertion/vagrant-vsix-acceptance-assertion.json`,
  `vagrant/evidence/20260508-105809/manifest.json`,
  `vagrant/evidence/acceptance-provision.log`, and
  `vagrant/evidence/labview-cold-prep.log`.
- Vagrant Windows VSIX acceptance validated facts: assertion schema
  `vi-history-suite/vagrant-vsix-acceptance-assertion@v1`, manifest schema
  `vi-history-suite/vagrant-vsix-acceptance@v1`, `HARNESS-VHS-002`,
  selected hash `8741bb08026c104100720c0ef48621e4ab7762fd`, base hash
  `c188cdec606aac3b17d8b17274baa19eef3e4017`, LabVIEW `2026` / `x86`,
  `proofExitCode=0`, `runtimeProvider=host-native`,
  `runtimeEngine=labview-cli`, `runtimeExecutionState=succeeded`,
  `generatedReportExists=true`, and the cold-start markers
  `LabVIEW not running. Launching via scheduled task...` plus
  `LabVIEW VI Server ready on port 3363.`
- Preview publication state: develop provider-lane, Linux host LabVIEW, and
  Windows host LabVIEW plus Vagrant VSIX acceptance evidence
- Linux host proof state: admitted local maintainer proof
- Windows proof state: host LabVIEW 2026 x64 admitted; Docker Desktop
  Windows-container proof community/deferred
- Windows Docker Desktop intake:
  `docs/product/windows-docker-desktop-proof-intake-v1.3.13.md` keeps public
  issue #65 on the exact `vihs validate-fixture` command, Docker OSType
  `windows`, `runtimeProvider=windows-container`, and
  `generatedReportExists=true` before any community report can become retained
  proof
- Windows Docker Desktop public facade promotion:
  public PR #68 published the dedicated intake template and label to public
  `main` commit `220111eae3ac214e99f2233e2bfe6b320edf383d`; post-merge Public
  Source Package Preview `24977951913`, Public Windows Installed-User Contract
  `24977951923`, and Public Linux Installed-User Smoke `24977951904` all
  passed; Marketplace mutation was not performed
- Linux host proof may prove Windows installed-user LabVIEW behavior: no
- Public GitHub mutation: not performed by this packet
- VS Code Marketplace mutation: not performed by this packet

## Public GitHub State

- Public GitHub `main`: `12798e46f14d6cac14eaf7381bbb62cc5ee012db`
- Public GitHub tag: `v1.3.16`
- Public GitHub tag object:
  `f6ca389269dac140dc416d76bb4c2ac142664567`
- Public GitHub release id: `320824958`
- Public GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.16`
- Public GitHub release status: published, immutable, exact assets retained
- Asset status: `published-complete`
- Public GitHub source status: current public `main` publishes
  `12798e46f14d6cac14eaf7381bbb62cc5ee012db` after public PRs #93-#97
  adopted the Windows proof handoff, installed-user troubleshooting, runtime
  bitness UX, history-panel decluttering, and focused UX tests that follow PR
  #91's first-run local LabVIEW guide, PR #90's public intake-surface
  normalization, and PR #89's installed-user LabVIEW support matrix; exact
  `v1.3.16` remains retained at
  `f679023ed760963779d9331a9395128ad01c7e54` after public PR #88 promoted the
  source/authority handoff, the earlier `v1.3.14` source/tag handoff remains
  retained at public PR #69, the Windows Docker Desktop proof-intake template
  and label remain retained at public PR #68, the canonical Docker fixture docs
  remain retained at `ce6dbd0` through public PR #60, and the earlier
  community-validation intake facade remains retained at `b56fde1`
- Public validation source status: `1.3.11` facade published through public
  PR #46, canonical fixture docs promoted through public PR #60, and Windows
  Docker Desktop proof-intake promoted through public PR #68
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
- Latest public validation facade PR:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/67`
- Latest public validation facade checks: Public Source Package Preview,
  Public Windows Installed-User Contract, and Public Linux Installed-User Smoke
  all passed before merge.
- Latest public validation facade commit:
  `769cf180c1d5e94d1462d90e4e7366b1e050e7b1`
- Latest public validation corrected pre-release:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.13-public-validation-prerelease-1`

## Marketplace State

- Marketplace item: `svelderrainruiz.vi-history-suite`
- Current Marketplace version: `1.3.16`
- Current Marketplace publication kind: exact release
- Current regular Marketplace version: `1.3.16`
- Current regular Marketplace last updated: `2026-05-11T23:10:13.317Z`
- Current pre-release Marketplace version: `1.3.13`
- Current pre-release last updated: `2026-04-27T04:24:05.457Z`
- Expected exact-candidate version for the active governed candidate line:
  none
- Marketplace status: exact `1.3.16` is published and verified; public
  validation pre-release `1.3.13` remains retained as historical validation
  evidence.
- Windows exact-VSIX install proof package script:
  `npm run vscode:marketplace:install-proof`
- Windows exact-VSIX install proof receipt:
  `.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json`
- Windows exact-VSIX install proof status: passed for `v1.3.16` with
  `runtimeValidationOutcome=ready`, launcher PATH stripped to the isolated
  launcher root plus `System32`, and no ambient Node requirement.

## Marketplace Community-Validation Preview Path

- Status: published and verified
- Publication claim: public validation pre-release
- Target preview version: `1.3.13`
- Published preview version: `1.3.13`
- Preview publication date: `2026-04-27`
- Marketplace last updated: `2026-04-27T04:24:05.457Z`
- Preview VSIX path:
  `preview-evidence/vi-history-suite-1.3.13.vsix`
- Preview VSIX SHA-256:
  `3b1d83632b8126b597a9db8c98f2737fd988458ecf6c4d74e4f5c3349d16036f`
- Prep package script:
  `npm run vscode:marketplace:community-preview:prepare`
- Prep receipt:
  `.cache/vscode-marketplace-community-validation-preview-prep/latest/vscode-marketplace-community-validation-preview-prep.json`
- Preferred Marketplace mode: VS Code Marketplace pre-release through pinned
  `vsce --pre-release`
- Target version policy: the preview target must use a distinct higher
  `major.minor.patch` Marketplace version than the currently published
  `1.3.12`; the current `1.3.12` package line cannot be republished as a
  preview.
- Publish trigger: maintainer authorized public GitHub and Marketplace public
  validation publication for `1.3.13` after GitLab authority is green
- Active evidence claim: Linux/Docker, Linux host LabVIEW, Windows host
  LabVIEW 2026 x64, and Vagrant Windows VSIX acceptance validated preview
- Windows installed-user proof: admitted for host LabVIEW 2026 x64 from the
  retained Windows 11 VirtualBox proof; Windows Docker Desktop
  Windows-container proof remains community/deferred
- Windows/LabVIEW feature policy: all provider, year, and bitness choices may
  stay selectable when the UI/CLI discloses proof status through stable
  `VIHS_E_*` runtime codes, `vihs --validate --proof-out ./vihs-proof`,
  `vihs validate-fixture --proof-out ./vihs-fixture-proof`, and the
  traceability matrix.
- Traceability matrix:
  `docs/requirements/rtm.csv`
- Public validation packet:
  `docs/product/public-validation-prerelease-v1.3.13.md`
- Public validation packet JSON:
  `docs/product/public-validation-prerelease-v1.3.13.json`
- Prepared public issue template source:
  `public-github-source/.github/ISSUE_TEMPLATE/community-validation-windows-labview.yml`
- Prepared public label manifest:
  `public-github-source/.github/labels.yml`
- Public GitHub intake promotion plan: superseded by the `1.3.11` public
  validation lane packet
- Public GitHub intake promotion state: published and verified through public
  PR #46
- Latest public GitHub facade docs promotion: published and verified through
  public PR #67 on `769cf180c1d5e94d1462d90e4e7366b1e050e7b1`
- Public GitHub intake labels: applied
- Public GitHub intake mutation: performed through protected public PR #46
- Public GitHub release/tag mutation: published and verified through corrected
  asset release `v1.3.13-public-validation-prerelease-1`
- Public GitHub wiki mutation: not in scope for this lane
- VS Code Marketplace mutation: published and verified

## Public Validation Pre-Release 1.3.13

- Status: published and verified
- Packet:
  `docs/product/public-validation-prerelease-v1.3.13.md`
- Packet JSON:
  `docs/product/public-validation-prerelease-v1.3.13.json`
- Public GitHub release target: `v1.3.13-public-validation-prerelease-1`
- Marketplace target: `1.3.13` pre-release, published and verified
- Public GitHub PR:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/67`
- Public GitHub main commit:
  `769cf180c1d5e94d1462d90e4e7366b1e050e7b1`
- Corrected public GitHub release id: `313873748`
- Corrected VSIX SHA-256:
  `3b1d83632b8126b597a9db8c98f2737fd988458ecf6c4d74e4f5c3349d16036f`
- Superseded immutable public GitHub release:
  `v1.3.13-public-validation-prerelease` / `313873598`
- Superseded reason:
  the immutable public GitHub release asset was packaged without the VS Code
  pre-release marker; the corrected sibling release carries the Marketplace
  pre-release VSIX.
- Marketplace last updated:
  `2026-04-27T04:24:05.457Z`
- Purpose: publish the admitted Windows host LabVIEW 2026 x64 proof wording and
  the successful-run diagnostic-note fix to installed users
- Carried-forward admitted proof: Linux/Docker `2026` `x64`, Linux host
  LabVIEW `2026` `x64`, and Windows host LabVIEW `2026` `x64`
- Remaining deferred proof: Windows Docker Desktop Windows-container
  validation through public issue #65 and
  `docs/product/windows-docker-desktop-proof-intake-v1.3.13.md`
- Public facade intake promotion:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/68` merged to
  public `main` commit `220111eae3ac214e99f2233e2bfe6b320edf383d` with all
  post-merge public checks green and no Marketplace mutation
- Diagnostic-note fix:
  `src/reporting/comparisonReportRuntimeExecution.ts` with regression coverage
  in `tests/unit/comparisonReportRuntimeExecution.test.ts`

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
- Windows host canonical fixture command:
  `vihs validate-fixture --provider host --labview-version 2026 --labview-bitness x64 --proof-out .\vihs-fixture-proof`
- Retained Linux/Docker `validate-fixture` proof:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-docker-2026-v1.3.12-2026-04-27.md`
- Retained Linux/Docker `validate-fixture` proof JSON:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-docker-2026-v1.3.12-2026-04-27.json`
- Retained Linux host `validate-fixture` proof:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-host-2026-v1.3.12-2026-04-26.md`
- Retained Linux host `validate-fixture` proof JSON:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-host-2026-v1.3.12-2026-04-26.json`
- Retained Windows host `validate-fixture` proof:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-windows-host-labview-2026-v1.3.12-2026-04-26.md`
- Retained Windows host `validate-fixture` proof JSON:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-windows-host-labview-2026-v1.3.12-2026-04-26.json`
- Windows installed-user LabVIEW proof: admitted for host LabVIEW 2026 x64
- Windows Docker Desktop Windows-container proof: community/deferred
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
  `docs/product/exact-release-readiness-assessment-2026-05-08.md`
- Current assessment JSON:
  `docs/product/exact-release-readiness-assessment-2026-05-08.json`
- Superseded current assessment retained as historical input:
  `docs/product/exact-release-readiness-assessment-2026-04-26.md`
- Assessed branch: `develop`
- Assessed commit:
  `ce103d3d22a2d65e75dc6f5aaa75bc9e5e30c6a8`
- Assessed pipeline: `2511103937` / `success`
- Candidate package version: `1.3.14`
- Exact-release readiness: release branch opening admissible as a separate
  governed action
- Current admissible claim: `1.3.14` develop candidate evidence
  consolidated; exact publication not admitted
- Release branch: not opened by this assessment
- Exact tag: not admitted
- Windows installed-user LabVIEW proof state: admitted for host LabVIEW 2026
  x64
- Vagrant Windows VSIX acceptance: protected `develop` CI receipt retained in
  job `14284448828`
- Windows Docker Desktop Windows-container proof state: community/deferred
- Preview VSIX evidence:
  `preview-evidence/vi-history-suite-1.3.14.vsix`
- Preview VSIX SHA-256:
  `cc3f71882328dd9d1b096860bafd49a90b7a5b6fc0c3726e363121f304c85c0f`
- Preview VSIX size: `1011604` bytes
- Linux Docker provider lane job: `14284448827`
- Public exact pre-tag proof job: `14284448826`
- Preview package job: `14284448829`
- Public GitHub exact mutation: not admitted and not performed
- VS Code Marketplace exact mutation: not admitted and not performed
- `main` promotion: not admitted and not performed
- Community proof intake checklist:
  `docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.md`
- Community proof intake checklist JSON:
  `docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.json`
- Next exact candidate conversion path:
  the governed `release/1.3.14` branch opening has now been performed and
  release-branch readiness has been reassessed separately; promote the release
  branch to `main` only through a later protected governed action, then
  reassess exact-tag admission from the resulting green `main` commit before
  public exact release or Marketplace gates.

The current `develop` line is no longer a `1.3.10` Linux/Docker-only blocked
preview. It is a `1.3.14` release-readiness consolidation line with Linux
Docker, Linux host LabVIEW, Windows host LabVIEW, Vagrant VSIX acceptance,
public exact pre-tag, package preview, docs, and assurance evidence retained.
That made release-branch opening admissible as a separate governed action. The
release branch has since been opened, but readiness reassessment, exact tag, public
GitHub release, VS Code Marketplace publication, Windows Docker Desktop
Windows-container proof claim, and `main` promotion remain unperformed in this
state.

## Release Branch Opening

- Status: performed and retained
- Packet:
  `docs/product/release-branch-opening-v1.3.16-2026-05-11.md`
- Packet JSON:
  `docs/product/release-branch-opening-v1.3.16-2026-05-11.json`
- Source branch: `develop`
- Source commit:
  `2443e601c2b1aa78122af785516376b9905ba43f`
- Release branch: `release/1.3.16`
- Release branch pipeline: `2516207722` / `success`
- Duplicate operator pipeline: none
- Package version: `1.3.16`
- Vagrant Windows VSIX acceptance: release branch CI receipt retained in job
  `14309562384`
- Vagrant assertion receipt:
  `vagrant/evidence/assertion/vagrant-vsix-acceptance-assertion.json`
- Vagrant manifest:
  `vagrant/evidence/20260511-070846/manifest.json`
- LabVIEW startup receipt: `vagrant/evidence/labview-startup.json`
- Preview package job: `14309562385`
- Preview VSIX evidence:
  `preview-evidence/vi-history-suite-1.3.16.vsix`
- Preview VSIX SHA-256:
  `84ff12e25793406a29ca1ce23a670e6aab8b3519594ef0019605564034f964da`
- Preview VSIX size: `1015904` bytes
- Exact tag: not admitted and not created
- `release_extension` job: not run because no exact `vX.Y.Z` tag exists
- Public GitHub exact mutation: not admitted and not performed
- VS Code Marketplace exact mutation: not admitted and not performed
- Windows Docker Desktop Windows-container proof state: community/deferred
- `main` promotion: not admitted and not performed
- Next admitted action:
  `reassess-release-1.3.16-branch-readiness-before-exact-tag`
- Superseded by later state: release-branch readiness was reassessed for
  `release/1.3.16`, and main-promotion preflight is now admissible as the next
  separate governed action

This branch opening converts the current candidate from a `develop`-only patch
candidate into an opened release-candidate branch while preserving the exact
publication boundary. The branch preview artifact is still preview evidence
only, not the selected exact authority VSIX.

No duplicate operator pipeline was started for `release/1.3.16`; the canonical
branch-opening receipt is the branch-created `push` pipeline `2516207722`.

## Release Branch Readiness Reassessment

- Status: main-promotion admissible as a separate governed action
- Reassessment:
  `docs/product/release-branch-readiness-reassessment-v1.3.16-2026-05-11.md`
- Reassessment JSON:
  `docs/product/release-branch-readiness-reassessment-v1.3.16-2026-05-11.json`
- Release branch: `release/1.3.16`
- Release branch commit:
  `2443e601c2b1aa78122af785516376b9905ba43f`
- Release branch pipeline: `2516207722` / `success`
- Protected develop retention commit:
  `50faa3a07d8351db45b5fd13c479033c0debbb71`
- Protected develop retention pipeline: `2516304744` / `success`
- Topology: protected `main`
  `196dd70878bf26e9722c031b9192581e5147bafb` is an ancestor of
  `release/1.3.16`; the merge base is
  `196dd70878bf26e9722c031b9192581e5147bafb`
- Release branch is ancestor of protected `develop`: yes
- Release branch preview VSIX SHA-256:
  `84ff12e25793406a29ca1ce23a670e6aab8b3519594ef0019605564034f964da`
- Protected develop retention preview VSIX SHA-256:
  `0944e92e28a01b5a8a7fb1d51c403c30fb67db551b263dc3970afadb34ba5e72`
- Release branch Vagrant job: `14309562384`
- Protected develop Vagrant job: `14310323541`
- Selected exact authority VSIX: not retained yet
- Main promotion: admissible only as a separate governed action; not performed
  by this reassessment
- Exact tag: not admitted before protected `main` promotion and green protected
  `main` pipeline
- Public GitHub exact mutation: not admitted and not performed
- VS Code Marketplace exact mutation: not admitted and not performed
- Windows Docker Desktop Windows-container proof state: community/deferred
- Next admitted action:
  `promote-release-1.3.16-to-main-as-separate-governed-action`

This reassessment keeps the release branch green evidence and confirms no
topology refresh is required. The next governed action is to retain the
main-promotion preflight and then open the protected release-to-main merge
request only after that preflight is green.

## Release Main Promotion Preflight

- Status: protected `main` promotion merge-request opening admissible
- Preflight:
  `docs/product/release-main-promotion-preflight-v1.3.14-2026-05-08.md`
- Preflight JSON:
  `docs/product/release-main-promotion-preflight-v1.3.14-2026-05-08.json`
- Source branch: `release/1.3.14`
- Source commit:
  `50bec3391ea823739c2e8baddb33b77c283a37eb`
- Source branch pipeline: `2511168302` / `success`
- Target branch: `main`
- Target commit:
  `2f86063a35926fa67963af5ccd47e971157927c6`
- Branch topology: `main` is an ancestor of `release/1.3.14`, and
  `release/1.3.14` is an ancestor of protected `develop`
- Protected develop retention commit:
  `3557031442cbf85641544e07f9d75af59fe092d7`
- Protected develop retention pipeline: `2511333533` / `success`
- Release-readiness MR: `!196` / merged
- Protected develop preview VSIX SHA-256:
  `3d377d660af33c0fd5a36ee5f2e98a02204d4e1768e04cb3842f8d16b878005b`
- Protected develop Vagrant job: `14285909248`
- Promotion merge request: opened later as MR `!198` with source branch
  deletion disabled
- Main promotion merge: completed later at
  `2a08e94f819a34d54b4fdcb4ded24f85f8c7dbaa`
- Exact tag: created later as GitLab authority tag `v1.3.14`
- Release branch deletion: not admitted
- Public GitHub exact release publication: not performed
- VS Code Marketplace exact mutation: not performed
- Windows Docker Desktop Windows-container proof state: community/deferred
- Next admitted action at the time of preflight:
  `open-protected-release-1.3.14-to-main-merge-request-with-source-branch-retained`
- Superseded by later state: protected main promotion, exact authority tag, and
  public GitHub source/tag handoff are now complete

This preflight narrowed the release-branch-readiness decision into an executable
next step. The later protected main promotion, exact authority tag, and public
source/tag handoff supersede this historical next-action pointer; the remaining
open exact-release gates are public GitHub release publication and later
Marketplace publication.

## Public GitHub Source And Tag Handoff

- Status: superseded by exact `v1.3.15` public source, tag, release, and
  Marketplace closeout
- Public PR: https://github.com/svelderrainruiz/vi-history-suite/pull/69
- Public main commit:
  `f1cb60900820ea17328b9eec595579768491e22a`
- Public tag: `v1.3.14`
- Public tag object:
  `b6cea29ac68e542a1c792ba18d1cef8cb7ded3ae`
- Public tag peels to:
  `f1cb60900820ea17328b9eec595579768491e22a`
- Public Source Package Preview: run `25609017771`, job `75175830284`,
  success
- Public Windows Installed-User Contract: run `25609017782`, job
  `75175830275`, success
- Public Linux Installed-User Smoke: run `25609017773`, job
  `75175830267`, success
- Post-tag exact-release assessment:
  `.cache/public-github-exact-v1.3.14-after-public-tag/public-github-exact-release-transaction.json`
- Assessment state at retention: authority main and tag passed, public main
  and tag passed, public GitHub release was absent, and Marketplace served
  `1.3.13`; this historical `v1.3.14` source/tag handoff was superseded by
  the later exact `v1.3.15` closeout.
- Public GitHub release publication for `v1.3.14`: not performed
- VS Code Marketplace mutation for `v1.3.14`: not performed
- Windows Docker Desktop Windows-container proof admission: not performed
- Release branch deletion: not performed
- Next admitted action: explicit asset-first public GitHub exact-release
  publication handoff only when the boundary admits public GitHub release
  publication

The governed source/tag handoff closes the public-source drift that followed
GitLab authority tag creation. It does not close the exact release: the
retained assessment keeps the line frozen until the asset-first public GitHub
release is published and verified, and Marketplace publication remains blocked
until that later public GitHub release gate is complete.

## Exact Release Closeout v1.3.16

- Status: published and verified
- Authority tag: `v1.3.16`
- Authority `main`:
  `9c8e0a8503a84cba5d0ea722dd1497a35f52326c`
- Authority tag object:
  `a1f3d173ed8f89eaf4b71bdcd799a0c3eb01a84d`
- GitLab tag pipeline: `2517275332` / `success`
- GitLab release job: `14317413309`
- GitLab Vagrant tag job: `14317413306`
- Public GitHub PR:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/88`
- Public GitHub `main`:
  `f679023ed760963779d9331a9395128ad01c7e54`
- Public tag: `v1.3.16`
- Public tag object:
  `f6ca389269dac140dc416d76bb4c2ac142664567`
- Public GitHub release:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.16`
- Public GitHub release id: `320824958`
- Public GitHub release published at: `2026-05-11T22:38:02Z`
- VSIX SHA-256:
  `56bc9b222ec859f530ea523eed215b2efde4ce96fa9fcc4974f6589da3b81170`
- Checksum asset SHA-256:
  `ef3b3091fbea95924cf5dc51847abebd658f0a21ebe49c81422664fa97f7a23d`
- Windows exact-VSIX install proof:
  `.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json`
- Public GitHub exact transaction receipt:
  `.cache/public-github-exact-v1.3.16-verify-after-marketplace/public-github-exact-release-transaction.json`
- VS Code Marketplace prep receipt:
  `.cache/vscode-marketplace-publication-prep/v1.3.16-marketplace-verified/vscode-marketplace-publication-prep.json`
- VS Code Marketplace version: `1.3.16`
- Marketplace last updated: `2026-05-11T23:10:13.317Z`
- Marketplace post-publication verification:
  `.cache/vscode-marketplace-post-publication-verification/latest/vscode-marketplace-post-publication-verification.json`
- Marketplace verification timestamp: `2026-05-15T14:54:18.025Z`
- Next admitted action:
  `retain-v1.3.16-marketplace-closeout-on-protected-develop`

## Post-Publication Ledger Normalization

- Assertion command: `npm run release:ledger:closeout:assert`
- Normalized closeout path:
  `marketplacePostPublicationCloseout`
- Required ledger/docs files:
  `docs/product/release-publication-state.md`,
  `docs/product/release-publication-state.json`,
  `docs/product/vscode-marketplace-publication-ledger.md`,
  `docs/product/vscode-marketplace-publication-ledger.json`,
  `docs/product/public-github-source-publication-ledger.md`, and
  `docs/product/public-github-source-publication-ledger.json`
- Public GitHub release publication is recorded separately from VS Code
  Marketplace publication. The public GitHub release state is `published`;
  the Marketplace publication state is `published-and-verified`.
- Required normalized fields: Marketplace item id, expected version, observed
  Marketplace version, Marketplace publication/update timestamp, verification
  timestamp, package SHA-256, and proof receipt paths.
- Current normalized values: expected version `1.3.16`, observed Marketplace
  version `1.3.16`, publication timestamp `2026-05-11T23:10:13.317Z`,
  verification timestamp `2026-05-15T14:54:18.025Z`, package SHA-256
  `56bc9b222ec859f530ea523eed215b2efde4ce96fa9fcc4974f6589da3b81170`.

## Post-Publication Installed-User Acceptance Campaign

- Campaign packet:
  `docs/product/post-publication-installed-user-acceptance-campaign-2026-05-15.md`
- Campaign packet JSON:
  `docs/product/post-publication-installed-user-acceptance-campaign-2026-05-15.json`
- GitLab work item: `#10`
- Boundary: Marketplace publication is not treated as first-time installed-user
  acceptance proof.
- Publication mutation: not admitted by this campaign.
- Next product action:
  `run-post-publication-installed-user-acceptance-campaign`
- Default SemVer decision: sustainment-only unless the campaign finds a
  patch-worthy installed-user defect, public-facing documentation correction, or
  proof gap.
- Windows Docker Desktop Windows-container proof remains a separate launch-gate
  decision under
  `docs/product/issues/ISSUE-0415-windows-docker-desktop-launch-gate.md`.

## Public GitHub Installed-User Support Matrix Adoption

- Public GitHub PR:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/89`
- Public GitHub `main`:
  `90b6e600ea025aeb238832cf91fe15ff2b0c7db8`
- Public issue: `https://github.com/svelderrainruiz/vi-history-suite/issues/78`
- Public Source Package Preview: `25705189099` / `success`
- Public Linux Installed-User Smoke: `25705189121` / `success`
- Public Windows Installed-User Contract: `25705189131` / `success`
- Public GitHub release/tag mutation: not performed
- VS Code Marketplace mutation: not performed
- Release proof admission: not performed

## Public GitHub v1.3.16 Intake Surface Normalization

- Public GitHub PR:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/90`
- Public GitHub `main`:
  `fe4b15894d8417e6f1e0d234cb19bd945ef716c3`
- Public issue: `https://github.com/svelderrainruiz/vi-history-suite/issues/78`
- Public Source Package Preview: `25705500127` / `success`
- Public Linux Installed-User Smoke: `25705500132` / `success`
- Public Windows Installed-User Contract: `25705500124` / `success`
- Public GitHub release/tag mutation: not performed
- VS Code Marketplace mutation: not performed
- Release proof admission: not performed

## Public GitHub First-Run Local LabVIEW Guide Adoption

- Public GitHub PR:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/91`
- Public GitHub `main`:
  `fad5193f7aa0b9f543687eebf607cf2e94956afb`
- Public issue: `https://github.com/svelderrainruiz/vi-history-suite/issues/79`
- Public Source Package Preview: `25730733192` / `success`
- Public Linux Installed-User Smoke: `25730733157` / `success`
- Public Windows Installed-User Contract: `25730733137` / `success`
- Public GitHub release/tag mutation: not performed
- VS Code Marketplace mutation: not performed
- Release proof admission: not performed

## Public GitHub Troubleshooting And UX Adoption

- Public GitHub PRs:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/93`,
  `https://github.com/svelderrainruiz/vi-history-suite/pull/94`,
  `https://github.com/svelderrainruiz/vi-history-suite/pull/95`,
  `https://github.com/svelderrainruiz/vi-history-suite/pull/96`, and
  `https://github.com/svelderrainruiz/vi-history-suite/pull/97`
- Public GitHub `main`:
  `12798e46f14d6cac14eaf7381bbb62cc5ee012db`
- Public issues:
  `https://github.com/svelderrainruiz/vi-history-suite/issues/77`,
  `https://github.com/svelderrainruiz/vi-history-suite/issues/80`,
  `https://github.com/svelderrainruiz/vi-history-suite/issues/74`,
  `https://github.com/svelderrainruiz/vi-history-suite/issues/72`, and
  `https://github.com/svelderrainruiz/vi-history-suite/issues/73`
- Final-head Public Source Package Preview:
  `25750125305` / job `75623921597` / `success`
- Final-head Public Linux Installed-User Smoke:
  `25750125270` / job `75623921722` / `success`
- Final-head Public Windows Installed-User Contract:
  `25750125292` / job `75623921499` / `success`
- Public GitHub release/tag mutation: not performed
- VS Code Marketplace mutation: not performed
- Release proof admission: not performed
- Authority adjustment: GitLab adoption keeps selected LabVIEW bitness
  fail-closed; detected alternatives are reported without silently switching
  runtime bitness.

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
  evidence while `v1.3.16` remains the fully closed exact line.
- Repair rule: do not attempt in-place asset upload; require the next exact
  release line to use the asset-first publisher.

## Next Admitted Action

- Governed next line: exact `v1.3.16` is closed across GitLab authority,
  public GitHub source/tag/release, and VS Code Marketplace; this branch
  retains the protected `main` merge into `develop` plus the Marketplace
  publication ledger closeout.
- Next admitted action under the current boundary:
  `retain-v1.3.16-marketplace-closeout-on-protected-develop`
- Release branch deletion:
  not admitted unless explicitly authorized separately

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
GitHub exact release verifies complete. Exact `v1.3.15` is now the retained
line that closed that asset-first path and Marketplace publication end to end.

Before any future mutating VS Code Marketplace exact-release act, the exact
authority VSIX must also pass the retained Windows isolated install proof by
installing into isolated VS Code user-data/extensions roots and running bare
`vihs` plus `vihs --validate` successfully.

The public validation pre-release path is separate from the exact-release
Marketplace gate. It may publish a Marketplace pre-release package and a public
GitHub pre-release with VSIX assets for broader installed-user validation with
Windows proof disclosed by variant. The retained `1.3.11` public validation
lane is published and verified. For `1.3.12`, public GitHub and Marketplace
publication are published and verified, and a follow-on Windows 11 VirtualBox
proof now admits Windows host LabVIEW 2026 x64. For `1.3.13`, public GitHub
and Marketplace publication are authorized to carry that proof wording and the
diagnostic-note fix to installed users. Windows Docker Desktop
Windows-container proof remains community/deferred; exact-release promotion
remains a separate later claim.
