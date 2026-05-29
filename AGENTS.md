# vi-history-suite Agent Instructions

This file provides concise, actionable guidance for AI coding agents working in this repository. For details, always prefer linking to existing documentation rather than duplicating content.

---

## Quick Reference

### Build & Test Commands
- **Build:** `npm run compile`
- **Test:** `npm test`
- **Integration Test Build:** `npm run test:integration:compile`
- **Dev Watch:** `npm run dev:watch`
- **Check:** `npm run check`
- **Package:** `npm run package`

### Priority Area: Testing Automation
- Start here for most code changes: `npm run check` then `npm test`
- Before PR handoff, run the full gate sequence with:
	- `bash .github/skills/testing-automation/scripts/run-pr-gates.sh --skip-install`
- Use clean install mode when needed:
	- `bash .github/skills/testing-automation/scripts/run-pr-gates.sh`
- After validation, use `.github/skills/pr-handoff-evidence/SKILL.md` to produce PR evidence fields

### Priority Area: Requirement-Targeted Work
- If a task names `VHS-REQ-*`, start with `.github/skills/requirements-traceability/SKILL.md`
- Read the requirement block and RTM row before editing implementation files
- Run `npm run traceability:audit` before PR handoff when requirement surfaces changed

### Architecture & Key Directories
- `src/extension.ts`: VS Code extension entry point
- `src/cli/`: CLI entrypoints
- `src/commands/`: VS Code command implementations
- `src/dashboard/`: Dashboard/reporting logic
- `src/domain/`: Core domain models
- `src/git/`: Git integration
- `src/indexing/`: Indexing logic
- `src/reporting/`: Report generation and execution
- `src/review/`: Human review and scenario registry
- `src/scenarios/`: Decision records and scenario logic
- `src/services/`: Service layer
- `src/support/`: Support policies
- `src/tooling/`: Build/dev host tooling
- `src/ui/`: UI components
- `tests/`: Unit and integration tests
- `docs/`: Architecture, requirements, and runbooks

### Project Conventions
- TypeScript throughout; strict module boundaries by directory
- Command, dashboard, and service logic separated by folder
- Domain logic isolated in `domain/`
- Use of `Action` suffix for command/operation files
- Integration with Git via both API and CLI wrappers

### Common Pitfalls / Environment Issues
- Requires Node.js and npm (see [INSTALL.md](./INSTALL.md))
- Some scripts/tools expect a Linux environment (see [scripts/](./scripts/) and [docs/vagrant.md](./docs/vagrant.md))
- Integration tests may require specific Git setup or Vagrant (see [docs/vagrant.md](./docs/vagrant.md))
- For troubleshooting, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) and [SUPPORT.md](./SUPPORT.md)

### Agent Skills (Workspace)
- `.github/skills/testing-automation/SKILL.md`: prioritized testing and PR-gate workflow
- `.github/skills/onboarding/SKILL.md`: first-run and environment setup workflow
- `.github/skills/agent-effectiveness-loop/SKILL.md`: iterative guidance upgrades after task completion
- `.github/skills/requirements-traceability/SKILL.md`: requirement-targeted execution and RTM alignment workflow
- `.github/skills/pr-handoff-evidence/SKILL.md`: PR evidence drafting workflow aligned to the PR template contract

### Agent Prompts (Workspace)
- `.github/prompts/pr-handoff-evidence.prompt.md`: one-shot PR evidence block generation with required field labels
- `.github/prompts/requirement-target-execution.prompt.md`: requirement-targeted execution workflow with SRS and RTM checkpoints

### Custom Agents (Workspace)
- `.github/agents/workflow-governor.agent.md`: task execution with branch policy, requirement traceability, test gates, and PR evidence compliance

### File Instructions (Workspace)
- `.github/instructions/reporting-orchestration.instructions.md`: guardrails for report orchestration files in `src/reporting/**`
- `.github/instructions/unit-tests.instructions.md`: deterministic unit-test patterns for `tests/unit/**/*.test.ts`
- `.github/instructions/requirements-and-test-docs.instructions.md`: requirements and test-plan contract alignment in `docs/requirements/**` and `docs/testing/**`
- `.github/instructions/scripts-validation.instructions.md`: script contract and cross-platform safety guidance for `scripts/**/*.js`

### Iterative Improvement Rule
At the end of substantial tasks, improve the agent guidance in the same PR when you discover friction.

1. Capture one blocker or delay encountered.
2. Apply the smallest durable update to `AGENTS.md` or a relevant skill.
3. Prefer links to existing docs rather than duplicated prose.
4. Verify referenced commands and paths still work.

### Key Documentation Links
- [Architecture Overview](./docs/architecture/overview.md)
- [Requirements](./docs/requirements/README.md)
- [Test Plan](./docs/testing/test-plan.md)
- [Development Guide](./docs/development.md)
- [Maintainer Operations](./docs/maintainer-operations.md)
- [Vagrant Guide](./docs/vagrant.md)
- [Contributing](./CONTRIBUTING.md)
- [Security Policy](./SECURITY.md)

---

**Note:** For any unclear or missing conventions, consult the linked documentation or ask for clarification in the repository discussions.