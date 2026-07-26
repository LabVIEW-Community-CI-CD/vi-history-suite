#!/usr/bin/env node
// prototype/ml/reviewerValueScorer.mjs
//
// REVIEWER-VALUE evaluation (task reviewer-value, WIN delegation @f26b99b1). Faithfulness is SATURATED
// (8b models 27/27 hard-safe, grounded ties the ordinal-clean template, gBeatT=0), so the open question
// is: does a grounded narrator add value a count-template STRUCTURALLY CANNOT -- on an axis the
// faithfulness scorer does not measure? The natural experiment: 13 of the 16 af are VERSION-ONLY (a
// LabVIEW 21->20 save-recompile artifact = pure noise a reviewer should SKIP); only 3 af + the ie set
// are REAL structural changes. The template says "1 detailed change (VI Attribute - Miscellaneous)" for
// the version-only ones -- true, but it does NOT tell the reviewer "save-version artifact, skip it." A
// grounded model plausibly can. This eval measures that.
//
// Compares three narrative SOURCES per fixture: TEMPLATE (deterministic renderViSemanticNarrative) vs
// GROUNDED 8b-2shot vs BASE llama3.1:8b. Two scoring layers:
//   1. DETERMINISTIC (pure, reproducible): HARD FLOOR 0 invented (reuse the safety gate); a save-version
//      SKIP-signal regex; a changed-surface mention check. These anchor the subjective judgment.
//   2. LLM-as-JUDGE (qwen2.5:14b @temp0 -- turning its generator weakness into a judging asset): scores
//      saveVersionFraming / inspectionPriority / riskIntent 0-2, GIVEN the ground-truth category so it
//      grades framing, not correctness.
// Headline test = the 13 version-only af: does GROUNDED say "skip / save-version" while TEMPLATE just
// states the count? VERDICT = does grounded earn its place, or is the template sufficient on this axis?
//
// PURE scorer fns are exported + unit-testable; the run-if-main does the GPU eval. Env: RV_JUDGE_MODEL
// (default qwen2.5:14b), RV_ONLY_SLUGS (comma subset), RV_LIMIT (cap), VIHS_SWEEP_LABEL (output suffix).
// Run from repo root AFTER npm run compile: node prototype/ml/reviewerValueScorer.mjs
import fs from 'node:fs';
import path from 'node:path';
import { parseLabviewDiffReportCounts } from '../labviewDiffReportParser.mjs';
import { buildViSemanticComparisonModelFromHtml, renderViSemanticNarrative } from '../../out/semantic/viSemanticModel.js';
import {
  createOllamaGenerate,
  buildGroundedNarrativeFacts,
  groundTruthForModel,
  GROUNDED_NARRATIVE_PROMPT
} from './groundedNarrativeProvider.mjs';

const FIXTURES = path.join('prototype', 'win-lvkit', 'correlation-fixtures');
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const JUDGE_MODEL = process.env.RV_JUDGE_MODEL || 'qwen2.5:14b';
const GROUNDED_MODEL = process.env.RV_GROUNDED_MODEL || 'vichange8b-2shot';
const BASE_MODEL = process.env.RV_BASE_MODEL || 'llama3.1:8b';
const SWEEP_LABEL = (process.env.VIHS_SWEEP_LABEL || '').replace(/[^a-z0-9._-]/gi, '');
const OUT = path.join('prototype', 'ml', 'dataset', `reviewer-value-eval${SWEEP_LABEL ? `-${SWEEP_LABEL}` : ''}.json`);

/** Mirrors correlationFoldEval.isVersionOnlyChange: a single VI-Version vi-attributes save artifact. */
export function isVersionOnlyChange(model) {
  const surfaces = model.changedSurfaces || [];
  const firstItem = (model.classification || [])[0];
  return model.totals.detailItemCount === 1
    && surfaces.length > 0 && surfaces.every((s) => s === 'vi-attributes')
    && /\bVI Version\b[\s\S]*\bchanged\b/i.test((firstItem && firstItem.text) || '');
}

/** Deprioritize/skip INTENT language (beyond merely naming an attribute) -- the reviewer-value signal. */
const SKIP_SIGNAL_RE = /\b(skip|ignore|no[- ]?functional|non[- ]?functional|save[- ]?version|recompil\w*|safe to (?:skip|ignore)|low[- ]?priority|not (?:worth|need)\w* (?:review|inspect)\w*|cosmetic only|version[- ]?only|no code change|no behavioou?ral)\b/i;

/**
 * Pure deterministic reviewer-value signals for one narrative. HARD FLOOR: noInvented (any integer > 1
 * not in the model's allowedNumbers is an invented number -> disqualifies the narrative regardless of
 * subjective value). skipSignal / namesSurface anchor the subjective judgment reproducibly.
 */
export function scoreReviewerValueDeterministic(narrative, model, cosmeticCount) {
  const allowed = new Set(groundTruthForModel(model, cosmeticCount).allowedNumbers.map(Number));
  const invented = (String(narrative).match(/\d+/g) || []).map(Number).filter((n) => n > 1 && !allowed.has(n));
  const surfaceTerms = { 'block-diagram': /block[- ]?diagram/i, 'front-panel': /front[- ]?panel/i, 'vi-attributes': /\bVI (?:attribute|version)\b/i, connector: /connector|terminal/i };
  const surfaces = model.changedSurfaces || [];
  const namesSurface = surfaces.length > 0 && surfaces.some((s) => surfaceTerms[s] && surfaceTerms[s].test(narrative));
  return {
    noInvented: invented.length === 0,
    invented,
    skipSignal: SKIP_SIGNAL_RE.test(narrative),
    namesSurface
  };
}

/** Build the judge rubric prompt. The judge is GIVEN the ground-truth category so it grades framing. */
export function buildJudgePrompt(meta) {
  const category = meta.versionOnly
    ? 'VERSION-ONLY: the only difference is the saved LabVIEW version (a save/recompile artifact); a reviewer should DEPRIORITIZE/SKIP it.'
    : `REAL STRUCTURAL change (${meta.nonCosmetic} non-cosmetic item(s) on ${meta.changedSurfaces.join(', ') || 'n/a'}); a reviewer SHOULD inspect it.`;
  return [
    'You grade a code-review SUMMARY of a LabVIEW VI diff for how much it HELPS A REVIEWER. Do NOT grade factual correctness (assume facts are given); grade usefulness/framing only.',
    `GROUND TRUTH: ${category} risk=${meta.risk}.`,
    'Score each 0-2 (0=absent, 1=partial, 2=strong):',
    '- saveVersionFraming: for a VERSION-ONLY diff, does it signal this is a save-version/low-priority/skippable change? For a REAL change, does it correctly treat it as needing review (NOT tell the reviewer to skip)?',
    '- inspectionPriority: does it tell the reviewer WHAT to look at / where the change is (or that there is nothing to inspect)?',
    '- riskIntent: does it convey risk level or the intent/nature of the change?',
    'Reply with ONLY a compact JSON object and nothing else: {"saveVersionFraming":N,"inspectionPriority":N,"riskIntent":N,"reason":"<=12 words"}'
  ].join('\n');
}

