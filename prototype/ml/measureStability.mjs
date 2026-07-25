// Stability profiler for the grounded VI-change eval (#2381, WIN<->LINUX collab).
// Runs each config N times on the frozen eval items (same shared core/scorer as the
// comparator) and reports, PER TASK, whether the score is DETERMINISTIC (min==max
// across runs) or FLAKY (flaps run-to-run). This turns the 2-run "8b-raw kinds
// nondeterminism" anecdote into a measured stability profile and quantifies WHY the
// few-shot Modelfile is preferable (stability, not just peak score). Capability-unique
// to the LINUX ollama host (all three models present). Live/stochastic driver -- no unit
// test (mirrors buildViChangeMlDataset.mjs / evalCompareConfigs.mjs).
//
// Run from repo root: node prototype/ml/measureStability.mjs
// Env: OLLAMA_URL (default http://localhost:11434), STABILITY_RUNS (default 5),
//   STABILITY_MODELS (csv, default 'llama3.1:8b,vichange8b-fewshot').
import fs from 'node:fs';
import path from 'node:path';
import { runEvalForModel, aggregate } from './vichangeEvalCore.mjs';

const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const N = process.env.STABILITY_RUNS ? Number(process.env.STABILITY_RUNS) : 5;
const MODELS = (process.env.STABILITY_MODELS || 'llama3.1:8b,vichange8b-fewshot').split(',').map((s) => s.trim()).filter(Boolean);
const OUT_DIR = path.join(process.cwd(), 'prototype', 'ml', 'dataset');

const items = fs
  .readFileSync(path.join(OUT_DIR, 'vichange-eval-v1.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const round3 = (n) => Math.round(n * 1000) / 1000;

const report = {
  schema: 'vi-history-suite/ollama-vichange-stability@v1',
  generatedAt: new Date().toISOString(),
  ollamaHost: 'linux',
  runsPerModel: N,
  evalItemCount: items.length,
  configs: []
};

for (const model of MODELS) {
  const runsByTask = {};
  const overalls = [];
  for (let i = 0; i < N; i += 1) {
    const results = await runEvalForModel(OLLAMA, model, items);
    const agg = aggregate(results);
    overalls.push(agg.overall);
    for (const [task, value] of Object.entries(agg.byTask)) {
      (runsByTask[task] = runsByTask[task] || []).push(value);
    }
  }
  const tasks = {};
  for (const [task, arr] of Object.entries(runsByTask)) {
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const mean = round3(arr.reduce((a, b) => a + b, 0) / arr.length);
    tasks[task] = { runs: arr, min, max, mean, deterministic: min === max };
  }
  report.configs.push({
    model,
    overall: { runs: overalls, min: Math.min(...overalls), max: Math.max(...overalls), mean: round3(overalls.reduce((a, b) => a + b, 0) / overalls.length) },
    tasks
  });
}

fs.writeFileSync(path.join(OUT_DIR, 'ollama-stability-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(`STABILITY_DONE runs=${N} models=${MODELS.join(',')} items=${items.length}`);
for (const c of report.configs) {
  const flaky = Object.entries(c.tasks).filter(([, v]) => !v.deterministic).map(([t, v]) => `${t}[${v.min}..${v.max}]`);
  const stable = Object.entries(c.tasks).filter(([, v]) => v.deterministic).map(([t, v]) => `${t}=${v.min}`);
  console.log(`${c.model}: overall ${c.overall.min}..${c.overall.max} | FLAKY: ${flaky.join(', ') || 'none'} | STABLE: ${stable.join(', ')}`);
}
