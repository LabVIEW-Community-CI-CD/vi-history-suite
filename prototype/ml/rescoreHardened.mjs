// prototype/ml/rescoreHardened.mjs  (LINUX #2381)
//
// Re-scores ALREADY-RECORDED eval outputs with the proposed hardened noFalseNoChange
// (scorerHardening.mjs), WITHOUT re-running any inference. It quantifies exactly how the
// proposed scorer change would move each config's adversarialMean on the data WIN already
// has committed, so the accept/adjust decision is evidence-based rather than speculative.
// Read-only; imports the pure hardened function; touches no shared scorer.
//
// Run from repo root: node prototype/ml/rescoreHardened.mjs [compareJson] [twoShotJson]
import fs from 'node:fs';
import path from 'node:path';
import { noFalseNoChangeHardened } from './scorerHardening.mjs';

const OUT_DIR = path.join(process.cwd(), 'prototype', 'ml', 'dataset');
const comparePath = process.argv[2] || path.join(OUT_DIR, 'ollama-eval-compare-configs.json');
const twoShotPath = process.argv[3] || path.join(OUT_DIR, 'ollama-2shot-eval.json');

const round3 = (n) => Math.round(n * 1000) / 1000;

// Recompute one item's faithfulness after flipping only its noFalseNoChange part.
function rescoreItem(item) {
  const parts = { ...item.parts };
  if (!('noFalseNoChange' in parts) || !item.scoreKeys?.includes('noFalseNoChange')) {
    return { faithfulness: item.faithfulness, flipped: false };
  }
  // Adversarial items always have a real change set (N>0) -- the trap is a false "no change"
  // claim on a changed VI -- so pass N=1 and let the hardened check judge refutation-vs-assertion.
  const hardened = noFalseNoChangeHardened(item.output || '', 1);
  const before = parts.noFalseNoChange;
  parts.noFalseNoChange = hardened;
  const rel = item.scoreKeys.filter((k) => parts[k] !== undefined);
  const faith = rel.length ? round3(rel.filter((k) => parts[k]).length / rel.length) : 0;
  return { faithfulness: faith, flipped: hardened !== before, before, after: hardened };
}

function rescoreConfig(id, results) {
  const adv = results.filter((r) => r.adversarial);
  const flips = [];
  const meanBefore = adv.length ? round3(adv.reduce((a, r) => a + r.faithfulness, 0) / adv.length) : null;
  let sumAfter = 0;
  for (const r of adv) {
    const rs = rescoreItem(r);
    sumAfter += rs.faithfulness;
    if (rs.flipped) {
      flips.push(`${r.task}/${r.vi}: noFalseNoChange ${rs.before}->${rs.after}, faith ${r.faithfulness}->${rs.faithfulness}`);
    }
  }
  const meanAfter = adv.length ? round3(sumAfter / adv.length) : null;
  return {
    id,
    advItems: adv.length,
    adversarialMeanBefore: meanBefore,
    adversarialMeanHardened: meanAfter,
    guardBefore: meanBefore !== null && meanBefore >= 1,
    guardHardened: meanAfter !== null && meanAfter >= 1,
    flips
  };
}

const out = {
  schema: 'vi-history-suite/ollama-vichange-rescore-hardened@v1',
  generatedAt: new Date().toISOString(),
  note: 'read-only re-scoring of recorded outputs with scorerHardening.noFalseNoChangeHardened; no inference',
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
console.log('RESCORE_HARDENED_DONE (no inference; recorded outputs only)');
for (const c of out.configs) {
  const guard = c.guardBefore === c.guardHardened ? `guard ${c.guardHardened ? 'PASS' : 'FAIL'}` : `guard ${c.guardBefore ? 'PASS' : 'FAIL'}->${c.guardHardened ? 'PASS' : 'FAIL'}`;
  console.log(`${c.source}/${c.id}: adversarialMean ${c.adversarialMeanBefore} -> ${c.adversarialMeanHardened} | ${guard} | ${c.flips.length} item(s) flipped`);
  for (const f of c.flips) console.log(`    ${f}`);
}
