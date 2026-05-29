---
name: pr-handoff-evidence
description: 'Draft requirement-targeted PR evidence blocks for vi-history-suite. Use when preparing PR handoff after validation commands complete.'
argument-hint: 'Optional inputs: issue number and requirement ID'
---

# PR Handoff Evidence

## When To Use
- After implementation changes are complete.
- Before PR review handoff.
- When requirement-targeted evidence must be documented.

## Required Inputs
- Linked issue in `Refs #...` format.
- Target requirement ID in `VHS-REQ-...` format.
- Validation commands that were run.
- Traceability and RTM impact.
- Out-of-scope boundaries.
- Closeout readiness with blocker issue when not ready.

## Procedure
1. Gather the exact validation commands and outcomes.
2. Capture requirement scope and changed surfaces.
3. Determine traceability impact:
   - `none`, or
   - list updated requirements files.
4. Fill all required PR evidence fields using labels from [.github/pull_request_template.md](../../../.github/pull_request_template.md).
5. Keep entries concise and factual.

## Output Format
Use this block in the PR description:

```markdown
- **Linked issue (required):** Refs #<issue>
- **Target requirement (required):** VHS-REQ-<id>
- **Validation commands (required):** <commands>
- **Traceability / RTM impact (required):** <none or files>
- **Out-of-scope (required):** <boundaries>
- **Closeout readiness (required):** <ready|not ready + blocker issue>
```

## Validation Before Handoff
1. `npm run check`
2. `npm test`
3. `npm run dod:gate`
4. `npm run traceability:audit` (when requirements surfaces changed)
5. `bash .github/skills/testing-automation/scripts/run-pr-gates.sh --skip-install` (recommended full sequence)

## References
- [.github/pull_request_template.md](../../../.github/pull_request_template.md)
- [docs/testing/test-plan.md](../../../docs/testing/test-plan.md)
- [scripts/checkDefinitionOfDone.js](../../../scripts/checkDefinitionOfDone.js)
- [.github/skills/testing-automation/SKILL.md](../testing-automation/SKILL.md)
