#!/usr/bin/env node
// prototype/ml/mcpNarrativePoc.mjs
//
// #2381 -- MCP is the product home. This is a runnable PROOF-OF-CONCEPT of the
// shippable-conclusion recommendation: swap the MCP `narrative` for the
// vi-semantic-comparison@v1 surface from a deterministic TEMPLATE
// (renderViSemanticNarrative) to a GROUNDED faithful-summarizer (8b-2shot),
// gated by the governed faithfulness scorer, with the template retained as the
// ungrounded FALLBACK.
//
// It runs over the SAME real NI comparison reports the correlation dataset was
// built from (prototype/win-lvkit/correlation-fixtures/*.labview-diff-report.html):
//   1. Build the real semantic model from the report HTML (compiled out/) -> the
//      TEMPLATE narrative + the MCP-native structural count (totals.detailItemCount
//      = LabVIEW non-cosmetic). This is exactly what the shipped MCP tool returns.
//   2. Parse the report's cosmetic tally (labviewDiffReportParser) -- the count the
//      semantic model currently DROPS upstream, so the template can never mention it.
//   3. Generate a GROUNDED narrative with 8b-2shot from the semantic facts ENRICHED
//      with that cosmetic tally, using the shared governed SYSTEM instruction.
//   4. Score TEMPLATE vs GROUNDED with the shared faithfulness scorer (same rubric
//      as the whole eval thread) and apply the fallback gate.
//
// Honest finding this makes concrete: the "template drops cosmetic" gap is UPSTREAM
// (the semantic model does not carry the cosmetic count). Fixing the narrative alone
// is not enough; the model must also surface the cosmetic tally the LabVIEW report
// already contains (and labviewDiffReportParser already parses). Once enriched, the
// grounded summarizer closes the mentionsCosmetic gap the template cannot.
//
// Pure evidence artifact under prototype/ (not shipped, not a CI gate). Falls back to
// template-only when no ollama backend / model is available, so it runs anywhere.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLabviewDiffReportCounts } from '../labviewDiffReportParser.mjs';
import { fixtureSlug } from '../correlationReport.mjs';
import { SYSTEM, scoreParts, taskScoreOf } from './vichangeEvalCore.mjs';
import { buildViSemanticComparisonModelFromHtml } from '../../out/semantic/viSemanticModel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '..', 'win-lvkit', 'correlation-fixtures');
const DATASET = path.join(FIXTURES, 'benchmark-dataset.json');
const OUT = path.join(__dirname, 'dataset', 'mcp-narrative-poc.json');
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.POC_MODEL || 'vichange8b-2shot';

// The narrative-quality parts relevant to a free "what changed" MCP narrative. Kinds
// are an lvkit-only axis absent from the LabVIEW-report-native MCP facts, so they are
// not scored here.
const SCORE_KEYS = ['statesStructuralCount', 'noFalseNoChange', 'mentionsCosmetic', 'noInventedNumbers'];

const PROMPT =
  'Summarize what changed between the two VI revisions for a code reviewer. State the exact non-cosmetic structural change count, and explicitly note how many cosmetic (position/appearance) differences there are. Do not invent numbers.';

async function modelPresent() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`);
    const j = await r.json();
    return (j.models || []).some((m) => m.name === MODEL || m.name === `${MODEL}:latest`);
  } catch {
    return false;
  }
}

async function generate(prompt, facts) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      options: { temperature: 0 },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${prompt}\n\n${facts}` }
      ]
    })
  });
  const j = await r.json();
  if (j.error) throw new Error(String(j.error));
  return (j.message && j.message.content) || '';
}

// Build the grounded input: the semantic model facts ENRICHED with the cosmetic tally
// the model currently drops. This is the concrete "enrich the model + swap the
// generator" state the recommendation calls for.
function buildFacts(model, counts) {
  const N = model.totals.detailItemCount;
  const surfaces = model.changedSurfaces.filter((s) => s !== 'vi-attributes');
  const sections = model.detailSections.map((s) => `${s.heading} (${s.itemCount})`).join('; ') || 'none';
  return [
    'LabVIEW comparison facts (vi-semantic-comparison@v1, ENRICHED with the cosmetic tally the model currently drops):',
    `- non-cosmetic (structural/behavioral) differences: ${N}`,
    `- cosmetic (position/appearance) differences: ${counts.cosmetic}`,
    `- total difference blocks: ${counts.total}`,
    `- changed surfaces: ${surfaces.length ? surfaces.join(', ') : 'none'}`,
    `- detail sections: ${sections}`,
    `- classification: ${model.classification}; risk: ${model.riskLevel}`
  ].join('\n');
}

// Deterministic TEMPLATE-V2: the cheap fix the PoC surfaces -- drop the raw NI diff-block
// ordinal indices (the invented-number hazard) and state the cosmetic count explicitly.
// No model. Isolates how much of the template->grounded faithfulness gain is recoverable
// by a trivial deterministic edit vs what genuinely needs the grounded narrator.
function buildTemplateV2(model, counts) {
  if (!model.hasDifferences) {
    return 'No LabVIEW differences were detected between the two revisions.';
  }
  const N = model.totals.detailItemCount;
  const sectionCount = model.totals.detailSectionCount;
  const parts = [
    `${N} non-cosmetic structural change${N === 1 ? '' : 's'} across ${sectionCount} section${sectionCount === 1 ? '' : 's'}.`,
    `${counts.cosmetic} cosmetic (position/appearance) difference${counts.cosmetic === 1 ? '' : 's'}.`
  ];
  return parts.join(' ');
}

