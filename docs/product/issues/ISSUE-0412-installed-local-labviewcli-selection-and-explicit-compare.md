# ISSUE-0412: Installed Local LabVIEWCLI Selection And Explicit Compare

## Goal

Reopen the installed-extension compare contract so Windows extension users can
generate comparison reports from their local LabVIEW install through
`LabVIEWCLI`, select the LabVIEW version and bitness explicitly, and confirm
the selected pair before compare generation starts.

## Status

Active post-release issue.

Activation facts:

- the exact released installed extension still uses the Docker-only contract
  retained under `ISSUE-0410`
- `TRANCHE-016` is active for replacing that installed-user contract on
  Windows with host-default local `LabVIEWCLI` plus one bounded expert Docker
  provider
- Docker is no longer the default installed-user destination for this
  surface; it survives only as a generated-CLI-selected expert path
- the current branch now lands the generated settings CLI, exact Windows
  host-runtime preflight, and explicit compare-preflight workflow for that
  replacement contract
- released `repo-standards-review` `v0.2.9` compliance closeout is now
  retained for this branch implementation
- the exact released line is still Docker-only until that branch
  implementation is published and rerun through public acceptance

Round 1 is retained in this file so subsequent rounds can continue from git
history instead of chat memory.

## Scope

- Windows installed-extension compare execution through local `LabVIEWCLI`
- required LabVIEW version + bitness selection across both provider classes
- bounded expert Docker provider selection through the generated settings CLI
- cross-platform settings CLI that writes those settings into user-profile
  storage without PATH mutation
- fail-closed local runtime resolution and preflight
- fail-closed Docker preflight derived from the active engine and explicit
  rejection of unsupported Docker `x86`
- explicit compare preflight state after commit selection
- selected/base commit plus provider/version/bitness visibility before compare
  starts
- panel block plus VS Code warning when required runtime selection is missing
  or unresolved
- control-plane rewrite across queue, current-state, execution policy,
  requirements, RTM, and test plan

## Non-Goals

- claiming the current released package already implements the replacement
  contract before the branch implementation is published
- expanding the installed-user contract into path-picking, direct
  image-family selection, or a general panel-side provider picker
- shipping a prebuilt external settings CLI payload inside the VSIX
- removing internal Docker proof surfaces that are still useful to maintainers
- changing the public evaluation repo scope beyond `vi-history-suite`

## Dependencies

- truthful current-state, queue, ship-control, and execution-policy surfaces
- `src/reporting/comparisonRuntimeLocator.ts`
- `src/ui/historyPanel.ts`
- `src/commands/openViHistoryCommand.ts`

## Acceptance Criteria

- `TRANCHE-016` is the active queue surface and `ISSUE-0410` is historical
  rather than active
- the installed-user settings contract requires version and bitness
- the installed-user contract defaults to host and admits Docker only through
  the generated settings CLI
- runtime preflight resolves one local Windows `LabVIEWCLI` install or fails
  closed
- Docker preflight derives the governed image family from the active engine and
  fails closed on unsupported Docker `x86`
- first settings-CLI use builds a local launcher in user-profile storage
  instead of depending on a prebuilt VSIX-shipped CLI binary
- compare does not auto-run on second selection
- the panel shows selected/base commit plus provider/version/bitness before
  compare
- unresolved runtime selection blocks compare in-panel and through a VS Code
  warning notification

## Required Evidence

- updated queue, README, current-state, ship-control, and execution-policy docs
- updated `PROGRAM-0005`, `ISSUE-0410`, and this issue
- updated SRS, RTM, and test plan
- `python3 /mnt/c/Users/sveld/.codex/skills/repo-standards-review/scripts/preflight_local_dependencies.py --json`
- `python3 /mnt/c/Users/sveld/.codex/skills/repo-standards-review/scripts/requirements_quality_check.py /home/sveld/code/standards/vi-history-suite-user-rounds --json`
- focused docs, manifest, and runtime-settings gates for each landed slice

