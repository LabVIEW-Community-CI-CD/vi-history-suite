# Copilot agent-mode MCP server

VI History Suite ships a [Model Context Protocol](https://modelcontextprotocol.io)
(MCP) server that exposes LabVIEW VI comparison, history, and repository analysis
to AI agents. When the extension activates it registers the server with VS Code,
so Copilot **agent mode** discovers the tools automatically — there is nothing to
configure.

## How it runs

- **Registration** — during activation the extension registers an MCP server
  definition provider (id `viHistorySuiteSemantic`) through
  `vscode.lm.registerMcpServerDefinitionProvider`. This requires VS Code `1.101`
  or later; on older hosts registration is skipped.
- **Transport** — VS Code launches the bundled stdio entrypoint
  (`out/cli/runViSemanticMcpServer.js`) with the editor's own Node runtime and
  exchanges newline-delimited JSON-RPC 2.0 messages with it.
- **Pinned build (optional)** — when `viHistorySuite.devTools.version` pins a
  dev-tools release and that version has been installed and integrity-verified
  (see [Pinning a dev-tools version](./devtools-release.md#pinning-a-dev-tools-version-in-the-extension)),
  the server launches from the pinned build instead; otherwise it falls back to
  the bundled entrypoint above.
- **Discovery** — in an agent-mode chat the tools become available automatically;
  refer to them by name or in plain language (for example, "index the VIs in this
  repository").

## Tools

The server exposes 18 tools plus 3 guided prompts and 8 schema resources. Fifteen
tools operate without running a comparison (Git, supplied data, a local
preview-cache directory, or read-only runtime/environment probes); three invoke a
real LabVIEW comparison and therefore need a comparison runtime (host LabVIEW or a
Docker LabVIEW image) and may take minutes.

| Tool | What it does | Runtime | Required input |
| --- | --- | --- | --- |
| `summarize_vi_comparison` | Concise "what changed" narrative for a comparison report. | None | `reportHtml` |
| `get_vi_semantic_comparison` | Full `vi-history-suite/vi-semantic-comparison@v1` model (changed surfaces, attributes, detail sections, totals, narrative). | None | `reportHtml` |
| `get_vi_preview_comparison_correlation` | `vi-history-suite/vi-preview-comparison-correlation@v1` model correlating a comparison report with its base/head previews (per-surface change kinds, coordinate-bearing per-object changes in diagram space, preview availability, narrative). Caller may supply optional `previews`. | None | `reportHtml` |
| `get_vi_preview_region_correlation` | `vi-history-suite/vi-preview-region-correlation@v1` model placing each changed object as a pixel region on the base/head preview rasters from the comparison report (diagram-space-only without an injected locator; never a fabricated overlay). | None | `reportHtml` |
| `compare_vi_revisions` | Runs a LabVIEW comparison between two Git revisions and returns the comparison model. | Comparison runtime | `repositoryRoot`, `relativePath`, `baseHash`, `selectedHash` |
| `summarize_vi_history` | Walks a VI's recent revisions, compares adjacent pairs, and returns a `vi-history-suite/vi-semantic-history@v1` evolution timeline. | Comparison runtime | `repositoryRoot`, `relativePath` |
| `index_repository_vis` | Surveys tracked VIs and returns a `vi-history-suite/vi-repository-index@v1` index (revision count and latest change, activity-ranked). | None (pure Git) | `repositoryRoot` |
| `build_vi_pr_review` | Reviews a pull request: compares every VI changed between two revisions and returns a `vi-history-suite/vi-semantic-pr-review@v1` review (per-VI summary plus an aggregate narrative). The Markdown form is a sticky PR-comment body. | Comparison runtime | `repositoryRoot`, `baseHash`, `selectedHash` |
| `get_vi_semantic_schema` | Returns the published JSON Schema(s) for the semantic models — the open VI-diff standard. | None | none (`schema` optional) |
| `validate_vi_semantic_document` | Validates a self-describing document against its published schema; returns `{ valid, errors }`. | None | `document` |
| `list_preview_cache` | Lists the entries in a VI-preview render cache directory (per-entry cache key, size, inline image count, interactive-viewer flag, and health flags). | None (read-only fs) | `cacheDirectory` |
| `summarize_preview_cache` | Summarizes a preview cache directory: entry/byte counts, healthy vs flagged, interactive count, and the flagged entries. | None (read-only fs) | `cacheDirectory` |
| `diagnose_preview_cache` | Returns a `vi-history-suite/preview-cache-diagnostics@v1` snapshot (counts, byte totals, health rollup) so an agent can answer "is the preview cache healthy?" in one call. | None (read-only fs) | `cacheDirectory` |
| `search_preview_cache` | Finds cache entries by content marker (`error`, `interactive`, `image`, or `empty`); returns metadata only. | None (read-only fs) | `cacheDirectory`, `marker` |
| `get_preview_cache_entry` | Fetches one cache entry by key; returns metadata plus a file-path pointer by default, or the raw HTML when `includeHtml` is true. | None (read-only fs) | `cacheDirectory`, `key` |
| `get_runtime_health` | Resolves the comparison runtime **without running a comparison** and returns a `vi-history-suite/runtime-health@v1` snapshot (selected provider/engine/container image, or the `blockedReason` when none is available) so an agent can answer "can I compare here, and if not why?" before spending minutes on a real run. | Runtime resolution (never renders) | none (`platform`, `settings` optional) |
| `get_preview_diagnostics` | Returns a `vi-history-suite/preview-diagnostics@v1` environment snapshot (resolved preview runtime, Docker availability + OS type + LabVIEW images, optional cache statistics) so an agent can answer "is preview generation possible here, and is the cache populated?" in one call. | Runtime + Docker probe (never renders) | none (`cacheDirectory`, `processPlatform`, `settings` optional) |
| `list_changed_vis` | Lists the VI source files (`.vi`/`.vit`/`.vim`/`.ctl`) changed between two Git revisions — a cheap `vi-history-suite/changed-vis@v1` listing (no comparison runtime) so an agent can scope a review before running the minutes-long `build_vi_pr_review`. | None (pure Git) | `repositoryRoot`, `baseHash`, `selectedHash` |

### Tool annotations

Every tool advertises MCP [`ToolAnnotations`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool)
behavioral hints so an agent host can reason about a call before making it. All
vi-history-suite tools are non-mutating, so each carries `readOnlyHint: true`
and `destructiveHint: false`. `openWorldHint` is `true` only for the tools that
reach an external system (Git, a LabVIEW comparison runtime, or the preview-cache
filesystem) — the same set that requires the async server entrypoint — and
`false` for the pure, in-process tools (`summarize_vi_comparison`,
`get_vi_semantic_comparison`, `get_vi_semantic_schema`,
`validate_vi_semantic_document`). Hints are advisory, not a security boundary;
they let hosts auto-approve read-only calls and warn before open-world effects.

### Error handling

The server distinguishes two failure classes so an agent can react correctly:

- **Argument-shape problems** (a missing or wrong-typed field, a bad enum value)
  return a JSON-RPC `-32602` (Invalid params) error whose `data.issues` lists the
  offending fields as `{ field, expected, received }`, e.g.
  `{ "field": "relativePath", "expected": "a non-empty string", "received": "undefined" }`.
  A host can correct the call programmatically instead of parsing a message.
- **Tool-execution failures** (a comparison that failed, an absent cache entry, a
  tool invoked without its injected dependency) stay in the result envelope as
  `{ content: [...], isError: true }` per the MCP spec, so the message reaches the
  model.

### Prompts

The server advertises the `prompts` capability and exposes guided, host-surfaced
workflows (VS Code shows them alongside slash commands). Each prompt orchestrates
multiple tools — a prompt is never a 1:1 wrapper over a single tool.

| Prompt | What it drives | Arguments |
| --- | --- | --- |
| `review_pull_request` | Scope with `list_changed_vis`, then `build_vi_pr_review` (Markdown), with a `get_runtime_health` fallback. | `repositoryRoot`, `baseHash`, `selectedHash`, `maxVis?` |
| `explain_vi_history` | Narrate `summarize_vi_history`, with a `get_runtime_health` fallback. | `repositoryRoot`, `relativePath`, `maxRevisions?` |
| `check_compare_readiness` | Combine `get_runtime_health` + `get_preview_diagnostics` into a readiness verdict. | `platform?` |

`prompts/get` validates required arguments through the same `-32602` contract as
tools (a missing required argument returns `data.issues` naming the field).

### Resources

The server advertises the `resources` capability and exposes the published
semantic JSON Schemas — the open, versioned VI-diff standard — as addressable,
read-only context under the `vi-history-suite://schema/` URI scheme. The `@vN`
version stays in the URI, so a future schema `v2` is a new, distinct resource
rather than a silently-repointed "latest".

| Resource URI | Contents | mimeType |
| --- | --- | --- |
| `vi-history-suite://schema/vi-semantic-comparison@v1` | Comparison model schema | `application/schema+json` |
| `vi-history-suite://schema/vi-semantic-history@v1` | History model schema | `application/schema+json` |
| `vi-history-suite://schema/vi-repository-index@v1` | Repository-index schema | `application/schema+json` |
| `vi-history-suite://schema/vi-preview-comparison-correlation@v1` | Preview⇄comparison correlation schema | `application/schema+json` |
| `vi-history-suite://schema/vi-preview-comparison-correlations@v1` | Preview⇄comparison correlations bundle schema | `application/schema+json` |
| `vi-history-suite://schema/vi-preview-region-correlation@v1` | Preview pixel-region correlation schema | `application/schema+json` |
| `vi-history-suite://schema/vi-preview-region-correlations@v1` | Preview pixel-region correlations bundle schema | `application/schema+json` |
| `vi-history-suite://schema/index` | All published schemas | `application/json` |

`resources/read` of an unknown URI returns a `-32602` naming the `uri` field.

The server also advertises one **resource template** (via `resources/templates/list`)
for fs-backed preview-cache entries:

| URI template | Contents | mimeType |
| --- | --- | --- |
| `vi-history-suite://preview-cache/{cacheKey}{?cacheDirectory}` | A single rendered VI-preview document (HTML) | `text/html` |

A concrete URI names the cache key in the path and the cache directory in a
`cacheDirectory` query parameter, e.g.
`vi-history-suite://preview-cache/<sha256>?cacheDirectory=%2Fpath%2Fto%2Fcache`.
Reading one requires the async server entrypoint (it reads the cache filesystem
through the injected inspector). A malformed URI returns `-32602`; a missing
entry returns `-32602` (`preview-cache resource not found`).

### Argument completions

The server advertises the `completions` capability and answers
`completion/complete` for the arguments that have a known value set, filtered by
the partial value the host has typed:

| Ref | Argument | Completions |
| --- | --- | --- |
| `ref/prompt` `check_compare_readiness` | `platform` | `win32`, `linux`, `darwin` |
| `ref/resource` (schema template) | `uri` | the published schema ids (`vi-semantic-comparison@v1`, …) |

Any other ref or free-form argument completes to an empty list (never an error),
so a host can safely request completions for any argument.

### Output format

`summarize_vi_comparison`, `get_vi_semantic_comparison`, `compare_vi_revisions`,
`summarize_vi_history`, and `build_vi_pr_review` accept an optional `format` of
`json` (default) or `markdown`. The Markdown form produces review-ready blocks
suitable for PR comments and CI summaries.

### Runtime and revision inputs

- `compare_vi_revisions`, `summarize_vi_history`, and `build_vi_pr_review` accept
  an optional `runtime` object (`provider` `host` or `docker`, `labviewVersion`,
  `bitness`, `containerImageVersion`, `cliConnectTimeoutSeconds`) to steer
  provider selection.
- `summarize_vi_history` walks `maxRevisions` recent revisions (default 3,
  bounded to 20; N revisions yields N-1 comparisons).
- `index_repository_vis` details up to `maxVis` VIs (default 100, bounded to 500).
- `build_vi_pr_review` compares up to `maxVis` changed VIs (default 50, bounded
  to 200), path-sorted.

## Reviewing a pull request

`build_vi_pr_review` turns the "Binary file not shown" of a LabVIEW pull request
into a real "what changed" review. An AI reviewer (Copilot agent mode or any
MCP-capable agent) can drive it end to end:

1. Resolve the pull request's base (merge-base) and head commits.
2. Call `build_vi_pr_review` with `repositoryRoot`, `baseHash`, `selectedHash`,
   and `format: "markdown"` to get a sticky-ready review body. The body opens
   with a hidden marker (`<!-- vi-history-suite:vi-semantic-pr-review -->`).
3. Post the body as a pull-request comment. On later runs, update the comment
   that already carries the marker instead of adding a new one, so the review
   stays a single living summary.

The bundled CLI runs the whole recipe — including the sticky upsert — in one
command:

```bash
node out/cli/runViSemanticPrReview.js \
  --repository-root . --base <mergeBase> --head <headSha> \
  --runtime-provider docker \
  --post-comment --pr <number> --repo <owner/repo>
```

Posting needs a GitHub token in `GH_TOKEN` (or `GITHUB_TOKEN`) with permission to
comment on the pull request. Omit `--post-comment` to print the review or write
it to `--out <dir>` (as `vi-semantic-pr-review.md` and `.json`).

When preview correlation is enabled (see below) and at least one reviewed VI
carries a correlation, `--out <dir>` also writes a dedicated, first-class
`vi-preview-comparison-correlations.json` — a
`vi-history-suite/vi-preview-comparison-correlations@v1` bundle collecting just
the per-VI preview⇄comparison correlation models. A Copilot cloud agent can load
this artifact (or call the `get_vi_preview_comparison_correlation` tool) to
cross-reference *what changed* (the comparison) with *where/how it looks* (the
previews) without parsing the whole review. The bundle is omitted when no VI
carries a correlation (e.g. no preview provider was wired).

`--out <dir>` likewise writes a `vi-preview-region-correlations.json`
(`vi-history-suite/vi-preview-region-correlations@v1`) — the per-VI pixel-region
correlations derived from each VI's comparison report (diagram-space object
coordinates; no fabricated pixel origin) — when at least one changed VI carries a
coordinate-bearing object, and removes a stale one when this run has none.

When a changed VI cannot be compared, the review surfaces the reason (e.g.
`failed (command-exited-nonzero)`) in the summary table and a per-VI detail
block, so a reviewer sees an actionable signal in the comment itself. Add
`--fail-on-incomplete` to make the CLI exit non-zero when any VI was not
compared; the sticky comment and artifacts are still produced (the default
stays exit 0 so a partial review still posts).

Add `--announce-start` (with `--post-comment`) to upsert a "review in progress"
sticky comment before the comparison runs, so a reviewer sees the review was
triggered during the multi-minute container run; the final review replaces it in
place via the shared marker.

You can also split compute from posting so the sticky comment is posted from a
previously produced artifact without re-running the (expensive, container-backed)
comparison. Compute on the runner with `--out`, then post the `.json` from
anywhere with only a `GH_TOKEN`:

```bash
# 1. Compute (on the LabVIEW runner) — writes vi-semantic-pr-review.json
node out/cli/runViSemanticPrReview.js \
  --repository-root . --base <mergeBase> --head <headSha> \
  --runtime-provider docker --out review-out

# 2. Post (anywhere) — no LabVIEW/docker needed
node out/cli/runViSemanticPrReview.js \
  --from-file review-out/vi-semantic-pr-review.json \
  --post-comment --pr <number> --repo <owner/repo>
```

`--from-file` is mutually exclusive with `--repository-root`/`--base`/`--head`,
and a file that is missing, not JSON, or not a
`vi-history-suite/vi-semantic-pr-review@v1` review is rejected before any GitHub
write.

## The open VI-diff standard

The three models are published as versioned Draft-07 JSON Schemas so that other
tools can consume or validate the output independently of this extension:

| Schema id | Produced by |
| --- | --- |
| `vi-history-suite/vi-semantic-comparison@v1` | `get_vi_semantic_comparison`, `compare_vi_revisions` |
| `vi-history-suite/vi-semantic-history@v1` | `summarize_vi_history` |
| `vi-history-suite/vi-repository-index@v1` | `index_repository_vis` |

Fetch a schema with `get_vi_semantic_schema` and validate any self-describing
document (one carrying a `schema` field) with `validate_vi_semantic_document`.

## Implementation

The server is dependency-free (no MCP SDK) and its request handler is pure; only
the three comparison tools reach a LabVIEW runtime, through the same reporting
primitives the extension's Compare command uses.

- Request handler: `src/semantic/viSemanticComparisonMcp.ts`
- Comparison, history, index, and PR-review orchestrators: `src/semantic/compareViRevisions.ts`, `src/semantic/viSemanticHistory.ts`, `src/semantic/viRepositoryIndex.ts`, `src/semantic/viSemanticPrReview.ts`
- PR-review CLI and sticky-comment planner: `src/cli/runViSemanticPrReview.ts`, `src/semantic/stickyPrComment.ts`
- Published schemas and validator: `src/semantic/viSemanticSchemas.ts`
- Stdio entrypoint: `src/cli/runViSemanticMcpServer.ts`
- VS Code registration: `src/mcp/viSemanticMcpServerProvider.ts`

See also the [architecture overview](./architecture/overview.md).
