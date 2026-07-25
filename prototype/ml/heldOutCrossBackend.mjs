#!/usr/bin/env node
// prototype/ml/heldOutCrossBackend.mjs
//
// WIN cross-backend companion to LINUX's heldOutBaseline.mjs (#2381). LINUX produced the
// leakage-free leave-one-VI-out generalization bar on the GPU backend (14b > 8b-2shot >
// 8b-fewshot > 8b-raw). This script reruns the SAME leave-one-VI-out held-out generalization
// baseline on the WIN CPU ollama backend, so we can test whether the generalization RANKING is
// backend-robust or (like the jointly-closed 8b-2shot adversarial divergence) GPU-offload-specific.
//
// It NEVER touches the LINUX-owned canonical files: it derives the folds IN-MEMORY via the pure
// buildLovoFolds (so it does not overwrite vichange-lovo-folds.json) and writes only its own
// ollama-heldout-crossbackend.json. Configs are not fold-trained (raw/14b zero-shot; few-shot/
// 2-shot use held-out synthetic exemplars), so a config's held-out-VI score is the leakage-free
// generalization number -- identical method to LINUX's, different backend.
//
// Zero torch. Run from repo root: node prototype/ml/heldOutCrossBackend.mjs
// Env: OLLAMA_URL (default http://localhost:11434), MODEL_* overrides as in heldOutBaseline.mjs.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runEvalForModel, aggregate } from './vichangeEvalCore.mjs';
import { buildLovoFolds } from './lovoSplit.mjs';

const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const OUT_DIR = path.join(process.cwd(), 'prototype', 'ml', 'dataset');
const round3 = (n) => (n === null ? null : Math.round(n * 1000) / 1000);
const meanOf = (a) => (a.length ? round3(a.reduce((s, x) => s + x, 0) / a.length) : null);

const CONFIGS = [
  { id: '8b-raw', model: process.env.MODEL_8B_RAW || 'llama3.1:8b' },
  { id: '8b-fewshot', model: process.env.MODEL_8B_FEWSHOT || 'vichange8b-fewshot' },
  { id: '8b-2shot', model: process.env.MODEL_8B_2SHOT || 'vichange8b-2shot' },
  { id: '14b', model: process.env.MODEL_14B || 'qwen2.5:14b' },
  { id: '8b-lora', model: process.env.MODEL_8B_LORA || 'vichange8b-lora' }
];

const items = fs.readFileSync(path.join(OUT_DIR, 'vichange-eval-v1.jsonl'), 'utf8')
  .trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
// Derive folds IN-MEMORY from the current finetune JSONL (do not overwrite the committed manifest).
const ftItems = fs.readFileSync(path.join(OUT_DIR, 'vichange-finetune-v1.jsonl'), 'utf8')
  .trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const folds = buildLovoFolds(ftItems);
const viBasename = (r) => r.vi.split('/').pop();

let present = new Set();
try {
  const tags = await (await fetch(`${OLLAMA}/api/tags`)).json();
  present = new Set((tags.models || []).map((m) => m.name.replace(/:latest$/, '')));
} catch { /* leave empty -> all absent */ }
const isPresent = (model) => present.has(model) || present.has(model.replace(/:latest$/, '')) || [...present].some((p) => p.replace(/:latest$/, '') === model);

const configReports = [];
for (const cfg of CONFIGS) {
  if (!isPresent(cfg.model)) { configReports.push({ ...cfg, present: false }); continue; }
  const results = await runEvalForModel(OLLAMA, cfg.model, items); // one full CPU run
  const byHeldOutVi = folds.map((f) => {
    const rs = results.filter((r) => viBasename(r) === f.heldOutVi);
    const agg = aggregate(rs);
    return { heldOutVi: f.heldOutVi, n: rs.length, trainCount: f.trainCount, overall: agg.overall, standardMean: agg.standardMean, adversarialMean: agg.adversarialMean, byTask: agg.byTask };
  });
  const macroOverall = meanOf(byHeldOutVi.map((h) => h.overall).filter((x) => x !== null));
  const macroAdv = meanOf(byHeldOutVi.map((h) => h.adversarialMean).filter((x) => x !== null));
  configReports.push({ ...cfg, present: true, macroHeldOutOverall: macroOverall, macroHeldOutAdversarial: macroAdv, byHeldOutVi });
}

const ranking = configReports
  .filter((c) => c.present && c.macroHeldOutOverall !== null)
  .sort((a, b) => b.macroHeldOutOverall - a.macroHeldOutOverall)
  .map((c) => `${c.id}=${c.macroHeldOutOverall}`);

const report = {
  schema: 'vi-history-suite/ollama-heldout-lovo-crossbackend@v1',
  generatedAt: new Date().toISOString(),
  host: 'WIN', hostname: os.hostname(), backend: 'cpu', ollamaUrl: OLLAMA,
  method: 'leave-one-VI-out generalization baseline on the WIN CPU backend (memorization-free; configs are not fold-trained); folds derived in-memory from vichange-finetune-v1.jsonl',
  foldCount: folds.length,
  vis: folds.map((f) => f.heldOutVi),
  ranking,
  note: 'Cross-backend companion to ollama-heldout-lovo-baseline.json (LINUX/GPU). Tests whether the leakage-free generalization RANKING is backend-robust or offload-specific like the jointly-closed 8b-2shot adversarial divergence. Does not overwrite vichange-lovo-folds.json (folds derived in-memory).',
  configs: configReports
};
fs.writeFileSync(path.join(OUT_DIR, 'ollama-heldout-crossbackend.json'), JSON.stringify(report, null, 2), 'utf8');

console.log('HELDOUT_CROSSBACKEND_DONE host=WIN backend=cpu folds=' + folds.length);
console.log('ranking: ' + ranking.join(' > '));
console.log('| config | present | macro held-out overall | macro held-out adversarial |');
console.log('|---|---|---|---|');
for (const c of configReports) console.log(`| ${c.id} | ${c.present ? 'yes' : 'no'} | ${c.present ? c.macroHeldOutOverall : '-'} | ${c.present ? c.macroHeldOutAdversarial : '-'} |`);
