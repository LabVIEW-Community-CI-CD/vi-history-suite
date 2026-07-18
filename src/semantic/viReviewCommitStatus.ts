import type { ViSemanticPrReview } from './viSemanticPrReview';

/**
 * Pure planner that maps a VI semantic PR review onto a GitHub commit status, so
 * the review appears as a first-class, branch-protection-gateable status on the
 * pull request in addition to the sticky comment. A commit status (unlike a
 * check run, which can only be created by a GitHub App) can be created with a
 * plain token that has `statuses: write`, matching this project's PAT-based
 * token model. Pure and network-free: the caller performs the statuses API
 * write with this plan.
 */

export interface ReviewCommitStatusPlan {
  /** Commit-status state (statuses have no "neutral"; a review is success unless it fails closed). */
  state: 'success' | 'failure';
  /** Status context, requirable by branch protection. */
  context: string;
  /** Short (<=140 char) status description. */
  description: string;
}

/**
 * Decides the commit-status state and description for a review:
 * - `failure` only when `failOnIncomplete` is set and a changed VI was not
 *   compared (blocked/failed, or skipped by the maxVis cap);
 * - `success` otherwise. Differences are informational, and a partial review
 *   without the fail-on-incomplete opt-in still succeeds (its description notes
 *   how many VIs were not compared).
 */
export function planReviewCommitStatus(
  review: ViSemanticPrReview,
  options: { failOnIncomplete?: boolean } = {}
): ReviewCommitStatusPlan {
  const capGap = Math.max(0, review.changedViCount - review.reviewedCount);
  const incompleteCount = review.totals.blockedOrFailed + capGap;
  const incomplete = incompleteCount > 0;

  const state: ReviewCommitStatusPlan['state'] =
    options.failOnIncomplete && incomplete ? 'failure' : 'success';

  const description =
    review.changedViCount === 0
      ? 'No LabVIEW VI changes'
      : `${review.totals.withDifferences} of ${review.reviewedCount} reviewed VI(s) changed` +
        (incomplete ? `, ${incompleteCount} not compared` : '');

  return { state, context: 'vi-semantic-review', description };
}
