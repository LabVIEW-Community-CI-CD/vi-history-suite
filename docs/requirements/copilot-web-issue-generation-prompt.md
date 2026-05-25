# Copilot Web Issue Generation Prompt (Requirement Waves)

Use this committed guidance to create future Copilot Web issue waves from active
requirements evidence. Do not treat chat history as source authority.

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

## Advisory Skill + Quality Check

- When available, use the local `repo-standards-review` skill as an advisory
  compliance aid at:
  `C:\Users\sveld\.codex\skills\repo-standards-review\SKILL.md`
- Before finalizing issue candidates, run the system-scope requirements quality
  check:

```powershell
python C:\Users\sveld\.codex\skills\repo-standards-review\scripts\requirements_quality_check.py <repo-root> --requirements-spec-scope system --json
```

If the skill or quality-check evidence is unavailable, fail closed and return no
final candidate set.

## Required Fail-Closed Gates

Reject the wave and return no candidate issues when any of the following occur:

- Missing requirements files listed above.
- Missing required label on the template (`copilot-target`).
- Missing required issue-template fields (`requirement_id`, `problem_statement`,
  `files_to_inspect`, `acceptance_criteria`, `required_tests`,
  `validation_commands`, `out_of_scope`, `requirement_updates`).
- Duplicate requirement-targeted issues for the same requirement/outcome.
- Unresolved placeholders (for example `...`, `TBD`, or `VHS-REQ-###` left in
  final candidate text).
- Untestable acceptance criteria (no observable outcome and no verification
  path).

## Hard Guardrails

- No release/version/publish tasks in requirement-wave issues.
- No credentials, tokens, secrets, or admin-setting changes in requirement-wave
  issues.
- Keep issue text bounded to requirement evidence and RTM-backed work scope.
