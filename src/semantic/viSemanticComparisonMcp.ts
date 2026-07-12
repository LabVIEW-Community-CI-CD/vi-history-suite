import {
  buildViSemanticComparisonModelFromHtml,
  ViSemanticRevisionFacts,
  ViSemanticRuntimeFacts,
  VI_SEMANTIC_COMPARISON_SCHEMA
} from './viSemanticModel';
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
  version: '0.1.0'
} as const;

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

export const VI_SEMANTIC_MCP_TOOLS = [
  {
    name: 'summarize_vi_comparison',
    description:
      'Return a concise, human- and agent-readable "what changed" narrative for a LabVIEW VI comparison report.',
    inputSchema: COMPARISON_INPUT_SCHEMA
  },
  {
    name: 'get_vi_semantic_comparison',
    description: `Return the full ${VI_SEMANTIC_COMPARISON_SCHEMA} semantic model (changed surfaces, attributes, detail sections, totals, and narrative) for a LabVIEW VI comparison report.`,
    inputSchema: COMPARISON_INPUT_SCHEMA
  },
  {
    name: 'compare_vi_revisions',
    description:
      'Invoke a LabVIEW comparison between two Git revisions of a VI and return the full ' +
      `${VI_SEMANTIC_COMPARISON_SCHEMA} semantic model. Requires a comparison runtime ` +
      '(host LabVIEW or a Docker LabVIEW image) to be available; a run may take minutes.',
    inputSchema: COMPARE_REVISIONS_INPUT_SCHEMA
  },
  {
    name: 'summarize_vi_history',
    description:
      "Walk a VI's recent Git revisions and invoke a comparison across each adjacent pair, " +
      'returning a vi-history-suite/vi-semantic-history@v1 evolution timeline (per-transition ' +
      'narratives plus an aggregate story). Requires a comparison runtime; a run may take several minutes.',
    inputSchema: HISTORY_INPUT_SCHEMA
  },
  {
    name: 'index_repository_vis',
    description:
      "Survey a Git repository's tracked VIs and return a vi-history-suite/vi-repository-index@v1 " +
      'index (each VI with its revision count and latest change, activity-ranked). Pure Git; no ' +
      'comparison runtime required.',
    inputSchema: REPOSITORY_INDEX_INPUT_SCHEMA
  },
  {
    name: 'build_vi_pr_review',
    description:
      'Review a pull request by comparing every LabVIEW VI changed between two Git revisions ' +
      'and returning a vi-history-suite/vi-semantic-pr-review@v1 review (a per-VI what-changed ' +
      'summary plus an aggregate narrative). Request the markdown format to get a review-ready, ' +
      'sticky PR-comment body. Requires a comparison runtime; a run may take several minutes.',
    inputSchema: PR_REVIEW_INPUT_SCHEMA
  },
  {
    name: 'get_vi_semantic_schema',
    description:
      'Return the published JSON Schema(s) for the vi-history-suite semantic models ' +
      '(comparison, history, repository index) - the open, versioned VI-diff standard. ' +
      'Omit "schema" to receive all.',
    inputSchema: SCHEMA_DISCOVERY_INPUT_SCHEMA
  },
  {
    name: 'validate_vi_semantic_document',
    description:
      'Validate a self-describing semantic document against its published JSON Schema; ' +
      'returns { valid, errors }.',
    inputSchema: DOCUMENT_VALIDATION_INPUT_SCHEMA
  }
] as const;

function success(id: JsonRpcSuccess['id'], result: unknown): JsonRpcSuccess {
  return { jsonrpc: '2.0', id, result };
}

function failure(
  id: JsonRpcError['id'],
  code: number,
  message: string
): JsonRpcError {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function toolTextResult(text: string, isError = false): unknown {
  return { content: [{ type: 'text', text }], isError };
}

function parseComparisonArguments(rawArguments: unknown): ViComparisonToolArguments {
  if (typeof rawArguments !== 'object' || rawArguments === null) {
    throw new Error('tool arguments must be an object');
  }
  const args = rawArguments as Record<string, unknown>;
  if (typeof args.reportHtml !== 'string' || args.reportHtml.length === 0) {
    throw new Error('reportHtml is required and must be a non-empty string');
  }
  return {
    reportHtml: args.reportHtml,
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
      throw new Error(`unknown schema: ${args.schema}`);
    }
    return toolTextResult(JSON.stringify(schema, null, 2));
  }
  return toolTextResult(JSON.stringify(VI_SEMANTIC_SCHEMAS, null, 2));
}

