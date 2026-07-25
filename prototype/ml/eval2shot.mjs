// prototype/ml/eval2shot.mjs  (LINUX #2381)
//
// Focused single-config eval of the 2-shot Modelfile (vichange8b-2shot) over the SAME
// frozen 28-item dataset + the SAME shared scorer as evalCompareConfigs.mjs, WITHOUT
// touching WIN's 3-config comparator output (ollama-eval-compare-configs.json). It writes
// a separate ollama-2shot-eval.json and prints the byTask row + the two regressions the
// 2-shot targets (kinds, adversarialMean) next to the recorded 1-shot baseline so the
// uplift/regression is obvious.
//
// Run from repo root: node prototype/ml/eval2shot.mjs [model]   (default vichange8b-2shot)
// Env: OLLAMA_URL (default http://localhost:11434), REGRESSION_FLOOR (default 1).
import fs from 'node:fs';
import path from 'node:path';
import { runEvalForModel, aggregate } from './vichangeEvalCore.mjs';

const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const FLOOR = process.env.REGRESSION_FLOOR ? Number(process.env.REGRESSION_FLOOR) : 1;
const MODEL = process.argv[2] || 'vichange8b-2shot';
const OUT_DIR = path.join(process.cwd(), 'prototype', 'ml', 'dataset');

// Recorded 1-shot baseline (vichange8b-fewshot) from the grown 28-item run @a2494800.
const ONE_SHOT_BASELINE = {
  overall: 0.946,
  adversarialMean: 1,
  byTask: { 'full-summary': 0.9, count: 0.933, kinds: 0.867, 'cosmetic-split': 1, 'adv-false-nochange': 1, 'adv-cosmetic-only-trap': 1 }
};

const evalPath = path.join(OUT_DIR, 'vichange-eval-v1.jsonl');
const items = fs.readFileSync(evalPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

const results = await runEvalForModel(OLLAMA, MODEL, items);
const agg = aggregate(results);
const regressionGuard = { floor: FLOOR, adversarialMean: agg.adversarialMean, pass: agg.adversarialMean !== null && agg.adversarialMean >= FLOOR };

const report = {
  schema: 'vi-history-suite/ollama-vichange-2shot-eval@v1',
  generatedAt: new Date().toISOString(),
  model: MODEL,
  ollamaUrl: OLLAMA,
  regressionFloor: FLOOR,
  evalItems: items.length,
  oneShotBaseline: ONE_SHOT_BASELINE,
  ...agg,
  regressionGuard,
  results
};
fs.writeFileSync(path.join(OUT_DIR, 'ollama-2shot-eval.json'), JSON.stringify(report, null, 2), 'utf8');

const delta = (k) => {
  const a = agg.byTask[k];
  const b = ONE_SHOT_BASELINE.byTask[k];
  if (a == null || b == null) return '';
  const d = Math.round((a - b) * 1000) / 1000;
  return ` (1-shot ${b}, ${d >= 0 ? '+' : ''}${d})`;
};
console.log(`2SHOT_EVAL_DONE model=${MODEL} items=${items.length} floor=${FLOOR}`);
console.log(`  overall=${agg.overall} (1-shot ${ONE_SHOT_BASELINE.overall}) standard=${agg.standardMean} adversarial=${agg.adversarialMean} guard=${regressionGuard.pass ? 'PASS' : 'FAIL'}`);
console.log(`  kinds=${agg.byTask.kinds}${delta('kinds')}`);
console.log(`  adv-false-nochange=${agg.byTask['adv-false-nochange']}${delta('adv-false-nochange')}`);
console.log(`  byTask=${JSON.stringify(agg.byTask)}`);
