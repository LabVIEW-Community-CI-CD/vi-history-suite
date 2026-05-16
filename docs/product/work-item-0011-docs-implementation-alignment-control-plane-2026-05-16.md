# Work Item 0011 Docs/Implementation Alignment Control Plane

Recorded: `2026-05-16T06:00:53Z`

## Scope

GitLab parent work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/11`

This establishes the recurring docs/implementation alignment program for
`vi-history-suite`. The program uses `repo-standards-review` as the standards
frame and treats GitLab work items as a living assurance backlog rather than a
one-time audit output.

## Alignment Triage Template

Every new alignment action item should keep the following sections:

1. Lane.
2. Parent.
3. Problem.
4. Repo Evidence.
5. Standards Anchor.
6. Acceptance Criteria.
7. Proving Commands.
8. Mutation Boundary.
9. Closeout Artifact.

For any user-information or `26514` finding, add these required sections:

- `26514 Authority Evidence`: cite staged `assurance:26514:authority` evidence
  from `npm run assurance:26514:authority -- --evidence-dir /tmp/vihs-assurance-26514`.
- `Non-Authority Evidence Boundary`: state whether any transient evidence,
  generated workbench output, or `.cache/` packet was consulted, and keep that
  evidence secondary to staged authority docs.

Raw repo-wide 26514 scans are exploratory only. The preferred triage command is:

```bash
VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review \
  npm run assurance:26514:authority -- --evidence-dir /tmp/vihs-assurance-26514
```

Never cite `.cache/` as the sole user-information authority source. Transient
roots such as `.cache/`, `docs-workbench-evidence/`,
`wiki-workbench-evidence/`, and prior `assurance-*-evidence/` directories may
explain how a finding was discovered, but they do not replace the staged
authority-doc package.

## Evidence Snapshot

- `npm run docs:gate:core`: passed.
- `npm run assurance:release-gate -- --evidence-dir /tmp/vihs-align-release-gate`:
  completed; scorecard shows coverage, CM, requirements, architecture, and
  docs gates passing with high confidence, with DoD retained as `N/A`.
- `npm run assurance:26514:authority -- --evidence-dir /tmp/vihs-align-26514-authority`:
  completed; staged authority-doc proof shows active reusable 26514 signals
  and no missing/unconfirmed signal set.
- `python3 /home/sergio/.codex/skills/repo-standards-review/scripts/requirements_quality_check.py . --json`:
  `ok=true`, no findings.
- `python3 /home/sergio/.codex/skills/repo-standards-review/scripts/external_user_information_check.py . --json`:
  `ok=true`, no findings.
- GitLab API verification confirmed `#11` is linked to its lane/action work
  items with `relates_to` links.

## Standing Lanes

| IID | Title | URL |
| --- | --- | --- |
| `#12` | Alignment Lane: Release Truth | https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/12 |
| `#13` | Alignment Lane: Runtime Contract | https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/13 |
| `#14` | Alignment Lane: Traceability | https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/14 |
| `#15` | Alignment Lane: User Information | https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/15 |
| `#16` | Alignment Lane: Recurrence Prevention | https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/16 |

## Initial Action Items

| IID | Title | URL |
| --- | --- | --- |
| `#17` | Align current release truth across retained v0.2.0 and live v1.3.16 surfaces | https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/17 |
| `#18` | Normalize host-default LabVIEWCLI versus historical Docker-only contract | https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/18 |
| `#19` | Resolve the lone partial research/progress-surface state | https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/19 |
| `#20` | Make release and runtime drift fail closed in docs gate | https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/20 |
| `#21` | Harden 26514 authority scan scope for work-item triage | https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/21 |
| `#22` | Turn post-publication installed-user acceptance into a recurring observation cadence | https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/22 |
| `#23` | Decide release-gate DoD evidence or explicit DoD N/A rationale | https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/23 |

## Action Closeouts

### `#20` Make release and runtime drift fail closed in docs gate

Recorded: `2026-05-16T06:10:19Z`

Status: committed locally, pending push/merge.

Local commit: `c3e18e7` (`test: harden docs drift gate`).

GitLab implementation note:
https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/20#note_3353877349

Direct-command follow-up note:
https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/20#note_3353877741

Guardrails added:

- `tests/unit/releaseRuntimeDriftGate.test.ts` derives the current exact
  release, package line, next admitted action, active tranche/issue/program
  identities, and installed runtime defaults from the committed control-plane
  JSON and package manifest.
- `scripts/run-docs-gate.js` and
  `scripts/run-docs-continuous-integration.js` now include the drift sentinel
  in documentation-package validation.
- Starter user-information metadata was aligned to the current exact
  `v1.3.16` line after the new guard exposed retained `v1.2.2` drift in the
  root starter pack.

Proof retained during implementation:

