// Grounding-ROUTED multi-VI relay review (Ideas #2374 / synthesizes #2371 + #2373).
// For a commit range base..head, list the changed + born VIs, then per VI ROUTE
// the grounding:
//   - born  (git status A, no parent) -> full lvkit `generate` (born-from-scratch),
//     captured as a shipped lvkit-vi-scan@v1 envelope and persisted through the
//     shipped store (createDefaultLvkitViScanStore, upgrade-only precedence);
//   - changed (git status M, has a parent) -> lvkit `diff` (base:vi vs head:vi),
//     projected onto the shared vi-semantic model.
// Each VI's grounding is handed to a local Ollama model with the evidence-r2
// scaffold, and EVERY reply is validated against the shipped vihs-relay@v1 schema
// (we never trust the model word). The per-VI envelopes aggregate into ONE review.
//
// Same AI split as the rest of the prototype: the MODEL owns prose+verdict; this
// DRIVER owns the environment (real lvkit grounding staged in the LabVIEW-free
// vihs-lvkit-stage container) and the CONTRACT (routing + schema validation).
//
// Prototype harness (.mjs, inventory-exempt; not shipped, not in npm test). Run
// from the repo root AFTER `npm run compile`, Docker in linux-engine mode, Ollama
// serving the model:
//   node prototype/relayPrReviewRouter.mjs
//
// Env:
//   VIHS_PRR_REPO    corpus git repo (default ~/repos/labview-icon-editor)
//   VIHS_PRR_BASE    base revision   (default 537683398d8c)
//   VIHS_PRR_HEAD    head revision   (default fc09736ae5e3)
//   VIHS_PRR_IMAGE   lvkit-in-container image (default vihs-lvkit-stage:local)
//   VIHS_PRR_LIMIT   max VIs to review (default 0 = all changed+born in range)
//   VIHS_OLLAMA_URL / VIHS_OLLAMA_MODEL  (default http://localhost:11434 / llama3.1:8b)
//   VIHS_PRR_OUT     write the typed review evidence JSON here
//
// Exit 0 when every reviewed VI produced a valid envelope; 1 when any did not;
// 2 on preflight (no compiled model / Ollama unreachable / no changed+born VIs).

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { extractEnvelope, validate, normalizeEnvelope, SCHEMA } from './relay.mjs';

const REPO = process.cwd();
const CORPUS = process.env.VIHS_PRR_REPO || path.join(os.homedir(), 'repos', 'labview-icon-editor');
const BASE = process.env.VIHS_PRR_BASE || '537683398d8c';
const HEAD = process.env.VIHS_PRR_HEAD || 'fc09736ae5e3';
const IMAGE = process.env.VIHS_PRR_IMAGE || 'vihs-lvkit-stage:local';
const LIMIT = process.env.VIHS_PRR_LIMIT !== undefined ? Number(process.env.VIHS_PRR_LIMIT) : 0;
const OLLAMA = process.env.VIHS_OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.VIHS_OLLAMA_MODEL || 'llama3.1:8b';
const OUT = process.env.VIHS_PRR_OUT || '';

const log = (m) => process.stderr.write('[pr-review-router] ' + m + '\n');

async function loadCompiled(rel) {
  const f = path.join(REPO, 'out', 'semantic', 'lvkit', rel);
  if (!fs.existsSync(f)) {
    log(`missing out/semantic/lvkit/${rel}; run \`npm run compile\` first.`);
    process.exit(2);
  }
  return import(path.sep === '\\' ? 'file://' + f.replace(/\\/g, '/') : f);
}

