#!/usr/bin/env node
// prototype/ml/buildShippableConclusion.mjs
//
// Synthesizes the #2381 SHIPPABLE CONCLUSION for the grounded VI-change faithful-summarization
// thread into ONE governed artifact. It reads the evidence already produced by both agents --
// the canonical multi-config eval (ollama-eval-compare-configs.json, LINUX/GPU, hardened scorer),
// the leakage-free leave-one-VI-out held-out bars (ollama-heldout-lovo-baseline.json GPU +
// ollama-heldout-crossbackend.json WIN/CPU), the backend-agreement analysis
// (ollama-heldout-backend-agreement.json), and the dataset manifest -- and emits
// vichange-conclusion-2381.json (+ .md) with: dataset summary, per-config eval tiers, the
// leakage-free held-out bar with cross-backend agreement, the jointly-closed GPU divergence,
// the MCP product-home mapping (the model generates the vi-semantic-comparison@v1 / PR-review
// narrative; the governed faithfulness scorer is the narrative-quality gate), and the ranked
// recommendation. Every field falls back gracefully if an input artifact is absent, so it can
// run at any point; missing inputs are listed under `inputsMissing`.
//
// PURE (no network, no torch). Run from repo root: node prototype/ml/buildShippableConclusion.mjs
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.join(process.cwd(), 'prototype', 'ml', 'dataset');
const readJson = (file) => {
  const p = path.join(OUT_DIR, file);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
};
const round3 = (n) => (n === null || n === undefined ? null : Math.round(n * 1000) / 1000);

const compare = readJson('ollama-eval-compare-configs.json');
const gpuHeldout = readJson('ollama-heldout-lovo-baseline.json');
const cpuHeldout = readJson('ollama-heldout-crossbackend.json');
const agreement = readJson('ollama-heldout-backend-agreement.json');
const manifest = readJson('datasets-manifest.json');
const folds = readJson('vichange-lovo-folds.json');

const inputsMissing = [
  ['ollama-eval-compare-configs.json', compare],
  ['ollama-heldout-lovo-baseline.json', gpuHeldout],
  ['ollama-heldout-crossbackend.json', cpuHeldout],
  ['ollama-heldout-backend-agreement.json', agreement],
  ['datasets-manifest.json', manifest],
  ['vichange-lovo-folds.json', folds]
].filter(([, v]) => !v).map(([k]) => k);

// Per-config eval tiers from the canonical multi-config report.
const evalTiers = (compare?.configs || [])
  .filter((c) => c.present !== false)
  .map((c) => ({
    id: c.id,
    overall: round3(c.overall),
    adversarialMean: round3(c.adversarialMean),
    guardPass: c.regressionGuard?.pass ?? null
  }));

// Leakage-free held-out macro bars per backend.
const heldOutMacro = (report) => (report?.configs || [])
  .filter((c) => c.present)
  .map((c) => ({ id: c.id, macroOverall: round3(c.macroHeldOutOverall), macroAdversarial: round3(c.macroHeldOutAdversarial) }))
  .sort((a, b) => (b.macroOverall ?? 0) - (a.macroOverall ?? 0));

const conclusion = {
  schema: 'vi-history-suite/vichange-shippable-conclusion@v1',
  generatedAt: new Date().toISOString(),
  issue: '#2381',
  title: 'Grounded VI-change faithful summarization -- shippable conclusion',
  inputsMissing,
  dataset: {
    vis: folds?.vis || manifest?.sampleInventory || null,
    foldCount: folds?.folds?.length ?? null,
    finetunePairs: manifest?.datasets?.find?.((d) => /finetune/.test(d.file || ''))?.recordCount ?? null,
    evalItems: manifest?.datasets?.find?.((d) => /eval/.test(d.file || ''))?.recordCount ?? null,
    method: 'leave-one-VI-out (train 4+ VIs / eval 1 held-out VI, rotate); grounded facts = lvkit structural changes + LabVIEW cosmetic/non-cosmetic (the vi-semantic-comparison@v1 detail model).'
  },
  evalTiers,
  heldOutBar: {
    note: 'Leakage-free leave-one-VI-out macro-mean across held-out VIs. Configs are NOT fold-trained (raw/14b zero-shot; few-shot/2-shot use HELD-OUT synthetic exemplars), so this is the honest generalization bar a future held-out-trained LoRA must beat.',
    gpu: gpuHeldout ? { host: gpuHeldout.host, backend: gpuHeldout.backend, ranking: heldOutMacro(gpuHeldout) } : null,
    cpu: cpuHeldout ? { host: cpuHeldout.host, backend: cpuHeldout.backend, ranking: heldOutMacro(cpuHeldout) } : null,
    backendAgreement: agreement ? {
      gpuRanking: agreement.gpuRanking,
      cpuRanking: agreement.cpuRanking,
      exactOrderMatch: agreement.exactOrderMatch,
      spearman: agreement.spearman,
      maxAbsDelta: agreement.maxAbsDelta
    } : null
  },
  divergenceFinding: {
    status: 'closed',
    summary: 'The 8b-2shot adversarial statesStructuralCount gap on one borderline VI (lv_icon, N=6) is a GPU-offload-config-dependent numerics artifact: seed-invariant within one model load (seedDivergenceCheck.mjs, temp 0, seeds none/0/1/42/123) but run-context-variant across loads (isolated load -> MISS; loaded right after another 8b -> PASS). Independently corroborated by the WIN CPU backend, which holds adversarialMean=1.0 on all configs (crossBackendCheck.mjs). Not sampling noise, not a fixable model/prompt content gap; a ~0.012 band on 8b-2shot macro-overall, ranking robust.'
  },
  mcpProductHome: {
    surfaces: ['get_vi_semantic_comparison (narrative)', 'summarize_vi_history (per-step + aggregate narrative)', 'build_vi_pr_review (per-VI + aggregate narrative; markdown sticky PR comment)'],
    groundingContract: 'The model consumes the vi-semantic-comparison@v1 model (changedSurfaces, detailSections, totals.detailItemCount = non-cosmetic count, attributes) and emits its narrative -- a closed loop inside the governed contract.',
    gapVsTemplate: 'The current MCP narrative is a deterministic template (renderViSemanticNarrative) that reports only the non-cosmetic detail count and DROPS cosmetic sections (verified: a report with 3 non-cosmetic + 2 cosmetic items yields narrative "The block diagram differs. 3 detailed changes..." with no mention of the 2 cosmetic changes). A grounded faithful-summarizer surfaces cosmetic-vs-structural, fabricates no counts, and never says "no changes" over real changes.',
    integrationPoint: 'src/semantic/viSemanticModel.ts: renderViSemanticNarrative(model) (defined ~line 309) is called at ~line 264 (`narrative: renderViSemanticNarrative(model)`). A model-backed narrative generator is a drop-in alternative at that swap site -- same input (the semantic model), richer grounded output, with the deterministic template retained as the ungrounded fallback. Surfaced identically in the Source Control hover, PR/CI comment, and MCP tool output.',
    qualityGate: 'The governed faithfulness scorer (statesStructuralCount / noFalseNoChange / mentionsCosmetic / noInventedNumbers) is the narrative-quality gate for the MCP surface.'
  },
  recommendation: {
    localDefault: '8b-2shot (vichange8b-2shot) -- cheapest local, adversarially robust (adv 1.0), most consistent 8b across the held-out VIs, within a small band of 14b on the leakage-free bar.',
    largerModel: 'qwen2.5:14b when a larger model is acceptable -- top generalization on the held-out bar; verify its lone adversarial N=1 miss (MenuSelection(User)).',
    notRecommended: '1-shot few-shot as the default -- on the wider honest bar (with genuine-no-change VIs) its assert-a-count bias drops it below raw; it is not the robust choice.',
    loRA: 'DEFERRED -- the leakage fix is the held-out split (already honored by raw/few-shot/2-shot); a LoRA is backend-orthogonal to the closed GPU divergence; and the torch/Blackwell-sm_120/gated-HF/disk fine-tune infra is not cheap. A future held-out-trained LoRA is compared to the leakage-free bar above, never to a single-split memorization ceiling.',
    ungroundedFallback: 'Keep the deterministic template narrative as the ungrounded fallback when no model backend is available.'
  }
};

fs.writeFileSync(path.join(OUT_DIR, 'vichange-conclusion-2381.json'), JSON.stringify(conclusion, null, 2), 'utf8');

// Markdown rendering for the PR / discussion body.
const md = [];
md.push('# #2381 Shippable Conclusion -- Grounded VI-change Faithful Summarization', '');
if (inputsMissing.length) md.push('> inputsMissing: ' + inputsMissing.join(', '), '');
md.push('## Eval tiers (canonical multi-config)', '', '| config | overall | adversarial | guard |', '|---|---|---|---|');
for (const t of evalTiers) md.push(`| ${t.id} | ${t.overall} | ${t.adversarialMean} | ${t.guardPass} |`);
md.push('', '## Leakage-free held-out bar (leave-one-VI-out)', '');
const renderBar = (label, bar) => {
  if (!bar) { md.push(`- ${label}: (not available)`); return; }
  md.push(`- **${label}** (${bar.host}/${bar.backend}): ` + bar.ranking.map((r) => `${r.id}=${r.macroOverall}`).join(' > '));
};
renderBar('GPU', conclusion.heldOutBar.gpu);
renderBar('WIN CPU', conclusion.heldOutBar.cpu);
if (conclusion.heldOutBar.backendAgreement) {
  const a = conclusion.heldOutBar.backendAgreement;
  md.push('', `- **Backend agreement:** exactOrderMatch=${a.exactOrderMatch}, spearman=${a.spearman}, maxAbsDelta=${a.maxAbsDelta}`);
}
md.push('', '## Divergence finding', '', conclusion.divergenceFinding.summary);
md.push('', '## MCP product home', '', conclusion.mcpProductHome.groundingContract, '', '*Gap vs template:* ' + conclusion.mcpProductHome.gapVsTemplate, '', '*Integration point:* ' + conclusion.mcpProductHome.integrationPoint, '', '*Quality gate:* ' + conclusion.mcpProductHome.qualityGate);
md.push('', '## Recommendation', '',
  `- **Local default:** ${conclusion.recommendation.localDefault}`,
  `- **Larger model:** ${conclusion.recommendation.largerModel}`,
  `- **Not recommended:** ${conclusion.recommendation.notRecommended}`,
  `- **LoRA:** ${conclusion.recommendation.loRA}`,
  `- **Fallback:** ${conclusion.recommendation.ungroundedFallback}`);
fs.writeFileSync(path.join(OUT_DIR, 'vichange-conclusion-2381.md'), md.join('\n') + '\n', 'utf8');

console.log('SHIPPABLE_CONCLUSION_DONE inputsMissing=[' + inputsMissing.join(', ') + ']');
console.log('eval tiers: ' + evalTiers.map((t) => `${t.id}=${t.overall}`).join(', '));
if (conclusion.heldOutBar.backendAgreement) console.log('backend agreement exactOrderMatch=' + conclusion.heldOutBar.backendAgreement.exactOrderMatch + ' spearman=' + conclusion.heldOutBar.backendAgreement.spearman);