## Current Active Slice

- keep the current released Docker-only installed contract explicit until the
  branch replacement is truthfully published
- treat standards-compliance refactor work on this branch as closed under
  released `repo-standards-review` `v0.2.9` unless a later released-skill
  audit fails
- keep the installed manifest/settings slice truthful by exposing
  `viHistorySuite.runtimeProvider`, `viHistorySuite.labviewVersion`, and
  `viHistorySuite.labviewBitness`
- prove the generated settings CLI through first-use launcher materialization
  plus current-host launcher execution against a temporary settings file
- prove the explicit Windows no-`--settings-file` target under a disposable
  `APPDATA\\Code\\User\\settings.json`
- retain the governed live-session probe lane from `ISSUE-0414`: persisted
  versus live runtime settings drift probe command, retained packet output, and
  local fail-closed packet assertion
- retain the `ISSUE-0414` gate decision: keep reload-or-restart guidance as
  active truth while direct live-session mutation safe-restore remains
  unproven
- keep the remaining proof gap explicit: direct live mutation of the active
  real user-profile VS Code settings target while Code is already running,
  including fail-closed safe-restore behavior, is not yet end-to-end proven
- execute the governed follow-on branch sequence for that seam through
  [ISSUE-0414 Runtime-Provider CLI Live-Session Proof Roadmap](./ISSUE-0414-runtime-provider-cli-live-session-proof-roadmap.md)
- keep packaged/public docs on the exact released Docker-only baseline until
  the replacement contract is truthfully publishable
- retain the historical branch-transition packet explicitly in
  [issue-0412-promotion-and-publication-handoff.md](../issue-0412-promotion-and-publication-handoff.md)
- retain the runtime-provider public-acceptance gate record explicitly in
  [runtime-provider-public-acceptance-gate.md](../runtime-provider-public-acceptance-gate.md)

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

At the start of proposal discovery, the committed control plane said the
opposite:

- [PROGRAM-0005](../execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)
  defines the installed extension north star as Docker-only compare execution
  with no host LabVIEW fallback
- [ISSUE-0410](./ISSUE-0410-extension-execution-flexibility-and-runtime-acquisition-ux.md)
  was the active post-release issue for Docker-only installed execution and
  explicitly listed host-native LabVIEW as a non-goal

This means the proposal is not a small UX tweak. It is a product-direction
change that must either replace or explicitly supersede the current
Docker-only installed contract.

## Round 1 Discovery-Time Code Evidence

At proposal discovery time, the implementation surface was split this way:

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

That discovery snapshot is no longer current branch truth.

## Current Branch Checkpoint

The active branch now lands the replacement control-plane slices that were
still only proposal material during round 1:

- `package.json` now exposes `viHistorySuite.runtimeProvider`,
  `viHistorySuite.labviewVersion`, and `viHistorySuite.labviewBitness` and
  does not expose public image settings or public `executionMode`
- `src/reporting/comparisonRuntimeLocator.ts` now derives installed-user
  provider selection from persisted provider request first, while retaining
  `executionMode`, explicit paths, and related override lanes only as bounded
  internal/runtime-proof compatibility surfaces
- `tests/integration/suite/extensionHost.test.ts` now proves the prepared
  current-host launcher can switch provider intent between `host` and
  `docker` while writing version and bitness into a temporary settings file
- the explicit Windows proof lane `npm run test:integration:windows` now
  also proves the `.cmd` launcher path and the default
  no-`--settings-file` target under a disposable
  `APPDATA\\Code\\User\\settings.json`, aligned to the active disposable
  Windows integration-host profile
- that same Windows proof lane now also proves the governed CLI
  readback/validation surface on a persisted `docker` / `2026` / `x64`
  bundle: when Docker Desktop and the governed Windows image are available on
  the canonical host, validation returns `runtimeValidationOutcome=ready`
  with `runtimeProvider=windows-container`, `runtimeEngine=labview-cli`, and
  no blocked reason
- `src/ui/historyPanel.ts` now uses explicit compare preflight instead of
  auto-generating compare output on second commit selection
- `src/commands/openViHistoryCommand.ts` now surfaces provider request,
  selected provider, and preflight/block facts instead of treating
  second-selection auto-run as the live branch contract
- direct live mutation of the already-running VS Code session remains
  partially proven through a retained persisted-versus-live probe packet plus
  local packet gate, and the retained gate decision keeps reload-or-restart
  guidance active while end-to-end mutation safety remains unproven; the
  generated CLI plus the settings-driven compare-preflight and runtime-doctor
  surfaces now warn users to reload or restart the window before using Compare
  when Code is already open
  for this slice

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
   At discovery start, `ISSUE-0410` and `PROGRAM-0005` governed installed execution as
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

## Round 5: On-Demand Settings CLI Direction

- the settings CLI should not be shipped as a prebuilt VSIX payload
- instead, the first settings operation should build the CLI in place under
  user-profile storage
- the launcher should remain cross-platform so Windows and Linux test hosts can
  seed the same settings contract
- the CLI still writes only `viHistorySuite.labviewVersion` and
  `viHistorySuite.labviewBitness`; it does not become a separate runtime mode
  or path-picking surface

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

## Round 6: Docker-Selectable CLI Proposal Reopening

- Windows Docker image acquisition should be treated the same way as Linux
  Docker image acquisition, including cold-pull behavior.
- The settings CLI should be able to select Docker explicitly.
- If Docker is not explicitly selected, execution should default to the host
  runtime path.
- The default NI Docker images support only 64-bit LabVIEW on both Linux and
  Windows.
- The bitness flag should remain required even when Docker is selected.
- If the user selects Docker plus 32-bit, the product should inform the user
  that the Docker image does not support 32-bit LabVIEW.

## Round 6: Contract Impact

- This proposal reopens two decisions that were previously treated as settled:
  - Docker was being constrained to `internal-only`.
  - Installed-user runtime selection was being modeled as `settings-only`
    LabVIEW version plus bitness, without a user-facing provider switch.
- The proposal now points toward a user-facing provider-selection contract with
  host as the default path and Docker as an explicit opt-in path.
- That means the next roadmap cannot be considered stable until provider
  selection, CLI scope, and Docker-support boundaries are re-settled.

## Round 6: First-Round Questions

1. Do you want Docker to become a supported extension-user execution provider
   again, or do you want it to remain primarily an expert or maintainer path
   that is only exposed through the CLI?
2. When you say “use the CLI to be able to select Docker explicitly,” do you
   mean:
   - the same generated settings CLI writes a provider selection into user
     settings, or
   - a one-shot command-line flag chooses Docker only for the current run?
3. If Docker is not selected, should the default host path be:
   - local `LabVIEWCLI` on Windows only, or
   - local `LabVIEWCLI` anywhere the host runtime can be resolved?
4. Do you still want LabVIEW version and bitness to remain required even for
   the host path, with no auto-pick fallback?
5. When Docker is explicitly selected with 32-bit LabVIEW, should the product:
   - fail closed before compare starts, or
   - silently fall back to host?
6. If Docker is explicitly selected, should version still matter to the user
   contract when the NI image is effectively one governed 64-bit runtime
   surface?
7. Should Windows and Linux Docker cold-pull behavior be presented as the same
   user-facing acquisition flow, or do you want Windows to stay visibly
   distinguished because it depends on Windows-container mode?
8. Do you want this provider-selection choice exposed only through the CLI, or
   also visible in the compare preflight section before the explicit
   `Compare` action?

## Round 7: User Answers

1. Docker should be exposed only through the CLI as a bounded expert path.
2. Docker selection should persist in user settings.
3. If Docker is not explicitly selected, the default execution path should be
   local `LabVIEWCLI` on Windows.
4. The user asked for a UX-driven decision on whether version and bitness
   remain required for every compare request.
5. The user asked for a UX-driven decision on Docker plus `x86`.
6. The user asked for a UX-driven decision on whether version still matters
   when Docker is selected.
7. The user asked for a UX-driven decision on whether Windows and Linux Docker
   cold-pull behavior should be unified or visibly distinct.
8. The user asked for a UX-driven decision on whether provider selection
   should also be surfaced in compare preflight.

## Round 7: Decisions

1. Version and bitness should remain required for every compare request,
   including the default host-native Windows path.
   Rationale:
   the requested runtime becomes deterministic, the compare result remains
   attributable to one chosen LabVIEW surface, and the one-time CLI setup cost
   is lower than the long-term ambiguity cost of auto-picking the wrong local
   install.
2. Docker plus `x86` should fail closed before compare starts.
   Rationale:
   expert users asked for Docker explicitly, so silently falling back to host
   would hide a provider mismatch; the truthful UX is to block early and tell
   the user that the governed NI Docker surface is x64-only.
3. Version should still matter when Docker is selected.
   Rationale:
   the settings contract stays uniform across providers, and Docker admission
   can truthfully reject version/bitness bundles that do not match the governed
   NI image surface instead of silently overriding the user's chosen version.
4. Docker acquisition should use one unified top-level flow across Windows and
   Linux, with provider-specific diagnostics retained when needed.
   Rationale:
   users should see one consistent acquisition model (`selected`, `present`,
   `pulling`, `acquired`, `failed`), while Windows-specific engine-mode facts
   remain visible only when they matter.
5. Provider selection should also be visible in compare preflight, even though
   it is CLI-settable only.
   Rationale:
   preflight needs to tell the user what will actually run; hidden provider
   state would make the explicit `Compare` action untrustworthy.

## Round 7: Recommendations

1. Replace the earlier “Docker becomes internal-only” direction with a narrower
   rule:
   Docker is not a normal panel workflow, but it is still a governed
   expert-selectable provider through the settings CLI.
2. Keep one persisted provider setting in user settings, but default it to the
   host path.
3. Keep the version+bitness requirement uniform across both providers.
4. Treat Docker `x86` and unsupported Docker-version requests as preflight
   admission failures, not as fallback cases.
5. Show provider, version, and bitness together in the compare preflight
   section before the explicit `Compare` action.
6. Keep Docker acquisition and cold-pull progress under one shared user-facing
   model, with Windows-specific engine-mode checks as bounded detail.

## Round 7: Follow-Up Questions

1. Do you want the provider setting to be:
   - `host` or `docker`
   - or a three-state value such as `host`, `docker-linux`, `docker-windows`?
2. When Docker is selected, should the product choose the Windows versus Linux
   NI image automatically from the current Docker engine, or should the CLI let
   the expert user force one image family?
3. For the persisted CLI contract, do you want one command that sets all three
   facts together:
   - provider
   - LabVIEW version
   - LabVIEW bitness
   or separate commands for provider versus runtime selection?
4. When preflight blocks Docker because the selected bundle is unsupported,
   should the corrective guidance point the user to:
   - rerun the CLI with `host`
   - rerun the CLI with `x64`
   - both
5. Should the compare preflight section show the provider as read-only text, or
   do you want it to include an “update via CLI” hint right there?

## Round 8: User Answers

1. The user asked for a decision on whether the persisted provider setting
   should be two-state or three-state.
2. The user asked for a developer-experience decision on whether Docker image
   family should be chosen automatically or forced explicitly through the CLI.
3. The persisted CLI contract should use one command that sets provider,
   LabVIEW version, and LabVIEW bitness together.
4. The user asked for a developer-experience decision on corrective guidance
   when Docker is selected with an unsupported bundle.
5. The user asked for a developer-experience decision on whether compare
   preflight should include a CLI hint.

## Round 8: Decisions

1. The persisted provider setting should be two-state:
   - `host`
   - `docker`
   Rationale:
   provider selection should answer only “local host runtime or governed Docker
   runtime.” Splitting Docker into `docker-linux` and `docker-windows` would
   expose engine-family details that the product can derive from the active
   Docker engine and would create extra state the user has to keep coherent.
2. When Docker is selected, the product should choose the Windows versus Linux
   NI image automatically from the current Docker engine.
   Rationale:
   the current engine is already the authoritative execution constraint, so
   making users force an image family would mainly create contradictory states
   such as “docker-windows requested while Linux engine is active.” The better
   developer experience is one Docker selection plus truthful preflight about
   the current engine and selected image.
3. Unsupported Docker bundles should surface corrective guidance for both:
   - switch provider to `host`
   - or switch bitness to `x64`
   Rationale:
   that gives the user both truthful escape routes without hiding the reason
   for the failure. For `x86`, host preserves the requested bitness, while
   `x64` preserves the requested provider.
4. The compare preflight should show provider as read-only text plus an
   explicit “update via CLI” hint.
   Rationale:
   users need to see what will actually run, and expert users need the shortest
   path to fix mismatched provider state without hunting through docs or
   settings.

## Round 8: Updated Working Assessment

- The provider contract is now coherent enough to restate the roadmap:
  - host-native `LabVIEWCLI` is the default installed-user path
  - Docker remains available only as a bounded expert CLI-selected provider
  - provider choice persists in settings
  - image family is derived from the active Docker engine
  - version and bitness remain required across both providers
  - Docker `x86` is a fail-closed preflight error with dual corrective guidance
  - compare preflight must show provider, version, and bitness together
- The earlier “Docker becomes internal-only” direction is no longer valid and
  needs to be superseded before an honest roadmap can be published.

## Round 8: Recommendations

1. Replace the previous control-plane language that removed Docker from the
   installed-user contract entirely.
   New truth:
   Docker survives as a bounded expert provider selected through the settings
   CLI, while host-native Windows `LabVIEWCLI` is the default installed-user
   workflow.
2. Keep one generated settings CLI command that writes exactly three user
   choices together:
   - provider
   - LabVIEW version
   - LabVIEW bitness
3. Make preflight responsible for provider-specific admissibility:
   - host: matching local runtime must resolve
   - docker: active engine must determine the image family and the selected
     bundle must be x64-compatible with the governed image surface
4. Keep the compare preflight section as the visible contract summary:
   - selected commit
   - base commit
   - provider
   - LabVIEW version
   - LabVIEW bitness
   - explicit `Compare` action
5. Treat provider-specific acquisition and validation as implementation slices,
   not as open contract questions, because the contract is now stable enough to
   roadmap.

## Round 8: Roadmap Readiness

- The contract is now stable enough to establish a revised roadmap.
- The next round should stop asking contract questions and convert the updated
  provider model into explicit control-plane and implementation slices.

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

## Round 9: Revised Roadmap Established

Rounds 6 through 8 supersede the earlier Round 5 roadmap in one specific way:
Docker no longer disappears from the installed-user contract entirely. Instead,
the stable contract is now:

- host-native Windows `LabVIEWCLI` is the default installed-user provider
- Docker remains available only as a bounded expert provider selected through
  the generated settings CLI
- provider selection persists in user settings
- provider is two-state: `host` or `docker`
- Docker image family is derived from the active Docker engine
- version and bitness remain required across both providers
- Docker `x86` fails closed before compare starts
- Docker preflight shows corrective guidance for both `host` and `x64`
- compare preflight shows provider, version, and bitness together before the
  explicit `Compare` action

The roadmap is now stable again.

## Round 9: Revised Control-Plane Move

