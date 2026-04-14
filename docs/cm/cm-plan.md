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
| Source repo | Code | sole author | `develop` is the working integration branch, `feature/*` branches are cut from `develop` and merge back into `develop`, `release/*` branches are cut from `develop`, merge into `main`, merge back into `develop`, and are deleted only after both merges complete, and `main` remains the protected exact-release line |
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
- Public default branch: `main`
- Integration branch: `develop`
- Release-candidate branch family: `release/*`
- Hotfix branch family: `hotfix/*`
- Feature branches are cut from `develop` and merge back into `develop`
- Release branches are cut from `develop`, merge into `main`, and merge back into `develop`
- Delete the release branch only after both merges complete
- Promotion rule: `feature/*` branches are cut from `develop` and merge back into `develop`; `release/*` branches are cut from `develop`, merge into `main`, merge back into `develop`, and are deleted only after both merges complete; `hotfix/*` branches are cut from `main`, merge into `main`, merge back into `develop`, and are deleted only after both merges complete
- Tag rule: cut immutable exact-version tags from green `main` only
- Protected-branch rule: rely on required checks instead of operator memory

## Change Control

| Change Type | Approval | Timing |
| --- | --- | --- |
| Standard | sole author | normal workflow |
| Urgent | sole author | immediate |
| Concession | sole author | explicitly documented |

## Documentation Impact And Role Mapping

- The governed documentation package under `docs/` is a managed configuration
  surface, not informal commentary.
- The docs package is a bounded document set for change-control purposes.
- Any documentation impact assessment must consider command behavior, release flow,
  claim boundary, route or support posture, and accessibility baseline.
- Release-control packet and release-facing proof surfaces move with the branch
  and release-control doctrine that authorizes them.

| Documentation role | Current owner | Current rule |
| --- | --- | --- |
| information developer | sole author | update or confirm docs when a governed surface is reviewed, changed, or confirmed |
| approving authority | sole author | approve release-control and claim-boundary changes before promotion |

## Status Accounting

- Record location: Git history and GitLab pipelines
- Release record owner: sole author
- Audit trail: repository commits, tags, and CI artifacts
