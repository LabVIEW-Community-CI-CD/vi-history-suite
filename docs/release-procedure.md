# Release Procedure

## Trigger

- For pre-release install testing, use the `package_extension_preview` artifact
  from the latest successful `main` pipeline.
- Release from a SemVer tag matching `vX.Y.Z`.
- Only release when [SHIP-0001](./product/SHIP-0001-releasable-vi-history-suite.md)
  and the [release readiness matrix](./product/release-readiness-matrix.json)
  do not retain open blockers against the targeted release criterion.
- The first retained exact-version release is `v0.2.0`, with retained artifact
  `vi-history-suite-0.2.0.vsix` and manifest
  `release-evidence/release-manifest.json`.
- The current exact released line is `v1.3.7`.
- The burned exact released line is `v1.0.2`.
- The current published package line on `main` is `1.3.7`.
- The current develop package line on `develop` is `1.3.7`.
- The active exact release candidate line on `develop` is `1.3.8`.
- The active release-candidate branch is `release/1.3.8`.
- The active exact hotfix candidate line on `main` is none.
- The active hotfix branch is none.
- The active feature-lane public GitHub release hardening branch on `develop`
  is none.
- Exact `v1.3.7` remains the closed public GitHub and VS Code Marketplace
  baseline while `release/1.3.8` carries the installed `vihs` launcher fix for
  users without global `node` on `PATH`.
- The pre-tag public-exact proof package script is
  `npm run public:exact:pretag:proof`.
- The pre-tag public-exact proof GitLab job is `public_exact_pretag_proof`.
- The public GitHub exact transaction verification package script is
  `npm run public:github:exact:transaction:verify`.
- The retained public GitHub exact transaction receipt is
  `.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json`.
- The VS Code Marketplace publication prep package script is
  `npm run vscode:marketplace:prepare`.
- The retained VS Code Marketplace publication prep receipt is
  `.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json`.
- The active software-factory governance branch on `develop` is none.
- The software factory assessment package script is
  `npm run software:factory:assess`.
- The software factory rehearsal package script is
  `npm run software:factory:rehearse`.
- The software factory repair package script is
  `npm run software:factory:repair`.
- The software factory publish package script is
  `npm run software:factory:publish`.
- The software factory verify package script is
  `npm run software:factory:verify`.
- The VS Code Marketplace prep package script is
  `npm run vscode:marketplace:prepare`.
- The retained software factory assessment receipt is
  `.cache/software-factory-orchestrator/latest/software-factory-state.json`.
- The retained software factory rehearsal receipt is
  `.cache/software-factory-orchestrator/latest/rehearse/software-factory-state.json`.
- The retained software factory repair receipt is
  `.cache/software-factory-orchestrator/latest/repair/software-factory-state.json`.
- The retained software factory publish receipt is
  `.cache/software-factory-orchestrator/latest/publish/software-factory-state.json`.
- The retained software factory verify receipt is
  `.cache/software-factory-orchestrator/latest/verify/software-factory-state.json`.
- The retained VS Code Marketplace prep receipt is
  `.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json`.
- The software-factory contract admits non-production `assess`,
  `rehearse`, and `repair` plus guarded non-mutating `publish` and `verify`
  contract phases; no production mutation is admitted in this slice.
- The active Windows x64 private-release-prep slice is the historical
  `release/1.3.1` lane.
- The active Windows x64 private-release packet is:
  - `docs/product/private-release-windows-x64-v1.3.1.md`
  - `docs/product/private-release-windows-x64-v1.3.1.json`
- The controlled `v1.3.1` Windows x64 private GitLab release is now published
  at `https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.1-windows-x64`,
  with the retained publish receipt at
  `.cache/private-release-publish/latest/private-release-publish.json`.
- Fresh local `v1.3.1` acceptance evidence remains retained at
  `windows-private-release-evidence/manifest.json`.
- That private-release act does not imply exact tagging, public GitHub release,
  `main` promotion, or VS Code Marketplace publication.
