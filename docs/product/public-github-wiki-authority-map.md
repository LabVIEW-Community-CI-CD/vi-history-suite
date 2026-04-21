# Public GitHub Wiki Authority Map

## Purpose

Define the bounded authority stack for the public GitHub user wiki so future
publication does not leak private control-plane material from the internal
GitLab authority stack.

## Audience

This map is for the public GitHub user wiki only.

It is not the authority map for the internal GitLab maintainer wiki.

## Authority Order

When future sessions create or refresh public GitHub wiki pages, use this
order:

1. [README.md](../../README.md)
2. [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
3. [release-procedure.md](../release-procedure.md)
4. [current-state.md](./current-state.md)
5. [extension-execution-policy.md](./extension-execution-policy.md)
6. [CHANGELOG.md](../../CHANGELOG.md)
7. [public-github-wiki-publication-ledger.md](./public-github-wiki-publication-ledger.md)
8. [public-github-wiki-publication-ledger.json](./public-github-wiki-publication-ledger.json)

If two documents disagree, the higher document in this list wins until the
lower document is corrected.

## Excluded Inputs

Public GitHub wiki publication shall not use these as primary truth sources:

- `docs/requirements/srs.md`
- `docs/requirements/rtm.csv`
- benchmark-control docs and packets
- private maintainer review instructions
- transient shell output
- prior chat messages

Those surfaces may inform internal normalization first, but they do not publish
directly to the public user wiki.

## Publication Rules

- The public GitHub wiki is a curated extension-user reader surface.
- It shall not mirror the internal GitLab wiki wholesale.
- Exact public release wiki pages and bundled installed-user docs shall keep
  the exact released `v1.2.2` Docker-only installed-user contract until a
  newer exact release is actually published.
- Maintained public candidate wiki heads may publish the opened `v1.3.0`
  host-default Windows local `LabVIEWCLI` contract once that candidate state
  is retained in `docs/product/public-release-candidate.{md,json}`.
- Public wiki publication shall not silently mix exact-release Docker-only
  wording with `v1.3.0` candidate host-default wording on the same maintained
  wiki head; exact-release and candidate surfaces shall stay explicit.
- Public wiki publication must be recorded in the dedicated public publication
  ledger, not the internal GitLab wiki ledger.
- Bundled installed-user documentation should stay aligned with the public user
  guidance that is actually published for the exact released or maintained
  candidate surface being retained.
