/**
 * Unit tests for the VI semantic PR-review aggregator and Markdown renderer.
 */

import { describe, expect, it, vi } from 'vitest';

import type { CompareViRevisionsResult } from '../../src/semantic/compareViRevisions';
import {
  VI_SEMANTIC_COMPARISON_SCHEMA,
  type ViSemanticComparisonModel
} from '../../src/semantic/viSemanticModel';
import {
  buildViSemanticPrReview,
  isViSourcePath,
  renderViSemanticPrReviewMarkdown,
  VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER,
  VI_SEMANTIC_PR_REVIEW_SCHEMA,
  type ViSemanticPrReviewDeps
} from '../../src/semantic/viSemanticPrReview';

function makeModel(overrides: Partial<ViSemanticComparisonModel> = {}): ViSemanticComparisonModel {
  return {
    schema: VI_SEMANTIC_COMPARISON_SCHEMA,
    vi: { title: 'Widget.vi' },
    hasDifferences: true,
    changedSurfaces: ['block-diagram'],
    attributes: { included: [], excluded: [] },
    overviewSections: [],
    detailSections: [],
    totals: {
      changedSurfaceCount: 1,
      overviewImageCount: 0,
      detailSectionCount: 0,
      detailItemCount: 0,
      includedAttributeCount: 0,
      excludedAttributeCount: 0
    },
    narrative: 'The block diagram differs.',
    ...overrides
  };
}

function completed(model: ViSemanticComparisonModel): CompareViRevisionsResult {
  return {
    status: 'completed',
    hasDifferences: model.hasDifferences,
    model,
    runtime: { provider: 'linux-container', state: 'succeeded', reportFilePath: '/tmp/report.html' }
  };
}

function deps(
  changed: string[],
  results: Record<string, CompareViRevisionsResult>
): ViSemanticPrReviewDeps {
  return {
    listChangedPaths: vi.fn(async () => changed),
    compareVi: vi.fn(async (input) => results[input.relativePath] ?? { status: 'failed', reason: 'no fixture' })
  };
}

describe('isViSourcePath', () => {
  it('matches VI source extensions and rejects others', () => {
    expect(isViSourcePath('a/B.vi')).toBe(true);
    expect(isViSourcePath('a/B.vit')).toBe(true);
    expect(isViSourcePath('a/B.vim')).toBe(true);
    expect(isViSourcePath('a/B.ctl')).toBe(true);
    expect(isViSourcePath('a/B.txt')).toBe(false);
    expect(isViSourcePath('a/B.vi.md')).toBe(false);
  });
});

describe('buildViSemanticPrReview', () => {
  const base = 'aaaaaaa';
  const selected = 'bbbbbbb';

  it('filters to changed VIs, compares each, dedupes, and aggregates totals', async () => {
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: base, selectedHash: selected },
      deps(['docs/readme.md', 'src/A.vi', 'src/B.vi', 'src/C.vi', 'src/A.vi'], {
        'src/A.vi': completed(makeModel({ vi: { title: 'A.vi' }, hasDifferences: true })),
        'src/B.vi': completed(
          makeModel({ vi: { title: 'B.vi' }, hasDifferences: false, changedSurfaces: [] })
        ),
        'src/C.vi': { status: 'blocked-runtime', reason: 'no comparison runtime' }
      })
    );

    expect(review.schema).toBe(VI_SEMANTIC_PR_REVIEW_SCHEMA);
    expect(review.changedViCount).toBe(3);
    expect(review.reviewedCount).toBe(3);
    expect(review.entries.map((entry) => entry.relativePath)).toEqual([
      'src/A.vi',
      'src/B.vi',
      'src/C.vi'
    ]);
    expect(review.totals).toEqual({ withDifferences: 1, withoutDifferences: 1, blockedOrFailed: 1 });
    expect(review.narrative).toContain('3 changed VIs');
    expect(review.narrative).toContain('1 not compared');
  });

  it('caps the number of VIs compared at maxVis, path-sorted', async () => {
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: base, selectedHash: selected, maxVis: 1 },
      deps(['src/B.vi', 'src/A.vi'], {
        'src/A.vi': completed(makeModel({ vi: { title: 'A.vi' } })),
        'src/B.vi': completed(makeModel({ vi: { title: 'B.vi' } }))
      })
    );

    expect(review.changedViCount).toBe(2);
    expect(review.reviewedCount).toBe(1);
    expect(review.entries[0]?.relativePath).toBe('src/A.vi');
    expect(review.narrative).toContain('reviewed 1');
  });

  it('reports no changed VIs when the diff contains none', async () => {
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: base, selectedHash: selected },
      deps(['docs/readme.md', 'src/main.ts'], {})
    );

    expect(review.changedViCount).toBe(0);
    expect(review.entries).toEqual([]);
    expect(review.narrative).toContain('No changed VIs');
  });

  it('throws when required inputs are missing', async () => {
    await expect(
      buildViSemanticPrReview({ repositoryRoot: '', baseHash: base, selectedHash: selected })
    ).rejects.toThrow('repositoryRoot');
    await expect(
      buildViSemanticPrReview({ repositoryRoot: '/repo', baseHash: '', selectedHash: selected })
    ).rejects.toThrow('baseHash and selectedHash');
  });
});

describe('renderViSemanticPrReviewMarkdown', () => {
  it('renders a summary table plus detail blocks only for changed VIs', async () => {
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: 'a', selectedHash: 'b' },
      {
        listChangedPaths: async () => ['src/A.vi', 'src/B.vi'],
        compareVi: async (input) =>
          input.relativePath === 'src/A.vi'
            ? completed(
                makeModel({
                  vi: { title: 'A.vi' },
                  hasDifferences: true,
                  changedSurfaces: ['block-diagram'],
                  narrative: 'The block diagram differs.'
                })
              )
            : completed(
                makeModel({
                  vi: { title: 'B.vi' },
                  hasDifferences: false,
                  changedSurfaces: [],
                  narrative: 'No LabVIEW differences were detected between the two revisions.'
                })
              )
      }
    );

    const markdown = renderViSemanticPrReviewMarkdown(review);
    expect(markdown.startsWith(VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER)).toBe(true);
    expect(markdown).toContain('## VI semantic review');
    expect(markdown).toContain('| VI | Result | Changed surfaces |');
    expect(markdown).toContain('| src/A.vi | Changed | block diagram |');
    expect(markdown).toContain('| src/B.vi | No differences | — |');
    expect(markdown).toContain('#### src/A.vi');
    expect(markdown).toContain('The block diagram differs.');
    expect(markdown).not.toContain('#### src/B.vi');
  });

  it('renders a no-changes message when there are no VI entries', async () => {
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: 'a', selectedHash: 'b' },
      { listChangedPaths: async () => [], compareVi: async () => completed(makeModel()) }
    );

    const markdown = renderViSemanticPrReviewMarkdown(review);
    expect(markdown.startsWith(VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER)).toBe(true);
    expect(markdown).toContain('## VI semantic review');
    expect(markdown).toContain('No changed VIs');
    expect(markdown).not.toContain('| VI |');
  });
});
