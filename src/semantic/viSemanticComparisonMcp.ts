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

interface ViComparisonToolArguments {
  reportHtml: string;
  reportFilePath?: string;
  revisions?: ViSemanticRevisionFacts;
  runtime?: ViSemanticRuntimeFacts;
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
    }
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
    }
  },
  required: ['repositoryRoot', 'relativePath', 'baseHash', 'selectedHash']
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
    runtime: (args.runtime as ViSemanticRuntimeFacts | undefined) ?? undefined
  };
}

function callTool(name: string, rawArguments: unknown): unknown {
  const args = parseComparisonArguments(rawArguments);
  const model = buildViSemanticComparisonModelFromHtml(args.reportHtml, {
    reportFilePath: args.reportFilePath,
    revisions: args.revisions,
    runtime: args.runtime
  });

  if (name === 'summarize_vi_comparison') {
    return toolTextResult(model.narrative);
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
      if (params.name === 'compare_vi_revisions') {
        // The invoking tool runs a real comparison and is only available through
        // the async server entrypoint, which injects the runtime orchestrator.
        return success(
          id,
          toolTextResult(
            'Tool error: compare_vi_revisions requires the async MCP server entrypoint',
            true
          )
        );
      }
      if (
        params.name !== 'summarize_vi_comparison' &&
        params.name !== 'get_vi_semantic_comparison'
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

function renderCompareResult(result: CompareViRevisionsResult): unknown {
  if (result.status === 'completed') {
    return toolTextResult(JSON.stringify(result.model, null, 2));
  }
  return toolTextResult(`Comparison ${result.status}: ${result.reason}`, true);
}

export interface ViSemanticMcpAsyncDeps {
  /**
   * Runtime orchestrator that invokes a real comparison. Injected by the stdio
   * entrypoint; when absent, `compare_vi_revisions` reports a wired-up error so
   * the pure handler never reaches the reporting engine on its own.
   */
  compareViRevisions?: (input: CompareViRevisionsInput) => Promise<CompareViRevisionsResult>;
}

/**
 * Async JSON-RPC dispatcher. Handles the side-effecting `compare_vi_revisions`
 * tool through the injected orchestrator and delegates every other method to the
 * pure, synchronous `handleViSemanticMcpMessage`.
 */
export async function handleViSemanticMcpMessageAsync(
  message: JsonRpcRequest,
  deps: ViSemanticMcpAsyncDeps = {}
): Promise<JsonRpcResponse | null> {
  if (message.method === 'tools/call') {
    const params = (message.params ?? {}) as { name?: unknown; arguments?: unknown };
    if (params.name === 'compare_vi_revisions') {
      const id = message.id ?? null;
      if (!deps.compareViRevisions) {
        return success(
          id,
          toolTextResult(
            'Tool error: compare_vi_revisions is not wired (no runtime orchestrator injected)',
            true
          )
        );
      }
      try {
        const input = parseCompareRevisionsArguments(params.arguments);
        const result = await deps.compareViRevisions(input);
        return success(id, renderCompareResult(result));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return success(id, toolTextResult(`Tool error: ${detail}`, true));
      }
    }
  }
  return handleViSemanticMcpMessage(message);
}
