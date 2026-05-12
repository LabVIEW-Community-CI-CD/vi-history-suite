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
11. [public-github-community-validation-intake-promotion-plan-v1.3.10.md](./public-github-community-validation-intake-promotion-plan-v1.3.10.md)
12. [public-github-community-validation-intake-promotion-plan-v1.3.10.json](./public-github-community-validation-intake-promotion-plan-v1.3.10.json)

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
- Exact public `v1.3.16` remains retained at public tag `v1.3.16` peeling to
  `f679023`, while current public `main` now publishes the post-release
  intake-surface normalization at `fe4b1589`.
- The earlier Marketplace community-validation intake facade remains retained
  at `b56fde1` through public PR #45.
- Current public `main` publishes the intake-surface normalization at
  `fe4b1589` through public PR #90 after the installed-user support matrix
  adoption at `90b6e600` through public PR #89; the `1.3.16` exact
  source/release/Marketplace closeout remains retained at `f679023` through
  public PR #88, with public tag `v1.3.16` retained as tag object
  `f6ca389269dac140dc416d76bb4c2ac142664567` peeling to `f679023`. The
  earlier `1.3.14` source/tag handoff remains retained at `f1cb609` through
  public PR #69, with public tag object
  `b6cea29ac68e542a1c792ba18d1cef8cb7ded3ae`; the earlier `1.3.13` Windows
  Docker Desktop proof-intake promotion remains retained at `220111e` through
  public PR #68, and the earlier `1.3.11` canonical Docker fixture docs
  promotion remains retained at `ce6dbd0` through public PR #60.
- The maintained public `develop` candidate for the retained `1.3.9`
  admission-matrix baseline now publishes `11051ac`, and the current retained
  published candidate heads `11051ac` / `141c39e` are now carried in
  `docs/product/public-release-candidate.{md,json}` as historical public proof
  rather than an open exact-release gate.
- Public source publication shall not silently mix the exact-release
  `v1.3.9` source contract, the published `v1.3.9` GitHub release record, the
  now-closed `1.3.9` Marketplace listing, the blocked historical `v1.3.8`
  zero-asset incident, and any later candidate wording on the same maintained
  surface; the exact source publication, its published GitHub release act, the
  separate Marketplace closeout act, the blocked historical incident, and any
  later candidate lane shall stay explicit.
- Public source publication shall be recorded in the dedicated public source
  publication ledger, not in the internal GitLab wiki ledger or the public
  GitHub wiki ledger.
- Marketplace community-validation intake templates and labels are prepared
  under `public-github-source/` in GitLab authority, and the `1.3.10`
  community-validation intake has now been published through protected-branch
  PR #45 after the explicit `publish the public intake now` trigger.
- Future Marketplace community-validation intake promotion shall use the same
  governing handoff: explicit trigger, clean target checkout, public
  protected-branch PR, and a separate label-application step because publishing
  `.github/labels.yml` does not itself update repository labels.
- Exact public `main` shall foreground the host-default Windows local
  `LabVIEWCLI` contract plus bounded expert Docker, public
  devcontainer/Codespaces support, and the checkbox-selected two-commit
  compare flow.
- Maintained public `develop` candidate publication may foreground a later
  candidate contract only after that later line becomes the retained public
  candidate.
- Internal benchmark governance, control-plane docs, and maintainer review
  material remain excluded from the published public source surface.