- Public GitHub `main` now publishes `704e629`, public tag `v1.3.7` is live,
  GitHub release `312517425` is published at
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.7`,
  the uploaded exact assets match the retained authority manifest under
  `.cache/gitlab-release-artifacts/v1.3.7/expanded/release-evidence/`, the
  retained verify receipt records `verifyGateStatus=pass` and
  `verifyGateAllowed=true`, and VS Code Marketplace now serves `1.3.7`.
- Windows x86 / 32-bit LabVIEW remains out of scope for that `v1.3.0`
  pre-release sequence; any retained x86 host evidence is characterization
  only and does not expand the Windows x64 private-release claim.
- The tracked Windows x64 private-release packet for that prep sequence is:
  - `docs/product/private-release-windows-x64-v1.3.0.md`
  - `docs/product/private-release-windows-x64-v1.3.0.json`
- The governed private-release publish surface for that sequence is:
  - `npm run gitlab:private-release:publish`
  - current retained private-release tag: `private-v1.3.1-windows-x64`
- The governed Windows runner-lane contract for that prep sequence is:
  - `docs/product/windows-private-release-runner-lane.md`
- The governed external assurance lane for that prep sequence is:
  - `docs/product/linux-assurance-runner-lane.md`
  - fail-fast admission job `governed_runner_admission`
  - fail-fast admission evidence root `governed-runner-admission-evidence/`
  - blocking jobs `assurance_release_gate`, `assurance_26514_authority`,
    `assurance_requirements_quality`, and
    `assurance_external_user_information`
  - advisory job `assurance_audit_packet`
- The repo-owned runner host asset pack, startup receipts, doctor surfaces,
  apply surfaces, and live drift assertions for those lanes are:
  - `scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1`
  - `scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1`
  - `scripts/gitlab-runner/windows/doctor-governed-runner-lanes.ps1`
  - `scripts/gitlab-runner/windows/assert-governed-runner-lanes.ps1`
  - `scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1`
  - `scripts/runWindowsProofRuntimeRecoveryRehearsal.js` via
    `npm run gitlab:runner:windows:recovery:rehearse`
  - `scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh`
  - `scripts/gitlab-runner/linux/start-linux-assurance.sh`
  - `scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh`
  - `scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service`
  - `scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh`
  - `scripts/doctorGovernedRunnerLanes.js` via `npm run gitlab:runner:doctor`
  - `scripts/assertGovernedRunnerLanes.js` via `npm run gitlab:runner:assert`
  - latest Windows startup receipt:
    `C:\GitLab-Runner\receipts\governed-runner-startup\latest.json`
  - latest Linux startup receipt:
    `$HOME/gitlab-runner/receipts/linux-assurance-startup/latest.json`
- The Windows apply surface keeps the scheduled task on
  `powershell.exe -NoLogo -NoProfile -File "C:\GitLab-Runner\start-governed-runner-lanes.ps1"`
  without `ExecutionPolicy Bypass` and fails closed unless exactly one
  configured runner manager remains after apply.
- The Windows bootstrap writes a machine-readable startup receipt for duplicate
  collapse, cold-admission cleanup, Linux-helper retry, and current-user
  runner readiness before the governed Windows lane is treated as healthy.
- The Windows drift assertion surface fails closed unless the installed
  bootstrap still matches the repo source, the scheduled task retains that
  exact action plus its logon trigger, `C:\GitLab-Runner\config.toml` still
  contains `request_concurrency = 2`, and exactly one configured runner
  manager is live.
- The Windows bootstrap clears stale `LabVIEW`, `LabVIEWCLI`, and `LVCompare`
  before cold runner admission with bounded `Stop-Process`,
  `taskkill /PID /T /F`, and `taskkill /IM /T /F`, and fails closed if
  contamination remains.
- The same Windows bootstrap also wakes Ubuntu and retries the repo-owned
  Linux assurance helper until it proves the paired
  `vihs-linux-assurance-runner.service` is `enabled`, `active`, and singular,
  failing closed otherwise.
- The Linux helper now reconciles `~/.gitlab-runner/config.toml` back to
  `concurrent = 2` plus `request_concurrency = 2`, restarts the admitted
  `systemd` service when needed, and writes a machine-readable startup receipt
  before it reports the Linux assurance surface healthy.
- The Linux apply surface installs the helper and service unit and fails
  closed unless `~/.gitlab-runner/config.toml` first retains
  `concurrent = 2` plus `request_concurrency = 2` and
  `vihs-linux-assurance-runner.service` is both enabled and active after
  apply.
- The Linux drift assertion surface fails closed unless the installed helper
  and service unit still match the repo source, `~/.gitlab-runner/config.toml`
  still contains `concurrent = 2` plus `request_concurrency = 2`, the
  admitted service fragment/user and working directory remain exact, the
  service is still enabled and active, and exactly one configured runner
  process is live.
- The fail-fast `governed_runner_admission` job runs first in the GitLab
  `admission` stage through
  `npm run gitlab:runner:doctor -- --surface all --fail-on-drift --evidence-dir governed-runner-admission-evidence`
  and blocks docs, assurance, test, package, and release stages whenever the
  post-reset Windows or Linux runner contract drifts.
- When the host-native Windows proof exits on that same cleanup seam, the
  acceptance wrapper retains
  `windows-private-release-evidence/host/proof-run-pre-recovery.txt`, runs
  `scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1`,
  retains `windows-private-release-evidence/host/proof-runtime-recovery.txt`,
  waits `5000` ms, retries the host-native proof once, and still fails closed
  if the repo-owned recovery step plus retry cannot restore a clean host
  surface.
- The Windows proof runtime recovery rehearsal surface is
  `scripts/runWindowsProofRuntimeRecoveryRehearsal.js` via
  `npm run gitlab:runner:windows:recovery:rehearse`; it fails closed unless
  the admitted Windows host starts clean, seeds one headless LabVIEW
  contamination on the governed host-native `2026` `x64` runtime, runs the
  same repo-owned recovery script, and retains the latest rehearsal receipt at
  `.cache/windows-proof-runtime-recovery-rehearsal/latest.json`.
- Public Linux smoke, exact tagging, Marketplace publication, and `main`
  promotion remain out of scope for that private-release-prep sequence.
- The public GitHub default branch is `main` because it carries the latest
  exact released source line.
- The public Codespaces evaluation branch is `develop`.
- The integration branch is `develop`.
- The protected exact-release line is `main`.
- The release-candidate branch family is `release/*`.
- The hotfix branch family is `hotfix/*`.
- The next-line branch model is `GitFlow` with temporary
  `feature/*`, `release/*`, and `hotfix/*` lanes.
- The hosted automation governance matrix is retained in:
  - `docs/product/hosted-ci-governance.md`
  - `docs/product/hosted-ci-governance.json`
- Protected-branch promotion shall rely on required checks, not operator memory.
- After an exact release is published, the current published package line on
  `main` shall match that exact release line.
- When `develop` carries post-release work, its package line shall advance to
  the next exact release candidate before public guidance or publication
  changes land on that branch.
- Any later repo change intended for publication shall advance `package.json`
  and the top `CHANGELOG.md` heading to the next SemVer line before additional
  publication or release normalization continues.
- A SemVer bump is not complete until the matching public tag, public GitHub
  release, and VS Code Marketplace version are all published.
- A later SemVer opening is forbidden while the current exact line still
  retains a blocked public GitHub or VS Code Marketplace transaction.
- When public GitHub `main`, the exact tag, or a draft release already exist
  for the current exact line, the governed next step is repair in place
  unless `npm run public:github:exact:transaction:assess` retains that repair
  is impossible; once the exact GitHub release and Marketplace version are
  published and verified, the exact release can be retained as closed.
- No GitHub release publication, Marketplace publication, or other production
  mutation shall occur outside the repo-owned factory/orchestrator contract.
- Exact `v1.3.7` is the current exact closed line; `release/1.3.8` is the
  active candidate for the installed `vihs` launcher fix.
- Exact release closeout is not complete until the exact released `main` line
  has also been back-merged into `develop` through the protected path and the
  resulting `develop` pipeline is green.
- The release tag shall match both `package.json` and the top unreleased
  heading in [CHANGELOG.md](../CHANGELOG.md).
- Tags shall be cut only from a green `main` commit after the required checks
  on the integration and release branches have already passed.
- The repo also publishes a separate docs-authoring workbench image for
  documentation-package iteration:
  `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main`
- The protected-branch release-gate CI lane uses the published external
  assurance-workbench image on the local authenticated self-hosted Linux assurance runner lane:
  `registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main`
- Documentation-package coherence and future wiki seeding are tracked in:
  - `docs/product/documentation-coherence-ledger.md`
  - `docs/product/wiki-seed-plan.md`
  - `docs/product/wiki-publication-ledger.md`
  - `docs/product/wiki-publication-ledger.json`
- Public-source publication is tracked separately in:
  - `docs/product/public-github-source-authority-map.md`
  - `docs/product/public-github-source-publication-ledger.md`
  - `docs/product/public-github-source-publication-ledger.json`
- VS Code Marketplace publication is tracked separately in:
  - `docs/product/vscode-marketplace-publication-ledger.md`
  - `docs/product/vscode-marketplace-publication-ledger.json`

## Steps

For the current `v1.3.1` Windows-only private-release line, the controlled
GitLab release is retained at `private-v1.3.1-windows-x64` after the packet
and validation pack are green; exact/public `release/*` promotion still stays
separate afterward.

1. Ensure branch promotion followed the governed branch model.
   - Before opening or promoting the next candidate line, run
     `npm run branch:governance:assert` or let `npm run design:gate` run it
     first.
   - Fail closed if `develop` does not yet contain the exact released `main`
     baseline.
   - Feature branches are cut from `develop` and merge back into `develop`.
   - Cut `feature/*` branches from `develop` only and merge them back into
     `develop`.
   - Release branches are cut from `develop`, merge into `main`, and merge
     back into `develop`.
   - Cut `release/*` branches from `develop`, merge the same `release/*`
     branch into `main`, merge that `release/*` branch back into `develop`,
     and delete it only after both merges complete.
   - Delete the release branch only after both merges complete.
   - Cut `hotfix/*` branches from `main`, merge the same `hotfix/*` branch
     into `main`, merge that `hotfix/*` branch back into `develop`, and
     delete it only after both merges complete.
   - Do not tag from `develop`, `feature/*`, `release/*`, or `hotfix/*`.
   - Do not rely on direct pushes to a protected exact-release line as the
     primary release path.
2. Ensure `main` is in a governed baseline state.
   - Either wait for `npm run design:gate` to exit `0`, or run
     `npm run design:gate:assert-complete` against the retained latest report
     before claiming the gate is green.
   - If the available assurance skill path resolves under a mounted Windows
     path, the design gate mirrors it under
     `.cache/design-gate/assurance-skill/repo-standards-review/` before
     executing standards assurance.
   - Verify the required checks on the protected branch are green before any
     tag is created.
3. Ensure `package.json` and the top unreleased entry in `CHANGELOG.md` match
   the release tag version exactly.
4. If the release tranche changed bundled-doc inputs, run `npm run docs:bundle`
   locally so the packaged installed-user guide can be inspected before CI
   packages the VSIX.
5. Run both split documentation CI surfaces before release normalization:
   - `npm run docs:ci:public:core`
   - `npm run docs:ci:internal:core`
   - `npm run docs:ci:core` may still be used as the retained umbrella lane
     when one combined local report is more convenient.
6. Run compile, test, coverage generation, and VSIX packaging through GitLab
   CI.
   - the fail-fast `governed_runner_admission` lane now runs first in the
     `admission` stage and retains `governed-runner-admission-evidence/`; do
     not treat later pending stages as trustworthy until that doctor lane is
     green
   - the blocking Linux assurance jobs now run through the repo-owned
     `npm run assurance:*` wrapper on the local authenticated self-hosted Linux
     runner lane, which pulls the latest published
     `repo-standards-review` assurance-workbench `:main` image before each
     job:
     - `assurance_release_gate`
     - `assurance_26514_authority`
     - `assurance_requirements_quality`
     - `assurance_external_user_information`
   - `assurance_audit_packet` is advisory only and retains the non-blocking
     `evidence-pack` and `compliance-uplift` outputs.
   - The guarded `npm run package` path now runs compile,
     `npm run docs:bundle`, `npm run package:audit`, and then `vsce package`.
     Stale bundled installed-user docs are therefore unshippable through the
     governed packaging path.
   - Packaging-only npm tooling is intentionally excluded from the default
     repo `npm ci` surface and is invoked only on demand through the pinned
     `scripts/runPinnedVsce.js` helper when packaging is requested.
   - Packaging must fail closed if the packaged surface includes ungoverned
     runtime `node_modules`, if a governed runtime dependency payload is
     missing, or if transient/test artifacts such as `.cache` or
     `.vscode-test` would ship.
7. Retain release evidence under `release-evidence/`.
8. Review the generated release record and release manifest before any
   downstream distribution step.
9. Ensure the release artifact includes the exact versioned VSIX intended for
   installation and sharing.
10. Ensure the retained release manifest names the tag, package version, commit,
   VSIX filename, and retained evidence paths.
11. Ensure the packaged extension still contains the bundled user-doc surface
   under `resources/bundled-docs/`.
12. When the public Docker product contract changes materially, rerun the
    public-facade Linux smoke lane through:
    - these Linux checks remain exact/public-release or source-evaluation
      surfaces; they are not part of the current Windows-only private-release
      prep route
    - local `npm run public:smoke:linux`
    - local `npm run public:gate-d:preflight`
    - local `npm run public:gate-d:prepare-cold-pull` immediately before the
      real cold-pull Gate D rerun
    - GitHub `workflow_dispatch` on `.github/workflows/public-facade-linux-smoke.yml`
13. When the public source facade changes materially, promote the curated
    public GitHub source repo from authority and record the published commit:
    - bind the intended local public checkout with `--target-root` or
      `VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT` whenever the canonical sibling
      checkout is not the repo you intend to validate or write
    - `npm run public:source:check`
    - `npm run public:source:promote`
    - clean the target repo first if the governed check/promotion surface
      reports dirty-target failure; do not treat dirty side-worktree drift as
      publishable truth
    - update `docs/product/public-github-source-publication-ledger.{md,json}`
14. Keep public source publication separate from public GitHub wiki
    publication; one publication act does not imply the other.
    - before any further VS Code Marketplace act, retain the completed public
      GitHub exact-release verification through
      `npm run public:github:exact:transaction:verify`
    - retain the broader software-factory boundary assessment through
      `npm run software:factory:assess`
    - retain the non-production rehearsal proof through
      `npm run software:factory:rehearse`
    - retain the non-production repair contract through
      `npm run software:factory:repair`
    - retain the VS Code Marketplace publication prep receipt through
      `npm run vscode:marketplace:prepare`
    - the retained `v1.3.7` verify receipt now proves the public GitHub exact
      act closed with manifest-matched assets and `verifyGateStatus=pass`
    - fail closed if that controller no longer verifies the published public
      GitHub exact line cleanly
15. Publish the exact VSIX to the VS Code Marketplace and retain the result.
    - The governed distribution surface is the VS Code Marketplace item
      `svelderrainruiz.vi-history-suite`.
    - Before the mutating publish act, run
      `npm run vscode:marketplace:prepare` and require its receipt to show the
      GitHub `v1.3.7` verify gate passed, exact VSIX/checksum evidence matched,
      live Marketplace served the expected pre-publication stale version before
      the act and serves `1.3.7` after the act, the local PAT locator was ready
      without secret retention, and the pinned `vsce` publish command shape was
      retained.
    - The preferred CLI path is the pinned `@vscode/vsce` helper through
      `scripts/runPinnedVsce.js`; manual Marketplace portal upload remains the
      approved operator fallback.
    - CLI publication requires an Azure DevOps PAT created with
      `All accessible organizations` and `Marketplace: Manage`.
    - Do not retain PAT contents in the repo, docs, ledgers, CI artifacts, or
      chat logs.
    - Update `docs/product/vscode-marketplace-publication-ledger.{md,json}`
      with the publisher id, item id, version, listing URL, publication date,
      publication mode, and homepage URL used for the installed-user surface.
16. Back-merge the exact released `main` line into `develop` before claiming
    exact closeout is complete or opening the next candidate line.
    - use the protected merge path, not an ungoverned local-only shortcut
    - refresh repo-local Git HTTPS transport through
      `npm run gitlab:git-credential:refresh` instead of depending on
      remembered keyring or credential-manager state after host restart
    - for local GitLab API automation, resolve the repo token through
      `node scripts/resolveLocalGitLabApiToken.js --json`; the governed local
      path is `%USERPROFILE%\.config\codex\secrets\vi-history-suite.gitlab-api-token.txt`
      on Windows hosts and
      `$HOME/.config/codex/secrets/vi-history-suite.gitlab-api-token.txt` on
      Linux/WSL hosts
    - `npm run gitlab:git-credential:refresh` uses that same token source,
      rewrites the repo-local `credential.https://gitlab.com.username`
      setting, replaces stale `gitlab.com` credentials, and read-proves access
      with `git ls-remote origin HEAD`
    - queue merge requests through
      `node scripts/queueGovernedMergeRequest.js --source-branch <branch> --target-branch develop --title <title> --description-file <path> --auto-merge --remove-source-branch`
      instead of depending on remembered `glab` auth state
    - wait for the resulting `develop` pipeline to succeed
    - retain that merged-and-green `develop` state as part of the same exact
      release closeout evidence instead of waiting for a later human prompt
17. Mark a candidate `review-ready` only after the maintained public candidate
    surfaces are actually published.
    - local authority-green proof is necessary but not sufficient
    - the maintained public `develop` candidate head must be live
    - the maintained public wiki head must be live
    - the next installed-user publication boundary must remain explicit in
      `docs/product/runtime-provider-public-acceptance-gate.{md,json}`
    - both published heads must be retained in
      `docs/product/public-release-candidate.{md,json}`
    - do not open the next expert-agent review gate until that `review-ready`
      state is recorded
18. Treat dirty public source/wiki worktrees as governed publication surfaces,
    not as a generic stopping point.
    - preserve unrelated dirt
    - inspect overlapping changes
    - patch only the maintained candidate files narrowly
    - pause only when a direct unresolved conflict remains
    - do not publish blindly, but do not stop publication solely because the
      worktree is dirty
19. Keep exact tagging blocked until the post-publication expert-agent review
    gate closes with no findings on the maintained public candidate surfaces.
    - use the retained skill `vi-history-suite-expert-agent-reviewer`
    - retain the reviewed public `develop` candidate commit and public wiki head
      in `docs/product/public-release-candidate.{md,json}`
    - retain the latest verdict and finding count in the same package
    - optional product-owner exploratory review may happen separately, but it
      does not replace the clean expert-agent review gate for exact tagging

## Retained Evidence

- `preview-evidence/vi-history-suite-<version>.vsix`
- `preview-evidence/preview-manifest.json`
- `release-evidence/coverage/`
- `release-evidence/coverage.xml`
- `release-evidence/vi-history-suite-<version>.vsix`
- `release-evidence/vi-history-suite-<version>.vsix.sha256`
- `release-evidence/release-record.md`
- `release-evidence/release-manifest.json`
- `docs-workbench-evidence/docs-workbench-manifest.json`
- `docs-integration-evidence/docs-integration-report.json`
- `docs-integration-evidence/docs-integration-report.md`
- `docs-integration-evidence/public/`
- `docs-integration-evidence/internal/`
- `resources/bundled-docs/manifest.json`
- `.cache/design-gate/assurance-skill/repo-standards-review/`

## Current State

- VS Code Marketplace publishing is active in the current baseline, and exact
  release closeout is not complete until the matching Marketplace version is
  verified under `svelderrainruiz.vi-history-suite`.
- Preview VSIX artifacts are available from `main`, but they are not the same
  thing as the governed SemVer release artifact.
- The docs-authoring workbench image is a supporting documentation-package
  surface, not the end-user extension artifact.
- The release gate now expects split public-user and internal-authority docs
  CI surfaces in addition to the retained umbrella docs CI lane.
- The public Docker product surface is additionally characterized by the
  public-facade Linux smoke lane for Linux-engine cold-pull behavior.
- The GitLab release lane is configured to build the governed versioned VSIX
  artifact and release manifest.
- The first governed `v0.2.0` release evidence set is now retained through
  GitLab release `v0.2.0`, tag pipeline `2428809456`, and kept release job
  `13779604462`.
- `v1.0.2` is retained as a burned release because the immutable tag published
  before the exact authority docs CI failure was discovered.
- The current published package line on `main` is `1.3.7`, tracked in the
  exact authority line while the current develop package line remains `1.3.7`;
  that split must not rewrite the retained `v0.2.0`, `v1.0.0`, `v1.0.1`,
  burned `v1.0.2`, exact `v1.0.3`, exact `v1.0.4`, exact `v1.0.5`, exact
  `v1.0.6`, exact `v1.1.0`, exact `v1.2.0`, exact `v1.2.1`, exact `v1.2.2`,
  exact `v1.3.0`, exact `v1.3.1`, exact `v1.3.2`, exact `v1.3.3`, exact
  `v1.3.4`, exact `v1.3.5`, exact `v1.3.6`, or exact `v1.3.7` release
  evidence.
- The current develop package line on `develop` is `1.3.7`, public GitHub
  `main` now publishes `704e629`, public tag `v1.3.7` is live, GitHub release
  `312517425` is published, VS Code Marketplace serves `1.3.7`, and
  `release/1.3.8` opens from that retained baseline for the installed `vihs`
  launcher fix.
- The packaged extension homepage now points installed users to the maintained
  public wiki home, while the repo root remains the source and control-plane
  surface.
