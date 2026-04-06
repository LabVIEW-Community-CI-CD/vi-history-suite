# PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX

## Status

Queued follow-on post-release program with nine repo-side execution-policy slices
already landed.

Activation is intentionally deferred until:

- `PROGRAM-0003` closes the benchmark-proof packet under `TRANCHE-011`
- the queue promotes `TRANCHE-013` from `queued` to `active`
- the remaining broader front-facing provider/acquisition transparency work
  moves beyond the landed selector, Docker-capability, acquisition-progress,
  history-panel latest-runtime-summary, live panel-progress, compare-warning,
  compare-success, and panel-reopen persistence slices

## Purpose

Implement a transparent user-facing execution contract for the installed
extension so runtime behavior is explicit, configurable, and contamination-safe
instead of being inferred from bitness preferences or ambient Docker state.

## North Star

An extension user can choose one governed execution mode for report generation:

- `auto`
- `host-only`
- `docker-only`

and the extension will:

- allow compatible host LabVIEW 2026 Q1 x86 or x64 execution when the selected
  mode permits host-native launch and the host runtime surface is clean
- explain which provider it selected
- fail closed when the selected mode cannot run truthfully
- surface Docker acquisition progress when image pull is required
- never silently substitute host-native and Docker behavior

## Workstreams

1. execution-mode setting and manifest/trust-boundary contract
2. canonical effective execution-request validation across settings, selected
   host-runtime facts, and Docker capability facts before provider work starts
3. conflict-aware provider selection for host sessions, multiple versions, and
   governed VI Server ports, including already-open LabVIEW 2026 sessions that
   require Docker isolation in `auto`
4. Docker acquisition progress, Windows container-capability checks, and
   platform-specific image selection
5. runtime-doctor, history-panel, and progress-surface transparency
6. documentation and bundled-user-doc normalization of the execution policy

## Queue Mapping

- `TRANCHE-013`
  - `ISSUE-0410`

## Exit Gates

### Gate A: Execution Mode Contract

- a first-class execution-mode setting exists
- `auto`, `host-only`, and `docker-only` are explicit product truths
- compatible host LabVIEW 2026 Q1 x86 and x64 execution remain available when
  the selected mode allows host-native launch and the governed host surface is
  conflict-free
- provider selection validates one canonical effective execution request before
  any host launch or Docker acquisition begins

### Gate B: Conflict Truth

- host-runtime contamination rules are explicit and enforced
- conflicting host LabVIEW sessions and governed VI Server collisions fail
  closed instead of contaminating later evidence
- the selected host-runtime surface derives the governed `LabVIEW.ini` path and
  TCP port explicitly instead of assuming one default port

### Gate C: Acquisition UX

- Docker-required execution surfaces visible pull/acquisition progress
- Windows hosts pull the governed Windows image when Docker execution is
  selected there
- Windows Docker-required execution also fails closed when Docker is installed
  but not capable of Windows-container execution

### Gate D: Transparent Feedback

- runtime doctor and front-facing action/progress surfaces expose execution
  mode, selected provider, rejected providers, acquisition outcome, and next
  action

### Gate E: Control-Plane Normalization

- README, current-state, requirements, RTM, test plan, wiki, and bundled docs
  describe the same execution policy without contradiction

## Delivery Rules

This program exists to remove ambiguity, not to add silent fallback behavior.

Every slice shall preserve:

- no silent provider substitution
- no provider launch or Docker pull from a non-canonical effective request
- no contaminated host-runtime launches treated as product truth
- explicit user-facing next-step guidance
- platform-appropriate acquisition behavior

## Landed Selector Slices

The repo already retains seven bounded implementation slices under this program:

- a first-class `viHistorySuite.executionMode` setting with `auto`,
  `host-only`, and `docker-only`
- no-silent-fallback provider selection for `host-only` and `docker-only`
- conflict-aware Windows `auto` selection that now:
  - prefers clean host-native execution
  - derives the selected `LabVIEW.ini` path and governed VI Server TCP port
  - detects existing LabVIEW-related host activity before final provider
    choice
  - routes contaminated Windows host surfaces to Docker when the governed
    provider is available
  - hard-stops when Docker is required but unavailable
- runtime-doctor and retained packet visibility for execution mode, selected
  host `LabVIEW.ini`, derived TCP port, host-conflict truth, rejected
  providers, and next action
- a third selector slice now validates Windows Docker capability before the
  Docker provider is selected or rejected by retaining:
  - Docker CLI availability
  - Docker daemon reachability
  - active container mode
  - governed image presence
- runtime-doctor and retained packet surfaces now carry those Docker
  capability facts explicitly when Windows Docker evaluation is in play
- a fourth slice now makes governed Windows image acquisition explicit on the
  comparison-report action path:
  - Windows container selections with a missing governed image now enter a
    governed acquisition step before packet persistence and runtime launch
  - the long-running progress surface now shows governed Windows image-pull
    progress instead of leaving that work implicit inside Docker startup
  - retained runtime doctor and packet surfaces now carry acquisition state as
    governed truth, and acquisition failure now blocks runtime truthfully
- a fifth slice now retains that runtime truth in the history panel itself:
  - compare actions now post the latest selected provider, rejected-provider
    reasons, execution mode, acquisition state, blocked/failure reason, and
    next action back into the history panel after the action completes
  - users no longer need to leave the panel for the retained packet just to
    recover the latest compare-runtime provider/acquisition decision
- a sixth slice now surfaces that same truth through the transient notification
  channel when compare execution blocks or fails:
  - compare actions now emit one concise mode-aware warning for blocked or
    failed runtime states using the retained provider, rejected-provider
    reasons, execution mode, acquisition state, diagnostic/failure reason,
    and next action
  - users no longer need to infer truthful hard stops only from progress
    notifications or after-the-fact packet inspection
- a seventh slice now mirrors governed compare-runtime progress in the history
  panel while compare generation is still running:
  - compare actions now post live in-flight panel updates for governed
    runtime-selection, Windows-image acquisition, and runtime-execution
    stages using the same bounded progress messages already retained by the
    comparison-report action
  - the in-panel compare-runtime block no longer stays idle until completion
    when the action is actively selecting a provider, pulling an image, or
    executing the LabVIEW runtime

## First Implementation Slice

Start with [ISSUE-0410 Extension Execution Flexibility And Runtime Acquisition UX](../issues/ISSUE-0410-extension-execution-flexibility-and-runtime-acquisition-ux.md).

That slice should:

- land the execution-policy control plane and the first-class execution-mode
  setting
- retire the current ambiguity around whether Docker is optional, required, or
  forbidden for a given user workflow at the provider-selection boundary
- make canonical execution-request validation explicit before implementation
- make Windows container-capability truth explicit before image acquisition
- stop short of claiming full implementation until the installed extension
  lands fuller front-facing provider transparency end to end beyond the now-
  landed visible acquisition, in-panel summary, live panel-progress,
  compare-warning, compare-success, and panel-reopen persistence slices

## Success Condition

This program is complete when the installed extension can execute comparison
work through a transparent `auto` / `host-only` / `docker-only` contract with
truthful hard stops, visible acquisition progress, and user-facing runtime
diagnosis that does not rely on shell archaeology.
