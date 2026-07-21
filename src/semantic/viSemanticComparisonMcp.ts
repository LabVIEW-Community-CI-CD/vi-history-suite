import {
  buildViSemanticComparisonModelFromHtml,
  ViSemanticRevisionFacts,
  ViSemanticRuntimeFacts,
  VI_SEMANTIC_COMPARISON_SCHEMA
} from './viSemanticModel';
import {
  buildViPreviewComparisonCorrelation,
  renderCorrelationSurfaceTable,
  VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA,
  type ViPreviewPair,
  type ViPreviewReference
} from './viPreviewComparisonCorrelation';
import { errorMessage } from '../support/errorMessage';
// Type-only import: the async handler runs the orchestrator through an injected
// dependency, so this module stays runtime-pure and free of reporting imports.
import type {
  CompareViRevisionsInput,
  CompareViRevisionsResult
} from './compareViRevisions';
import type { ViSemanticHistory, ViSemanticHistoryInput } from './viSemanticHistory';
import type { ViSemanticPrReviewInput, ViSemanticPrReview } from './viSemanticPrReview';
import {
  renderViSemanticComparisonMarkdown,
  renderViSemanticHistoryMarkdown,
  renderViSemanticPrReviewMarkdown
} from './viSemanticReviewMarkdown';
import type { ViRepositoryIndex, ViRepositoryIndexInput } from './viRepositoryIndex';
import type {
  ViPreviewCacheEntry,
  ViPreviewCacheEntryDocument,
  ViPreviewCacheSummary,
  ViPreviewCacheSearchMarker
} from '../reporting/viPreview/viPreviewCacheInspection';
// Type-only: the async handler resolves runtime health and preview diagnostics
// through injected orchestrators, so this module stays free of the reporting /
// node-fs boundaries those probes touch.
import type {
  ComparisonRuntimeSettings,
  RuntimePlatform
} from '../reporting/comparisonRuntimeLocator';
import type {
  CollectViPreviewDiagnosticsOptions,
  ViPreviewDiagnosticsSnapshot
} from '../tooling/viPreviewDiagnostics';
import {
  validateViSemanticDocument,
  VI_SEMANTIC_SCHEMAS,
  VI_SEMANTIC_COMPARISON_SCHEMA_ID,
  VI_SEMANTIC_HISTORY_SCHEMA_ID,
  VI_REPOSITORY_INDEX_SCHEMA_ID
} from './viSemanticSchemas';

/**
 * Minimal Model Context Protocol surface over the VI comparison engine. This is
 * a dependency-free JSON-RPC 2.0 handler (no MCP SDK) so it adds nothing to the
 * packaged extension's runtime dependency allowlist and stays fully unit
 * testable. The stdio entrypoint (`src/cli/runViSemanticMcpServer.ts`) is the
 * only piece that touches process streams.
 */
export const VI_SEMANTIC_MCP_PROTOCOL_VERSION = '2025-06-18';

export const VI_SEMANTIC_MCP_SERVER_INFO = {
  name: 'vi-history-suite-semantic',
  version: '1.0.0'
} as const;

/** Schema id for the compact runtime-health snapshot the async server emits. */
export const RUNTIME_HEALTH_SCHEMA = 'vi-history-suite/runtime-health@v1';

/** Arguments accepted by the `get_runtime_health` tool. */
export interface RuntimeHealthInput {
  platform?: RuntimePlatform;
  settings?: ComparisonRuntimeSettings;
}

/**
 * Compact, agent-facing projection of a resolved comparison-runtime selection.
 * `blocked` is the one-glance signal; `blockedReason` names the fix path when
 * blocked. The full locator selection is not exposed — only the fields an agent
 * needs to decide whether (and how) it can compare.
 */
export interface ViRuntimeHealth {
  schema: typeof RUNTIME_HEALTH_SCHEMA;
  platform: string;
  provider: string;
  engine: string | null;
  bitness: string;
  containerImage: string | null;
  blocked: boolean;
  blockedReason: string | null;
  notes: string[];
}

/** Schema id for the changed-VI listing the async server emits. */
export const CHANGED_VIS_SCHEMA = 'vi-history-suite/changed-vis@v1';

/** Arguments accepted by the `list_changed_vis` tool. */
export interface ChangedVisInput {
  repositoryRoot: string;
  baseHash: string;
  selectedHash: string;
}

/**
 * Cheap, Git-only listing of the VI source files changed between two revisions
 * (no comparison runtime, no rendering). Lets an agent scope a review — deciding
 * whether to run the minutes-long `build_vi_pr_review` at all, and against how
 * many VIs — before committing to it.
 */
export interface ViChangedVis {
  schema: typeof CHANGED_VIS_SCHEMA;
  repositoryRoot: string;
  baseHash: string;
  selectedHash: string;
  changedVis: string[];
  count: number;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: string | number | null;
  result: unknown;
}

export interface JsonRpcError {
  jsonrpc: '2.0';
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS = -32602;

type ViSemanticOutputFormat = 'json' | 'markdown';

const OUTPUT_FORMAT_SCHEMA = {
  type: 'string',
  enum: ['json', 'markdown'],
  description:
    'Output format. "json" (default) returns the full model; "markdown" returns a review-ready block for a PR comment or CI summary.'
} as const;

function readOutputFormat(rawArguments: unknown): ViSemanticOutputFormat {
  if (typeof rawArguments === 'object' && rawArguments !== null) {
    if ((rawArguments as Record<string, unknown>).format === 'markdown') {
      return 'markdown';
    }
  }
  return 'json';
}

interface ViComparisonToolArguments {
  reportHtml: string;
  reportFilePath?: string;
  revisions?: ViSemanticRevisionFacts;
  runtime?: ViSemanticRuntimeFacts;
  format: ViSemanticOutputFormat;
}

const COMPARISON_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    reportHtml: {
      type: 'string',
      description:
        'The raw NI LabVIEW comparison report HTML (as produced by the comparison engine) to project onto the semantic model.'
    },
    reportFilePath: {
      type: 'string',
      description:
        'Optional path used only to anchor relative asset resolution; no file is read.'
    },
    revisions: {
      type: 'object',
      properties: {
        baseHash: { type: 'string' },
        selectedHash: { type: 'string' }
      }
    },
    runtime: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        engine: { type: 'string' },
        labviewVersion: { type: 'string' },
        bitness: { type: 'string' }
      }
    },
    format: OUTPUT_FORMAT_SCHEMA
  },
  required: ['reportHtml']
} as const;

// A single preview render reference the caller already holds (the cloud agent
// resolves previews itself and passes them here). `available` is required (a
// caller either states a side is available or omits that side entirely); the
// remaining fields are optional context.
const PREVIEW_REFERENCE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    available: { type: 'boolean' },
    relativePath: { type: 'string' },
    revision: { type: 'string' },
    cacheKey: { type: 'string' },
    inlineImageCount: { type: 'integer' }
  },
  required: ['available']
} as const;

const CORRELATION_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    reportHtml: COMPARISON_INPUT_SCHEMA.properties.reportHtml,
    reportFilePath: COMPARISON_INPUT_SCHEMA.properties.reportFilePath,
    revisions: COMPARISON_INPUT_SCHEMA.properties.revisions,
    runtime: COMPARISON_INPUT_SCHEMA.properties.runtime,
    previews: {
      type: 'object',
      description:
        'Optional base/head preview render references (as the caller already resolved them). ' +
        'Omit to get a surfaces-only correlation with both preview sides marked unavailable.',
      properties: {
        base: PREVIEW_REFERENCE_INPUT_SCHEMA,
        head: PREVIEW_REFERENCE_INPUT_SCHEMA
      }
    },
    format: OUTPUT_FORMAT_SCHEMA
  },
  required: ['reportHtml']
} as const;

const COMPARE_REVISIONS_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    repositoryRoot: {
      type: 'string',
      description: 'Absolute path to the Git repository containing the VI.'
    },
    relativePath: {
      type: 'string',
      description: 'Repository-relative path of the .vi to compare.'
    },
    baseHash: {
      type: 'string',
      description: 'Base (older) revision identifier.'
    },
    selectedHash: {
      type: 'string',
      description: 'Selected (newer) revision identifier.'
    },
    reportType: {
      type: 'string',
      enum: ['diff', 'print'],
      description: 'Comparison report type. Defaults to "diff".'
    },
    runtime: {
      type: 'object',
      description:
        'Optional runtime preferences (provider, LabVIEW version/bitness, connect timeout).',
      properties: {
        provider: { type: 'string', enum: ['host', 'docker'] },
        labviewVersion: { type: 'string' },
        bitness: { type: 'string', enum: ['x86', 'x64'] },
        containerImageVersion: { type: 'string' },
        cliConnectTimeoutSeconds: { type: 'number' }
      }
    },
    format: OUTPUT_FORMAT_SCHEMA
  },
  required: ['repositoryRoot', 'relativePath', 'baseHash', 'selectedHash']
} as const;

const HISTORY_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    repositoryRoot: {
      type: 'string',
      description: 'Absolute path to the Git repository containing the VI.'
    },
    relativePath: {
      type: 'string',
      description: 'Repository-relative path of the .vi whose history to walk.'
    },
    maxRevisions: {
      type: 'number',
      description:
        'How many recent revisions to walk (N revisions yields N-1 comparisons). Defaults to 3; bounded to 20.'
    },
    runtime: {
      type: 'object',
      description:
        'Optional runtime preferences (provider, LabVIEW version/bitness, connect timeout).',
      properties: {
        provider: { type: 'string', enum: ['host', 'docker'] },
        labviewVersion: { type: 'string' },
        bitness: { type: 'string', enum: ['x86', 'x64'] },
        containerImageVersion: { type: 'string' },
        cliConnectTimeoutSeconds: { type: 'number' }
      }
    },
    format: OUTPUT_FORMAT_SCHEMA
  },
  required: ['repositoryRoot', 'relativePath']
} as const;