1. Rewrite `PROGRAM-0005` so it no longer claims Docker is absent from the
   installed-user destination entirely.
   New truth:
   host-native `LabVIEWCLI` is the default installed-user path, while Docker
   survives as a bounded expert CLI-selected provider.
2. Keep `ISSUE-0410` as the closed historical Docker-first released baseline.
3. Keep `TRANCHE-016` as the active tranche, but revise its summary and gates
   to reflect host-default plus expert-Docker rather than host-only.

Revised tranche statement:

- `TRANCHE-016`
- title: `Installed local LabVIEWCLI default path, expert Docker provider, and explicit compare workflow`
- source: `author direction`
- summary: replace the released Docker-first installed compare contract with a
  host-default Windows `LabVIEWCLI` contract that still admits a bounded
  expert Docker provider through the generated settings CLI, requires explicit
  provider plus version plus bitness selection, validates the selected provider
  fail-closed before compare, and replaces automatic second-selection compare
  generation with a dedicated compare preflight section plus explicit compare
  action.

## Round 9: Revised Roadmap

### Slice 1: Control-Plane Reset

- rewrite `PROGRAM-0005`, execution policy, current-state, queue, README,
  requirements, RTM, and test plan around:
  - host-default installed compare
  - bounded expert Docker provider
  - explicit provider + version + bitness settings contract
- classify the current exact released Docker-first contract as historical
  implemented truth under `ISSUE-0410`, `TRANCHE-013`, and `TRANCHE-015`
- remove stale claims that Docker is fully absent from future installed-user
  execution

### Slice 2: Persisted Provider-Selection CLI Contract

- extend the generated user-profile CLI so one command writes exactly:
  - provider
  - LabVIEW version
  - LabVIEW bitness
- keep provider values bounded to:
  - `host`
  - `docker`
- default the persisted provider to `host`
- keep the CLI as the only place where Docker is selected explicitly

### Slice 3: Host Runtime Preflight

- require the selected version + bitness to resolve exactly one local Windows
  `LabVIEWCLI`-backed runtime when provider = `host`
- fail closed on missing, ambiguous, or incompatible host resolution
- preserve one panel block plus one VS Code warning surface

### Slice 4: Docker Runtime Preflight And Acquisition

- when provider = `docker`, derive the governed Windows versus Linux image from
  the active Docker engine automatically
- retain one unified cold-pull/acquisition flow across Linux and Windows
- reject unsupported bundles such as Docker + `x86` before compare starts
- surface dual corrective guidance:
  - switch provider to `host`
  - or switch bitness to `x64`
- keep engine-specific facts as bounded diagnostics rather than new provider
  modes

### Slice 5: Explicit Compare Workflow

- remove second-selection auto-run behavior
- add a dedicated compare preflight section
- show:
  - selected commit
  - base commit
  - provider
  - LabVIEW version
  - LabVIEW bitness
- add one explicit `Compare` action
- add a visible “update via CLI” hint on the provider/runtime summary
- preserve canonical newer-selected / older-base ordering

### Slice 6: Reader-Surface And Proof Normalization

- normalize bundled, authority, and public execution-policy docs around the
  new host-default plus expert-Docker contract
- prove that host remains the default path when Docker is not selected
- prove that Docker provider selection persists in settings through the CLI
- prove that Docker `x86` fails closed with the dual corrective guidance
- prove that compare does not start automatically on second selection

## Round 9: Revised Implementation Order

1. Slice 1: control-plane reset
2. Slice 2: persisted provider-selection CLI contract
3. Slice 3: host runtime preflight
4. Slice 4: Docker runtime preflight and acquisition
5. Slice 5: explicit compare workflow
6. Slice 6: reader-surface and proof normalization

## Round 9: Next Gate

The next truthful move is still the control-plane rewrite first. The current
program docs still encode the older “Docker fully internal-only” direction, so
implementation should not advance further until that drift is removed.