function callValidateTool(rawArguments: unknown): unknown {
  if (typeof rawArguments !== 'object' || rawArguments === null || !('document' in rawArguments)) {
    throw new Error('document is required');
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

  if (name === 'summarize_vi_comparison') {
    return toolTextResult(model.narrative);
  }
  if (args.format === 'markdown') {
    return toolTextResult(renderViSemanticComparisonMarkdown(model));
  }
  return toolTextResult(JSON.stringify(model, null, 2));
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
        capabilities: { tools: {} },
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

    case 'tools/call': {
      const params = (message.params ?? {}) as {
        name?: unknown;
        arguments?: unknown;
      };
      if (typeof params.name !== 'string') {
        return failure(id, JSON_RPC_INVALID_PARAMS, 'tools/call requires a string "name"');
      }
      if (
        params.name === 'compare_vi_revisions' ||
        params.name === 'summarize_vi_history' ||
        params.name === 'index_repository_vis' ||
        params.name === 'build_vi_pr_review'
      ) {
        // These invoking tools run real comparisons and are only available
        // through the async server entrypoint, which injects the orchestrators.
        return success(
          id,
          toolTextResult(
            `Tool error: ${params.name} requires the async MCP server entrypoint`,
            true
          )
        );
      }
      if (
        params.name !== 'summarize_vi_comparison' &&
        params.name !== 'get_vi_semantic_comparison' &&
        params.name !== 'get_vi_semantic_schema' &&
        params.name !== 'validate_vi_semantic_document'
      ) {
        return failure(id, JSON_RPC_INVALID_PARAMS, `unknown tool: ${params.name}`);
      }
      try {
        return success(id, callTool(params.name, params.arguments));
      } catch (error) {
        // Tool-level failures are reported through the result envelope (isError)
        // per MCP, not as protocol errors, so the agent can read the message.
        const detail = error instanceof Error ? error.message : String(error);
        return success(id, toolTextResult(`Tool error: ${detail}`, true));
      }
    }

    default:
      return failure(id, JSON_RPC_METHOD_NOT_FOUND, `unknown method: ${message.method}`);
  }
}

function parseCompareRevisionsArguments(rawArguments: unknown): CompareViRevisionsInput {
  if (typeof rawArguments !== 'object' || rawArguments === null) {
    throw new Error('tool arguments must be an object');
  }
  const args = rawArguments as Record<string, unknown>;
  const requireString = (key: string): string => {
    const value = args[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${key} is required and must be a non-empty string`);
    }
    return value;
  };
  const input: CompareViRevisionsInput = {
    repositoryRoot: requireString('repositoryRoot'),
    relativePath: requireString('relativePath'),
    baseHash: requireString('baseHash'),
    selectedHash: requireString('selectedHash')
  };
  if (typeof args.reportType === 'string') {
    input.reportType = args.reportType as CompareViRevisionsInput['reportType'];
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
  if (typeof rawArguments !== 'object' || rawArguments === null) {
    throw new Error('tool arguments must be an object');
  }
  const args = rawArguments as Record<string, unknown>;
  const requireString = (key: string): string => {
    const value = args[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${key} is required and must be a non-empty string`);
    }
    return value;
  };
  const input: ViSemanticHistoryInput = {
    repositoryRoot: requireString('repositoryRoot'),
    relativePath: requireString('relativePath')
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
  if (typeof rawArguments !== 'object' || rawArguments === null) {
    throw new Error('tool arguments must be an object');
  }
  const args = rawArguments as Record<string, unknown>;
  if (typeof args.repositoryRoot !== 'string' || args.repositoryRoot.length === 0) {
    throw new Error('repositoryRoot is required and must be a non-empty string');
  }
  const input: ViRepositoryIndexInput = { repositoryRoot: args.repositoryRoot };
  if (typeof args.maxVis === 'number') {
    input.maxVis = args.maxVis;
  }
  return input;
}

function renderRepositoryIndexResult(index: ViRepositoryIndex): unknown {
  return toolTextResult(JSON.stringify(index, null, 2));
}

function parsePrReviewArguments(rawArguments: unknown): ViSemanticPrReviewInput {
  if (typeof rawArguments !== 'object' || rawArguments === null) {
    throw new Error('tool arguments must be an object');
  }
  const args = rawArguments as Record<string, unknown>;
  const requireString = (key: string): string => {
    const value = args[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${key} is required and must be a non-empty string`);
    }
    return value;
  };
  const input: ViSemanticPrReviewInput = {
    repositoryRoot: requireString('repositoryRoot'),
    baseHash: requireString('baseHash'),
    selectedHash: requireString('selectedHash')
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
  try {
    const result = await orchestrator(parseArguments());
    return success(id, render(result));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
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
  }
  return handleViSemanticMcpMessage(message);
}
