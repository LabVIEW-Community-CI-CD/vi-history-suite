#!/usr/bin/env node
// prototype/ml/correlationLovoLoroSplit.mjs
//
// Held-out SPLIT manifest for the CORRECTED, SCALED correlation dataset (dataset-scale thread, WIN
// @b66af8cb). WIN's enumerateViChangePairs.cjs fixed a sourcing bug (a single net snapshot pair under
// `git diff --diff-filter=M` undercounted: a VI added after base shows as A not M, net-zero changes
// vanish) and now emits REAL per-VI modification pairs -- actor-framework 102 VIs + icon-editor 449 VIs
// = 551 comparable VIs across two repos, each {repo,repoTag,vi,base,selected,slug,subject}.
//
// This module is the LINUX-lane METHODOLOGY piece (like lovoSplit.mjs): it reads WIN's per-repo change
// manifests and emits the CANONICAL held-out folds both the LabVIEW correlation oracle (WIN Docker) and
// the ollama grounded/faithfulness eval (LINUX) index against by `slug`, so neither side leaks a
// held-out VI into training:
//   - LORO  leave-one-REPO-out: one fold per repo (hold out AF, train IE; hold out IE, train AF) =
//           genuine CROSS-REPO generalization ("train icon-editor, test actor-framework").
//   - LOVO  leave-one-VI-out: one fold per VI (train = every OTHER slug). Compact form: the heldOut slug
//           list + note; train is derivable as allSlugs \ {heldOut}. The runner picks a subset (via
//           CORR_ONLY_SLUGS / CORR_LIMIT); materializing 551 x 550 train lists would be needless bulk.
//
// PURE + SELF-TESTING (no torch, no network, no LabVIEW): reads WIN's manifests, verifies partition
// invariants, writes prototype/ml/dataset/correlation-heldout-folds.json. It never touches WIN's
// win-lvkit tree. Run from repo root: node prototype/ml/correlationLovoLoroSplit.mjs
import fs from 'node:fs';
import path from 'node:path';

const FIXTURES_DIR = path.join('prototype', 'win-lvkit', 'correlation-fixtures');
const OUT = path.join('prototype', 'ml', 'dataset', 'correlation-heldout-folds.json');

/** Load + concatenate every `*-change-pairs.json` array under a fixtures dir (auto-scales to new repos). */
export function loadChangePairs(fixturesDir) {
  const files = fs
    .readdirSync(fixturesDir)
    .filter((f) => /-change-pairs\.json$/i.test(f))
    .sort();
  const pairs = [];
  for (const f of files) {
    const arr = JSON.parse(fs.readFileSync(path.join(fixturesDir, f), 'utf8'));
    if (!Array.isArray(arr)) throw new Error(`${f} is not a JSON array of pairs`);
    for (const p of arr) pairs.push(p);
  }
  return pairs;
}

/** Leave-one-REPO-out folds: hold out one repoTag's slugs, train on all others. Cross-repo generalization. */
export function buildLoroFolds(pairs) {
  const repos = [...new Set(pairs.map((p) => p.repoTag))].sort();
  const slugsByRepo = new Map(repos.map((r) => [r, pairs.filter((p) => p.repoTag === r).map((p) => p.slug)]));
  return repos.map((heldOutRepo, fold) => {
    const heldOutSlugs = slugsByRepo.get(heldOutRepo);
    const trainRepos = repos.filter((r) => r !== heldOutRepo);
    const trainSlugs = trainRepos.flatMap((r) => slugsByRepo.get(r));
    return {
      fold,
      heldOutRepo,
      trainRepos,
      heldOutCount: heldOutSlugs.length,
      trainCount: trainSlugs.length,
      heldOutSlugs,
      trainSlugs
    };
  });
}

/** Leave-one-VI-out folds (compact): one fold per slug; train = allSlugs \ {heldOutSlug}. */
export function buildLovoFolds(pairs) {
  const folds = pairs.map((p, fold) => ({ fold, heldOutSlug: p.slug, heldOutRepo: p.repoTag }));
  return {
    method: 'leave-one-VI-out',
    foldCount: folds.length,
    note: 'Compact: each fold holds out exactly ONE slug; train = allSlugs minus that slug. Runner selects folds via CORR_ONLY_SLUGS / CORR_LIMIT against WIN CORR_PAIRS_JSON manifests.',
    folds
  };
}

// Run-if-main: build both split types, verify invariants, emit the manifest + a self-test summary.
if (import.meta.url === `file://${process.argv[1]}`) {
  const pairs = loadChangePairs(FIXTURES_DIR);
  const allSlugs = pairs.map((p) => p.slug);
  const uniqueSlugs = new Set(allSlugs);

  const loro = buildLoroFolds(pairs);
  const lovo = buildLovoFolds(pairs);

  // Invariants (fail closed):
  //  - slugs are unique across the whole corpus (WIN's enumerator guarantees this; assert it);
  //  - LORO folds PARTITION the corpus: each slug held out exactly once, train+heldOut == total per fold;
  //  - LOVO holds out each slug exactly once (foldCount == corpus size).
  let misses = 0;
  if (uniqueSlugs.size !== allSlugs.length) misses += 1; // duplicate slug => leakage risk
  const loroHeldUnion = new Set();
  for (const f of loro) {
    if (f.trainCount + f.heldOutCount !== pairs.length) misses += 1;
    const heldSet = new Set(f.heldOutSlugs);
    if (f.trainSlugs.some((s) => heldSet.has(s))) misses += 1; // train/heldOut overlap
    f.heldOutSlugs.forEach((s) => loroHeldUnion.add(s));
  }
  if (loroHeldUnion.size !== uniqueSlugs.size) misses += 1;
  if (lovo.foldCount !== pairs.length) misses += 1;
  if (new Set(lovo.folds.map((f) => f.heldOutSlug)).size !== pairs.length) misses += 1;

  const byRepo = {};
  for (const p of pairs) byRepo[p.repoTag] = (byRepo[p.repoTag] || 0) + 1;

  const report = {
    schema: 'vi-history-suite/correlation-heldout-folds@v1',
    generatedAt: new Date().toISOString(),
    source: `${FIXTURES_DIR}/*-change-pairs.json (WIN enumerateViChangePairs.cjs @b66af8cb)`,
    totalPairs: pairs.length,
    byRepo,
    allSlugs,
    loro,
    lovo,
    note: 'Canonical held-out fold contract for the corrected 551-VI correlation dataset. Both the LabVIEW correlation oracle (WIN) and the ollama grounded eval (LINUX) index folds by slug so a held-out VI never leaks into training. LORO = cross-repo generalization; LOVO = per-VI. Join slugs to repo/vi/base/selected via WIN CORR_PAIRS_JSON manifests.'
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');

  const repoSummary = Object.entries(byRepo).map(([r, n]) => `${r}=${n}`).join(' ');
  console.log(`CORR_SPLIT_DONE totalPairs=${pairs.length} repos=[${repoSummary}] loroFolds=${loro.length} lovoFolds=${lovo.foldCount} invariantMisses=${misses}`);
  for (const f of loro) {
    console.log(`  LORO fold ${f.fold}: heldOut=${f.heldOutRepo} (${f.heldOutCount})  train=[${f.trainRepos.join(', ')}] (${f.trainCount})`);
  }
  console.log(`  wrote ${OUT}`);
  if (misses > 0) process.exit(1);
}
