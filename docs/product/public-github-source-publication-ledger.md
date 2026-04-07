# Public GitHub Source Publication Ledger

## Purpose

Retain the actual publication state of the curated public GitHub source repo so
future sessions can distinguish public source publication from internal GitLab
wiki publication and public GitHub wiki publication.

The machine-readable companion surface for this ledger is:

- `docs/product/public-github-source-publication-ledger.json`

Current published public GitHub source HEAD: `d787f2d`

## Publications

| Published Surface | Repo Path | Status | Published | Repo Commit | Primary Authority |
| --- | --- | --- | --- | --- | --- |
| Public source product repo baseline | `github.com/svelderrainruiz/vi-history-suite` | published | `2026-04-06` | `bf0cb2d` | `README.md`; `docs/architecture/adr/ADR-0028-governed-authority-to-public-source-promotion-system.md`; `docs/product/public-github-source-authority-map.md` |
| Public source hosted Linux bootstrap refresh | `github.com/svelderrainruiz/vi-history-suite` | published | `2026-04-07` | `4a8b27b` | `README.md`; `docs/architecture/adr/ADR-0010-dual-host-extension-proof-and-linux-bootstrap.md`; `docs/product/public-release-candidate.md` |
| Public source v1.0.0 release refresh | `github.com/svelderrainruiz/vi-history-suite` | published | `2026-04-06` | `d787f2d` | `README.md`; `CHANGELOG.md`; `docs/product/public-release-candidate.md` |

## Publication Rules

- The public GitHub source repo is not considered published from authority
  normalization alone; it is published only when the curated source commit is
  pushed to the public GitHub source repository.
- Every actual public source publication shall be recorded here with the
  published date, public repo commit, and primary authority docs.
- This ledger does not imply anything about public GitHub wiki publication or
  the internal GitLab maintainer wiki.
