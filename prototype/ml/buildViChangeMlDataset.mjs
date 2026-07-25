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

const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const OUT_DIR = path.join(process.cwd(), 'prototype', 'ml', 'dataset');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SYSTEM = 'You are a VI-change summarizer for vi-history-suite. Report ONLY facts grounded in the provided lvkit and LabVIEW comparison data. Rules: NEVER say "no changes" when the structural change count is greater than 0; always state the exact structural change count; distinguish STRUCTURAL changes (from lvkit) from COSMETIC differences (position/appearance, reported only by LabVIEW and omitted by lvkit by design); never invent numbers not present in the facts.';

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
  return `${s.lvkitChangeCount} structural block-diagram change(s) (${kindStr}). LabVIEW's comparison reports ${s.labview.total} total differences: ${s.labview.nonCosmetic} non-cosmetic (the structural set, aligning with lvkit's ${s.lvkitChangeCount}) and ${s.labview.cosmetic} cosmetic (position/appearance) differences that lvkit omits by design.`;
}

// 2. Emit fine-tune JSONL (messages format) + eval JSONL.
const ftLines = [];
const evalItems = [];
for (const s of report.samples) {
  const kinds = kindsByVi[s.vi] || [];
  const facts = factsBlock(s, kinds);
  const gold = goldSummary(s, kinds);
  ftLines.push(JSON.stringify({ messages: [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Summarize the change for this VI.\n\n${facts}` },
    { role: 'assistant', content: gold }
  ] }));
  const allowed = new Set([s.lvkitChangeCount, s.labview.total, s.labview.cosmetic, s.labview.nonCosmetic, ...Object.values(kindHistogram(kinds))]);
  evalItems.push({ vi: s.vi, facts, gold, groundTruth: { lvkitChangeCount: s.lvkitChangeCount, labview: s.labview, allowedNumbers: [...allowed], labviewSource: s.labviewSource } });
}
fs.writeFileSync(path.join(OUT_DIR, 'vichange-finetune-v1.jsonl'), ftLines.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(OUT_DIR, 'vichange-eval-v1.jsonl'), evalItems.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');

// 3. Baseline faithfulness eval of the live model (ollama /api/chat).
function scoreFaithful(output, gt) {
  const text = output.toLowerCase();
  const N = gt.lvkitChangeCount;
  const statesStructuralCount = new RegExp(`\\b${N}\\b`).test(output);
  const noFalseNoChange = N === 0 ? true : !/\bno\s+(change|changes|difference|differences|structural)\b/.test(text);
  const mentionsCosmetic = /cosmetic/.test(text);
  const nums = (output.match(/\d+/g) || []).map(Number);
  const allowed = new Set(gt.allowedNumbers);
  const invented = nums.filter((n) => n > 1 && !allowed.has(n));
  const noInventedNumbers = invented.length === 0;
  const parts = { statesStructuralCount, noFalseNoChange, mentionsCosmetic, noInventedNumbers };
  const score = Object.values(parts).filter(Boolean).length / Object.keys(parts).length;
  return { score, parts, invented };
}

const results = [];
for (const e of evalItems) {
  let output = '';
  let err = null;
  try {
    const resp = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, stream: false, options: { temperature: 0 }, messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Summarize the change for this VI.\n\n${e.facts}` }
      ] })
    });
    const j = await resp.json();
    output = (j.message && j.message.content) || '';
  } catch (ex) { err = String(ex); }
  const scored = err ? { score: 0, parts: {}, invented: [], error: err } : scoreFaithful(output, e.groundTruth);
  results.push({ vi: e.vi.split('/').pop(), labviewSource: e.groundTruth.labviewSource, faithfulness: scored.score, parts: scored.parts, invented: scored.invented, output: output.slice(0, 600) });
}

const meanFaithful = results.length ? results.reduce((a, r) => a + r.faithfulness, 0) / results.length : 0;
const evalReport = {
  schema: 'vi-history-suite/ollama-vichange-eval@v1',
  generatedAt: new Date().toISOString(),
  model: MODEL, task: 'grounded-vi-change-faithful-summarization',
  datasetFiles: { finetune: 'prototype/ml/dataset/vichange-finetune-v1.jsonl', eval: 'prototype/ml/dataset/vichange-eval-v1.jsonl' },
  sampleCount: results.length,
  baselineMeanFaithfulness: Math.round(meanFaithful * 1000) / 1000,
  results
};
fs.writeFileSync(path.join(OUT_DIR, 'ollama-baseline-eval-report.json'), JSON.stringify(evalReport, null, 2), 'utf8');
console.log('ML_DATASET_DONE finetunePairs=' + ftLines.length + ' evalItems=' + evalItems.length + ' baselineMeanFaithfulness=' + evalReport.baselineMeanFaithfulness);
for (const r of results) console.log(`${r.vi} [${r.labviewSource}]: faithfulness=${r.faithfulness} parts=${JSON.stringify(r.parts)} invented=${JSON.stringify(r.invented)}`);
