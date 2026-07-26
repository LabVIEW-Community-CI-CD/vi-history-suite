// End-to-end MCP-server validation against REAL LabVIEW in a Windows LabVIEW
// container (VHS-REQ-712 sibling to lvkitMcpAgentValidation.mjs). Drives the
// SHIPPED VI semantic MCP server (out/cli/runViSemanticMcpServer.js) as a REAL
// Model Context Protocol client over stdio using the official
// @modelcontextprotocol/sdk, steering the runtime-gated tools to the Windows
// LabVIEW container via runtime.containerImageVersion. It proves an agent (e.g.
// Copilot) talking MCP to this server gets a real container-backed semantic
// comparison — end to end, over the wire.
//
// Setup isolation + idempotency: each run spawns a fresh MCP server process and
// a fresh `docker run --rm` container, clears the shared comparison-model cache
// for a cold comparison, and asserts that a second (warm) comparison returns a
// byte-identical model from the cache.
//
// It exercises a broad slice of the surface as an autonomous agent would:
//   phase 0  protocol surface: list tools / prompts / resources; read a schema resource
//   phase 1  get_runtime_health (container-aware) + get_preview_diagnostics (no render)
//   phase 2  index_repository_vis + list_changed_vis (pure Git)
//   phase 3  compare_vi_revisions — a REAL LabVIEW comparison inside the container
//   phase 4  get_vi_semantic_schema + validate_vi_semantic_document (the real model validates)
//   phase 5  repeat compare — warm comparison-model cache returns an identical model (idempotency)
//   phase 6  (opt-in VIHS_MCP_PR_REVIEW=1) build_vi_pr_review over the container
//   +        error contract: a bad-arg call returns JSON-RPC -32602 with data.issues
//
// Maintainer harness (.mjs, inventory-exempt, coverage-exempt, NOT in npm test):
// Windows + Docker in Windows-container mode with the image pulled, and a local
// Git repo holding a tracked VI. Not a hosted CI gate. Run from the repo root
// AFTER `npm run compile`:
//   node scripts/validateMcpContainerE2E.mjs
//
// Env (all optional):
//   VIHS_MCP_IMAGE_VERSION      container image tag suffix
//                               (default 2026q1patch2-windows)
//   VIHS_MCP_REPO               git repo holding the VI (default C:\repos\ni\labview-icon-editor)
//   VIHS_MCP_VI                 repo-relative .vi path (default resource/plugins/lv_icon.vi)
//   VIHS_MCP_BASE               base git revision (default 5376833)
//   VIHS_MCP_SEL                selected git revision (default fc09736)
//   VIHS_MCP_PLATFORM           runtime platform (default from process.platform)
//   VIHS_MCP_BITNESS            x86|x64 (default x64; docker requires x64)
//   VIHS_MCP_COMPARE_TIMEOUT_MS per-compare MCP request timeout (default 900000)
//   VIHS_MCP_PR_REVIEW=1        also run build_vi_pr_review over the container
//   VIHS_MCP_OUT                write the typed evidence JSON to this path
//
// Exit codes: 0 success, 2 missing `out/` server entry / Docker not in
// Windows-container mode / image missing, 1 any assertion failure or error.

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
const CORPUS = defaultCorpus(ENGINE_OS, process.env, os.homedir());
const VI = process.env.VIHS_MCP_VI || 'resource/plugins/lv_icon.vi';
const BASE = process.env.VIHS_MCP_BASE || '5376833';
const SEL = process.env.VIHS_MCP_SEL || 'fc09736';
const PLATFORM = containerTarget ? containerTarget.platform : 'linux';
const BITNESS = (process.env.VIHS_MCP_BITNESS || 'x64').toLowerCase() === 'x86' ? 'x86' : 'x64';
const CACHE_DIR = path.join(os.tmpdir(), 'vihs-vi-comparison-cache');
const COMPARE_TIMEOUT_MS = Number(process.env.VIHS_MCP_COMPARE_TIMEOUT_MS || 900000);
const RUN_PR_REVIEW = process.env.VIHS_MCP_PR_REVIEW === '1';
const RUNTIME = { provider: 'docker', platform: PLATFORM, bitness: BITNESS, containerImageVersion: IMAGE_VERSION };
const CONTAINER_PROVIDERS = new Set(['docker', 'windows-container', 'linux-container']);

