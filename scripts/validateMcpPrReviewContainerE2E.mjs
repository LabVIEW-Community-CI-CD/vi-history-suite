// End-to-end MCP PR-review validation against REAL LabVIEW in a Windows LabVIEW
// container, targeting a real pull-request change surface (default:
// ni/labview-icon-editor PR #537). Sibling of scripts/validateMcpContainerE2E.mjs
// and scripts/lvkitMcpAgentValidation.mjs (VHS-REQ-712).
//
// Drives the SHIPPED VI semantic MCP server (out/cli/runViSemanticMcpServer.js)
// as a REAL Model Context Protocol client over stdio (@modelcontextprotocol/sdk)
// and exercises the agent PR-review workflow against a real multi-VI change
// surface, steering the runtime-gated tools to the container via
// runtime.containerImageVersion:
//   phase 0  protocol surface (tools advertised)
//   phase 1  get_runtime_health (container-aware; fast-fail if not ready)
//   phase 2  list_changed_vis(base, head) — the PR's changed VIs (pure Git)
//   phase 2b review_pull_request prompt — the agent-guided plan references build_vi_pr_review
//   phase 3  build_vi_pr_review (JSON) over the container — a REAL multi-VI review (the crux)
//   phase 4  build_vi_pr_review (markdown) — the sticky PR-comment body
//   phase 5  compare_vi_revisions on one changed VI, cold then warm — identical (idempotency) + schema-valid
//   +        error contract: a bad-arg call returns JSON-RPC -32602 with data.issues
//
// Setup isolation + idempotency: a fresh server process and a fresh
// `docker run --rm` container per comparison, plus clearing the comparison-model
// cache so the focused compare is cold and its repeat is a cache hit. The
// per-VI reviewed count is bounded by maxVis (each reviewed VI is a fresh cold
// container comparison), so an autonomous run stays tractable while a maintainer
// can raise VIHS_MCP_MAX_VIS to review the whole PR.
//
// Maintainer harness (.mjs, inventory-exempt, coverage-exempt, NOT in npm test):
// Windows + Docker in Windows-container mode with the image pulled, and a local
// Git clone of the target repo with the base+head commits fetched
// (`git fetch origin pull/<N>/head`). Not a hosted CI gate. Run from the repo
// root AFTER `npm run compile`:
//   node scripts/validateMcpPrReviewContainerE2E.mjs
//
// Env (all optional; override BASE/SEL/REPO to target any PR change surface):
//   VIHS_MCP_IMAGE_VERSION   container image tag suffix (default 2026q1patch2-windows)
//   VIHS_MCP_REPO            git repo clone (default C:\repos\labview-icon-editor)
//   VIHS_MCP_BASE            base revision (default PR #537 base 9545c483...)
//   VIHS_MCP_SEL             head revision (default PR #537 head f57c3cfd...)
//   VIHS_MCP_MAX_VIS         cap on reviewed VIs (default 3; tool ceiling 200)
//   VIHS_MCP_CALL_TIMEOUT_MS per-call MCP request timeout (default 1800000)
//   VIHS_MCP_OUT             write the typed evidence JSON to this path
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

const REPO = process.cwd();
const serverEntry = path.join(REPO, 'out', 'cli', 'runViSemanticMcpServer.js');
const IMAGE_VERSION = process.env.VIHS_MCP_IMAGE_VERSION || '2026q1patch2-windows';
const IMAGE = 'nationalinstruments/labview:' + IMAGE_VERSION;
const CORPUS = process.env.VIHS_MCP_REPO || 'C:\\repos\\labview-icon-editor';
const BASE = process.env.VIHS_MCP_BASE || '9545c483f2b947c71de68c7f70aedefaedadabf7';
const HEAD = process.env.VIHS_MCP_SEL || 'f57c3cfd6494abf1da968ddcc116222e93e953b4';
const MAX_VIS = Number(process.env.VIHS_MCP_MAX_VIS || 3);
const CACHE_DIR = path.join(os.tmpdir(), 'vihs-vi-comparison-cache');
const CALL_TIMEOUT_MS = Number(process.env.VIHS_MCP_CALL_TIMEOUT_MS || 1800000);
const RUNTIME = { provider: 'docker', platform: 'win32', bitness: 'x64', containerImageVersion: IMAGE_VERSION };
const CONTAINER_PROVIDERS = new Set(['docker', 'windows-container', 'linux-container']);

