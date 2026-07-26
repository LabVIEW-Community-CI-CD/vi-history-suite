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
    groundingContract: 'The model consumes the vi-semantic-comparison@v1 model (changedSurfaces, detailSections, totals.detailItemCount = non-cosmetic count, attributes), enriched with the LabVIEW cosmetic tally (labviewDiffReportParser) the model currently drops, and emits its narrative -- a closed loop inside the governed contract.',
    gapVsTemplate: 'A real-data PoC (mcpNarrativePoc.mjs over 8 real NI comparison reports) scored the shipped template vs a grounded 8b-2shot narrator with the shared faithfulness scorer: grounded 1.0 vs template 0.906, grounded selected by the fallback gate on all 8 VIs. The real template weakness is NUMBER HYGIENE, not cosmetic omission: it enumerates the NI report diff-block ordinal indices verbatim (e.g. "4. Block Diagram objects, 14. ..., 18. ...", "51.", "53."), which the scorer flags as invented numbers on the 3 high-section VIs (lv_icon / mousedown / picturecontrol_mouseup -> 0.75, noInventedNumbers=false). This CORRECTS an earlier synthetic-probe claim that the template drops cosmetic: on real reports the template surfaces "Block Diagram Cosmetic" via the compared-attribute list, so mentionsCosmetic=8/8. The grounded summarizer states only the meaningful counts -- the non-cosmetic structural count plus the cosmetic count as an explicit plain-language split ("N structural, M cosmetic that can be ignored for review") -- fabricating no ordinal indices and never saying "no changes" over real changes.',
    integrationPoint: 'src/semantic/viSemanticModel.ts: renderViSemanticNarrative(model) (defined ~line 309) is called at ~line 264 (`narrative: renderViSemanticNarrative(model)`). A model-backed narrative generator is a drop-in alternative at that swap site -- same input (the semantic model, cosmetic-enriched), richer grounded output, with the deterministic template retained as the ungrounded fallback. Surfaced identically in the Source Control hover, PR/CI comment, and MCP tool output.',
    qualityGate: 'The governed faithfulness scorer (statesStructuralCount / noFalseNoChange / mentionsCosmetic / noInventedNumbers) is the narrative-quality gate for the MCP surface.',
    pocEvidence: 'prototype/ml/mcpNarrativePoc.mjs -> prototype/ml/dataset/mcp-narrative-poc.json (schema vi-history-suite/mcp-narrative-poc@v1): 8 real fixtures, meanTemplate 0.906, meanGrounded 1.0, template mentionsCosmetic 8/8, grounded selected 8/8. Runs anywhere (template-only fallback when no ollama backend).',
    costDecomposition: 'Cost decomposition (mcpNarrativePoc.mjs template-v2 / template-min): a cheap DETERMINISTIC template fix scores 1.0 on all 8 VIs, EQUAL to the grounded model (template 0.906 -> template-v2 1.0 = grounded 1.0). The MINIMAL variant (template-min: strip the NI ordinal prefix from each section heading, section.heading.replace(/^\\d+\\.\\s*/, "")) ALSO scores 1.0 -- so ordinal-stripping ALONE closes the entire scored gap (the only failing part was noInventedNumbers). Caveat: stripping ordinals collapses the heading list to duplicates ("Block Diagram objects, Block Diagram objects, and Block Diagram objects"), so the fix must also DEDUPE the heading list (or drop the parenthetical when headings repeat) -- which is why template-v2\'s count-only phrasing reads cleaner. Either way the grounded 8b-2shot adds no scored-faithfulness value here, only qualitative readability.'
  },
  recommendation: {
    localDefault: '8b-2shot (vichange8b-2shot) -- cheapest local, adversarially robust (adv 1.0), most consistent 8b across the held-out VIs, within a small band of 14b on the leakage-free bar.',
    largerModel: 'qwen2.5:14b when a larger model is acceptable -- top generalization on the held-out bar; verify its lone adversarial N=1 miss (MenuSelection(User)).',
    notRecommended: '1-shot few-shot as the default -- on the wider honest bar (with genuine-no-change VIs) its assert-a-count bias drops it below raw; it is not the robust choice.',
    loRA: 'DEFERRED -- the leakage fix is the held-out split (already honored by raw/few-shot/2-shot); a LoRA is backend-orthogonal to the closed GPU divergence; and the torch/Blackwell-sm_120/gated-HF/disk fine-tune infra is not cheap. A future held-out-trained LoRA is compared to the leakage-free bar above, never to a single-split memorization ceiling.',
    mcpNarrative: 'MCP narrative surface: ship the DETERMINISTIC template fix as the primary faithfulness improvement -- concretely, in renderViSemanticNarrative strip the NI ordinal prefix from each section heading (section.heading.replace(/^\\\\d+\\\\.\\\\s*/, "")) AND dedupe the resulting heading list (or drop the parenthetical when headings repeat). That one change closes the governed-scorer gap on all 8 real fixtures with zero latency/dependency. Treat the grounded 8b-2shot narrator as an OPTIONAL readability layer gated by the same faithfulness scorer, NOT a faithfulness requirement. The durable ML contribution to the MCP surface is the governed faithfulness SCORER as the narrative-quality gate. Blast radius (turnkey for a develop PR): the change is in src/semantic/viSemanticModel.ts (~line 332, the joinHumanList(model.detailSections.map((s) => s.heading)) call); the only exact-string test to update is tests/unit/viSemanticModel.test.ts (the "(1. VI Attribute - Miscellaneous)" assertion). multiReportDashboard.test.ts / viSemanticReviewMarkdown.test.ts assert counts without the heading list and are unaffected.',
    ungroundedFallback: 'Keep the deterministic template narrative as the ungrounded fallback when no model backend is available.',
    shippedStatus: 'SHIPPED to develop -- the deterministic strip+dedupe fix was opened as issue #2382 -> PR #2383 (feature/2382-narrative-ordinal-hygiene) and squash-merged to develop @9f5f4c9d on 2026-07-25, issue #2382 closed COMPLETED. renderViSemanticNarrative now strips the NI ordinal prefix and dedupes the heading list, so every MCP narrative, Source Control hover, and PR/CI comment reflects it. Co-signed by the GPU/ollama agent, whose held-out fit-numbers folded in and who independently verified the blast-radius against the shipped source.'
  },
  optionalProvider: {
    status: 'prototyped + validated cross-backend (#2381 next thread)',
    design: 'groundedNarrativeProvider.selectMcpNarrative is the WIN-owned FLOW (build cosmetic-enriched facts -> injected ollama backend -> hard-safety floor -> deterministic template fallback) on top of narrativeQualityGate.scoreNarrative, the LINUX-owned shared SCORING PRIMITIVE. One scorer, two complementary layers: the hard-safety floor (statesStructuralCount / noFalseNoChange / noInventedNumbers) rejects an unsafe candidate even on a score tie; mentionsCosmetic is a quality lift.',
    acceptRate: 'Baseline SYSTEM, per config over the 8 real fixtures, backend-robust (GPU == CPU): 8b-raw 1.0, 8b-fewshot 1.0, 8b-2shot 1.0, 14b 0.875. 14b fails the safety gate on visibletextmarker by inventing a per-object sub-count (over-elaboration); reproducible on both backends, not an offload-divergence artifact.',
    systemStrictnessRejected: 'A stricter SYSTEM (report ONLY the two tallies, no per-object breakdown) is a BACKEND-DEPENDENT tradeoff and is NOT adopted: on CPU it lifts 14b 0.875->1.0 but drops 8b-fewshot 1.0->0.875; on GPU it additionally drops 8b-2shot to 0.75 on the lvkit=0 no-change VIs (loadtemplates, process template graphics), stable across 2 GPU runs. Keep the BASELINE shared SYSTEM.',
    recommendation: 'If the optional grounded layer is enabled, 8b-2shot is the default: highest accept-rate under the baseline SYSTEM on BOTH backends, cheapest local. The gate guarantees it is never less faithful than the shipped deterministic template (the fallback) -- it can only improve readability.'
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
md.push('', '## MCP product home', '', conclusion.mcpProductHome.groundingContract, '', '*Gap vs template:* ' + conclusion.mcpProductHome.gapVsTemplate, '', '*Integration point:* ' + conclusion.mcpProductHome.integrationPoint, '', '*Quality gate:* ' + conclusion.mcpProductHome.qualityGate, '', '*PoC evidence:* ' + conclusion.mcpProductHome.pocEvidence, '', '*Cost decomposition:* ' + conclusion.mcpProductHome.costDecomposition);
md.push('', '## Recommendation', '',
  `- **Local default:** ${conclusion.recommendation.localDefault}`,
  `- **Larger model:** ${conclusion.recommendation.largerModel}`,
  `- **Not recommended:** ${conclusion.recommendation.notRecommended}`,
  `- **LoRA:** ${conclusion.recommendation.loRA}`,
  `- **MCP narrative:** ${conclusion.recommendation.mcpNarrative}`,
  `- **Fallback:** ${conclusion.recommendation.ungroundedFallback}`,
  `- **Shipped:** ${conclusion.recommendation.shippedStatus}`);
md.push('', '## Optional grounded provider (#2381 next thread)', '',
  `- **Status:** ${conclusion.optionalProvider.status}`,
  `- **Design:** ${conclusion.optionalProvider.design}`,
  `- **Accept-rate:** ${conclusion.optionalProvider.acceptRate}`,
  `- **Strict SYSTEM (rejected):** ${conclusion.optionalProvider.systemStrictnessRejected}`,
  `- **Recommendation:** ${conclusion.optionalProvider.recommendation}`);
fs.writeFileSync(path.join(OUT_DIR, 'vichange-conclusion-2381.md'), md.join('\n') + '\n', 'utf8');

console.log('SHIPPABLE_CONCLUSION_DONE inputsMissing=[' + inputsMissing.join(', ') + ']');
console.log('eval tiers: ' + evalTiers.map((t) => `${t.id}=${t.overall}`).join(', '));
if (conclusion.heldOutBar.backendAgreement) console.log('backend agreement exactOrderMatch=' + conclusion.heldOutBar.backendAgreement.exactOrderMatch + ' spearman=' + conclusion.heldOutBar.backendAgreement.spearman);
