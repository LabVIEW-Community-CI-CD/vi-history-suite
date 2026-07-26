#!/usr/bin/env node
// prototype/ml/groundedAggregateEval.mjs
//
// #2381 mcp-faithfulness-surface, LINUX lane: does the OPTIONAL grounded 8b-2shot narrator help
// (or HAZARD) the PR-REVIEW AGGREGATE narrative -- the reviewer summary ACROSS many changed VIs
// (the highest-visibility surface: the sticky PR comment)? Single-VI narratives were covered by
// the shipped ordinal fix + WIN deterministic audit; the AGGREGATE is where a model might add
// real readability OR invent CROSS-VI numbers (e.g. a fabricated total-changes sum) -- the same
// noInventedNumbers hazard at higher stakes.
//
// Method: build a real 8-VI aggregate from the 8 committed NI fixtures (each a changed VI with a
// real comparison model + risk level), render the DETERMINISTIC aggregate template as the
// faithful fallback, generate a grounded aggregate reviewer summary via 8b-2shot (BASELINE SYSTEM
// only, per the backend-dependent-strict finding), and GATE it with the SHARED narrativeQualityGate
// contract (I1 no invented numbers / I2 no false no-change / I3 states the headline changed-VI
// count). allowedNumbers = every legit count (aggregate rollup + each VI real per-VI count), so any
// other integer > 1 in the grounded summary is an INVENTED cross-VI number (the hazard).
//
// Reuses groundedNarrativeProvider.createOllamaGenerate + narrativeQualityGate (the ONE shared
// contract). GPU/ollama for generation; falls back to template-only reporting when no backend.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseLabviewDiffReportCounts } from '../labviewDiffReportParser.mjs';
import { buildViSemanticComparisonModelFromHtml } from '../../out/semantic/viSemanticModel.js';
import { scoreNarrative, selectFaithfulNarrative } from './narrativeQualityGate.mjs';
import { createOllamaGenerate } from './groundedNarrativeProvider.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '..', 'win-lvkit', 'correlation-fixtures');
// Optional VIHS_SWEEP_LABEL host/backend suffix (mirrors groundedProviderSweep) so CPU vs GPU
// evidence do not clobber: e.g. VIHS_SWEEP_LABEL=win-cpu -> ollama-grounded-aggregate-eval-win-cpu.json.
// VIHS_EVAL_HOST / VIHS_EVAL_BACKEND record the run host/backend in the report (default LINUX/gpu).
const SWEEP_LABEL = (process.env.VIHS_SWEEP_LABEL || '').replace(/[^a-z0-9._-]/gi, '');
const EVAL_HOST = process.env.VIHS_EVAL_HOST || 'LINUX';
const EVAL_BACKEND = process.env.VIHS_EVAL_BACKEND || 'gpu';
const OUT = path.join(__dirname, 'dataset', `ollama-grounded-aggregate-eval${SWEEP_LABEL ? `-${SWEEP_LABEL}` : ''}.json`);
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.AGG_MODEL || 'vichange8b-2shot';

// The aggregate narrative is a reviewer roll-up: it states the changed-VI count, the
// with/without-differences split, and a risk rollup. mentionsCosmetic/kinds are single-VI axes,
// so the aggregate invariant set is I1/I2/I3 only.
const AGG_SCORE_KEYS = ['statesStructuralCount', 'noFalseNoChange', 'noInventedNumbers'];

// Build the real 8-VI aggregate from the committed fixtures.
function buildAggregate() {
  const files = fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.labview-diff-report.html')).sort();
  const vis = files.map((file) => {
    const html = fs.readFileSync(path.join(FIXTURES, file), 'utf8');
    const counts = parseLabviewDiffReportCounts(html);
    const model = buildViSemanticComparisonModelFromHtml(html, { reportFilePath: file });
    return {
      vi: file.replace(/\.labview-diff-report\.html$/i, ''),
      nonCosmetic: model.totals.detailItemCount,
      risk: model.riskLevel || 'low',
      hasDifferences: model.hasDifferences
    };
  });
  const changed = vis.filter((v) => v.hasDifferences);
  const risk = { high: 0, medium: 0, low: 0 };
  for (const v of changed) risk[v.risk] += 1;
  return { vis, changed, risk, changedViCount: changed.length };
}

