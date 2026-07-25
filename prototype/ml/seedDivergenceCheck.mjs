#!/usr/bin/env node
// prototype/ml/seedDivergenceCheck.mjs
//
// LINUX seed-invariance evidence for the 8b-2shot CPU->GPU divergence (#2381), answering WIN's
// ask #1 on HANDOFF ml-8b-2shot-divergence: "re-run 8b-2shot on GPU with options.seed fixed +
// temperature 0 to check if the statesStructuralCount gap is deterministic; if it vanishes it
// was sampling noise." This is the LINUX counterpart to WIN's crossBackendCheck.mjs.
//
// It runs the adv-false-nochange eval items on THIS host's GPU ollama across several fixed
// seeds (plus the default no-seed) at temperature 0, scores with the GOVERNED shared scorer
// (vichangeEvalCore), and reports per-item statesStructuralCount for each seed. If the per-item
// verdict is IDENTICAL across every seed => the gap is seed-INVARIANT (a deterministic backend
// float-ordering divergence, NOT sampling noise). WIN's cross-backend check already showed the
// SAME model+data scores adv-false-nochange 1.0 on the WIN CPU backend, so a seed-invariant GPU
// miss localizes the divergence to the GPU backend, not the model weights or prompt content.
//
// Writes a SEPARATE evidence file and NEVER touches the canonical ollama-eval-compare-configs.json.
// Run from repo root: node prototype/ml/seedDivergenceCheck.mjs   (env MODEL default vichange8b-2shot; OLLAMA_URL; SEEDS csv)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SYSTEM, scoreParts } from './vichangeEvalCore.mjs';

const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.MODEL || 'vichange8b-2shot';
const SEEDS = (process.env.SEEDS || 'none,0,1,42,123').split(',').map((s) => s.trim());
const OUT_DIR = path.join(process.cwd(), 'prototype', 'ml', 'dataset');
const items = fs.readFileSync(path.join(OUT_DIR, 'vichange-eval-v1.jsonl'), 'utf8')
  .trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  .filter((o) => o.task === 'adv-false-nochange');

async function runSeed(seed) {
  const opts = { temperature: 0 };
  if (seed !== 'none') opts.seed = Number(seed);
  const out = [];
  for (const e of items) {
    const resp = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, stream: false, options: opts, messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${e.prompt}\n\n${e.facts}` }
      ] })
    });
    const j = await resp.json();
    const text = (j.message && j.message.content) || '';
    const sc = scoreParts(text, e.groundTruth);
    out.push({ vi: e.vi.split('/').pop(), lvkitChangeCount: e.groundTruth.lvkitChangeCount, statesStructuralCount: sc.parts.statesStructuralCount, output: text.slice(0, 200) });
  }
  return out;
}

const bySeed = {};
for (const seed of SEEDS) bySeed[seed] = await runSeed(seed);

// Per-item: is statesStructuralCount identical across every seed?
const vis = bySeed[SEEDS[0]].map((r) => r.vi);
const perItem = vis.map((vi) => {
  const verdicts = SEEDS.map((s) => bySeed[s].find((r) => r.vi === vi).statesStructuralCount);
  return { vi, lvkitChangeCount: bySeed[SEEDS[0]].find((r) => r.vi === vi).lvkitChangeCount, statesStructuralCountBySeed: Object.fromEntries(SEEDS.map((s, i) => [s, verdicts[i]])), seedInvariant: verdicts.every((v) => v === verdicts[0]) };
});
const seedInvariant = perItem.every((p) => p.seedInvariant);
const stableMisses = perItem.filter((p) => p.seedInvariant && p.statesStructuralCountBySeed[SEEDS[0]] === false).map((p) => p.vi);

const report = {
  schema: 'vi-history-suite/ollama-seed-divergence@v1',
  generatedAt: new Date().toISOString(),
  host: 'LINUX', hostname: os.hostname(), backend: 'gpu', ollamaUrl: OLLAMA, model: MODEL,
  seeds: SEEDS, task: 'adv-false-nochange',
  seedInvariant,
  interpretation: seedInvariant
    ? 'statesStructuralCount is IDENTICAL across all seeds -> NOT sampling noise; a deterministic GPU backend float-ordering divergence (WIN CPU backend scores 1.0 on the same model+data).'
    : 'statesStructuralCount VARIES across seeds -> sampling noise; fixing the seed changes the result.',
  stableMisses,
  perItem,
  bySeed
};
fs.writeFileSync(path.join(OUT_DIR, `ollama-seed-divergence-${MODEL.replace(/[:/]/g, '_')}.json`), JSON.stringify(report, null, 2), 'utf8');

console.log(`SEED_DIVERGENCE_DONE host=LINUX backend=gpu model=${MODEL} seedInvariant=${seedInvariant} stableMisses=[${stableMisses.join(',')}]`);
for (const p of perItem) console.log(`  ${p.vi} (N=${p.lvkitChangeCount}): ${SEEDS.map((s) => `${s}=${p.statesStructuralCountBySeed[s] ? 'OK' : 'MISS'}`).join(' ')}  invariant=${p.seedInvariant}`);
