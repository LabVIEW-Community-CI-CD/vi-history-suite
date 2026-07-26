#!/usr/bin/env node
// prototype/ml/correlationFoldEval.mjs
//
// Per-FOLD grounded/faithfulness eval for the corrected 551-VI correlation dataset (dataset-scale
// thread). Consumes the canonical held-out fold contract (correlationLovoLoroSplit.mjs ->
// correlation-heldout-folds.json) + a batch of LabVIEW-RENDERED comparison reports, and measures
// whether the OPTIONAL grounded 8b-2shot narrator stays FAITHFUL on the held-out set -- the
// LEAVE-ONE-REPO-OUT (LORO) cross-repo generalization question: a narrator whose 2-shot exemplars
// are icon-editor-flavored, does it stay hard-safe on UNSEEN actor-framework VIs?
//
// It reuses the SHIPPED per-VI grounded path verbatim (groundedNarrativeProvider.selectMcpNarrative
// + createOllamaGenerate + the shared narrativeQualityGate scorer): for each held-out VI it builds
// the vi-semantic-comparison model from the rendered HTML, renders the deterministic template as the
// faithful fallback, generates the grounded narrative, and records whether it cleared the HARD SAFETY
// FLOOR (GROUNDED_NARRATIVE_SAFETY_KEYS: statesStructuralCount + noFalseNoChange + noInventedNumbers).
// The LORO number = the held-out repo's hard-safe rate. GROUNDING IS NEVER INVENTED: a fold with no
// rendered reports reports status 'pending-render', not a fabricated score.
//
// Batch source (what WIN hands over as LabVIEW batches land):
//   CORR_BATCH_JSON  path to a JSON array [{ slug, repo, htmlPath, cosmeticCount? }] of rendered
//                    reports (htmlPath relative to repo root or absolute). Overrides the smoke set.
//   (default)        SMOKE: the committed *.labview-diff-report.html in win-lvkit/correlation-fixtures,
//                    tagged repo='ie' -- an in-distribution icon-editor sample proving the harness end
//                    to end. There are ZERO rendered actor-framework reports yet, so the AF (cross-repo)
//                    fold is honestly 'pending-render' until WIN lands an AF batch.
// Other env: CORR_MODEL (default vichange8b-2shot), OLLAMA_URL, VIHS_SWEEP_LABEL (output suffix),
//   VIHS_EVAL_HOST / VIHS_EVAL_BACKEND (report metadata, default LINUX/gpu).
// Run from repo root: node prototype/ml/correlationFoldEval.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLabviewDiffReportCounts } from '../labviewDiffReportParser.mjs';
import { buildViSemanticComparisonModelFromHtml, renderViSemanticNarrative } from '../../out/semantic/viSemanticModel.js';
import {
  selectMcpNarrative,
  createOllamaGenerate,
  groundTruthForModel,
  GROUNDED_NARRATIVE_SAFETY_KEYS
} from './groundedNarrativeProvider.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join('prototype', 'win-lvkit', 'correlation-fixtures');
const FOLDS_PATH = path.join('prototype', 'ml', 'dataset', 'correlation-heldout-folds.json');
const MODEL = process.env.CORR_MODEL || 'vichange8b-2shot';
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const SWEEP_LABEL = (process.env.VIHS_SWEEP_LABEL || '').replace(/[^a-z0-9._-]/gi, '');
const EVAL_HOST = process.env.VIHS_EVAL_HOST || 'LINUX';
const EVAL_BACKEND = process.env.VIHS_EVAL_BACKEND || 'gpu';
const OUT = path.join('prototype', 'ml', 'dataset', `correlation-fold-eval${SWEEP_LABEL ? `-${SWEEP_LABEL}` : ''}.json`);

