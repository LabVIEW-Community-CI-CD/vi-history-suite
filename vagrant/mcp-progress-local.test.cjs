#!/usr/bin/env node
// VHS-REQ-699 (vagrant lane instrumentation, LOCAL until stable): standalone
// self-test for the pure progress parser + local MCP dispatcher. Run directly:
//   node vagrant/mcp-progress-local.test.cjs
// Kept out of `npm test` (lives under vagrant/, exempt) while the interface
// stabilizes; it uses node:assert and an injected in-memory guest reader so it
// needs no Vagrant guest, driver, or LabVIEW.
'use strict';
const assert = require('node:assert');
const path = require('node:path');
const { parseGuestProgress } = require(path.join(__dirname, 'lib', 'progressLogParser.cjs'));
const { dispatch, TOOLS } = require(path.join(__dirname, 'mcp-progress-local.cjs'));

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`  ok - ${name}\n`);
}

// Build an NDJSON log mirroring the instrumented driver's event stream.
function line(elapsedMs, event, data) {
  return JSON.stringify({ t: new Date(elapsedMs).toISOString(), elapsedMs, event, ...(data || {}) });
}

const runningLog = [
  line(0, 'run-start', { logPath: 'C:\\x.ndjson' }),
  line(10, 'runtime-resolved', { provider: 'host-native', engine: 'labview-cli' }),
  line(20, 'preflight', { ready: true }),
  line(30, 'packet-persisted', { reportStatus: 'ready-for-runtime' }),
  line(40, 'pipeline-start'),
  line(50, 'preview-start', { side: 'left' }),
  line(201400, 'preview-end', { side: 'left', rendered: true, durationMs: 201350 }),
  line(201410, 'preview-start', { side: 'right' })
].join('\n');

const doneLog = [
  runningLog,
  line(368300, 'preview-end', { side: 'right', rendered: true, durationMs: 166890 }),
  line(542100, 'pipeline-end', { runtimeState: 'failed', reportExists: false }),
  line(542110, 'result-written', { proofPath: 'C:\\r.json', runtimeState: 'failed' })
].join('\n');

process.stdout.write('progressLogParser:\n');

test('parses a running log and marks COMPARISON as the live state after preview-right start', () => {
  const s = parseGuestProgress(runningLog, { nowMs: 201410 });
  assert.equal(s.phase, 'running');
  assert.equal(s.malformed, 0);
  // preview-start(right) is the last event, so current state is PREVIEW_RIGHT.
  assert.equal(s.currentState, 'PREVIEW_RIGHT');
  assert.equal(s.stalled, false);
});

test('flags a stall when the last event is older than the threshold', () => {
  const s = parseGuestProgress(runningLog, { nowMs: 201410 + 200000, stallThresholdMs: 120000 });
  assert.equal(s.phase, 'running');
  assert.equal(s.stalled, true);
  assert.ok(s.sinceLastEventMs >= 200000);
});

test('reports done with the final runtime state', () => {
  const s = parseGuestProgress(doneLog);
  assert.equal(s.phase, 'done');
  assert.equal(s.stalled, false);
  assert.deepEqual(s.result, { runtimeState: 'failed', proofPath: 'C:\\r.json' });
});

test('counts malformed lines without throwing', () => {
  const s = parseGuestProgress(runningLog + '\nnot json\n{"no":"event"}');
  assert.equal(s.malformed, 2);
  assert.equal(s.phase, 'running');
});

test('empty input reads as not-started', () => {
  const s = parseGuestProgress('');
  assert.equal(s.phase, 'not-started');
  assert.equal(s.parsed, 0);
});

process.stdout.write('mcp-progress-local dispatcher:\n');

test('initialize advertises the local server + tools capability', () => {
  const r = dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert.equal(r.result.serverInfo.name, 'vihs-vagrant-progress');
  assert.ok(r.result.capabilities.tools);
});

test('tools/list returns the two follow tools', () => {
  const r = dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const names = r.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['follow_guest_progress', 'get_guest_result']);
  assert.equal(r.result.tools.length, TOOLS.length);
});

test('follow_guest_progress parses via the injected reader', () => {
  const r = dispatch(
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'follow_guest_progress', arguments: {} } },
    { readGuestFile: () => runningLog, nowMs: () => 201410 }
  );
  const payload = JSON.parse(r.result.content[0].text);
  assert.equal(payload.phase, 'running');
  assert.equal(payload.currentState, 'PREVIEW_RIGHT');
  // Compact snapshot trims events to the last 8.
  assert.ok(payload.events.length <= 8);
});

test('follow_guest_progress returns not-started on an empty log', () => {
  const r = dispatch(
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'follow_guest_progress', arguments: {} } },
    { readGuestFile: () => '' }
  );
  const payload = JSON.parse(r.result.content[0].text);
  assert.equal(payload.phase, 'not-started');
});

test('get_guest_result returns pending then ready', () => {
  const pending = dispatch(
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_guest_result', arguments: {} } },
    { readGuestFile: () => '' }
  );
  assert.equal(JSON.parse(pending.result.content[0].text).status, 'pending');

  const ready = dispatch(
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_guest_result', arguments: {} } },
    { readGuestFile: () => JSON.stringify({ runtimeState: 'failed', pipelineCycles: [] }) }
  );
  const payload = JSON.parse(ready.result.content[0].text);
  assert.equal(payload.status, 'ready');
  assert.equal(payload.result.runtimeState, 'failed');
});

test('a guest read failure becomes an isError tool result, not a throw', () => {
  const r = dispatch(
    { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'follow_guest_progress', arguments: {} } },
    {
      readGuestFile: () => {
        throw new Error('winrm down');
      }
    }
  );
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /winrm down/);
});

test('unknown method returns -32601', () => {
  const r = dispatch({ jsonrpc: '2.0', id: 8, method: 'no/such' });
  assert.equal(r.error.code, -32601);
});

process.stdout.write(`\nAll ${passed} checks passed.\n`);
