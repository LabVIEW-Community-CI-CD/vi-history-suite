# Repo-Standards-Review v0.2.9 Compliance Roadmap

## Purpose

Retain the multi-pass refactor plan for bringing `vi-history-suite` into
released `repo-standards-review` `v0.2.9` compliance without collapsing the
work into one unsafe rewrite.

This roadmap exists so the compliance refactor stays visible in the repo
instead of living in chat memory.

## Current Position

- released assurance baseline: `repo-standards-review` `v0.2.9`
- first proving target: `feature/local-labviewcli-selection-and-explicit-compare`
- pass 1 status: complete
- pass 1 outcome: released-skill CM gate now passes after the GitFlow branch
  governance rewrite on this branch
- pass 3 status: checkpoint 1 complete
- pass 4 status: complete
- pass 5 status: checkpoint 15 complete
- pass 5 checkpoint 1 outcome: the runtime-provider and compare-flow
  requirement cluster now separates current implemented baseline truth from the
  active replacement direction
- pass 5 checkpoint 2 outcome: installed compare runtime selection is now
  provider-driven from persisted `host|docker` settings in the live locator and
  doctor surfaces, with focused proof for both paths
- pass 5 checkpoint 3 outcome: the live VI History panel now uses explicit
  compare preflight with a dedicated `Compare` action, and the command path
  blocks compare generation when preflight is not ready
- pass 5 checkpoint 4 outcome: Windows installed compare runtime preflight now
  resolves one exact version+bitness LabVIEW executable plus matching
  `LabVIEWCLI` surface, and fails closed on missing, ambiguous, or
  incompatible host resolution under `VHS-REQ-532`
- pass 5 checkpoint 5 outcome: the compare-selection requirement cluster now
  matches the live explicit compare-preflight implementation, and the
  capability-state package no longer claims second-selection compare auto-run
  as current branch truth
- pass 5 checkpoint 6 outcome: older foundational runtime-override and
  compare-selection rows now distinguish internal/runtime-proof compatibility
  inputs from the public installed-user manifest and no longer claim auto-run
  compare behavior as current branch truth
- pass 5 checkpoint 7 outcome: older missing-runtime guidance no longer points
  the active branch at retired public path settings and now traces blocked
  compare guidance to provider-safe version, bitness, Docker-prerequisite, or
  bounded internal-override facts as appropriate
- pass 5 checkpoint 8 outcome: the remaining Windows-container image row now
  treats image resolution as an internal governing invariant instead of
  implying that installed users still configure public image settings directly
- pass 5 checkpoint 9 outcome: the older Windows x64 provider-boundary package
  no longer describes expert Docker isolation as a future-only path and now
  keeps that lane aligned with the active bounded-expert contract
- pass 5 checkpoint 10 outcome: runtime doctor and history-panel runtime
  summaries now foreground provider request instead of legacy execution-mode
  vocabulary, while keeping older execution-mode-only retained summaries
  readable as legacy evidence
- pass 5 checkpoint 11 outcome: the docs-CI requirement and retained
  installed-user truth packet now key off the exact released Docker-only
  bundled-guide facts instead of the older Docker-first Windows auto shorthand
- pass 5 checkpoint 12 outcome: retained comparison-report packet HTML now
  renders `Provider request` instead of `Execution mode` while still deriving
  a readable provider-request value from older execution-mode-only packets
- pass 5 checkpoint 13 outcome: runtime locator provider-decision reasons and
  details now use `provider-request-*` wording when the active branch carries
  an explicit persisted host or docker provider request, while the legacy
  `executionMode` and `auto` characterization lanes remain intact
- pass 5 checkpoint 14 outcome: explicit persisted Docker-provider blocks now
  emit `docker-provider-*` blocked reasons, while the legacy
  `docker-only-*` and `auto-docker-installed-*` characterization lanes remain
  intact for older override and proof surfaces
- pass 5 checkpoint 15 outcome: explicit persisted host and docker provider
  notes plus runtime-doctor next-action derivation now key off
  `requestedProvider` first, while legacy `executionMode` remains retained as
  compatibility evidence
