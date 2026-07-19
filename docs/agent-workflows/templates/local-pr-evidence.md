# Local PR evidence (pre-PR draft)
#
# A background/sub agent fills this out after implementing a change, so the
# delegating agent can review evidence locally before opening a real PR. The
# field labels match the enforced anchors in .github/pull_request_template.md
# (checked by scripts/checkDefinitionOfDone.js), so a completed draft pastes
# straight into a real PR body. Delete this comment block when filling it in.

## Requirement-Targeted PR Evidence (lightweight)

- **Linked issue (required):** `Refs #<issue>` (or the local proposal file path)
- **Target requirement (required):** `VHS-REQ-...` (or `none — infra`)
- **Validation commands (required):** commands run for this change, with results
- **Traceability / RTM impact (required):** `none` or the updated docs/requirements files
- **Out-of-scope (required):** what this change intentionally does not touch
- **Closeout readiness (required):** `ready` / `not ready` (+ blocking follow-up issue if not ready)

## Gate results (paste actual output tails)

- `npm run check`:
- `npm test`:
- `npm run adr:check`:
- `npm run traceability:audit`:
- `npm run docs:links`:
- `npm run standards:audit`:
