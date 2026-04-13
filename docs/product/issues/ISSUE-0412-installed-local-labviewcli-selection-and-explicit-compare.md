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

## Round 3: User Answers

1. The proposal replaces the current Docker-only installed-user contract
   entirely.
2. Docker remains `internal-only`.
3. Runtime selection is `settings-only`.
4. The user must specify both version and bitness; specifying only bitness is
   not sufficient.
5. The user must specify both version and bitness; specifying only version is
   not sufficient.

## Round 3: Updated Working Assessment

- `VHS-REQ-459` and the Docker-only installed-user control plane are no longer
  compatible with the desired product direction.
- The installed-user runtime surface should stop centering Docker image
  settings and instead expose a Windows local-LabVIEWCLI selection contract.
- Auto-picking latest installed LabVIEW is no longer the right default because
  the user has clarified that both version and bitness must be explicitly
  selected.
- The runtime locator can still auto-discover installations internally, but the
  installed-user workflow should fail closed until both required settings are
  present and resolvable.

## Round 3: Recommendations

1. Replace the public installed-user settings surface with exactly two
   required settings:
   - `viHistorySuite.labviewVersion`
   - `viHistorySuite.labviewBitness`
   and remove Docker image settings from the installed-user contract.
2. Keep executable-path discovery internal. Do not make path selection a
   user-facing knob if the intended operator contract is version + bitness
   only.
3. Introduce a hard preflight gate:
   compare cannot run until both settings are present and the runtime locator
   resolves one matching local LabVIEW installation plus its `LabVIEWCLI`
   surface.
4. Make the history panel explicitly show the resolved runtime choice before
   compare execution so the user can verify that their settings mapped to the
   expected local install.
5. Replace “second selection auto-generates compare” with a stable review
   state and one explicit compare action. The current auto-run contract should
   be treated as obsolete.
6. Keep Docker proof and Docker settings in internal or maintainer surfaces
   only. Do not leave them half-public, because that would preserve contract
   ambiguity.

## Round 3: Follow-Up Questions

1. For the installed-user settings contract, do you want the values to be:
   - free-text strings
   - enumerated pick lists generated from discovered installs
   - free-text settings plus validation messages
2. Should the explicit compare action live:
   - in the main history panel header
   - in the compare-selection status card
   - in a dedicated compare preflight section
3. Before compare starts, should the panel show only:
   - selected/base commit
   - LabVIEW version
   - bitness
   or should it also show the resolved local executable paths as read-only
   facts?
4. If the selected version+bitness is not installed locally, should the user
   see:
   - a blocking panel status only
   - a blocking panel status plus a VS Code warning notification
5. Should the canonical compare ordering remain newer commit = selected side
   and older commit = base side regardless of selection order?
6. Do you want the next round to begin turning this into concrete roadmap
   slices, or do you want one more contract round first?

## Round 4: User Answers

3. The panel should show selected/base commit plus LabVIEW version and
   bitness.
4. Missing local runtime selection should surface both:
   - a blocking panel status
   - a VS Code warning notification
6. Codex should decide whether roadmap work can begin.

## Round 4: Codex Decision

Roadmap work can begin now.

Reason:

- the major contract pivots are already settled:
  - installed-user compare is no longer Docker-only
  - Docker becomes internal-only
  - runtime selection is settings-only
  - version and bitness are both required
  - auto-run after second selection is no longer acceptable
- the remaining open items are now implementation-shaping details rather than
  program-direction blockers

## Round 4: Recommendations

1. Start roadmap slicing now. Do not spend another full round on whether the
   roadmap is allowed to exist.
2. Use static settings plus validation rather than dynamic discovered pick
   lists as the primary contract. The user asked for settings-only, and the
   current VS Code manifest contribution model is naturally aligned to explicit
   settings with fail-closed validation.
3. Put the explicit `Compare` action in a dedicated compare preflight section
   rather than the global panel header. That keeps the selected/base pair and
   resolved runtime facts adjacent to the action that depends on them.
4. Keep canonical ordering as newer commit = selected side and older commit =
   base side regardless of selection order. That matches the current report
   generation assumptions and avoids introducing symmetric-pair ambiguity into
   the retained report contract.
5. The first roadmap slice should be control-plane and manifest truth:
   replace the Docker-only installed-user contract in docs, requirements, and
   manifest tests before runtime implementation starts.
6. The second roadmap slice should be runtime-selection preflight:
   require version + bitness settings, resolve one local install, and block
   compare when resolution fails.
7. The third roadmap slice should be explicit compare UX:
   remove second-selection auto-run, add the compare preflight section, and
   surface selected/base commit plus resolved version/bitness before execution.

