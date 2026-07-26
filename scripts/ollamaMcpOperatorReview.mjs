// Local Ollama -> MCP operator-review bridge (VHS-REQ-712, forward-looking).
//
// Wires a LOCAL LLM (Ollama) to the SHIPPED VI semantic MCP server so a human
// operator can ask, in natural language, "review my in-progress VI edit" and the
// model autonomously drives the MCP tools against a REAL LabVIEW comparison in a
// Docker LINUX LabVIEW container, using the UNSTAGED working tree as the head.
// This is the groundwork for running the same flow on a real Linux host that can
// only leverage Docker Linux containers and Vagrant: nothing here is host-OS
// specific except the environment policy the bridge injects.
//
// AI design: the model owns INTENT (decide to compare, interpret the result and
// speak to the engineer); the bridge owns ENVIRONMENT and CORRECTNESS. The bridge
// (1) exposes SLIM, intent-only tool specs so a small model calls tools reliably,
// (2) injects the runtime policy (docker / linux / <image>) and repositoryRoot,
// (3) PINS the review frame to committed HEAD -> working tree (a small model tends
// to guess "HEAD"/"HEAD", which reviews nothing), and (4) compacts large tool
// outputs so the model's context stays lean and its answer stays grounded.
//
// Two modes:
//   * Validator/demo (default): synthesizes a reversible uncommitted edit
//     (overwrite one VI with another revision's bytes) so the run is
//     self-contained and deterministic, then restores the working tree.
//   * Real operator (VIHS_MCP_ALT=none): reviews whatever the operator has
//     ALREADY changed in the working tree; never mutates the working tree.
//
// Maintainer/operator harness (.mjs, inventory-exempt, coverage-exempt, NOT in
// npm test). Prerequisites: an Ollama server running with a tool-capable model
// pulled (e.g. `ollama pull llama3.1:8b`), Docker in LINUX-container mode with
// the image pulled, and a local Git clone. Run from the repo root AFTER
// `npm run compile`:
//   node scripts/ollamaMcpOperatorReview.mjs
//
// Env (all optional):
//   VIHS_OLLAMA_URL     Ollama base URL (default http://localhost:11434)
//   VIHS_OLLAMA_MODEL   tool-capable model (default llama3.1:8b)
//   VIHS_MCP_IMAGE_VERSION  linux image tag suffix (default 2026q1patch2-linux)
//   VIHS_MCP_REPO       git repo clone (default C:\repos\ni\labview-icon-editor)
//   VIHS_MCP_VI         repo-relative .vi to review
//   VIHS_MCP_BASE       committed baseline revision (default the demo HEAD sha)
//   VIHS_MCP_ALT        revision whose bytes seed the demo edit, or "none" to
//                       review the operator's own working-tree change
//   VIHS_OLLAMA_MAX_TURNS  agent-loop cap (default 8)
//   VIHS_OLLAMA_OUT     write the typed evidence JSON to this path
//
// Exit codes: 0 success, 2 preflight failure (server/out/ollama/docker/image/
// corpus), 1 the model failed to drive a grounded review.

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolveContainerTarget, defaultCorpus } from '../prototype/lib/resolveContainerTarget.mjs';

const REPO = process.cwd();
const serverEntry = path.join(REPO, 'out', 'cli', 'runViSemanticMcpServer.js');
const OLLAMA = process.env.VIHS_OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.VIHS_OLLAMA_MODEL || 'llama3.1:8b';
// Container target resolved from the Docker ENGINE OS (discussion #2368): engine OS
// is the contract; an explicit VIHS_MCP_IMAGE_VERSION drives platform from its own
// -windows/-linux suffix. Unresolved requests fail closed in preflight().
function detectDockerEngineOs() {
  try {
    return execFileSync('docker', ['version', '--format', '{{.Server.Os}}'], { encoding: 'utf8', timeout: 30000 }).trim();
  } catch {
    return '';
  }
}
const ENGINE_OS = detectDockerEngineOs();
let containerTargetError = null;
let containerTarget = null;
try {
  containerTarget = resolveContainerTarget(ENGINE_OS, process.env);
} catch (e) {
  containerTargetError = e.message;
}
const IMAGE_VERSION = containerTarget ? containerTarget.imageVersion : (process.env.VIHS_MCP_IMAGE_VERSION || '');
const IMAGE = containerTarget ? containerTarget.image : 'nationalinstruments/labview:' + IMAGE_VERSION;
const TARGET_PLATFORM = containerTarget ? containerTarget.platform : 'linux';
const CORPUS = defaultCorpus(ENGINE_OS, process.env, os.homedir());
const BASE = process.env.VIHS_MCP_BASE || '9545c483f2b947c71de68c7f70aedefaedadabf7';
const ALT_REV = process.env.VIHS_MCP_ALT || 'f57c3cfd6494abf1da968ddcc116222e93e953b4';
const VI = process.env.VIHS_MCP_VI || 'resource/plugins/NIIconEditor/Class/FakedArray/Misc/UpdateVisibleData.vi';
const SYNTHETIC = ALT_REV.toLowerCase() !== 'none';
const CACHE_DIR = path.join(os.tmpdir(), 'vihs-vi-comparison-cache');
const RUNTIME_POLICY = { provider: 'docker', platform: TARGET_PLATFORM, bitness: 'x64', containerImageVersion: IMAGE_VERSION };
const MAX_TURNS = Number(process.env.VIHS_OLLAMA_MAX_TURNS || 8);
const viDiskPath = path.join(CORPUS, ...VI.split('/'));

