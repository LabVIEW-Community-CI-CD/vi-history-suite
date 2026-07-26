// Shared eval core for the grounded VI-change faithful-summarization task (#ollama-ml,
// WIN<->LINUX collab). Single source of truth for the SYSTEM instruction + the faithfulness
// scorer so EVERY config (8b-raw / 8b-fewshot / 14b) is judged by the SAME rubric -- that is
// what makes a side-by-side three-config comparison trustworthy. Imported by both
// buildViChangeMlDataset.mjs (dataset + single-model baseline) and evalCompareConfigs.mjs
// (multi-config side-by-side comparator).

// Hardened noFalseNoChange (accepted by WIN, #2381): a model that CORRECTLY refutes a false
// "no changes" claim by quoting it must not be penalized like one that ASSERTS no-change.
import { noFalseNoChangeHardened } from './scorerHardening.mjs';

export const SYSTEM = 'You are a VI-change summarizer for vi-history-suite. Report ONLY facts grounded in the provided lvkit and LabVIEW comparison data. Rules: NEVER say "no changes" when the structural change count is greater than 0; always state the exact structural change count; distinguish STRUCTURAL changes (from lvkit) from COSMETIC differences (position/appearance, reported only by LabVIEW and omitted by lvkit by design); never invent numbers not present in the facts.';

// Small-integer words, so statesStructuralCount accepts a faithfully-spelled small count
// (e.g. "one change" for N=1) not just the digit. Strict SUPERSET: only ADDS passes, never
// removes one; the safety part (noInventedNumbers) is unaffected. #2381 scorer polish
// (WIN-endorsed): removes the spurious small-N digit-vs-word I3 fallback the history eval found.
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

// Score the raw model output against the deterministic ground truth. Boolean parts; the
// per-item score = fraction of the item's RELEVANT parts (scoreKeys) that are true.
export function scoreParts(output, gt) {
  const text = output.toLowerCase();
  const N = gt.lvkitChangeCount;
  const h = {};
  for (const k of gt.kinds || []) h[k] = (h[k] || 0) + 1;
  const kindWords = Object.keys(h);
  // I3: the narrative states the headline count -- as the DIGIT or (for a small N) the spelled word.
  const statesStructuralCount =
    new RegExp(`\\b${N}\\b`).test(output) ||
    (Number.isInteger(N) && N >= 0 && N <= 12 && new RegExp(`\\b${NUMBER_WORDS[N]}\\b`, 'i').test(output));
  // Hardened: only an ASSERTED no-change is a violation, not a quoted/refuted one (scorerHardening.mjs).
  const noFalseNoChange = noFalseNoChangeHardened(output, N);
  const mentionsCosmetic = /cosmetic/.test(text);
  const mentionsKinds = kindWords.length ? kindWords.every((k) => text.includes(k)) : true;
  const nums = (output.match(/\d+/g) || []).map(Number);
  const allowed = new Set(gt.allowedNumbers);
  const invented = nums.filter((n) => n > 1 && !allowed.has(n));
  const noInventedNumbers = invented.length === 0;
  return { parts: { statesStructuralCount, noFalseNoChange, mentionsCosmetic, mentionsKinds, noInventedNumbers }, invented };
}

// Per-item faithfulness from scored parts + the item's relevant scoreKeys.
export function taskScoreOf(parts, scoreKeys, err) {
  const rel = scoreKeys.filter((k) => parts[k] !== undefined);
  if (err || rel.length === 0) return 0;
  return Math.round((rel.filter((k) => parts[k]).length / rel.length) * 1000) / 1000;
}

// Aggregate a results array into overall + by-task + standard/adversarial means.
export function aggregate(results) {
  const meanOf = (rs) => (rs.length ? Math.round((rs.reduce((a, r) => a + r.faithfulness, 0) / rs.length) * 1000) / 1000 : null);
  const taskIds = [...new Set(results.map((r) => r.task))];
  const byTask = Object.fromEntries(taskIds.map((tid) => [tid, meanOf(results.filter((r) => r.task === tid))]));
  return {
    overall: meanOf(results),
    standardMean: meanOf(results.filter((r) => !r.adversarial)),
    adversarialMean: meanOf(results.filter((r) => r.adversarial)),
    byTask
  };
}

// Run one model over the eval items via ollama /api/chat (deterministic, temp 0) using the
// shared SYSTEM + scorer. Returns the per-item results array.
export async function runEvalForModel(ollama, model, items) {
  const results = [];
  for (const e of items) {
    let output = '';
    let err = null;
    try {
      const resp = await fetch(`${ollama}/api/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, stream: false, options: { temperature: 0 }, messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `${e.prompt}\n\n${e.facts}` }
        ] })
      });
      const j = await resp.json();
      if (j.error) err = String(j.error);
      output = (j.message && j.message.content) || '';
    } catch (ex) { err = String(ex); }
    const sc = err ? { parts: {}, invented: [] } : scoreParts(output, e.groundTruth);
    results.push({
      vi: e.vi.split('/').pop(), task: e.task, adversarial: e.adversarial || false,
      labviewSource: e.groundTruth.labviewSource,
      faithfulness: taskScoreOf(sc.parts, e.scoreKeys, err),
      parts: sc.parts, scoreKeys: e.scoreKeys, invented: sc.invented,
      error: err || undefined, output: output.slice(0, 400)
    });
  }
  return results;
}