- pass 6 status: checkpoint 3 complete
- pass 6 checkpoint 1 outcome: `ADR-0030` now uses a GitFlow-aligned file path
  and the live architecture, RTM, wiki-coverage, and release-governance test
  surfaces all point at the corrected path
- pass 6 checkpoint 2 outcome: the architecture package now distinguishes the
  historical Docker-only installed baseline from the active develop-line
  host-default plus expert-Docker contract through new `ADR-0038`, while
  `ADR-0025` and `ADR-0026` are retained explicitly as superseded historical
  baseline decisions
- pass 6 checkpoint 3 outcome: the active execution RTM and test-plan traces
  now point at `ADR-0038` as active doctrine, and the branch keeps
  `VHS-REQ-532..540` promoted as implemented branch truth
- pass 7 status: checkpoint 6 complete
- pass 7 checkpoint 1 outcome: the active reader/control-plane status surfaces
  now reflect that generated provider selection, exact Windows host-runtime
  preflight, and explicit compare preflight are landed on this branch, while
  publication-facing normalization and later public acceptance handoff remain
  the open work
- pass 7 checkpoint 2 outcome: authority maps, execution policy, and
  `PROGRAM-0005` now keep bundled/public user surfaces on the exact released
  Docker-only baseline until a future publication handoff, while the active
  host-default plus expert-Docker replacement remains authority/internal truth
- pass 7 checkpoint 3 outcome: the docs-authoring workbench and current-state
  docs-CI summaries now state the exact released bundled-guide execution truths
  instead of the older Docker-first Windows auto shorthand
- pass 7 checkpoint 4 outcome: `EPIC-0003` now separates the exact released
  Docker-only bundled/user baseline, the active authority/internal
  host-default plus expert-Docker direction, and the bounded
  internal/runtime-proof compatibility inputs instead of collapsing them into
  one outdated extension-user story
- pass 7 checkpoint 5 outcome: `ISSUE-0412` now labels its round-1 code
  evidence explicitly as discovery-time historical context and retains one
  separate current-branch checkpoint so the issue packet no longer presents
  stale Docker-image-setting and auto-run statements as live branch truth
- pass 7 checkpoint 6 outcome: canonical exact-pair diagnosis now says
  explicitly that `--execution-mode` is a bounded proof-surface admission
  input for targeted reruns, not installed-user extension doctrine

## Pass Order

1. Pass 1: Branch-governance baseline
   - objective: make the repo compliant with the released skill's GitFlow CM
     doctrine before widening the refactor
   - status: complete on this branch
   - retained proof: released `v0.2.9` audit now returns `cm: PASS`

2. Pass 2: Baseline gap inventory and contradiction map
   - objective: run the released skill in repeated audit and evidence-pack
     passes against this branch and `develop`, then classify findings by
     standards area instead of editing ad hoc
   - output:
     - missing-information-item inventory
     - contradiction ledger
     - obsolete-artifact ledger
     - uplift backlog grouped by `REQ`, `ARCH`, `CM`, `DOC`, and `TEST`
   - retained inventory packet:
     [repo-standards-review-v0.2.9-pass-2-gap-inventory.md](./repo-standards-review-v0.2.9-pass-2-gap-inventory.md)

3. Pass 3: Information-item package uplift
   - objective: add the missing governed package expected by the released
     skill, including `SyRS`, aligned `SRS`, `RTM`, architecture description,
     release-control package, and information-item map updates
   - status: checkpoint 1 complete on this branch
   - checkpoint 1 scope:
     - add `docs/requirements/syrs.md`
     - update `SRS` to declare its parent `SyRS`
     - update the information-item map to split system versus software
       ownership explicitly
   - focus:
     - separate system-level and software-level scope truthfully
     - stop relying on partial package coverage
     - make the repo apply the same standards discipline it is using for its
       external contract

4. Pass 4: Contradiction ledger
   - objective: retain one explicit ledger of naming drift, superseded
     doctrine, and package-level contradictions before broad content rewrites
     begin
   - status: complete on this branch
   - retained ledger:
     [repo-standards-review-v0.2.9-pass-4-contradiction-ledger.md](./repo-standards-review-v0.2.9-pass-4-contradiction-ledger.md)

