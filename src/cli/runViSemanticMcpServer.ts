#!/usr/bin/env node
import {
  handleViSemanticMcpMessage,
  JsonRpcRequest
} from '../semantic/viSemanticComparisonMcp';

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

function dispatchLine(line: string): void {
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

  const response = handleViSemanticMcpMessage(message);
  if (response !== null) {
    writeResponse(response);
  }
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
      dispatchLine(line);
      newlineIndex = buffer.indexOf('\n');
    }
  });
  process.stdin.on('end', () => {
    if (buffer.trim().length > 0) {
      dispatchLine(buffer);
    }
  });
  process.stderr.write(
    'vi-history-suite semantic MCP server ready (stdio, newline-delimited JSON-RPC)\n'
  );
}

if (require.main === module) {
  runViSemanticMcpServer();
}