const REPOSITORY_INDEX_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    repositoryRoot: {
      type: 'string',
      description: 'Absolute path to the Git repository to survey.'
    },
    maxVis: {
      type: 'number',
      description:
        'Cap on how many VIs to detail, activity-ranked. Defaults to 100; bounded to 500.'
    }
  },
  required: ['repositoryRoot']
} as const;

const PR_REVIEW_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    repositoryRoot: {
      type: 'string',
      description: 'Absolute path to the Git repository to review.'
    },
    baseHash: {
      type: 'string',
      description: 'Base (older) revision identifier, for example a pull-request merge base.'
    },
    selectedHash: {
      type: 'string',
      description: 'Selected (newer) revision identifier, for example the pull-request head.'
    },
    maxVis: {
      type: 'number',
      description:
        'Cap on how many changed VIs to compare, path-sorted. Defaults to 50; bounded to 200.'
    },
    runtime: {
      type: 'object',
      description:
        'Optional runtime preferences (provider, LabVIEW version/bitness, connect timeout).',
      properties: {
        provider: { type: 'string', enum: ['host', 'docker'] },
        labviewVersion: { type: 'string' },
        bitness: { type: 'string', enum: ['x86', 'x64'] },
        containerImageVersion: { type: 'string' },
        cliConnectTimeoutSeconds: { type: 'number' }
      }
    },
    format: OUTPUT_FORMAT_SCHEMA
  },
  required: ['repositoryRoot', 'baseHash', 'selectedHash']
} as const;

const SCHEMA_DISCOVERY_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    schema: {
      type: 'string',
      enum: [
        VI_SEMANTIC_COMPARISON_SCHEMA_ID,
        VI_SEMANTIC_HISTORY_SCHEMA_ID,
        VI_REPOSITORY_INDEX_SCHEMA_ID
      ],
      description: 'Optional schema id to fetch; omit to receive all published schemas.'
    }
  }
} as const;

const DOCUMENT_VALIDATION_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    document: {
      type: 'object',
      description:
        'A self-describing semantic document (carrying a "schema" field) to validate against its published JSON Schema.'
    }
  },
  required: ['document']
} as const;

// VHS-REQ-659: read-only preview-cache inspection tools. Every tool takes a
// local cache DIRECTORY path (e.g. a cache downloaded off a Codespace) and never
// renders or launches LabVIEW.
const PREVIEW_CACHE_DIR_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    cacheDirectory: {
      type: 'string',
      description:
        'Path to a VI-preview render cache directory (contains <sha256>.html documents), e.g. a cache downloaded from a Codespace.'
    }
  },
  required: ['cacheDirectory']
} as const;

const PREVIEW_CACHE_GET_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    cacheDirectory: {
      type: 'string',
      description: 'Path to a VI-preview render cache directory.'
    },
    key: {
      type: 'string',
      description: 'The cache key (a cached document basename without ".html"; sha256-hex for real keys).'
    },
    includeHtml: {
      type: 'boolean',
      description:
        'When true, return the raw preview HTML (can be ~2MB with hundreds of inline images). Default false returns metadata + a file-path pointer.'
    }
  },
  required: ['cacheDirectory', 'key']
} as const;

const PREVIEW_CACHE_SEARCH_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    cacheDirectory: {
      type: 'string',
      description: 'Path to a VI-preview render cache directory.'
    },
    marker: {
      type: 'string',
      enum: ['error', 'interactive', 'image', 'empty', 'fallback'],
      description:
        'Content marker to match: "error" (error markers), "interactive" (block-diagram viewer), "image" (>=1 inline image), "empty", or "fallback" (a block diagram rendered but was too low-fidelity to present interactively).'
    }
  },
  required: ['cacheDirectory', 'marker']
} as const;

const RUNTIME_HEALTH_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    platform: {
      type: 'string',
      enum: ['win32', 'linux', 'darwin'],
      description:
        'Target platform to resolve the comparison runtime for. Defaults to the server host platform.'
    },
    settings: {
      type: 'object',
      description:
        'Optional comparison-runtime settings (e.g. provider, labviewVersion, bitness, containerImageVersion) to evaluate, mirroring the extension settings an operator would pick.'
    }
  }
} as const;

const PREVIEW_DIAGNOSTICS_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    cacheDirectory: {
      type: 'string',
      description:
        'Optional VI-preview render cache directory to inspect (entry/byte counts, newest entry). Omit to skip cache statistics.'
    },
    processPlatform: {
      type: 'string',
      enum: ['win32', 'linux', 'darwin'],
      description: 'Platform to resolve the preview runtime for. Defaults to the server host platform.'
    },
    settings: {
      type: 'object',
      description: 'Optional comparison-runtime settings to evaluate during runtime resolution.'
    },
    connectTimeoutSeconds: {
      type: 'number',
      description: 'Optional preview-runtime connect timeout (seconds).'
    }
  }
} as const;

const CHANGED_VIS_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    repositoryRoot: {
      type: 'string',
      description: 'Absolute path to the Git repository.'
    },
    baseHash: {
      type: 'string',
      description: 'Base (older) revision identifier, e.g. a PR merge base.'
    },
    selectedHash: {
      type: 'string',
      description: 'Selected (newer) revision identifier, e.g. the PR head.'
    }
  },
  required: ['repositoryRoot', 'baseHash', 'selectedHash']
} as const;

/**
 * MCP tool annotations (per the 2025-06-18 spec `ToolAnnotations`) declaring
 * behavioral hints so an agent host can reason about a tool before calling it.
 * Every vi-history-suite tool is read-only (none mutate the repository or VIs),
 * so all carry `readOnlyHint: true` and `destructiveHint: false`. The two
 * annotation shapes differ only in `openWorldHint`:
 *   - CLOSED: pure, in-process tools that operate solely on their arguments
 *     (schema discovery, document validation, and HTML-in comparison rendering).
 *   - OPEN: tools that reach an external system — Git, a LabVIEW comparison
 *     runtime (host or Docker), or the preview-cache filesystem.
 * Hints are advisory (not a security boundary); they let hosts auto-approve
 * read-only calls and warn before open-world side effects.
 */
const READ_ONLY_CLOSED_WORLD = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;
const READ_ONLY_OPEN_WORLD = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
} as const;

