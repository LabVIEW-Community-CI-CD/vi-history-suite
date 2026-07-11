import {
  buildViSemanticComparisonModelFromHtml,
  ViSemanticRevisionFacts,
  ViSemanticRuntimeFacts,
  VI_SEMANTIC_COMPARISON_SCHEMA
} from './viSemanticModel';

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
