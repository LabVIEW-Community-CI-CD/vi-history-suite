# ADR-0033: Agent-Readable VI Scan (lvkit Generate)

- Status: Accepted
- Date: 2026-07-24

> Authoritative requirements: VHS-REQ-714 (Single-VI lvkit Scan Provider),
> VHS-REQ-716 (lvkit VI Scan Store and Generated-Code Retrieval Tool), and
> VHS-REQ-717 (Preview-Time VI Scan Trigger), children
> of system requirement VHS-SYS-REQ-008 (Review Workflow / Comparison Reports).
> The requirements package holds the authoritative text; this ADR is the retained
> design record. This covers Phase A (the scan provider), Phase B (the
> preview-time trigger) and Phase C (the dedicated store and MCP retrieval tool)
> of epic #2348 (agent-readable VI change intelligence) and builds on ADR-0031
> (LabVIEW-free lvkit semantic backend).

## Context

A `.vi` file is an opaque binary an AI agent cannot read. ADR-0031 adopted lvkit
`diff` to give agents a LabVIEW-free *comparison* between two revisions. But an
agent frequently wants to understand a single VI's *behavior* — not just what
changed between two commits — to reason about a change it can otherwise not see.

lvkit also exposes `generate`, which lowers one VI into **agent-readable Python**
via the same clean-room pylabview parser — no LabVIEW install, license, or
runtime, and no `.vi` authoring (it reads, never writes). Earlier maintainer
experiments established that `lvkit generate` is byte-deterministic and
content-addressable, that `--load-mode none` produces a faithful single-VI export
(the scan target, without pulling the whole dependency closure), and that
`--no-auto-vilib` is required for host-independence — otherwise lvkit auto-detects
a local LabVIEW `vi.lib`, making output differ between a developer host and CI.
lvkit also creates a `.lvkit/` resolution store by walking up from the input file,
which would pollute the repository working tree if the in-repo VI were scanned in
place.

## Decision

Adopt lvkit `generate` as a **LabVIEW-free single-VI scan** and capture its output
verbatim into a schema-tagged store envelope for later agent consumption over MCP:

- A **pure model** (`lvkitViScanModel.ts`) projects already-captured lvkit output
  onto the versioned `vi-history-suite/lvkit-vi-scan@v1` envelope (VI path,
  content signature, runtime, generation timestamp, lvkit source, verbatim
  modules in deterministic order, a best-effort primary-module pointer, and
  resolved/error counts). It performs no I/O and fails closed on malformed input.
- A **provider** (`lvkitViScanProvider.ts`) with fully injectable collaborators
  materializes the staged VI bytes to a private temp workspace (preserving the
  original base name so lvkit's slug is meaningful), runs `lvkit generate` as a
  single-VI export (`--load-mode none`), host-independent (`--no-auto-vilib`),
  with its resolution store isolated to the workspace (`--project-root`) so the
  repository is never polluted, captures the generated Python verbatim, and
  returns a typed `blocked`/`failed`/`completed` result — never throwing, always
  cleaning up.

The scan is the **VI-readability seed**; the benchmark correlation (Phase D) is a
later phase of epic #2348 that builds on this envelope.

**Phase C** adds the dedicated store and the agent retrieval tool (VHS-REQ-716).
A content-addressed on-disk store (`lvkitViScanStore.ts`) is keyed by a SHA-256
over the POSIX-normalized VI path folded with the content signature — mirroring
the comparison-model cache (VHS-REQ-662.8): `<key>.json` files behind an injected
filesystem boundary, a fail-closed structural + content-address read guard (a
stored envelope that does not describe the requested path + signature is treated
as a miss, so a collided or hand-edited file can never surface the wrong VI's
code), and a best-effort write that never fails the producing pipeline. A
read-only, async-only `get_vi_generated_code` MCP tool retrieves the stored
envelope for a requested (VI path, content signature), returning a first-class
not-found on a miss. The tool requires **both** the path and the content
signature — a signature-less "latest" lookup is deferred — so it only ever returns
the generated code captured for those precise VI bytes.

**Phase B** wires the scan into the preview pipeline (VHS-REQ-717). When a VI
renders **live** on its runtime in the preview custom editor, a pure best-effort
trigger (`previewTimeViScanTrigger.ts` — `runPreviewTimeViScan`) runs the Phase A
scan and persists the envelope into the Phase C store, resolving to a typed
`persisted`/`not-persisted`/`errored` outcome and never throwing into the preview.
A pure target mapper (`buildPreviewTimeViScanRequest`) resolves the rendered VI's
absolute path against the open workspace folders to a repository-relative address,
picking the deepest containing folder and skipping a VI outside every folder. The
editor fires the trigger only at the live-render success path for a
directly-opened on-disk `file` VI whose bytes match what the runtime rendered —
never a cache-only display or a materialized `git`/revision source — and the scan
provider and store are constructed once at activation and injected, so the
coverage-excluded entrypoint holds no scan logic. Live host-runtime and container
end-to-end coverage of the render-to-scan path is deferred, as with the Phase A
real-lvkit boundary.

Rejected: capturing the whole dependency closure (`--load-mode full`) for a
"single-VI" scan (heavy, and vi.lib-primitive-dense VIs emit `.error` stubs that
add noise without the resolution store); auto-detecting a host LabVIEW `vi.lib`
(non-deterministic across host and CI); and scanning the in-repo VI in place
(pollutes the working tree with lvkit's `.lvkit/` store).

## Consequences

- A single VI becomes agent-readable Python anywhere lvkit installs
  (`uv tool install lvkit` / `pip install lvkit`), with no NI runtime, matching
  ADR-0031's LabVIEW-free reach.
- The envelope is deterministic and content-addressable, so an identical VI
  yields identical stored Python — a stable key for the later store and for
  change reasoning.
- The generated Python is captured verbatim (never re-serialized), so the store
  is a faithful record of exactly what lvkit produced for that VI.
- The scan is best-effort by construction: a failure returns a typed result and
  never authors a `.vi`; the LabVIEW-backed preview and comparison report remain
  the visual artifacts.
- **Proven LabVIEW-free on real hardware**: the shipped provider scanned the
  vendored `Make path absolute.vi` through the real lvkit binary into a valid
  envelope with a readable primary module, byte-identical across repeated runs,
  and with no `.lvkit/` pollution of the repository — pinned by a hard-require
  real-lvkit integration test.
- **Phase B (VHS-REQ-717) makes previewing a VI capture its scan**: rendering a
  VI live on its runtime persists the LabVIEW-free Python projection into the
  Phase C store as a best-effort side effect that never blocks the preview, so an
  agent can later retrieve it by content address without re-running lvkit. The
  pure trigger and target mapper are unit-tested with in-memory fakes; the live
  host-runtime and container render-to-scan path is deferred (Phase A precedent).