export const VI_SEMANTIC_MCP_TOOLS = [
  {
    name: 'summarize_vi_comparison',
    description:
      'Return a concise, human- and agent-readable "what changed" narrative for a LabVIEW VI comparison report.',
    inputSchema: COMPARISON_INPUT_SCHEMA,
    annotations: { title: 'Summarize VI comparison', ...READ_ONLY_CLOSED_WORLD }
  },
  {
    name: 'get_vi_semantic_comparison',
    description: `Return the full ${VI_SEMANTIC_COMPARISON_SCHEMA} semantic model (changed surfaces, attributes, detail sections, totals, and narrative) for a LabVIEW VI comparison report.`,
    inputSchema: COMPARISON_INPUT_SCHEMA,
    annotations: { title: 'Get VI semantic comparison', ...READ_ONLY_CLOSED_WORLD }
  },
  {
    name: 'get_vi_preview_comparison_correlation',
    description:
      `Return the ${VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA} model correlating a LabVIEW VI ` +
      'comparison report with its base/head preview renders: per changed surface, the change ' +
      'kinds, the coordinate-bearing per-object changes (diagram-space, not preview pixels), ' +
      'and whether each preview side is available for side-by-side review, plus a narrative. ' +
      'Pure over the supplied report HTML and optional caller-provided preview references.',
    inputSchema: CORRELATION_INPUT_SCHEMA,
    annotations: { title: 'Get VI preview-comparison correlation', ...READ_ONLY_CLOSED_WORLD }
  },
  {
    name: 'compare_vi_revisions',
    description:
      'Invoke a LabVIEW comparison between two Git revisions of a VI and return the full ' +
      `${VI_SEMANTIC_COMPARISON_SCHEMA} semantic model. Requires a comparison runtime ` +
      '(host LabVIEW or a Docker LabVIEW image) to be available; a run may take minutes.',
    inputSchema: COMPARE_REVISIONS_INPUT_SCHEMA,
    annotations: { title: 'Compare VI revisions', ...READ_ONLY_OPEN_WORLD }
  },
  {
    name: 'summarize_vi_history',
    description:
      "Walk a VI's recent Git revisions and invoke a comparison across each adjacent pair, " +
      'returning a vi-history-suite/vi-semantic-history@v1 evolution timeline (per-transition ' +
      'narratives plus an aggregate story). Requires a comparison runtime; a run may take several minutes.',
    inputSchema: HISTORY_INPUT_SCHEMA,
    annotations: { title: 'Summarize VI history', ...READ_ONLY_OPEN_WORLD }
  },
  {
    name: 'index_repository_vis',
    description:
      "Survey a Git repository's tracked VIs and return a vi-history-suite/vi-repository-index@v1 " +
      'index (each VI with its revision count and latest change, activity-ranked). Pure Git; no ' +
      'comparison runtime required.',
    inputSchema: REPOSITORY_INDEX_INPUT_SCHEMA,
    annotations: { title: 'Index repository VIs', ...READ_ONLY_OPEN_WORLD }
  },
  {
    name: 'build_vi_pr_review',
    description:
      'Review a pull request by comparing every LabVIEW VI changed between two Git revisions ' +
      'and returning a vi-history-suite/vi-semantic-pr-review@v1 review (a per-VI what-changed ' +
      'summary plus an aggregate narrative). Request the markdown format to get a review-ready, ' +
      'sticky PR-comment body. Requires a comparison runtime; a run may take several minutes.',
    inputSchema: PR_REVIEW_INPUT_SCHEMA,
    annotations: { title: 'Build VI PR review', ...READ_ONLY_OPEN_WORLD }
  },
  {
    name: 'get_vi_semantic_schema',
    description:
      'Return the published JSON Schema(s) for the vi-history-suite semantic models ' +
      '(comparison, history, repository index) - the open, versioned VI-diff standard. ' +
      'Omit "schema" to receive all.',
    inputSchema: SCHEMA_DISCOVERY_INPUT_SCHEMA,
    annotations: { title: 'Get VI semantic schema', ...READ_ONLY_CLOSED_WORLD }
  },
  {
    name: 'validate_vi_semantic_document',
    description:
      'Validate a self-describing semantic document against its published JSON Schema; ' +
      'returns { valid, errors }.',
    inputSchema: DOCUMENT_VALIDATION_INPUT_SCHEMA,
    annotations: { title: 'Validate VI semantic document', ...READ_ONLY_CLOSED_WORLD }
  },
  {
    name: 'list_preview_cache',
    description:
      'List the entries in a VI-preview render cache directory (each with its cache key, size, ' +
      'inline image count, interactive-viewer flag, and health flags). Read-only; no comparison ' +
      'runtime required.',
    inputSchema: PREVIEW_CACHE_DIR_INPUT_SCHEMA,
    annotations: { title: 'List preview cache', ...READ_ONLY_OPEN_WORLD }
  },
  {
    name: 'summarize_preview_cache',
    description:
      'Summarize a VI-preview render cache directory: entry/byte counts, healthy vs flagged, ' +
      'interactive count, and the list of flagged entries (empty / error-marker / no-rendered-content). ' +
      'Read-only.',
    inputSchema: PREVIEW_CACHE_DIR_INPUT_SCHEMA,
    annotations: { title: 'Summarize preview cache', ...READ_ONLY_OPEN_WORLD }
  },
  {
    name: 'diagnose_preview_cache',
    description:
      'Return a vi-history-suite/preview-cache-diagnostics@v1 snapshot for a cache directory ' +
      '(entry/byte counts, health rollup, newest entry) so an agent can answer "is the preview ' +
      'cache healthy?" in one call. Read-only.',
    inputSchema: PREVIEW_CACHE_DIR_INPUT_SCHEMA,
    annotations: { title: 'Diagnose preview cache', ...READ_ONLY_OPEN_WORLD }
  },
  {
    name: 'search_preview_cache',
    description:
      'Find cache entries by content marker: "error", "interactive", "image", "empty", or "fallback" ' +
      '(a block diagram rendered but was too low-fidelity to present interactively). ' +
      'Returns the matching entries (metadata only). Read-only.',
    inputSchema: PREVIEW_CACHE_SEARCH_INPUT_SCHEMA,
    annotations: { title: 'Search preview cache', ...READ_ONLY_OPEN_WORLD }
  },
  {
    name: 'get_preview_cache_entry',
    description:
      'Fetch one preview-cache entry by cache key. Returns metadata plus a file-path pointer by ' +
      'default (a cached preview can be ~2MB with hundreds of inline images); pass includeHtml:true ' +
      'to return the raw HTML. Read-only.',
    inputSchema: PREVIEW_CACHE_GET_INPUT_SCHEMA,
    annotations: { title: 'Get preview cache entry', ...READ_ONLY_OPEN_WORLD }
  },
  {
    name: 'get_runtime_health',
    description:
      'Resolve the LabVIEW comparison runtime WITHOUT running a comparison and return a ' +
      `${RUNTIME_HEALTH_SCHEMA} snapshot (selected provider/engine/container image, or the ` +
      'blockedReason when none is available) so an agent can answer "can I compare here, and if ' +
      'not, why?" in one cheap call before spending minutes on compare_vi_revisions / ' +
      'build_vi_pr_review. Read-only; never renders.',
    inputSchema: RUNTIME_HEALTH_INPUT_SCHEMA,
    annotations: { title: 'Get runtime health', ...READ_ONLY_OPEN_WORLD }
  },
  {
    name: 'get_preview_diagnostics',
    description:
      'Return a vi-history-suite/preview-diagnostics@v1 environment snapshot (resolved preview ' +
      'runtime, Docker availability + OS type + LabVIEW images, and optional cache statistics) so ' +
      'an agent can answer "is preview generation possible here, and is the cache populated?" in ' +
      'one call. Read-only; never renders.',
    inputSchema: PREVIEW_DIAGNOSTICS_INPUT_SCHEMA,
    annotations: { title: 'Get preview diagnostics', ...READ_ONLY_OPEN_WORLD }
  },
  {
    name: 'list_changed_vis',
    description:
      'List the VI source files (.vi/.vit/.vim/.ctl) changed between two Git revisions \u2014 a cheap, ' +
      `Git-only ${CHANGED_VIS_SCHEMA} listing (no comparison runtime, no rendering) so an agent can ` +
      'scope a review (whether to run the minutes-long build_vi_pr_review at all, and against how ' +
      'many VIs) before committing to it. Read-only.',
    inputSchema: CHANGED_VIS_INPUT_SCHEMA,
    annotations: { title: 'List changed VIs', ...READ_ONLY_OPEN_WORLD }
  }
] as const;

/**
 * MCP prompts (per the 2025-06-18 spec) — host-surfaced, guided workflows that
 * orchestrate the tools above. Each prompt encodes a multi-step job an agent
 * would otherwise assemble tool-by-tool, so the design invariant (enforced by
 * test) is that every prompt references >=2 distinct tools OR a tool plus an
 * explicit decision step; a 1:1 wrapper over a single tool is rejected.
 *
 * Future (separate release): a `post_pr_review` prompt that reviews AND posts to
 * GitHub belongs in the GitHub-native-posting release, not here — it carries an
 * auth/side-effect risk class the pure prompt surface deliberately avoids.
 */
export const VI_SEMANTIC_MCP_PROMPTS = [
  {
    name: 'review_pull_request',
    title: 'Review pull-request VIs',
    description:
      'Scope the VIs changed between two revisions and produce a review-ready Markdown ' +
      'review (chains list_changed_vis + build_vi_pr_review, with a runtime-health fallback).',
    arguments: [
      { name: 'repositoryRoot', description: 'Absolute path to the Git repository.', required: true },
      { name: 'baseHash', description: 'Base (older) revision identifier.', required: true },
      { name: 'selectedHash', description: 'Selected (newer) revision identifier.', required: true },
      { name: 'maxVis', description: 'Optional cap on VIs compared (default 50, ceiling 200).', required: false }
    ]
  },
  {
    name: 'explain_vi_history',
    title: 'Explain a VI\u2019s evolution',
    description:
      "Walk a VI's recent revisions and narrate how it evolved (chains summarize_vi_history " +
      'with a runtime-health fallback).',
    arguments: [
      { name: 'repositoryRoot', description: 'Absolute path to the Git repository.', required: true },
      { name: 'relativePath', description: 'Repository-relative path of the .vi.', required: true },
      { name: 'maxRevisions', description: 'Optional recent-revision count (default 3, ceiling 20).', required: false }
    ]
  },
  {
    name: 'check_compare_readiness',
    title: 'Check comparison readiness',
    description:
      'Determine whether this environment can run a VI comparison and, if not, what to fix ' +
      '(chains get_runtime_health + get_preview_diagnostics into a verdict).',
    arguments: [
      { name: 'platform', description: 'Optional target platform (win32 | linux | darwin).', required: false }
    ]
  },
  {
    name: 'survey_repository_vis',
    title: 'Survey a repository\u2019s VIs',
    description:
      'Map a repository\u2019s tracked VIs by activity, then narrate how the most-active VI ' +
      '(or a chosen one) evolved (chains index_repository_vis + summarize_vi_history).',
    arguments: [
      { name: 'repositoryRoot', description: 'Absolute path to the Git repository.', required: true },
      { name: 'maxVis', description: 'Optional cap on VIs detailed (default 100, ceiling 500).', required: false },
      { name: 'relativePath', description: 'Optional VI to drill into instead of the most-active one.', required: false }
    ]
  },
  {
    name: 'inspect_vi_change',
    title: 'Inspect a single VI change',
    description:
      'Deep-dive one VI\u2019s change between two revisions: gate on runtime health, then run the ' +
      'full semantic comparison and narrate it (chains get_runtime_health + compare_vi_revisions).',
    arguments: [
      { name: 'repositoryRoot', description: 'Absolute path to the Git repository.', required: true },
      { name: 'relativePath', description: 'Repository-relative path of the .vi to inspect.', required: true },
      { name: 'baseHash', description: 'Base (older) revision identifier.', required: true },
      { name: 'selectedHash', description: 'Selected (newer) revision identifier.', required: true }
    ]
  },
  {
    name: 'audit_preview_cache',
    title: 'Audit a VI preview cache',
    description:
      'Health-check a VI-preview render cache directory and surface flagged entries ' +
      '(chains diagnose_preview_cache + search_preview_cache, correlated with get_preview_diagnostics).',
    arguments: [
      { name: 'cacheDirectory', description: 'Path to a VI-preview render cache directory.', required: true },
      { name: 'platform', description: 'Optional target platform (win32 | linux | darwin) for the runtime correlation.', required: false }
    ]
  },
  {
    name: 'diagnose_runtime_cache',
    title: 'Diagnose runtime preview caching',
    description:
      'Diagnose whether the active preview runtime is populating a healthy render cache \u2014 ' +
      'distinguishing a cold cache from a broken runtime or an error-poisoned cache ' +
      '(chains get_preview_diagnostics + get_runtime_health + diagnose_preview_cache + search_preview_cache).',
    arguments: [
      { name: 'cacheDirectory', description: 'Path to the VI-preview render cache directory the runtime writes to.', required: true },
      { name: 'platform', description: 'Optional target platform (win32 | linux | darwin) to resolve the runtime for.', required: false }
    ]
  }
] as const;

/** Every prompt name published by the registry (the authoritative known set). */
const KNOWN_PROMPT_NAMES: ReadonlySet<string> = new Set(
  VI_SEMANTIC_MCP_PROMPTS.map((prompt) => prompt.name)
);

/**
 * MCP resources (per the 2025-06-18 spec) — the published semantic JSON Schemas,
 * the open, versioned VI-diff standard, made addressable as read-only context.
 * URI scheme `vi-history-suite://schema/<id>`, where `<id>` is the schema's own
 * `$id` path part verbatim (`vi-semantic-comparison@v1`), plus the `schema/index`
 * aggregate. The `@vN` version stays in the URI so a future schema v2 is a new,
 * distinct resource rather than a silently-repointed "latest".
 */
