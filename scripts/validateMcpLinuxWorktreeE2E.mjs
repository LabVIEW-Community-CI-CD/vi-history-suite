// End-to-end MCP validation against REAL LabVIEW in a Linux LabVIEW container,
// using the UNSTAGED working-tree VI change as the head (selectedHash="WORKTREE").
// Sibling of scripts/validateMcpContainerE2E.mjs / validateMcpPrReviewContainerE2E.mjs
// / lvkitMcpAgentValidation.mjs (VHS-REQ-712).
//
// This is the on-demand OPERATOR path: review whatever VI a human is currently
// editing (an uncommitted working-tree change) against its committed HEAD, on
// demand. It is the workflow a local LLM runner (e.g. Ollama) will drive through
// this same MCP server so operators can ask "what did my in-progress VI edit
// change?" without committing first.
//
// It drives the SHIPPED VI semantic MCP server (out/cli/runViSemanticMcpServer.js)
// as a REAL Model Context Protocol client over stdio (@modelcontextprotocol/sdk)
// and steers the runtime to the Linux container via runtime.containerImageVersion:
//   phase 0  protocol surface (tools advertised)
//   phase 1  get_runtime_health (linux-container aware; fast-fail if not ready)
//   phase 2  create a reversible UNSTAGED working-tree edit (the "operator edit")
//   phase 3  compare_vi_revisions(base=HEAD, selected="WORKTREE") in the container (the crux)
//   phase 4  validate_vi_semantic_document (the produced model validates)
//   phase 5  repeat the WORKTREE compare (uncached) -> deterministic identical model
//   +        error contract: a bad-arg call returns JSON-RPC -32602 with data.issues
//
// SAFE + idempotent: the working-tree edit is created by overwriting one VI with
// another committed revision's bytes (never staged, never committed), and the
// working tree is ALWAYS restored (`git checkout -- <vi>`) on the way out — even
// on error. Setup isolation comes from a fresh server process and a fresh
// `docker run --rm` container per comparison, plus clearing the comparison-model
// cache (the WORKTREE head is intentionally uncached, so each run is a real,
// deterministic comparison).
//
// Maintainer harness (.mjs, inventory-exempt, coverage-exempt, NOT in npm test):
// Docker in LINUX-container mode with the image pulled, and a local Git clone
// with a CLEAN working tree for the target VI. Not a hosted CI gate. Run from the
// repo root AFTER `npm run compile`:
//   node scripts/validateMcpLinuxWorktreeE2E.mjs
//
// Env (all optional; override to target any repo / VI / edit source):
//   VIHS_MCP_IMAGE_VERSION   linux image tag suffix (default 2026q1patch2-linux)
//   VIHS_MCP_REPO            git repo clone (default C:\repos\ni\labview-icon-editor)
//   VIHS_MCP_VI              repo-relative .vi to edit + review
//   VIHS_MCP_BASE            committed base revision (default the repo HEAD sha used in the demo)
//   VIHS_MCP_ALT             revision whose VI bytes become the uncommitted "operator edit"
//   VIHS_MCP_CALL_TIMEOUT_MS per-call MCP request timeout (default 900000)
//   VIHS_MCP_OUT             write the typed evidence JSON to this path
//
// Exit codes: 0 success, 2 missing `out/` server entry / Docker not in
// Linux-container mode / image missing / corpus VI already dirty, 1 any assertion
// failure or error.

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import process from 'node:process';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolveContainerTarget, defaultCorpus } from '../prototype/lib/resolveContainerTarget.mjs';

const REPO = process.cwd();
const serverEntry = path.join(REPO, 'out', 'cli', 'runViSemanticMcpServer.js');
// Container target resolved from the Docker ENGINE OS (discussion #2368): engine OS
// is the contract; an explicit VIHS_MCP_IMAGE_VERSION drives platform from its own
// -windows/-linux suffix. Unresolved requests fail closed in preflightDocker().
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
const CACHE_DIR = path.join(os.tmpdir(), 'vihs-vi-comparison-cache');
const CALL_TIMEOUT_MS = Number(process.env.VIHS_MCP_CALL_TIMEOUT_MS || 900000);
const RUNTIME = { provider: 'docker', platform: TARGET_PLATFORM, bitness: 'x64', containerImageVersion: IMAGE_VERSION };
const CONTAINER_PROVIDERS = new Set(['docker', 'linux-container', 'windows-container']);
const viDiskPath = path.join(CORPUS, ...VI.split('/'));

