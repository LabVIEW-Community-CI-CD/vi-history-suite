/**
 * Unit tests for the pure GitHub commit-status planner for the VI semantic review.
 */

import { describe, expect, it } from 'vitest';

import { planReviewCommitStatus } from '../../src/semantic/viReviewCommitStatus';
import type { ViSemanticPrReview } from '../../src/semantic/viSemanticPrReview';

function review(overrides: Partial<ViSemanticPrReview> = {}): ViSemanticPrReview {
  return {
    schema: 'vi-history-suite/vi-semantic-pr-review@v1',
    repositoryRoot: '/repo',
    baseHash: 'a',
    selectedHash: 'b',
    changedViCount: 0,
    reviewedCount: 0,
    entries: [],
    totals: { withDifferences: 0, withoutDifferences: 0, blockedOrFailed: 0 },
    narrative: 'No changed VIs were found between the two revisions.',
    ...overrides
  };
}

describe('planReviewCommitStatus', () => {
  it('is success with the review context when no VIs changed', () => {
    expect(planReviewCommitStatus(review())).toEqual({
      state: 'success',
      context: 'vi-semantic-review',
      description: 'No LabVIEW VI changes'
    });
  });

  it('is success when every changed VI was compared (differences are informational)', () => {
    const plan = planReviewCommitStatus(
      review({
        changedViCount: 2,
        reviewedCount: 2,
        totals: { withDifferences: 1, withoutDifferences: 1, blockedOrFailed: 0 }
      })
    );
    expect(plan.state).toBe('success');
    expect(plan.description).toBe('1 of 2 reviewed VI(s) changed');
  });

  it('stays success (informational) for a partial review without fail-on-incomplete', () => {
    const plan = planReviewCommitStatus(
      review({
        changedViCount: 3,
        reviewedCount: 3,
        totals: { withDifferences: 1, withoutDifferences: 0, blockedOrFailed: 2 }
      })
    );
    expect(plan.state).toBe('success');
    expect(plan.description).toContain('2 not compared');
  });

  it('is failure when incomplete (including cap-skipped VIs) and fail-on-incomplete is set', () => {
    const plan = planReviewCommitStatus(
      review({
        changedViCount: 2,
        reviewedCount: 1,
        totals: { withDifferences: 1, withoutDifferences: 0, blockedOrFailed: 0 }
      }),
      { failOnIncomplete: true }
    );
    expect(plan.state).toBe('failure');
    expect(plan.description).toContain('1 not compared');
  });

  it('keeps the description within the 140-character status limit', () => {
    const plan = planReviewCommitStatus(
      review({
        changedViCount: 999999,
        reviewedCount: 999999,
        totals: { withDifferences: 999999, withoutDifferences: 0, blockedOrFailed: 0 }
      })
    );
    expect(plan.description.length).toBeLessThanOrEqual(140);
  });
});
