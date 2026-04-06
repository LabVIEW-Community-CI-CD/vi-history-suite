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
- Public wiki publication must be recorded in the dedicated public publication
  ledger, not the internal GitLab wiki ledger.
- Bundled installed-user documentation should stay aligned with the public user
  guidance that is actually published.
