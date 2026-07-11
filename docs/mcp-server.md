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

The server exposes seven tools. Five operate purely on Git or supplied data; two
invoke a real LabVIEW comparison and therefore need a comparison runtime (host
LabVIEW or a Docker LabVIEW image) and may take minutes.

| Tool | What it does | Runtime | Required input |
| --- | --- | --- | --- |
| `summarize_vi_comparison` | Concise "what changed" narrative for a comparison report. | None | `reportHtml` |
| `get_vi_semantic_comparison` | Full `vi-history-suite/vi-semantic-comparison@v1` model (changed surfaces, attributes, detail sections, totals, narrative). | None | `reportHtml` |
| `compare_vi_revisions` | Runs a LabVIEW comparison between two Git revisions and returns the comparison model. | Comparison runtime | `repositoryRoot`, `relativePath`, `baseHash`, `selectedHash` |
| `summarize_vi_history` | Walks a VI's recent revisions, compares adjacent pairs, and returns a `vi-history-suite/vi-semantic-history@v1` evolution timeline. | Comparison runtime | `repositoryRoot`, `relativePath` |
| `index_repository_vis` | Surveys tracked VIs and returns a `vi-history-suite/vi-repository-index@v1` index (revision count and latest change, activity-ranked). | None (pure Git) | `repositoryRoot` |
| `get_vi_semantic_schema` | Returns the published JSON Schema(s) for the semantic models — the open VI-diff standard. | None | none (`schema` optional) |
| `validate_vi_semantic_document` | Validates a self-describing document against its published schema; returns `{ valid, errors }`. | None | `document` |

### Output format

`summarize_vi_comparison`, `get_vi_semantic_comparison`, `compare_vi_revisions`,
and `summarize_vi_history` accept an optional `format` of `json` (default) or
`markdown`. The Markdown form produces review-ready blocks suitable for PR
comments and CI summaries.

### Runtime and revision inputs

- `compare_vi_revisions` and `summarize_vi_history` accept an optional `runtime`
  object (`provider` `host` or `docker`, `labviewVersion`, `bitness`,
  `containerImageVersion`, `cliConnectTimeoutSeconds`) to steer provider
  selection.
- `summarize_vi_history` walks `maxRevisions` recent revisions (default 3,
  bounded to 20; N revisions yields N-1 comparisons).
- `index_repository_vis` details up to `maxVis` VIs (default 100, bounded to 500).

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
the two comparison tools reach a LabVIEW runtime, through the same reporting
primitives the extension's Compare command uses.

- Request handler: `src/semantic/viSemanticComparisonMcp.ts`
- Comparison, history, and index orchestrators: `src/semantic/compareViRevisions.ts`, `src/semantic/viSemanticHistory.ts`, `src/semantic/viRepositoryIndex.ts`
- Published schemas and validator: `src/semantic/viSemanticSchemas.ts`
- Stdio entrypoint: `src/cli/runViSemanticMcpServer.ts`
- VS Code registration: `src/mcp/viSemanticMcpServerProvider.ts`

See also the [architecture overview](./architecture/overview.md).
