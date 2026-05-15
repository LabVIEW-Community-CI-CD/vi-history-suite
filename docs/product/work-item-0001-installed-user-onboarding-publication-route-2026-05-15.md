# Work Item 0001 Installed-User Onboarding Publication Route

Recorded: `2026-05-15T10:13:36Z`

Refreshed after current `develop` rebase: `2026-05-15T13:33:27Z`

## Scope

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/1`

Merged authority input:

- GitLab MR `!229`
- Merge commit `5abd8e8`
- Protected `develop` pipeline `#2527258446` passed
- Public feedback intake:
  `https://github.com/svelderrainruiz/vi-history-suite/issues/98`

## Route Decision

The admitted route is public-source/docs synchronization with retained
pre-mutation proof and retained receipts. This work item does not authorize an
exact tag, public GitHub release, or VS Code Marketplace publication.

The VS Code Marketplace path for this work item is limited to the non-mutating
preparation receipt from `npm run vscode:marketplace:prepare`. The refreshed
receipt observes that the Marketplace already serves `1.3.16`; this work item
does not claim or authorize the Marketplace publish mutation that made that
state true.

## Required Receipts

- Public exact pre-tag proof before public-source mutation:
  `.cache/public-exact-pretag-proof/latest/public-exact-pretag-proof.json`
- Public GitHub source promotion receipt:
  `.cache/public-github-source-promotion/latest/public-github-source-promotion.json`
- VS Code Marketplace publication prep receipt:
  `.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json`

## Execution Results

- Public exact pre-tag proof: `pass`, refreshed
  `2026-05-15T13:33:17.623Z`.
- Public GitHub source promotion: `passed` in `write` mode, refreshed
  `2026-05-15T13:33:27.665Z`, with the generated and target managed file
  trees matching.
- VS Code Marketplace publication prep: `ready`, refreshed
  `2026-05-15T13:33:17.861Z`, with
  `productionMutationAttempted=false`, observed Marketplace version `1.3.16`,
  and next action `retain-marketplace-publication`.
- Public source branch prepared locally:
  `codex/work-item-1-installed-user-onboarding-public-sync`.
- Public source PR merged:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/99`, head commit
  `2ae0f45`, merge commit `4d508e0`, merged
  `2026-05-15T10:28:10Z`.

## Public-Safe Surface Checks

- `README.md` keeps Overview and Details installed-user first.
- `docs/information-for-users/faq.md` remains the FAQ route.
- `docs/information-for-users/command-reference.md` remains the command
  reference route.
- Installed-user links in the public facade remain absolute or public-repo
  relative.
- Maintainer release-control material remains routed through
  `docs/product/maintainer-control-plane-index.md`, not the Marketplace Details
  flow.

## Mutation Boundary

Allowed now:

- Local authority documentation updates for this route.
- Local public GitHub source checkout promotion after the pre-tag proof passes.
- Non-mutating Marketplace publication preparation.

Not allowed without a separate explicit authorization step:

- Creating an exact tag.
- Publishing a GitHub release.
- Publishing to VS Code Marketplace.
- Admitting new Windows Docker Desktop proof.
