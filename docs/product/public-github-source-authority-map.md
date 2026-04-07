# Public GitHub Source Authority Map

## Purpose

Define the bounded authority stack for the curated public GitHub source repo so
future publication can promote the public product surface without leaking the
internal GitLab control plane.

## Audience

This map is for the public GitHub source repo only.

It is not the authority map for:

- the internal GitLab maintainer wiki
- the public GitHub user wiki

## Authority Order

When future sessions refresh the public GitHub source repo, use this order:

1. [README.md](../../README.md)
2. [CHANGELOG.md](../../CHANGELOG.md)
3. [ADR-0027](../architecture/adr/ADR-0027-public-github-facade-and-user-wiki-vs-internal-gitlab-control-plane.md)
4. [ADR-0028](../architecture/adr/ADR-0028-governed-authority-to-public-source-promotion-system.md)
5. [extension-execution-policy.md](./extension-execution-policy.md)
6. [current-state.md](./current-state.md)
7. [release-procedure.md](../release-procedure.md)
8. [public-github-wiki-authority-map.md](./public-github-wiki-authority-map.md)
9. [public-github-source-publication-ledger.md](./public-github-source-publication-ledger.md)
10. [public-github-source-publication-ledger.json](./public-github-source-publication-ledger.json)

If two documents disagree, the higher document in this list wins until the
lower document is corrected.

## Excluded Inputs

Public GitHub source publication shall not use these as direct publication
sources:

- `docs/requirements/srs.md`
- `docs/requirements/rtm.csv`
- `docs/testing/test-plan.md`
- benchmark-control packets and benchmark-only Dockerfiles
- maintainer-only human-review evidence
- internal wiki staging receipts
- transient shell output
- prior chat messages

Those surfaces may inform internal normalization first, but they do not publish
directly to the public GitHub source repo.

## Publication Rules

- The public GitHub source repo is a curated product surface, not a blind
  mirror of the authority repo.
- Public source publication shall be one-way: normalize in GitLab authority
  first, then promote outward.
- Public source publication shall be recorded in the dedicated public source
  publication ledger, not in the internal GitLab wiki ledger or the public
  GitHub wiki ledger.
- The public source repo shall foreground the Docker-only installed extension
  contract, public devcontainer/Codespaces support, and the checkbox-selected
  two-commit compare flow.
- Internal benchmark governance, control-plane docs, and maintainer review
  material remain excluded from the published public source surface.
