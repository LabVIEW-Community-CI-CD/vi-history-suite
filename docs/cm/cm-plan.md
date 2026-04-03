# Configuration Management Plan

## Scope

- Product or service: `vi-history-suite`
- Managed baselines:
  - source code
  - requirements and architecture docs
  - test plan and traceability
  - CI configuration

## Configuration Items

| CI | Type | Owner | Baseline Rule |
| --- | --- | --- | --- |
| Source repo | Code | sole author | `main` is the working integration branch |
| Product docs | Document | sole author | versioned with code changes |
| Authoritative research stack | Document | sole author | updated together with research-alignment and current-state surfaces |
| Repo entrypoint stack | Document | sole author | `README.md`, `docs/product/current-state.md`, and `docs/research/authoritative/research-implementation-index.json` move together when repo meaning changes |
| Forward-looking program docs | Document | sole author | research infrastructure, dashboard epic, queue, and ADR move together when product direction changes |
| Review decision-support docs | Document | sole author | review scenarios and decision-record template move together when dashboard decision-support scope changes |
| Test evidence | Artifact | sole author | regenerated on each CI run |
| Extension package manifest | Build input | sole author | versioned with releases |

## Versioning

- Scheme: `vX.Y.Z`
- Tag trigger: manual semantic release after a governed baseline exists
- Release branch rule: not defined yet; release from `main`

## Change Control

| Change Type | Approval | Timing |
| --- | --- | --- |
| Standard | sole author | normal workflow |
| Urgent | sole author | immediate |
| Concession | sole author | explicitly documented |

## Status Accounting

- Record location: Git history and GitLab pipelines
- Release record owner: sole author
- Audit trail: repository commits, tags, and CI artifacts
