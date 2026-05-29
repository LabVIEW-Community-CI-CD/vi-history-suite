# Copilot Web Issue Generation Prompt (Requirement Waves)

Use this committed guidance to create future Copilot Web issue waves from active
requirements evidence or bounded field evidence that reveals a missing
requirement. Do not treat chat history as source authority.

## Inputs (Fail Closed If Missing)

- `docs/requirements/srs.md`
- `docs/requirements/rtm.csv`
- `docs/requirements/README.md`
- `docs/requirements/syrs.md`
- `docs/requirements/id-index.csv`
- `.github/ISSUE_TEMPLATE/requirement_target.yml`

If any required file is missing, stop and return no issue candidates.

## Requirements-First, RTM-First Flow

1. Build candidates only from active `VHS-REQ-*` blocks in `srs.md`.
2. For each candidate requirement, read its matching `rtm.csv` row before
   drafting issue text.
3. Use implementation and verification references from RTM to seed
   **Files To Inspect**, **Required Tests**, and **Validation Commands**.
4. Keep requirement IDs first-class in the title (`Target VHS-REQ-###: ...`) and
   in issue body fields.
5. Avoid duplicates by checking for existing open issues already targeting the
   same requirement ID and outcome.

## Decision-Complete Issue Payload

Requirement-target issues must be decision-complete before implementation
starts. Candidate issue bodies must include:

- `requirement_id`
- `files_to_inspect`
- `acceptance_criteria`
- `validation_commands`
- `out_of_scope`
- `requirement_updates` (explicit requirement/RTM update expectation)
- optional `copilot_prompt` (bounded prompt aligned to the same requirement and
  scope)

## Requirement-Gap Wave Flow

Use this lane only when bounded field evidence shows that no active SRS
requirement adequately covers the intended work. In that case:

1. In the authoring issue, target `VHS-REQ-601` until the proposed requirements
   exist in `srs.md`, `rtm.csv`, and `id-index.csv`.
2. Name the source evidence explicitly, including issue numbers, local evidence
   paths, and historical checkout branch/SHA when used.
3. Compare the evidence against active `srs.md`, `rtm.csv`, and `id-index.csv`
   before proposing new IDs.
4. Classify each relevant omission as already covered, restore as
   new/current requirement, superseded by the current GitHub-first model, or
   out of scope.
5. Propose the new requirement IDs, RTM impacts, intake-template impacts, and
   fail-closed checks before drafting implementation work.
6. Keep the wave scoped to requirement authoring. Do not ask Copilot Web to fix
   the field bug in the same issue wave unless a later active requirement
   explicitly targets that implementation.

## Local Evidence And Validation

- When available, use the local `repo-standards-review` skill as an advisory
  compliance aid at:
  `C:\Users\sveld\.codex\skills\repo-standards-review\SKILL.md`
- For local-managed requirement waves, run the local dependency preflight and
  system-scope requirements quality check before treating the wave as
  review-ready:

```powershell
python C:\Users\sveld\.codex\skills\repo-standards-review\scripts\preflight_local_dependencies.py --json
python C:\Users\sveld\.codex\skills\repo-standards-review\scripts\requirements_quality_check.py <repo-root> --requirements-spec-scope system --json
```

- For Copilot Web or remote agents that cannot access maintainer-local skills,
  keep repo-local validation commands required and mark maintainer-local checks
  as advisory evidence to be supplied by a maintainer.
- Do not make a Copilot Web issue fail solely because
  `C:\Users\sveld\.codex\skills\repo-standards-review` is unavailable in the
  remote environment.

## Required Fail-Closed Gates

Reject the wave and return no candidate issues when any of the following occur:

- Missing requirements files listed above.
- Missing required label on the template (`copilot-target`).
- Missing required issue-template fields (`requirement_id`, `problem_statement`,
   `files_to_inspect`, `acceptance_criteria`, `required_tests`,
   `validation_commands`, `out_of_scope`, `requirement_updates`).
- Missing optional `copilot_prompt` slot in the issue template.
- Duplicate requirement-targeted issues for the same requirement/outcome.
- Requirement-gap waves that do not name source evidence, current requirement
  gaps, proposed new IDs, RTM impacts, and fail-closed checks.
- Unresolved placeholders (for example `...`, `TBD`, or `VHS-REQ-###` left in
  final candidate text).
- Untestable acceptance criteria (no observable outcome and no verification
  path).

## Hard Guardrails

- No release/version/publish tasks in requirement-wave issues.
- No credentials, tokens, secrets, or admin-setting changes in requirement-wave
  issues.
- Keep issue text bounded to requirement evidence and RTM-backed work scope.
