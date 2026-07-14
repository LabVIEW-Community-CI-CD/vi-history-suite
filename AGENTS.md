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
- Requirement-verification health at a glance: run `npm run requirements:verify` for the single-pane signal (structural integrity, requirement linkage, criterion citation, coverage risk, mutation); use `npm run requirements:verify:strict` as a local pre-push gate.

### Build & Test Commands
- **Build:** `npm run compile`
- **Test:** `npm test`
- **Customization Audit:** `npm run customization:audit`
- **Integration Test Build:** `npm run test:integration:compile`
- **Dev Watch:** `npm run dev:watch`
- **Check:** `npm run check`
- **Package:** `npm run package`
- **Branch protection audit:** `npm run branch-protection:audit`
- **Verification health:** `npm run requirements:verify` (single-pane signal; add `:strict` for a local pre-push gate)

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
- Gauge verification depth: `npm run requirements:linkage` (a test cites the requirement ID; enforced fail-closed in CI), `npm run requirements:criteria` (acceptance-criteria inventory + criterion-level `VHS-REQ-NNN.M` citation; `npm run requirements:criteria:enforce` fails closed and is enforced in CI), and `npm run requirements:verify` (unified health). Stryker mutation testing (`npm run test:mutation`, `src/domain`) runs nightly/advisory via `.github/workflows/mutation.yml`; a ~100% score is not the goal (many domain survivors are equivalent mutants).

