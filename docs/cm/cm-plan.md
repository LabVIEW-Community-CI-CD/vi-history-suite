# Configuration Management Plan

## Scope

This plan is the compact configuration-management proof map for VI History
Suite. It does not replace the operating runbooks; it points auditors and
maintainers to the committed evidence that controls baselines, change flow,
status accounting, and release closeout.

## Controlled Baselines

| Baseline | Control Evidence | Status Accounting Evidence |
| --- | --- | --- |
| Marketplace release | Exact `vX.Y.Z` tag reachable from `main` | `release-evidence/**`, Marketplace listing verification, and the tagged workflow run |
| Integration baseline | `develop` with required hosted CI | Pull request checks, branch governance summary, and traceability/DoD gate reports |
| Requirement baseline | `docs/requirements/syrs.md`, `docs/requirements/srs.md`, `docs/requirements/rtm.csv`, `docs/requirements/id-index.csv` | `npm run traceability:audit` and requirement-quality evidence |
| Package baseline | `package.json`, `package-lock.json`, generated VSIX | `npm run package`, package audit output, and release artifact retention |

## Change Control

Normal work flows from `feature/<issue#>-*` into `develop`; focused `fix/*`
branches target a feature branch; release and hotfix branches promote to
`main` only through `release/vX.Y.Z` or `hotfix/vX.Y.Z`. The authoritative
branch rules and release steps are maintained in
[Maintainer Operations](../maintainer-operations.md) and enforced by the
`Branch Governance` step in `.github/workflows/ci.yml`.

Requirement-scoped changes update SRS, RTM, ID index, test plan, and
traceability inventory together when scope changes. The local
`npm run traceability:audit` command is the status check for unmapped or stale
requirement evidence.

## Status Accounting

Closeout evidence is the status-accounting packet for standards and release
umbrella issues. For standards closeout, run:

```shell
npm run closeout:evidence -- --kind standards --issue <issue-number> --run-gates --save-dir assurance-closeout-evidence
```

With `--run-gates`, closeout runs traceability, docs links, DoD, typecheck,
unit tests, coverage-to-traceability mapping, and package validation before
making a closure decision. The `coverage:map` report is risk intelligence: it
identifies low-coverage requirement-mapped files and zero-coverage supporting
files tied to active requirements, while Vitest remains the threshold gate.

For release readiness, retain the standards-review outputs for quick triage,
release gate, and user-information review alongside closeout evidence:

```shell
python3 /home/sergio/.codex/skills/repo-standards-review/scripts/run_assurance.py . --profile quick-triage
python3 /home/sergio/.codex/skills/repo-standards-review/scripts/run_assurance.py . --profile release-gate
python3 /home/sergio/.codex/skills/repo-standards-review/scripts/run_assurance.py . --profile 26514-review
```

## User-Information Review Trigger

Re-run the `26514-review` lane whenever README, SUPPORT, TROUBLESHOOTING,
bundled documentation, Marketplace-facing package metadata, or installed help
copy changes. Treat missing user entry, support, audience, or navigation
signals as release-readiness follow-up before publishing.

## Documentation Workbench Status

The current GitHub checkout does not expose a repo-native documentation
workbench. The standards detector should report `supported: false` until all of
these surfaces exist together:

- `docker/docs-authoring/Dockerfile`
- `docs/documentation-workbench.md`
- `package.json` script `docs:gate`

Until then, use the host-side standards runner or the explicit Docker standards
runner documented in the closeout runbook. Do not treat expected workbench paths
from the detector as proof that a documentation-package workbench is available.

## Evidence Map

| Need | Primary Evidence |
| --- | --- |
| Baseline identification | `package.json`, exact release tags, `marketplace-release` workflow |
| Change control | `CONTRIBUTING.md`, `docs/maintainer-operations.md`, `.github/workflows/ci.yml` |
| Status accounting | `npm run closeout:evidence`, `closeout-summary.json`, release evidence artifacts |
| Coverage risk follow-up | `npm run coverage:map`, `coverage/coverage-summary.json`, RTM and inventory |
| User-information posture | `repo-standards-review --profile 26514-review` output |
