# Requirements

This directory is the stable human-to-agent work surface for VI History Suite.
Use requirement IDs when you want implementation work to start from committed
intent instead of chat memory.

## Documents

| File | Purpose |
| --- | --- |
| [syrs.md](./syrs.md) | System-level requirements and operating boundaries. |
| [srs.md](./srs.md) | Active software requirements that agents can target. |
| [rtm.csv](./rtm.csv) | Machine-readable links from requirements to implementation and verification evidence. |
| [id-index.csv](./id-index.csv) | Registry of active, superseded, and retired historical IDs. |
| [copilot-web-issue-generation-prompt.md](./copilot-web-issue-generation-prompt.md) | Reusable guidance for creating Copilot Web issue waves. |

## Agent Workflow Contract

When a human targets a requirement ID, the agent must:

1. Locate the requirement block in `srs.md` or `syrs.md`.
2. Read the matching `rtm.csv` row before editing code.
3. Inspect the implementation and verification references named by the RTM.
4. Update code, tests, requirements, and RTM together when behavior changes.
5. Add or update tests for changed acceptance criteria.
6. Retire or supersede IDs through `id-index.csv`; do not delete an ID silently.

Canonical prompt pattern:

```text
Target VHS-REQ-###. Change behavior to ____. Update implementation, tests, SRS, and RTM.
```

On GitHub, use the `Requirement Target` issue template for agent or Copilot
work. The template captures the target requirement ID, files to inspect,
acceptance criteria, required tests, validation commands, and out-of-scope
boundaries before implementation starts.

## Copilot Web Issue Wave Creation

To create a batch of requirement-scoped Copilot Web issues, use the committed
[copilot-web-issue-generation-prompt.md](./copilot-web-issue-generation-prompt.md)
guidance instead of relying on chat history. The prompt is requirements-first,
RTM-first, and includes fail-closed rules for missing files, labels, templates,
duplicates, unresolved placeholders, and untestable acceptance criteria.

When the local `repo-standards-review` skill is available, run the system-scope
requirements quality check before finalizing issue candidates:

```powershell
python C:\Users\sveld\.codex\skills\repo-standards-review\scripts\requirements_quality_check.py <repo-root> --requirements-spec-scope system --json
```

## ID Policy

- Active software requirements use `VHS-REQ-*`.
- Active system requirements use `VHS-SYS-REQ-*`.
- Historical gaps are intentional.
- New software requirements start at `VHS-REQ-596`.
- New system requirements start at `VHS-SYS-REQ-011`.
- Retired IDs remain in `id-index.csv` so an agent can distinguish an
  intentional retirement from a missing document.

## RTM Reference Policy

`rtm.csv` references use these forms:

- repo-relative paths that must exist, separated by semicolons.
- `manual:<name>` for human validation evidence.
- `external:<name>` for external state such as the VS Code Marketplace.

Do not use the RTM to point at deleted release machinery or historical-only
process documents. Active requirements must describe the current GitHub-first
project.