const TOOL_ALLOWLIST = new Set(['get_runtime_health', 'compare_vi_revisions']);
// Slim, INTENT-ONLY specs shown to the model; the bridge injects the environment.
const SLIM_TOOLS = {
  get_runtime_health: {
    description: 'Confirm a LabVIEW comparison runtime is available before comparing. No arguments needed.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  compare_vi_revisions: {
    description:
      'Compare two revisions of ONE VI and return what changed (changed surfaces, change kinds, risk level, narrative). For the engineer\'s current uncommitted edit, set selectedHash to "WORKTREE".',
    parameters: {
      type: 'object',
      properties: {
        relativePath: { type: 'string', description: 'repository-relative .vi path' },
        baseHash: { type: 'string', description: 'base (older) revision; use "HEAD" for the committed baseline' },
        selectedHash: { type: 'string', description: 'newer revision, or "WORKTREE" for the uncommitted working tree' }
      },
      required: ['relativePath', 'selectedHash']
    }
  }
};

const log = (m) => process.stderr.write('[ollama-mcp] ' + m + '\n');
const textOf = (r) => ((r?.content || []).find((c) => c.type === 'text')?.text) ?? '';
function git(args) {
  return execFileSync('git', ['-C', CORPUS, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
function gitBuf(args) {
  return execFileSync('git', ['-C', CORPUS, ...args], { maxBuffer: 128 * 1024 * 1024 });
}
function restoreClean() {
  try {
    git(['checkout', '--', VI]);
  } catch (e) {
    log('restore warn: ' + e.message);
  }
}
function isDirty() {
  try {
    return git(['status', '--porcelain', '--', VI]).trim();
  } catch {
    return '';
  }
}

// Compact large tool outputs so the small model's context stays lean and grounded.
function compactToolResult(name, raw) {
  try {
    const j = JSON.parse(raw);
    if (name === 'compare_vi_revisions' && j.schema) {
      return JSON.stringify({ hasDifferences: j.hasDifferences, changedSurfaces: j.changedSurfaces, changeKinds: j.changeKinds, riskLevel: j.riskLevel, totals: j.totals, narrative: j.narrative });
    }
    return raw.length > 4000 ? raw.slice(0, 4000) + ' …(truncated)' : raw;
  } catch {
    return raw.length > 4000 ? raw.slice(0, 4000) + ' …(truncated)' : raw;
  }
}

// The bridge owns the environment: inject runtime policy + repo, and PIN the
// operator review frame (committed HEAD -> working tree) for compare_vi_revisions.
function applyPolicy(name, args) {
  const a = { ...(args || {}) };
  if (name === 'compare_vi_revisions' || name === 'summarize_vi_history') {
    a.runtime = { ...RUNTIME_POLICY, ...(a.runtime || {}) };
    if (!a.repositoryRoot) a.repositoryRoot = CORPUS;
  }
  if (name === 'compare_vi_revisions') {
    if (!a.relativePath) a.relativePath = VI;
    a.baseHash = BASE; // committed baseline (environment context, pinned)
    a.selectedHash = 'WORKTREE'; // the operator's uncommitted edit (pinned)
  }
  if (name === 'get_runtime_health') {
    a.platform = a.platform || TARGET_PLATFORM;
    a.settings = { requestedProvider: 'docker', containerImageVersion: IMAGE_VERSION, ...(a.settings || {}) };
  }
  return a;
}

async function ollamaChat(messages, tools) {
  const res = await fetch(OLLAMA + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, tools, stream: false, options: { temperature: 0, num_ctx: 8192 } })
  });
  if (!res.ok) throw new Error('ollama /api/chat ' + res.status + ': ' + (await res.text()).slice(0, 300));
  return res.json();
}

