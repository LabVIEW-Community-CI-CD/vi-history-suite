---
name: PR Handoff Evidence
description: "Generate a requirement-targeted PR evidence block aligned to the repository contract."
argument-hint: "Provide issue number, requirement ID, commands, RTM impact, out-of-scope, readiness"
agent: "agent"
---

Generate a PR evidence block that matches the required fields in [.github/pull_request_template.md](../pull_request_template.md) and the PR evidence contract in [docs/testing/test-plan.md](../../docs/testing/test-plan.md).

If you are still implementing requirement-scoped changes, run [Requirement Target Execution](./requirement-target-execution.prompt.md) first.

Use user-provided values when available. If a required field is missing, include `TODO` for that field.

Output exactly this structure:

```markdown
- **Linked issue (required):** Refs #<issue>
- **Target requirement (required):** VHS-REQ-<id>
- **Validation commands (required):** <commands>
- **Traceability / RTM impact (required):** <none or files>
- **Out-of-scope (required):** <boundaries>
- **Closeout readiness (required):** <ready|not ready + blocker issue>
```

Constraints:
- Keep each line concise and factual.
- Do not invent command results.
- Preserve exact field labels so DoD documentation checks remain aligned.
