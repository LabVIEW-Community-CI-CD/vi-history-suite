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
- `VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:release-gate -- --evidence-dir /tmp/vihs-assurance-release-26`:
  completed; scorecard shows coverage, CM, requirements, architecture,
  documentation, and DoD gates passing, with DoD reported as `PASS` at medium
  confidence.
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

## Initial Action Merge Readback

Recorded by `#26` on `2026-05-16` after the first action batch closed.

| IID | State | MR | Merge Commit | Closed At |
| --- | --- | --- | --- | --- |
| `#17` | closed | `!241` | `31add781bd04cc832d9fb55aa821a69305a91a37` | `2026-05-16T08:32:27.592Z` |
| `#18` | closed | `!247` | `6323cd29b2256c259a6b99cdcb37b01ffd81b30d` | `2026-05-16T19:03:21.673Z` |
| `#19` | closed | `!248` | `037d58ce902c6f93f0147f2ac0c57ea9e506cfea` | `2026-05-16T19:30:12.853Z` |
| `#20` | closed | `!239` | `4436f4ec7bc98d06ccc5da5b60f9294c7c94c68c` | `2026-05-16T07:15:21.670Z` |
| `#21` | closed | `!239` | `4436f4ec7bc98d06ccc5da5b60f9294c7c94c68c` | `2026-05-16T07:15:21.716Z` |
| `#22` | closed | `!249` | `e4128c5570dc1263019f41ed2e6fff1a087ccaaa` | `2026-05-16T19:52:21.387Z` |
| `#23` | closed | `!240` | `415408d48d682b9e064301860b8e2f3018c21a8c` | `2026-05-16T07:40:31.689Z` |

## Portfolio Operating Cycle 2

Recorded by `#31` on `2026-05-17`.

Cycle packet:
[portfolio-operating-cycle-2-2026-05-17.md](./portfolio-operating-cycle-2-2026-05-17.md)
and
[portfolio-operating-cycle-2-2026-05-17.json](./portfolio-operating-cycle-2-2026-05-17.json).

Decision: supersede stale MR `!220` with a fresh branch from current
`develop`, preserve the Windows installed-user release-claim ledger as
governed evidence, and record the three-authority operating loop before any new
MIT implementation starts.

Guardrails retained:

- GitLab remains the governed requirements, evidence, release, and bridge
  admission authority.
- GitHub Suite remains the public Marketplace-continuity authority.
- GitHub MIT `vi-history` remains idle until a new named IAU has a preflight
  `pass`.
- Windows installed-user host proof and exact VSIX proof are separated from
  Windows Docker Desktop Windows-container proof.
- Windows Docker Desktop proof remains blocked and cannot be substituted with
  host proof.

## Action Closeouts

### `#17` Align current release truth across retained v0.2.0 and live v1.3.16 surfaces

Recorded: `2026-05-16T08:05:00Z`

Status: merged into `develop` and closed.

Merge request: `!241`

Head commit: `0b70bf75e52364ba8bf221d353750dbfa5352b7e`

Merge commit: `31add781bd04cc832d9fb55aa821a69305a91a37`

Merged at: `2026-05-16T08:23:15.579Z`

Closed at: `2026-05-16T08:32:27.592Z`

Decision: separate retained historical ship-control evidence from current
installed-user release truth on every primary release reader surface.

Guardrails added:

- `README.md` now names the current stable installed-user line and states that
  `v0.2.0` is maintainer-only historical ship-control evidence.
- `docs/product/SHIP-0001-releasable-vi-history-suite.md` now carries an
  explicit release-truth boundary to `release-publication-state`.
- `docs/product/current-state.md`,
  `docs/product/maintainer-control-plane-index.md`, and
  `docs/release-procedure.md` now split historical ship target facts from
  current exact release facts.
- `docs/product/release-publication-state.md` and `.json` now retain a
  machine-readable historical ship baseline with
  `currentInstalledUserRelease=false`.
- `tests/unit/shipControlDocs.test.ts` and
  `tests/unit/releasePublicationState.test.ts` fail if `v0.2.0` is presented
  as current installed-user truth or if the live `v1.3.16` line disappears
  from current release surfaces.

Proof retained during implementation:

- `npm exec -- vitest run tests/unit/shipControlDocs.test.ts tests/unit/releasePublicationState.test.ts tests/unit/strictSemverDiscipline.test.ts tests/unit/alignmentControlPlaneDocs.test.ts`:
  passed with 12 tests.
- `npm run docs:gate:core`: passed with 23 test files, 68 passed, and 2
  skipped; bundled documentation remained in sync.
- `VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:release-gate -- --evidence-dir /tmp/vihs-assurance-release-17`:
  completed; release scorecard reported all gates `PASS`, including
  `dod | PASS | Med | -`.
- `VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:26514:authority -- --evidence-dir /tmp/vihs-assurance-26514-17`:
  completed; staged authority-doc proof reported no missing or unconfirmed
  reusable 26514 signals.
- `python3 /home/sergio/repos/gl/repo-standards-review/scripts/requirements_quality_check.py . --json`:
  passed with `ok=true`, no findings.
- `python3 /home/sergio/repos/gl/repo-standards-review/scripts/external_user_information_check.py . --json`:
  passed with `ok=true`, no findings.
- `npm run test`: passed with 178 test files, 956 passed, and 2 skipped.

Mutation boundary:

- docs/tests/traceability alignment only;
- no release state mutation;
- no runtime behavior mutation;
- no tag, public GitHub release, Marketplace, release branch deletion, or
  protected-branch mutation.

### `#18` Normalize host-default LabVIEWCLI versus historical Docker-only contract

Recorded: `2026-05-16T18:48:07Z`

Status: merged into `develop` and closed.

Merge request: `!247`

Head commit: `c50c5cd7952ec3987a5992eff199c07004c14c7e`

Merge commit: `6323cd29b2256c259a6b99cdcb37b01ffd81b30d`

Merged at: `2026-05-16T19:02:55.975Z`

Closed at: `2026-05-16T19:03:21.673Z`

Decision: make host-default local `LabVIEWCLI` the current installed-user
runtime truth and retain Docker-only wording only as historical baseline
evidence or as the explicit expert Docker provider path.

Before grep evidence:

- `docs/requirements/srs.md` and `docs/requirements/rtm.csv` still described
  `current released Docker-only` and `exact released Docker-only` baselines in
  `VHS-REQ-459`, `VHS-REQ-466`, `VHS-REQ-475`, `VHS-REQ-491`,
  `VHS-REQ-528`, `VHS-REQ-530`, and `VHS-REQ-549`.
- `docs/testing/test-plan.md`, `docs/documentation-workbench.md`, and
  `docs/product/current-state.md` still named Docker-only bundled-doc truth
  checks and Docker-required hard stops as current installed-user checks.
- `docs/product/development-queue.json`,
  `docs/product/extension-execution-policy.md`, and
  `docs/product/runtime-provider-public-acceptance-gate.{md,json}` mixed
  closure-time Docker-only evidence with current reader-surface language.

After grep evidence:

- current user-facing surfaces contain no active Docker-only guidance; the only
  retained Docker-only matches are historical/control-plane baseline evidence
  or tests that forbid stale wording from leaking back into current user docs.
- docs-CI and workbench wording now guards host-default local `LabVIEWCLI`,
  explicit `vihs --validate` provider bundle validation, bounded expert Docker
  selection, and provider/progress visibility.

Guardrails added:

- `docs/requirements/srs.md`, `docs/requirements/rtm.csv`, and
  `docs/testing/test-plan.md` now describe the Docker-only line as retained
  historical evidence and the host-default `LabVIEWCLI` contract as current
  installed-user truth.
- `docs/product/extension-execution-policy.md`,
  `docs/product/current-state.md`, `docs/product/development-queue.json`, and
  `docs/product/runtime-provider-public-acceptance-gate.{md,json}` now separate
  closure-time Docker-only evidence from current runtime doctrine.
- `docs/information-for-users/*`, `docs/glossary.md`, and the bundled-doc
  workbench text now lead with host-default `LabVIEWCLI` and bounded expert
  Docker instead of an active/released Docker-only split.
