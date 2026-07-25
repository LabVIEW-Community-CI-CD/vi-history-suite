// Multi-config side-by-side faithfulness comparator (#ollama-ml, WIN<->LINUX collab).
// Implements LINUX's request: put all three configs (8b-raw / 8b-fewshot / 14b) in ONE
// report so they sit side by side under a SINGLE shared scorer (vichangeEvalCore.mjs).
// Also emits a per-config REGRESSION GUARD verdict: a config passes only if its
// adversarialMean stays >= the floor (default 1.0) -- so a few-shot uplift that lifts the
// integration gap but weakens the false-"no changes" resistance is flagged, not hidden.
//
// Reads the frozen eval dataset (prototype/ml/dataset/vichange-eval-v1.jsonl) as the item
// source of truth; runs each config that is actually present on the ollama host and marks
// absent ones (e.g. 14b on WIN lives on LINUX's host) instead of failing. Same scorer +
// same SYSTEM as the single-model baseline builder.
//
// Run from repo root: node prototype/ml/evalCompareConfigs.mjs
// Env: OLLAMA_URL (default http://localhost:11434), REGRESSION_FLOOR (default 1),
//   MODEL_8B_RAW / MODEL_8B_FEWSHOT / MODEL_14B to override the config->model mapping.
import fs from 'node:fs';
import path from 'node:path';
import { runEvalForModel, aggregate } from './vichangeEvalCore.mjs';

const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const FLOOR = process.env.REGRESSION_FLOOR ? Number(process.env.REGRESSION_FLOOR) : 1;
const OUT_DIR = path.join(process.cwd(), 'prototype', 'ml', 'dataset');

const CONFIGS = [
  { id: '8b-raw', model: process.env.MODEL_8B_RAW || 'llama3.1:8b', note: 'baseline llama3.1:8b, no few-shot' },
  { id: '8b-fewshot', model: process.env.MODEL_8B_FEWSHOT || 'vichange8b-fewshot', note: "LINUX's CPU few-shot Modelfile (FROM llama3.1:8b + synthetic exemplar)" },
  { id: '14b', model: process.env.MODEL_14B || 'qwen2.5:14b', note: 'reference-ceiling zero-shot; runs on LINUX host' }
];

// Load the frozen eval items.
const evalPath = path.join(OUT_DIR, 'vichange-eval-v1.jsonl');
const items = fs.readFileSync(evalPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

// Which models are present on this ollama host?
let present = new Set();
try {
  const resp = await fetch(`${OLLAMA}/api/tags`);
  const j = await resp.json();
  present = new Set((j.models || []).map((m) => m.name).flatMap((n) => [n, n.replace(/:latest$/, '')]));
} catch (ex) {
  console.error('WARN could not list ollama models: ' + ex);
}

const configReports = [];
for (const cfg of CONFIGS) {
  const isPresent = present.has(cfg.model) || present.has(`${cfg.model}:latest`);
  if (!isPresent) {
    configReports.push({ id: cfg.id, model: cfg.model, note: cfg.note, present: false, evaluated: false, reason: 'model not pulled on this ollama host' });
    continue;
  }
  const results = await runEvalForModel(OLLAMA, cfg.model, items);
  const agg = aggregate(results);
  const regressionGuard = {
    floor: FLOOR,
    adversarialMean: agg.adversarialMean,
    pass: agg.adversarialMean !== null && agg.adversarialMean >= FLOOR
  };
  configReports.push({ id: cfg.id, model: cfg.model, note: cfg.note, present: true, evaluated: true, ...agg, regressionGuard, results });
}

// Side-by-side matrix: task -> { configId: byTask score }.
const evaluated = configReports.filter((c) => c.evaluated);
const allTasks = [...new Set(items.map((i) => i.task))];
const comparison = Object.fromEntries(allTasks.map((t) => [t, Object.fromEntries(evaluated.map((c) => [c.id, c.byTask[t] ?? null]))]));

const report = {
  schema: 'vi-history-suite/ollama-vichange-eval-compare@v1',
  generatedAt: new Date().toISOString(),
  task: 'grounded-vi-change-faithful-summarization',
  ollamaUrl: OLLAMA,
  regressionFloor: FLOOR,
  evalItems: items.length,
  taskTypes: allTasks,
  configs: configReports.map(({ results, ...rest }) => rest), // summary view (no per-item noise)
  comparison,
  detail: Object.fromEntries(evaluated.map((c) => [c.id, c.results]))
};
fs.writeFileSync(path.join(OUT_DIR, 'ollama-eval-compare-configs.json'), JSON.stringify(report, null, 2), 'utf8');

// Console summary (file-per-cycle discipline captures this into the cycle .out file).
console.log('EVAL_COMPARE_DONE evalItems=' + items.length + ' floor=' + FLOOR);
for (const c of configReports) {
  if (!c.evaluated) { console.log(`${c.id.padEnd(11)} [${c.model}] ABSENT (${c.reason})`); continue; }
  console.log(`${c.id.padEnd(11)} [${c.model}] overall=${c.overall} standard=${c.standardMean} adversarial=${c.adversarialMean} guard=${c.regressionGuard.pass ? 'PASS' : 'FAIL'}`);
  console.log('            byTask=' + JSON.stringify(c.byTask));
}
console.log('comparison=' + JSON.stringify(comparison));
