# Public GitHub Community-Validation Intake Promotion Plan v1.3.10

## Purpose

Define the separately gated public GitHub facade promotion path for the
Marketplace community-validation intake templates and labels prepared for
pre-release `1.3.10`.

This plan is intentionally non-mutating. It prepares the operator sequence for
the future public GitHub act, but it does not update the public GitHub repo,
public GitHub labels, public GitHub issue templates, public GitHub releases,
the public wiki, or the VS Code Marketplace.

Machine-readable companion:

- `docs/product/public-github-community-validation-intake-promotion-plan-v1.3.10.json`

## Current Status

- Plan status: prepared, awaiting explicit public publication trigger
- Required trigger phrase: `publish the public intake now`
- GitLab authority branch: `develop`
- Target public repo: `https://github.com/svelderrainruiz/vi-history-suite`
- Target public branch: `main`
- Current public GitHub publication state: unchanged from retained public
  source `v1.3.9` head `fb0ef2b`
- Public GitHub mutation performed by this plan: no
- Marketplace mutation performed by this plan: no

The local public checkout observed while preparing this plan was
`/home/ghostshadow/Public/repos/vi-history-suite-github`. It had pre-existing
local changes in `tests/integration/runTests.ts` and `artifacts/`, so the
future publish act must either clean that side work without reverting unrelated
user work or bind a fresh public checkout explicitly.

## Promotion Scope

Promote only the public facade intake surfaces that let Marketplace users
submit community-validation evidence:

| Surface | Authority Source |
| --- | --- |
| Marketplace community-validation issue template | `public-github-source/.github/ISSUE_TEMPLATE/community-validation-windows-labview.yml` |
| Bug report issue template with preview install route | `public-github-source/.github/ISSUE_TEMPLATE/bug-report.yml` |
| LabVIEW version support template with proof-deferred wording | `public-github-source/.github/ISSUE_TEMPLATE/labview-version-support.yml` |
| Feature request template with triage label | `public-github-source/.github/ISSUE_TEMPLATE/feature-request.yml` |
| Issue chooser contact links | `public-github-source/.github/ISSUE_TEMPLATE/config.yml` |
| Label manifest | `public-github-source/.github/labels.yml` |
| Public README proof-status wording and report links | `public-github-source/README.md` |
| Public support triage wording | `public-github-source/SUPPORT.md` |

The governed promotion tool may refresh the complete curated public facade
tree because `scripts/promotePublicGithubSource.js` owns deterministic public
source generation. The operator review must still confirm that the public
commit is an intake/support publication and not an exact-release retag.

## Explicit Exclusions

This plan does not admit:

- public GitHub release creation, editing, asset upload, or tag mutation
- VS Code Marketplace publication or package mutation
- public GitHub wiki publication
- claims that Windows/LabVIEW installed-user behavior is maintainer-proven
- treating Linux/Docker preview evidence as Windows/LabVIEW proof
- direct use of private GitLab evidence, PATs, tokens, or confidential VI
  contents in public issue templates

## Gate Sequence

1. Authority readiness before public mutation
   - Start from GitLab authority `develop`.
   - Confirm the prepared intake packet and JSON are present.
   - Confirm `scripts/promotePublicGithubSource.js` includes the
     community-validation template and `labels.yml` in `TEMPLATE_COPY_PATHS`.
   - Run the focused authority checks:

     ```bash
     npm exec -- vitest run tests/unit/publicGithubCommunityValidationIntakePromotionPlan.test.ts tests/unit/marketplaceCommunityValidationIntake.test.ts tests/unit/publicGithubSourcePromotion.test.ts tests/unit/publicSurfaceBoundaryDocs.test.ts tests/unit/vscodeMarketplacePublicationDocs.test.ts tests/unit/releasePublicationState.test.ts
     ```

   - Run the docs workbench gate before treating the authority packet as
     ready.

2. Trigger gate
   - Stop before any public checkout write, public commit, public push, label
     application, or GitHub API mutation unless the user has separately said:
     `publish the public intake now`.

3. Target checkout gate after trigger
   - Bind the intended checkout explicitly:

     ```bash
     export VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT=/home/ghostshadow/Public/repos/vi-history-suite-github
     ```

   - Confirm the target remote is
     `https://github.com/svelderrainruiz/vi-history-suite.git`.
   - Confirm the target checkout is clean before writing:

     ```bash
     git -C "$VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT" status --short
     ```

   - If unrelated local changes exist, stop and either preserve them outside
     the governed publication checkout or bind a fresh clean clone.

