#!/usr/bin/env node
// prototype/ml/groundedNarrativeProvider.mjs
//
// #2381 next thread -- OPTIONAL grounded MCP narrative provider (PROTOTYPE reference,
// NOT the main-product flag). This factors the selection logic proven in
// mcpNarrativePoc.mjs into a pure, dependency-injected reference that mirrors what
// the eventual renderViSemanticNarrative swap-site would do:
//
//   given the (cosmetic-enriched) vi-semantic-comparison@v1 facts + the deterministic
//   template narrative as fallback, generate a grounded narrative via an INJECTED model
//   backend, gate it with the shared governed faithfulness scorer, and FALL BACK to the
//   template when the backend is absent or the output fails the gate.
//
// The core is pure and network-free (the `generate` backend is injected, faked in tests);
// createOllamaGenerate is the only network-touching part, kept separate. This is the
// contract both agents build against; the grounded layer is strictly OPTIONAL because the
// shipped deterministic template (PR #2383) already clears the faithfulness bar.

import { SYSTEM, scoreParts, taskScoreOf } from './vichangeEvalCore.mjs';

// The narrative-quality parts relevant to a free "what changed" MCP narrative. Kinds are
// an lvkit-only axis absent from the LabVIEW-report-native MCP facts, so they are not scored.
// This provider is the SINGLE WIN-owned narrative gate (#2381): LINUX retired its parallel
// narrativeQualityGate.mjs in favor of selectMcpNarrative's safety/quality split below.
export const GROUNDED_NARRATIVE_SCORE_KEYS = Object.freeze([
  'statesStructuralCount',
  'noFalseNoChange',
  'mentionsCosmetic',
  'noInventedNumbers'
]);

// Hard safety parts that a grounded narrative MUST clear before it can be preferred over the
// template, regardless of score: it must state the count, never falsely claim "no changes",
// and invent no numbers. mentionsCosmetic is a quality lift, not a safety gate.
export const GROUNDED_NARRATIVE_SAFETY_KEYS = Object.freeze([
  'statesStructuralCount',
  'noFalseNoChange',
  'noInventedNumbers'
]);

export const GROUNDED_NARRATIVE_PROMPT =
  'Summarize what changed between the two VI revisions for a code reviewer. State the exact non-cosmetic structural change count, and explicitly note how many cosmetic (position/appearance) differences there are. Do not invent numbers.';

/**
 * Build the grounded input facts from the semantic model + the cosmetic tally the model
 * currently drops (the enrichment). Deterministic, no I/O.
 */
export function buildGroundedNarrativeFacts(model, cosmeticCount) {
  const N = model.totals.detailItemCount;
  const surfaces = (model.changedSurfaces || []).filter((s) => s !== 'vi-attributes');
  const sections =
    (model.detailSections || []).map((s) => `${s.heading} (${s.itemCount})`).join('; ') || 'none';
  return [
    'LabVIEW comparison facts (vi-semantic-comparison@v1, enriched with the cosmetic tally the model currently drops):',
    `- non-cosmetic (structural/behavioral) differences: ${N}`,
    `- cosmetic (position/appearance) differences: ${cosmeticCount}`,
    `- changed surfaces: ${surfaces.length ? surfaces.join(', ') : 'none'}`,
    `- detail sections: ${sections}`,
    `- classification: ${model.classification}; risk: ${model.riskLevel}`
  ].join('\n');
}

/**
 * Ground truth for the shared faithfulness scorer, derived from the MCP-native model + the
 * cosmetic tally. The narrative's structural count N is the semantic model's detailItemCount
 * (LabVIEW non-cosmetic), NOT lvkit's node-level tally.
 */
export function groundTruthForModel(model, cosmeticCount) {
  const N = model.totals.detailItemCount;
  return {
    lvkitChangeCount: N,
    kinds: model.changeKinds || [],
    allowedNumbers: [
      N,
      cosmeticCount,
      model.totals.detailSectionCount,
      model.totals.changedSurfaceCount
    ],
    labviewSource: 'vi-semantic-comparison@v1'
  };
}

function allTrue(parts, keys) {
  return keys.every((k) => parts && parts[k] === true);
}

/**
 * Select the MCP narrative: prefer the grounded output when a backend is present and its
 * output clears the governed faithfulness safety gate WITHOUT regressing the template score;
 * otherwise fall back to the deterministic template narrative (which the shipped fix already
 * makes pass the bar).
 *
 * `generate(prompt, facts) -> Promise<string>` is INJECTED (fake in tests, ollama in
 * production). It may return an empty string / null or throw when no backend is available;
 * every such path deterministically falls back to the template with an explicit reason.
 *
 * Returns { narrative, source, reason, template:{narrative,parts,score}, grounded }.
 */
export async function selectMcpNarrative({ model, cosmeticCount, templateNarrative, generate }) {
  if (!model || !model.totals) {
    throw new Error('selectMcpNarrative: model with totals is required');
  }
  if (typeof templateNarrative !== 'string') {
    throw new Error('selectMcpNarrative: templateNarrative string is required');
  }
  const gt = groundTruthForModel(model, cosmeticCount);
  const templateParts = scoreParts(templateNarrative, gt).parts;
  const templateScore = taskScoreOf(templateParts, GROUNDED_NARRATIVE_SCORE_KEYS, null);

  let grounded = null;
  if (typeof generate === 'function') {
    try {
      const facts = buildGroundedNarrativeFacts(model, cosmeticCount);
      const text = await generate(GROUNDED_NARRATIVE_PROMPT, facts);
      if (typeof text === 'string' && text.trim().length > 0) {
        const parts = scoreParts(text, gt).parts;
        grounded = {
          narrative: text,
          parts,
          score: taskScoreOf(parts, GROUNDED_NARRATIVE_SCORE_KEYS, null),
          error: null
        };
      }
    } catch (ex) {
      grounded = { narrative: null, parts: null, score: null, error: String(ex) };
    }
  }

  const hardSafe = grounded && allTrue(grounded.parts, GROUNDED_NARRATIVE_SAFETY_KEYS);
  const accept = Boolean(
    grounded && !grounded.error && hardSafe && grounded.score >= templateScore
  );

  const reason = accept
    ? 'grounded-passed-gate'
    : typeof generate !== 'function'
      ? 'no-backend'
      : !grounded
        ? 'empty-output'
        : grounded.error
          ? 'backend-error'
          : !hardSafe
            ? 'failed-safety-gate'
            : 'regressed-template';

  return {
    narrative: accept ? grounded.narrative : templateNarrative,
    source: accept ? 'grounded' : 'template',
    reason,
    template: { narrative: templateNarrative, parts: templateParts, score: templateScore },
    grounded
  };
}

/**
 * Concrete ollama backend factory (the ONLY network-touching part). Returns a
 * `generate(prompt, facts)` compatible with selectMcpNarrative. Deterministic (temperature 0).
 */
export function createOllamaGenerate({
  ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434',
  model = 'vichange8b-2shot',
  system = SYSTEM
} = {}) {
  return async function generate(prompt, facts) {
    const resp = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `${prompt}\n\n${facts}` }
        ]
      })
    });
    const j = await resp.json();
    if (j.error) throw new Error(String(j.error));
    return (j.message && j.message.content) || '';
  };
}
