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
| [traceability-inventory.csv](./traceability-inventory.csv) | File-level traceability classification inventory for RTM coverage audit. |
| [copilot-web-issue-generation-prompt.md](./copilot-web-issue-generation-prompt.md) | Reusable requirement-wave guidance for generating future Copilot Web issues from SRS + RTM evidence. |

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
boundaries before implementation starts. It also requires a
requirement/RTM-update decision and provides an optional bounded
`copilot_prompt` field so the issue itself is decision-complete before
implementation starts.

For creating new requirement-scoped Copilot Web issue waves, use the committed
[Copilot Web issue-generation guidance](./copilot-web-issue-generation-prompt.md)
instead of relying on chat history. When bounded field evidence reveals a
missing active requirement, use the requirement-gap lane in that guidance and
target `VHS-REQ-601` until the new requirement IDs exist in `srs.md`,
`rtm.csv`, and `id-index.csv`.

## Traceability Steward Inventory

The `traceability-inventory.csv` file classifies every implementation and test
file for RTM coverage auditing. Run the local audit command to check coverage:

```shell
npm run traceability:audit
```

### Classification Categories

| Classification | Meaning |
| --- | --- |
| `mapped` | File is referenced in RTM `ImplementationRefs` or `VerificationRefs`. |
| `supporting` | Infrastructure file necessary but not directly traced to requirements. |
| `dev-only` | Development tooling, not shipped or traced to product requirements. |
| `release-ci` | CI/CD workflows and release infrastructure. |
| `asset-doc` | Documentation and assets. |
| `gap` | Implementation or test file pending RTM classification. |

### Agent Response for Unmapped Code

When an agent touches code that is not in the RTM or is classified as `gap`:

1. Check if the touched file is in `traceability-inventory.csv`.
2. If missing, add the file with classification `gap` and a brief note.
3. If existing but `gap`, consider whether the change warrants creating or
   updating a requirement.
4. Do not fail the task solely due to gap classification; gaps are informational
   for incremental traceability improvement.
5. For new implementation files, add a corresponding entry to the inventory
   before committing.

The audit guard reports gaps as informational findings. A future PR can enable
fail-closed enforcement for newly added unclassified implementation files.

## Traceability Closeout Runbook

Use this closeout path for umbrella issues that classify requirement,
implementation, verification, or inventory gaps.

1. Confirm every child issue is closed or explicitly deferred to an open
   follow-up issue.
2. Generate the closeout evidence summary. Standards evidence and standards
   toolchain provenance are mandatory, and the command fails closed unless host
   Python or the Docker assurance workbench can produce evidence and the
   `repo-standards-review` source/mirror/registry facts can be verified:

```shell
npm run closeout:evidence -- --kind standards --issue <issue-number> --run-gates --save-dir assurance-closeout-evidence
```

Use Docker explicitly when host Python is unavailable:

```shell
npm run closeout:evidence -- --kind standards --issue <issue-number> --standards-runner docker --save-dir assurance-closeout-evidence
```

The Docker standards runner defaults to the published GitLab registry image
`registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main`.
It inspects the image locally, pulls it when missing, and fails closed with
`docker login registry.gitlab.com` guidance when registry access is denied. Use
`--standards-image repo-standards-review-assurance-workbench:local` only as an
explicit local override. Provenance evidence separately verifies GitLab source
authority, the private GitHub mirror, `v0.2.19`, the local non-authoritative
skill cache, and registry image access.

3. The closeout command runs these repo-local gates when `--run-gates` is set:

```shell
npm run traceability:audit
npm run docs:links
npm run dod:gate
npm run check
npm test
npm run package
```

4. The closeout command always runs the mandatory standards evidence checks
   through the selected standards runner:

```shell
python3 C:\Users\sveld\.codex\skills\repo-standards-review\scripts\preflight_local_dependencies.py --json
python3 C:\Users\sveld\.codex\skills\repo-standards-review\scripts\requirements_quality_check.py <repo-root> --requirements-spec-scope system --json
python3 C:\Users\sveld\.codex\skills\repo-standards-review\scripts\repo_evidence_scan.py <repo-root> --format json --profile quick-triage --include-snippets
python3 C:\Users\sveld\.codex\skills\repo-standards-review\scripts\run_assurance.py <repo-root> --profile quick-triage
```

   Closeout parsing reports the Definition-of-Done gate as explicit `PASS`,
   `N/A`, or `FAIL`. A DoD `PASS` requires scanner-visible evidence from a
   workflow file under `.github/workflows/`; generated `assurance-*-evidence`
   outputs, generated build output, docs-only references, and unit-test fixture
   strings are recorded as disqualified sources and cannot promote DoD.

5. Close the umbrella only when blocking traceability and Definition-of-Done
   findings are resolved or deferred to open child issues with owners and
   validation commands.
6. Treat non-PASS DoD evidence as active closeout evidence. If the hosted DoD
   workflow step is not present yet, the local `dod:gate` result records that
   boundary until the dedicated CI issue adds it.

## ID Policy

- Active software requirements use `VHS-REQ-*`.
- Active system requirements use `VHS-SYS-REQ-*`.
- Historical gaps are intentional.
- New software requirements start at `VHS-REQ-616`.
- New system requirements start at `VHS-SYS-REQ-018`.
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
