// Multi-VI scaffolding A/B (issue #2371, from discussion #2370). Tests the
// PRIMARY hypothesis: is the r2 EVIDENCE-DECOMPOSITION scaffolding — not model
// size — what earns a valid, grounding-faithful, DECOMPOSED relay envelope,
// across a SET of VIs? Model size is the secondary axis (run a bigger model via
// VIHS_OLLAMA_MODEL to compare; LINUX runs qwen2.5:14b as the control).
//
// For each VI it stages a REAL `lvkit diff` in the vihs-lvkit-stage container
// (repo-relative .vihs/cache, reproducible minimal, no search-path), then for
// each scaffolding level in { plain-r2, evidence-r2 } makes ONE Ollama call and
// validates the reply against the vihs-relay@v1 schema (never trusts the model).
// r1 is intentionally excluded — the A/B is scored on evidence faithfulness, NOT
// r1 clearance (settled: r1 fails regardless of model size).
//
// Score per (VI, scaffolding): envelope validity; evidence-entry count vs the
// ground-truth lvkit change count; `decomposed` (>=2 evidence entries when the VI
// has >1 change); `noOverclaim` (no integer in evidence/summary exceeds the
// ground-truth change count — a coarse invented-change guard).
//
// Prototype harness (.mjs). Run from the repo root AFTER `npm run compile`, Docker
// in LINUX engine, Ollama serving the model:
//   $env:LVKIT_DOCKER_IMAGE='vihs-lvkit-stage:local'; node prototype/relayScaffoldingAbExercise.mjs
//
// Env: LVKIT_DOCKER_IMAGE (required), VIHS_MCP_REPO (corpus), VIHS_OLLAMA_URL,
//   VIHS_OLLAMA_MODEL (default llama3.1:8b), VIHS_AB_OUT (evidence JSON path),
//   VIHS_AB_REFRESH=1 (re-stage), VIHS_AB_SET (path to a JSON array overriding
//   the default VI set: [{viPath,base,selected,label}]).

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { extractEnvelope, validate, normalizeEnvelope, SCHEMA } from './relay.mjs';

const REPO = process.cwd();
const OLLAMA = process.env.VIHS_OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.VIHS_OLLAMA_MODEL || 'llama3.1:8b';
const CORPUS = process.env.VIHS_MCP_REPO || (process.platform === 'win32' ? 'C:\\repos\\labview-icon-editor' : path.join(os.homedir(), 'repos', 'labview-icon-editor'));
const IMAGE = process.env.LVKIT_DOCKER_IMAGE || '';
const OUT = process.env.VIHS_AB_OUT || '';
const CACHE_ROOT = path.join(REPO, '.vihs', 'cache', 'relay-lvkit');
const CORPUS_KEY = crypto.createHash('sha256').update(path.resolve(CORPUS)).digest('hex').slice(0, 12);

// PR #537 VIs share base 9545c483 -> head f57c3cfd; lv_icon.vi uses its own pair.
const PR537_BASE = '9545c483f2b947c71de68c7f70aedefaedadabf7';
const PR537_HEAD = 'f57c3cfd6494abf1da968ddcc116222e93e953b4';
const DEFAULT_SET = [
  { label: 'lv_icon.vi', viPath: 'resource/plugins/lv_icon.vi', base: '537683398d8c', selected: 'fc09736ae5e3' },
  { label: 'UpdateVisibleData.vi', viPath: 'resource/plugins/NIIconEditor/Class/FakedArray/Misc/UpdateVisibleData.vi', base: PR537_BASE, selected: PR537_HEAD },
  { label: 'Dropper.vi', viPath: 'resource/plugins/NIIconEditor/Class/Tools/Dropper.vi', base: PR537_BASE, selected: PR537_HEAD },
  { label: 'Fill.vi', viPath: 'resource/plugins/NIIconEditor/Class/Tools/Fill.vi', base: PR537_BASE, selected: PR537_HEAD },
  { label: 'DeleteLayer.vi', viPath: 'resource/plugins/NIIconEditor/Miscellaneous/Layer/DeleteLayer.vi', base: PR537_BASE, selected: PR537_HEAD }
];

const log = (m) => process.stderr.write('[relay-ab] ' + m + '\n');

function loadCompiled(rel) {
  const f = path.join(REPO, 'out', 'semantic', 'lvkit', rel);
  if (!fs.existsSync(f)) {
    log(`missing out/semantic/lvkit/${rel}; run \`npm run compile\` first.`);
    process.exit(2);
  }
  return import(path.sep === '\\' ? 'file://' + f.replace(/\\/g, '/') : f);
}