4. Local facade promotion after trigger
   - Promote from GitLab authority into the bound public checkout:

     ```bash
     npm run public:source:promote -- --target-root "$VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT" --evidence-dir .cache/public-github-community-validation-intake-promotion/latest
     ```

   - Review the public checkout diff and confirm the intake/support scope:

     ```bash
     git -C "$VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT" diff --name-status
     ```

5. Public checkout validation before push
   - From the public checkout, run the public design-contract checks:

     ```bash
     npm run test:design-contract
     ```

   - Confirm the community-validation template is present under
     `.github/ISSUE_TEMPLATE/` and that `.github/labels.yml` contains the
     required label names, colors, and descriptions.

6. Public commit and push after trigger
   - Commit only the promoted intake/support facade changes.
   - Use a publication message such as:

     ```bash
     git -C "$VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT" add .
     git -C "$VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT" commit -m "Publish community validation intake"
     git -C "$VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT" push origin main
     ```

   - Do not create or move a public GitHub tag.
   - Do not create or edit a public GitHub release.

7. Label application after public source push
   - Pushing `.github/labels.yml` does not by itself change repository labels.
   - Apply or update labels idempotently from
     `public-github-source/.github/labels.yml` using GitHub UI, `gh label`, or
     a retained future label-sync helper.
   - Verify labels with:

     ```bash
     gh label list --repo svelderrainruiz/vi-history-suite --limit 100
     ```

8. Post-publication verification
   - Verify the public default branch contains:
     - `.github/ISSUE_TEMPLATE/community-validation-windows-labview.yml`
     - `.github/ISSUE_TEMPLATE/bug-report.yml`
     - `.github/ISSUE_TEMPLATE/labview-version-support.yml`
     - `.github/ISSUE_TEMPLATE/feature-request.yml`
     - `.github/ISSUE_TEMPLATE/config.yml`
     - `.github/labels.yml`
   - Verify the issue chooser exposes the Marketplace community-validation
     template.
   - Verify the required labels exist on the public repo.

9. Authority closeout after verification
   - Record the public commit in
     `docs/product/public-github-source-publication-ledger.{md,json}`.
   - Update `docs/product/release-publication-state.{md,json}` and
     `docs/product/vscode-marketplace-publication-ledger.{md,json}` from
     `prepared-awaiting-trigger` to the verified public intake state.
   - Retain the promotion evidence receipt from
     `.cache/public-github-community-validation-intake-promotion/latest/`.

## Required Label Set

The public repo must retain these labels for the intake loop:

| Label | Required Public Effect |
| --- | --- |
| `community-validation` | identify user-submitted Marketplace preview evidence |
| `marketplace-preview` | identify reports specific to pre-release `1.3.10` |
| `windows-labview` | identify Windows host or Docker Desktop Windows-container LabVIEW reports |
| `proof:reported` | mark complete user evidence that is not maintainer-reproduced |
| `proof:reproduced` | mark retained maintainer reproduction or admitted proof |
| `proof:deferred` | mark selectable but not-yet-proven paths |
| `needs-triage` | mark reports needing initial classification |
| `needs-reproduction` | mark reports requiring maintainer reproduction |
| `provider:host` | classify local Windows `LabVIEWCLI` provider reports |
| `provider:docker` | classify Docker provider reports |
| `labview:x64` | classify x64 LabVIEW reports |
| `labview:x86` | classify x86 LabVIEW reports |

## Stop Rules

- Stop if the public checkout is dirty with unrelated work.
- Stop if the target remote is not
  `https://github.com/svelderrainruiz/vi-history-suite.git`.
- Stop if the public diff includes GitLab-only control-plane files.
- Stop if the issue templates omit proof-status wording.
- Stop if labels would be deleted or rewritten outside the prepared manifest
  without an explicit authority update.
- Stop if any step asks for or prints a PAT, GitLab project token, Marketplace
  token, or other secret material.

## Evidence Anchors

- Marketplace community-validation intake packet:
  `docs/product/marketplace-community-validation-intake-v1.3.10.md`
- Marketplace community-validation intake JSON:
  `docs/product/marketplace-community-validation-intake-v1.3.10.json`
- Public GitHub source authority map:
  `docs/product/public-github-source-authority-map.md`
- Release publication state:
  `docs/product/release-publication-state.md`
- Marketplace publication ledger:
  `docs/product/vscode-marketplace-publication-ledger.md`
- Public source promotion script:
  `scripts/promotePublicGithubSource.js`