/** Mirror WIN enumerateViChangePairs slugFor: `${repoTag}-${kebab(basename)}`. */
function slugFor(repoTag, viOrFile) {
  const base = String(viOrFile).split('/').pop().replace(/\.(vi|labview-diff-report\.html)$/i, '');
  const kebab = base.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return `${repoTag}-${kebab}`;
}

/** Default SMOKE batch: the committed icon-editor rendered reports (repo='ie', in-distribution). */
function smokeBatch() {
  return fs
    .readdirSync(FIXTURES)
    .filter((f) => /\.labview-diff-report\.html$/i.test(f))
    .sort()
    .map((f) => ({ slug: slugFor('ie', f), repo: 'ie', htmlPath: path.join(FIXTURES, f), cosmeticCount: null }));
}

/**
 * Collision disambiguation for auto-discovery: fixtureSlug (basename lowercased) -> repo. Icon-editor
 * vendors actor-framework code, so some basenames (PrepareIESource, RestoreSetupLVSource) exist in BOTH
 * repos and the flat rendered-HTML filename cannot say which was rendered. Authoritative source =
 * WIN benchmark-dataset.json (per-sample repo + vi); a committed correlation-repo-hints.json supplies
 * overrides for renders benchmark does not cover yet. NEVER guesses -- only maps what these state.
 */
function loadRepoDisambiguation() {
  const map = new Map();
  const benchPath = path.join(FIXTURES, 'benchmark-dataset.json');
  if (fs.existsSync(benchPath)) {
    try {
      const bench = JSON.parse(fs.readFileSync(benchPath, 'utf8'));
      for (const s of bench.samples || []) {
        if (s.repo && s.vi) map.set(path.basename(s.vi).replace(/\.vi$/i, '').toLowerCase(), s.repo);
      }
    } catch { /* ignore malformed benchmark */ }
  }
  const hintsPath = path.join('prototype', 'ml', 'dataset', 'correlation-repo-hints.json');
  if (fs.existsSync(hintsPath)) {
    try {
      const hints = JSON.parse(fs.readFileSync(hintsPath, 'utf8'));
      for (const [k, v] of Object.entries(hints.overrides || {})) map.set(k.toLowerCase(), v);
    } catch { /* ignore malformed hints */ }
  }
  return map;
}

/**
 * CORR_AUTO batch: map EVERY rendered *.labview-diff-report.html in FIXTURES to a manifest slug by
 * kebab basename, inferring repo from whichever repoTag makes `${repoTag}-${kebab}` a real manifest
 * slug. A basename that matches slugs in MULTIPLE repos (cross-repo collision) is resolved via the
 * authoritative repo disambiguation (benchmark-dataset.json + committed hints); if still unresolved,
 * or if it matches no slug, it is skipped (reported in unmappedFixtures with a reason), never guessed.
 * This lets each accumulating WIN batch be scored with a single re-run (grows LORO fold0 toward 102).
 */
function autoDiscoverBatch(foldsManifest) {
  const slugSet = new Set(foldsManifest.allSlugs || []);
  const repos = [...new Set((foldsManifest.loro || []).map((f) => f.heldOutRepo))];
  const disambig = loadRepoDisambiguation();
  const batch = [];
  const unmapped = [];
  for (const f of fs.readdirSync(FIXTURES).filter((x) => /\.labview-diff-report\.html$/i.test(x)).sort()) {
    const base = f.replace(/\.labview-diff-report\.html$/i, '');
    const kebab = base.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
    // Fixtures named by their repo-prefixed manifest slug (e.g. af-prepareiesource)
    // are already unambiguous: the kebab IS a full manifest slug, so use it directly
    // and infer the repo from the slug's leading repoTag. This retires the af/ie
    // basename collision at the source. Legacy flat basenames (kebab not a full
    // slug) fall through to the repo-prepend + disambiguation logic below.
    if (slugSet.has(kebab)) {
      const repo = kebab.slice(0, kebab.indexOf('-'));
      batch.push({ slug: kebab, repo, htmlPath: path.join(FIXTURES, f), cosmeticCount: null });
      continue;
    }
    const matches = repos.filter((r) => slugSet.has(`${r}-${kebab}`));
    let repo = null;
    if (matches.length === 1) {
      repo = matches[0];
    } else if (matches.length > 1) {
      const hint = disambig.get(base.toLowerCase());
      if (hint && matches.includes(hint)) repo = hint;
    }
    if (repo) {
      batch.push({ slug: `${repo}-${kebab}`, repo, htmlPath: path.join(FIXTURES, f), cosmeticCount: null });
    } else {
      unmapped.push({ file: f, kebab, matchedRepos: matches, reason: matches.length > 1 ? 'collision-unresolved' : 'no-slug' });
    }
  }
  return { batch, unmapped };
}