5. Pass 5: Requirement-system refactor
   - objective: normalize the large requirement corpus instead of patching it
     piecemeal
  - status: checkpoint 15 complete on this branch
   - checkpoint 1 scope:
     - separate the current implemented checkbox auto-run workflow from the
       planned explicit compare replacement
     - separate the exact released Docker-only baseline from the active
       host-default plus expert-Docker installed-user contract
     - retell the bounded Windows-container proof path without mislabeling it
       as the active installed-user default
   - checkpoint 2 scope:
     - make installed compare runtime selection derive effective provider
       intent from persisted `viHistorySuite.runtimeProvider`
     - retain the legacy `executionMode` surface only as compatibility and
       proof context instead of the source of installed-user truth
     - update runtime doctor guidance so host-only contamination points users
       toward the expert Docker path instead of a vague execution-mode change
   - checkpoint 3 scope:
     - replace second-selection compare auto-run with explicit compare
       preflight in the live history panel
     - show selected commit, base commit, provider, LabVIEW version, and
       LabVIEW bitness before compare execution
     - block compare generation when preflight is not ready and retain focused
       command-path proof for that block
   - checkpoint 4 scope:
     - make Windows installed compare runtime preflight resolve one exact
       version+bitness LabVIEW executable plus one matching `LabVIEWCLI`
       surface
     - fail closed when that host resolution is missing, ambiguous, or
       incompatible instead of selecting the first matching candidate
   - checkpoint 5 scope:
     - rewrite the compare-selection requirement and RTM rows so they match
       explicit compare preflight instead of the retired auto-run branch truth
     - retrace the matching test-plan proof line for that requirement cluster
     - normalize the main capability-state package so it no longer claims
       second-selection compare auto-run as current branch behavior
   - checkpoint 6 scope:
     - rewrite older foundational runtime-override rows so they describe
       internal/runtime-proof compatibility inputs rather than a public
       installed-user manifest contract
     - normalize the earlier compare-selection row and its proof line to the
       explicit compare-preflight model
     - add regression guards so the obsolete path-level manifest and compare
       auto-run wording do not re-enter the requirements package
   - checkpoint 7 scope:
     - normalize older missing-runtime guidance so it no longer points active
       branch users toward retired public path settings
     - keep missing-runtime notes aligned to provider-safe version, bitness,
       Docker-prerequisite, and bounded internal-override correction paths
   - checkpoint 8 scope:
     - normalize the Windows-container image requirement row so it reflects a
       resolved internal governing image invariant rather than a public image
       configuration surface
   - checkpoint 9 scope:
     - normalize the Windows x64 provider-boundary requirement and supporting
       ADR/test-plan wording so expert Docker isolation is retained as a live
       bounded lane instead of a future-only placeholder
   - checkpoint 10 scope:
     - replace front-facing runtime-doctor and panel-summary execution-mode
       wording with provider-request wording
     - keep the command layer compatible with older retained execution-mode
       doctor summaries so historical packets remain readable
  - checkpoint 11 scope:
    - normalize the docs-CI requirement row and retained truth-packet labels
      so they match the exact released bundled-doc execution-policy facts
    - remove the older Docker-first Windows auto shorthand from the active
      requirement/package wording
  - checkpoint 12 scope:
    - normalize the retained comparison-report packet runtime-selection surface
      from `Execution mode` to `Provider request`
    - keep older execution-mode-only packets readable by deriving a compatible
      provider-request label
  - checkpoint 13 scope:
    - normalize runtime locator provider-decision reason codes and details for
      explicit persisted host or docker provider requests
    - preserve the older `executionMode` override and `auto` characterization
      lanes as legacy/internal compatibility surfaces
  - checkpoint 14 scope:
    - normalize blocked-reason vocabulary for explicit persisted Docker
      provider requests
    - preserve the older `docker-only-*` and `auto-docker-installed-*`
      blocked-reason surfaces as legacy/internal compatibility lanes
  - checkpoint 15 scope:
    - normalize explicit host/docker provider notes so active blocked and
      selected-runtime narration no longer falls back to legacy
      `host-only`/`docker-only` wording when `requestedProvider` is present
    - derive runtime-doctor host/docker next actions from `requestedProvider`
      first while preserving `executionMode` as compatibility evidence
   - focus:
     - split `SyRS` versus `SRS` ownership cleanly
     - merge duplicates
     - retire stale or contradictory requirement rows
     - restore truthful `REQ -> TEST -> CODE/DOC` traceability

