# ADR-0036: VS Code Marketplace Publication And Installed-User Entry Surface

## Status

Accepted

## Context

`v1.2.0` is now live on the VS Code Marketplace under publisher
`svelderrainruiz`, but the retained control plane still treated Marketplace
publication as inactive.

That left two design seams:

- exact release closeout could look complete after GitHub release and GitLab
  tag publication even though the Marketplace distribution surface was already
  real product truth
- Marketplace users could still land on repo-root documentation that assumes
  branch, fork, or Codespaces context before explaining how to use the
  installed extension locally

The extension already has a public wiki and a curated bundled installed-user
guide, but the Marketplace distribution surface and the installed-user entry
surface were not retained together as one governed decision.

## Decision

Adopt the VS Code Marketplace as a governed exact-release distribution surface:

- exact release closeout is not complete until the matching VSIX version is
  verified on the VS Code Marketplace
- any future mutating Marketplace publication act must first retain a passing
  Windows exact-VSIX install proof that installs the exact authority VSIX into
  isolated VS Code user-data/extensions roots and proves bare `vihs` plus
  `vihs --validate` succeed without ambient Node on PATH
- retain the live Marketplace publication state in
  `docs/product/vscode-marketplace-publication-ledger.{md,json}`
- govern the publish path through pinned `vsce`, Azure DevOps PAT scope
  `Marketplace: Manage`, and a manual Marketplace portal-upload fallback
- do not retain PAT values or other secret material in repo evidence

Adopt an installed-user-first entry surface for Marketplace readers:

- the packaged extension `homepage` points to the maintained public wiki home
  surface instead of the repo root
- the root README and public source README lead with the installed-extension
  local workflow before repo/fork/Codespaces guidance
- the packaged README content stays version-agnostic for installed users and
  does not describe exact released lines, maintained develop candidate lines,
  or other branch-specific release doctrine that can persist on the Marketplace
  listing after one publication closes
- repo, branch, fork, and Codespaces procedures remain explicit, but they are
  secondary source-evaluation lanes instead of the first contact for installed
  users

## Consequences

Positive:

- Marketplace publication becomes retained release truth instead of an operator
  side effect
- future exact closeout work must prove Marketplace publication explicitly
- future Marketplace-ready exact lines must also retain the Windows isolated
  install proof before publication instead of discovering installed-user
  defects only after the listing is live
- installed users land on task-oriented documentation before repo-specific
  governance detail

Costs:

- the release-control package now has another publication ledger to maintain
- the entry-surface docs need stronger audience separation across root README,
  public source docs, and the public wiki home/install pages

## Follow-On

- retain this decision in the release procedure, current-state, sustainment
  package, SRS, RTM, and test plan
- keep governance tests fail closed when Marketplace publication or the
  installed-user entry surface drifts away from the governed design