const RESOURCE_URI_PREFIX = 'vi-history-suite://schema/';
const SCHEMA_INDEX_URI = `${RESOURCE_URI_PREFIX}index`;

export const VI_SEMANTIC_MCP_RESOURCES = [
  {
    uri: `${RESOURCE_URI_PREFIX}vi-semantic-comparison@v1`,
    name: 'vi-semantic-comparison@v1 schema',
    title: 'VI semantic comparison schema',
    description: 'JSON Schema for the vi-history-suite/vi-semantic-comparison@v1 model.',
    mimeType: 'application/schema+json'
  },
  {
    uri: `${RESOURCE_URI_PREFIX}vi-semantic-history@v1`,
    name: 'vi-semantic-history@v1 schema',
    title: 'VI semantic history schema',
    description: 'JSON Schema for the vi-history-suite/vi-semantic-history@v1 model.',
    mimeType: 'application/schema+json'
  },
  {
    uri: `${RESOURCE_URI_PREFIX}vi-repository-index@v1`,
    name: 'vi-repository-index@v1 schema',
    title: 'VI repository index schema',
    description: 'JSON Schema for the vi-history-suite/vi-repository-index@v1 model.',
    mimeType: 'application/schema+json'
  },
  {
    uri: SCHEMA_INDEX_URI,
    name: 'vi-diff schema index',
    title: 'Open VI-diff standard (all schemas)',
    description: 'The full map of published vi-history-suite semantic JSON Schemas.',
    mimeType: 'application/json'
  }
] as const;

/**
 * Prefix for the fs-backed preview-cache resource template. A concrete resource
 * URI names the cache key in the path and the cache directory in the query, e.g.
 * `vi-history-suite://preview-cache/<sha256>?cacheDirectory=%2Fpath%2Fto%2Fcache`.
 * Reading one requires the async server entrypoint (it touches the filesystem
 * through the injected preview-cache inspector), unlike the pure schema resources.
 */
const PREVIEW_CACHE_RESOURCE_PREFIX = 'vi-history-suite://preview-cache/';

/**
 * MCP resource templates (per the 2025-06-18 spec) — parameterized, fs-backed
 * resources. The preview-cache template exposes a single rendered VI-preview
 * document as addressable HTML context so an agent can reference a cached preview
 * without a `get_preview_cache_entry` tool round-trip (VHS-REQ-659).
 */
export const VI_SEMANTIC_MCP_RESOURCE_TEMPLATES = [
  {
    uriTemplate: `${PREVIEW_CACHE_RESOURCE_PREFIX}{cacheKey}{?cacheDirectory}`,
    name: 'preview-cache entry',
    title: 'VI preview cache entry (HTML)',
    description:
      'A single rendered VI-preview document from a cache directory, addressable by its cache key ' +
      '(a cached document basename; sha256-hex for real keys). Read-only; requires the async server ' +
      'entrypoint (filesystem).',
    mimeType: 'text/html'
  }
] as const;

interface PromptMessage {
  role: 'user';
  content: { type: 'text'; text: string };
}

/**
 * Renders a prompt into its `{ description, messages }` payload. Required
 * arguments are validated through the same ToolArgumentError -> -32602 machinery
 * the tools use, so a prompt is as strict as the tools it front-ends. Optional
 * arguments are interpolated conditionally so an absent value yields clean prose.
 */
function renderPrompt(name: string, rawArguments: unknown): { description: string; messages: PromptMessage[] } {
  const args = requireArgumentsObject(rawArguments ?? {});
  if (name === 'review_pull_request') {
    const repositoryRoot = requireStringArg(args, 'repositoryRoot');
    const baseHash = requireStringArg(args, 'baseHash');
    const selectedHash = requireStringArg(args, 'selectedHash');
    const maxVisClause =
      typeof args.maxVis === 'number' ? `, \`maxVis=${args.maxVis}\`` : '';
    const text =
      'Review the LabVIEW VIs changed in this pull request.\n\n' +
      `1. Call \`list_changed_vis\` with \`repositoryRoot="${repositoryRoot}"\`, ` +
      `\`baseHash="${baseHash}"\`, \`selectedHash="${selectedHash}"\` to scope the changed ` +
      '`.vi`/`.vit`/`.vim`/`.ctl` set. If `count` is 0, report that no VIs changed and stop.\n' +
      '2. If VIs changed, call `build_vi_pr_review` with the same ' +
      `\`repositoryRoot\`/\`baseHash\`/\`selectedHash\`${maxVisClause}, \`format="markdown"\` ` +
      'to produce the review body.\n' +
      '3. Present the returned Markdown as the PR review, leading with the aggregate narrative, ' +
      'then the per-VI what-changed summaries.\n\n' +
      'If `list_changed_vis` or `build_vi_pr_review` returns a blocked/failed status, first call ' +
      '`get_runtime_health` to explain why a comparison could not run and what to fix.';
    return {
      description: 'Guided LabVIEW VI pull-request review.',
      messages: [{ role: 'user', content: { type: 'text', text } }]
    };
  }
  if (name === 'explain_vi_history') {
    const repositoryRoot = requireStringArg(args, 'repositoryRoot');
    const relativePath = requireStringArg(args, 'relativePath');
    const maxRevisionsClause =
      typeof args.maxRevisions === 'number' ? `, \`maxRevisions=${args.maxRevisions}\`` : '';
    const text =
      `Explain how the LabVIEW VI at \`${relativePath}\` has evolved.\n\n` +
      `Call \`summarize_vi_history\` with \`repositoryRoot="${repositoryRoot}"\`, ` +
      `\`relativePath="${relativePath}"\`${maxRevisionsClause}. Summarize the returned ` +
      'vi-history-suite/vi-semantic-history@v1 timeline as a chronological narrative: the ' +
      "overall arc first, then each transition's key changes. If the runtime is unavailable, " +
      'call `get_runtime_health` and report the blocker.';
    return {
      description: 'Guided VI evolution narrative.',
      messages: [{ role: 'user', content: { type: 'text', text } }]
    };
  }
  if (name === 'check_compare_readiness') {
    let platformClause = '';
    let previewPlatformClause = '';
    if (args.platform !== undefined) {
      const platform = requireEnumArg(args, 'platform', RUNTIME_PLATFORM_VALUES);
      platformClause = ` with \`platform="${platform}"\``;
      previewPlatformClause = ` with \`processPlatform="${platform}"\``;
    }
    const text =
      'Determine whether this environment can run a LabVIEW VI comparison.\n\n' +
      `Call \`get_runtime_health\`${platformClause}. If \`blocked\` is true, explain ` +
      `\`blockedReason\` and the concrete fix. Then call \`get_preview_diagnostics\`${previewPlatformClause} ` +
      'and report Docker availability, visible LabVIEW images, and whether a preview cache is ' +
      'populated. Conclude with a one-line verdict: ready (and by which provider) or blocked (and ' +
      'the single next action).';
    return {
      description: 'Guided comparison-readiness check.',
      messages: [{ role: 'user', content: { type: 'text', text } }]
    };
  }
  if (name === 'survey_repository_vis') {
    const repositoryRoot = requireStringArg(args, 'repositoryRoot');
    const maxVisClause = typeof args.maxVis === 'number' ? `, \`maxVis=${args.maxVis}\`` : '';
    const drillClause =
      typeof args.relativePath === 'string' && args.relativePath.length > 0
        ? `the VI at \`${args.relativePath}\``
        : 'the highest-activity VI it reports';
    const text =
      'Survey the LabVIEW VIs in this repository and drill into the one that changes most.\n\n' +
      `1. Call \`index_repository_vis\` with \`repositoryRoot="${repositoryRoot}"\`${maxVisClause} ` +
      'to get the vi-history-suite/vi-repository-index@v1 activity-ranked map (each VI with its ' +
      'revision count and latest change).\n' +
      `2. Choose ${drillClause}, then call \`summarize_vi_history\` with the same ` +
      '`repositoryRoot` and that VI\u2019s `relativePath` to walk its evolution timeline.\n' +
      '3. Report the repository shape first (how many VIs, which are hottest), then the chosen ' +
      'VI\u2019s chronological story. If `summarize_vi_history` reports the runtime is unavailable, ' +
      'still present the index and note the comparison could not run.';
    return {
      description: 'Guided repository VI survey with a history drill-down.',
      messages: [{ role: 'user', content: { type: 'text', text } }]
    };
  }
  if (name === 'inspect_vi_change') {
    const repositoryRoot = requireStringArg(args, 'repositoryRoot');
    const relativePath = requireStringArg(args, 'relativePath');
    const baseHash = requireStringArg(args, 'baseHash');
    const selectedHash = requireStringArg(args, 'selectedHash');
    const text =
      `Inspect exactly how the LabVIEW VI at \`${relativePath}\` changed between two revisions.\n\n` +
      '1. Call `get_runtime_health` first. If `blocked` is true, explain `blockedReason` and the ' +
      'fix, and stop \u2014 the comparison cannot run.\n' +
      `2. Otherwise call \`compare_vi_revisions\` with \`repositoryRoot="${repositoryRoot}"\`, ` +
      `\`relativePath="${relativePath}"\`, \`baseHash="${baseHash}"\`, ` +
      `\`selectedHash="${selectedHash}"\` to get the full ` +
      'vi-history-suite/vi-semantic-comparison@v1 model (a run may take minutes).\n' +
      '3. Narrate what changed leading with the model\u2019s `narrative`, then the changed surfaces, ' +
      'attributes, and totals. Call out any structural or connector-pane change explicitly.';
    return {
      description: 'Guided single-VI change deep-dive.',
      messages: [{ role: 'user', content: { type: 'text', text } }]
    };
  }
  if (name === 'audit_preview_cache') {
    const cacheDirectory = requireStringArg(args, 'cacheDirectory');
    let platformClause = '';
    if (args.platform !== undefined) {
      const platform = requireEnumArg(args, 'platform', RUNTIME_PLATFORM_VALUES);
      platformClause = ` with \`platform="${platform}"\``;
    }
    const text =
      `Audit the VI-preview render cache at \`${cacheDirectory}\`.\n\n` +
      `1. Call \`diagnose_preview_cache\` with \`cacheDirectory="${cacheDirectory}"\` for the ` +
      'vi-history-suite/preview-cache-diagnostics@v1 health rollup (entry/byte counts, healthy vs ' +
      'flagged, newest entry).\n' +
      `2. If any entries are flagged, call \`search_preview_cache\` with the same ` +
      '`cacheDirectory` and `marker="error"`, then again with `marker="empty"`, to enumerate the ' +
      'specific broken entries.\n' +
      `3. Call \`get_preview_diagnostics\`${platformClause} to correlate cache health with the ` +
      'current runtime (Docker availability, visible LabVIEW images).\n' +
      '4. Conclude with a one-line verdict: healthy, or the count of flagged entries and the single ' +
      'next action (e.g. re-render the flagged VIs on a working runtime).';
    return {
      description: 'Guided VI preview-cache audit.',
      messages: [{ role: 'user', content: { type: 'text', text } }]
    };
  }
  if (name === 'diagnose_runtime_cache') {
    const cacheDirectory = requireStringArg(args, 'cacheDirectory');
    let previewPlatformClause = '';
    let runtimePlatformClause = '';
    if (args.platform !== undefined) {
      const platform = requireEnumArg(args, 'platform', RUNTIME_PLATFORM_VALUES);
      previewPlatformClause = `, \`processPlatform="${platform}"\``;
      runtimePlatformClause = ` with \`platform="${platform}"\``;
    }
    const text =
      'Diagnose whether the active preview runtime is populating a healthy render cache at ' +
      `\`${cacheDirectory}\`.\n\n` +
      `1. Call \`get_preview_diagnostics\` with \`cacheDirectory="${cacheDirectory}"\`` +
      `${previewPlatformClause} to get the resolved preview runtime, Docker availability + visible ` +
      'LabVIEW images, and the cache statistics (entry/byte counts, newest entry) in one call.\n' +
      `2. Call \`get_runtime_health\`${runtimePlatformClause} to confirm the comparison runtime is ` +
      'not `blocked`; if it is, report `blockedReason` \u2014 nothing will be cached until it is fixed.\n' +
      `3. Call \`diagnose_preview_cache\` with the same \`cacheDirectory\` for the health rollup, then ` +
      '`search_preview_cache` with `marker="error"` and again `marker="interactive"` to tell a broken ' +
      'runtime (entries present but error-marked) from a working one (interactive/image entries).\n' +
      '4. Classify the caching state and give the single next action:\n' +
      '   - runtime ready + zero entries \u2192 COLD (nothing rendered yet; trigger a render to populate it).\n' +
      '   - runtime blocked \u2192 BLOCKED (fix `blockedReason`; the cache cannot fill).\n' +
      '   - entries present but error-marked / no interactive \u2192 BROKEN (the runtime is producing ' +
      'unusable renders; inspect one with `get_preview_cache_entry` and re-render on a working runtime).\n' +
      '   - healthy interactive/image entries \u2192 HEALTHY (report entry count and newest entry).';
    return {
      description: 'Guided runtime preview-caching diagnosis.',
      messages: [{ role: 'user', content: { type: 'text', text } }]
    };
  }
  throwArgumentError('name', 'a known prompt name', name);
}

