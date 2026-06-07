# vi-history-suite Agent Instructions

This file provides concise, actionable guidance for AI coding agents working in this repository. For details, always prefer linking to existing documentation rather than duplicating content.

---

## Quick Reference

### Customization Entry Path
- Use skills for repeatable multi-step workflows tied to repository contracts.
- Use prompts for one-shot output generation with fixed field labels.
- Use file instructions for file-type or folder-specific edit guardrails.
- Use the workflow-governor custom agent for end-to-end execution with branch, validation, and PR-evidence compliance.

### First-Step Decision Matrix
- Requirement-targeted work (`VHS-REQ-*`): start with `.github/skills/requirements-traceability/SKILL.md`, then run `npm run traceability:audit`.
- Customization-surface edits (`AGENTS.md`, `.github/skills/**`, `.github/prompts/**`, `.github/instructions/**`, `.github/agents/**`): run `npm run customization:audit` before PR handoff and include it in PR evidence validation commands.
- General implementation and test work: start with `.github/skills/testing-automation/SKILL.md`, then run `npm run check` and `npm test`.
- First-run/setup questions: start with `.github/skills/onboarding/SKILL.md`.

### Build & Test Commands
- **Build:** `npm run compile`
- **Test:** `npm test`
- **Customization Audit:** `npm run customization:audit`
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
- Branch/PR flow (`fix/* -> feature/<issue#>-* -> develop -> main`) is enforced by the hosted CI Branch Governance step; feature branches MUST reference an issue. See [Branch and PR Flow](./CONTRIBUTING.md#branch-and-pr-flow).

### Common Pitfalls / Environment Issues
- Requires Node.js and npm (see [INSTALL.md](./INSTALL.md))
- Some scripts/tools expect a Linux environment (see [scripts/](./scripts/) and [docs/vagrant.md](./docs/vagrant.md))
- Integration tests may require specific Git setup or Vagrant (see [docs/vagrant.md](./docs/vagrant.md))
- Workflow contract tests can become brittle if they assert exact single-line `run:` snippets; prefer step-name ordering checks when CI steps use multiline `run: |` blocks.
- On Linux closeout runs, pass `--skill-root /home/sergio/.codex/skills/repo-standards-review` or set `REPO_STANDARDS_REVIEW_ROOT` when the default Windows standards skill cache path is unavailable.
- In Codespaces, the ambient `GITHUB_TOKEN`/`GH_TOKEN` is read-only for this repo (push, `gh issue create`, and `gh pr create` fail with 403 / "Resource not accessible by integration"). Run `unset GITHUB_TOKEN GH_TOKEN` and authenticate with `gh auth login --web` (device flow) before any push/issue/PR, and keep unsetting it per command in shells that re-inherit it.
- Vitest only includes `tests/unit/**` (see `vitest.config.ts`). Ad-hoc or manual bench drivers placed elsewhere report "No test files found"; put a temporary driver under `tests/unit/` to run it, then delete it (do not ship drivers that spawn external runtimes such as a LabVIEW container).
- Run `npm ci` before invoking `node_modules/.bin/vitest` in a fresh clone. Bare `npx vitest` triggers an interactive package-download prompt that hangs piped/non-interactive commands.
- Stale `node_modules` surfaces as version-pin assertion failures, not generic errors. Example: `tests/unit/marketplaceListingVerification.test.ts` fails with `Expected @vscode/vsce@<pinned>, but resolved @vscode/vsce@<old>` when `node_modules` predates a `package.json`/`package-lock.json` bump; `npm ci` resyncs and clears it.
- Unit tests run on Linux CI but should stay separator-agnostic so they also pass on Windows dev hosts. Assert staged-path layout via normalized separators (e.g. `value.replace(/\\/g, '/')`) or `path.join`-derived expected values, never hard-coded POSIX strings; production `buildStagedRevisionPlan` mixes a raw `treeRoot` with `path.join` paths that diverge on win32.
- `npm run validation:file-gap` (`scripts/fileLinuxValidationGap.js`) files a GitHub issue via `gh issue create` by default. When reproducing an already-filed #259-derived gap from a retained run directory (not a fresh maintainer run), pass `--dry-run` so it composes `linux-validation-gap-issue.md` without filing a duplicate.
- For troubleshooting, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) and [SUPPORT.md](./SUPPORT.md)

### Troubleshooting Route
- First-run or environment blockers: `.github/skills/onboarding/SKILL.md` then [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
- Comparison runtime failures (including cold-launch `-350000` / `labview-cli-connection-failed`): open the diagnostics manifest at `<runDir>/diagnostics/diagnostics-manifest.json` first, then see the [Cold-launch comparison failures](./TROUBLESHOOTING.md#cold-launch-comparison-failures-350000-labview-cli-connection-failed) section.
- Gate and CI failures: `.github/skills/testing-automation/SKILL.md` and the PR gate script.
- Requirement or RTM drift: `.github/skills/requirements-traceability/SKILL.md` before editing requirements artifacts.

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
- [Branch and PR Flow](./CONTRIBUTING.md#branch-and-pr-flow)
- [Maintainer Operations](./docs/maintainer-operations.md)
- [Vagrant Guide](./docs/vagrant.md)
- [Contributing](./CONTRIBUTING.md)
- [Security Policy](./SECURITY.md)

---

**Note:** For any unclear or missing conventions, consult the linked documentation or ask for clarification in the repository discussions.
