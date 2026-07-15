# Maintainer Operations

This repository uses a governed GitHub-first branch model. The model is
lightweight GitFlow-style branch governance: `main` is the
Marketplace and release baseline. `develop` is the integration branch for
completed work. Hosted CI is the public merge gate; maintainer-only validation
is retained release evidence, not a public pull request gate.

For configuration-management evidence, feature branches branch from and back
into `develop`; release branches branch from `develop` and promote to `main`;
hotfix branches branch from `main` and back-sync to `develop`.
In GitFlow terms, GitFlow feature branches flow from and back into `develop`,
GitFlow release branches come from `develop`, and each released `main`
baseline is back-synced into `develop` for status accounting.
Feature branches from `develop` target `develop`. Feature branches merge back
into `develop`. Release branches from `develop` merge into `main` and merge
into `develop` after publication. Delete release branch after both merges complete.
Hotfix branches from `main` merge into `main` and merge into `develop`.

The compact CM proof map lives in [Configuration Management Plan](./cm/cm-plan.md).
Use it as the standards-audit entry point for baselines, change control, status
accounting, coverage-risk closeout evidence, user-information re-review
triggers, and the current documentation-workbench support status.

## Branch Model

| Branch | Role | Promotion Rule |
| --- | --- | --- |
| `main` | Released Marketplace baseline | Accepts `release/vX.Y.Z` or `hotfix/vX.Y.Z` pull requests only |
| `develop` | Integration branch | Accepts `feature/<issue#>-*`, `release/vX.Y.Z`, `hotfix/vX.Y.Z`, and `main` back-sync pull requests (the back-sync PR uses `head=main` directly — a `chore/*`/`backsync/*` head is rejected) |
| `feature/<issue#>-*` | Normal development (MUST reference an issue) | Branch from and merge back to `develop` |
| `fix/*` | Focused fix | Branch from a `feature/*` branch and merge back into that `feature/*` branch only — never directly into `develop` or `main` |
| `release/vX.Y.Z` | Frozen release candidate | Branch from `develop`, stabilize, then merge to `main` |
| `hotfix/vX.Y.Z` | Urgent production fix | Branch from `main`, merge to `main`, then back-sync to `develop` |

Bootstrap sequence:

1. Merge the governance update to the current stable `main`.
2. Create `develop` from that updated `main`.
3. Protect `main` and `develop` with the required `Build, Test, Package` check.
4. Add the protected `marketplace-release` environment with required approval
   and the `VSCE_PAT` secret.

## Release Flow

1. Start release work from `develop` by creating `release/vX.Y.Z`.
2. Update `package.json`, `package-lock.json`, `CHANGELOG.md`, requirements,
   and release evidence references for version `X.Y.Z`.
3. Confirm hosted CI passes on the release branch.
4. Optionally dispatch the Windows/LabVIEW maintainer workflow on
   `release/vX.Y.Z` for installed-user confidence evidence.
5. Open a pull request from `release/vX.Y.Z` to `main`.
6. Merge only after CI, review, and release evidence are complete.
7. Tag the merged `main` commit as `vX.Y.Z`.
8. Manually dispatch the `Marketplace Release` workflow on that exact tag
   (maintainer-only; agents must never dispatch or approve it).
9. Verify the Marketplace version and links with:

   ```powershell
   node scripts/runPinnedVsce.js show svelderrainruiz.vi-history-suite --json
   ```

