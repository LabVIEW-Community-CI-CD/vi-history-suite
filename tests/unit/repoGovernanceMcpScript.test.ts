import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';

// VHS-REQ-693 (epic #2144): repo-governance MCP server. Deterministic unit tests
// of the pure JSON-RPC handler with an injected read-model builder — no real gh,
// no subprocess.

const {
  REPO_GOVERNANCE_MCP_PROTOCOL_VERSION,
  REPO_GOVERNANCE_MCP_TOOLS,
  GET_REPO_TRUTH_TOOL,
  REPO_TRUTH_AUTH_ERROR_CODE,
  handleRepoGovernanceMcpMessage,
  runRepoGovernanceMcpStdioServer
} = require('../../scripts/repoGovernanceMcp.js') as {
  REPO_GOVERNANCE_MCP_PROTOCOL_VERSION: string;
  REPO_GOVERNANCE_MCP_TOOLS: Array<{ name: string }>;
  GET_REPO_TRUTH_TOOL: { name: string };
  REPO_TRUTH_AUTH_ERROR_CODE: number;
  handleRepoGovernanceMcpMessage: (
    message: Record<string, unknown>,
    deps?: Record<string, unknown>
  ) => { jsonrpc: string; id: unknown; result?: Record<string, unknown>; error?: { code: number; message: string } } | null;
  runRepoGovernanceMcpStdioServer: (deps?: Record<string, unknown>) => void;
};

class FakeAuthError extends Error {
  authFailure = true;
}

const FAKE_PACKET = { $schema: 'x', schemaVersion: 1, domains: { mergeQueue: { policy: { present: true } } } };

function deps(overrides: Record<string, unknown> = {}) {
  return {
    buildRepoTruthPacket: () => FAKE_PACKET,
    RepoTruthAuthError: FakeAuthError,
    ...overrides
  };
}

describe('repoGovernanceMcp handler (VHS-REQ-693.1)', () => {
  it('responds to initialize with the protocol version and server info', () => {
    const r = handleRepoGovernanceMcpMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' }, deps());
    expect(r?.result?.protocolVersion).toBe(REPO_GOVERNANCE_MCP_PROTOCOL_VERSION);
    expect((r?.result as Record<string, unknown>).serverInfo).toBeDefined();
  });

  it('lists the get_repo_truth tool', () => {
    const r = handleRepoGovernanceMcpMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, deps());
    const tools = (r?.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.map((t) => t.name)).toEqual([GET_REPO_TRUTH_TOOL.name]);
    expect(REPO_GOVERNANCE_MCP_TOOLS).toHaveLength(1);
  });

  it('returns null for notifications (no response expected)', () => {
    expect(handleRepoGovernanceMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, deps())).toBeNull();
  });

  it('answers ping', () => {
    expect(handleRepoGovernanceMcpMessage({ jsonrpc: '2.0', id: 3, method: 'ping' }, deps())?.result).toEqual({});
  });
});

describe('repoGovernanceMcp get_repo_truth tool (VHS-REQ-693.2)', () => {
  it('returns the read-model packet as text content', () => {
    const r = handleRepoGovernanceMcpMessage(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_repo_truth', arguments: {} } },
      deps()
    );
    const content = (r?.result as { content: Array<{ type: string; text: string }>; isError: boolean });
    expect(content.isError).toBe(false);
    expect(JSON.parse(content.content[0].text)).toEqual(FAKE_PACKET);
  });

  it('threads repo/branch arguments into the read-model builder', () => {
    let received: Record<string, unknown> | undefined;
    handleRepoGovernanceMcpMessage(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_repo_truth', arguments: { repo: 'o/r', branch: 'main' } } },
      deps({ buildRepoTruthPacket: (options: Record<string, unknown>) => { received = options; return FAKE_PACKET; } })
    );
    expect(received).toEqual({ repo: 'o/r', branch: 'main' });
  });

  it('fails closed with an application error when the read-model raises an auth failure', () => {
    const r = handleRepoGovernanceMcpMessage(
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_repo_truth', arguments: {} } },
      deps({ buildRepoTruthPacket: () => { throw new FakeAuthError('gh unauthenticated'); } })
    );
    expect(r?.error?.code).toBe(REPO_TRUTH_AUTH_ERROR_CODE);
    expect(r?.error?.message).toContain('failed closed');
    expect(r?.result).toBeUndefined();
  });

  it('rejects an unknown tool name', () => {
    const r = handleRepoGovernanceMcpMessage(
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'nope' } },
      deps()
    );
    expect(r?.error?.code).toBe(-32601);
  });

  it('rejects a tools/call without a string name', () => {
    const r = handleRepoGovernanceMcpMessage(
      { jsonrpc: '2.0', id: 8, method: 'tools/call', params: {} },
      deps()
    );
    expect(r?.error?.code).toBe(-32602);
  });

  it('rejects an unknown method', () => {
    const r = handleRepoGovernanceMcpMessage({ jsonrpc: '2.0', id: 9, method: 'frobnicate' }, deps());
    expect(r?.error?.code).toBe(-32601);
  });

  it('re-throws a non-auth read-model error unchanged (not wrapped as an auth failure)', () => {
    // The error is neither an AuthError instance nor authFailure:true, so the
    // handler must propagate it rather than convert it to a JSON-RPC auth error.
    expect(() =>
      handleRepoGovernanceMcpMessage(
        { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'get_repo_truth', arguments: {} } },
        deps({ buildRepoTruthPacket: () => { throw new Error('unexpected read-model boom'); } })
      )
    ).toThrow('unexpected read-model boom');
  });
});