function stageLvkitInContainer(viPath, base, selected) {
  const script = [
    'git config --global --add safe.directory /repo',
    'mkdir -p /work && cd /work',
    `git -C /repo cat-file -p ${base}:'${viPath}' > /work/base.vi`,
    `git -C /repo cat-file -p ${selected}:'${viPath}' > /work/sel.vi`,
    'lvkit diff /work/base.vi /work/sel.vi --format json --load-mode minimal --no-auto-vilib'
  ].join('; ');
  return execFileSync('docker', ['run', '--rm', '-v', `${CORPUS}:/repo:ro`, IMAGE, 'sh', '-c', script], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
}

function obtainLvkitJson(vi) {
  const viKey = crypto.createHash('sha256').update(vi.viPath).digest('hex').slice(0, 10);
  const cacheFile = path.join(CACHE_ROOT, `${CORPUS_KEY}-${viKey}-${vi.base.slice(0, 8)}-${vi.selected.slice(0, 8)}.json`);
  if (fs.existsSync(cacheFile) && process.env.VIHS_AB_REFRESH !== '1') {
    return fs.readFileSync(cacheFile, 'utf8');
  }
  if (!IMAGE) {
    log('LVKIT_DOCKER_IMAGE not set — cannot stage.');
    process.exit(2);
  }
  const raw = stageLvkitInContainer(vi.viPath, vi.base, vi.selected);
  fs.mkdirSync(CACHE_ROOT, { recursive: true });
  fs.writeFileSync(cacheFile, raw);
  return raw;
}

function compactGrounding(vi, model, diff) {
  return {
    vi: vi.label,
    hasDifferences: model.hasDifferences,
    changedSurfaces: model.changedSurfaces,
    changeKinds: model.changeKinds,
    riskLevel: model.riskLevel,
    totals: model.totals,
    changeCount: diff.changes.length,
    commonNodes: diff.commonNodes,
    narrative: model.narrative
  };
}

const SYSTEM = 'You are a LabVIEW VI change reviewer. You are given a REAL lvkit semantic diff of one VI (block-diagram scope). Base every statement strictly on the provided facts — never invent changes. If the facts show zero changes, say so and leave evidence empty.';

function plainR2(groundingText) {
  return `Review this VI change. End with ONE fenced \`\`\`vihs-relay\`\`\` JSON block. Required fields: schema="${SCHEMA}", from="ollama", kind="RESULT", summary (one line). Optional: ts, topic, details, evidence[], checks{}, next, refs[]. For any optional field you have nothing for, omit it or use "" — never null.\nlvkit facts (JSON):\n\`\`\`json\n${groundingText}\n\`\`\``;
}
function evidenceR2(groundingText) {
  return `Review this VI change. End with ONE fenced \`\`\`vihs-relay\`\`\` JSON block. Required fields: schema="${SCHEMA}", from="ollama", kind="RESULT", summary (one line). Optional: ts, topic, details, evidence[], checks{}, next, refs[]. Populate evidence[] with one entry PER DISTINCT CHANGE in the facts (name = the change kind such as node-added / node-removed / wire-change, result = the grounded count or detail from the facts); do not leave evidence[] empty when the facts list changes. ALWAYS output the fenced block even when the facts show ZERO changes: in that case set summary to state that no block-diagram changes were found and set evidence to an empty array []. For any other optional field you have nothing for, omit it or use "" — never null.\nlvkit facts (JSON):\n\`\`\`json\n${groundingText}\n\`\`\``;
}

async function ollamaChat(userText) {
  const res = await fetch(OLLAMA + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userText }], stream: false, options: { temperature: 0, num_ctx: 8192 } })
  });
  if (!res.ok) throw new Error('ollama ' + res.status + ': ' + (await res.text()).slice(0, 200));
  return (await res.json()).message?.content ?? '';
}

function maxIntIn(text) {
  const ints = (text.match(/\d+/g) || []).map(Number);
  return ints.length ? Math.max(...ints) : 0;
}

function score(envelope, groundTruth) {
  const evidence = Array.isArray(envelope.evidence) ? envelope.evidence : [];
  const evidenceCount = evidence.length;
  const decomposed = groundTruth > 1 ? evidenceCount >= 2 : true;
  const claimText = JSON.stringify(evidence) + ' ' + (envelope.summary || '');
  const noOverclaim = maxIntIn(claimText) <= Math.max(groundTruth, 0);
  return { evidenceCount, groundTruth, decomposed, noOverclaim };
}

async function runCell(vi, groundingText, groundTruth, scaffold) {
  const cell = { scaffold, valid: false, errors: null, evidenceCount: 0, groundTruth, decomposed: false, noOverclaim: false, summary: null };
  try {
    const reply = await ollamaChat((scaffold === 'evidence-r2' ? evidenceR2 : plainR2)(groundingText));
    const env = extractEnvelope(reply);
    if (!env) {
      cell.errors = ['no fenced vihs-relay block'];
      return cell;
    }
    const errors = validate(env);
    if (errors.length) {
      cell.errors = errors;
      return cell;
    }
    const norm = normalizeEnvelope(env);
    cell.valid = true;
    cell.summary = norm.summary;
    Object.assign(cell, score(norm, groundTruth));
  } catch (e) {
    cell.errors = [e.message];
  }
  return cell;
}