10. Back-sync `main` to `develop` after release publication. Open the
    back-sync pull request **directly with `head=main`** — do not create an
    intermediate `chore/*` or `backsync/*` branch:

    ```shell
    gh pr create --base develop --head main \
      --title "Back-sync main into develop after vX.Y.Z" \
      --body "Reconcile develop with the released main baseline."
    ```

    Per the [Branch Model](#branch-model) table, the `Branch Governance` gate's
    `base=develop` allow-list only permits `head` values of `main`,
    `feature/<issue#>-*`, `release/vX.Y.Z`, `hotfix/vX.Y.Z`, or `dependabot/*`
    (enforced by the `Branch Governance` step in `.github/workflows/ci.yml`). A
    `chore/*` head is blocked in ~4 seconds, so reaching for a dedicated
    back-sync branch fails the gate and wastes a CI cycle.

Hotfixes use the same release evidence and tag-only Marketplace publication
path (manual maintainer dispatch on the exact tag), but branch from `main` as `hotfix/vX.Y.Z` and back-sync to `develop`
after publication using the same `head=main` back-sync mechanic described in
step 10.

The Marketplace extension identity remains `svelderrainruiz.vi-history-suite`.
Source, support, and release links point to
`https://github.com/LabVIEW-Community-CI-CD/vi-history-suite` and
`https://github.com/LabVIEW-Community-CI-CD/vi-history-suite.git`.
Support issues use
`https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues`.

Do not attach normal release VSIX files to GitHub Releases unless a future
release plan makes GitHub a second install channel. The Marketplace is the
install channel.

The narrow exception is an immutable, unique diagnostic prerelease created only
when a reporter needs a public VSIX download for retesting. It is not a normal
release, is not marked latest, is never reused or edited, and must not be
described as Marketplace publication.

## Marketplace Release Workflow

The `.github/workflows/marketplace-release.yml` workflow is the only hosted
Marketplace publishing path.

It must:

- run from a manual maintainer `workflow_dispatch` on an exact `vX.Y.Z` tag ref, with no automatic push/tag trigger, and agents must never dispatch or approve it
- fail closed unless `package.json` version equals the tag without `v`
- fail closed unless the tagged commit is reachable from `origin/main`
- run `npm ci`, `npm run check`, `npm test`, and `npm run package`
- pre-check the live Marketplace listing for the target version and skip
  `Publish To Marketplace` when the version is already published, so reruns
  of a previously failed verifier step never re-attempt publish
- publish the located VSIX with `node scripts/runPinnedVsce.js publish --packagePath`
- verify the live Marketplace listing with bounded `vsce show` retry through
  `node scripts/verifyMarketplaceListing.js` (20 attempts at 30s = 10 minutes)
- retain release evidence that names required validation surfaces
  (traceability audit, docs link check, tests, package, Marketplace listing, and
  closeout expectation)
- upload retained release artifacts even when listing verification times out
  (`Upload Release Evidence` runs with `if: always()`), including:
  `release-evidence/marketplace-show.json`,
  `release-evidence/marketplace-listing-verification.json`,
  `release-evidence/marketplace-prepublish-show.json`,
  `release-evidence/marketplace-prepublish-check.json`,
  `release-evidence/release-evidence-contract.json`, `coverage/**`, and the VSIX

If `Verify Marketplace Listing` times out because Marketplace propagation
exceeds the 10-minute window, the published listing is still live; rerun the
failed step with `gh run rerun <run-id> --failed` (the pre-publish check now
recognizes the already-published version and skips publish, so the rerun
will only re-execute the verifier and evidence upload). Manual confirmation
remains:

```shell
node scripts/verifyMarketplaceListing.js svelderrainruiz.vi-history-suite \
  <version> --out release-evidence/marketplace-show.json \
  --report-out release-evidence/marketplace-listing-verification.json \
  --attempts 20 --delay-ms 30000
```

The workflow uses the protected GitHub environment `marketplace-release`.
Configure that environment with required approval and `VSCE_PAT`.

## Token Handling

Marketplace publishing tokens are controlled maintainer secrets.

- Do not commit tokens.
- Do not store tokens in this repository.
- Store `VSCE_PAT` only in the protected `marketplace-release` environment.
- Require approval before the environment is released to the workflow.
- Rotate or revoke temporary Marketplace tokens after publication when used.

GitHub secret scanning and push protection are enabled for this repository.

## Non-Interactive Closeout Authentication

Standards closeout evidence relies on authenticated Git source and Docker
registry access in non-interactive environments.

Recommended preflight before `npm run closeout:evidence`:

```bash
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=/absolute/path/to/askpass-helper.sh
printf '%s' "$RSR_PAT" | docker login registry.gitlab.com -u oauth2 --password-stdin
```

Operational guidance:

- Use `GIT_ASKPASS` and `GIT_TERMINAL_PROMPT=0` so `git ls-remote` provenance
  checks never block on interactive prompts.
- If Docker emits `error getting credentials`, `credential helper`,
  `credsStore`, or `credHelpers`, fix the Docker credential-helper
  configuration first, then retry.
- If Docker emits `unauthorized`, `access forbidden`, or `denied`, refresh the
  token and rerun `docker login registry.gitlab.com`.
- If Docker emits `manifest unknown` or repository-not-found errors, verify the
  published image exists before rerunning closeout evidence.

## Non-Interactive Terminal Sessions (Windows `gh`/`git`)

On Windows, the VS Code integrated PowerShell terminal can hang after `gh` or
`git` commands that open a pager or the alternate screen buffer. The prompt
shows a bare `^C` and subsequent commands produce no output until a new
terminal is opened; the stuck session does not recover on its own. This is
developer-environment friction, not a product defect, but it interrupts
otherwise clean maintainer and agent release workflows.

Preflight for non-interactive maintainer/agent sessions:

```powershell
$env:GH_PAGER = 'cat'
git config core.pager cat
```

Operational guidance:

- Set `GH_PAGER=cat` (and `git config core.pager cat`) before `gh`/`git`
  calls; this eliminates most pager-driven hangs.
- Avoid `gh ... --watch` in the integrated terminal — its alternate-screen
  rendering is a frequent trigger. Poll a single
  `gh run view <id> --json status,conclusion` (or `gh pr checks <id> --json`)
  read instead.
- Keep `jq` filters free of `[...]` array constructors when passed through
  PowerShell single-quoted arguments: PowerShell parses the brackets and
  throws `Missing type name after '['`, and bracket-heavy one-liners correlate
  with the subsequent hangs. Prefer simple `tostring` string concatenation.
- If a session still gets stuck behind a `^C`, open a fresh terminal rather
  than trying to recover the current one, and re-verify any in-flight step
  (`git log`, `gh pr view`, `gh issue list`) independently — irreversible
  steps (merges, tag pushes, Marketplace approval) must be confirmed after the
  fact regardless.

## Validation Surfaces

| Surface | Role | Release Claim |
| --- | --- | --- |
| Hosted GitHub CI | Required public merge gate on Ubuntu | Required before `develop` and `main` merges |
| Branch governance in CI | Source-target branch policy | Required before `main` and `develop` pull requests merge |
| Marketplace Release workflow | Manual-dispatch, tag-only Marketplace publication | Required for Marketplace publication |
| Codespaces/devcontainer | Primary source-evaluation path | Human/source confidence |
| Diagnostic test VSIX workflow | Reporter retest package from a trusted ref | Diagnostic evidence only |
| Maintainer Windows/LabVIEW runner | Trusted installed-user validation | Maintainer evidence only |
| Maintainer Linux/LabVIEW runner | Trusted installed-user validation | Maintainer evidence only |
| Vagrant | Optional isolated local helper | Not a release gate |

## Activation-Time Runtime Auto-Detect

The extension performs a filesystem-only runtime probe on every activation
(VHS-REQ-616 and VHS-REQ-617):

- Windows scans `${ProgramFiles}\National Instruments\LabVIEW <year>[ Q1|Q3]`
  and the `Program Files (x86)` mirror; Linux scans
  `/usr/local/natinst/LabVIEW-<year>-64`; macOS hosts are treated as
  Docker-only. The probe walks `PATH` for a `docker` binary and never spawns
  child processes.
- Activation seeds `viHistorySuite.runtimeProvider`,
  `viHistorySuite.labviewVersion`, and `viHistorySuite.labviewBitness` when
  unset and repairs them when the persisted combination is not satisfiable
  by the current detection. Persisted satisfiable values are preserved
  verbatim.
- The `vihs` launcher is auto-materialized on activation
  (`labviewViHistory.prepareLocalRuntimeSettingsCli` remains as the manual
  refresh entry point) and self-heals on `MODULE_NOT_FOUND` after upgrades.
- A `VI History runtime` status bar item reflects detection outcome and a
  first-run information notice fires once per user when no runtime is
  detected (`vihs.firstRunNoRuntimeNoticeShown` globalState flag). Re-detect
  on focus events is throttled to 5 seconds.

These probes are intentionally lightweight; richer registry, daemon, or
process probes belong to `comparisonRuntimeLocator` and the `vihs --validate`
CLI surface.

## Diagnostic Test VSIX

Use the `Package Test VSIX` workflow when a reporter needs to retest a fix that
is merged to `main` or stabilized on `release/vX.Y.Z` but is not yet available
from the Marketplace.

The workflow is manual-only and trusted-ref-only. It accepts `main`,
`release/vX.Y.Z`, or an exact `vX.Y.Z` tag. It runs the same lightweight
package checks as hosted CI, uploads the generated `vi-history-suite-*.vsix` as
a 14-day Actions artifact, and can optionally create a public immutable
diagnostic prerelease named `diagnostic-test-vsix-<run-id>-<run-attempt>` for
easier reporter download.

Dispatch defaults:

- Ref: `main`, `release/vX.Y.Z`, or an exact `vX.Y.Z` tag.
- `publish_prerelease`: `false` unless a public immutable prerelease download
  link is needed.
- `issue_number`: the issue being retested, such as `61`.

Reporter install command:

```powershell
code --install-extension .\vi-history-suite-*.vsix --force
```

After installation, ask the reporter to reload VS Code, reproduce the issue,
and capture selected-file eligibility or Git history facts separately from
comparison runtime validation output. If the Marketplace extension with the same identity is already
installed, `--force` is required; uninstalling the Marketplace build first is
also acceptable.

## Windows/LabVIEW Runner

The self-hosted runner is a repository-level maintainer runner for trusted refs
only. It must not run arbitrary pull request code.

Runner settings:

- Runner name: `vihs-win-labview-sveld`
- Custom label: `vihs-windows-labview-maintainer`
- Mode: interactive `run.cmd`, not a Windows service
- Scope: `LabVIEW-Community-CI-CD/vi-history-suite`

Expected host prerequisites:

- Node.js and npm
- VS Code
- LabVIEW 2026
- LabVIEWCLI
- Git
- GitHub Actions runner application
- a PowerShell execution policy for the runner user that allows GitHub's
  temporary `.ps1` scripts, such as `CurrentUser RemoteSigned`

Validate every prerequisite at once before dispatching the workflow by running
the runner prerequisite doctor directly on the runner:

```powershell
node scripts/checkMaintainerRunnerPrerequisites.js
```

It reports each prerequisite as present or missing with remediation and exits
non-zero when any required one is absent (the same fail-fast gate the workflow
runs after checkout). Because this runs on the runner itself, you can confirm
readiness without dispatching the trusted-ref-gated workflow or cutting a
release.

The doctor also runs an **advisory** system-clock-skew preflight: it compares the
host clock to an authoritative network time source and warns when the skew
exceeds a tolerance (and degrades to an advisory `unknown` when the source is
unreachable, so it never blocks an offline host). A skewed clock makes the
runner's session token look expired to GitHub and silently knocks the runner
offline with a misleading "registration has been deleted" error, so resync the
clock (`Start-Service w32time` then `w32tm /resync`, or `Set-Date`) and, on a
dual-boot host, set Linux to treat the RTC as local time — or Windows to use UTC
— so future boots stop skewing it. Pass `--fail-on-clock-skew` to make an
over-tolerance skew a hard failure.

> **Install VS Code system-wide.** If the runner is registered as a service
> (running as `NetworkService` or another service account), install VS Code with
> the **System** installer at `C:\Program Files\Microsoft VS Code`. A user-scoped
> VS Code install under `%LOCALAPPDATA%` is not visible to a service account, so
> the integration host cannot find `code.cmd`. The runner doctor flags this case.

The runner workflow must be `workflow_dispatch` only, use read-only repository
permissions, and hard-fail unless the ref is `main`, `release/vX.Y.Z`, or an
exact `vX.Y.Z` tag. The workflow file is
`.github/workflows/windows-labview-maintainer.yml`.

Start the runner only when needed:

```powershell
cd C:\dev\github-actions-runners\vi-history-suite
.\run.cmd
```

Stop it after validation by closing the runner terminal or pressing `Ctrl+C`.

## Linux/LabVIEW Runner

The Linux maintainer runner is the sibling of the Windows runner above: a
repository-level, trusted-refs-only self-hosted runner that must not run
arbitrary pull request code. It exists so the Linux comparison-runtime matrix
(host-native LabVIEW for Linux plus the linux-container path, issue #259) can be
re-validated on real hardware on demand, in parallel with the Windows runner
(issue #378).

Runner settings:

- Runner name: `vihs-linux-labview-<host>`
- Custom label: `vihs-linux-labview-maintainer`
- Mode: interactive `run.sh`, not a systemd service
- Scope: `LabVIEW-Community-CI-CD/vi-history-suite`

Expected host prerequisites:

- Node.js and npm
- VS Code plus `xvfb` for a headless integration-host display
- LabVIEW for Linux 2026, including quarterly install dirs such as
  `LabVIEW-2026Q1-64` / `LabVIEW-2026Q3-64`
- the Linux LabVIEW CLI launcher (`labviewcli` or the shared `nilvcli`)
- Git
- Docker, for the linux-container comparison path
- GitHub Actions runner application

Validate every prerequisite at once before dispatching the workflow by running
the runner prerequisite doctor directly on the runner:

```bash
node scripts/checkMaintainerRunnerPrerequisites.js
```

It reports each prerequisite as present or missing with remediation and exits
non-zero when any required one is absent (the same fail-fast gate the workflow
runs after checkout), so you can confirm readiness without dispatching the
trusted-ref-gated workflow.

The doctor also runs an **advisory** system-clock-skew preflight that warns when
the host clock drifts past a tolerance from an authoritative network time source
(advisory `unknown` when the source is unreachable, so it never blocks an offline
host). A skewed clock silently knocks the runner offline with a misleading
GitHub "registration has been deleted" error; resync the clock and, on a
dual-boot host, fix the RTC interpretation (`timedatectl set-local-rtc 1` on
Linux, or set Windows to UTC) so future boots stop skewing it.

Register the runner once (the previously-missing infrastructure for issue #378).
Use the registration token from the repository's
`Settings > Actions > Runners > New self-hosted runner` page:

```bash
mkdir -p ~/actions-runners/vi-history-suite
cd ~/actions-runners/vi-history-suite
# Download the latest Linux x64 runner package shown on the runner page, extract it here, then:
./config.sh \
  --url https://github.com/LabVIEW-Community-CI-CD/vi-history-suite \
  --token <REGISTRATION_TOKEN> \
  --name "vihs-linux-labview-$(hostname)" \
  --labels vihs-linux-labview-maintainer \
  --unattended
```

The runner workflow must be `workflow_dispatch` only, use read-only repository
permissions, and hard-fail unless the ref is `main`, `release/vX.Y.Z`, or an
exact `vX.Y.Z` tag. The workflow file is
`.github/workflows/linux-labview-maintainer.yml`.

Start the runner only when needed:

```bash
cd ~/actions-runners/vi-history-suite
./run.sh
```

Stop it after validation by closing the runner terminal or pressing `Ctrl+C`.
The run records the same evidence shape as the Windows runner in
`runner-evidence/linux-labview-maintainer-summary.txt`.

## VI Semantic PR Review Runner (docker)

`.github/workflows/vi-semantic-pr-review.yml` (VHS-REQ-661) is a
`workflow_dispatch`-only workflow that runs the VI semantic PR review against
any target repository and pull request and posts the result as a sticky comment
on the target PR. It runs the comparison inside the
`nationalinstruments/labview:<version>-linux` container on a **GitHub-hosted
`ubuntu-latest` runner** — no self-hosted runner is required. The hosted runner
already provides Docker; the workflow pulls the NI LabVIEW image (~5 GB) itself
as a fail-fast prerequisite step, so a missing Docker daemon aborts in seconds
with an actionable message.

The only maintainer setup is the `VI_REVIEW_TARGET_TOKEN` secret (a token with
`pull-requests: write` on the target repositories), used to post the sticky
comment cross-repo. To also embed inline diff images (the optional
`publish_images` input), that token additionally needs `contents: write` (the
images are uploaded to a `vi-review-assets` branch in the target repository);
without it, image publishing is skipped best-effort and the textual review still
posts. The optional `create_commit_status` input additionally posts a gateable
"VI Semantic Review" commit status and needs `statuses: write`; it too degrades
best-effort.

### snap-packaged Docker

If the runner's Docker is installed from the snap store (Canonical's `docker`
snap), the daemon runs in a private mount namespace with its own `/tmp`. A
staging directory created under the default `/tmp` is then invisible inside the
LabVIEW container, and the comparison fails with `VI path invalid or does not
exist` even though the staged VIs exist on the host. The workflow avoids this by
pointing the CLI temp root at `$RUNNER_TEMP` (under the runner home), which snap
Docker can bind-mount. When running the CLI by hand on a snap-Docker host, set
`TMPDIR` to a directory under your home (e.g. `TMPDIR="$HOME/vihs-tmp"`) before
invoking `runViSemanticPrReview.js`. Native (non-snap) Docker is unaffected.

The standards closeout (`npm run closeout:evidence -- ... --standards-runner
docker`) is affected by the same confinement: its tracked-worktree audit
snapshot must be bind-mounted into the assurance workbench container. It now
defaults the snapshot base to a home-directory cache
(`~/.cache/vi-history-suite`) that snap Docker can share, so no `TMPDIR`
override is required. Override the base with `VIHS_CLOSEOUT_SNAPSHOT_DIR` if the
home cache is not Docker-visible on a particular host.

### Cross-repository token

`--post-comment` writes to the **target** repository (the `repository` input),
not to `vi-history-suite`. The workflow's own `GITHUB_TOKEN` can only access its
own repository, so the workflow passes a repository secret,
`VI_REVIEW_TARGET_TOKEN`, as `GH_TOKEN` to the CLI. Provision this secret with a
PAT or GitHub App token that has `pull-requests: write` / `issues: write` on the
repositories you intend to review. The workflow is fail-closed to trusted
`vi-history-suite` refs so the privileged token can never be exercised from an
untrusted branch.

Dispatch it with the target `repository` (`owner/repo`), `pr_number`, and
optional `container_image_version` (default `2026q1`). It uploads the produced
review Markdown and JSON as the `vi-semantic-pr-review-<run_id>` artifact.

### Reusing the review from another LabVIEW repository

The review steps live in a reusable `workflow_call` workflow,
`.github/workflows/vi-semantic-pr-review-callable.yml`, so any LabVIEW
repository can run the review with a thin caller workflow instead of copying
the YAML:

```yaml
jobs:
  review:
    uses: LabVIEW-Community-CI-CD/vi-history-suite/.github/workflows/vi-semantic-pr-review-callable.yml@<ref>
    with:
      repository: <owner/repo>
      pr_number: '<n>'
      container_image_version: '2026q1'
      enforce_trusted_ref: false   # external callers rely on their own branch protections
    secrets:
      VI_REVIEW_TARGET_TOKEN: ${{ secrets.VI_REVIEW_TARGET_TOKEN }}
```

The consumer needs no self-hosted runner: the reusable workflow runs on a
GitHub-hosted `ubuntu-latest` runner and pulls the NI LabVIEW image itself. The
consumer only provides a token with `pull-requests: write` on the target
repository. The maintainer dispatch workflow above delegates to this same unit
with `enforce_trusted_ref: true`, so both share one source of truth.

### Automatic review on every PR (including fork PRs)

To review PRs automatically — with no `/comment` or label — a consuming LabVIEW
repository copies the template
[docs/consumer-workflows/vi-semantic-review-on-pr.yml](./consumer-workflows/vi-semantic-review-on-pr.yml)
into its own `.github/workflows/` and sets one secret,
`VI_REVIEW_DISPATCH_TOKEN` (a least-privilege token with `actions: write` on
`vi-history-suite`). On every PR open/synchronize/reopen the template dispatches
the review here, which posts the sticky comment back to the PR using
`vi-history-suite`'s own `VI_REVIEW_TARGET_TOKEN` — so the consuming repo never
holds a target-write token.

Key safety properties (asserted by `tests/unit/viSemanticReviewOnPrTemplate.test.ts`):

- It runs on `pull_request_target` so it works for fork PRs (which get no
  secrets on a plain `pull_request`), but it **never checks out or runs the
  untrusted PR code** — it only dispatches; the VIs are compared in the isolated
  LabVIEW container here.
- The dispatch is gated on the PR author's **real repository permission**
  (`admin`/`write`/`maintain`), resolved via the API. Do **not** gate on the
  event payload's `author_association`: it reports `CONTRIBUTOR` for fork PRs
  even for org members, which silently skips trusted authors. Untrusted PRs are
  not auto-reviewed; a maintainer can still trigger the review manually.

## Evidence

Maintainer evidence should be small and repeatable:

- trusted-ref decision line (`allowed`/`blocked`) with evaluated ref facts
- workflow run URL
- commit ref and SHA
- release baseline tag and SHA
- runner name and runner labels
- Node/npm versions
- VS Code path
- LabVIEW/LabVIEWCLI paths and LabVIEWCLI detection result
- VSIX evidence path recorded in `runner-evidence/windows-labview-maintainer-summary.txt`
- packaged VSIX artifact from that run (`vi-history-suite-*.vsix`)
- Marketplace release workflow URL and tag ref for publication evidence
- `release-evidence/marketplace-show.json` from post-publish verification
- `release-evidence/marketplace-listing-verification.json` with bounded retry
  attempt outcomes (`--attempts`, `--delay-ms`, and total bounded window)
- `release-evidence/release-evidence-contract.json` naming required validation
  surfaces and retained artifacts for release closeout
- retained `coverage/**` output from the Marketplace release test run
- closeout evidence generated with `npm run closeout:evidence`, including
  mandatory quick-triage, `release-gate`, and `26514-review` standards-review
  output from host Python or the Docker assurance workbench fallback

What this evidence proves:

- a trusted maintainer workflow run executed on the maintainer runner label
- the run captured factual host/tooling context and trusted-ref gating outcome
- the run produced or explicitly failed to produce the expected VSIX evidence
- a protected environment approved tag-only Marketplace publication triggered by manual maintainer dispatch
- the live Marketplace listing contained the released version after publication
- optional diagnostic prerelease evidence is unique per workflow run attempt
  and not an edited or clobbered prior release
- a bounded Marketplace listing retry window distinguished propagation lag from
  a publication or listing verification failure

What this evidence does **not** prove:

- diagnostic VSIX publication is Marketplace publication
- self-hosted validation is a public PR gate
- untrusted refs were ever allowed to execute maintainer validation
- a diagnostic prerelease is a stable latest-download endpoint

Do not claim Vagrant evidence unless the Vagrant issue is run on a
Vagrant-capable host and recorded separately.

## Local Standards Issue Triage

For newly filed issues, maintainers can run the local standards-review triage
helper before selecting a requirement, branch, and validation lane:

```shell
npm run issue:standards-triage -- --issue <issue-number>
```

The helper captures `gh issue view` metadata, creates a Docker-visible tracked
worktree snapshot, and runs the `repo-standards-review` workbench image against
that snapshot with:

- `requirements_quality_check.py --requirements-spec-scope system --json`
- `repo_evidence_scan.py --profile quick-triage --include-snippets`
- `run_assurance.py --profile quick-triage --output gate-scorecard`

Artifacts are retained under
`assurance-issue-triage-evidence/issue-<issue-number>/`, which is ignored by the
repo. The default image is
`registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main`;
the helper pulls that published image after a local inspect miss. Use
`--image repo-standards-review-assurance-workbench:local` only when testing a
locally built workbench that is already present in the local Docker image cache.
The output is advisory triage evidence, not a hosted CI gate or issue-closeout
substitute.

## Local Multi-Standard Audit

For a repo-wide assurance pass after standards-related changes, maintainers can
run the local multi-standard audit helper:

```shell
npm run standards:audit
```

The helper creates a Docker-visible tracked worktree snapshot, prepares the
published standards workbench image with the same default-image pull behavior as
issue triage, and writes retained artifacts under
`assurance-multi-standards-evidence/<run-id>/`. The audit runs direct 29148 and
26514 checks plus the multi-profile workbench set:

- `requirements_quality_check.py --requirements-spec-scope system --json`
- `external_user_information_check.py --json`
- `quick-triage`
- `release-gate`
- `26514-review`
- `due-diligence`
- `compliance-uplift`
- `portfolio-review` with `portfolio-table` output

Use the generated `audit-summary.md` and `audit-summary.json` to prioritize
follow-up issues. Direct requirements or user-information findings are the first
fix candidates; profile gate failures are cross-standard candidates that should
be reviewed with the saved profile evidence. The command is local advisory
evidence, not a hosted CI gate or release substitute.

Human review should start with `audit-summary.md`; automation and later triage
should consume `audit-summary.json`. Schema version `1` retains the stable
machine-consumer contract: direct-check status and checked paths, snapshot
metadata, exact command provenance, per-profile score-file provenance, coverage
rationale rows, evidence rows, gate-strength rows, high-confidence gate-basis
rows, and lower-confidence or missing-proof gate-detail rows. Each grouped
standards row must keep its retained `standards`, `profiles`, and `scoreFiles`
arrays even when the Markdown rendering groups or compacts the same evidence.

## Local Assurance State

After retaining a multi-standard audit packet, maintainers can normalize it into
a planning-ready local assurance state:

```shell
npm run assurance:state -- --audit-run-id <standards-audit-run-id>
```

The helper writes `assurance-state.json` and `assurance-state.md` under
`assurance-state-evidence/<run-id>/`, which is ignored by the repo. The MVP reads
the retained `audit-summary.json`, preserves the audit source path, standards,
profiles, score files, checked paths, snapshot metadata, command provenance,
confidence, basis, and optional issue/PR/merge metadata, then classifies each
normalized signal as `green`, `candidate`, `known`, `resolved`, or
`needs-review`. Use `--issue-link`, `--pr-link`, `--merge-sha`, and
`--requirement` when connecting the local state packet to a triage, PR, or
post-merge closeout loop. The state packet is advisory planning evidence; it
does not replace hosted CI, requirements health, traceability, DoD, package, or
PR-gate validation.

When post-merge review sweeps find Codex, CodeQL, or maintainer findings that
belong in the planning packet, pass repeatable `--review-finding` JSON values:

```shell
npm run assurance:state -- --audit-run-id <standards-audit-run-id> \
  --review-finding '{"state":"resolved","url":"https://github.com/org/repo/pull/1#discussion_r1","title":"Fixed post-merge review finding","source":"chatgpt-codex-connector","basis":"Fixed by PR #2."}'
```

Each review finding becomes a classified `post-merge-review` signal and retains
the supplied URL, title, source, and basis in the JSON and Markdown outputs.

## External Marketplace Verification

The Marketplace extension identity `svelderrainruiz.vi-history-suite` is tested
statically through `tests/unit/packageManifest.test.ts` and
`tests/unit/publicDocSourceLinks.test.ts`, but the live Marketplace listing
itself requires verification after publication.

Manual verification steps:

1. Run the `vsce show` command or the bounded verification helper:

   ```powershell
   node scripts/runPinnedVsce.js show svelderrainruiz.vi-history-suite --json
   node scripts/verifyMarketplaceListing.js svelderrainruiz.vi-history-suite 1.4.2 --out release-evidence/marketplace-show.json --report-out release-evidence/marketplace-listing-verification.json --attempts 6 --delay-ms 30000
   ```

2. Confirm the returned URLs use the organization repository as their base:

   ```text
   repository.url = https://github.com/LabVIEW-Community-CI-CD/vi-history-suite.git
   bugs.url = https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues
   ```

3. Visit the Marketplace listing page and confirm the source repository link
   leads to the organization repository, not the old personal repository.

This external evidence reference is documented in RTM as
`external:vscode-marketplace-svelderrainruiz.vi-history-suite` for VHS-REQ-600.

## Post-Publish Reconciliation Checklist

After any Marketplace publish, use this checklist to verify that the live
listing reflects the expected source, support, and identity metadata. This
checklist is verification-only and does not require Marketplace credentials.

### Checklist

- [ ] **Extension Identity**: Confirm the Marketplace listing shows
      `svelderrainruiz.vi-history-suite` as the extension identifier.
- [ ] **Published Version**: Confirm the Marketplace version matches the
      released tag (e.g., `1.4.1` for `v1.4.1`).
- [ ] **Source URL**: Confirm the Marketplace "Repository" link points to
      `https://github.com/LabVIEW-Community-CI-CD/vi-history-suite`.
- [ ] **Support URL**: Confirm the Marketplace "Issues" or "Support" link
      points to
      `https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues`.
- [ ] **Repository URL**: Confirm the `vsce show` output shows the organization
      repository URL, not the old personal repository.
- [ ] **Installed Bundled Docs**: After installing the published version in
      VS Code, confirm the bundled `README.md` and `CHANGELOG.md` display the
      organization repository links, not the old personal repository.

### Verification Commands

Run these commands to gather evidence without Marketplace credentials:

```powershell
# Show live Marketplace metadata (no credentials required)
node scripts/runPinnedVsce.js show svelderrainruiz.vi-history-suite --json

# Confirm local package.json matches expectations
npm run check
npx vitest run tests/unit/packageManifest.test.ts tests/unit/publicDocSourceLinks.test.ts
```

### Reporting Stale Links

If the Marketplace listing shows stale source or support links after a publish:

1. File an issue using the First-Time Onboarding Feedback template at
   `https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues/12`.
2. Include the `vsce show` JSON output and a screenshot of the Marketplace page.
3. Do not attempt to fix the listing without coordinating with the maintainer
   who owns the Marketplace publisher credentials.
