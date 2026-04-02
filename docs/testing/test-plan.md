# Test Plan

## Overview

- Release or baseline: `draft-baseline`
- Owner: sole author
- Scope: first governed extension baseline for content-detected VI history
  review

## Test Items

| Item | Type | Risk | Notes |
| --- | --- | --- | --- |
| VI magic detection | Unit | High | Product entry condition |
| Git output parsing | Unit | High | Eligibility correctness |
| Core history model against a temporary Git repo | Unit | High | Real Git semantics without VS Code host |
| History panel rendering | Unit | Medium | Primary review surface |
| Extension activation and command flow | Integration | High | VS Code runtime behavior |
| Harness smoke against cloned real repo | Smoke | High | Real history path |

## Entry Criteria

- requirements and traceability are current
- TypeScript compiles
- unit test fixtures are present

## Exit Criteria

- unit tests pass
- extension compiles cleanly
- local coverage is generated
- no blocking defect is left in the initial command or history flow

## Coverage Targets

| Metric | Target | Evidence |
| --- | --- | --- |
| Line | 80% | `coverage/cobertura-coverage.xml` |
| Branch | Project-defined by Vitest | `coverage/coverage-summary.json` |

## Initial Test Cases

- `TEST-UNIT-001`: detect `LVIN` and `LVCC`, reject short files, reject wrong
  offsets, and exercise strict-header mode
- `TEST-UNIT-002`: parse `git ls-files -z`, bounded commit-hash output, and
  history-entry output
- `TEST-UNIT-003`: prove cache-key and concurrency helpers behave deterministically
- `TEST-UNIT-004`: render a history panel with factual metadata and action hooks
- `TEST-INTEG-001`: activate extension, compute eligibility context, and open
  the history panel for an eligible file, then assert the rendered HTML retains
  stable semantic anchors plus factual eligibility, signature, path, and commit
  subjects, and then dispatch `copyHash`, `openCommit`, and `diffPrevious`
  through the real panel message handler; the same lane shall also prove the
  chronology packet, compare-base context, explicit selected-versus-base pairing,
  binary-review limitation note, reviewer-guidance block,
  confidence-and-scope packet, and panel-level copied review packet
- `TEST-INTEG-002`: validate non-file URI detection fallback behavior
- `TEST-UNIT-005`: build a temporary Git repo with a content-detected VI and
  assert the shared core history model returns eligible history
- `TEST-UNIT-006`: validate the local design-gate plan, assurance-summary
  parsing, weakest-coverage extraction, and retained report rendering helpers
- `TEST-UNIT-007`: validate explicit design-gate unavailable-reason rendering
  when coverage-focus facts cannot be retained
- `TEST-UNIT-008`: validate the shared design-gate runner executes ordered
  steps, retains reports, and derives the next focus from retained coverage
  facts
- `TEST-UNIT-009`: validate the shared design-gate runner retains a fail report
  when a gated step stops the sequence before completion
- `TEST-UNIT-010`: validate the CLI entrypoint delegates to the shared
  design-gate runner and throws on a failed retained report
- `TEST-UNIT-011`: validate `VI History` command entry handling for missing
  target, untrusted workspace, and ineligible-file conditions
- `TEST-UNIT-012`: validate `VI History` panel-action handling for missing Git
  URIs, missing previous revisions, hashless messages, and unsupported
  commands
- `TEST-UNIT-013`: validate harness smoke CLI argument parsing for defaults,
  explicit options, help, and invalid arguments
- `TEST-UNIT-014`: validate the reusable harness smoke CLI runner prints the
  deterministic retained success summary and forwards governed options
- `TEST-UNIT-015`: validate VI history service repository-root resolution for
  nested Git API roots and CLI fallback behavior
- `TEST-UNIT-016`: validate VI history service configuration forwarding and
  Git-URI translation behavior
- `TEST-UNIT-017`: validate the URI-based VI magic wrapper for file-path
  delegation, workspace-fs truncation, and fail-closed behavior
- `TEST-UNIT-018`: validate the built-in Git API resolver for missing
  extension, activation, missing `getAPI`, and activation-failure behavior
- `TEST-UNIT-019`: validate the eligibility indexer helper surface for cache
  keys, normalized context keys, configuration, and bounded concurrency
- `TEST-UNIT-020`: validate the eligibility indexer refresh path for untrusted
  clearing, cache reuse, HEAD invalidation, repo/file fail-closed behavior, and
  dynamic repository-state listener handling
