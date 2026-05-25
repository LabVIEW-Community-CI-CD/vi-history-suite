# Copilot Web Issue Generation Prompt

This document provides reusable guidance for creating requirement-scoped GitHub
issues for Copilot Web implementation. Requirements are the source of truth.
Each issue must be a narrow work contract that starts from one active
`VHS-REQ-*` requirement, uses RTM evidence, and can be implemented from GitHub
alone without chat context.

## Operating Principle

Create fewer, stronger issues. A weak issue is one that does not name a
requirement, does not point to RTM evidence, duplicates an existing issue, has
untestable acceptance criteria, or asks Copilot to infer project context from
prior chat. Do not create weak issues.

## Important Guardrails

Do not edit code, commit files, open PRs, publish releases, change Marketplace
credentials, rotate tokens, register runners, or modify repository settings.
The job of this prompt is issue creation only.

## Repository Boundary

- Create issues only in `LabVIEW-Community-CI-CD/vi-history-suite`.
- Do not create issues in `svelderrainruiz/vi-history-suite`.
- Do not create issues in the historical GitLab repository.
- Confirm the target repository before the first issue is created.
- Use explicit repository arguments for GitHub CLI commands:
  ```shell
  gh issue create --repo LabVIEW-Community-CI-CD/vi-history-suite ...
  ```

## Fail-Closed Preflight

Stop before creating issues if:

- The target repository cannot be confirmed as
  `LabVIEW-Community-CI-CD/vi-history-suite`.
- `docs/requirements/srs.md`, `docs/requirements/rtm.csv`, or
  `.github/ISSUE_TEMPLATE/requirement_target.yml` is missing.
- The issue template no longer contains required fields for requirement ID,
  problem statement, files to inspect, acceptance criteria, tests, validation
  commands, out-of-scope boundaries, and requirement/RTM updates.
- GitHub labels cannot be read or if `copilot-target` is missing. Report the
  missing label instead of creating unlabeled issues.
- A specific issue's files-to-inspect list contains repo-relative paths that do
  not exist, unless the path is explicitly a new test file to be created.
- A specific issue's acceptance criteria are not observable and testable.
- A specific issue's body still contains unresolved template placeholders such
  as `<...>`, `VHS-REQ-###`, or `TODO`.

## Local Compliance Aid

- Use the local `repo-standards-review` skill as an advisory compliance aid.
- The skill is local and authoritative for this workflow when available at a
  configured local path such as
  `%USERPROFILE%\.codex\skills\repo-standards-review\SKILL.md`.
- Read that `SKILL.md` before selecting candidates.
- Do not fetch a replacement from the internet.
- If the skill path is unavailable, continue with clearly documented manual
  checks against the repository requirements artifacts and report that the
  local compliance aid was unavailable.
- Run this advisory requirements check before finalizing the issue set when
  the local script is available:
  ```powershell
  python "%USERPROFILE%\.codex\skills\repo-standards-review\scripts\requirements_quality_check.py" <repo-root> --requirements-spec-scope system --json
  ```
- If the requirements quality check fails, classify findings before issue
  creation:
  - If findings indicate broken requirements-package structure, create no
    implementation issues. Produce a draft documentation/requirements issue
    only.
  - If findings are localized quality improvements, treat them as candidate
    signals and include the finding in the relevant issue's problem statement.
  - If findings are unrelated to the selected requirements, report them in the
    final skipped-candidates section.
- Do not edit requirements in this issue-creation session.

## Grounding

Inspect these repository artifacts before choosing candidates:

- `docs/requirements/README.md`
- `docs/requirements/srs.md`
- `docs/requirements/syrs.md`
- `docs/requirements/rtm.csv`
- `docs/requirements/id-index.csv`
- `.github/ISSUE_TEMPLATE/requirement_target.yml`
- existing GitHub labels
- open and closed GitHub issues
- relevant tests and workflows referenced by RTM rows

## Evidence Model

Before creating issues, build an internal candidate table with these columns:

| Column | Description |
| --- | --- |
| requirement ID | Active `VHS-REQ-*` from SRS |
| requirement title | SRS block title |
| requirement status | Must be Active |
| parent SyRS ID | `VHS-SYS-REQ-*` from RTM |
| area | RTM area column |
| RTM implementation references | Files implementing the requirement |
| RTM verification references | Files verifying the requirement |
| related open issues | Issue numbers with same requirement |
| related closed issues | Issue numbers with same requirement |
| observed gap | What improvement or fix is needed |
| proposed type label | `enhancement`, `documentation`, or `bug` |
| recommendation | `create`, `skip`, or `draft-only` |