const evidence = { schema: 'vi-history-suite/ollama-mcp-operator-review-evidence@v1', generatedAt: new Date().toISOString(), model: MODEL, image: IMAGE, mode: SYNTHETIC ? 'synthetic-demo-edit' : 'operator-working-tree', worktreeHead: true, corpus: { CORPUS, BASE, VI }, toolTrace: [], finalAnswer: null, ok: false };
const problems = [];

async function preflight() {
  if (!fs.existsSync(serverEntry)) {
    log('missing ' + serverEntry + '; run `npm run compile` first.');
    process.exit(2);
  }
  try {
    const tags = await (await fetch(OLLAMA + '/api/tags')).json();
    if (!(tags.models || []).some((m) => m.name === MODEL || m.name === MODEL + ':latest')) {
      log('model ' + MODEL + ' not found in Ollama. Pull it first: ollama pull ' + MODEL);
      process.exit(2);
    }
  } catch (e) {
    log('Ollama not reachable at ' + OLLAMA + ' (' + e.message + '). Start it: ollama serve');
    process.exit(2);
  }
  if (!ENGINE_OS) {
    log('Docker not available (could not read the engine OS). Start Docker and retry.');
    process.exit(2);
  }
  if (containerTargetError) {
    log('cannot resolve a container target: ' + containerTargetError);
    process.exit(2);
  }
  const expectedEngine = TARGET_PLATFORM === 'win32' ? 'windows' : 'linux';
  if (ENGINE_OS !== expectedEngine) {
    log(`Docker engine is "${ENGINE_OS}" but target image ${IMAGE} is ${expectedEngine}. Switch the Docker engine or adjust VIHS_MCP_IMAGE_VERSION.`);
    process.exit(2);
  }
  try {
    execFileSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore', timeout: 30000 });
  } catch {
    log(`image ${IMAGE} is not present. Pull it first: docker pull ${IMAGE}`);
    process.exit(2);
  }
}