interface CompletionResult {
  values: string[];
  total: number;
  hasMore: false;
}

/**
 * Computes argument-value completions (MCP `completion/complete`). Offers the
 * known enum/value set for the arguments that have one — the `platform` argument
 * of `check_compare_readiness`, and the schema id of the schema resource
 * template — filtered by the partial value the host has typed. Unknown refs or
 * free-form arguments complete to nothing (never an error), so a host can call
 * this on any argument safely.
 */
function completeArgument(rawRef: unknown, rawArgument: unknown): CompletionResult {
  const empty: CompletionResult = { values: [], total: 0, hasMore: false };
  if (typeof rawRef !== 'object' || rawRef === null) {
    return empty;
  }
  if (typeof rawArgument !== 'object' || rawArgument === null) {
    return empty;
  }
  const ref = rawRef as { type?: unknown; name?: unknown; uri?: unknown };
  const argument = rawArgument as { name?: unknown; value?: unknown };
  const argName = typeof argument.name === 'string' ? argument.name : '';
  const partial = typeof argument.value === 'string' ? argument.value : '';

  let candidates: readonly string[] = [];
  if (ref.type === 'ref/prompt' && ref.name === 'check_compare_readiness' && argName === 'platform') {
    candidates = RUNTIME_PLATFORM_VALUES;
  } else if (ref.type === 'ref/prompt' && ref.name === 'audit_preview_cache' && argName === 'platform') {
    candidates = RUNTIME_PLATFORM_VALUES;
  } else if (ref.type === 'ref/prompt' && ref.name === 'diagnose_runtime_cache' && argName === 'platform') {
    candidates = RUNTIME_PLATFORM_VALUES;
  } else if (
    ref.type === 'ref/resource' &&
    typeof ref.uri === 'string' &&
    ref.uri.startsWith(RESOURCE_URI_PREFIX)
  ) {
    // Complete the schema-id path segment of the schema resource template.
    candidates = Object.keys(VI_SEMANTIC_SCHEMAS).map((id) => id.replace(/^vi-history-suite\//, ''));
  }

  const values = candidates.filter((value) => value.startsWith(partial));
  return { values, total: values.length, hasMore: false };
}

/** Resolves a resource URI to its `resources/read` contents (schema JSON). */
function resolveResource(uri: string): { uri: string; mimeType: string; text: string } {
  if (uri === SCHEMA_INDEX_URI) {
    return {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(VI_SEMANTIC_SCHEMAS, null, 2)
    };
  }
  if (uri.startsWith(RESOURCE_URI_PREFIX)) {
    const schemaId = `vi-history-suite/${uri.slice(RESOURCE_URI_PREFIX.length)}`;
    const schema = VI_SEMANTIC_SCHEMAS[schemaId];
    if (schema) {
      return { uri, mimeType: 'application/schema+json', text: JSON.stringify(schema, null, 2) };
    }
  }
  throwArgumentError('uri', 'a known vi-history-suite:// resource URI', uri);
}

/**
 * Parses a concrete preview-cache resource URI into its cache directory and key.
 * Both are required; a malformed URI raises a ToolArgumentError (mapped to a
 * structured -32602). The cache key is path-encoded and the directory is a
 * `cacheDirectory` query parameter (so an absolute path with separators survives
 * intact).
 */
function parsePreviewCacheResourceUri(uri: string): { cacheDirectory: string; key: string } {
  const rest = uri.slice(PREVIEW_CACHE_RESOURCE_PREFIX.length);
  const queryIndex = rest.indexOf('?');
  const keyPart = queryIndex >= 0 ? rest.slice(0, queryIndex) : rest;
  const query = queryIndex >= 0 ? rest.slice(queryIndex + 1) : '';
  let key: string;
  try {
    key = decodeURIComponent(keyPart);
  } catch {
    key = keyPart;
  }
  if (key.length === 0) {
    throwArgumentError('uri', 'a preview-cache URI naming a cache key', uri);
  }
  const cacheDirectory = new URLSearchParams(query).get('cacheDirectory') ?? '';
  if (cacheDirectory.length === 0) {
    throwArgumentError('cacheDirectory', 'present in the preview-cache resource URI query', uri);
  }
  return { cacheDirectory, key };
}

function success(id: JsonRpcSuccess['id'], result: unknown): JsonRpcSuccess {
  return { jsonrpc: '2.0', id, result };
}

/**
 * Tool names that touch a comparison runtime or the filesystem, so they are only
 * available through the async server entrypoint (which injects the orchestrators
 * or the read-only cache inspector). The synchronous dispatcher rejects them with
 * a clear tool-error result rather than running them without their dependencies.
 * Single source of truth — the sync-capable set is derived as the registry minus
 * this set, so adding a tool to VI_SEMANTIC_MCP_TOOLS can never silently fall
 * through to "unknown tool".
 */
const ASYNC_ONLY_TOOL_NAMES: ReadonlySet<string> = new Set([
  'compare_vi_revisions',
  'summarize_vi_history',
  'index_repository_vis',
  'build_vi_pr_review',
  'list_preview_cache',
  'summarize_preview_cache',
  'diagnose_preview_cache',
  'search_preview_cache',
  'get_preview_cache_entry',
  'get_runtime_health',
  'get_preview_diagnostics',
  'list_changed_vis'
]);

/** Every tool name published by the registry (the authoritative known set). */
const KNOWN_TOOL_NAMES: ReadonlySet<string> = new Set(
  VI_SEMANTIC_MCP_TOOLS.map((tool) => tool.name)
);

/**
 * Exposed for tests: the async-only and sync-capable partitions of the tool
 * registry. `SYNC_CAPABLE_TOOL_NAMES` is derived (registry minus async-only) so
 * the two can never drift from `VI_SEMANTIC_MCP_TOOLS`.
 */
export const VI_SEMANTIC_MCP_ASYNC_ONLY_TOOL_NAMES: readonly string[] = [
  ...ASYNC_ONLY_TOOL_NAMES
].sort();
export const VI_SEMANTIC_MCP_SYNC_CAPABLE_TOOL_NAMES: readonly string[] = [
  ...KNOWN_TOOL_NAMES
]
  .filter((name) => !ASYNC_ONLY_TOOL_NAMES.has(name))
  .sort();

function failure(
  id: JsonRpcError['id'],
  code: number,
  message: string,
  data?: unknown
): JsonRpcError {
  const error: JsonRpcError['error'] = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return { jsonrpc: '2.0', id, error };
}

function toolTextResult(text: string, isError = false): unknown {
  return { content: [{ type: 'text', text }], isError };
}

/**
 * A single field-level problem with a tool's `arguments` object: which field is
 * wrong, what was expected, and what was received. Emitted as JSON-RPC error
 * `data.issues` so an agent host can correct the call programmatically instead
 * of parsing a free-text message.
 */
export interface ToolArgumentIssue {
  field: string;
  expected: string;
  received: string;
}

/**
 * Argument-shape validation failure. Thrown by the `parse*Arguments` helpers and
 * mapped by the dispatcher to a JSON-RPC `-32602` (Invalid params) error with
 * structured `data.issues`. Distinct from tool *execution* failures (a comparison
 * that failed, a cache miss), which stay in the result envelope as `isError`.
 */
export class ToolArgumentError extends Error {
  readonly issues: ToolArgumentIssue[];
  constructor(issues: ToolArgumentIssue[]) {
    super(formatToolArgumentIssues(issues));
    this.name = 'ToolArgumentError';
    this.issues = issues;
  }
}

function formatToolArgumentIssues(issues: ToolArgumentIssue[]): string {
  const detail = issues
    .map((issue) => `${issue.field} must be ${issue.expected} (received ${issue.received})`)
    .join('; ');
  return `Invalid arguments: ${detail}`;
}

function describeReceived(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (typeof value === 'string') {
    return value.length === 0 ? 'empty string' : 'string';
  }
  return typeof value;
}

function throwArgumentError(field: string, expected: string, received: unknown): never {
  throw new ToolArgumentError([{ field, expected, received: describeReceived(received) }]);
}

function requireArgumentsObject(rawArguments: unknown): Record<string, unknown> {
  if (typeof rawArguments !== 'object' || rawArguments === null || Array.isArray(rawArguments)) {
    throwArgumentError('arguments', 'an object', rawArguments);
  }
  return rawArguments as Record<string, unknown>;
}

function requireStringArg(args: Record<string, unknown>, field: string): string {
  const value = args[field];
  if (typeof value !== 'string' || value.length === 0) {
    throwArgumentError(field, 'a non-empty string', value);
  }
  return value as string;
}

function requireObjectArg(args: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = args[field];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throwArgumentError(field, 'an object', value);
  }
  return value as Record<string, unknown>;
}

function requireFiniteNumberArg(args: Record<string, unknown>, field: string): number {
  const value = args[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throwArgumentError(field, 'a finite number', value);
  }
  return value as number;
}

function requireEnumArg<T extends string>(
  args: Record<string, unknown>,
  field: string,
  allowed: readonly T[]
): T {
  const value = args[field];
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    const expected = `one of ${allowed.map((option) => `"${option}"`).join(', ')}`;
    throwArgumentError(field, expected, value);
  }
  return value as T;
}

