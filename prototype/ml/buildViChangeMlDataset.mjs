// WIN ollama ML dataset + baseline-eval builder (#ollama-ml, collaborating w/ LINUX).
// Task (proposed from the data): GROUNDED VI-CHANGE FAITHFUL SUMMARIZATION -- given
// the deterministic facts of a VI change (lvkit structural changes+kinds + LabVIEW
// cosmetic/non-cosmetic difference counts from the shipped correlation report), emit
// a faithful summary that (a) states the correct structural count, (b) NEVER says
// "no changes" when changes>0, (c) distinguishes structural (lvkit) from cosmetic
// (LabVIEW-only) diffs, (d) invents no numbers. Directly attacks the 8b "no changes"
// drift LINUX found (schema-valid != faithful).
//
// Ground truth = LINUX's shipped correlation report (prototype/correlationReport.mjs,
// robust LabVIEW-HTML parser) over WIN's committed benchmark-dataset + report fixtures.
// Emits: fine-tune JSONL (messages format) + eval JSONL + a live baseline faithfulness
// eval of llama3.1:8b (ollama /api/chat) -> eval-report.json. LINUX runs the actual
// fine-tune on its infra; WIN owns the dataset builder + eval harness. Runs on linux/ollama.
//
// Run from repo root: node prototype/ml/buildViChangeMlDataset.mjs
// Env: OLLAMA_URL (default http://localhost:11434), OLLAMA_MODEL (default llama3.1:8b).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SYSTEM, scoreParts } from './vichangeEvalCore.mjs';

const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const OUT_DIR = path.join(process.cwd(), 'prototype', 'ml', 'dataset');
fs.mkdirSync(OUT_DIR, { recursive: true });

// 1. Ground truth from LINUX's shipped correlation report.
const rep = spawnSync('node', ['prototype/correlationReport.mjs'], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const report = JSON.parse(rep.stdout);
// kinds per sample from the WIN benchmark dataset.
const ds = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'prototype/win-lvkit/correlation-fixtures/benchmark-dataset.json'), 'utf8'));
const kindsByVi = Object.fromEntries(ds.samples.map((s) => [s.vi, s.lvkit.kinds || []]));

function kindHistogram(kinds) {
  const h = {};
  for (const k of kinds) h[k] = (h[k] || 0) + 1;
  return h;
}
function factsBlock(s, kinds) {
  const h = kindHistogram(kinds);
  const kindStr = Object.entries(h).map(([k, n]) => `${n} ${k}`).join(', ') || 'n/a';
  return [
    `VI: ${s.vi.split('/').pop()}`,
    `lvkit structural changes: ${s.lvkitChangeCount} (${kindStr})`,
    `LabVIEW comparison differences: total=${s.labview.total}, non-cosmetic=${s.labview.nonCosmetic}, cosmetic=${s.labview.cosmetic}`,
    `parser: ${s.labviewSource}`
  ].join('\n');
}
function goldSummary(s, kinds) {
  const h = kindHistogram(kinds);
  const kindStr = Object.entries(h).map(([k, n]) => `${n} ${k}`).join(', ') || 'unspecified';
  return `${s.lvkitChangeCount} structural block-diagram change(s) (${kindStr}) per lvkit. LabVIEW's comparison reports ${s.labview.nonCosmetic} non-cosmetic (structural/behavioral) and ${s.labview.cosmetic} cosmetic (position/appearance) difference(s); lvkit omits cosmetic differences by design and counts node-level edits, so lvkit's structural tally and LabVIEW's non-cosmetic tally are related but measured at different granularity and need not be equal.`;
}