// ── VI classification for the range: A (born -> generate) / M (changed -> diff) ─
function listRangeVis() {
  const out = execFileSync('git', ['-C', CORPUS, 'diff', '--name-status', '--diff-filter=AM', BASE, HEAD, '--', '*.vi'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  const vis = [];
  for (const line of out.split(/\r?\n/)) {
    const m = /^([AM])\t(.+)$/.exec(line.trim());
    if (m) vis.push({ status: m[1], viPath: m[2], route: m[1] === 'A' ? 'generate' : 'diff' });
  }
  return vis;
}

function gitBlob(rev, vi) {
  return execFileSync('git', ['-C', CORPUS, 'cat-file', '-p', `${rev}:${vi}`], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
}

// ── changed VI: stage a real lvkit diff (base vs head) in the container ───────
const DIFF_SCRIPT = [
  'git config --global --add safe.directory /repo >/dev/null 2>&1',
  'cd /tmp',
  'git -C /repo cat-file -p "$B:$V" > base.vi 2>/dev/null',
  'git -C /repo cat-file -p "$H:$V" > sel.vi 2>/dev/null',
  'lvkit diff base.vi sel.vi --format json --load-mode minimal --no-auto-vilib 2>/dev/null'
].join('; ');

function stageDiffJson(vi) {
  return execFileSync(
    'docker',
    ['run', '--rm', '-e', `B=${BASE}`, '-e', `H=${HEAD}`, '-e', `V=${vi}`, '-v', `${CORPUS}:/repo:ro`, IMAGE, 'sh', '-c', DIFF_SCRIPT],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }
  );
}

// ── born VI: stage a real born-from-scratch generate (head bytes) ─────────────
const GEN_SCRIPT = [
  'git config --global --add safe.directory /repo >/dev/null 2>&1',
  'git -C /repo cat-file -p "$H:$V" > /tmp/cur.vi 2>/dev/null',
  'lvkit generate /tmp/cur.vi --load-mode minimal --no-auto-vilib --placeholder-on-unresolved -o /tmp/out >/dev/null 2>&1',
  'if [ -d /tmp/out ]; then cd /tmp/out && tar cf - .; fi'
].join('; ');

function stageGenerateModules(vi) {
  const tarBytes = execFileSync(
    'docker',
    ['run', '--rm', '-e', `H=${HEAD}`, '-e', `V=${vi}`, '-v', `${CORPUS}:/repo:ro`, IMAGE, 'sh', '-c', GEN_SCRIPT],
    { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 }
  );
  if (!tarBytes || tarBytes.length === 0) return [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-prr-'));
  try {
    const tarPath = path.join(tmp, 'gen.tar');
    fs.writeFileSync(tarPath, tarBytes);
    const dest = path.join(tmp, 'out');
    fs.mkdirSync(dest);
    execFileSync('tar', ['xf', tarPath, '-C', dest]);
    const modules = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.isFile()) modules.push({ relativePath: path.relative(dest, p).replace(/\\/g, '/'), python: fs.readFileSync(p, 'utf8') });
      }
    };
    walk(dest);
    return modules;
  } catch {
    return [];
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ── evidence-r2 prompts (diff + born) ─────────────────────────────────────────
const SYSTEM_DIFF = 'You are a LabVIEW VI change reviewer. You are given a REAL lvkit semantic diff of one VI (block-diagram scope). Base every statement strictly on the provided facts — never invent changes.';
const SYSTEM_BORN = 'You are a LabVIEW VI reviewer. You are given the FULL lvkit `generate` output (Python mirroring the block diagram) of a VI at its FIRST commit — born from scratch, no parent to diff. Base every statement strictly on the provided generated code — never invent behavior.';

function diffPrompt(groundingText) {
  return `Review this VI change. End with ONE fenced \`\`\`vihs-relay\`\`\` JSON block. Required fields: schema="${SCHEMA}", from="ollama", kind="RESULT", summary (one line). Populate evidence[] with one entry PER DISTINCT CHANGE in the facts (name = the change kind such as node-added / node-removed / wire-change, result = the grounded count or detail); do not leave evidence[] empty when the facts list changes. ALWAYS output the fenced block even for zero changes (summary says no changes, evidence []). For any other optional field omit it or use "" — never null.\nlvkit facts (JSON):\n\`\`\`json\n${groundingText}\n\`\`\``;
}
function bornPrompt(groundingText) {
  return `This VI is at its FIRST commit (born from scratch; no prior revision to diff). Review its full lvkit generate output and end with ONE fenced \`\`\`vihs-relay\`\`\` JSON block. Required fields: schema="${SCHEMA}", from="ollama", kind="RESULT", summary (one line describing what the NEW VI does). Populate evidence[] with one entry PER NOTABLE generated element (name = the element, e.g. subvi-call / control / constant / loop; result = the grounded detail). For any other optional field omit it or use "" — never null.\nborn-from-scratch generate (JSON):\n\`\`\`json\n${groundingText}\n\`\`\``;
}

async function ollamaChat(system, userText) {
  const res = await fetch(OLLAMA + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: userText }], stream: false, options: { temperature: 0, num_ctx: 8192 } })
  });
  if (!res.ok) throw new Error('ollama /api/chat ' + res.status);
  return (await res.json()).message?.content ?? '';
}