// Deterministic aggregate template (faithful fallback; mirrors renderPrReviewNarrative shape).
function templateNarrative(agg) {
  const riskParts = ['high', 'medium', 'low'].filter((k) => agg.risk[k] > 0).map((k) => `${agg.risk[k]} ${k}`);
  const riskStr = riskParts.length ? ` Risk: ${riskParts.join(', ')}.` : '';
  return `${agg.changedViCount} changed VIs. ${agg.changedViCount} with differences, 0 unchanged.${riskStr}`;
}

function aggregateFacts(agg) {
  const lines = agg.changed.map((v) => `- ${v.vi}: ${v.nonCosmetic} non-cosmetic structural changes, risk ${v.risk}`);
  return [
    `Pull-request comparison across ${agg.changedViCount} changed VIs (all have differences; 0 unchanged).`,
    `Risk rollup: ${agg.risk.high} high, ${agg.risk.medium} medium, ${agg.risk.low} low.`,
    'Per changed VI (non-cosmetic structural count):',
    ...lines
  ].join('\n');
}

const AGG_PROMPT =
  'Summarize this pull request for a code reviewer: state how many VIs changed, the high/medium/low risk breakdown, and name the highest-risk VIs. Use ONLY the numbers provided; do NOT invent any total or combined count.';

async function main() {
  const agg = buildAggregate();
  const template = templateNarrative(agg);
  // allowedNumbers: aggregate rollup counts + each VI real per-VI count. Anything else > 1 = invented.
  const allowedNumbers = [
    agg.changedViCount,
    agg.risk.high, agg.risk.medium, agg.risk.low,
    ...agg.changed.map((v) => v.nonCosmetic)
  ];
  const groundTruth = { lvkitChangeCount: agg.changedViCount, kinds: [], allowedNumbers };

  const templateScored = scoreNarrative(template, groundTruth, AGG_SCORE_KEYS);

  let present = false;
  try {
    const tags = await (await fetch(`${OLLAMA}/api/tags`)).json();
    present = (tags.models || []).some((m) => m.name === MODEL || m.name === `${MODEL}:latest`);
  } catch { present = false; }

  let grounded = null;
  let selection = null;
  if (present) {
    const generate = createOllamaGenerate({ ollamaUrl: OLLAMA, model: MODEL });
    const text = await generate(AGG_PROMPT, aggregateFacts(agg));
    const scored = scoreNarrative(text, groundTruth, AGG_SCORE_KEYS);
    const allowedSet = new Set(allowedNumbers.map(Number));
    const invented = (text.match(/\d+/g) || []).map(Number).filter((n) => n > 1 && !allowedSet.has(n));
    grounded = { narrative: text, score: scored.score, failedParts: scored.failedParts, invented };
    selection = selectFaithfulNarrative({ candidate: text, fallback: template, groundTruth, scoreKeys: AGG_SCORE_KEYS });
  }

  const report = {
    schema: 'vi-history-suite/ollama-grounded-aggregate-eval@v1',
    generatedAt: new Date().toISOString(),
    host: EVAL_HOST, backend: EVAL_BACKEND, label: SWEEP_LABEL || null, ollamaUrl: OLLAMA, model: MODEL, surface: 'pr-review-aggregate',
    changedViCount: agg.changedViCount,
    risk: agg.risk,
    allowedNumbers,
    template: { narrative: template, score: templateScored.score, failedParts: templateScored.failedParts },
    grounded,
    selection: selection ? { source: selection.source, reason: selection.reason, candidateScore: selection.candidateScore, fallbackScore: selection.fallbackScore } : null,
    note: 'Aggregate (cross-VI) PR-review reviewer summary. allowedNumbers = aggregate rollup + real per-VI counts; any other integer > 1 in the grounded summary is an INVENTED cross-VI number (the higher-stakes hazard). BASELINE SYSTEM only.'
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');

  console.log(`GROUNDED_AGGREGATE_EVAL_DONE surface=pr-review-aggregate changedVIs=${agg.changedViCount} model=${present ? MODEL : '(absent)'}`);
  console.log(`template: score=${templateScored.score} narrative=${JSON.stringify(template)}`);
  if (grounded) {
    console.log(`grounded: score=${grounded.score} failedParts=[${grounded.failedParts.join(',')}] invented=[${grounded.invented.join(',')}]`);
    console.log(`selection: ${selection.source} (${selection.reason})`);
    console.log(`grounded narrative: ${JSON.stringify(grounded.narrative.slice(0, 400))}`);
  } else {
    console.log('grounded: (no backend -- template-only)');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
