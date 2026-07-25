// prototype/ml/rescoreHardened.mjs  (LINUX #2381)
//
// Re-scores ALREADY-RECORDED eval outputs with the proposed hardened noFalseNoChange
// (scorerHardening.mjs), WITHOUT re-running any inference, to preview the FULL re-baseline
// the scorer fix would produce. noFalseNoChange is in scoreKeys for FOUR tasks (full-summary,
// count, adv-false-nochange, adv-cosmetic-only-trap), so the fix can move STANDARD tasks too --
// this joins each recorded item back to the frozen dataset for its ground-truth N
// (lvkitChangeCount) and re-scores EVERY affected item, then recomputes overall / standard /
// adversarial / byTask per config. Read-only; imports the pure function; no shared scorer edit.
//
// Run from repo root: node prototype/ml/rescoreHardened.mjs [compareJson] [twoShotJson]
import fs from 'node:fs';
import path from 'node:path';
import { noFalseNoChangeHardened } from './scorerHardening.mjs';

const OUT_DIR = path.join(process.cwd(), 'prototype', 'ml', 'dataset');
const comparePath = process.argv[2] || path.join(OUT_DIR, 'ollama-eval-compare-configs.json');
const twoShotPath = process.argv[3] || path.join(OUT_DIR, 'ollama-2shot-eval.json');

const round3 = (n) => Math.round(n * 1000) / 1000;
const mean = (arr) => (arr.length ? round3(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

// Join key -> ground-truth N (lvkitChangeCount) from the frozen dataset (needed for the
// N===0 short-circuit on standard tasks; recorded detail items do not carry N).
const nByViTask = new Map();
for (const line of fs.readFileSync(path.join(OUT_DIR, 'vichange-eval-v1.jsonl'), 'utf8').trim().split('\n')) {
  if (!line) continue;
  const e = JSON.parse(line);
  nByViTask.set(`${e.vi.split('/').pop()}::${e.task}`, e.groundTruth.lvkitChangeCount);
}

// Recompute one item's faithfulness after flipping only its noFalseNoChange part.
function rescoreItem(item) {
  const parts = { ...item.parts };
  const uses = item.scoreKeys?.includes('noFalseNoChange') && 'noFalseNoChange' in parts;
  const N = nByViTask.get(`${item.vi}::${item.task}`);
  let flipped = false;
  let before;
  let after;
  if (uses && typeof N === 'number') {
    before = parts.noFalseNoChange;
    after = noFalseNoChangeHardened(item.output || '', N);
    parts.noFalseNoChange = after;
    flipped = after !== before;
  }
  const rel = (item.scoreKeys || []).filter((k) => parts[k] !== undefined);
  const faith = rel.length ? round3(rel.filter((k) => parts[k]).length / rel.length) : item.faithfulness ?? 0;
  return { task: item.task, vi: item.vi, adversarial: !!item.adversarial, faithBefore: item.faithfulness, faithAfter: faith, flipped, before, after };
}

function byTaskOf(rescored, key) {
  const tasks = [...new Set(rescored.map((r) => r.task))];
  return Object.fromEntries(tasks.map((t) => [t, mean(rescored.filter((r) => r.task === t).map((r) => r[key]))]));
}

function rescoreConfig(id, results) {
  const rescored = results.map(rescoreItem);
  const flips = rescored
    .filter((r) => r.flipped)
    .map((r) => `${r.task}/${r.vi}: ${r.before}->${r.after}, faith ${r.faithBefore}->${r.faithAfter}`);
  const advBefore = mean(results.filter((r) => r.adversarial).map((r) => r.faithfulness));
  const advAfter = mean(rescored.filter((r) => r.adversarial).map((r) => r.faithAfter));
  const stdBefore = mean(results.filter((r) => !r.adversarial).map((r) => r.faithfulness));
  const stdAfter = mean(rescored.filter((r) => !r.adversarial).map((r) => r.faithAfter));
  return {
    id,
    overallBefore: mean(results.map((r) => r.faithfulness)),
    overallAfter: mean(rescored.map((r) => r.faithAfter)),
    standardBefore: stdBefore,
    standardAfter: stdAfter,
    adversarialBefore: advBefore,
    adversarialAfter: advAfter,
    guardBefore: advBefore !== null && advBefore >= 1,
    guardAfter: advAfter !== null && advAfter >= 1,
    byTaskBefore: byTaskOf(rescored, 'faithBefore'),
    byTaskAfter: byTaskOf(rescored, 'faithAfter'),
    flips
  };
}

const out = {
  schema: 'vi-history-suite/ollama-vichange-rescore-hardened@v1',
  generatedAt: new Date().toISOString(),
  note: 'full read-only re-baseline of recorded outputs with scorerHardening.noFalseNoChangeHardened (all 4 noFalseNoChange tasks, real ground-truth N); no inference',
  sources: {},
  configs: []
};

if (fs.existsSync(comparePath)) {
  const cmp = JSON.parse(fs.readFileSync(comparePath, 'utf8'));
  out.sources.compare = path.basename(comparePath);
  for (const [id, results] of Object.entries(cmp.detail || {})) {
    out.configs.push({ source: 'compare', ...rescoreConfig(id, results) });
  }
}
if (fs.existsSync(twoShotPath)) {
  const ts = JSON.parse(fs.readFileSync(twoShotPath, 'utf8'));
  out.sources.twoShot = path.basename(twoShotPath);
  out.configs.push({ source: '2shot', ...rescoreConfig(ts.model, ts.results || []) });
}

fs.writeFileSync(path.join(OUT_DIR, 'ollama-rescore-hardened.json'), JSON.stringify(out, null, 2), 'utf8');
console.log('RESCORE_HARDENED_DONE (full re-baseline; recorded outputs only, no inference)');
for (const c of out.configs) {
  const guard = c.guardBefore === c.guardAfter ? `guard ${c.guardAfter ? 'PASS' : 'FAIL'}` : `guard ${c.guardBefore ? 'PASS' : 'FAIL'}->${c.guardAfter ? 'PASS' : 'FAIL'}`;
  console.log(`${c.source}/${c.id}: overall ${c.overallBefore}->${c.overallAfter} | std ${c.standardBefore}->${c.standardAfter} | adv ${c.adversarialBefore}->${c.adversarialAfter} | ${guard} | ${c.flips.length} flip(s)`);
  for (const f of c.flips) console.log(`    ${f}`);
}