/**
 * Validates an OPTIONAL enum argument: returns undefined when the field is
 * absent, and otherwise enforces the allowed set with the same
 * `ToolArgumentError -> -32602` contract as {@link requireEnumArg}. Using this
 * (instead of an unchecked cast) makes a bad optional enum a structured
 * invalid-params error an agent can correct, not a late execution failure.
 */
function optionalEnumArg<T extends string>(
  args: Record<string, unknown>,
  field: string,
  allowed: readonly T[]
): T | undefined {
  if (args[field] === undefined) {
    return undefined;
  }
  return requireEnumArg(args, field, allowed);
}

/**
 * Maps a thrown parse error to a response: a {@link ToolArgumentError} becomes a
 * structured JSON-RPC `-32602` (with field-level `data.issues`); any other error
 * stays a tool-execution failure in the result envelope (`isError`).
 */
function toArgumentFailure(id: JsonRpcSuccess['id'], error: unknown): JsonRpcResponse {
  if (error instanceof ToolArgumentError) {
    return failure(id, JSON_RPC_INVALID_PARAMS, error.message, { issues: error.issues });
  }
  return success(id, toolTextResult(`Tool error: ${errorMessage(error)}`, true));
}

function parseComparisonArguments(rawArguments: unknown): ViComparisonToolArguments {
  const args = requireArgumentsObject(rawArguments);
  const reportHtml = requireStringArg(args, 'reportHtml');
  return {
    reportHtml,
    reportFilePath:
      typeof args.reportFilePath === 'string' ? args.reportFilePath : undefined,
    revisions: (args.revisions as ViSemanticRevisionFacts | undefined) ?? undefined,
    runtime: (args.runtime as ViSemanticRuntimeFacts | undefined) ?? undefined,
    format: readOutputFormat(rawArguments)
  };
}

function callSchemaTool(rawArguments: unknown): unknown {
  const args =
    typeof rawArguments === 'object' && rawArguments !== null
      ? (rawArguments as Record<string, unknown>)
      : {};
  if (typeof args.schema === 'string') {
    const schema = VI_SEMANTIC_SCHEMAS[args.schema];
    if (!schema) {
      throwArgumentError('schema', 'a published semantic schema id', args.schema);
    }
    return toolTextResult(JSON.stringify(schema, null, 2));
  }
  return toolTextResult(JSON.stringify(VI_SEMANTIC_SCHEMAS, null, 2));
}

function callValidateTool(rawArguments: unknown): unknown {
  if (typeof rawArguments !== 'object' || rawArguments === null || !('document' in rawArguments)) {
    throwArgumentError('document', 'present', rawArguments);
  }
  const result = validateViSemanticDocument((rawArguments as Record<string, unknown>).document);
  return toolTextResult(JSON.stringify(result, null, 2));
}

function callTool(name: string, rawArguments: unknown): unknown {
  if (name === 'get_vi_semantic_schema') {
    return callSchemaTool(rawArguments);
  }
  if (name === 'validate_vi_semantic_document') {
    return callValidateTool(rawArguments);
  }
  const args = parseComparisonArguments(rawArguments);
  const model = buildViSemanticComparisonModelFromHtml(args.reportHtml, {
    reportFilePath: args.reportFilePath,
    revisions: args.revisions,
    runtime: args.runtime
  });

  if (name === 'get_vi_preview_comparison_correlation') {
    const previews = parsePreviewPairArgument(rawArguments);
    const correlation = buildViPreviewComparisonCorrelation(model, previews);
    if (args.format === 'markdown') {
      const table = renderCorrelationSurfaceTable(correlation);
      const markdown = table ? `${correlation.narrative}\n\n${table}` : correlation.narrative;
      return toolTextResult(markdown);
    }
    return toolTextResult(JSON.stringify(correlation, null, 2));
  }

  if (name === 'summarize_vi_comparison') {
    return toolTextResult(model.narrative);
  }
  if (args.format === 'markdown') {
    return toolTextResult(renderViSemanticComparisonMarkdown(model));
  }
  return toolTextResult(JSON.stringify(model, null, 2));
}

/**
 * Reads the optional `previews.base`/`previews.head` references for the
 * correlation tool. An absent `previews` (undefined/null) yields an empty pair
 * (surfaces-only correlation, both sides unavailable). When `previews` IS present
 * it must be a plain object (not an array), and each supplied side must be an
 * object with a boolean `available` (per the published input schema); any
 * violation raises a structured -32602 naming the offending field, rather than
 * silently degrading to unavailable.
 */
function parsePreviewPairArgument(rawArguments: unknown): ViPreviewPair {
  if (typeof rawArguments !== 'object' || rawArguments === null) {
    return {};
  }
  const previews = (rawArguments as Record<string, unknown>).previews;
  if (previews === undefined || previews === null) {
    return {};
  }
  if (typeof previews !== 'object' || Array.isArray(previews)) {
    throwArgumentError('previews', 'an object', previews);
  }
  const pair: ViPreviewPair = {};
  const base = toPreviewReference((previews as Record<string, unknown>).base, 'previews.base');
  const head = toPreviewReference((previews as Record<string, unknown>).head, 'previews.head');
  if (base) {
    pair.base = base;
  }
  if (head) {
    pair.head = head;
  }
  return pair;
}

/**
 * Normalizes one caller-supplied preview reference. Returns undefined when the
 * side is absent (undefined/null); when present it must be an object with a
 * boolean `available`, else a structured -32602 names the offending field.
 */
function toPreviewReference(raw: unknown, field: string): ViPreviewReference | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throwArgumentError(field, 'an object', raw);
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.available !== 'boolean') {
    throwArgumentError(`${field}.available`, 'a boolean', record.available);
  }
  const ref: ViPreviewReference = { available: record.available };
  if (typeof record.relativePath === 'string') {
    ref.relativePath = record.relativePath;
  }
  if (typeof record.revision === 'string') {
    ref.revision = record.revision;
  }
  if (typeof record.cacheKey === 'string') {
    ref.cacheKey = record.cacheKey;
  }
  if (
    typeof record.inlineImageCount === 'number' &&
    Number.isInteger(record.inlineImageCount) &&
    record.inlineImageCount >= 0
  ) {
    ref.inlineImageCount = record.inlineImageCount;
  }
  return ref;
}

/**
 * Pure JSON-RPC 2.0 dispatcher for the VI semantic MCP surface. Returns a
 * response for requests, or `null` for notifications (which take no reply).
 */
