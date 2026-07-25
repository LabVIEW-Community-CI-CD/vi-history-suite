#!/usr/bin/env node
// prototype/ml/lovoSplit.mjs
//
// Leave-One-VI-Out (LOVO) splitter for the grounded VI-change dataset (#2381, WIN CALL on the
// leakage finding). vichange-finetune-v1.jsonl is 28/28 IDENTICAL to vichange-eval-v1.jsonl, so
// a single-split LoRA fine-tune would be train-on-test (a memorization ceiling). WIN's decision:
// require a held-out split; with only 5 VIs, leave-one-VI-out (train on 4 VIs, evaluate on the
// held-out VI, rotate 5 folds) is the honest method. This module is PURE + SELF-TESTING (no
// torch, no network) and produces the fold manifest BOTH the held-out baseline runner and a
// future LoRA fine-tune consume, so training NEVER sees the held-out VI's items.
//
// Run from repo root: node prototype/ml/lovoSplit.mjs   (writes dataset/vichange-lovo-folds.json)
import fs from 'node:fs';
import path from 'node:path';

/** Extract the VI basename from a fine-tune user message ("...VI: Name.vi..."). */
export function extractViName(userContent) {
  const m = String(userContent).match(/VI:\s*([^\n]+)/);
  return m ? m[1].trim().split('/').pop() : null;
}

/** Build deterministic leave-one-VI-out folds from finetune {messages:[...]} items. */
export function buildLovoFolds(items) {
  const viOf = (it) => {
    const u = (it.messages || []).find((m) => m.role === 'user');
    return u ? extractViName(u.content) : null;
  };
  const vis = [...new Set(items.map(viOf).filter(Boolean))].sort();
  return vis.map((heldOutVi, fold) => {
    const heldOutIndices = [];
    const trainIndices = [];
    items.forEach((it, i) => { (viOf(it) === heldOutVi ? heldOutIndices : trainIndices).push(i); });
    return {
      fold,
      heldOutVi,
      trainVis: vis.filter((v) => v !== heldOutVi),
      heldOutCount: heldOutIndices.length,
      trainCount: trainIndices.length,
      heldOutIndices,
      trainIndices
    };
  });
}

// Run-if-main: read the finetune JSONL, emit the fold manifest + a self-test of the invariants.
if (import.meta.url === `file://${process.argv[1]}`) {
  const OUT_DIR = path.join(process.cwd(), 'prototype', 'ml', 'dataset');
  const items = fs.readFileSync(path.join(OUT_DIR, 'vichange-finetune-v1.jsonl'), 'utf8')
    .trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const folds = buildLovoFolds(items);

  // Invariants: every item is held out exactly once across folds; train + heldOut partition each fold.
  const total = items.length;
  let misses = 0;
  const heldUnion = new Set();
  for (const f of folds) {
    if (f.trainCount + f.heldOutCount !== total) { misses += 1; }
    if (f.trainIndices.some((i) => f.heldOutIndices.includes(i))) { misses += 1; }
    f.heldOutIndices.forEach((i) => heldUnion.add(i));
  }
  if (heldUnion.size !== total) { misses += 1; }

  const report = {
    schema: 'vi-history-suite/vichange-lovo-folds@v1',
    generatedAt: new Date().toISOString(),
    source: 'prototype/ml/dataset/vichange-finetune-v1.jsonl',
    totalItems: total,
    vis: folds.map((f) => f.heldOutVi),
    method: 'leave-one-VI-out',
    note: 'finetune==eval 28/28; a fold trains on trainIndices (4 VIs) and evaluates on heldOutIndices (1 VI). A single-split fine-tune scored on its own training VIs is a memorization ceiling and MUST be labeled as such.',
    folds
  };
  fs.writeFileSync(path.join(OUT_DIR, 'vichange-lovo-folds.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`LOVO_SPLIT_DONE items=${total} folds=${folds.length} invariantMisses=${misses}`);
  for (const f of folds) console.log(`  fold ${f.fold}: heldOut=${f.heldOutVi} (${f.heldOutCount}) train=${f.trainCount} [${f.trainVis.join(', ')}]`);
  if (misses > 0) process.exit(1);
}