Only requirements with `Status: Active` in `docs/requirements/srs.md` may become
primary issue targets. Superseded or retired IDs may be mentioned as historical
context only.

## Candidate Selection

- Prefer active `VHS-REQ-*` requirements with high user value, weak or indirect
  tests, unclear diagnostics, evidence gaps, public documentation gaps,
  maintenance friction, or high Copilot usefulness.
- Default wave size: 5 to 8 issues.
- Default granularity: one active `VHS-REQ-*` per issue.
- Use SyRS IDs only as parent/system context, not as the primary work target.
- Skip equivalent open issues.
- Do not reopen closed issues unless explicitly instructed.
- Closed issues may inform scope, but materially different follow-on work gets
  a fresh issue.
- If an RTM row already points to strong direct tests and current
  implementation evidence, prefer a different requirement unless there is a
  clear user-facing or compliance gap.
- If the repo already has enough open Copilot-target issues, create fewer
  issues and explain why.
- Prefer issues that can be completed by Copilot Web in one focused PR.
- Avoid issues that require credentials, local LabVIEW access, Marketplace
  publishing, protected branch administration, or human-only exploratory
  feedback.
- Do not split one requirement into multiple issues unless each issue has a
  distinct acceptance boundary and no overlapping write scope.
- Do not combine unrelated requirements just to reach the default wave size.

## Duplicate Detection

- Search open and closed issues for the exact requirement ID.
- Search open issues for the likely title keywords and affected files.
- Treat an open issue as equivalent if it targets the same requirement and the
  same observable outcome, even if the title differs.
- If creating a follow-on to a closed issue, explain why the new work is
  materially different and reference the closed issue in the body.
- If a candidate overlaps an open issue but adds useful detail, do not create a
  duplicate. Recommend improving the existing issue instead.

## Labels

- Apply `copilot-target` to every issue.
- Add exactly one type label:
  - `enhancement` for implementation or product behavior
  - `documentation` for docs, public metadata, or user-information work
  - `bug` only for confirmed broken behavior
- Do not invent labels during this session.
- If the correct type label is missing, stop and report the missing label
  instead of using a substitute.

## Files To Inspect Rules

- Always include:
  - `docs/requirements/srs.md`
  - `docs/requirements/rtm.csv`
- Include RTM implementation references for the target requirement.
- Include RTM verification references for the target requirement.
- Add only extra files needed to disambiguate the work.
- Prefer repo-relative paths that exist.
- Mark new files explicitly as `(new file expected)` when they do not exist
  yet.
- Do not include broad folders unless the RTM row itself points to a folder and
  the issue explains why.

## Validation Defaults

- Include targeted `npx vitest run` commands for the named tests.
- Include:
  ```powershell
  npm.cmd run check
  npm.cmd test
  ```
- Include `npm.cmd run package` when package metadata, bundled docs, public
  docs, runtime evidence artifacts, or packaging behavior may change.
- If SRS, SyRS, RTM, or ID index changes are expected, include:
  ```powershell
  npx vitest run tests/unit/requirementsDocs.test.ts
  python C:\Users\sveld\.codex\skills\repo-standards-review\scripts\requirements_quality_check.py <repo-root> --requirements-spec-scope system --json
  ```
- Do not include commands that require unavailable secrets, Marketplace tokens,
  or GitHub admin permissions.
- Use Windows-friendly commands because the maintainer workflow commonly runs
  on Windows.

## VI History Suite Guardrails

- Preserve Marketplace identity `svelderrainruiz.vi-history-suite`.
- Keep `LabVIEW-Community-CI-CD/vi-history-suite` as the canonical source, issue
  tracker, support, and release home.
- Keep `main` as the active trunk.
- Keep devcontainer/Codespaces as the primary source-evaluation path.
- Keep Vagrant optional and human-run only.
- Keep Windows/LabVIEW self-hosted validation as maintainer evidence, not a
  public PR gate, unless an existing requirement says otherwise.
- Do not create Marketplace release, version bump, VSIX publication, PAT,
  self-hosted runner registration, or admin-setting tasks unless explicitly
  requested.
- Do not delete, renumber, or silently retire requirement IDs.
- Do not create broad rewrite issues when a requirement-scoped issue would do.
- Do not make GitLab, the personal compatibility fork, or old GitFlow
  governance active again.