export function handleViSemanticMcpMessage(
  message: JsonRpcRequest
): JsonRpcResponse | null {
  const id = message.id ?? null;

  switch (message.method) {
    case 'initialize':
      return success(id, {
        protocolVersion: VI_SEMANTIC_MCP_PROTOCOL_VERSION,
        capabilities: { tools: {}, prompts: {}, resources: {}, completions: {} },
        serverInfo: VI_SEMANTIC_MCP_SERVER_INFO
      });

    case 'notifications/initialized':
    case 'notifications/cancelled':
      // Notifications carry no id and expect no response.
      return null;

    case 'ping':
      return success(id, {});

    case 'tools/list':
      return success(id, { tools: VI_SEMANTIC_MCP_TOOLS });

    case 'prompts/list':
      return success(id, { prompts: VI_SEMANTIC_MCP_PROMPTS });

    case 'prompts/get': {
      const params = (message.params ?? {}) as { name?: unknown; arguments?: unknown };
      if (typeof params.name !== 'string') {
        return failure(id, JSON_RPC_INVALID_PARAMS, 'prompts/get requires a string "name"');
      }
      if (!KNOWN_PROMPT_NAMES.has(params.name)) {
        return failure(id, JSON_RPC_INVALID_PARAMS, `unknown prompt: ${params.name}`);
      }
      try {
        return success(id, renderPrompt(params.name, params.arguments));
      } catch (error) {
        return toArgumentFailure(id, error);
      }
    }

    case 'resources/list':
      return success(id, { resources: VI_SEMANTIC_MCP_RESOURCES });

    case 'resources/templates/list':
      return success(id, { resourceTemplates: VI_SEMANTIC_MCP_RESOURCE_TEMPLATES });

    case 'completion/complete': {
      const params = (message.params ?? {}) as { ref?: unknown; argument?: unknown };
      return success(id, { completion: completeArgument(params.ref, params.argument) });
    }

    case 'resources/read': {
      const params = (message.params ?? {}) as { uri?: unknown };
      if (typeof params.uri !== 'string') {
        return failure(id, JSON_RPC_INVALID_PARAMS, 'resources/read requires a string "uri"');
      }
      try {
        return success(id, { contents: [resolveResource(params.uri)] });
      } catch (error) {
        return toArgumentFailure(id, error);
      }
    }

    case 'tools/call': {
      const params = (message.params ?? {}) as {
        name?: unknown;
        arguments?: unknown;
      };
      if (typeof params.name !== 'string') {
        return failure(id, JSON_RPC_INVALID_PARAMS, 'tools/call requires a string "name"');
      }
      // Reject an unknown tool up front against the authoritative registry set,
      // so a name not published by tools/list can never reach a handler.
      if (!KNOWN_TOOL_NAMES.has(params.name)) {
        return failure(id, JSON_RPC_INVALID_PARAMS, `unknown tool: ${params.name}`);
      }
      if (ASYNC_ONLY_TOOL_NAMES.has(params.name)) {
        // These tools touch a runtime or the filesystem and are only available
        // through the async server entrypoint, which injects the orchestrators
        // (comparison runtimes) or the read-only cache inspector (filesystem).
        return success(
          id,
          toolTextResult(
            `Tool error: ${params.name} requires the async MCP server entrypoint`,
            true
          )
        );
      }
      try {
        return success(id, callTool(params.name, params.arguments));
      } catch (error) {
        // Argument-shape failures become a structured -32602 (Invalid params)
        // with field-level detail; genuine tool-execution failures stay in the
        // result envelope (isError) per MCP so the agent can read the message.
        return toArgumentFailure(id, error);
      }
    }

    default:
      return failure(id, JSON_RPC_METHOD_NOT_FOUND, `unknown method: ${message.method}`);
  }
}

function parseCompareRevisionsArguments(rawArguments: unknown): CompareViRevisionsInput {
  const args = requireArgumentsObject(rawArguments);
  const input: CompareViRevisionsInput = {
    repositoryRoot: requireStringArg(args, 'repositoryRoot'),
    relativePath: requireStringArg(args, 'relativePath'),
    baseHash: requireStringArg(args, 'baseHash'),
    selectedHash: requireStringArg(args, 'selectedHash')
  };
  const reportType = optionalEnumArg(args, 'reportType', REPORT_TYPE_VALUES);
  if (reportType !== undefined) {
    input.reportType = reportType;
  }
  if (typeof args.runtime === 'object' && args.runtime !== null) {
    input.runtime = args.runtime as CompareViRevisionsInput['runtime'];
  }
  return input;
}

function renderCompareResult(
  result: CompareViRevisionsResult,
  format: ViSemanticOutputFormat
): unknown {
  if (result.status !== 'completed') {
    return toolTextResult(`Comparison ${result.status}: ${result.reason}`, true);
  }
  if (format === 'markdown') {
    return toolTextResult(renderViSemanticComparisonMarkdown(result.model));
  }
  return toolTextResult(JSON.stringify(result.model, null, 2));
}

function parseHistoryArguments(rawArguments: unknown): ViSemanticHistoryInput {
  const args = requireArgumentsObject(rawArguments);
  const input: ViSemanticHistoryInput = {
    repositoryRoot: requireStringArg(args, 'repositoryRoot'),
    relativePath: requireStringArg(args, 'relativePath')
  };
  if (typeof args.maxRevisions === 'number') {
    input.maxRevisions = args.maxRevisions;
  }
  if (typeof args.runtime === 'object' && args.runtime !== null) {
    input.runtime = args.runtime as ViSemanticHistoryInput['runtime'];
  }
  return input;
}

function renderHistoryResult(
  history: ViSemanticHistory,
  format: ViSemanticOutputFormat
): unknown {
  if (format === 'markdown') {
    return toolTextResult(renderViSemanticHistoryMarkdown(history));
  }
  return toolTextResult(JSON.stringify(history, null, 2));
}

function parseRepositoryIndexArguments(rawArguments: unknown): ViRepositoryIndexInput {
  const args = requireArgumentsObject(rawArguments);
  const input: ViRepositoryIndexInput = { repositoryRoot: requireStringArg(args, 'repositoryRoot') };
  if (typeof args.maxVis === 'number') {
    input.maxVis = args.maxVis;
  }
  return input;
}

function renderRepositoryIndexResult(index: ViRepositoryIndex): unknown {
  return toolTextResult(JSON.stringify(index, null, 2));
}

function parsePrReviewArguments(rawArguments: unknown): ViSemanticPrReviewInput {
  const args = requireArgumentsObject(rawArguments);
  const input: ViSemanticPrReviewInput = {
    repositoryRoot: requireStringArg(args, 'repositoryRoot'),
    baseHash: requireStringArg(args, 'baseHash'),
    selectedHash: requireStringArg(args, 'selectedHash')
  };
  if (typeof args.maxVis === 'number') {
    input.maxVis = args.maxVis;
  }
  if (typeof args.runtime === 'object' && args.runtime !== null) {
    input.runtime = args.runtime as ViSemanticPrReviewInput['runtime'];
  }
  return input;
}

function renderPrReviewResult(
  review: ViSemanticPrReview,
  format: ViSemanticOutputFormat
): unknown {
  if (format === 'markdown') {
    return toolTextResult(renderViSemanticPrReviewMarkdown(review));
  }
  return toolTextResult(JSON.stringify(review, null, 2));
}

export interface ViSemanticMcpAsyncDeps {
  /**
   * Runtime orchestrator that invokes a real comparison. Injected by the stdio
   * entrypoint; when absent, `compare_vi_revisions` reports a wired-up error so
   * the pure handler never reaches the reporting engine on its own.
   */
  compareViRevisions?: (input: CompareViRevisionsInput) => Promise<CompareViRevisionsResult>;
  /**
   * History orchestrator that walks a VI's revisions and compares each adjacent
   * pair. Injected by the stdio entrypoint; when absent, `summarize_vi_history`
   * reports a wired-up error.
   */
  buildViSemanticHistory?: (input: ViSemanticHistoryInput) => Promise<ViSemanticHistory>;
  /**
   * Repository-index orchestrator that surveys a repo's tracked VIs (pure Git).
   * Injected by the stdio entrypoint; when absent, `index_repository_vis`
   * reports a wired-up error.
   */
  buildViRepositoryIndex?: (input: ViRepositoryIndexInput) => Promise<ViRepositoryIndex>;
  /**
   * PR-review orchestrator that compares every VI changed between two revisions
   * and aggregates a vi-history-suite/vi-semantic-pr-review@v1 review. Injected
   * by the stdio entrypoint; when absent, `build_vi_pr_review` reports a
   * wired-up error.
   */
  buildViSemanticPrReview?: (input: ViSemanticPrReviewInput) => Promise<ViSemanticPrReview>;
  /**
   * Read-only preview-cache inspector (filesystem). Injected by the stdio
   * entrypoint with a node-fs adapter; when absent, the `*_preview_cache` tools
   * report a wired-up error. Keeps the reporting/fs boundary out of the pure
   * handler (VHS-REQ-659).
   */
  previewCacheInspector?: ViPreviewCacheInspectorDeps;
  /**
   * Read-only runtime-health resolver. Resolves the comparison runtime (never
   * running a comparison) and projects a compact {@link ViRuntimeHealth}
   * snapshot. Injected by the stdio entrypoint; when absent,
   * `get_runtime_health` reports a wired-up error.
   */
  resolveRuntimeHealth?: (input: RuntimeHealthInput) => Promise<ViRuntimeHealth>;
  /**
   * Read-only preview-diagnostics collector. Bundles runtime resolution, Docker
   * probing, and optional cache statistics into a preview-diagnostics@v1
   * snapshot (never renders). Injected by the stdio entrypoint; when absent,
   * `get_preview_diagnostics` reports a wired-up error.
   */
  collectPreviewDiagnostics?: (
    input: CollectViPreviewDiagnosticsOptions
  ) => Promise<ViPreviewDiagnosticsSnapshot>;
  /**
   * Read-only changed-VI lister. Lists the VI source files changed between two
   * Git revisions (pure Git; never renders). Injected by the stdio entrypoint;
   * when absent, `list_changed_vis` reports a wired-up error.
   */
  listChangedVis?: (input: ChangedVisInput) => Promise<ViChangedVis>;
}

/** Injected read-only preview-cache inspection surface for the MCP tools. */
export interface ViPreviewCacheInspectorDeps {
  list: (cacheDirectory: string) => Promise<ViPreviewCacheEntry[]>;
  summarize: (cacheDirectory: string) => Promise<ViPreviewCacheSummary>;
  search: (
    cacheDirectory: string,
    marker: ViPreviewCacheSearchMarker
  ) => Promise<ViPreviewCacheEntry[]>;
  get: (
    cacheDirectory: string,
    key: string,
    options: { includeHtml?: boolean }
  ) => Promise<ViPreviewCacheEntryDocument | undefined>;
}

async function invokeInjectedTool<TInput, TResult>(
  id: JsonRpcSuccess['id'],
  toolName: string,
  orchestrator: ((input: TInput) => Promise<TResult>) | undefined,
  parseArguments: () => TInput,
  render: (result: TResult) => unknown
): Promise<JsonRpcResponse> {
  if (!orchestrator) {
    return success(
      id,
      toolTextResult(`Tool error: ${toolName} is not wired (no orchestrator injected)`, true)
    );
  }
  let input: TInput;
  try {
    input = parseArguments();
  } catch (error) {
    // Argument-shape failures become a structured -32602; other parse errors
    // fall through to the isError envelope via toArgumentFailure.
    return toArgumentFailure(id, error);
  }
  try {
    const result = await orchestrator(input);
    return success(id, render(result));
  } catch (error) {
    const detail = errorMessage(error);
    return success(id, toolTextResult(`Tool error: ${detail}`, true));
  }
}

