#!/usr/bin/env node
// prototype/ml/heldOutBaseline.mjs
//
// Held-out (leave-one-VI-out) GENERALIZATION baseline for the grounded VI-change eval (#2381,
// WIN KEEP-BUSY plan step 2). Consumes the LOVO fold manifest (lovoSplit.mjs) and, for each of
// the currently-present ollama configs (8b-raw / 8b-fewshot / 8b-2shot / 14b; the 8b-lora slot
// is skipped until it exists), reports the config's faithfulness on the HELD-OUT VI of each fold
// using the governed shared scorer (vichangeEvalCore). The per-config macro-mean across the 5
// held-out VIs is the honest generalization number a future (held-out-trained) LoRA must BEAT.
//
// These 4 configs are NOT fold-trained (raw is zero-shot; few-shot/2-shot use HELD-OUT synthetic
// exemplars; 14b is zero-shot), so their held-out-VI score equals grouping one full GPU run by
// VI -- which is exactly the leakage-free baseline. A future LoRA, trained per-fold on the 4
// TRAIN VIs only and evaluated on the held-out VI, is compared to these per-VI numbers; that is
// the ONLY apples-to-apples (leakage-free) way to test fine-tune vs few-shot.
//
// Zero torch, GPU-eval only. Run from repo root: node prototype/ml/heldOutBaseline.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runEvalForModel, aggregate } from './vichangeEvalCore.mjs';

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
const folds = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'vichange-lovo-folds.json'), 'utf8')).folds;
const viBasename = (r) => r.vi.split('/').pop();

// Which configs are present on this ollama host?
let present = new Set();
try {
  const tags = await (await fetch(`${OLLAMA}/api/tags`)).json();
  present = new Set((tags.models || []).map((m) => m.name.replace(/:latest$/, '')));
} catch { /* leave empty -> all absent */ }
const isPresent = (model) => present.has(model) || present.has(model.replace(/:latest$/, '')) || [...present].some((p) => p.replace(/:latest$/, '') === model);

const configReports = [];
for (const cfg of CONFIGS) {
  if (!isPresent(cfg.model)) { configReports.push({ ...cfg, present: false }); continue; }
  const results = await runEvalForModel(OLLAMA, cfg.model, items); // one full GPU run
  const byHeldOutVi = folds.map((f) => {
    const rs = results.filter((r) => viBasename(r) === f.heldOutVi);
    const agg = aggregate(rs);
    return { heldOutVi: f.heldOutVi, n: rs.length, trainCount: f.trainCount, overall: agg.overall, standardMean: agg.standardMean, adversarialMean: agg.adversarialMean, byTask: agg.byTask };
  });
  const macroOverall = meanOf(byHeldOutVi.map((h) => h.overall).filter((x) => x !== null));
  const macroAdv = meanOf(byHeldOutVi.map((h) => h.adversarialMean).filter((x) => x !== null));
  configReports.push({ ...cfg, present: true, macroHeldOutOverall: macroOverall, macroHeldOutAdversarial: macroAdv, byHeldOutVi });
}

const report = {
  schema: 'vi-history-suite/ollama-heldout-lovo-baseline@v1',
  generatedAt: new Date().toISOString(),
  host: 'LINUX', hostname: os.hostname(), backend: 'gpu', ollamaUrl: OLLAMA,
  method: 'leave-one-VI-out generalization baseline (memorization-free; configs are not fold-trained)',
  folds: folds.map((f) => ({ fold: f.fold, heldOutVi: f.heldOutVi, heldOutCount: f.heldOutCount, trainCount: f.trainCount })),
  note: 'macroHeldOutOverall = mean across the 5 held-out VIs of the config overall on that VI. This is the leakage-free bar a future held-out-trained LoRA must beat. A single-split LoRA scored on its own training VIs would be a memorization ceiling and is NOT comparable to these.',
  gpuNondeterminismNote: 'KNOWN GPU nondeterminism (#2381, jointly closed with WIN): the lv_icon borderline adversarial item (adv-false-nochange, N=6) flips statesStructuralCount MISS/PASS depending on the GPU OFFLOAD CONFIG, which depends on model-load order / VRAM state (seed-invariant within one load per seedDivergenceCheck.mjs, but run-context-variant across loads: isolated load -> MISS; loaded right after another 8b -> PASS). This adds a ~0.012 band to the 8b-2shot macro-overall and can shift which single task lv_icon misses. WIN CPU backend does not exhibit it (crossBackendCheck adv=1.0). The RANKING (14b > 8b-2shot > 8b-fewshot > 8b-raw) is robust to this band.',
  configs: configReports
};
fs.writeFileSync(path.join(OUT_DIR, 'ollama-heldout-lovo-baseline.json'), JSON.stringify(report, null, 2), 'utf8');

console.log('HELDOUT_LOVO_DONE');
console.log('| config | present | macro held-out overall | macro held-out adversarial |');
console.log('|---|---|---|---|');
for (const c of configReports) console.log(`| ${c.id} | ${c.present ? 'yes' : 'no'} | ${c.present ? c.macroHeldOutOverall : '-'} | ${c.present ? c.macroHeldOutAdversarial : '-'} |`);
console.log('\nper held-out VI (overall):');
for (const c of configReports.filter((x) => x.present)) {
  console.log(`  ${c.id.padEnd(11)} ${c.byHeldOutVi.map((h) => `${h.heldOutVi}=${h.overall}`).join('  ')}`);
}