6. Pass 6: Architecture and ADR refactor
   - objective: align the large ADR package to the released skill's current
     architecture expectations
   - status: checkpoint 3 complete on this branch
   - checkpoint 1 scope:
     - rename `ADR-0030` to remove the retired `gitflow-lite` filename drift
     - update architecture overview, RTM, wiki coverage, and release-governance
       tests to the corrected ADR path
   - checkpoint 2 scope:
     - introduce an active ADR for host-default local `LabVIEWCLI`, bounded
       expert Docker, and explicit compare preflight
     - downgrade `ADR-0025` and `ADR-0026` to superseded historical
       Docker-only baseline decisions
     - realign the primary architecture overview and execution-policy docs to
       the active ADR rather than the historical baseline
   - checkpoint 3 scope:
     - retrace the active execution RTM and test-plan review surfaces through
       `ADR-0038`
     - keep the active execution RTM and test-plan package honest until the
       matching Windows exact-runtime-selection refinement is actually proven
   - focus:
     - keep the architecture description as primary truth
     - keep ADRs as retained decision rationale where they still add value
     - mark superseded or contradictory ADRs explicitly instead of leaving
       them as live doctrine

7. Pass 7: Missing-document and proof-surface uplift
   - objective: add or repair the remaining documentation and proof surfaces
     needed for compliance
  - status: checkpoint 6 complete on this branch
  - checkpoint 1 scope:
     - normalize the active status blocks in current-state, `PROGRAM-0005`,
       and `ISSUE-0412` so they stop understating the implemented branch truth
       after `VHS-REQ-532..540` landed
  - checkpoint 2 scope:
    - make the authority/internal versus bundled/public reader-surface split
      explicit in the execution policy and public authority maps
    - keep the exact released Docker-only installed-user baseline as the only
      truthful bundled/public user contract until a future publication pass
    - prevent unreleased host-default `LabVIEWCLI` wording from leaking into
      public-facing reader truth early
  - checkpoint 3 scope:
    - normalize docs-authoring and current-state docs-CI summaries so they use
      the exact released bundled-guide execution truths
    - remove the older Docker-first Windows auto shorthand from those live
      control-plane reader surfaces
  - checkpoint 4 scope:
    - normalize older epic-level runtime/progress product framing so it
      distinguishes the exact released Docker-only bundled/user baseline from
      the active branch authority/internal direction
    - keep `executionMode` and explicit path overrides named only as bounded
      internal/runtime-proof compatibility inputs instead of public
      installed-user doctrine
  - checkpoint 5 scope:
    - normalize the active issue packet so its round-based historical
      discovery evidence stays explicit historical context instead of being
      mistaken for live branch truth
    - retain one current-branch checkpoint inside the issue packet for the
      now-landed provider/settings/runtime/preflight slices
  - checkpoint 6 scope:
    - normalize the canonical exact-pair diagnosis reader surface so
      `--execution-mode` is kept explicit as a bounded proof-admission input
      instead of a possible installed-user contract signal
  - likely scope:
     - CM and release-control gaps outside pass 1
     - test-plan gaps
     - release and publication evidence
     - any missing information items exposed by pass 2

8. Pass 8: Release-candidate compliance closeout
   - objective: rerun the released skill until the target branch reaches a
     clean external audit result across the governed gates
   - closeout rule:
     - no external compliance claim is made until the released skill passes on
       the exact target branch under review

## Operating Rules

- Every pass uses the released skill first, not unreleased local doctrine.
- Every pass ends with retained audit evidence plus a checkpoint commit.
- Contradictions found during later passes are treated as first-class backlog,
  not as incidental cleanup.
- Broad package refactors do not start until the previous pass has a retained
  audit result.

## Immediate Next Move

Return to the broader requirement-system cleanup from the now-stable pass-5,
pass-6, and pass-7 execution package:

- widen the requirement-row cleanup beyond the targeted runtime-provider
  cluster now that ADR and traceability drift is narrowed out
- keep later missing-document and proof-surface uplift sequenced behind those
  requirement/package corrections