- `npm exec -- vitest run tests/unit/releaseRuntimeDriftGate.test.ts`: passed.
- `npm exec -- vitest run tests/unit/postReleaseControlPlaneDocs.test.ts tests/unit/shipControlDocs.test.ts tests/unit/executionPolicyDocs.test.ts`:
  passed.
- `npm run docs:gate:core`: passed with 22 test files, 65 tests passed, and 2
  skipped.
- `npm run assurance:release-gate -- --evidence-dir /tmp/vihs-assurance-release`:
  completed; release scorecard gates passed with DoD retained as `N/A`.
- `npm run assurance:26514:authority -- --evidence-dir /tmp/vihs-assurance-26514`:
  completed with no missing/unconfirmed reusable 26514 signal set.
- `npm run assurance:requirements -- --evidence-dir /tmp/vihs-assurance-requirements`:
  completed; `requirements-quality.json` retained `ok=true`.
- `npm run assurance:user-info -- --evidence-dir /tmp/vihs-assurance-user-info`:
  completed; `external-user-information.json` retained `ok=true`.
- `python3 /home/sergio/.codex/skills/repo-standards-review/scripts/requirements_quality_check.py . --json`:
  passed with `ok=true`, no findings.

### `#21` Harden 26514 authority scan scope for work-item triage

Recorded: `2026-05-16T06:17:42Z`

Status: committed locally, pending push/merge.

Local commit: this commit (`docs: harden 26514 triage scope`).

Guardrails added:

- The alignment triage template now requires staged
  `assurance:26514:authority` evidence for user-information and `26514`
  findings.
- The triage process names the local cloned `repo-standards-review` root via
  `VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review` for
  local proving.
- `.cache/` and generated evidence roots are explicitly secondary evidence and
  cannot be the sole user-information authority source.
- `tests/unit/alignmentControlPlaneDocs.test.ts` keeps this template in the
  docs gate and docs continuous-integration runner.

Proof retained during implementation:

- `npm exec -- vitest run tests/unit/alignmentControlPlaneDocs.test.ts tests/unit/docsWorkbenchDocs.test.ts tests/unit/docsContinuousIntegration.test.ts`:
  passed.
- `npm run docs:gate:core`: passed with 23 test files, 66 tests passed, and 2
  skipped.
- `VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:release-gate -- --evidence-dir /tmp/vihs-assurance-release`:
  completed; release scorecard gates passed with DoD retained as `N/A`.
- `VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:26514:authority -- --evidence-dir /tmp/vihs-assurance-26514`:
  completed twice; lane manifest retained `scope=authority-docs`, excluded
  `.cache/**`, and invoked the cloned `repo-standards-review` checkout.
- `python3 /home/sergio/repos/gl/repo-standards-review/scripts/requirements_quality_check.py . --json`:
  passed with `ok=true`, no findings.
- `python3 /home/sergio/repos/gl/repo-standards-review/scripts/external_user_information_check.py . --json`:
  passed with `ok=true`, no findings.
- `python3 /home/sergio/.codex/skills/repo-standards-review/scripts/external_user_information_check.py . --json`:
  passed with `ok=true`, no findings.

### `#23` Decide release-gate DoD evidence or explicit DoD N/A rationale

Recorded: `2026-05-16T07:19:23Z`

Status: implemented locally, pending push/merge.

Decision: add a repo-owned DoD evidence signal. DoD is not intentionally `N/A`.

Guardrails added:

- `docs/product/SHIP-0001-releasable-vi-history-suite.md` now has an explicit
  `DoD Gate / dod` release-gate evidence section.
- `docs/product/release-readiness-matrix.json` now carries a machine-readable
  `dodGate` object with standards anchors, evidence, and completion criteria.
- `tests/unit/shipControlDocs.test.ts` keeps the human and machine-readable DoD
  evidence signal in the docs gate.

Proof retained during implementation:

- Baseline
  `VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:release-gate -- --evidence-dir /tmp/vihs-assurance-release-23-before`:
  completed; release scorecard reported `dod | N/A | Low | DoD Gate / dod`.
- Updated
  `VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:release-gate -- --evidence-dir /tmp/vihs-assurance-release-23-after`:
  completed; release scorecard reported `dod | PASS | Med | -`.
- `npm exec -- vitest run tests/unit/shipControlDocs.test.ts`: passed.

Mutation boundary:

- scorer-evidence/rationale alignment only;
- no release state mutation;
- no runtime behavior mutation;
- no tag, public GitHub release, Marketplace, release branch deletion, or
  protected-branch mutation.

## Existing Referenced Work

- Closed campaign predecessor:
  `https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/10`
  (`Run post-publication installed-user acceptance campaign`).

## Mutation Boundary

This setup created GitLab work items, labels, and `relates_to` links, plus this
local retention record. It did not authorize or perform tag creation, public
GitHub release publication, VS Code Marketplace publication, release branch
deletion, or protected-branch mutation.
