#!/usr/bin/env node
import {
  handleViSemanticMcpMessageAsync,
  JsonRpcRequest
} from '../semantic/viSemanticComparisonMcp';
import { compareViRevisions } from '../semantic/compareViRevisions';
import { buildViSemanticHistory } from '../semantic/viSemanticHistory';

/**
 * Stdio transport for the VI semantic MCP server: newline-delimited JSON-RPC
 * 2.0 on stdin/stdout, diagnostics on stderr (matching the MCP stdio
 * convention). All protocol logic lives in the pure, unit-tested
 * `handleViSemanticMcpMessage`; this entrypoint only wires the streams and is
 * excluded from coverage like the other host bindings.
 */
function writeResponse(response: unknown): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

async function dispatchLine(line: string): Promise<void> {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return;
  }

  let message: JsonRpcRequest;
  try {
    message = JSON.parse(trimmed) as JsonRpcRequest;
  } catch {
    writeResponse({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'parse error' }
    });
    return;
  }

  // The orchestrators are injected here (not imported by the pure handler) so
  // the invoking tools can run real comparisons from this entrypoint.
  const response = await handleViSemanticMcpMessageAsync(message, {
    compareViRevisions,
    buildViSemanticHistory
  });
  if (response !== null) {
    writeResponse(response);
  }
}

function dispatchLineSafely(line: string): void {
  void dispatchLine(line).catch((error: unknown) => {
    process.stderr.write(
      `dispatch error: ${error instanceof Error ? error.message : String(error)}\n`
    );
  });
}

export function runViSemanticMcpServer(): void {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      // Fire-and-forget: a multi-minute compare must not block pings or other
      // tool calls; responses are matched by JSON-RPC id.
      dispatchLineSafely(line);
      newlineIndex = buffer.indexOf('\n');
    }
  });
  process.stdin.on('end', () => {
    if (buffer.trim().length > 0) {
      dispatchLineSafely(buffer);
    }
  });
  process.stderr.write(
    'vi-history-suite semantic MCP server ready (stdio, newline-delimited JSON-RPC)\n'
  );
}

if (require.main === module) {
  runViSemanticMcpServer();
}
