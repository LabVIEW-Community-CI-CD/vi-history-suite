#!/usr/bin/env node
// prototype/ml/crossBackendAgreement.mjs
//
// Backend-agreement analyzer for the leakage-free leave-one-VI-out generalization bar (#2381).
// Consumes BOTH held-out baselines -- LINUX GPU (ollama-heldout-lovo-baseline.json) and WIN CPU
// (ollama-heldout-crossbackend.json) -- and reports whether the generalization RANKING is
// backend-robust: per-config macro-overall delta (GPU vs CPU), the two rankings, an exact-order
// match flag, and a Spearman rank-correlation. This is the evidence line for the #2381 shippable
// conclusion: if the ranking agrees across an independent backend, "few-shot 8b as default" rests
// on a backend-robust ordering, not a single-host artifact (consistent with the jointly-closed
// 8b-2shot adversarial divergence being isolated to the GPU offload config).
//
// PURE (no network, no torch). Run from repo root: node prototype/ml/crossBackendAgreement.mjs
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.join(process.cwd(), 'prototype', 'ml', 'dataset');
const round3 = (n) => (n === null || n === undefined ? null : Math.round(n * 1000) / 1000);

function loadConfigs(file) {
  const p = path.join(OUT_DIR, file);
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const map = new Map();
  for (const c of j.configs || []) {
    if (c.present && c.macroHeldOutOverall !== null && c.macroHeldOutOverall !== undefined) {
      map.set(c.id, c.macroHeldOutOverall);
    }
  }
  return { backend: j.backend, host: j.host, foldCount: j.foldCount ?? (j.folds ? j.folds.length : null), map };
}

const gpu = loadConfigs('ollama-heldout-lovo-baseline.json');
const cpu = loadConfigs('ollama-heldout-crossbackend.json');
if (!gpu || !cpu) {
  console.error('MISSING baseline(s): ' + [!gpu ? 'ollama-heldout-lovo-baseline.json (GPU)' : null, !cpu ? 'ollama-heldout-crossbackend.json (WIN CPU)' : null].filter(Boolean).join(', '));
  process.exit(2);
}

// Configs present in BOTH backends.
const shared = [...gpu.map.keys()].filter((id) => cpu.map.has(id));
const rankOf = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).filter((id) => shared.includes(id));
const gpuRank = rankOf(gpu.map);
const cpuRank = rankOf(cpu.map);
const exactOrderMatch = gpuRank.length === cpuRank.length && gpuRank.every((id, i) => id === cpuRank[i]);

// Spearman rank correlation over the shared configs.
const gpuPos = Object.fromEntries(gpuRank.map((id, i) => [id, i + 1]));
const cpuPos = Object.fromEntries(cpuRank.map((id, i) => [id, i + 1]));
const n = shared.length;
let spearman = null;
if (n >= 2) {
  const sumD2 = shared.reduce((s, id) => s + (gpuPos[id] - cpuPos[id]) ** 2, 0);
  spearman = round3(1 - (6 * sumD2) / (n * (n * n - 1)));
}

const perConfig = shared.map((id) => ({
  id,
  gpu: round3(gpu.map.get(id)),
  cpu: round3(cpu.map.get(id)),
  delta: round3(cpu.map.get(id) - gpu.map.get(id)),
  gpuRank: gpuPos[id],
  cpuRank: cpuPos[id]
})).sort((a, b) => a.gpuRank - b.gpuRank);

const maxAbsDelta = round3(Math.max(...perConfig.map((c) => Math.abs(c.delta))));

const report = {
  schema: 'vi-history-suite/ollama-heldout-backend-agreement@v1',
  generatedAt: new Date().toISOString(),
  sources: {
    gpu: { file: 'prototype/ml/dataset/ollama-heldout-lovo-baseline.json', host: gpu.host, foldCount: gpu.foldCount },
    cpu: { file: 'prototype/ml/dataset/ollama-heldout-crossbackend.json', host: cpu.host, foldCount: cpu.foldCount }
  },
  sharedConfigs: shared,
  gpuRanking: gpuRank,
  cpuRanking: cpuRank,
  exactOrderMatch,
  spearman,
  maxAbsDelta,
  perConfig,
  note: 'Backend-robust ranking => the #2381 "few-shot 8b as default" recommendation does not depend on a single host. exactOrderMatch=true or spearman=1 means the GPU and CPU backends agree on the generalization ordering; per-config delta shows absolute-score drift (expected small; the 8b-2shot adversarial offload band lives inside adv, mostly averaged out at macro-overall).'
};
fs.writeFileSync(path.join(OUT_DIR, 'ollama-heldout-backend-agreement.json'), JSON.stringify(report, null, 2), 'utf8');

console.log('BACKEND_AGREEMENT_DONE sharedConfigs=' + shared.length + ' exactOrderMatch=' + exactOrderMatch + ' spearman=' + spearman + ' maxAbsDelta=' + maxAbsDelta);
console.log('GPU ranking: ' + gpuRank.join(' > '));
console.log('CPU ranking: ' + cpuRank.join(' > '));
console.log('| config | gpu | cpu | delta(cpu-gpu) | gpuRank | cpuRank |');
console.log('|---|---|---|---|---|---|');
for (const c of perConfig) console.log(`| ${c.id} | ${c.gpu} | ${c.cpu} | ${c.delta} | ${c.gpuRank} | ${c.cpuRank} |`);