async function main() {
  const dataset = JSON.parse(fs.readFileSync(DATASET, 'utf8'));
  const lvkitBySlug = new Map(dataset.samples.map((s) => [fixtureSlug(s.vi), s]));
  const present = await modelPresent();
  const rows = [];

  const files = fs
    .readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.labview-diff-report.html'))
    .sort();

  for (const file of files) {
    const slug = file.replace(/\.labview-diff-report\.html$/i, '');
    const html = fs.readFileSync(path.join(FIXTURES, file), 'utf8');

    let counts;
    let model;
    try {
      counts = parseLabviewDiffReportCounts(html);
      model = buildViSemanticComparisonModelFromHtml(html, { reportFilePath: file });
    } catch (ex) {
      rows.push({ vi: slug, error: String(ex) });
      continue;
    }

    // MCP-native structural count: the narrative's N is the semantic model's
    // detailItemCount (LabVIEW non-cosmetic), NOT lvkit's node-level tally.
    const N = model.totals.detailItemCount;
    const sample = lvkitBySlug.get(slug);
    const gt = {
      lvkitChangeCount: N,
      kinds: model.changeKinds || [],
      allowedNumbers: [
        N,
        counts.cosmetic,
        counts.total,
        counts.nonCosmetic,
        model.totals.detailSectionCount,
        model.totals.changedSurfaceCount
      ],
      labviewSource: 'labview-diff-report-parser'
    };

    const templateNarrative = model.narrative;
    const templateParts = scoreParts(templateNarrative, gt).parts;
    const templateScore = taskScoreOf(templateParts, SCORE_KEYS, null);

    // Cheap deterministic fix (no model).
    const templateV2Narrative = buildTemplateV2(model, counts);
    const templateV2Parts = scoreParts(templateV2Narrative, gt).parts;
    const templateV2Score = taskScoreOf(templateV2Parts, SCORE_KEYS, null);

    let grounded = null;
    if (present) {
      try {
        const narrative = await generate(PROMPT, buildFacts(model, counts));
        const parts = scoreParts(narrative, gt).parts;
        grounded = { narrative, parts, score: taskScoreOf(parts, SCORE_KEYS, null), error: null };
      } catch (ex) {
        grounded = { narrative: null, parts: null, score: null, error: String(ex) };
      }
    }

    // Fallback gate: use the grounded narrative only if it clears the hard safety
    // parts (states the count, no false no-change, no invented numbers) AND does not
    // regress the template score; otherwise fall back to the deterministic template.
    const gate =
      grounded &&
      grounded.parts &&
      grounded.parts.noFalseNoChange &&
      grounded.parts.noInventedNumbers &&
      grounded.parts.statesStructuralCount;
    const selected = present && grounded && !grounded.error && gate && grounded.score >= templateScore ? 'grounded' : 'template';

    rows.push({
      vi: slug,
      lvkitChangeCount: sample ? sample.lvkit.changeCount : null,
      mcpStructuralCount: N,
      cosmetic: counts.cosmetic,
      total: counts.total,
      template: { narrative: templateNarrative, parts: templateParts, score: templateScore },
      templateV2: { narrative: templateV2Narrative, parts: templateV2Parts, score: templateV2Score },
      grounded,
      selected,
      cosmeticGapClosed: !!(grounded && grounded.parts && grounded.parts.mentionsCosmetic && !templateParts.mentionsCosmetic)
    });
  }

  const scored = rows.filter((r) => !r.error);
  const mean = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 1000) / 1000 : null);
  const summary = {
    model: MODEL,
    modelPresent: present,
    viCount: scored.length,
    meanTemplateScore: mean(scored.map((r) => r.template.score)),
    meanTemplateV2Score: mean(scored.map((r) => r.templateV2.score)),
    meanGroundedScore: present ? mean(scored.filter((r) => r.grounded && r.grounded.score != null).map((r) => r.grounded.score)) : null,
    templateMentionsCosmetic: scored.filter((r) => r.template.parts.mentionsCosmetic).length,
    groundedMentionsCosmetic: present ? scored.filter((r) => r.grounded && r.grounded.parts && r.grounded.parts.mentionsCosmetic).length : null,
    cosmeticGapClosedCount: scored.filter((r) => r.cosmeticGapClosed).length,
    groundedSelectedCount: scored.filter((r) => r.selected === 'grounded').length
  };

  const report = {
    schema: 'vi-history-suite/mcp-narrative-poc@v1',
    generatedAt: new Date().toISOString(),
    ollama: OLLAMA,
    note:
      'Grounded MCP narrative swap PoC over real NI comparison reports. Template = shipped renderViSemanticNarrative; grounded = 8b-2shot over cosmetic-enriched semantic facts; scorer = shared governed faithfulness rubric; template is the fallback.',
    summary,
    rows
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  console.log(`MCP_NARRATIVE_POC_DONE model=${MODEL} present=${present} vis=${summary.viCount}`);
  console.log(
    `meanTemplate=${summary.meanTemplateScore} meanTemplateV2=${summary.meanTemplateV2Score} meanGrounded=${summary.meanGroundedScore} templateCosmetic=${summary.templateMentionsCosmetic}/${summary.viCount} groundedCosmetic=${summary.groundedMentionsCosmetic}/${summary.viCount} cosmeticGapClosed=${summary.cosmeticGapClosedCount}/${summary.viCount} groundedSelected=${summary.groundedSelectedCount}/${summary.viCount}`
  );
  console.log('| vi | mcpN | cosmetic | tmplScore | tmplV2Score | grndScore | selected |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of scored) {
    console.log(
      `| ${r.vi} | ${r.mcpStructuralCount} | ${r.cosmetic} | ${r.template.score} | ${r.templateV2.score} | ${
        r.grounded && r.grounded.score != null ? r.grounded.score : 'n/a'
      } | ${r.selected} |`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
