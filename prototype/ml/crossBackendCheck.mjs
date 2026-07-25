#!/usr/bin/env node
// prototype/ml/crossBackendCheck.mjs
//
// WIN independent-backend cross-validation for the ollama eval (#2381). WIN can now run ollama
// on Windows (alongside the LabVIEW windows-container), so it is a SECOND ollama backend. This
// runs ONE model over the frozen eval JSONL on THIS host's ollama with the GOVERNED shared
// scorer (vichangeEvalCore) and reports the scores -- to test whether LINUX's CPU->GPU
// 8b-2shot divergence (adv-false-nochange 1.0 -> 0.917, a statesStructuralCount content gap)
// reproduces on the WIN backend or is GPU-host-specific.
//
// It writes a SEPARATE file (ollama-crossbackend-<model>.json) and NEVER touches the canonical
// ollama-eval-compare-configs.json (LINUX's authoritative 4-config GPU report).
//
// Run from repo root: node prototype/ml/crossBackendCheck.mjs   (env MODEL, default vichange8b-2shot; OLLAMA_URL)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runEvalForModel, aggregate } from './vichangeEvalCore.mjs';

const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.MODEL || 'vichange8b-2shot';
const OUT_DIR = path.join(process.cwd(), 'prototype', 'ml', 'dataset');
const evalPath = path.join(OUT_DIR, 'vichange-eval-v1.jsonl');
const items = fs.readFileSync(evalPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

const results = await runEvalForModel(OLLAMA, MODEL, items);
const agg = aggregate(results);
const advItems = results.filter((r) => r.task === 'adv-false-nochange').map((r) => ({ vi: r.vi, faithfulness: r.faithfulness, statesStructuralCount: r.parts.statesStructuralCount, output: (r.output || '').slice(0, 200) }));

const report = {
  schema: 'vi-history-suite/ollama-crossbackend@v1',
  generatedAt: new Date().toISOString(),
  host: 'WIN', hostname: os.hostname(), ollamaUrl: OLLAMA, model: MODEL,
  overall: agg.overall, standardMean: agg.standardMean, adversarialMean: agg.adversarialMean,
  byTask: agg.byTask,
  advFalseNoChangeItems: advItems,
  results
};
fs.writeFileSync(path.join(OUT_DIR, `ollama-crossbackend-${MODEL.replace(/[:/]/g, '_')}.json`), JSON.stringify(report, null, 2), 'utf8');

console.log(`CROSSBACKEND_DONE host=WIN model=${MODEL} overall=${agg.overall} std=${agg.standardMean} adv=${agg.adversarialMean}`);
console.log('byTask=' + JSON.stringify(agg.byTask));
for (const a of advItems) console.log(`  adv-false-nochange ${a.vi}: faithfulness=${a.faithfulness} statesStructuralCount=${a.statesStructuralCount}`);