- `tests/unit/executionPolicyDocs.test.ts`,
  `tests/unit/requirementsDocs.test.ts`, `tests/unit/docsWorkbenchDocs.test.ts`,
  `tests/unit/docsContinuousIntegration.test.ts`, and
  `tests/unit/postReleaseControlPlaneDocs.test.ts` now fail if the current
  contract drifts back to stale Docker-only wording.

Proof retained during implementation:

- `npm exec -- vitest run tests/unit/alignmentControlPlaneDocs.test.ts tests/unit/executionPolicyDocs.test.ts tests/unit/informationForUsersSupportDocs.test.ts tests/unit/packageManifest.test.ts tests/unit/requirementsDocs.test.ts tests/unit/docsWorkbenchDocs.test.ts tests/unit/docsContinuousIntegration.test.ts tests/unit/postReleaseControlPlaneDocs.test.ts tests/unit/releaseRuntimeDriftGate.test.ts`:
  passed with 9 test files and 32 tests.
- `npm run docs:gate:core`: passed with 23 test files, 70 passed, and 2
  skipped; bundled documentation remained in sync.
- `VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:release-gate -- --evidence-dir /tmp/vihs-assurance-release-18`:
  completed; release scorecard reported coverage, CM, requirements,
  architecture, documentation, and DoD gates as `PASS`.
- `VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:26514:authority -- --evidence-dir /tmp/vihs-assurance-26514-18`:
  completed; documentation proof reported no missing or unconfirmed reusable
  26514 signal set.
- `python3 /home/sergio/repos/gl/repo-standards-review/scripts/requirements_quality_check.py . --json`:
  passed with `ok=true`, no findings.
- `python3 /home/sergio/repos/gl/repo-standards-review/scripts/external_user_information_check.py . --json`:
  passed with `ok=true`, no findings.
- `npm test`: passed with 179 test files, 963 passed, and 2 skipped.
- `npm run check`: passed.
- `npm run package:audit`: passed.
- `git diff --check`: passed.
- `jq empty docs/product/work-item-0011-docs-implementation-alignment-control-plane-2026-05-16.json docs/product/development-queue.json docs/product/runtime-provider-public-acceptance-gate.json`:
  passed.

Mutation boundary:

- docs/tests/traceability alignment only;
- no runtime behavior mutation;
- no release state mutation;
- no tag, public GitHub release, Marketplace, release branch deletion, or
  protected-branch mutation.

### `#19` Resolve the lone partial research/progress-surface state

Recorded: `2026-05-16T19:18:00Z`

Status: merged into `develop` and closed.

Merge request: `!248`

Head commit: `4a11f6f1f4638e376431b13f37fb06721ebb853c`

Merge commit: `037d58ce902c6f93f0147f2ac0c57ea9e506cfea`

Merged at: `2026-05-16T19:29:52.771Z`

Closed at: `2026-05-16T19:30:12.853Z`

Decision: close `TRANCHE-004` / `progress-surface-uplift` as
implemented-and-active, with its original partial state superseded by the later
governed progress UX stack under `ISSUE-0403` / `TRANCHE-008` and subsequent
requirements.

Before grep evidence:

- `docs/research/authoritative/research-implementation-index.json` carried
  `progress-surface-uplift` as `partial` with next move `TRANCHE-004`.
- `docs/research/authoritative/research-alignment.md` still said
  `src/indexing/viEligibilityIndexer.ts` currently uses `window.withProgress`
  only.
- `docs/product/development-queue.json` kept `TRANCHE-004` queued while
  `ISSUE-0403` / `TRANCHE-008` and later requirements already described
  implemented progress/cancellation surfaces.
- `docs/product/current-state.md` described indexing and report progress uplift
  as partially implemented and active.

After grep evidence:

- `docs/research/authoritative/research-implementation-index.json` now records
  `progress-surface-uplift` as `implemented-and-active` with indexing, report,
  dashboard, webview, cancellation, and test evidence.
- `docs/product/development-queue.json` now records `TRANCHE-004` as `done`
  and closed by the later governed progress UX stack.
- `docs/product/current-state.md` now treats the former progress-surface
  partial as closed and keeps future work to sustainment for new long-running
  lanes.

Guardrails added:

- `docs/research/authoritative/research-implementation-index.json` no longer
  retains the lone stale progress-surface partial.