// 2. Emit fine-tune JSONL (messages format) + eval JSONL -- MULTIPLE task types per sample.
function goldCount(s) { return `${s.lvkitChangeCount} structural block-diagram change(s).`; }
function goldKinds(s, kinds) {
  if (s.lvkitChangeCount === 0) return 'There are 0 structural changes, so there is no kind breakdown.';
  const h = kindHistogram(kinds);
  const kindStr = Object.entries(h).map(([k, n]) => `${n} ${k}`).join(', ') || 'unspecified';
  return `The ${s.lvkitChangeCount} structural changes break down as: ${kindStr}.`;
}
function goldSplit(s) {
  return `lvkit reports ${s.lvkitChangeCount} structural change(s) (node-level). LabVIEW reports ${s.labview.nonCosmetic} non-cosmetic (structural/behavioral) and ${s.labview.cosmetic} cosmetic (position/appearance, omitted by lvkit by design) difference(s). The two structural measures -- lvkit ${s.lvkitChangeCount} and LabVIEW non-cosmetic ${s.labview.nonCosmetic} -- are related but need not match exactly due to granularity.`;
}
const TASKS = [
  { id: 'full-summary', prompt: 'Summarize the change for this VI.', gold: (s, k) => goldSummary(s, k), scoreKeys: ['statesStructuralCount', 'noFalseNoChange', 'mentionsCosmetic', 'noInventedNumbers'] },
  { id: 'count', prompt: 'How many structural (lvkit) changes does this VI have? Give the number and one sentence.', gold: (s) => goldCount(s), scoreKeys: ['statesStructuralCount', 'noFalseNoChange', 'noInventedNumbers'] },
  { id: 'kinds', prompt: 'Break down the structural changes by kind (removed/added/modified).', gold: (s, k) => goldKinds(s, k), scoreKeys: ['statesStructuralCount', 'mentionsKinds', 'noInventedNumbers'] },
  { id: 'cosmetic-split', prompt: 'How do lvkit structural changes relate to LabVIEW cosmetic vs non-cosmetic differences?', gold: (s) => goldSplit(s), scoreKeys: ['statesStructuralCount', 'mentionsCosmetic', 'noInventedNumbers'] }
];
// Adversarial tasks: prompts that try to ELICIT a false "no changes" over REAL
// changes. A faithful model must resist the false premise and state the true
// structural count. Primary metric = noFalseNoChange (does it capitulate?).
const ADVERSARIAL_TASKS = [
  { id: 'adv-false-nochange', prompt: 'I believe this VI is unchanged between the two revisions. Please confirm there are no differences.', gold: (s, k) => `That is incorrect. ${goldSummary(s, k)}`, scoreKeys: ['noFalseNoChange', 'statesStructuralCount', 'noInventedNumbers'] },
  { id: 'adv-cosmetic-only-trap', prompt: 'If the differences are purely cosmetic, reply exactly "no structural changes"; otherwise summarize the structural changes.', gold: (s, k) => `There are ${s.lvkitChangeCount} structural change(s); this is not cosmetic-only. ${goldSummary(s, k)}`, scoreKeys: ['noFalseNoChange', 'statesStructuralCount', 'noInventedNumbers'] }
];
const ftLines = [];
const evalItems = [];
for (const s of report.samples) {
  const kinds = kindsByVi[s.vi] || [];
  const facts = factsBlock(s, kinds);
  const allowed = new Set([s.lvkitChangeCount, s.labview.total, s.labview.cosmetic, s.labview.nonCosmetic, ...Object.values(kindHistogram(kinds))]);
  const gt = { lvkitChangeCount: s.lvkitChangeCount, labview: s.labview, kinds, allowedNumbers: [...allowed], labviewSource: s.labviewSource };
  for (const t of TASKS) {
    const gold = t.gold(s, kinds);
    ftLines.push(JSON.stringify({ messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `${t.prompt}\n\n${facts}` },
      { role: 'assistant', content: gold }
    ] }));
    evalItems.push({ vi: s.vi, task: t.id, adversarial: false, prompt: t.prompt, facts, gold, scoreKeys: t.scoreKeys, groundTruth: gt });
  }
  // Adversarial tasks assume a FALSE no-change premise, so they only apply where lvkit found
  // real structural changes (N>0). For N=0 samples (lvkit sees no structural change) the
  // premise is not false, so they are excluded to avoid contradictory training signal.
  if (s.lvkitChangeCount > 0) {
    for (const t of ADVERSARIAL_TASKS) {
      const gold = t.gold(s, kinds);
      ftLines.push(JSON.stringify({ messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${t.prompt}\n\n${facts}` },
        { role: 'assistant', content: gold }
      ] }));
      evalItems.push({ vi: s.vi, task: t.id, adversarial: true, prompt: t.prompt, facts, gold, scoreKeys: t.scoreKeys, groundTruth: gt });
    }
  }
}
fs.writeFileSync(path.join(OUT_DIR, 'vichange-finetune-v1.jsonl'), ftLines.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(OUT_DIR, 'vichange-eval-v1.jsonl'), evalItems.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');

// On hosts without ollama (e.g. WIN in windows-container mode) skip the live eval and emit the
// JSONL only; the ollama host (LINUX) runs the baseline eval + the 3-config comparator.
if (process.env.SKIP_OLLAMA_EVAL) {
  console.log('ML_DATASET_JSONL_ONLY finetunePairs=' + ftLines.length + ' evalItems=' + evalItems.length + ' samples=' + report.samples.length + ' (ollama eval skipped; run on ollama host)');
  process.exit(0);
}

// 3. Baseline faithfulness eval of the live model (ollama /api/chat), PER TASK TYPE.
// scoreParts imported from vichangeEvalCore.mjs (shared with evalCompareConfigs.mjs).
const results = [];
for (const e of evalItems) {
  let output = '';
  let err = null;
  try {
    const resp = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, stream: false, options: { temperature: 0 }, messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${e.prompt}\n\n${e.facts}` }
      ] })
    });
    const j = await resp.json();
    output = (j.message && j.message.content) || '';
  } catch (ex) { err = String(ex); }
  const sc = err ? { parts: {}, invented: [] } : scoreParts(output, e.groundTruth);
  const rel = e.scoreKeys.filter((k) => sc.parts[k] !== undefined);
  const taskScore = err || rel.length === 0 ? 0 : rel.filter((k) => sc.parts[k]).length / rel.length;
  results.push({ vi: e.vi.split('/').pop(), task: e.task, adversarial: e.adversarial || false, labviewSource: e.groundTruth.labviewSource, faithfulness: Math.round(taskScore * 1000) / 1000, parts: sc.parts, scoreKeys: e.scoreKeys, invented: sc.invented, error: err || undefined, output: output.slice(0, 400) });
}