const evidence = { schema: 'vi-history-suite/mcp-pr-review-e2e-evidence@v1', generatedAt: new Date().toISOString(), image: IMAGE, corpus: { CORPUS, BASE, HEAD, MAX_VIS }, phases: {}, ok: false };
const problems = [];
const log = (m) => process.stderr.write('[mcp-pr] ' + m + '\n');
const textOf = (r) => ((r?.content || []).find((c) => c.type === 'text')?.text) ?? '';
function jsonOf(r) {
  try {
    return JSON.parse(textOf(r));
  } catch {
    return null;
  }
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
function preflightDocker() {
  let serverOs;
  try {
    serverOs = execFileSync('docker', ['version', '--format', '{{.Server.Os}}'], { encoding: 'utf8', timeout: 30000 }).trim();
  } catch (err) {
    log('Docker not available: ' + (err.message || err));
    process.exit(2);
  }
  if (serverOs !== 'windows') {
    log(`Docker engine is "${serverOs}", not "windows". Switch Docker Desktop to Windows containers.`);
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
  log('cleared ' + removed + ' stale container(s) + comparison-model cache; base=' + BASE.slice(0, 8) + ' head=' + HEAD.slice(0, 8) + ' maxVis=' + MAX_VIS);

  const transport = new StdioClientTransport({ command: process.execPath, args: [serverEntry], env: { ...process.env }, stderr: 'pipe' });
  const client = new Client({ name: 'vihs-mcp-pr-review-e2e', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);

  try {
    // Phase 0: protocol surface
    const toolNames = ((await client.listTools()).tools || []).map((t) => t.name);
    const want = ['list_changed_vis', 'build_vi_pr_review', 'compare_vi_revisions', 'get_runtime_health'];
    const missing = want.filter((n) => !toolNames.includes(n));
    evidence.phases.protocol = { toolCount: toolNames.length, missing };
    if (missing.length) problems.push('missing tools: ' + missing.join(','));
    log('phase0: ' + toolNames.length + ' tools');

    // Phase 1: runtime-health (container-aware, fast-fail)
    const health = jsonOf(await client.callTool({ name: 'get_runtime_health', arguments: { platform: 'win32', settings: { requestedProvider: 'docker', containerImageVersion: IMAGE_VERSION } } }));
    evidence.phases.runtimeHealth = health;
    const healthOk = health && CONTAINER_PROVIDERS.has(health.provider) && !health.blocked && (health.containerImage || '').includes(IMAGE_VERSION);
    log('phase1 runtime-health: provider=' + health?.provider + ' image=' + health?.containerImage + ' blocked=' + health?.blocked);
    if (!healthOk) {
      problems.push('runtime not ready: provider=' + health?.provider + ' image=' + health?.containerImage + ' blocked=' + health?.blocked);
      throw new Error('runtime not ready');
    }

    // Phase 2: list_changed_vis on the PR change surface
    const changed = jsonOf(await client.callTool({ name: 'list_changed_vis', arguments: { repositoryRoot: CORPUS, baseHash: BASE, selectedHash: HEAD } }));
    evidence.phases.changedVis = { schema: changed?.schema, count: changed?.count, sample: (changed?.changedVis || []).slice(0, 6) };
    log('phase2: list_changed_vis count=' + changed?.count + ' e.g. ' + (changed?.changedVis || []).slice(0, 3).join(' | '));
    if (!changed || changed.schema !== 'vi-history-suite/changed-vis@v1') problems.push('bad changed-vis schema');
    if (!(changed?.count > 0)) problems.push('change surface surfaced no changed VIs');
    const firstVi = (changed?.changedVis || [])[0];

    // Phase 2b: review_pull_request PROMPT (agent-guided plan; no runtime)
    try {
      const prompt = await client.getPrompt({ name: 'review_pull_request', arguments: { repositoryRoot: CORPUS, baseHash: BASE, selectedHash: HEAD, maxVis: String(MAX_VIS) } });
      const body = (prompt.messages || []).map((m) => (typeof m.content?.text === 'string' ? m.content.text : '')).join('\n');
      evidence.phases.prompt = { messageCount: (prompt.messages || []).length, mentionsPrReview: body.includes('build_vi_pr_review'), mentionsHead: body.includes(HEAD.slice(0, 8)) || body.includes(HEAD) };
      log('phase2b: review_pull_request prompt msgs=' + (prompt.messages || []).length + ' mentionsPrReview=' + evidence.phases.prompt.mentionsPrReview);
      if (!evidence.phases.prompt.mentionsPrReview) problems.push('review_pull_request prompt does not reference build_vi_pr_review');
    } catch (e) {
      log('phase2b prompt: ' + e.message);
      problems.push('review_pull_request prompt errored: ' + e.message);
    }

    // Phase 3: build_vi_pr_review (JSON) over the container — the crux
    log('phase3: build_vi_pr_review JSON over ' + IMAGE + ' (maxVis=' + MAX_VIS + '; ~' + MAX_VIS + ' cold container compares)...');
    const t3 = Date.now();
    const prRes = await client.callTool({ name: 'build_vi_pr_review', arguments: { repositoryRoot: CORPUS, baseHash: BASE, selectedHash: HEAD, runtime: RUNTIME, maxVis: MAX_VIS } }, undefined, { timeout: CALL_TIMEOUT_MS });
    const prMs = Date.now() - t3;
    const prText = textOf(prRes);
    if (prRes.isError === true || prText.startsWith('PR review ') || prText.startsWith('Comparison ')) {
      evidence.phases.prReview = { status: 'not-completed', ms: prMs, error: prText.slice(0, 400) };
      problems.push('pr-review not completed: ' + prText.slice(0, 160));
    } else {
      const review = JSON.parse(prText);
      const entryStatuses = (review.entries || []).map((e) => ({ path: e.relativePath, status: e.status, surfaces: e.changedSurfaces || e.comparison?.changedSurfaces }));
      evidence.phases.prReview = { status: 'completed', ms: prMs, schema: review.schema, changedViCount: review.changedViCount, reviewedCount: review.reviewedCount, totals: review.totals, entries: entryStatuses, narrative: (review.narrative || '').slice(0, 300) };
      log('phase3 DONE in ' + (prMs / 1000).toFixed(1) + 's: schema=' + review.schema + ' changedViCount=' + review.changedViCount + ' reviewedCount=' + review.reviewedCount + ' totals=' + JSON.stringify(review.totals));
      for (const e of entryStatuses) log('   - [' + e.status + '] ' + e.path + (e.surfaces ? ' surfaces=' + JSON.stringify(e.surfaces) : ''));
      if (review.schema !== 'vi-history-suite/vi-semantic-pr-review@v1') problems.push('bad pr-review schema');
      if (!Array.isArray(review.entries) || review.entries.length === 0) problems.push('pr-review has no entries');
      if (review.reviewedCount > MAX_VIS) problems.push('pr-review exceeded maxVis cap');
      if (!(review.narrative || '').trim()) problems.push('pr-review missing narrative');
    }

    // Phase 4: build_vi_pr_review (markdown) — the sticky PR-comment body (bounded maxVis=1)
    if (evidence.phases.prReview?.status === 'completed') {
      log('phase4: build_vi_pr_review markdown (maxVis=1) — sticky PR-comment body...');
      const mdRes = await client.callTool({ name: 'build_vi_pr_review', arguments: { repositoryRoot: CORPUS, baseHash: BASE, selectedHash: HEAD, runtime: RUNTIME, maxVis: 1, format: 'markdown' } }, undefined, { timeout: CALL_TIMEOUT_MS });
      const md = textOf(mdRes);
      evidence.phases.markdown = { bytes: md.length, hasHeading: /(^|\n)#{1,3}\s/.test(md), mentionsVi: /\.vi\b/i.test(md), head: md.slice(0, 160) };
      log('phase4: markdown ' + md.length + ' bytes hasHeading=' + evidence.phases.markdown.hasHeading + ' mentionsVi=' + evidence.phases.markdown.mentionsVi);
      if (!(md.length > 40 && evidence.phases.markdown.hasHeading)) problems.push('markdown PR-review body not a proper comment');
    }

    // Phase 5: focused cached compare on a changed VI (cold -> warm identical) + schema validation
    if (firstVi) {
      log('phase5: compare_vi_revisions on ' + firstVi + ' (cold, then warm cache)...');
      const c0 = Date.now();
      const cold = await client.callTool({ name: 'compare_vi_revisions', arguments: { repositoryRoot: CORPUS, relativePath: firstVi, baseHash: BASE, selectedHash: HEAD, runtime: RUNTIME } }, undefined, { timeout: CALL_TIMEOUT_MS });
      const coldMs = Date.now() - c0;
      const coldText = textOf(cold);
      if (cold.isError || coldText.startsWith('Comparison ')) {
        evidence.phases.compare = { status: 'not-completed', ms: coldMs, error: coldText.slice(0, 300) };
        problems.push('focused compare not completed: ' + coldText.slice(0, 160));
      } else {
        const model = JSON.parse(coldText);
        const coldHash = crypto.createHash('sha256').update(JSON.stringify(model)).digest('hex').slice(0, 16);
        const w0 = Date.now();
        const warm = await client.callTool({ name: 'compare_vi_revisions', arguments: { repositoryRoot: CORPUS, relativePath: firstVi, baseHash: BASE, selectedHash: HEAD, runtime: RUNTIME } }, undefined, { timeout: CALL_TIMEOUT_MS });
        const warmMs = Date.now() - w0;
        const warmHash = crypto.createHash('sha256').update(JSON.stringify(JSON.parse(textOf(warm)))).digest('hex').slice(0, 16);
        const valid = jsonOf(await client.callTool({ name: 'validate_vi_semantic_document', arguments: { document: model } }));
        evidence.phases.compare = { status: 'completed', vi: firstVi, coldMs, warmMs, coldHash, warmHash, identical: coldHash === warmHash, hasDifferences: model.hasDifferences, changedSurfaces: model.changedSurfaces, valid: valid?.valid };
        log('phase5: cold ' + (coldMs / 1000).toFixed(1) + 's warm ' + (warmMs / 1000).toFixed(1) + 's identical=' + (coldHash === warmHash) + ' valid=' + valid?.valid + ' hasDiff=' + model.hasDifferences);
        if (coldHash !== warmHash) problems.push('warm compare not identical to cold');
        if (valid?.valid !== true) problems.push('focused model failed schema validation');
      }
    }

    // Error contract
    try {
      await client.callTool({ name: 'build_vi_pr_review', arguments: { repositoryRoot: CORPUS } });
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
    if (!problems.some((p) => p.startsWith('runtime not ready'))) problems.push('FATAL: ' + (e?.message || e));
    log('caught: ' + (e?.stack || e));
  } finally {
    await client.close().catch(() => undefined);
    dockerRmByAncestor();
  }

  evidence.problems = problems;
  evidence.ok = problems.length === 0 && evidence.phases.prReview?.status === 'completed';
  const outPath = process.env.VIHS_MCP_OUT;
  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
    log('evidence -> ' + outPath);
  }
  console.log('\n===== MCP PR-REVIEW E2E =====');
  console.log(JSON.stringify({ ok: evidence.ok, image: IMAGE, changedVis: evidence.phases.changedVis, prompt: evidence.phases.prompt, prReview: evidence.phases.prReview, markdown: evidence.phases.markdown, compare: evidence.phases.compare, errorContract: evidence.phases.errorContract, problems }, null, 2));
  console.log(evidence.ok ? '\nRESULT: PASS — MCP reviewed the change surface end-to-end against real LabVIEW in the container.' : '\nRESULT: FAIL — ' + problems.join('; '));
  process.exitCode = evidence.ok ? 0 : 1;
}

main().catch((e) => {
  log('FATAL ' + (e?.stack || e));
  dockerRmByAncestor();
  process.exitCode = 1;
});