/** Score one rendered VI through the SHIPPED grounded path. Never invents grounding. */
async function evalOneVi(sample, generate) {
  const html = fs.readFileSync(sample.htmlPath, 'utf8');
  const counts = parseLabviewDiffReportCounts(html);
  const cosmeticCount = sample.cosmeticCount != null ? sample.cosmeticCount : counts.cosmetic;
  const model = buildViSemanticComparisonModelFromHtml(html, { reportFilePath: path.basename(sample.htmlPath) });
  const template = renderViSemanticNarrative(model);
  const sel = await selectMcpNarrative({ model, cosmeticCount, templateNarrative: template, generate });

  const hardSafe = Boolean(sel.grounded && sel.grounded.parts && GROUNDED_NARRATIVE_SAFETY_KEYS.every((k) => sel.grounded.parts[k] === true));
  let invented = [];
  if (sel.grounded && sel.grounded.narrative) {
    const allowed = new Set(groundTruthForModel(model, cosmeticCount).allowedNumbers.map(Number));
    invented = (sel.grounded.narrative.match(/\d+/g) || []).map(Number).filter((n) => n > 1 && !allowed.has(n));
  }
  return {
    slug: sample.slug,
    repo: sample.repo,
    vi: model.viPath || path.basename(sample.htmlPath),
    nonCosmetic: model.totals.detailItemCount,
    cosmetic: cosmeticCount,
    source: sel.source,
    reason: sel.reason,
    hardSafe,
    groundedScore: sel.grounded ? sel.grounded.score : null,
    templateScore: sel.template.score,
    invented
  };
}

/** Aggregate per-VI results into LORO folds. Pure: no I/O, no network. */
export function summarizeLoro(perVi, loroFolds) {
  return loroFolds.map((fold) => {
    const results = perVi.filter((r) => r.repo === fold.heldOutRepo);
    const rendered = results.length;
    const hardSafeCount = results.filter((r) => r.hardSafe).length;
    const acceptCount = results.filter((r) => r.source === 'grounded').length;
    const invented = results.flatMap((r) => r.invented);
    return {
      fold: fold.fold,
      heldOutRepo: fold.heldOutRepo,
      trainRepos: fold.trainRepos,
      foldSize: fold.heldOutCount,
      rendered,
      status: rendered === 0 ? 'pending-render' : rendered < fold.heldOutCount ? 'partial' : 'complete',
      hardSafeRate: rendered ? hardSafeCount / rendered : null,
      acceptRate: rendered ? acceptCount / rendered : null,
      invented,
      inventedHazard: invented.length > 0
    };
  });
}