- Do not require Vagrant, LabVIEW, Docker, or a self-hosted runner for public
  CI unless an existing requirement explicitly calls for that behavior.
- Do not ask Copilot Web to decide licensing, Marketplace identity, repository
  ownership, or release authority.

## Issue Body Template

```markdown
## Target Requirement

`VHS-REQ-###` - <requirement title>

Parent/system context: `<VHS-SYS-REQ-### if useful>`

## Problem Statement

<Explain the current behavior, evidence gap, diagnostic gap, documentation gap,
or maintenance risk. Tie it directly to the active requirement and the RTM
row.>

Related issue context: <none, or issue numbers with a one-line reason they do
not duplicate this issue>

## Files To Inspect

- docs/requirements/srs.md
- docs/requirements/rtm.csv
- <implementation refs from RTM>
- <verification refs from RTM>
- <only extra files needed>

## Acceptance Criteria

- <Observable, testable outcome>
- <Observable, testable outcome>
- <Observable, testable outcome>
- Any changed behavior, acceptance criteria, implementation refs, verification
  refs, or evidence paths updates SRS and RTM.
- The PR description identifies the target requirement and summarizes
  requirement/RTM changes, or explicitly says none were needed.

## Required Tests

- Add or update <targeted test file>.
- Add or update <targeted test file>.
- Run tests/unit/requirementsDocs.test.ts if SRS, SyRS, RTM, or ID index
  changes.

## Validation Commands

```powershell
npx vitest run <targeted test files>
npm.cmd run check
npm.cmd test
```

<Add this block when package metadata, bundled docs, public docs, runtime
evidence artifacts, or packaging behavior may change.>

```powershell
npm.cmd run package
```

<Add this block when SRS, SyRS, RTM, or ID index changes are expected.>

```powershell
npx vitest run tests/unit/requirementsDocs.test.ts
python C:\Users\sveld\.codex\skills\repo-standards-review\scripts\requirements_quality_check.py <repo-root> --requirements-spec-scope system --json
```

## Out Of Scope

- <Nearby work that must not be changed>
- Marketplace release, version bump, or VSIX publication.
- Credential, token, runner, or admin-setting changes.
- Broad rewrites or unrelated refactors.

## Requirement And RTM Updates

Update SRS and RTM only if this issue changes behavior, acceptance criteria,
implementation refs, verification refs, or evidence paths. If a requirement is
retired or superseded, update id-index.csv rather than deleting the ID
silently.
```

## Issue Quality Gate

Before creating each issue, verify:

- The title starts with `Target VHS-REQ-###:`.
- The requirement ID exists as Active in `docs/requirements/srs.md`.
- The issue body includes every required section from the template.
- Files To Inspect includes `docs/requirements/srs.md` and
  `docs/requirements/rtm.csv`.
- Files To Inspect includes the RTM implementation and verification references
  unless there is a written reason.
- Acceptance criteria are observable and do not require hidden context.
- Required tests name specific files or clearly identify a new test file.
- Validation commands are executable by a maintainer without secrets.
- Out-of-scope boundaries prevent Marketplace, credentials, release, admin, or
  broad rewrite drift.
- Requirement And RTM Updates tells Copilot when to update SRS, RTM, and
  `id-index.csv`.

## Issue Creation Process

1. Confirm repository, labels, issue template, requirements files, and local
   `repo-standards-review` availability.
2. Run the system-scope requirements quality check.
3. Build the candidate table from active requirements, RTM rows, quality-check
   findings, and existing issue coverage.
4. Remove candidates that duplicate open issues.
5. Keep only Copilot-sized work contracts.
6. Create the selected issues in `LabVIEW-Community-CI-CD/vi-history-suite`.
7. Re-read each created issue and verify the title, labels, target requirement,
   and required body sections.
8. If any created issue is malformed, fix the issue body immediately or report
   the exact remediation needed.

## Final Report

After creating issues, report:

- issue number
- title
- URL
- labels
- target requirement
- recommended Copilot Web execution order
- skipped candidates and why
- first issue to implement and why
- whether `repo-standards-review` was available and whether the requirements
  quality check passed
- any existing open issues that should be improved instead of duplicated
- any fail-closed condition encountered

## If GitHub Access Is Unavailable

- Do not guess or claim issues were created.
- Produce draft issue bodies instead.
- Clearly state that GitHub issue creation still needs to be performed.