function scoreReply(reply) {
  const env = extractEnvelope(reply);
  if (!env) return { ok: false, errors: ['no fenced vihs-relay block found'], envelope: null };
  const errors = validate(env);
  if (errors.length) return { ok: false, errors, envelope: env };
  return { ok: true, errors: null, envelope: normalizeEnvelope(env) };
}

// GROUNDING-FAITHFULNESS cross-check (we never trust the model word): a
// schema-valid envelope can still CONTRADICT the grounding. For a changed VI
// whose lvkit facts show N>0 changes, an envelope that lists NO evidence AND
// asserts "no changes" is UNFAITHFUL (observed: 8b summarized 6-change VIs as
// "no changes detected"). Returns true=faithful, false=unfaithful, null=n/a.
function assessFaithful(route, ground, envelope) {
  if (!envelope) return null;
  if (route === 'diff') {
    const changeCount = Number(ground.changeCount) || 0;
    if (changeCount === 0) return true;
    const summary = String(envelope.summary || '');
    const evidenceText = Array.isArray(envelope.evidence) ? JSON.stringify(envelope.evidence) : '';
    const saysNoChange = /\bno\b[^.]*\b(change|difference|update)/i.test(summary);
    // Authoritative anchor: lvkit says N>0 changes. Unfaithful when the summary
    // asserts "no changes" AND the envelope never cites the real count N anywhere
    // (summary or evidence). Citing N (e.g. MouseDown "...but 6 changes") stays
    // faithful even if a sub-scope had none; a bare "no changes" with no N is an
    // under-report. Non-empty evidence alone is NOT enough -- a contradictory
    // "no changes" headline over real changes is still misleading.
    const citesRealCount = new RegExp('(^|[^0-9])' + changeCount + '([^0-9]|$)').test(summary + ' ' + evidenceText);
    return !(saysNoChange && !citesRealCount);
  }
  // born/generate route: the VI always has modules and the summary reflects the
  // generated code / placeholder; no under-report class observed here.
  return true;
}

