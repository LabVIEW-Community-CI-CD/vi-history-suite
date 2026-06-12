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
8. Let the `Marketplace Release` workflow publish from that exact tag.
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
path, but branch from `main` as `hotfix/vX.Y.Z` and back-sync to `develop`
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

- run from an exact `vX.Y.Z` tag or manual dispatch using an exact tag ref
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

## Validation Surfaces

| Surface | Role | Release Claim |
| --- | --- | --- |
| Hosted GitHub CI | Required public merge gate on Ubuntu | Required before `develop` and `main` merges |
| Branch governance in CI | Source-target branch policy | Required before `main` and `develop` pull requests merge |
| Marketplace Release workflow | Tag-only Marketplace publication | Required for Marketplace publication |
| Codespaces/devcontainer | Primary source-evaluation path | Human/source confidence |
| Diagnostic test VSIX workflow | Reporter retest package from a trusted ref | Diagnostic evidence only |
| Maintainer Windows/LabVIEW runner | Trusted installed-user validation | Maintainer evidence only |
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
  mandatory standards-review output from host Python or the Docker assurance
  workbench fallback

What this evidence proves:

- a trusted maintainer workflow run executed on the maintainer runner label
- the run captured factual host/tooling context and trusted-ref gating outcome
- the run produced or explicitly failed to produce the expected VSIX evidence
- a protected environment approved tag-only Marketplace publication
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
