/**
 * Pure planner for a "sticky" pull-request comment: a comment that a reviewer
 * (an AI agent, a bot, or a CLI) creates once and then updates in place on every
 * subsequent run instead of adding a new comment each time. The single comment
 * is identified by a hidden marker embedded in its body.
 *
 * This module is a dependency-free leaf: it performs no network access and does
 * not know about GitHub. A caller lists the existing comments through whatever
 * transport it uses, asks {@link planStickyPrComment} whether to create or
 * update, then performs the one resulting write. Keeping the decision pure makes
 * the upsert logic fully unit-testable without a live pull request.
 */

/** An existing PR comment as seen by the planner (transport-agnostic). */
export interface ExistingPrComment {
  /** Provider comment identifier used to target an update. */
  id: number;
  /** Raw comment body (must be the unrendered source so the marker is visible). */
  body: string;
}

/** The single write the caller should perform to keep the comment sticky. */
export type StickyCommentPlan =
  | { action: 'create'; body: string }
  | { action: 'update'; commentId: number; body: string };

export interface PlanStickyPrCommentInput {
  /** Existing comments on the pull request, in provider order (oldest first). */
  existingComments: readonly ExistingPrComment[];
  /** Hidden marker that identifies the sticky comment across runs. */
  marker: string;
  /** The rendered comment body to post. */
  body: string;
}

/**
 * Decides whether to create a new sticky comment or update the existing one.
 *
 * The returned body always contains the marker (prepended if the caller's body
 * omits it) so the comment stays discoverable on the next run regardless of how
 * it was rendered. When several comments carry the marker the earliest is
 * updated, which keeps the choice deterministic and avoids fragmenting the
 * review across duplicates.
 */
export function planStickyPrComment(input: PlanStickyPrCommentInput): StickyCommentPlan {
  const marker = input.marker;
  if (!marker) {
    throw new Error('marker is required to plan a sticky comment');
  }

  const body = input.body.includes(marker) ? input.body : `${marker}\n${input.body}`;

  const existing = input.existingComments.find(
    (comment) => typeof comment.body === 'string' && comment.body.includes(marker)
  );
  if (existing) {
    return { action: 'update', commentId: existing.id, body };
  }
  return { action: 'create', body };
}
