#!/usr/bin/env node

'use strict';

// VHS-REQ-693 (Agent Operating Control-Plane, epic #2144): repo-governance MCP
// server. A dependency-free JSON-RPC 2.0 stdio server, SEPARATE from the VI
// semantic-comparison MCP, that exposes the repo-truth read-model (VHS-REQ-692)
// as a read-only MCP tool so an MCP client reads live repository ground-truth.
//
// Boundaries (per the control-plane design):
//   - Dependency-free and vscode-free: it reuses scripts/readRepoTruth.js in
//     process and imports nothing that pulls in the extension host.
//   - READ-ONLY: it wraps the read-model packet only; no write/acting surface
//     lives here (those are governed and default-disabled under VHS-REQ-696).
//   - Fail-closed-on-auth propagates: when the read-model fails closed because a
//     live GitHub token is missing, the tool call returns a JSON-RPC error rather
//     than a packet, never fabricating defaults.
//
// The message handler is pure and injectable (the read-model builder is a dep) so
// it is unit-tested without a real subprocess or gh.

const { buildRepoTruthPacket, RepoTruthAuthError } = require('./readRepoTruth.js');

const REPO_GOVERNANCE_MCP_PROTOCOL_VERSION = '2024-11-05';
const REPO_GOVERNANCE_MCP_SERVER_INFO = Object.freeze({
  name: 'vi-history-suite-repo-governance',
  version: '1.0.0'
});

const GET_REPO_TRUTH_TOOL = Object.freeze({
  name: 'get_repo_truth',
  description:
    'Read live repository ground-truth (merge-queue policy, open work, coverage, requirement health, release state, supply chain) as one schema-versioned packet. Fails closed when a live GitHub token is unavailable.',
  inputSchema: {
    type: 'object',
    properties: {
      repo: { type: 'string', description: 'owner/name slug (defaults to this repository)' },
      branch: { type: 'string', description: 'branch to read merge-queue policy for (defaults to develop)' }
    },
    additionalProperties: false
  }
});

const REPO_GOVERNANCE_MCP_TOOLS = Object.freeze([GET_REPO_TRUTH_TOOL]);

// JSON-RPC 2.0 error codes.
const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS = -32602;
// Application error range for a fail-closed auth precondition.
const REPO_TRUTH_AUTH_ERROR_CODE = -32001;

function success(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function failure(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

// Pure JSON-RPC message handler. `deps.buildRepoTruthPacket` is injectable for
// tests; it defaults to the real read-model builder.
function handleRepoGovernanceMcpMessage(message, deps = {}) {
  const id = message && message.id !== undefined ? message.id : null;
  const buildPacket = deps.buildRepoTruthPacket || buildRepoTruthPacket;
  const AuthError = deps.RepoTruthAuthError || RepoTruthAuthError;

  switch (message && message.method) {
    case 'initialize':
      return success(id, {
        protocolVersion: REPO_GOVERNANCE_MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: REPO_GOVERNANCE_MCP_SERVER_INFO
      });

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return success(id, {});

    case 'tools/list':
      return success(id, { tools: REPO_GOVERNANCE_MCP_TOOLS });

    case 'tools/call': {
      const params = (message.params || {});
      if (typeof params.name !== 'string') {
        return failure(id, JSON_RPC_INVALID_PARAMS, 'tools/call requires a string "name"');
      }
      if (params.name !== GET_REPO_TRUTH_TOOL.name) {
        return failure(id, JSON_RPC_METHOD_NOT_FOUND, `Unknown tool: ${params.name}`);
      }
      const args = (params.arguments && typeof params.arguments === 'object') ? params.arguments : {};
      const options = {};
      if (typeof args.repo === 'string') options.repo = args.repo;
      if (typeof args.branch === 'string') options.branch = args.branch;
      try {
        const packet = buildPacket(options, deps.readModelDeps || {});
        return success(id, {
          content: [{ type: 'text', text: JSON.stringify(packet, null, 2) }],
          isError: false
        });
      } catch (error) {
        if (error instanceof AuthError || (error && error.authFailure === true)) {
          return failure(
            id,
            REPO_TRUTH_AUTH_ERROR_CODE,
            `Repo-truth read-model failed closed: ${error.message}. A live GitHub token is required; the read-model does not fall back to documented defaults.`
          );
        }
        throw error;
      }
    }

    default:
      return failure(id, JSON_RPC_METHOD_NOT_FOUND, `Unknown method: ${message && message.method}`);
  }
}

// Thin newline-delimited JSON-RPC stdio loop. Dependency-free; each input line is
// one JSON-RPC message, each non-null response is written as one line. Extracted
// from the require.main block so the framing/dispatch loop is unit-testable with
// injected stdin/stdout streams (no real subprocess). Behavior is unchanged.
function runRepoGovernanceMcpStdioServer(deps = {}) {
  const input = deps.stdin || process.stdin;
  const output = deps.stdout || process.stdout;
  const handle = deps.handleMessage || handleRepoGovernanceMcpMessage;
  let buffer = '';
  input.setEncoding('utf8');
  input.on('data', (chunk) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        let response = null;
        try {
          response = handle(JSON.parse(line));
        } catch (error) {
          response = failure(null, -32700, `Parse error: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (response) {
          output.write(`${JSON.stringify(response)}\n`);
        }
      }
      newlineIndex = buffer.indexOf('\n');
    }
  });
}

module.exports = {
  REPO_GOVERNANCE_MCP_PROTOCOL_VERSION,
  REPO_GOVERNANCE_MCP_SERVER_INFO,
  REPO_GOVERNANCE_MCP_TOOLS,
  GET_REPO_TRUTH_TOOL,
  REPO_TRUTH_AUTH_ERROR_CODE,
  handleRepoGovernanceMcpMessage,
  runRepoGovernanceMcpStdioServer
};

if (require.main === module) {
  runRepoGovernanceMcpStdioServer();
}
