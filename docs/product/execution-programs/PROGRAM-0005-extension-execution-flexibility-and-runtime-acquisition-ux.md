# PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX

## Status

Active post-release program.

Current facts:

- `TRANCHE-013` landed the current released Docker-only installed contract,
  engine-aware image-selection rule, and public/internal documentation split
  baseline
- `TRANCHE-015` landed the current released first-run Docker onboarding and
  missing-Docker fail-closed guidance
- the exact released installed extension still depends on Docker for
  comparison generation while the replacement slices are unlanded
- `TRANCHE-016` is the active tranche for replacing that installed-user
  contract with a host-default Windows local `LabVIEWCLI` workflow plus a
  bounded expert Docker provider
- `ISSUE-0412` is the active issue for the replacement direction
- the control-plane reset is landed and the installed manifest/settings
  contract slice is landed
- the generated settings CLI now persists provider, version, and bitness, and
  that provider selection now flows into the governed host-default and Docker
  runtime-admission path
- the required-settings runtime preflight is partially landed, but exact
  single-runtime ambiguity handling and the explicit compare workflow are
  still open
- `PROGRAM-0002` still owns the later public acceptance rerun once the next
  installed-user contract is actually published

## Purpose

Replace the current released Docker-only installed execution contract with one
host-default Windows local-`LabVIEWCLI` installed-user contract that retains a
bounded expert Docker provider, stays settings/CLI-driven, fails closed, and
is explicit about compare preflight before execution starts.

## North Star

An installed extension user:

- uses one compare workflow with host as the default provider and Docker only
  as an expert path selected through the generated settings CLI
- keeps one LabVIEW version and one LabVIEW bitness as required runtime facts
  across both provider classes
- can seed provider, version, and bitness through a generated cross-platform
  CLI that writes into user-profile storage on first use
- runs comparison generation through either one matching local Windows
  `LabVIEWCLI`-backed installation or one governed Docker image family derived
  from the current Docker engine
- sees selected/base commit plus provider, version, and bitness before compare
  starts
- must press an explicit `Compare` action instead of triggering compare on the
  second commit selection
- receives a fail-closed panel state and VS Code warning when the requested
  provider/runtime bundle is missing, ambiguous, incompatible, or unsupported
  such as Docker `x86`
- does not see path-picking, image-family picking, or a general panel-side
  provider picker as part of the installed-user compare contract

## Workstreams

1. control-plane reset from the Docker-only installed-user direction to the
   host-default `LabVIEWCLI` plus expert-Docker replacement direction
2. installed manifest/settings contract for required version + bitness plus
   generated provider selection
3. host runtime-resolution preflight and fail-closed validation
4. expert Docker provider preflight and acquisition
5. on-demand cross-platform settings CLI generation into user-profile storage
6. explicit compare preflight UX in the history panel
7. authority/bundled/public reader-surface normalization after implementation
8. handoff to `PROGRAM-0002` for the next public acceptance rerun after the
   replacement contract is published

## Queue Mapping

- historical implemented baseline:
  - `TRANCHE-013`
    - `ISSUE-0410`
  - `TRANCHE-015`
    - `ISSUE-0410`
- active replacement direction:
  - `TRANCHE-016`
    - `ISSUE-0412`

## Exit Gates

### Gate A: Control Plane

- queue, current-state, README, ship control, execution policy, requirements,
  RTM, and test plan promote `TRANCHE-016` / `ISSUE-0412` as the active
  installed-user direction
- the current released Docker-only baseline remains explicit as historical
  implemented truth until replacement slices land
- `ISSUE-0410`, `TRANCHE-013`, and `TRANCHE-015` are retained as superseded
  direction rather than active destination

### Gate B: Installed Settings And Runtime Preflight

- the installed extension exposes the required LabVIEW version + bitness
  settings contract
- the settings contract can be seeded through a generated cross-platform CLI
  launcher under user-profile storage rather than a prebuilt VSIX-shipped CLI
- host runtime resolution validates one canonical Windows `LabVIEWCLI`
  request before compare can run
- missing, ambiguous, or incompatible local runtime resolution fails closed

### Gate C: Expert Docker Provider Contract

- the installed-user contract defaults to host and admits Docker only through
  the generated settings CLI
- Docker preflight derives the governed Windows or Linux image family from the
  current Docker engine instead of exposing image-family picking
- Docker `x86` fails closed before compare starts with corrective guidance
  toward host or `x64`

### Gate D: Explicit Compare Workflow

- the second commit selection no longer starts compare automatically
- the compare preflight section shows selected/base commit plus provider,
  version, and bitness
- compare starts only from one explicit `Compare` action

### Gate E: Installed-User Surface Normalization

- bundled docs, runtime doctor, and installed-user reader surfaces describe
  host-default local `LabVIEWCLI` plus the bounded expert Docker provider
- private/internal versus public reader-surface boundaries remain explicit

### Gate F: Public Acceptance Handoff

- the repo retains one explicit handoff into `PROGRAM-0002` for the next
  deterministic public rerun after the local-`LabVIEWCLI` installed contract
  is the truthful published bundle

## Delivery Rules

Every slice shall preserve:

- truthful current-release Docker-only baseline wording until replacement code
  is actually landed
- no silent fallback away from the active installed-user contract or away from
  an explicitly selected provider
- no execution-policy bypass around canonical validation for the active
  contract
- no installed-user path-picking, image-family matrix, or general panel-side
  provider picker
- no PATH mutation and no prebuilt external CLI payload inside the VSIX
- no automatic compare start on second selection
- no public/internal documentation audience collapse

## Success Condition

This program is complete when the installed Windows extension can execute
comparison work through one host-default local `LabVIEWCLI` contract with
required version plus bitness selection, one bounded expert Docker provider
selected through the generated CLI, fail-closed runtime/provider resolution,
explicit compare preflight, and coherent public/internal docs.