## Round 4: Follow-Up Questions

1. For settings values, do you accept the recommended contract:
   - `viHistorySuite.labviewVersion`: free-text string
   - `viHistorySuite.labviewBitness`: constrained enum (`x86` | `x64`)
   with fail-closed validation messages?
2. Do you accept the recommended compare action placement:
   a dedicated compare preflight section?
3. Do you accept the recommended canonical ordering:
   newer commit = selected side, older commit = base side, regardless of
   selection order?
4. If you accept 1 through 3, the next round will convert this issue into an
   explicit roadmap and tranche proposal instead of asking another contract
   round.

## Round 5: User Answers

1. Yes.
2. Yes.
3. Yes.

## Round 5: Roadmap Established

No further contract rounds are required to establish a roadmap.

The contract is now stable enough to plan work against these settled facts:

- installed-user compare no longer uses a Docker-only contract
- Docker becomes internal-only
- installed-user runtime selection is settings-only
- both LabVIEW version and bitness are required
- compare must not auto-run after second selection
- the panel preflight must show:
  - selected commit
  - base commit
  - version
  - bitness
- unresolved runtime selection must fail closed in the panel and through a VS
  Code warning notification
- canonical compare ordering remains newer = selected, older = base

## Round 5: Recommended Control-Plane Move

1. Rewrite `PROGRAM-0005` around the new installed-user local-LabVIEWCLI
   contract instead of opening a second competing program.
2. Supersede `ISSUE-0410` with `ISSUE-0412` as the active issue for this
   surface.
3. Introduce a new active tranche to replace the Docker-only tranche direction.

Recommended tranche proposal:

- `TRANCHE-016`
- title: `Installed local LabVIEWCLI contract and explicit compare workflow`
- source: `author direction`
- summary: replace the installed Docker-only compare contract with a
  Windows local-LabVIEWCLI settings contract, require explicit version and
  bitness selection, add fail-closed runtime resolution, and replace automatic
  second-selection compare generation with a dedicated compare preflight
  section plus explicit compare action.

## Round 5: Proposed Roadmap

### Slice 1: Control-plane reset

- rewrite `PROGRAM-0005` north star, gates, and delivery rules around Windows
  local `LabVIEWCLI`
- mark the Docker-only installed-user direction in `ISSUE-0410`,
  `TRANCHE-013`, and `TRANCHE-015` as superseded
- promote `ISSUE-0412` and `TRANCHE-016` as the active path
- update current-state, queue, execution policy, requirements, RTM, and test
  plan to match the new contract

### Slice 2: Manifest and settings contract

- remove installed-user Docker image settings from the public manifest contract
- add public installed-user settings for:
  - `viHistorySuite.labviewVersion`
  - `viHistorySuite.labviewBitness`
- make both required by contract
- keep path discovery internal rather than exposing path knobs publicly
- update manifest/docs tests that currently enforce `VHS-REQ-459`

### Slice 3: Runtime resolution preflight

- replace Docker-only runtime validation with local-install resolution on
  Windows
- require the selected version + bitness to resolve exactly one supported local
  install
- resolve `LabVIEWCLI` and the matching LabVIEW executable internally
- fail closed when resolution is absent, ambiguous, or incompatible
- surface blocking status in-panel plus one VS Code warning notification

### Slice 4: Explicit compare workflow

- remove second-selection auto-run behavior from the history panel
- add a dedicated compare preflight section
- show selected/base commit plus resolved version and bitness
- add one explicit `Compare` action bound to the preflight state
- preserve canonical newer-selected / older-base ordering

### Slice 5: Internal-only Docker containment

- move Docker compare language out of the installed-user surface
- keep Docker in internal/maintainer proof and auxiliary surfaces only
- ensure public installed docs no longer imply Docker is required for extension
  users
- keep any internal Docker proof lanes explicit and separate from the installed
  contract

### Slice 6: Proof and acceptance

- add unit coverage for manifest/settings contract reset
- add unit coverage for fail-closed runtime resolution and explicit compare
  preflight behavior
- add extension-host proof that compare does not auto-run after second
  selection
- add extension-host proof that missing version/bitness selection blocks
  compare and emits the warning surface

## Round 5: Recommended Implementation Order

1. Slice 1: control-plane reset
2. Slice 2: manifest and settings contract
3. Slice 3: runtime resolution preflight
4. Slice 4: explicit compare workflow
5. Slice 5: internal-only Docker containment
6. Slice 6: proof and acceptance

## Round 5: Next Gate

The next truthful move is to commit the control-plane rewrite first, not jump
directly into runtime code changes while the repo still says installed users
are Docker-only.