const evidence = { schema: 'vi-history-suite/mcp-linux-worktree-e2e-evidence@v1', generatedAt: new Date().toISOString(), image: IMAGE, worktreeHead: true, corpus: { CORPUS, BASE, ALT_REV, VI }, phases: {}, ok: false };
const problems = [];
const log = (m) => process.stderr.write('[mcp-wt] ' + m + '\n');
const textOf = (r) => ((r?.content || []).find((c) => c.type === 'text')?.text) ?? '';
function jsonOf(r) {
  try {
    return JSON.parse(textOf(r));
  } catch {
    return null;
  }
}
function git(args, opts = {}) {
  return execFileSync('git', ['-C', CORPUS, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
}
function gitBuf(args) {
  return execFileSync('git', ['-C', CORPUS, ...args], { maxBuffer: 128 * 1024 * 1024 });
}
function dockerRmByAncestor() {
  try {
    const ids = execFileSync('docker', ['ps', '-aq', '--filter', 'ancestor=' + IMAGE], { encoding: 'utf8' }).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    for (const id of ids) {
      try {
        execFileSync('docker', ['rm', '-f', id], { stdio: 'ignore' });
      } catch {
        /* ignore */
      }
    }
    return ids.length;
  } catch {
    return 0;
  }
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
function preflightDocker() {
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
  if (!fs.existsSync(serverEntry)) {
    log('missing ' + serverEntry + '; run `npm run compile` first.');
    process.exit(2);
  }
  preflightDocker();

  const removed = dockerRmByAncestor();
  try {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  restoreClean();
  if (isDirty()) {
    log('ABORT: corpus VI is already dirty before setup; refusing to touch it.');
    process.exit(2);
  }
  log('cleared ' + removed + ' stale container(s) + cache; linux image=' + IMAGE + '; corpus clean');

  const transport = new StdioClientTransport({ command: process.execPath, args: [serverEntry], env: { ...process.env }, stderr: 'pipe' });
  const client = new Client({ name: 'vihs-mcp-linux-worktree-e2e', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);

  try {
    // Phase 0: protocol surface
    const toolNames = ((await client.listTools()).tools || []).map((t) => t.name);
    const missing = ['compare_vi_revisions', 'get_runtime_health', 'validate_vi_semantic_document'].filter((n) => !toolNames.includes(n));
    evidence.phases.protocol = { toolCount: toolNames.length, missing };
    if (missing.length) problems.push('missing tools: ' + missing.join(','));
    log('phase0: ' + toolNames.length + ' tools');

    // Phase 1: linux runtime-health (fast-fail)
    const health = jsonOf(await client.callTool({ name: 'get_runtime_health', arguments: { platform: TARGET_PLATFORM, settings: { requestedProvider: 'docker', containerImageVersion: IMAGE_VERSION } } }));
    evidence.phases.runtimeHealth = health;
    const healthOk = health && CONTAINER_PROVIDERS.has(health.provider) && !health.blocked && (health.containerImage || '').includes(IMAGE_VERSION);
    log('phase1 runtime-health: provider=' + health?.provider + ' image=' + health?.containerImage + ' blocked=' + health?.blocked);
    if (!healthOk) {
      problems.push('linux runtime not ready: provider=' + health?.provider + ' image=' + health?.containerImage + ' blocked=' + health?.blocked);
      throw new Error('linux runtime not ready');
    }

    // Phase 2: create the UNSTAGED working-tree change (the operator edit)
    const headBlobSha = git(['rev-parse', BASE + ':' + VI]).trim();
    const altBytes = gitBuf(['cat-file', 'blob', ALT_REV + ':' + VI]);
    fs.writeFileSync(viDiskPath, altBytes);
    const dirty = isDirty();
    const worktreeBlobSha = git(['hash-object', viDiskPath]).trim();
    evidence.phases.worktreeEdit = { dirty, headBlobSha, worktreeBlobSha, differs: headBlobSha !== worktreeBlobSha, bytes: altBytes.length };
    log('phase2: uncommitted edit -> status "' + dirty + '" headBlob=' + headBlobSha.slice(0, 12) + ' worktreeBlob=' + worktreeBlobSha.slice(0, 12) + ' differs=' + (headBlobSha !== worktreeBlobSha));
    if (!dirty || !/\bM/.test(dirty)) problems.push('working tree not modified after edit');
    if (headBlobSha === worktreeBlobSha) problems.push('worktree bytes did not differ from HEAD');

    // Phase 3: compare HEAD vs WORKTREE in the LINUX container (the crux)
    log('phase3: compare_vi_revisions base=HEAD selected=WORKTREE in ' + IMAGE + ' (real linux compare of the uncommitted edit)...');
    const t3 = Date.now();
    const res = await client.callTool({ name: 'compare_vi_revisions', arguments: { repositoryRoot: CORPUS, relativePath: VI, baseHash: BASE, selectedHash: 'WORKTREE', runtime: RUNTIME } }, undefined, { timeout: CALL_TIMEOUT_MS });
    const ms = Date.now() - t3;
    const t = textOf(res);
    let model = null;
    let modelHash = null;
    if (res.isError === true || t.startsWith('Comparison ')) {
      evidence.phases.compare = { status: 'not-completed', ms, error: t.slice(0, 400) };
      problems.push('worktree compare not completed: ' + t.slice(0, 200));
    } else {
      model = JSON.parse(t);
      modelHash = crypto.createHash('sha256').update(JSON.stringify(model)).digest('hex').slice(0, 16);
      evidence.phases.compare = { status: 'completed', ms, schema: model.schema, provider: model.runtime?.provider, engine: model.runtime?.engine, containerImage: model.runtime?.containerImage, hasDifferences: model.hasDifferences, changedSurfaces: model.changedSurfaces, riskLevel: model.riskLevel, modelHash, narrative: (model.narrative || '').slice(0, 200) };
      log('phase3 DONE in ' + (ms / 1000).toFixed(1) + 's: schema=' + model.schema + ' provider=' + model.runtime?.provider + ' engine=' + model.runtime?.engine + ' hasDiff=' + model.hasDifferences + ' surfaces=' + JSON.stringify(model.changedSurfaces) + ' hash=' + modelHash);
      if (model.schema !== 'vi-history-suite/vi-semantic-comparison@v1') problems.push('bad comparison schema');
      if (!CONTAINER_PROVIDERS.has(model.runtime?.provider)) problems.push('compare provider not a container: ' + model.runtime?.provider);
      if (model.hasDifferences !== true) problems.push('worktree compare found no differences (expected the uncommitted edit)');
    }

    // Phase 4: validate the real model against its published schema
    if (model) {
      const valid = jsonOf(await client.callTool({ name: 'validate_vi_semantic_document', arguments: { document: model } }));
      evidence.phases.validate = { valid: valid?.valid, errorCount: Array.isArray(valid?.errors) ? valid.errors.length : null };
      log('phase4: validate valid=' + valid?.valid);
      if (valid?.valid !== true) problems.push('worktree model failed schema validation');
    }

    // Phase 5: determinism — repeat the WORKTREE compare (uncached) -> identical model
    if (model) {
      log('phase5: repeat WORKTREE compare (uncached; expect deterministic identical model)...');
      const t5 = Date.now();
      const res2 = await client.callTool({ name: 'compare_vi_revisions', arguments: { repositoryRoot: CORPUS, relativePath: VI, baseHash: BASE, selectedHash: 'WORKTREE', runtime: RUNTIME } }, undefined, { timeout: CALL_TIMEOUT_MS });
      const ms2 = Date.now() - t5;
      const t2 = textOf(res2);
      let hash2 = null;
      if (!res2.isError && !t2.startsWith('Comparison ')) hash2 = crypto.createHash('sha256').update(JSON.stringify(JSON.parse(t2))).digest('hex').slice(0, 16);
      evidence.phases.determinism = { ms: ms2, modelHash: hash2, identical: hash2 === modelHash };
      log('phase5: repeat ' + (ms2 / 1000).toFixed(1) + 's hash=' + hash2 + ' identical=' + (hash2 === modelHash));
      if (hash2 !== modelHash) problems.push('repeat worktree compare not deterministic');
    }

    // Error contract
    try {
      await client.callTool({ name: 'compare_vi_revisions', arguments: { repositoryRoot: CORPUS, relativePath: VI } });
      evidence.phases.errorContract = { threw: false };
      problems.push('bad-arg call did not error');
    } catch (e) {
      const code = e?.code ?? e?.error?.code;
      const issues = e?.data?.issues ?? e?.error?.data?.issues;
      evidence.phases.errorContract = { threw: true, code, hasIssues: Array.isArray(issues) };
      log('error-contract: code=' + code + ' hasIssues=' + Array.isArray(issues));
      if (code !== -32602) problems.push('bad-arg code not -32602: ' + code);
    }
  } catch (e) {
    if (!problems.some((p) => p.startsWith('linux runtime not ready'))) problems.push('FATAL: ' + (e?.message || e));
    log('caught: ' + (e?.stack || e));
  } finally {
    await client.close().catch(() => undefined);
    dockerRmByAncestor();
    // ALWAYS restore the operator's working tree, even on error.
    restoreClean();
    const cleanNow = isDirty() === '';
    evidence.phases.cleanup = { restoredClean: cleanNow };
    log('cleanup: working tree clean=' + cleanNow);
    if (!cleanNow) problems.push('FAILED to restore clean working tree');
  }

  evidence.problems = problems;
  evidence.ok = problems.length === 0 && evidence.phases.compare?.status === 'completed';
  const outPath = process.env.VIHS_MCP_OUT;
  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
    log('evidence -> ' + outPath);
  }
  console.log('\n===== MCP LINUX-CONTAINER WORKTREE-HEAD E2E =====');
  console.log(JSON.stringify({ ok: evidence.ok, image: IMAGE, worktreeEdit: evidence.phases.worktreeEdit, runtimeHealth: { provider: evidence.phases.runtimeHealth?.provider, image: evidence.phases.runtimeHealth?.containerImage }, compare: evidence.phases.compare, validate: evidence.phases.validate, determinism: evidence.phases.determinism, cleanup: evidence.phases.cleanup, errorContract: evidence.phases.errorContract, problems }, null, 2));
  console.log(evidence.ok ? '\nRESULT: PASS — MCP reviewed the UNSTAGED worktree edit vs HEAD in the linux container.' : '\nRESULT: FAIL — ' + problems.join('; '));
  process.exitCode = evidence.ok ? 0 : 1;
}

main().catch((e) => {
  log('FATAL ' + (e?.stack || e));
  try {
    dockerRmByAncestor();
    restoreClean();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
