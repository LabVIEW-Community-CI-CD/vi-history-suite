# GitHub Develop Runtime-Contract Audit Bridge Iteration

## Purpose

This governed iteration records the first real public-sibling use of the
`runtime-contract-host-provider-v1` bridge after GitHub and GitLab aligned on
the same branch flow. GitHub public sibling work targets `develop`; `main`
remains the public default release branch.

## Slice

- Slice: `runtime-contract-host-provider-v1`
- Target feature: `runtime-contract-host-provider`
- Governed work item:
  <https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/29>
- GitHub umbrella:
  <https://github.com/svelderrainruiz/vi-history-suite/issues/101>
- GitHub child issues:
  - <https://github.com/svelderrainruiz/vi-history-suite/issues/102>
  - <https://github.com/svelderrainruiz/vi-history-suite/issues/103>
  - <https://github.com/svelderrainruiz/vi-history-suite/issues/104>

## Branch Flow

Before public audit work, Codex ran the fork/defork guard against
`svelderrainruiz/vi-history-suite`:

- `isFork`: `false`
- default branch: `main`
- visibility: `PUBLIC`
- viewer permission: `ADMIN`

Because the GitHub and GitLab authorities now both use a `develop` integration
branch, public bridge work first synchronized GitHub `develop` with `main`:

- PR #105: <https://github.com/svelderrainruiz/vi-history-suite/pull/105>
- Base: `develop`
- Head: `codex/sync-develop-with-main-47ffce0`
- Merged at: `2026-05-17T05:56:25Z`
- Merge commit: `99babd2f43309a8188c87fade2d5f8256d3dca40`
- Checks:
  - `public-source-package-preview`: pass
  - `public-linux-installed-user-smoke`: pass
  - `public-windows-installed-user-contract`: pass

## Audit Outcome

Codex audited the public GitHub `develop` branch against the imported
requirements packet and Spec Kit ledger, then merged the fix through:

- PR #106: <https://github.com/svelderrainruiz/vi-history-suite/pull/106>
- Base: `develop`
- Head: `codex/runtime-contract-host-provider-v1-audit`
- Commit: `1fc4811`
- Merged at: `2026-05-17T06:01:33Z`
- Merge commit: `ab6c600dba01219b31808d150e8927b7e15b738e`
- Checks:
  - `public-source-package-preview`: pass
  - `public-linux-installed-user-smoke`: pass
  - `public-windows-installed-user-contract`: pass

The audit found that public runtime behavior and public documentation already
matched the imported runtime-contract semantics. The public sibling was missing
two verification artifacts named by the imported test plan:

- `tests/unit/publicFixtureValidation.test.ts`
- `tests/unit/windowsDockerDesktopProofIntake.test.ts`

PR #106 added those test artifacts, included them in the public `npm test`
contract, and marked the Spec Kit task ledger complete with the bridge
classification.

## Bug-Oracle Classification

- Classification: `implementation-defect-candidate`
- Why not `requirement-defect-candidate`: the same wrong behavior was not
  observed in both authorities.
- Why not `requirement-clarification-candidate`: the imported runtime
  requirements were sufficiently clear; the missing coverage was a public
  verification implementation gap.
- Requirement semantics changed: `false`
- Public mutation required: `true`

## Redaction Boundary

The public import remained requirements-only. PR #106 changed only public
GitHub artifacts:

- `.specify/specs/runtime-contract-host-provider-v1/tasks.md`
- `package.json`
- `tests/unit/publicFixtureValidation.test.ts`
- `tests/unit/publicRepoPackageSurface.test.ts`
- `tests/unit/windowsDockerDesktopProofIntake.test.ts`

The changed public artifacts were scanned for private paths, credential terms,
GitLab-only tooling names, and the private standards-review skill name. No private
bridge evidence crossed into the public sibling repository.

## Validation

Local GitHub validation before PR #106:

```bash
npm exec -- vitest run tests/unit/publicFixtureValidation.test.ts tests/unit/windowsDockerDesktopProofIntake.test.ts tests/unit/localRuntimeSettingsCli.test.ts tests/unit/comparisonRuntimeLocator.test.ts tests/unit/publicRepoPackageSurface.test.ts
npm run check
npm test
npm run package:audit
git diff --check
```

GitHub Actions validation for PR #106:

- `public-source-package-preview`: pass
- `public-linux-installed-user-smoke`: pass
- `public-windows-installed-user-contract`: pass

## Closeout

GitHub child issues #102, #103, and #104 were closed explicitly after PR #106
merged because the PR targeted `develop`, not the default branch. GitHub
umbrella issue #101 remains open until this GitLab retained closeout merges, so
the public side can point back to the governed retained record.

The public imported requirement packet remains unchanged. The bridge iteration
adds retained GitLab evidence that GitHub `develop` is now the public sibling
target for future Spec Kit bridge work.