/**
 * Async JSON-RPC dispatcher. Handles the side-effecting invoking tools
 * (`compare_vi_revisions`, `summarize_vi_history`, `index_repository_vis`,
 * `build_vi_pr_review`) through injected orchestrators and delegates every
 * other method to the pure, synchronous `handleViSemanticMcpMessage`.
 */
export async function handleViSemanticMcpMessageAsync(
  message: JsonRpcRequest,
  deps: ViSemanticMcpAsyncDeps = {}
): Promise<JsonRpcResponse | null> {
  if (message.method === 'tools/call') {
    const params = (message.params ?? {}) as { name?: unknown; arguments?: unknown };
    const id = message.id ?? null;
    const format = readOutputFormat(params.arguments);
    if (params.name === 'compare_vi_revisions') {
      return invokeInjectedTool(
        id,
        'compare_vi_revisions',
        deps.compareViRevisions,
        () => parseCompareRevisionsArguments(params.arguments),
        (result) => renderCompareResult(result, format)
      );
    }
    if (params.name === 'summarize_vi_history') {
      return invokeInjectedTool(
        id,
        'summarize_vi_history',
        deps.buildViSemanticHistory,
        () => parseHistoryArguments(params.arguments),
        (history) => renderHistoryResult(history, format)
      );
    }
    if (params.name === 'index_repository_vis') {
      return invokeInjectedTool(
        id,
        'index_repository_vis',
        deps.buildViRepositoryIndex,
        () => parseRepositoryIndexArguments(params.arguments),
        renderRepositoryIndexResult
      );
    }
    if (params.name === 'build_vi_pr_review') {
      return invokeInjectedTool(
        id,
        'build_vi_pr_review',
        deps.buildViSemanticPrReview,
        () => parsePrReviewArguments(params.arguments),
        (review) => renderPrReviewResult(review, format)
      );
    }
    if (
      params.name === 'list_preview_cache' ||
      params.name === 'summarize_preview_cache' ||
      params.name === 'diagnose_preview_cache' ||
      params.name === 'search_preview_cache' ||
      params.name === 'get_preview_cache_entry'
    ) {
      return handlePreviewCacheTool(id, params.name, params.arguments, deps.previewCacheInspector);
    }
    if (params.name === 'get_runtime_health') {
      return invokeInjectedTool(
        id,
        'get_runtime_health',
        deps.resolveRuntimeHealth,
        () => parseRuntimeHealthArguments(params.arguments),
        (health) => toolTextResult(JSON.stringify(health, null, 2))
      );
    }
    if (params.name === 'get_preview_diagnostics') {
      return invokeInjectedTool(
        id,
        'get_preview_diagnostics',
        deps.collectPreviewDiagnostics,
        () => parsePreviewDiagnosticsArguments(params.arguments),
        (snapshot) => toolTextResult(JSON.stringify(snapshot, null, 2))
      );
    }
    if (params.name === 'list_changed_vis') {
      return invokeInjectedTool(
        id,
        'list_changed_vis',
        deps.listChangedVis,
        () => parseChangedVisArguments(params.arguments),
        (changed) => toolTextResult(JSON.stringify(changed, null, 2))
      );
    }
  }
  if (message.method === 'resources/read') {
    const params = (message.params ?? {}) as { uri?: unknown };
    // The fs-backed preview-cache resource template is read through the injected
    // inspector; schema resources stay on the pure synchronous path below.
    if (typeof params.uri === 'string' && params.uri.startsWith(PREVIEW_CACHE_RESOURCE_PREFIX)) {
      return handlePreviewCacheResourceRead(message.id ?? null, params.uri, deps.previewCacheInspector);
    }
  }
  return handleViSemanticMcpMessage(message);
}

async function handlePreviewCacheResourceRead(
  id: JsonRpcSuccess['id'],
  uri: string,
  inspector: ViPreviewCacheInspectorDeps | undefined
): Promise<JsonRpcResponse> {
  if (!inspector) {
    return failure(
      id,
      JSON_RPC_INVALID_PARAMS,
      'preview-cache resource read requires the async MCP server entrypoint (no inspector injected)'
    );
  }
  try {
    const { cacheDirectory, key } = parsePreviewCacheResourceUri(uri);
    const entry = await inspector.get(cacheDirectory, key, { includeHtml: true });
    if (!entry || typeof entry.html !== 'string') {
      return failure(id, JSON_RPC_INVALID_PARAMS, `preview-cache resource not found: ${uri}`, {
        issues: [{ field: 'uri', expected: 'an existing preview-cache entry', received: 'missing' }]
      });
    }
    return success(id, { contents: [{ uri, mimeType: 'text/html', text: entry.html }] });
  } catch (error) {
    return toArgumentFailure(id, error);
  }
}

const RUNTIME_PLATFORM_VALUES = ['win32', 'linux', 'darwin'] as const;
const REPORT_TYPE_VALUES = ['diff', 'print'] as const;
const PREVIEW_CACHE_MARKERS: readonly ViPreviewCacheSearchMarker[] = [
  'error',
  'interactive',
  'image',
  'empty',
  'fallback'
];

function parseRuntimeHealthArguments(rawArguments: unknown): RuntimeHealthInput {
  if (rawArguments === undefined || rawArguments === null) {
    return {};
  }
  const args = requireArgumentsObject(rawArguments);
  const input: RuntimeHealthInput = {};
  if (args.platform !== undefined) {
    input.platform = requireEnumArg(args, 'platform', RUNTIME_PLATFORM_VALUES);
  }
  if (args.settings !== undefined) {
    input.settings = requireObjectArg(args, 'settings') as ComparisonRuntimeSettings;
  }
  return input;
}

function parseChangedVisArguments(rawArguments: unknown): ChangedVisInput {
  const args = requireArgumentsObject(rawArguments);
  return {
    repositoryRoot: requireStringArg(args, 'repositoryRoot'),
    baseHash: requireStringArg(args, 'baseHash'),
    selectedHash: requireStringArg(args, 'selectedHash')
  };
}

function parsePreviewDiagnosticsArguments(rawArguments: unknown): CollectViPreviewDiagnosticsOptions {
  if (rawArguments === undefined || rawArguments === null) {
    return {};
  }  const args = requireArgumentsObject(rawArguments);
  const options: CollectViPreviewDiagnosticsOptions = {};
  if (args.cacheDirectory !== undefined) {
    options.cacheDirectory = requireStringArg(args, 'cacheDirectory');
  }
  if (args.processPlatform !== undefined) {
    options.processPlatform = requireEnumArg(args, 'processPlatform', RUNTIME_PLATFORM_VALUES);
  }
  if (args.settings !== undefined) {
    options.settings = requireObjectArg(args, 'settings') as ComparisonRuntimeSettings;
  }
  if (args.connectTimeoutSeconds !== undefined) {
    options.connectTimeoutSeconds = requireFiniteNumberArg(args, 'connectTimeoutSeconds');
  }
  return options;
}

function requireCacheDirectory(rawArguments: unknown): { cacheDirectory: string; args: Record<string, unknown> } {
  const args = requireArgumentsObject(rawArguments);
  const cacheDirectory = requireStringArg(args, 'cacheDirectory');
  return { cacheDirectory, args };
}

const PREVIEW_CACHE_DIAGNOSTICS_SCHEMA = 'vi-history-suite/preview-cache-diagnostics@v1';

async function handlePreviewCacheTool(
  id: JsonRpcSuccess['id'],
  name: string,
  rawArguments: unknown,
  inspector: ViPreviewCacheInspectorDeps | undefined
): Promise<JsonRpcResponse> {
  if (!inspector) {
    return success(
      id,
      toolTextResult(`Tool error: ${name} is not wired (no preview-cache inspector injected)`, true)
    );
  }
  try {
    const { cacheDirectory, args } = requireCacheDirectory(rawArguments);
    if (name === 'list_preview_cache') {
      const entries = await inspector.list(cacheDirectory);
      return success(id, toolTextResult(JSON.stringify({ cacheDirectory, entries }, null, 2)));
    }
    if (name === 'summarize_preview_cache') {
      const summary = await inspector.summarize(cacheDirectory);
      return success(id, toolTextResult(JSON.stringify(summary, null, 2)));
    }
    if (name === 'diagnose_preview_cache') {
      const summary = await inspector.summarize(cacheDirectory);
      const diagnostics = {
        schema: PREVIEW_CACHE_DIAGNOSTICS_SCHEMA,
        cacheDirectory,
        entryCount: summary.entryCount,
        totalBytes: summary.totalBytes,
        healthyCount: summary.healthyCount,
        flaggedCount: summary.flaggedCount,
        interactiveCount: summary.interactiveCount,
        healthy: summary.entryCount > 0 && summary.flaggedCount === 0,
        newestModifiedAt: summary.newestModifiedAt,
        flagged: summary.flagged
      };
      return success(id, toolTextResult(JSON.stringify(diagnostics, null, 2)));
    }
    if (name === 'search_preview_cache') {
      const marker = requireEnumArg(args, 'marker', PREVIEW_CACHE_MARKERS);
      const entries = await inspector.search(cacheDirectory, marker);
      return success(id, toolTextResult(JSON.stringify({ cacheDirectory, marker, entries }, null, 2)));
    }
    // get_preview_cache_entry
    const key = requireStringArg(args, 'key');
    const includeHtml = args.includeHtml === true;
    const entry = await inspector.get(cacheDirectory, key, { includeHtml });
    if (!entry) {
      return success(id, toolTextResult(`Tool error: no cache entry for key ${key}`, true));
    }
    return success(id, toolTextResult(JSON.stringify(entry, null, 2)));
  } catch (error) {
    return toArgumentFailure(id, error);
  }
}
