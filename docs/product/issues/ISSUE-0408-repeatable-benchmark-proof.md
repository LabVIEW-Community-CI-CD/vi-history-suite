# ISSUE-0408: Repeatable Benchmark Proof

## Goal

Turn the current Windows and Linux benchmark scaffolding into one governed,
repeatable benchmark-proof packet for the deep `HARNESS-VHS-002` /
`resource/plugins/lv_icon.vi` target.

This issue exists so benchmark truth has its own bounded closure path instead
of remaining mixed into the public-release acceptance program.

## Status

Queued follow-on post-release issue.

Activation depends on:

- `PROGRAM-0002` closing Gate D under `TRANCHE-010`
- `TRANCHE-011` becoming the active queue tranche

Current retained benchmark truth before activation:

- the deep Linux host benchmark now fails truthfully late at pair `135/138`
  with `command-exited-nonzero`
- the retained Linux summary now records
  `terminalPairDiagnosticReason=linux-headless-recursive-load`
- bounded fresh Linux container repros show the same pair does not complete
  under either `LabVIEWCLI` or `LVCompare`
- retrying the pair after timeout degrades into `-350000` connection failure
  instead of recovering the headless session
- the authority repo now retains per-pair failure receipts, terminal partial
  summaries, native Linux diagnostic logs, supplemental headless artifacts, a
  surfaced terminal diagnostic reason, and stale-report guards for that lane
- the Windows benchmark image is now published and pullable at
  `ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/windows-dashboard-benchmark:main`
  after successful publication runs `23993316899`, `23993748337`, and
  `23994505706`
- local host-runnable proof for the Windows benchmark image is still open

## Scope

- deep Linux benchmark failure closure
- local proof of the published Windows benchmark image
- comparative benchmark packet for the Windows host, Windows image, and Linux
  image lanes
- control-plane normalization of the accepted benchmark result

## Non-Goals

- closing the public-release human UX gate
- changing the public facade repo scope
- treating private GitHub experiment results as product authority
- feature expansion unrelated to benchmark proof

## Dependencies

- canonical Windows host baseline evidence
- published Linux and Windows benchmark images
- retained benchmark consumers and failure receipts
- `PROGRAM-0003` and `TRANCHE-011`

## Acceptance Criteria

- Linux completes the deep `138/138` benchmark truthfully or exits with an
  explicitly governed bounded exception
- the published Windows benchmark image is proven locally on the canonical host
- one comparative benchmark packet exists with explicit comparability outcome
- `current-state`, `README`, queue docs, and benchmark docs reflect the result

## Required Evidence

- retained Linux terminal summary and diagnostics
- retained Windows benchmark-image terminal summary
- retained comparative benchmark packet
- updated control-plane docs and design-gate pass

## First Active Slice

- consume the retained Linux pair `135/138` failure evidence
- preserve the Linux headless-runtime blocker as governed benchmark truth
- finish the host-runnable Windows benchmark-image proof
- stop short of claiming full comparability until both image lanes have
  truthful terminal summaries
