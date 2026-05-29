---
name: Requirement Target Execution
description: "Execute requirement-scoped changes by following the repository SRS and RTM workflow contract."
argument-hint: "Provide target VHS-REQ ID and scope"
agent: "agent"
---

Execute a requirement-targeted change in this repository.

Required process:
1. Read [docs/requirements/srs.md](../../docs/requirements/srs.md) and find the target requirement block.
2. Read the matching row in [docs/requirements/rtm.csv](../../docs/requirements/rtm.csv).
3. Inspect implementation and verification references before editing.
4. Implement only the accepted scope and keep out-of-scope boundaries explicit.
5. Update requirements artifacts together when behavior or evidence paths changed.
6. Run validation commands and summarize results factually.

After implementation and validation are complete, use [PR Handoff Evidence](./pr-handoff-evidence.prompt.md) to format the PR evidence block.

Required validation commands:
- npm run traceability:audit
- npm run check
- npm test
- npm run docs:links
- npm run customization:audit (required when customization surfaces changed)

Required PR evidence fields:
- Linked issue (required)
- Target requirement (required)
- Validation commands (required)
- Traceability / RTM impact (required)
- Out-of-scope (required)
- Closeout readiness (required)

If any required input is missing, ask for it before finalizing the output.