- `TEST-UNIT-021`: validate design-gate runner unavailable-reason handling for
  coverage summaries with no governed `src/` entries, and retained report
  persistence through recursive cache-directory creation
- `TEST-UNIT-022`: validate spawned design-gate step execution retains stdout,
  stderr, and duration while streaming both channels to the active sinks
- `TEST-UNIT-023`: validate spawned design-gate step execution fails closed on
  process errors and `close(null)` termination
- `TEST-UNIT-024`: validate the extension manifest uses the authoritative
  `labviewViHistory` command id, eligibility context key, and menu `when`
  clause for both Explorer and editor title context menus
- `TEST-UNIT-025`: validate the extension manifest retains the authoritative
  Git extension dependency, activation events, and limited untrusted-workspace
  capability declaration
- `TEST-INTEG-003`: validate indexing progress retains percent, processed/total,
  and ETA through notification progress and a status-bar surface
- `TEST-INTEG-004`: validate report-generation progress appears in the webview
  review surface and completes or fails with retained status
- `TEST-UNIT-026`: validate report-generation preflight verifies both revision
  blobs as VIs, preserves the `{type}-report-{fullFilename}.html` naming
  contract, and writes distinct same-name temporary filenames
- `TEST-INTEG-005`: validate report artifacts and metadata are stored under
  `context.storageUri`, and report links only appear when HTML output exists
- `TEST-INTEG-006`: validate runtime discovery honors explicit user tool-path
  overrides before Windows/macOS/Linux auto-detection
- `TEST-UNIT-027`: validate the pure comparison-report planning module for
  exact `{type}-report-{fullFilename}.html` naming, deterministic workspace
  storage layout, and narrow local-root planning
- `TEST-UNIT-028`: validate the pure comparison-report planning module for
  same-name staged revision filenames plus primary `CreateComparisonReport`
  and fallback `LVCompare` command plans
- `TEST-UNIT-029`: validate the canonical harness clone helper reuses an
  existing clone and performs clone-on-demand when `.git` is absent
- `TEST-UNIT-030`: validate the core harness smoke runner writes retained JSON,
  Markdown, and HTML artifacts from shared history-model facts and fails closed
  when the target file is not tracked
- `TEST-UNIT-031`: validate `VI History` successful command flow for active
  editor fallback, panel creation, copied review packet, copied commit hash,
  opened Git revision, and diff-against-previous execution
- `TEST-UNIT-032`: validate the design-gate CLI default repo-root resolution
  and stable failure-message rendering for Error and non-Error failures
- `TEST-UNIT-033`: validate the history-panel tracker retains opened-panel
  summaries, action summaries, dispatcher behavior, and clear/reset semantics
- `TEST-UNIT-034`: validate the core history model auto-discovers the Git root
  from a tracked filesystem path and preserves default non-strict VI detection
  for offset-8 `LVIN`/`LVCC` content
- `TEST-UNIT-035`: validate the core history model default history load returns
  the full available commit chain and leaves the oldest commit without a
  `previousHash`
- `TEST-UNIT-036`: validate the design-gate runner default filesystem-backed
  coverage read and retained report persistence without injected file helpers
- `TEST-UNIT-037`: validate the design-gate spawned-step executor preserves the
  first settled result and ignores later `error` or `close` events
- `TEST-UNIT-038`: validate the canonical harness registry rejects unknown
  harness identifiers with a stable fail-closed error
- `TEST-UNIT-039`: validate the design-gate CLI script-mode helper applies the
  retained main exit code to `process.exitCode` without forcing an immediate
  process exit
- `TEST-DOC-003`: review architecture and product docs for the published
  WebviewPanel-only surface, desktop/remote-host boundary, and no-publish
  TimelineProvider policy
- `TEST-DOC-004`: review packaging and release guidance for `vsce package`,
  VSIX installation, and Marketplace publishing prerequisites
- `TEST-SMOKE-001`: run the canonical harness smoke and retain JSON, Markdown,
  and HTML reports under `.cache/harness-reports/`
- `TEST-INTEG-001`: run a real VS Code extension host against a temporary Git
  workspace and prove eligible versus ineligible command flow behavior
- `TEST-GATE-001`: run `npm run design:gate` and retain the latest design-gate
  report artifacts under `.cache/design-gate/`
- `TEST-GATE-002`: run `npm run design:gate` and retain weakest-source
  coverage focus plus a deterministic next-focus cue in the latest design-gate
  report

## Reporting

- CI artifacts: `coverage/`
- Test report location: Vitest console output plus coverage summary
- Defect tracking link: GitLab issues in this repository