const evidence = {
  schema: 'vi-history-suite/mcp-container-e2e-evidence@v1',
  generatedAt: new Date().toISOString(),
  transport: 'stdio (real MCP SDK client)',
  image: IMAGE,
  corpus: { CORPUS, VI, BASE, SEL },
  phases: {},
  ok: false
};
const problems = [];
const log = (m) => process.stderr.write('[mcp-e2e] ' + m + '\n');
const textOf = (r) => ((r?.content || []).find((c) => c.type === 'text')?.text) ?? '';
function jsonOf(r) {
  const t = textOf(r);
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}
function dockerRmByAncestor() {
  try {
    const ids = execFileSync('docker', ['ps', '-aq', '--filter', 'ancestor=' + IMAGE], { encoding: 'utf8' })
      .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
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
function preflightDocker() {
  if (!ENGINE_OS) {
    log('Docker not available (could not read the engine OS). Start Docker and retry.');
    process.exit(2);
  }
  if (containerTargetError) {
    log('cannot resolve a container target: ' + containerTargetError);
    process.exit(2);
  }
  const expectedEngine = PLATFORM === 'win32' ? 'windows' : 'linux';
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

  // isolation + idempotency: fresh container slate + cold comparison-model cache
  const removed = dockerRmByAncestor();
  try {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  log('cleared ' + removed + ' stale container(s) + comparison-model cache; image=' + IMAGE);

  const transport = new StdioClientTransport({ command: process.execPath, args: [serverEntry], env: { ...process.env }, stderr: 'pipe' });
  const client = new Client({ name: 'vihs-mcp-container-e2e', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);

  try {
    // ---- Phase 0: protocol surface ----
    const tools = (await client.listTools()).tools || [];
    const toolNames = tools.map((t) => t.name);
    let prompts = [];
    let resources = [];
    try {
      prompts = (await client.listPrompts()).prompts || [];
    } catch (e) {
      log('listPrompts: ' + e.message);
    }
    try {
      resources = (await client.listResources()).resources || [];
    } catch (e) {
      log('listResources: ' + e.message);
    }
    const wantTools = ['compare_vi_revisions', 'get_runtime_health', 'index_repository_vis', 'list_changed_vis', 'get_vi_semantic_schema', 'validate_vi_semantic_document', 'build_vi_pr_review', 'summarize_vi_history'];
    const missingTools = wantTools.filter((n) => !toolNames.includes(n));
    let schemaResource = null;
    if (resources.length) {
      try {
        const rr = await client.readResource({ uri: resources[0].uri });
        schemaResource = { uri: resources[0].uri, bytes: (rr.contents?.[0]?.text || '').length };
      } catch (e) {
        log('readResource: ' + e.message);
      }
    }
    evidence.phases.protocol = { toolCount: toolNames.length, promptCount: prompts.length, resourceCount: resources.length, missingTools, schemaResource };
    if (missingTools.length) problems.push('missing tools: ' + missingTools.join(','));
    log(`phase0: ${toolNames.length} tools, ${prompts.length} prompts, ${resources.length} resources`);

    // ---- Phase 1: runtime readiness (container-aware, no render) ----
    const health = jsonOf(await client.callTool({ name: 'get_runtime_health', arguments: { platform: PLATFORM, settings: { requestedProvider: 'docker', containerImageVersion: IMAGE_VERSION } } }));
    evidence.phases.runtimeHealth = health;
    log('phase1 runtime-health: provider=' + (health?.provider) + ' image=' + (health?.containerImage) + ' blocked=' + (health?.blocked));
    if (!health || !CONTAINER_PROVIDERS.has(health.provider)) problems.push('runtime-health not a container provider: ' + (health && health.provider));
    if (!health || !(health.containerImage || '').includes(IMAGE_VERSION)) problems.push('runtime-health image not ' + IMAGE_VERSION + ': ' + (health && health.containerImage));
    if (health && health.blocked) problems.push('runtime-health blocked: ' + health.blockedReason);
    try {
      const diag = jsonOf(await client.callTool({ name: 'get_preview_diagnostics', arguments: { processPlatform: PLATFORM } }));
      evidence.phases.previewDiagnostics = { schema: diag?.schema, dockerAvailable: diag?.docker?.available, osType: diag?.docker?.osType };
    } catch (e) {
      log('preview-diagnostics: ' + e.message);
    }

    // ---- Phase 2: pure Git tools ----
    const index = jsonOf(await client.callTool({ name: 'index_repository_vis', arguments: { repositoryRoot: CORPUS } }));
    evidence.phases.repositoryIndex = { schema: index?.schema, viCount: Array.isArray(index?.vis) ? index.vis.length : (index?.count ?? null) };
    const changed = jsonOf(await client.callTool({ name: 'list_changed_vis', arguments: { repositoryRoot: CORPUS, baseHash: BASE, selectedHash: SEL } }));
    evidence.phases.changedVis = { schema: changed?.schema, count: changed?.count, changedVis: changed?.changedVis };
    log('phase2: repo index viCount=' + evidence.phases.repositoryIndex.viCount + ', changedVis=' + (changed?.count));
    if (!index || index.schema !== 'vi-history-suite/vi-repository-index@v1') problems.push('bad repository-index schema');
    if (!changed || changed.schema !== 'vi-history-suite/changed-vis@v1') problems.push('bad changed-vis schema');

    // ---- Phase 3: REAL container comparison (the crux) ----
    const healthOk = health && CONTAINER_PROVIDERS.has(health.provider) && !health.blocked && (health.containerImage || '').includes(IMAGE_VERSION);
    if (!healthOk) {
      log('phase3 SKIPPED: runtime not ready (provider=' + health?.provider + ' image=' + health?.containerImage + ' blocked=' + health?.blocked + ')');
      evidence.phases.compareCold = { status: 'skipped', reason: 'runtime-not-ready' };
      throw new Error('runtime not ready for a container compare; skipping the long phases');
    }
    log('phase3: compare_vi_revisions via REAL LabVIEW in ' + IMAGE + ' (cold; minutes)...');
    const t0 = Date.now();
    const coldRes = await client.callTool({ name: 'compare_vi_revisions', arguments: { repositoryRoot: CORPUS, relativePath: VI, baseHash: BASE, selectedHash: SEL, runtime: RUNTIME } }, undefined, { timeout: COMPARE_TIMEOUT_MS });
    const coldMs = Date.now() - t0;
    const coldText = textOf(coldRes);
    if (coldRes.isError === true || coldText.startsWith('Comparison ')) {
      evidence.phases.compareCold = { status: 'not-completed', ms: coldMs, error: coldText.slice(0, 400) };
      problems.push('cold compare not completed: ' + coldText.slice(0, 160));
    } else {
      const model = JSON.parse(coldText);
      const modelHash = crypto.createHash('sha256').update(JSON.stringify(model)).digest('hex').slice(0, 16);
      evidence.phases.compareCold = { status: 'completed', ms: coldMs, schema: model.schema, provider: model.runtime?.provider, engine: model.runtime?.engine, containerImage: model.runtime?.containerImage, hasDifferences: model.hasDifferences, changedSurfaces: model.changedSurfaces, changeKinds: model.changeKinds, riskLevel: model.riskLevel, modelHash, narrative: (model.narrative || '').slice(0, 200) };
      log('phase3 DONE in ' + (coldMs / 1000).toFixed(1) + 's: schema=' + model.schema + ' provider=' + model.runtime?.provider + ' hasDiff=' + model.hasDifferences + ' surfaces=' + JSON.stringify(model.changedSurfaces) + ' hash=' + modelHash);
      if (model.schema !== 'vi-history-suite/vi-semantic-comparison@v1') problems.push('bad comparison schema');
      if (!Array.isArray(model.changedSurfaces)) problems.push('comparison missing changedSurfaces');

      // ---- Phase 4: schema + validate the real model ----
      let schemaFetched = false;
      try {
        const schema = jsonOf(await client.callTool({ name: 'get_vi_semantic_schema', arguments: {} }));
        schemaFetched = Boolean(schema);
      } catch (e) {
        log('phase4 get_vi_semantic_schema: ' + e.message);
        problems.push('get_vi_semantic_schema errored: ' + e.message);
      }
      try {
        const valid = jsonOf(await client.callTool({ name: 'validate_vi_semantic_document', arguments: { document: model } }));
        evidence.phases.validate = { schemaFetched, valid: valid?.valid, errorCount: Array.isArray(valid?.errors) ? valid.errors.length : null };
        log('phase4: validate_vi_semantic_document valid=' + valid?.valid);
        if (!valid || valid.valid !== true) problems.push('real model failed schema validation: ' + JSON.stringify(valid?.errors)?.slice(0, 200));
      } catch (e) {
        log('phase4 validate: ' + e.message);
        problems.push('phase4 validate errored: ' + e.message);
      }

      // ---- Phase 5: warm-cache repeat compare = idempotent identical model ----
      log('phase5: repeat compare (warm comparison-model cache; expect fast + identical)...');
      const t5 = Date.now();
      const warmRes = await client.callTool({ name: 'compare_vi_revisions', arguments: { repositoryRoot: CORPUS, relativePath: VI, baseHash: BASE, selectedHash: SEL, runtime: RUNTIME } }, undefined, { timeout: COMPARE_TIMEOUT_MS });
      const warmMs = Date.now() - t5;
      const warmText = textOf(warmRes);
      let warmHash = null;
      if (!warmRes.isError && !warmText.startsWith('Comparison ')) {
        warmHash = crypto.createHash('sha256').update(JSON.stringify(JSON.parse(warmText))).digest('hex').slice(0, 16);
      }
      evidence.phases.compareWarm = { status: warmHash ? 'completed' : 'not-completed', ms: warmMs, modelHash: warmHash, identical: warmHash === evidence.phases.compareCold.modelHash, spedUp: warmMs < coldMs };
      log('phase5: warm ' + (warmMs / 1000).toFixed(1) + 's hash=' + warmHash + ' identical=' + (warmHash === evidence.phases.compareCold.modelHash));
      if (warmHash !== evidence.phases.compareCold.modelHash) problems.push('warm cache model not identical to cold');
    }

    // ---- Phase 6 (optional): PR review over the container ----
    if (RUN_PR_REVIEW && evidence.phases.compareCold?.status === 'completed') {
      log('phase6: build_vi_pr_review (container; every changed VI)...');
      const pr = await client.callTool({ name: 'build_vi_pr_review', arguments: { repositoryRoot: CORPUS, baseHash: BASE, selectedHash: SEL, runtime: RUNTIME } }, undefined, { timeout: COMPARE_TIMEOUT_MS });
      const prJson = jsonOf(pr);
      evidence.phases.prReview = { status: pr.isError ? 'error' : 'ok', schema: prJson?.schema, reviewedVis: prJson?.reviews?.length ?? null };
      log('phase6: pr-review schema=' + prJson?.schema);
    }

    // ---- Error contract: -32602 with data.issues on a bad arg ----
    try {
      await client.callTool({ name: 'index_repository_vis', arguments: {} });
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
    if (evidence.phases.compareCold?.status !== 'skipped') problems.push('FATAL: ' + (e?.message || e));
    log('caught: ' + (e?.stack || e));
  } finally {
    await client.close().catch(() => undefined);
    dockerRmByAncestor();
  }

  evidence.problems = problems;
  evidence.ok = problems.length === 0 && evidence.phases.compareCold?.status === 'completed';
  const outPath = process.env.VIHS_MCP_OUT;
  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
    log('evidence -> ' + outPath);
  }
  console.log('\n===== MCP CONTAINER E2E =====');
  console.log(JSON.stringify({ ok: evidence.ok, image: IMAGE, protocol: evidence.phases.protocol, runtimeHealth: { provider: evidence.phases.runtimeHealth?.provider, image: evidence.phases.runtimeHealth?.containerImage, blocked: evidence.phases.runtimeHealth?.blocked }, compareCold: evidence.phases.compareCold, compareWarm: evidence.phases.compareWarm, validate: evidence.phases.validate, errorContract: evidence.phases.errorContract, problems }, null, 2));
  console.log(evidence.ok ? '\nRESULT: PASS — MCP server proven end-to-end against real LabVIEW in the container.' : '\nRESULT: FAIL — ' + problems.join('; '));
  process.exitCode = evidence.ok ? 0 : 1;
}

main().catch((e) => {
  log('FATAL ' + (e?.stack || e));
  dockerRmByAncestor();
  process.exitCode = 1;
});
