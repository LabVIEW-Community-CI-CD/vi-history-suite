---
name: agent-effectiveness-loop
description: 'Continuously improve agent performance in vi-history-suite. Use after completing tasks to capture friction, update AGENTS/skills, and reduce repeated mistakes for future agents.'
argument-hint: 'Optional focus: tests, onboarding, architecture, tooling'
---

# Agent Effectiveness Loop

## When To Use
- End of a coding task or pull request.
- After discovering missing guidance, repeated mistakes, or avoidable delays.
- When a new workflow should become standard for future agents.

## Iterative Procedure
1. Identify what slowed the task down.
2. Decide the smallest durable fix:
   - `AGENTS.md` for global default behavior.
   - `.github/skills/<name>/SKILL.md` for reusable workflows.
   - Existing docs when the content is user/maintainer-facing.
3. Add links, not duplicate long docs.
4. Keep updates concise and command-oriented.
5. Validate that referenced commands and paths still exist.

## Improvement Targets
- Fewer repeated troubleshooting steps.
- Faster path from request to validated change.
- Better first-pass test success.

## Session Template
Use [assets/retro-template.md](./assets/retro-template.md) to capture improvements before ending a task.

## References
- [AGENTS.md](../../../AGENTS.md)
- [docs/development.md](../../../docs/development.md)
- [docs/testing/test-plan.md](../../../docs/testing/test-plan.md)