async function main() {
  await preflight();
  try {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  if (SYNTHETIC) {
    restoreClean();
    if (isDirty()) {
      log('ABORT: corpus VI already dirty; refusing to synthesize a demo edit over it.');
      process.exit(2);
    }
    const altBytes = gitBuf(['cat-file', 'blob', ALT_REV + ':' + VI]);
    fs.writeFileSync(viDiskPath, altBytes);
    evidence.worktreeEdit = { synthesized: true, dirty: isDirty(), bytes: altBytes.length };
    log('synthesized operator edit (unstaged): ' + evidence.worktreeEdit.dirty);
  } else {
    const dirty = isDirty();
    evidence.worktreeEdit = { synthesized: false, dirty };
    if (!dirty) {
      log('no uncommitted change to ' + VI + ' in the working tree; nothing to review (set VIHS_MCP_ALT to synthesize a demo edit).');
      process.exit(2);
    }
    log('reviewing the operator\'s own uncommitted change: ' + dirty);
  }

  const client = new Client({ name: 'vihs-ollama-mcp-operator-review', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverEntry], env: { ...process.env }, stderr: 'pipe' });
  await client.connect(transport);

  try {
    const mcpNames = new Set(((await client.listTools()).tools || []).map((t) => t.name));
    const tools = [...TOOL_ALLOWLIST].filter((n) => mcpNames.has(n) && SLIM_TOOLS[n]).map((n) => ({ type: 'function', function: { name: n, ...SLIM_TOOLS[n] } }));
    log('exposed ' + tools.length + ' tools to the model: ' + tools.map((t) => t.function.name).join(', '));

    const system = [
      'You are a LabVIEW VI review assistant. You have real tools; you MUST invoke them through the function-calling interface.',
      'NEVER write tool calls or JSON as text, and NEVER invent tool results — call the tool and wait for its real result.',
      'The engineer\'s current unsaved work is the working tree: to review it, call compare_vi_revisions with selectedHash "WORKTREE".',
      'Once you have a real comparison result, stop calling tools and reply with a one-paragraph verdict: what changed, which surface, and the risk level.'
    ].join(' ');
    const user = `Review my uncommitted change to "${VI}" against HEAD. Is it risky and what did it touch?`;

    const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
    let calledCompare = false;
    let compareHadDiff = null;
    let compareSurfaces = null;
    let compareRisk = null;
    let finalAnswer = null;

    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      const resp = await ollamaChat(messages, tools);
      const msg = resp.message || {};
      messages.push(msg);
      const calls = msg.tool_calls || [];
      if (calls.length === 0) {
        finalAnswer = (msg.content || '').trim();
        break;
      }
      for (const call of calls) {
        const name = call.function?.name;
        const rawArgs = call.function?.arguments || {};
        const args = applyPolicy(name, typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs);
        log(`turn ${turn}: model -> ${name}(${JSON.stringify(args).slice(0, 200)})`);
        let resultText;
        try {
          if (!TOOL_ALLOWLIST.has(name)) throw new Error('tool not permitted: ' + name);
          const started = Date.now();
          const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 900000 });
          resultText = textOf(r);
          log(`         tool ${name} -> ${((Date.now() - started) / 1000).toFixed(1)}s, ${resultText.length} bytes`);
          if (name === 'compare_vi_revisions') {
            calledCompare = true;
            try {
              const m = JSON.parse(resultText);
              compareHadDiff = m.hasDifferences;
              compareSurfaces = m.changedSurfaces;
              compareRisk = m.riskLevel;
            } catch {
              /* ignore */
            }
          }
          resultText = compactToolResult(name, resultText);
        } catch (e) {
          resultText = 'ERROR: ' + (e?.message || e);
          log('         tool ' + name + ' ERROR: ' + resultText);
        }
        evidence.toolTrace.push({ turn, name, args: name === 'compare_vi_revisions' ? { selectedHash: args.selectedHash, provider: args.runtime?.provider, image: args.runtime?.containerImageVersion } : args, resultPreview: resultText.slice(0, 300) });
        messages.push({ role: 'tool', content: resultText });
      }
    }

    evidence.finalAnswer = finalAnswer;
    evidence.calledCompare = calledCompare;
    evidence.compareHadDiff = compareHadDiff;
    evidence.compareSurfaces = compareSurfaces;
    evidence.compareRisk = compareRisk;

    console.log('\n================ OPERATOR Q ================');
    console.log(user);
    console.log('\n================ LLM ANSWER (' + MODEL + ' via MCP + real LabVIEW ' + IMAGE_VERSION + ' container) ================');
    console.log(finalAnswer || '(model produced no final answer)');
    console.log('\n================ TOOL TRACE ================');
    for (const t of evidence.toolTrace) console.log(`  [turn ${t.turn}] ${t.name}  ${JSON.stringify(t.args)}`);

    if (!calledCompare) problems.push('model never called compare_vi_revisions');
    if (calledCompare && compareHadDiff !== true) problems.push('compare did not report differences (expected the uncommitted edit)');
    if (!finalAnswer) problems.push('model produced no final answer');
    if (finalAnswer && !/diagram|risk|change|surface/i.test(finalAnswer)) problems.push('final answer does not read like a grounded review');
  } catch (e) {
    problems.push('FATAL: ' + (e?.message || e));
    log('caught: ' + (e?.stack || e));
  } finally {
    await client.close().catch(() => undefined);
    if (SYNTHETIC) {
      restoreClean();
      evidence.cleanupClean = isDirty() === '';
      log('cleanup: working tree clean=' + evidence.cleanupClean);
      if (!evidence.cleanupClean) problems.push('failed to restore clean working tree');
    }
  }

  evidence.problems = problems;
  evidence.ok = problems.length === 0;
  if (process.env.VIHS_OLLAMA_OUT) {
    fs.writeFileSync(process.env.VIHS_OLLAMA_OUT, JSON.stringify(evidence, null, 2));
    log('evidence -> ' + process.env.VIHS_OLLAMA_OUT);
  }
  console.log('\n' + (evidence.ok ? 'RESULT: PASS — local Ollama drove the MCP to review the uncommitted edit via the real LabVIEW ' + IMAGE_VERSION + ' container.' : 'RESULT: FAIL — ' + problems.join('; ')));
  process.exitCode = evidence.ok ? 0 : 1;
}

main().catch((e) => {
  log('FATAL ' + (e?.stack || e));
  try {
    if (SYNTHETIC) restoreClean();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
