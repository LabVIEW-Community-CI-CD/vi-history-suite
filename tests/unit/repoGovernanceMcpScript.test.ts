import { describe, expect, it } from 'vitest';

// VHS-REQ-693 (epic #2144): repo-governance MCP server. Deterministic unit tests
// of the pure JSON-RPC handler with an injected read-model builder — no real gh,
// no subprocess.

const {
  REPO_GOVERNANCE_MCP_PROTOCOL_VERSION,
  REPO_GOVERNANCE_MCP_TOOLS,
  GET_REPO_TRUTH_TOOL,
  REPO_TRUTH_AUTH_ERROR_CODE,
  handleRepoGovernanceMcpMessage
} = require('../../scripts/repoGovernanceMcp.js') as {
  REPO_GOVERNANCE_MCP_PROTOCOL_VERSION: string;
  REPO_GOVERNANCE_MCP_TOOLS: Array<{ name: string }>;
  GET_REPO_TRUTH_TOOL: { name: string };
  REPO_TRUTH_AUTH_ERROR_CODE: number;
  handleRepoGovernanceMcpMessage: (
    message: Record<string, unknown>,
    deps?: Record<string, unknown>
  ) => { jsonrpc: string; id: unknown; result?: Record<string, unknown>; error?: { code: number; message: string } } | null;
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
});
