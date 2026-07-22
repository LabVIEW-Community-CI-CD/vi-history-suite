# ADR-0031: LabVIEW-Free lvkit Semantic Backend

- Status: Accepted
- Date: 2026-07-22

> Authoritative requirement: VHS-REQ-712 (LabVIEW-Free lvkit Semantic Comparison
> Backend), a child of system requirement VHS-SYS-REQ-008 (Review Workflow /
> Comparison Reports). The requirements package holds the authoritative text;
> this ADR is the retained design record.

## Context

The VI semantic comparison surface (VHS-REQ-662, the agent MCP tools such as
`compare_vi_revisions` and `get_vi_semantic_comparison`) produces its model the
only way it could until now: it runs **real LabVIEW** — `locateComparisonRuntime`
→ `executeComparisonReport` (LabVIEWCLI `CreateComparisonReport`) → parse the NI
report HTML → `buildViSemanticComparisonModel`. That hard-requires a LabVIEW
runtime, host-native or in a Docker container. This session proved how heavy and
environment-fragile that dependency is: the host-native runtime was blocked by a
corrupt Getting Started Window install, and the container path needs Docker plus
a multi-GB NI image.

But the two consumers that most want VI semantics frequently have **no LabVIEW**:
a Copilot cloud agent running on a user's repository, and a local VS Code session
on a machine without an NI install. Meanwhile the *visual* surfaces — the VI
preview and the comparison report — genuinely need LabVIEW to render pixel-accurate
front panels and block diagrams. So the **semantic** layer (what changed,
structurally) and the **artifact** layer (how it looks) have fundamentally
different runtime needs, and coupling them to one LabVIEW runtime under-serves both.

Separately, `pragmatest-dev/lvkit` (Apache-2.0, clean-room, not affiliated with
NI) reads `.vi`/`.ctl`/`.lvclass`/`.lvlib` binaries **directly** via the
open-source pylabview parser into typed dependency and dataflow graphs, and emits
a UID-correlated block-diagram change map (`lvkit diff --format json`) — with no
LabVIEW install, license, or runtime. It reads, never writes.

## Decision

Adopt lvkit as a **LabVIEW-free semantic backend**, and split responsibilities by
runtime need:

- The **VI preview** and the **comparison report** stay LabVIEW/Docker-backed —
  they are the **visual artifacts** (pixel-accurate NI renders), unchanged.
- The **lvkit diff** feeds the **MCP semantic tools** — the **semantics** an AI
  agent queries — both locally in VS Code and for a Copilot agent on the user's
  repository, **opt-in per repo**.

The integration is two pure, dependency-free modules that own the semantic
contract, unit tested without lvkit, LabVIEW, or Python:

- `src/semantic/lvkit/lvkitDiffModel.ts` — a typed model of lvkit's JSON and a
  fail-closed parser (snake_case → camelCase; a malformed document is an explicit
  error, never a silently empty comparison).
- `src/semantic/lvkit/lvkitSemanticAdapter.ts` — projects the parsed lvkit
  document onto the **shared** `vi-history-suite/vi-semantic-comparison@v1` model
  the LabVIEW backend already produces, so every MCP tool, cache, and validator
  consumes one shape regardless of backend. It formats each lvkit change into
  NI's own detail-item grammar so the shared geometry parser and change
  classifier run unchanged (subVI → dependency, wire → behavioral, node →
  structural).

**Honest scope.** lvkit reads the block diagram (structure + dataflow), not the
front panel or VI attributes. The model therefore marks the block diagram
included and the front-panel/connector-pane/attribute surfaces **excluded**, so a
consumer always knows an lvkit-backed comparison is block-diagram-scoped and never
a fabricated full diff. The LabVIEW comparison report remains the full-fidelity
artifact for cosmetic/front-panel changes.

lvkit is a Python CLI, not an npm package, so it is a **child-process tool
dependency** (like LabVIEWCLI), invoked behind an injectable boundary — never a
bundled runtime dependency. A lvkit-executable locator, a compare-function
provider matching `compareViRevisions`, the per-repo opt-in setting, and the MCP
`compareFn` wiring are follow-on slices on top of this pure core.

Rejected: making LabVIEW mandatory for semantics (blocks the Copilot/cloud/no-NI
users who most need it); vendoring or porting lvkit (large, and lvkit is actively
maintained upstream); and replacing the NI comparison-report artifact with lvkit's
own render (lvkit's render is a structural SVG, not the pixel-accurate NI report —
keep both, each for what it is best at).

## Consequences

- LabVIEW-free semantic comparison is available anywhere lvkit installs
  (`uv tool install lvkit` / `pip install lvkit`), including Copilot cloud agents
  and local VS Code sessions with no NI runtime.
- The projected model is one shape regardless of backend, so the MCP tools,
  content-addressed cache, and schema validator are unchanged.
- **Proven on real hardware, LabVIEW-free**: the maintainer driver ran the real
  `lvkit diff` on the icon-editor `lv_icon.vi` 537683→fc09736 pair and produced a
  valid model — 5 block-diagram changes across 273 common nodes,
  `changeKinds=[dependency, behavioral]`, `riskLevel=high` — with no LabVIEW or
  Docker.
- The block-diagram scope is honest: a front-panel-only cosmetic change will not
  appear in an lvkit comparison; the LabVIEW comparison report stays the surface
  for that. Consumers read the `attributes.excluded` list to know the scope.
- Follow-on wiring (locator, compare provider, per-repo opt-in setting, MCP
  `compareFn` selection) keeps default behavior unchanged until a user enables the
  lvkit backend on their repo.