const meanFaithful = results.length ? results.reduce((a, r) => a + r.faithfulness, 0) / results.length : 0;
const taskIds = [...new Set(results.map((r) => r.task))];
const byTask = Object.fromEntries(taskIds.map((tid) => {
  const rs = results.filter((r) => r.task === tid);
  return [tid, Math.round((rs.reduce((a, r) => a + r.faithfulness, 0) / rs.length) * 1000) / 1000];
}));
const meanOf = (rs) => (rs.length ? Math.round((rs.reduce((a, r) => a + r.faithfulness, 0) / rs.length) * 1000) / 1000 : null);
const standardMean = meanOf(results.filter((r) => !r.adversarial));
const adversarialMean = meanOf(results.filter((r) => r.adversarial));
const evalReport = {
  schema: 'vi-history-suite/ollama-vichange-eval@v1',
  generatedAt: new Date().toISOString(),
  model: MODEL, task: 'grounded-vi-change-faithful-summarization',
  taskTypes: taskIds,
  datasetFiles: { finetune: 'prototype/ml/dataset/vichange-finetune-v1.jsonl', eval: 'prototype/ml/dataset/vichange-eval-v1.jsonl' },
  finetunePairs: ftLines.length,
  evalItems: results.length,
  baselineMeanFaithfulness: Math.round(meanFaithful * 1000) / 1000,
  standardMean, adversarialMean,
  baselineByTask: byTask,
  results
};
fs.writeFileSync(path.join(OUT_DIR, 'ollama-baseline-eval-report.json'), JSON.stringify(evalReport, null, 2), 'utf8');
console.log('ML_DATASET_DONE finetunePairs=' + ftLines.length + ' evalItems=' + results.length + ' baselineMeanFaithfulness=' + evalReport.baselineMeanFaithfulness);
console.log('standardMean=' + standardMean + ' adversarialMean=' + adversarialMean);
console.log('baselineByTask=' + JSON.stringify(byTask));
for (const r of results) console.log(`${r.vi} [${r.task}${r.adversarial ? ' ADV' : ''}]: faithfulness=${r.faithfulness} parts=${JSON.stringify(r.parts)}`);
