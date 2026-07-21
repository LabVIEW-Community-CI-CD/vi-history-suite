import type { ViSemanticComparisonModel } from './viSemanticModel';
import type { ViSemanticPrReview } from './viSemanticPrReview';

/**
 * No-itemized-change detection for a VI semantic PR review (VHS-REQ-661).
 *
 * User story: a PR touching many VIs (e.g. 10) flags every VI as changed in Git
 * even when one of them has no real changes — for example a VI re-saved
 * (recompiled/re-serialized) with different bytes but an identical front panel
 * and block diagram. Reviewers cannot otherwise tell which "changed" VIs are
 * likely false positives without opening each comparison.
 *
 * Signal (proven by the empty-VI swap experiment): NI's comparison report always
 * renders the "Front Panel Overview" / "Block Diagram Overview" snapshot
 * captions whenever a comparison runs, so `hasDifferences` is `true` even for a
 * semantically identical pair. The measurable no-change signal is therefore zero
 * *itemized* differences across all detail sections — `totals.detailItemCount
 * === 0` on a completed comparison. Attribute-only changes render as detail
 * items, so they are correctly NOT flagged.
 *
 * IMPORTANT (why "itemized", not "semantic equality"): the semantic model
 * deliberately treats the always-present overview snapshot sections as a
 * difference and, when a report has NO detail sections, falls back to the
 * overview captions for a "detail-less difference" (see
 * `buildViSemanticComparisonModel`). So `detailItemCount === 0` is a reliable
 * "no itemized difference" signal but is NOT proof of semantic equality: a
 * genuine visual change surfaced only through the overview images would also
 * report zero detail items. The review therefore flags these VIs as a
 * likely-false-positive hint and PRESERVES their evidence (narrative + overview
 * visual gallery) for the reviewer to confirm — it never hides the diff.
 *
 * Pure and dependency-free (type-only imports); no runtime, no new schema.
 */

/**
 * Whether a completed comparison model reports a difference but no itemized
 * detail differences: `hasDifferences === true` (driven by the always-present
 * overview snapshots) yet `totals.detailItemCount === 0`. This is the
 * likely-Git-false-positive case a reviewer wants to discount — Git marked the
 * file changed, LabVIEW itemized no difference. A model with `hasDifferences ===
 * false` is a genuine no-difference result, not a false positive, so it is not
 * flagged. NOT a claim of semantic equality (see module note): a real
 * overview-only visual change also reports zero detail items, so the review
 * keeps the evidence visible.
 */
export function viHasNoItemizedChanges(model: ViSemanticComparisonModel): boolean {
  return model.hasDifferences === true && model.totals.detailItemCount === 0;
}

/** A VI flagged as having no itemized changes despite appearing changed in Git. */
export interface NoItemizedChangeVi {
  relativePath: string;
}

/**
 * Detects, over a completed PR review, the VIs whose comparison completed but
 * itemized no differences. Only `completed` entries are considered — a
 * blocked/failed VI is not a no-change signal, it is an unknown. Deterministic:
 * preserves the review's entry order.
 */
export function detectNoItemizedChangeVis(
  review: ViSemanticPrReview
): NoItemizedChangeVi[] {
  const flagged: NoItemizedChangeVi[] = [];
  for (const entry of review.entries) {
    if (entry.status === 'completed' && viHasNoItemizedChanges(entry.model)) {
      flagged.push({ relativePath: entry.relativePath });
    }
  }
  return flagged;
}