async function main() {
  const { parseLvkitDiffJson } = await loadCompiled('lvkitDiffModel.js');
  const { buildViSemanticModelFromLvkitDiff } = await loadCompiled('lvkitSemanticAdapter.js');
  const { buildLvkitViScanEnvelope } = await loadCompiled('lvkitViScanModel.js');
  const { createDefaultLvkitViScanStore } = await loadCompiled('lvkitViScanStore.js');
  const store = createDefaultLvkitViScanStore(CORPUS);

  try {
    const tags = await (await fetch(OLLAMA + '/api/tags')).json();
    if (!(tags.models || []).some((m) => m.name === MODEL || m.name === MODEL + ':latest')) {
      log(`model ${MODEL} not in Ollama; pull it: ollama pull ${MODEL}`);
      process.exit(2);
    }
  } catch (e) {
    log(`Ollama not reachable at ${OLLAMA} (${e.message})`);
    process.exit(2);
  }

  let vis = listRangeVis();
  if (!vis.length) {
    log(`no changed/born VIs in ${BASE.slice(0, 8)}..${HEAD.slice(0, 8)}`);
    process.exit(2);
  }
  if (LIMIT > 0) vis = vis.slice(0, LIMIT);
  const routeCounts = vis.reduce((a, v) => ((a[v.route] = (a[v.route] || 0) + 1), a), {});
  log(`${vis.length} VI(s) in range: ${JSON.stringify(routeCounts)}`);

  const review = {
    schema: 'vi-history-suite/relay-pr-review-router@v1',
    generatedAt: new Date().toISOString(),
    model: MODEL,
    corpus: CORPUS,
    base: BASE,
    head: HEAD,
    routeCounts,
    items: []
  };

  for (const vi of vis) {
    const name = path.basename(vi.viPath);
    let groundingSource;
    let ground;
    try {
      if (vi.route === 'diff') {
        const raw = stageDiffJson(vi.viPath);
        const diff = parseLvkitDiffJson(raw);
        const model = buildViSemanticModelFromLvkitDiff(diff, { title: name, firstViPath: `base:${vi.viPath}`, secondViPath: `head:${vi.viPath}`, revisions: { baseHash: BASE, selectedHash: HEAD } });
        ground = { vi: name, changeCount: diff.changes.length, changedSurfaces: model.changedSurfaces, changeKinds: model.changeKinds, riskLevel: model.riskLevel, totals: model.totals, narrative: model.narrative };
        groundingSource = 'lvkit-diff';
      } else {
        const modules = stageGenerateModules(vi.viPath);
        if (!modules.length) throw new Error('no generated output');
        const contentSignature = 'sha256:' + crypto.createHash('sha256').update(gitBlob(HEAD, vi.viPath)).digest('hex');
        const envelope = buildLvkitViScanEnvelope({ viPath: vi.viPath, contentSignature, runtime: 'linux-container', generatedAt: new Date().toISOString(), lvkitSource: 'path', modules });
        await store.put(envelope); // shipped store + upgrade-only precedence
        ground = { vi: name, moduleCount: envelope.moduleCount, resolvedModuleCount: envelope.resolvedModuleCount, errorModuleCount: envelope.errorModuleCount, primaryModulePath: envelope.primaryModule ? envelope.primaryModule.relativePath : null, primaryModulePython: envelope.primaryModule ? envelope.primaryModule.python : null };
        groundingSource = 'lvkit-vi-scan@v1 store (get_vi_generated_code path)';
      }
    } catch (e) {
      review.items.push({ vi: name, viPath: vi.viPath, route: vi.route, ok: false, errors: ['grounding-failed: ' + (e && e.message ? e.message : e)], envelope: null });
      log(`  ! ${vi.route} ${name}: grounding failed`);
      continue;
    }
    const system = vi.route === 'diff' ? SYSTEM_DIFF : SYSTEM_BORN;
    const prompt = vi.route === 'diff' ? diffPrompt(JSON.stringify(ground, null, 2)) : bornPrompt(JSON.stringify(ground, null, 2));
    let scored;
    try {
      scored = scoreReply(await ollamaChat(system, prompt));
    } catch (e) {
      scored = { ok: false, errors: [e && e.message ? e.message : String(e)], envelope: null };
    }
    const groundingMetrics = vi.route === 'diff'
      ? { changeCount: ground.changeCount, riskLevel: ground.riskLevel }
      : { moduleCount: ground.moduleCount, errorModuleCount: ground.errorModuleCount };
    const faithful = assessFaithful(vi.route, ground, scored.ok ? scored.envelope : null);
    review.items.push({ vi: name, viPath: vi.viPath, route: vi.route, groundingSource, groundingMetrics, ok: scored.ok, faithful, errors: scored.errors, summary: scored.ok ? scored.envelope.summary : null, envelope: scored.envelope });
    const faithNote = scored.ok && faithful === false ? ` [UNFAITHFUL: facts show ${ground.changeCount} changes]` : '';
    log(`  ${scored.ok ? (faithful === false ? '~' : '+') : '!'} ${vi.route} ${name}: ${scored.ok ? 'VALID — ' + scored.envelope.summary + faithNote : 'invalid: ' + (scored.errors || []).join('; ')}`);
  }

  const valid = review.items.filter((i) => i.ok);
  const unfaithful = review.items.filter((i) => i.ok && i.faithful === false);
  review.summary = {
    total: review.items.length,
    valid: valid.length,
    faithful: valid.length - unfaithful.length,
    unfaithful: unfaithful.map((i) => ({ vi: i.vi, changeCount: i.groundingMetrics.changeCount, claimed: i.summary })),
    diffReviewed: review.items.filter((i) => i.route === 'diff' && i.ok).length,
    generateReviewed: review.items.filter((i) => i.route === 'generate' && i.ok).length,
    allValid: valid.length === review.items.length,
    allFaithful: unfaithful.length === 0
  };

  if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(review, null, 2) + '\n');
    log(`review -> ${OUT}`);
  }
  console.log(JSON.stringify({ summary: review.summary, routeCounts: review.routeCounts, items: review.items.map((i) => ({ vi: i.vi, route: i.route, ok: i.ok, faithful: i.faithful, summary: i.summary || (i.errors || []).join('; ') })) }, null, 2));
  process.exitCode = review.summary.allValid && review.summary.allFaithful ? 0 : 1;
}

main().catch((e) => { log('FATAL ' + (e && e.stack ? e.stack : e)); process.exitCode = 1; });
