/**
 * Unit tests for the pure sticky pull-request comment planner.
 */

import { describe, expect, it } from 'vitest';

import { planStickyPrComment } from '../../src/semantic/stickyPrComment';

const MARKER = '<!-- vi-history-suite:vi-semantic-pr-review -->';

describe('planStickyPrComment', () => {
  it('plans a create when no existing comment carries the marker', () => {
    const plan = planStickyPrComment({
      existingComments: [
        { id: 1, body: 'looks good to me' },
        { id: 2, body: 'please add a test' }
      ],
      marker: MARKER,
      body: `${MARKER}\n## VI semantic review`
    });

    expect(plan).toEqual({ action: 'create', body: `${MARKER}\n## VI semantic review` });
  });

  it('plans an update that targets the existing marker comment', () => {
    const plan = planStickyPrComment({
      existingComments: [
        { id: 10, body: 'unrelated' },
        { id: 11, body: `${MARKER}\n## VI semantic review (old)` }
      ],
      marker: MARKER,
      body: `${MARKER}\n## VI semantic review (new)`
    });

    expect(plan).toEqual({
      action: 'update',
      commentId: 11,
      body: `${MARKER}\n## VI semantic review (new)`
    });
  });

  it('prepends the marker when the body omits it so the comment stays sticky', () => {
    const plan = planStickyPrComment({
      existingComments: [],
      marker: MARKER,
      body: '## VI semantic review'
    });

    expect(plan).toEqual({ action: 'create', body: `${MARKER}\n## VI semantic review` });
  });

  it('does not duplicate the marker when the body already contains it', () => {
    const body = `${MARKER}\n## VI semantic review`;
    const plan = planStickyPrComment({ existingComments: [], marker: MARKER, body });

    expect(plan.body).toBe(body);
    expect(plan.body.indexOf(MARKER)).toBe(plan.body.lastIndexOf(MARKER));
  });

  it('updates the earliest marked comment when several carry the marker', () => {
    const plan = planStickyPrComment({
      existingComments: [
        { id: 5, body: `${MARKER} first` },
        { id: 6, body: `${MARKER} duplicate` }
      ],
      marker: MARKER,
      body: `${MARKER}\nlatest`
    });

    expect(plan).toMatchObject({ action: 'update', commentId: 5 });
  });

  it('throws when the marker is empty', () => {
    expect(() =>
      planStickyPrComment({ existingComments: [], marker: '', body: 'x' })
    ).toThrow('marker is required');
  });
});
