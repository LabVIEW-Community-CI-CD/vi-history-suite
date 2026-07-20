#!/usr/bin/env node
// VHS-REQ-699 (vagrant lane instrumentation, LOCAL until stable): a minimal MCP
// stdio server that interfaces the guest progress instrumentation to an MCP
// client, so an agent can FOLLOW a long Vagrant host-native pipeline run with
// granular per-state status instead of opaque long polls.
//
// This is deliberately a SEPARATE, LOCAL server (NOT wired into the shipped
// vi-semantic MCP registry) while the instrumentation stabilizes. It mirrors the
// shipped server's JSON-RPC envelope and read-only tool conventions, and all
// boundaries (the guest reader + clock) are injected so the dispatcher is pure
// and unit-testable without a guest.
//
// Tools:
//   follow_guest_progress { logPath?, stallThresholdMs? }
//       -> structured status snapshot (phase, currentState, sinceLastEventMs,
//          stalled, last events) parsed from the guest NDJSON progress log.
//   get_guest_result { resultPath? }
//       -> the final result JSON once the driver has written it, else pending.
//
// Transport: newline-delimited JSON-RPC 2.0 on stdio (initialize / tools/list /
// tools/call), matching the shipped server so the same client can drive it.
'use strict';
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseGuestProgress } = require(path.join(__dirname, 'lib', 'progressLogParser.cjs'));

const SERVER_NAME = 'vihs-vagrant-progress';
const SERVER_VERSION = '0.1.0-local';
const DEFAULT_LOG_PATH = 'C:\\vihs-proof-tmp\\req699-win-progress.ndjson';
const DEFAULT_RESULT_PATH = 'C:\\vihs-proof-tmp\\req699-win-result.json';

const TOOLS = [
  {
    name: 'follow_guest_progress',
    description:
      'Follow a running Vagrant guest pipeline via its NDJSON progress log: returns a structured ' +
      'status snapshot (phase, current pipeline state, ms since the last event, stalled flag, and ' +
      'the recent events) so an agent can track a long host-native run without opaque long polls. ' +
      'Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        logPath: { type: 'string', description: `Guest path to the progress NDJSON (default ${DEFAULT_LOG_PATH}).` },
        stallThresholdMs: { type: 'number', description: 'Since-last-event gap that marks the run stalled (default 120000).' }
      },
      additionalProperties: false
    },
    annotations: { title: 'Follow guest progress', readOnlyHint: true, openWorldHint: true }
  },
  {
    name: 'get_guest_result',
    description:
      'Return the final pipeline result JSON a Vagrant guest driver writes when it finishes ' +
      '(per-state pipelineCycles evidence + runtime outcome), or a pending marker if not written ' +
      'yet. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        resultPath: { type: 'string', description: `Guest path to the result JSON (default ${DEFAULT_RESULT_PATH}).` }
      },
      additionalProperties: false
    },
    annotations: { title: 'Get guest result', readOnlyHint: true, openWorldHint: true }
  }
];

/** Default guest file reader via `vagrant winrm` Get-Content -Raw (best-effort). */
function defaultReadGuestFile(guestPath) {
  const env = {
    ...process.env,
    VAGRANT_HOME: process.env.VAGRANT_HOME || `${process.env.HOME}/.vagrant.d-ext4`,
    VAGRANT_CWD:
      process.env.VAGRANT_CWD || path.resolve(__dirname)
  };
  const ps = `if (Test-Path '${guestPath}') { Get-Content -Raw '${guestPath}' } else { '' }`;
  const res = spawnSync('vagrant', ['winrm', '-c', ps], {
    env,
    encoding: 'utf8',
    timeout: 90000
  });
  if (res.status !== 0) {
    throw new Error(`vagrant winrm read failed: ${(res.stderr || '').trim() || res.status}`);
  }
  // vagrant winrm prefixes each line with "    default: "; strip it.
  return String(res.stdout || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*default:\s?/, ''))
    .join('\n');
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}
function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}
function toolText(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}

/**
 * Pure dispatcher. Boundaries injected: `readGuestFile(guestPath) -> string` and
 * `nowMs()`. Returns a JSON-RPC response object (or null for notifications).
 */
function dispatch(message, deps = {}) {
  const readGuestFile = deps.readGuestFile ?? defaultReadGuestFile;
  const id = message && Object.prototype.hasOwnProperty.call(message, 'id') ? message.id : null;
  const method = message && message.method;

  if (method === 'initialize') {
    return jsonRpcResult(id, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
    });
  }
  if (method === 'notifications/initialized') {
    return null;
  }
  if (method === 'tools/list') {
    return jsonRpcResult(id, { tools: TOOLS });
  }
  if (method === 'tools/call') {
    const params = message.params || {};
    const args = params.arguments || {};
    try {
      if (params.name === 'follow_guest_progress') {
        const logPath = args.logPath || DEFAULT_LOG_PATH;
        const ndjson = readGuestFile(logPath);
        if (!ndjson.trim()) {
          return jsonRpcResult(id, toolText({ phase: 'not-started', logPath, note: 'progress log empty or absent' }));
        }
        const status = parseGuestProgress(ndjson, {
          stallThresholdMs: args.stallThresholdMs,
          nowMs: deps.nowMs ? deps.nowMs() : undefined
        });
        // Trim the events array to the last 8 for a compact snapshot.
        const recent = status.events.slice(-8);
        return jsonRpcResult(id, toolText({ ...status, events: recent, logPath }));
      }
      if (params.name === 'get_guest_result') {
        const resultPath = args.resultPath || DEFAULT_RESULT_PATH;
        const raw = readGuestFile(resultPath);
        if (!raw.trim()) {
          return jsonRpcResult(id, toolText({ status: 'pending', resultPath }));
        }
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return jsonRpcResult(id, toolText({ status: 'unreadable', resultPath, raw: raw.slice(0, 2000) }));
        }
        return jsonRpcResult(id, toolText({ status: 'ready', resultPath, result: parsed }));
      }
      return jsonRpcResult(id, { ...toolText(`Tool error: unknown tool ${params.name}`), isError: true });
    } catch (error) {
      const msg = error && error.message ? error.message : String(error);
      return jsonRpcResult(id, { ...toolText(`Tool error: ${msg}`), isError: true });
    }
  }
  return jsonRpcError(id, -32601, `Method not found: ${method}`);
}

// stdio loop (only when run directly, not when required by tests).
function runStdioServer() {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        process.stdout.write(JSON.stringify(jsonRpcError(null, -32700, 'Parse error')) + '\n');
        continue;
      }
      const response = dispatch(message);
      if (response) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    }
  });
}

module.exports = { dispatch, TOOLS, parseGuestProgress, SERVER_NAME, SERVER_VERSION };

if (require.main === module) {
  runStdioServer();
}