/** Defensive JSON extraction from a judge reply (14b may wrap the object in prose). */
export function parseJudgeReply(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const clamp = (v) => Math.max(0, Math.min(2, Number(v)));
    return {
      saveVersionFraming: clamp(j.saveVersionFraming),
      inspectionPriority: clamp(j.inspectionPriority),
      riskIntent: clamp(j.riskIntent),
      reason: String(j.reason || '').slice(0, 120)
    };
  } catch { return null; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rawJudge = createOllamaGenerate({ ollamaUrl: OLLAMA, model: JUDGE_MODEL, system: 'You are a terse, strict grader. Output only the requested JSON.' });
  const judge = (prompt) => rawJudge(prompt, '');
  const genGrounded = createOllamaGenerate({ ollamaUrl: OLLAMA, model: GROUNDED_MODEL });
  const genBase = createOllamaGenerate({ ollamaUrl: OLLAMA, model: BASE_MODEL });

  const only = process.env.RV_ONLY_SLUGS ? new Set(process.env.RV_ONLY_SLUGS.split(',').map((s) => s.trim())) : null;
  let files = fs.readdirSync(FIXTURES).filter((f) => /^(af|ie)-.*\.labview-diff-report\.html$/.test(f)).sort();
  if (only) files = files.filter((f) => only.has(f.replace(/\.labview-diff-report\.html$/i, '')));
  if (process.env.RV_LIMIT) files = files.slice(0, Number(process.env.RV_LIMIT));

  const rows = [];
  for (const f of files) {
    const slug = f.replace(/\.labview-diff-report\.html$/i, '');
    const html = fs.readFileSync(path.join(FIXTURES, f), 'utf8');
    const cosmetic = parseLabviewDiffReportCounts(html).cosmetic;
    const model = buildViSemanticComparisonModelFromHtml(html, { reportFilePath: f });
    const versionOnly = isVersionOnlyChange(model);
    const meta = { versionOnly, nonCosmetic: model.totals.detailItemCount, changedSurfaces: (model.changedSurfaces || []).filter((s) => s !== 'vi-attributes').concat(versionOnly ? ['vi-attributes'] : []), risk: model.riskLevel || 'low' };

    const facts = buildGroundedNarrativeFacts(model, cosmetic);
    const sources = {
      template: renderViSemanticNarrative(model),
      grounded8b: await genGrounded(GROUNDED_NARRATIVE_PROMPT, facts).catch(() => ''),
      base8b: await genBase(GROUNDED_NARRATIVE_PROMPT, facts).catch(() => '')
    };

    const perSource = {};
    for (const [src, narrative] of Object.entries(sources)) {
      const det = scoreReviewerValueDeterministic(narrative, model, cosmetic);
      const judged = det.noInvented ? parseJudgeReply(await judge(`${buildJudgePrompt(meta)}\n\nSUMMARY:\n${narrative}`).catch(() => '')) : null;
      perSource[src] = { narrative, det, judge: judged };
    }
    rows.push({ slug, repo: slug.slice(0, slug.indexOf('-')), versionOnly, nonCosmetic: meta.nonCosmetic, risk: meta.risk, perSource });
    console.log(`scored ${slug} (${versionOnly ? 'version-only' : 'real'})`);
  }

  // Aggregate per source, split by version-only vs real. Reviewer-value headline = save-version framing on version-only.
  const srcKeys = ['template', 'grounded8b', 'base8b'];
  const agg = {};
  for (const src of srcKeys) {
    const bucket = (pred) => {
      const rs = rows.filter(pred).map((r) => r.perSource[src]).filter((p) => p.judge);
      const mean = (k) => rs.length ? +(rs.reduce((a, p) => a + p.judge[k], 0) / rs.length).toFixed(2) : null;
      const detRate = (k) => { const b = rows.filter(pred).map((r) => r.perSource[src].det); return b.length ? +(b.filter((d) => d[k]).length / b.length).toFixed(2) : null; };
      return {
        n: rows.filter(pred).length,
        hardFloorViolations: rows.filter(pred).filter((r) => !r.perSource[src].det.noInvented).length,
        skipSignalRate: detRate('skipSignal'),
        namesSurfaceRate: detRate('namesSurface'),
        judgeSaveVersionFraming: mean('saveVersionFraming'),
        judgeInspectionPriority: mean('inspectionPriority'),
        judgeRiskIntent: mean('riskIntent')
      };
    };
    agg[src] = { versionOnly: bucket((r) => r.versionOnly), real: bucket((r) => !r.versionOnly), all: bucket(() => true) };
  }

  // VERDICT: grounded earns its place if it beats the template on version-only save-version framing
  // (deterministic skip-signal AND judge) while never violating the hard floor.
  const tVO = agg.template.versionOnly, gVO = agg.grounded8b.versionOnly;
  const groundedSkipsNoise = (gVO.skipSignalRate || 0) > (tVO.skipSignalRate || 0) && (gVO.judgeSaveVersionFraming || 0) > (tVO.judgeSaveVersionFraming || 0);
  const groundedSafe = agg.grounded8b.all.hardFloorViolations === 0;
  const verdict = {
    groundedEarnsItsPlace: Boolean(groundedSkipsNoise && groundedSafe),
    basis: 'grounded (8b-2shot) flags version-only save-artifacts as skippable better than the template (deterministic skip-signal + 14b judge saveVersionFraming) with zero invented-number violations',
    groundedSafe,
    templateVersionOnlySkipSignal: tVO.skipSignalRate,
    groundedVersionOnlySkipSignal: gVO.skipSignalRate,
    templateJudgeSaveVersionFraming: tVO.judgeSaveVersionFraming,
    groundedJudgeSaveVersionFraming: gVO.judgeSaveVersionFraming
  };

  const report = {
    schema: 'vi-history-suite/reviewer-value-eval@v1',
    generatedAt: new Date().toISOString(),
    host: 'LINUX', backend: 'gpu', ollamaUrl: OLLAMA,
    judgeModel: JUDGE_MODEL, groundedModel: GROUNDED_MODEL, baseModel: BASE_MODEL,
    fixtureCount: rows.length,
    versionOnlyCount: rows.filter((r) => r.versionOnly).length,
    realCount: rows.filter((r) => !r.versionOnly).length,
    aggregate: agg,
    verdict,
    rows,
    note: 'Reviewer-value axis BEYOND faithfulness. Hard floor 0 invented reused from the safety gate. 14b is the JUDGE (not generator). Headline = version-only save-artifact framing: does grounded say skip while the template only states the count?'
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');

  console.log(`\nREVIEWER_VALUE_DONE fixtures=${rows.length} (versionOnly=${report.versionOnlyCount} real=${report.realCount}) judge=${JUDGE_MODEL}`);
  for (const src of srcKeys) {
    const v = agg[src].versionOnly, rl = agg[src].real;
    console.log(`  ${src.padEnd(11)} versionOnly[skip=${v.skipSignalRate} judgeFrame=${v.judgeSaveVersionFraming} prio=${v.judgeInspectionPriority}] real[skip=${rl.skipSignalRate} judgeFrame=${rl.judgeSaveVersionFraming} prio=${rl.judgeInspectionPriority}] floorViol=${agg[src].all.hardFloorViolations}`);
  }
  console.log(`  VERDICT groundedEarnsItsPlace=${verdict.groundedEarnsItsPlace} (template VO skip=${tVO.skipSignalRate}/frame=${tVO.judgeSaveVersionFraming} vs grounded VO skip=${gVO.skipSignalRate}/frame=${gVO.judgeSaveVersionFraming})`);
  console.log(`  wrote ${OUT}`);
}
