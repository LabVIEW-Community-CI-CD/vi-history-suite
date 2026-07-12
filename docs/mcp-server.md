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
- **Discovery** — in an agent-mode chat the tools become available automatically;
  refer to them by name or in plain language (for example, "index the VIs in this
  repository").

## Tools

The server exposes eight tools. Five operate purely on Git or supplied data;
three invoke a real LabVIEW comparison and therefore need a comparison runtime
(host LabVIEW or a Docker LabVIEW image) and may take minutes.

| Tool | What it does | Runtime | Required input |
| --- | --- | --- | --- |
| `summarize_vi_comparison` | Concise "what changed" narrative for a comparison report. | None | `reportHtml` |
| `get_vi_semantic_comparison` | Full `vi-history-suite/vi-semantic-comparison@v1` model (changed surfaces, attributes, detail sections, totals, narrative). | None | `reportHtml` |
| `compare_vi_revisions` | Runs a LabVIEW comparison between two Git revisions and returns the comparison model. | Comparison runtime | `repositoryRoot`, `relativePath`, `baseHash`, `selectedHash` |
| `summarize_vi_history` | Walks a VI's recent revisions, compares adjacent pairs, and returns a `vi-history-suite/vi-semantic-history@v1` evolution timeline. | Comparison runtime | `repositoryRoot`, `relativePath` |
| `index_repository_vis` | Surveys tracked VIs and returns a `vi-history-suite/vi-repository-index@v1` index (revision count and latest change, activity-ranked). | None (pure Git) | `repositoryRoot` |
| `build_vi_pr_review` | Reviews a pull request: compares every VI changed between two revisions and returns a `vi-history-suite/vi-semantic-pr-review@v1` review (per-VI summary plus an aggregate narrative). The Markdown form is a sticky PR-comment body. | Comparison runtime | `repositoryRoot`, `baseHash`, `selectedHash` |
| `get_vi_semantic_schema` | Returns the published JSON Schema(s) for the semantic models — the open VI-diff standard. | None | none (`schema` optional) |
| `validate_vi_semantic_document` | Validates a self-describing document against its published schema; returns `{ valid, errors }`. | None | `document` |

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