async function main() {
  const { parseLvkitDiffJson } = await loadCompiled('lvkitDiffModel.js');
  const { buildViSemanticModelFromLvkitDiff } = await loadCompiled('lvkitSemanticAdapter.js');
  try {
    const tags = await (await fetch(OLLAMA + '/api/tags')).json();
    if (!(tags.models || []).some((m) => m.name === MODEL || m.name === MODEL + ':latest')) {
      log(`model ${MODEL} not in Ollama; pull it first.`);
      process.exit(2);
    }
  } catch (e) {
    log(`Ollama not reachable (${e.message}).`);
    process.exit(2);
  }

  const set = process.env.VIHS_AB_SET ? JSON.parse(fs.readFileSync(process.env.VIHS_AB_SET, 'utf8')) : DEFAULT_SET;
  const evidence = {
    schema: 'vi-history-suite/relay-scaffolding-ab@v1',
    generatedAt: new Date().toISOString(),
    model: MODEL,
    corpus: CORPUS,
    rows: []
  };

  for (const vi of set) {
    log(`staging ${vi.label} (${vi.base.slice(0, 8)}->${vi.selected.slice(0, 8)})...`);
    let groundTruth = null;
    let groundingText = null;
    let stageError = null;
    try {
      const raw = obtainLvkitJson(vi);
      const diff = parseLvkitDiffJson(raw);
      const model = buildViSemanticModelFromLvkitDiff(diff, { title: vi.label, firstViPath: `base:${vi.viPath}`, secondViPath: `sel:${vi.viPath}`, revisions: { baseHash: vi.base, selectedHash: vi.selected } });
      groundTruth = diff.changes.length;
      groundingText = JSON.stringify(compactGrounding(vi, model, diff), null, 2);
    } catch (e) {
      stageError = (e.message || String(e)).slice(0, 300);
    }
    const row = { vi: vi.label, viPath: vi.viPath, groundTruth, stageError, cells: {} };
    if (!stageError) {
      log(`  ground-truth changes=${groundTruth}; running plain-r2 + evidence-r2 on ${MODEL}...`);
      row.cells['plain-r2'] = await runCell(vi, groundingText, groundTruth, 'plain-r2');
      row.cells['evidence-r2'] = await runCell(vi, groundingText, groundTruth, 'evidence-r2');
    }
    evidence.rows.push(row);
  }

  // Aggregate the exit criterion for evidence-r2 @ this model. noOverclaim is
  // only meaningful on VALID cells (an invalid cell has no envelope to score), so
  // aggregate it over valid cells to avoid a false negative from a missing block.
  const scored = evidence.rows.filter((r) => !r.stageError);
  const changedRows = scored.filter((r) => r.groundTruth > 0);
  const evidR2Valid = scored.filter((r) => r.cells['evidence-r2']?.valid);
  const plainR2Valid = scored.filter((r) => r.cells['plain-r2']?.valid);
  evidence.summary = {
    model: MODEL,
    visStaged: scored.length,
    changedVis: changedRows.length,
    evidenceR2ValidCount: evidR2Valid.length,
    plainR2ValidCount: plainR2Valid.length,
    evidenceR2AllDecomposedOnChanged: changedRows.every((r) => r.cells['evidence-r2']?.decomposed),
    evidenceR2NoOverclaimAmongValid: evidR2Valid.every((r) => r.cells['evidence-r2'].noOverclaim),
    plainR2DecomposedOnChanged: changedRows.filter((r) => r.cells['plain-r2']?.decomposed).length,
    evidenceR2DecomposedOnChanged: changedRows.filter((r) => r.cells['evidence-r2']?.decomposed).length,
    visWithNoBlock: scored
      .filter((r) => !r.cells['evidence-r2']?.valid && (r.cells['evidence-r2']?.errors || []).some((e) => e.includes('no fenced')))
      .map((r) => r.vi)
  };

  if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(evidence, null, 2) + '\n');
    log(`evidence -> ${OUT}`);
  }
  // Compact table to stdout.
  const table = evidence.rows.map((r) => ({
    vi: r.vi,
    gt: r.stageError ? 'ERR' : r.groundTruth,
    'plain-r2': r.stageError ? '-' : `${r.cells['plain-r2']?.valid ? 'ok' : 'X'} ev=${r.cells['plain-r2']?.evidenceCount ?? '-'}`,
    'evidence-r2': r.stageError ? '-' : `${r.cells['evidence-r2']?.valid ? 'ok' : 'X'} ev=${r.cells['evidence-r2']?.evidenceCount ?? '-'} dec=${r.cells['evidence-r2']?.decomposed}`
  }));
  console.log(JSON.stringify({ summary: evidence.summary, table }, null, 2));
}

main().catch((e) => {
  log('FATAL ' + (e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