class FakeStdin extends EventEmitter {
  encoding: string | undefined;
  setEncoding(enc: string): this {
    this.encoding = enc;
    return this;
  }
}

function stdioHarness(handleMessage?: (msg: Record<string, unknown>) => unknown) {
  const stdin = new FakeStdin();
  const writes: string[] = [];
  const stdout = { write: (s: string) => (writes.push(s), true) };
  runRepoGovernanceMcpStdioServer({ stdin, stdout, ...(handleMessage ? { handleMessage } : {}) });
  return { stdin, writes };
}

describe('repoGovernanceMcp stdio server (VHS-REQ-693.1)', () => {
  // A deterministic in-memory handler keeps the framing loop isolated from the
  // JSON-RPC logic (which is unit-tested above) and away from any real read-model.
  const echo = (msg: Record<string, unknown>) =>
    msg.method === 'note' ? null : { jsonrpc: '2.0', id: msg.id, result: { echoed: msg.method } };

  it('sets the input encoding to utf8', () => {
    const { stdin } = stdioHarness(echo);
    expect(stdin.encoding).toBe('utf8');
  });

  it('writes one response line per newline-delimited request in a single chunk', () => {
    const { stdin, writes } = stdioHarness(echo);
    stdin.emit('data', '{"jsonrpc":"2.0","id":1,"method":"a"}\n{"jsonrpc":"2.0","id":2,"method":"b"}\n');
    expect(writes).toHaveLength(2);
    expect(JSON.parse(writes[0])).toMatchObject({ id: 1, result: { echoed: 'a' } });
    expect(JSON.parse(writes[1])).toMatchObject({ id: 2, result: { echoed: 'b' } });
  });

  it('reassembles a request split across two data chunks', () => {
    const { stdin, writes } = stdioHarness(echo);
    stdin.emit('data', '{"jsonrpc":"2.0","id":3,');
    expect(writes).toHaveLength(0);
    stdin.emit('data', '"method":"c"}\n');
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0])).toMatchObject({ id: 3, result: { echoed: 'c' } });
  });

  it('writes nothing for a blank line or a null (notification) response', () => {
    const { stdin, writes } = stdioHarness(echo);
    stdin.emit('data', '\n');
    stdin.emit('data', '{"jsonrpc":"2.0","method":"note"}\n');
    expect(writes).toHaveLength(0);
  });

  it('answers a malformed JSON line with a JSON-RPC -32700 parse error', () => {
    const { stdin, writes } = stdioHarness(echo);
    stdin.emit('data', 'this is not json\n');
    expect(writes).toHaveLength(1);
    const response = JSON.parse(writes[0]);
    expect(response.error.code).toBe(-32700);
    expect(response.error.message).toContain('Parse error');
  });

  it('defaults to the real handler when none is injected (initialize round-trips)', () => {
    const { stdin, writes } = stdioHarness();
    stdin.emit('data', '{"jsonrpc":"2.0","id":9,"method":"initialize"}\n');
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]).result.protocolVersion).toBe(REPO_GOVERNANCE_MCP_PROTOCOL_VERSION);
  });
});