### Architecture & Key Directories
- `src/extension.ts`: VS Code extension entry point
- `src/cli/`: CLI entrypoints
- `src/commands/`: VS Code command implementations
- `src/dashboard/`: Dashboard/reporting logic
- `src/domain/`: Core domain models
- `src/git/`: Git integration
- `src/reporting/`: Report generation and execution
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
- On Windows, if `npm` is missing but `winget` is available, install Node.js LTS with `winget install --id OpenJS.NodeJS.LTS --exact --source winget`.
- Some scripts/tools expect a Linux environment (see [scripts/](./scripts/))
- Integration tests may require specific Git setup; Vagrant is an optional local helper, not a release gate (see [docs/vagrant.md](./docs/vagrant.md))
- Workflow contract tests can become brittle if they assert exact single-line `run:` snippets; prefer step-name ordering checks when CI steps use multiline `run: |` blocks.
- Run `npm run branch-protection:audit -- --all` when branch-protection settings are part of the question; it reads live `develop`/`main` protection through `gh` and fails if required checks, duplicate required-check contexts, required-check source consistency, unexpected required contexts, required-check app bindings, branch protection section keys, branch protection flag section keys, required status check section keys, required status check object keys, pull request review section keys, active branch rulesets, unexpected active branch rulesets, duplicate active branch rulesets, ruleset target/enforcement, ruleset sources, ruleset section keys, ruleset condition keys, ruleset ref_name keys, ruleset rule counts, ruleset rule keys, ruleset deletion/non-fast-forward rules, unexpected ruleset rules, duplicate ruleset rules, ruleset ref exclusions, ruleset bypass posture, required deployment gates, push restrictions, accidental branch locks, fork-syncing allowance, or core protection flags drift. Use `npm run branch-protection:audit -- --all --require-advisory` to dry-run hardening advisory checks such as Requirements CSV Integrity and CodeQL into required contexts; it is expected to fail until live protection includes those checks. Use `--require-review`, `--require-stale-review-dismissal`, `--require-code-owner-review`, `--require-last-push-approval`, `--require-branch-creation-block`, `--require-linear-history`, `--require-conversation-resolution`, and `--require-signed-commits` to dry-run approving-review, review-subsetting, branch-creation, linear-history, conversation-resolution, and signed-commit gates; they are expected to fail until live protection includes those gates.
- Merging multiple PRs into `develop` is serial, not parallel: `develop` requires branches to be up to date, so after one merge every other open PR goes `BEHIND` and `gh pr merge` fails with "N of N required status checks are expected". Run `gh pr update-branch <N>` and wait for the full CI re-run before merging the next. See [Branch and PR Flow](./CONTRIBUTING.md#branch-and-pr-flow).
- Before opening a new PR, run `gh pr list --repo LabVIEW-Community-CI-CD/vi-history-suite --state open` so you do not duplicate maintainer or agent work already in flight.
- Avoid stacking PRs (child PR based on another PR's head) when you intend to `gh pr merge --delete-branch` the base: deleting the base head branch on merge auto-closes the child PR (GitHub does not retarget it), and a closed PR whose base branch is gone cannot be reopened or retargeted — you must recreate it from the still-existing head branch against `develop`. Prefer branching each separable change off `develop` independently.
- On Linux closeout runs, pass `--skill-root /home/sergio/.codex/skills/repo-standards-review` or set `REPO_STANDARDS_REVIEW_ROOT` when the default Windows standards skill cache path is unavailable.
- In Codespaces, the ambient `GITHUB_TOKEN`/`GH_TOKEN` is read-only for this repo (push, `gh issue create`, and `gh pr create` fail with 403 / "Resource not accessible by integration"). Run `unset GITHUB_TOKEN GH_TOKEN` and authenticate with `gh auth login --web` (device flow) before any push/issue/PR, and keep unsetting it per command in shells that re-inherit it.
- If `gh pr create` reports that no default remote repository has been set, pass `--repo LabVIEW-Community-CI-CD/vi-history-suite` on the command instead of changing global `gh` defaults.
- Vitest only includes `tests/unit/**` (see `vitest.config.ts`). Ad-hoc or manual bench drivers placed elsewhere report "No test files found"; put a temporary driver under `tests/unit/` to run it, then delete it (do not ship drivers that spawn external runtimes such as a LabVIEW container).
- Run `npm ci` before invoking `node_modules/.bin/vitest` in a fresh clone. Bare `npx vitest` triggers an interactive package-download prompt that hangs piped/non-interactive commands.
- Stale `node_modules` surfaces as version-pin assertion failures, not generic errors. Example: `tests/unit/marketplaceListingVerification.test.ts` fails with `Expected @vscode/vsce@<pinned>, but resolved @vscode/vsce@<old>` when `node_modules` predates a `package.json`/`package-lock.json` bump; `npm ci` resyncs and clears it.
- Devcontainer bootstrap runs on Debian Bookworm; do not add `libei1` to the Debian apt package list. `.devcontainer/devcontainer-lock.json` is generated resolver output and should stay ignored/excluded from traceability inventory.
- Unit tests run on Linux CI but should stay separator-agnostic so they also pass on Windows dev hosts. Assert staged-path layout via normalized separators (e.g. `value.replace(/\\/g, '/')`) or `path.join`-derived expected values, never hard-coded POSIX strings; production `buildStagedRevisionPlan` mixes a raw `treeRoot` with `path.join` paths that diverge on win32.
- `npm run validation:file-gap` (`scripts/fileLinuxValidationGap.js`) files a GitHub issue via `gh issue create` by default. When reproducing an already-filed #259-derived gap from a retained run directory (not a fresh maintainer run), pass `--dry-run` so it composes `linux-validation-gap-issue.md` without filing a duplicate.
- The `vihs-test-harness-lvdependency` fixture (Section B of #259; [docs/testing/test-plan.md](./docs/testing/test-plan.md)) is not present or cloneable on the maintainer host (no org repo; commits `35b92bc`/`299c2a5` not resolvable locally). For Section B / VHS-REQ-624 staged-tree validation, substitute the icon-editor `lv_icon.vi` (a real tracked VI with real in-repo dependencies) — it exercises the same `materializedTree` plus renamed `left-*`/`right-*` staged-tree contract.
- Validating a Windows-container feature via `docker run` in the integrated terminal shows the container's exit code but NOT its stdout (a terminal-integration artifact). Route container output to a bind-mounted file to inspect it, or drive the render through Node `child_process` (`execFileAsync`, which the extension itself uses) — that captures container stdout correctly, so a `tests/unit/**` throwaway driver sees the output the terminal hides.
- A spurious `^C` sometimes interrupts `git push`, `gh issue create`, or `gh pr create` in the integrated PowerShell terminal even when the command is fine — just re-run it (the prior attempt has usually already succeeded or is safe to retry; confirm with `git log` / `gh issue list` if unsure).
- In PowerShell, quote stash refs containing braces (e.g. `git stash show --name-status 'stash@{0}'`); unquoted `stash@{0}` is parsed as separate tokens and fails with `Too many revisions specified`.
- On Windows, the integrated PowerShell terminal can hang after `gh`/`git` commands that open a pager or the alternate screen (e.g. `gh ... --watch`, or default-pager `gh pr view`/`gh run view`): the prompt shows a bare `^C` and later commands emit no output until a fresh terminal is opened. For non-interactive maintainer/agent sessions set `$env:GH_PAGER='cat'` and `git config core.pager cat`, avoid `gh ... --watch` (poll a single `gh run view <id> --json status,conclusion` read instead), and keep `jq` filters free of `[...]` array constructors inside PowerShell single-quoted args. See [Non-Interactive Terminal Sessions](./docs/maintainer-operations.md#non-interactive-terminal-sessions-windows-ghgit).
- On Linux integrated terminals, `TERM=dumb GH_PAGER=cat gh pr checks --watch` can still return unusable/no captured output. Prefer one-shot reads such as `GH_PAGER=cat gh pr view <PR> --json state,mergedAt,mergeCommit,mergeStateStatus,statusCheckRollup`, repeating only after other work or terminal notifications.
- Do not run multiple stateful repo/GitHub terminal operations in parallel with `run_in_terminal`; the integrated shell is persistent and can interleave commands. Use sequential terminal calls for `git`/`gh` state changes, and reserve parallel batches for independent read-only file/search tools.
- When posting closeout evidence that contains backticked commands, avoid double-quoted `gh issue close --comment "..."` bodies because the shell can run command substitutions before `gh` receives the text. Prefer `gh issue comment --body-file <file>` or a quoted heredoc delimiter such as `<<'EOF'` with `--body`, then close the issue separately.
- When a post-merge Codex or maintainer inline review finding is fixed by a follow-up PR, reply directly on the original review comment thread with the fixing PR and merge SHA, then sweep the follow-up PR's inline comments before final closeout.
- After auto-merge, an empty `gh pr list --state open` is not full closeout proof. Always check the linked issue by number (`gh issue view <issue> --json state,stateReason`) and the remote feature head (`git ls-remote --heads upstream <branch>`) before declaring the queue clean.
- If the linked issue already auto-closed, `gh issue close --comment ...` errors and skips the evidence comment. Post merge/evidence notes separately with `gh issue comment`, then close only when `gh issue view` still reports `OPEN`.
- If auto-merge is armed and a status read looks briefly `BLOCKED`, `BEHIND`, or failed after checks have just completed, first re-read `gh pr view <PR> --json state,mergedAt,mergeCommit,mergeStateStatus,statusCheckRollup` and fetch `develop`; the PR may already be merged, making a branch update or force-push unnecessary.
- If CodeQL fails during `Initialize CodeQL` with a bundle download `ECONNRESET`, treat it as a transient hosted-network failure and rerun the failed CodeQL job before changing code.
- Editing an SRS Implementation/Verification Reference list: the `- Change Guidance:` field header repeats in every requirement block, so anchor the edit on requirement-specific context, and always run `npm run requirements:integrity` afterward — the `referenceAgreement` check fails closed when an SRS block's refs and its RTM row's refs drift apart, catching a silently-unmatched edit that tests do not.
- Adding a `.github/workflows/*.yml` is fail-closed on three fronts: it must be in `docs/requirements/traceability-inventory.csv` (`missingInventoryEntries`), it must be in the RTM when classified `mapped`/`RtmCoverage=Yes` (`missingRtmReferences`/`rtmCoverageMismatches`), and `packageManifest.test.ts` forbids any `vagrant` reference in workflows (VHS-REQ-599). Map a new workflow to a requirement as `codeql.yml` maps to VHS-REQ-602.
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
- `.github/prompts/windows-maintainer-validation.prompt.md`: self-contained runbook for running the Windows maintainer validation and runtime-conflict matrix on the self-hosted runner (readiness, dispatch, monitor, triage)

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
- [Optional Vagrant Helper](./docs/vagrant.md)
- [Contributing](./CONTRIBUTING.md)
- [Security Policy](./SECURITY.md)

---

**Note:** For any unclear or missing conventions, consult the linked documentation or ask for clarification in the repository discussions.
