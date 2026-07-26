#!/usr/bin/env node
// prototype/ml/narrativeQualityGate.mjs
//
// #2381 next thread (WIN proposed: optional grounded 8b-2shot MCP narrative provider behind a
// flag, gated by the faithfulness scorer). This module is the LOAD-BEARING, DEPENDENCY-FREE
// piece the conclusion named as "the durable ML contribution to the MCP surface": the governed
// faithfulness SCORER promoted to a narrative-quality GATE.
//
// It scores any narrative STRING against the LabVIEW-report-native ground truth (N =
// non-cosmetic/structural count, cosmetic tally, allowed numbers) with the SAME governed rubric
// used across the whole eval thread, and selects between a candidate (e.g. an optional grounded
// 8b-2shot narrative) and a deterministic fallback (the shipped template) such that the chosen
// narrative is NEVER less faithful than the fallback. So an optional model layer can only ever
// improve readability, never regress faithfulness -- and it needs NO ollama at gate time.
//
// Pure + self-testing (no network, no torch). The grounded PROVIDER (ollama call) is a separate
// slice that plugs its output in as `candidate`; this gate is what makes that safe.
// Run: node prototype/ml/narrativeQualityGate.mjs   (prints a case table, exits nonzero on any miss)
import { scoreParts, taskScoreOf } from './vichangeEvalCore.mjs';

// The narrative-quality parts relevant to a free "what changed" MCP narrative (matches
// mcpNarrativePoc.mjs SCORE_KEYS). kinds is an lvkit-only axis absent from LabVIEW-report-native
// MCP facts, so it is intentionally NOT gated here.
export const MCP_NARRATIVE_SCORE_KEYS = ['statesStructuralCount', 'noFalseNoChange', 'mentionsCosmetic', 'noInventedNumbers'];

/** Score a narrative string against the ground truth; returns score + which parts failed. */
export function scoreNarrative(narrative, groundTruth, scoreKeys = MCP_NARRATIVE_SCORE_KEYS) {
  const { parts } = scoreParts(String(narrative ?? ''), groundTruth);
  const relevant = scoreKeys.filter((k) => parts[k] !== undefined);
  const failedParts = relevant.filter((k) => !parts[k]);
  return { score: taskScoreOf(parts, scoreKeys, null), parts, failedParts };
}

/**
 * Select between an optional `candidate` narrative and a deterministic `fallback`, gated by the
 * governed faithfulness scorer. The candidate is chosen ONLY when it is at least as faithful as
 * the fallback (score >= fallbackScore) -- so enabling the optional grounded provider can never
 * ship a less-faithful narrative than the shipped deterministic template. Ties resolve to the
 * candidate (it was requested for readability) but a strictly-worse candidate is rejected.
 */
export function selectFaithfulNarrative({ candidate, fallback, groundTruth, scoreKeys = MCP_NARRATIVE_SCORE_KEYS }) {
  const fb = scoreNarrative(fallback, groundTruth, scoreKeys);
  if (candidate === null || candidate === undefined || String(candidate).trim() === '') {
    return { chosen: fallback, source: 'fallback', reason: 'no-candidate', candidateScore: null, fallbackScore: fb.score, candidateFailedParts: null, fallbackFailedParts: fb.failedParts };
  }
  const cand = scoreNarrative(candidate, groundTruth, scoreKeys);
  if (cand.score >= fb.score) {
    return { chosen: candidate, source: 'candidate', reason: 'candidate-not-less-faithful', candidateScore: cand.score, fallbackScore: fb.score, candidateFailedParts: cand.failedParts, fallbackFailedParts: fb.failedParts };
  }
  return { chosen: fallback, source: 'fallback', reason: 'candidate-less-faithful', candidateScore: cand.score, fallbackScore: fb.score, candidateFailedParts: cand.failedParts, fallbackFailedParts: fb.failedParts };
}

// --- self-test (grounded in the real #2381 narrative failure modes) ---
// GT models a real report: N=6 non-cosmetic, cosmetic=19, total=23 (lv_icon-like). allowedNumbers
// are the legit facts the narrative may cite; any other number >1 is "invented" (the NI ordinal hazard).
const GT = { lvkitChangeCount: 6, kinds: [], allowedNumbers: [6, 19, 23, 3, 2, 4] };
const CASES = [
  {
    name: 'clean deterministic template (shipped, ordinals stripped) -- faithful',
    narrative: '6 non-cosmetic structural changes across 3 sections. 19 cosmetic (position/appearance) differences.',
    expectScore: 1
  },
  {
    name: 'ordinal-laden template (pre-#2382 shipped) -- invents NI ordinals',
    narrative: '6 detailed changes across 3 sections (4. Block Diagram objects, 14. Wire, 18. Node). 19 cosmetic differences.',
    expectInventedFail: true
  },
  {
    name: 'grounded narrator -- faithful + readable',
    narrative: 'There are 6 structural changes that matter for review, plus 19 cosmetic (position/appearance) differences that can be ignored.',
    expectScore: 1
  },
  {
    name: 'false "no changes" over real changes -- must fail noFalseNoChange',
    narrative: 'There are no structural changes worth noting; only cosmetic tweaks.',
    expectNoChangeFail: true
  }
];

if (import.meta.url === `file://${process.argv[1]}`) {
  let misses = 0;
  console.log('case | score | failedParts | ok');
  for (const c of CASES) {
    const s = scoreNarrative(c.narrative, GT);
    let ok = true;
    if (c.expectScore !== undefined) ok = s.score === c.expectScore;
    if (c.expectInventedFail) ok = s.failedParts.includes('noInventedNumbers');
    if (c.expectNoChangeFail) ok = s.failedParts.includes('noFalseNoChange');
    if (!ok) misses += 1;
    console.log(`- ${c.name} | ${s.score} | [${s.failedParts.join(',')}] | ${ok ? 'PASS' : 'FAIL'}`);
  }
  // Gate behavior: a strictly-worse candidate is rejected; a not-worse candidate is chosen.
  const ordinal = CASES[1].narrative;
  const clean = CASES[0].narrative;
  const grounded = CASES[2].narrative;
  const g1 = selectFaithfulNarrative({ candidate: ordinal, fallback: clean, groundTruth: GT });
  const g2 = selectFaithfulNarrative({ candidate: grounded, fallback: clean, groundTruth: GT });
  const g3 = selectFaithfulNarrative({ candidate: null, fallback: clean, groundTruth: GT });
  const gateOk = g1.source === 'fallback' && g2.source === 'candidate' && g3.source === 'fallback';
  if (!gateOk) misses += 1;
  console.log(`\ngate: worse-candidate->${g1.source}, not-worse-candidate->${g2.source}, no-candidate->${g3.source} | ${gateOk ? 'PASS' : 'FAIL'}`);
  console.log(`\nNARRATIVE_GATE_SELFTEST misses=${misses}`);
  if (misses > 0) process.exit(1);
}