- `docs/research/authoritative/research-alignment.md` now marks the
  status-bar and richer progress UX row aligned, with notification/status-bar/
  webview progress and cancellation evidence.
- `docs/product/development-queue.json` marks `TRANCHE-004` done instead of
  queued.
- `docs/product/current-state.md` reports indexing/report progress uplift as
  implemented and active with concrete evidence.
- `docs/product/execution-programs/PROGRAM-0001-next-product-layer.md` explains
  `TRANCHE-004` as a historical progress-surface tranche closed by later
  progress UX work.
- `tests/unit/requirementsDocs.test.ts` fails if the research/control-plane
  surfaces reintroduce the stale progress-surface partial or omit implemented
  progress evidence.
- `tests/unit/alignmentControlPlaneDocs.test.ts` retains this closeout decision
  and its before/after evidence.

Proof retained during implementation:

- `npm exec -- vitest run tests/unit/requirementsDocs.test.ts tests/unit/alignmentControlPlaneDocs.test.ts tests/unit/viEligibilityIndexer.test.ts tests/unit/openViHistoryCommand.test.ts tests/unit/historyPanel.test.ts tests/unit/comparisonReportAction.test.ts`:
  passed.
- `npm run docs:gate:core`: passed.
- `VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:release-gate -- --evidence-dir /tmp/vihs-assurance-release-19`:
  completed.
- `VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:26514:authority -- --evidence-dir /tmp/vihs-assurance-26514-19`:
  completed.
- `python3 /home/sergio/repos/gl/repo-standards-review/scripts/requirements_quality_check.py . --json`:
  passed with `ok=true`, no findings.
- `python3 /home/sergio/repos/gl/repo-standards-review/scripts/external_user_information_check.py . --json`:
  passed with `ok=true`, no findings.
- `npm run check`: passed.
- `npm run package:audit`: passed.
- `npm test`: passed with 179 test files, 964 passed, and 2 skipped.
- `git diff --check`: passed.

Mutation boundary:

- docs/tests/traceability alignment only;
- no runtime behavior mutation;
- no release state mutation;
- no tag, public GitHub release, Marketplace, release branch deletion, or
  protected-branch mutation.

### `#20` Make release and runtime drift fail closed in docs gate

Recorded: `2026-05-16T06:10:19Z`

Status: merged into `develop` and closed.

Merge request: `!239`

Head commit: `fbc3e5e578252af7a837f1503a75853259187ef3`

Merge commit: `4436f4ec7bc98d06ccc5da5b60f9294c7c94c68c`

Merged at: `2026-05-16T06:57:39.679Z`

Closed at: `2026-05-16T07:15:21.670Z`

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

Status: merged into `develop` and closed.

Merge request: `!239`

Head commit: `fbc3e5e578252af7a837f1503a75853259187ef3`

Merge commit: `4436f4ec7bc98d06ccc5da5b60f9294c7c94c68c`

Merged at: `2026-05-16T06:57:39.679Z`

Closed at: `2026-05-16T07:15:21.716Z`

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

### `#22` Turn post-publication installed-user acceptance into a recurring observation cadence

Recorded: `2026-05-16T19:45:00Z`

Status: merged into `develop` and closed.

Merge request: `!249`

Head commit: `ef0473fae66170c165cb9b990845cbe0251b530f`

Merge commit: `e4128c5570dc1263019f41ed2e6fff1a087ccaaa`

Merged at: `2026-05-16T19:52:08.536Z`

Closed at: `2026-05-16T19:52:21.387Z`

Decision: add a recurring installed-user observation cadence after the one-time
post-publication campaign, with event triggers, a no-later-than review date,
separate fact buckets, and routing into user docs, video planning, and SemVer
decisions.

Before evidence:

- `#10` closed the immediate `v1.3.16` post-publication installed-user
  acceptance campaign.
- `docs/product/release-publication-state.{md,json}` retained the one-time
  campaign packet but had no recurring observation schedule.
- public intake issue
  `https://github.com/svelderrainruiz/vi-history-suite/issues/98` was open
  with zero comments, so the repo needed an explicit next observation trigger
  instead of waiting indefinitely for feedback.
