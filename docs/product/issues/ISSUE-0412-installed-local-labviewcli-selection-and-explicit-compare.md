# ISSUE-0412: Installed Local LabVIEWCLI Selection And Explicit Compare

## Goal

Reopen the installed-extension compare contract so Windows extension users can
generate comparison reports from their local LabVIEW install through
`LabVIEWCLI`, select the LabVIEW version and bitness explicitly, and confirm
the selected pair before compare generation starts.

## Status

Proposal discovery issue.

Round 1 is retained in this file so subsequent rounds can continue from git
history instead of chat memory.

## Round 1: User Proposal Facts

- authority repo for this work: `vi-history-suite`
- base branch: `develop`
- repo scope for the change: `vi-history-suite` only
- installed extension users need to use their local LabVIEW install instead of
  Docker
- canonical local execution backend: `LabVIEWCLI`
- current platform scope: Windows only
- requested explicit selector contract:
  - `--labview-version 2026`
  - `--labview-bitness x64`
- when selection is omitted, auto-pick the latest installed LabVIEW that
  satisfies the selection rule
- after the second commit is selected, compare generation must not start
  immediately
- the compare workflow must require an explicit compare action
- before compare starts, the surface must show the chosen LabVIEW version and
  bitness
- hard constraints:
  - no admin elevation
  - no `PATH` mutation
  - no writes outside the user profile
  - no separate NI CLI install

## Current Repo Truth That This Proposal Reopens

The current committed control plane says the opposite:

- [PROGRAM-0005](../execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)
  defines the installed extension north star as Docker-only compare execution
  with no host LabVIEW fallback
- [ISSUE-0410](./ISSUE-0410-extension-execution-flexibility-and-runtime-acquisition-ux.md)
  scopes the active post-release issue to Docker-only installed execution and
  explicitly lists host-native LabVIEW as a non-goal

This means the proposal is not a small UX tweak. It is a product-direction
change that must either replace or explicitly supersede the current
Docker-only installed contract.

## Current Code Evidence

The implementation surface is split today:

- `package.json` still contributes a Docker-centered installed-user settings
  surface through `viHistorySuite.windowsContainerImage` and
  `viHistorySuite.linuxContainerImage`
- `src/reporting/comparisonRuntimeLocator.ts` already contains internal
  host-native runtime selection types and settings for:
  - `executionMode`
  - `labviewCliPath`
  - `labviewExePath`
  - `bitness`
- `src/ui/historyPanel.ts` still tells users that the second checkbox selection
  automatically generates compare output
- `src/commands/openViHistoryCommand.ts` and
  `tests/unit/openViHistoryCommand.test.ts` already encode the current
  second-selection auto-generate behavior

## Round 1 Working Assessment

- The repo already has enough internal runtime-selection machinery to support a
  local `LabVIEWCLI` direction.
- The public manifest, installed-user docs, and panel workflow are still
  aligned to the current Docker-only contract.
- The next rounds need to settle the product contract before an honest roadmap
  can be established.

## Open Items For Round 2

- decide whether the new local `LabVIEWCLI` path fully replaces the installed
  Docker-only contract or coexists with it in some bounded way
- decide how a user-facing “simple CLI parameters” contract maps onto the
  actual extension surface on Windows
- decide what exact review state appears between second-commit selection and
  explicit compare execution
- decide what failure contract applies when the requested LabVIEW version or
  bitness is not installed locally

## Round 2: Recommendations

1. Treat this proposal as a product-contract reset, not a small UX tweak.
   `ISSUE-0410` and `PROGRAM-0005` currently govern installed execution as
   Docker-only, so the roadmap will need to replace or explicitly supersede
   that contract.
2. Make Windows installed-user compare canonical on local `LabVIEWCLI`, not
   “Docker first with host fallback.” The repo already contains internal
   `host-native` + `labview-cli` runtime-selection machinery in
   `src/reporting/comparisonRuntimeLocator.ts`.
3. Model runtime selection around three facts:
   - requested LabVIEW version
   - requested LabVIEW bitness
   - resolved executable path
   Bitness alone is not enough for the user workflow you described.
4. Replace the current “second checkbox auto-runs compare” flow with an
   explicit preflight state that shows:
   - selected commit
   - base commit
   - resolved LabVIEW version
   - resolved LabVIEW bitness
   - explicit compare action
5. Fail closed when the requested version or bitness is not installed. Silent
   fallback would make the version/bitness surface untrustworthy.
6. Keep Docker, if it survives at all, outside the default installed-user
   compare path until a later round proves it still belongs in the contract.

## Round 2: Follow-Up Questions

1. Should this proposal replace the current Docker-only installed-user contract
   entirely, or create a Windows installed-user exception?
2. Should Docker remain anywhere in the installed compare surface after this
   change?
   Options under consideration:
   - internal-only
   - advanced installed option
   - remove from installed compare
3. Where should the user set `--labview-version` and `--labview-bitness`?
   Options under consideration:
   - settings only
   - panel only
   - both settings and panel
4. If the user specifies only bitness, should “latest installed” mean the
   latest installed LabVIEW matching that bitness?
5. If the user specifies only version, should bitness default to:
   - latest matching install
   - x64 preferred
   - fail until bitness is explicit
6. In the pre-compare state, do you want to show only version and bitness, or
   also the resolved `LabVIEW.exe` and `LabVIEWCLI.exe` paths?
7. Should the canonical compare ordering remain newer commit = selected side
   and older commit = base side regardless of selection order?
8. After your answers, should the next round stay at contract-and-roadmap
   level, or should implementation slicing begin immediately?