async function main() {
  if (!fs.existsSync(FOLDS_PATH)) {
    console.error(`missing ${FOLDS_PATH} -- run: node prototype/ml/correlationLovoLoroSplit.mjs`);
    process.exit(2);
  }
  const foldsManifest = JSON.parse(fs.readFileSync(FOLDS_PATH, 'utf8'));
  let batch, batchSource;
  let unmapped = [];
  if (process.env.CORR_BATCH_JSON) {
    batch = JSON.parse(fs.readFileSync(process.env.CORR_BATCH_JSON, 'utf8'));
    batchSource = process.env.CORR_BATCH_JSON;
  } else if (process.env.CORR_AUTO === '1') {
    const disc = autoDiscoverBatch(foldsManifest);
    batch = disc.batch;
    unmapped = disc.unmapped;
    batchSource = `AUTO (${batch.length} rendered reports in ${FIXTURES} mapped to manifest slugs; ${unmapped.length} unmapped-skipped)`;
  } else {
    batch = smokeBatch();
    batchSource = `SMOKE (${FIXTURES}/*.labview-diff-report.html, repo=ie in-distribution)`;
  }

  let present = false;
  try {
    const tags = await (await fetch(`${OLLAMA}/api/tags`)).json();
    present = (tags.models || []).some((m) => m.name === MODEL || m.name === `${MODEL}:latest`);
  } catch { present = false; }
  const generate = present ? createOllamaGenerate({ ollamaUrl: OLLAMA, model: MODEL }) : undefined;

  const perVi = [];
  for (const sample of batch) {
    try {
      perVi.push(await evalOneVi(sample, generate));
    } catch (ex) {
      perVi.push({ slug: sample.slug, repo: sample.repo, error: String(ex) });
    }
  }

  const loro = summarizeLoro(perVi.filter((r) => !r.error), foldsManifest.loro);
  const crossRepo = loro.find((f) => f.heldOutRepo === 'af') || null;

  const report = {
    schema: 'vi-history-suite/correlation-fold-eval@v1',
    generatedAt: new Date().toISOString(),
    host: EVAL_HOST, backend: EVAL_BACKEND, label: SWEEP_LABEL || null,
    ollamaUrl: OLLAMA, model: MODEL, modelPresent: present,
    batchSource,
    foldsSource: FOLDS_PATH,
    totalRendered: perVi.filter((r) => !r.error).length,
    errors: perVi.filter((r) => r.error),
    unmappedFixtures: unmapped,
    loro,
    crossRepoGeneralization: crossRepo
      ? (crossRepo.status === 'pending-render'
          ? { status: 'pending-render', note: 'No actor-framework reports rendered yet -- WIN lands the AF batch, then this is the train-icon-editor/test-actor-framework hard-safe rate.' }
          : { status: crossRepo.status, hardSafeRate: crossRepo.hardSafeRate, rendered: crossRepo.rendered, foldSize: crossRepo.foldSize, invented: crossRepo.invented })
      : null,
    perVi,
    note: 'LORO hard-safe rate = fraction of held-out-repo grounded narratives clearing the safety floor (no invented number, no false no-change, states the count). A fold with 0 rendered reports is pending-render, never a fabricated score. Grounding is built from the rendered LabVIEW HTML, never invented.'
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');

  console.log(`CORR_FOLD_EVAL_DONE model=${MODEL} present=${present} rendered=${report.totalRendered} batch="${batchSource}"`);
  for (const f of loro) {
    const rate = f.hardSafeRate == null ? 'n/a' : `${(f.hardSafeRate * 100).toFixed(1)}%`;
    console.log(`  LORO fold ${f.fold} heldOut=${f.heldOutRepo} [${f.status}] rendered=${f.rendered}/${f.foldSize} hardSafe=${rate} accept=${f.acceptRate == null ? 'n/a' : (f.acceptRate * 100).toFixed(1) + '%'} invented=${JSON.stringify(f.invented)}`);
  }
  if (crossRepo && crossRepo.status === 'pending-render') {
    console.log('  CROSS-REPO (train ie / test af): PENDING WIN actor-framework batch (0 AF renders exist).');
  }
  if (unmapped.length) {
    console.log(`  ${unmapped.length} rendered report(s) unmapped to a manifest slug (skipped): ${unmapped.map((u) => u.file).join(', ')}`);
  }
  console.log(`  wrote ${OUT}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((ex) => { console.error(ex); process.exit(1); });
}