- Windows Docker Desktop Windows-container proof remained outside the installed
  user campaign and under the separate `ISSUE-0415` lane.

After evidence:

- `docs/product/post-publication-installed-user-observation-cadence-2026-05-16.{md,json}`
  defines `event-driven-with-monthly-review-while-public-intake-open`, public
  intake issue `#98`, and the no-later-than review date `2026-06-14`.
- recurring cycle outputs now separate observed facts, deferred facts, blocked
  facts, documentation candidates, video-plan candidates, and the SemVer
  recommendation.
- repeated installed-user confusion routes to user docs or first-time video
  plan work items instead of silently staying in publication proof.
- Windows Docker Desktop Windows-container proof remains explicitly bounded to
  `ISSUE-0415`.

Guardrails added:

- `docs/product/post-publication-installed-user-observation-cadence-2026-05-16.md`
  and `.json` retain the human and machine-readable cadence packet.
- `docs/product/release-publication-state.{md,json}` now link the recurring
  cadence to the closed one-time campaign without treating publication as
  acceptance proof.
- `docs/product/post-release-sustainment-rules.{md,json}` now make recurring
  installed-user observation part of the sustainment control plane.
- `docs/product/current-state.md`,
  `docs/product/maintainer-control-plane-index.md`, and
  `docs/information-item-map.md` expose the cadence to current-state and
  user-information readers.
- `docs/requirements/srs.md`, `docs/requirements/rtm.csv`, and
  `docs/testing/test-plan.md` add `VHS-REQ-595`, `TEST-UNIT-452`, and
  `TEST-DOC-154` traceability for the cadence.
- `tests/unit/postPublicationInstalledUserAcceptanceCampaign.test.ts` and
  `tests/unit/postReleaseSustainmentRulesDocs.test.ts` fail if the cadence,
  fact buckets, routing rules, no-later-than date, public intake link, or
  `ISSUE-0415` boundary disappear.
- `tests/unit/alignmentControlPlaneDocs.test.ts` retains this closeout decision
  and its before/after evidence.

Proof retained during implementation:

- `npm exec -- vitest run tests/unit/postPublicationInstalledUserAcceptanceCampaign.test.ts tests/unit/firstTimeOverviewVideoPlan.test.ts tests/unit/postReleaseSustainmentRulesDocs.test.ts tests/unit/requirementsDocs.test.ts`:
  passed.
- `python3 /home/sergio/repos/gl/repo-standards-review/scripts/requirements_quality_check.py . --json`:
  passed with `ok=true`, no findings.
- `python3 /home/sergio/repos/gl/repo-standards-review/scripts/external_user_information_check.py . --json`:
  passed with `ok=true`, no findings.
- `npm run docs:gate:core`: passed with 23 test files, 73 passed, and 2
  skipped; bundled documentation remained in sync.
- `VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:release-gate -- --evidence-dir /tmp/vihs-assurance-release-22`:
  completed; release scorecard reported coverage, CM, requirements,
  architecture, documentation, and DoD gates as `PASS`.
- `VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:26514:authority -- --evidence-dir /tmp/vihs-assurance-26514-22`:
  completed; documentation proof reported no missing or unconfirmed reusable
  26514 signal set.
- `npm run check`: passed.
- `npm run package:audit`: passed.
- `npm test`: passed with 179 test files, 966 passed, and 2 skipped.
- `git diff --check`: passed.

Mutation boundary:

- docs/tests/traceability alignment only;
- no Marketplace or public GitHub mutation;
- no publication mutation or publication proof reinterpretation;
- no runtime behavior mutation;
- no tag, public GitHub release, Marketplace, release branch deletion, or
  protected-branch mutation.

### `#23` Decide release-gate DoD evidence or explicit DoD N/A rationale

Recorded: `2026-05-16T07:19:23Z`

Status: merged into `develop` and closed.

Merge request: `!240`

Head commit: `92c52c124fe9472a4c5490a50f19d2002e2c1d71`

Merge commit: `415408d48d682b9e064301860b8e2f3018c21a8c`

Merged at: `2026-05-16T07:32:11.858Z`

Closed at: `2026-05-16T07:40:31.689Z`

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
