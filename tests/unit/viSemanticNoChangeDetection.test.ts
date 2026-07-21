/**
 * Unit tests for no-itemized-change detection (VHS-REQ-661): the
 * false-positive case where Git marks a VI changed but the comparison finds no
 * itemized difference.
 */

import { describe, expect, it } from 'vitest';

import {
  VI_SEMANTIC_COMPARISON_SCHEMA,
  type ViSemanticComparisonModel
} from '../../src/semantic/viSemanticModel';
import {
  VI_SEMANTIC_PR_REVIEW_SCHEMA,
  type ViSemanticPrReview,
  type ViSemanticPrReviewEntry
} from '../../src/semantic/viSemanticPrReview';
import {
  detectNoItemizedChangeVis,
  viHasNoItemizedChanges
} from '../../src/semantic/viSemanticNoChangeDetection';

function makeModel(overrides: Partial<ViSemanticComparisonModel> = {}): ViSemanticComparisonModel {
  return {
    schema: VI_SEMANTIC_COMPARISON_SCHEMA,
    vi: { title: 'Widget.vi' },
    hasDifferences: true,
    changedSurfaces: ['block-diagram'],
    attributes: { included: [], excluded: [] },
    overviewSections: [],
    detailSections: [
      { surface: 'block-diagram', heading: 'Block Diagram objects', items: ['Wire rerouted'], itemCount: 1 }
    ],
    totals: {
      changedSurfaceCount: 1,
      overviewImageCount: 0,
      detailSectionCount: 1,
      detailItemCount: 1,
      includedAttributeCount: 0,
      excludedAttributeCount: 0
    },
    narrative: 'The block diagram differs.',
    ...overrides
  };
}

/** A model matching the empty-swap case: overview-level difference, zero detail items. */
function noItemizedModel(): ViSemanticComparisonModel {
  return makeModel({
    changedSurfaces: ['front-panel', 'block-diagram'],
    detailSections: [],
    totals: {
      changedSurfaceCount: 2,
      overviewImageCount: 2,
      detailSectionCount: 0,
      detailItemCount: 0,
      includedAttributeCount: 0,
      excludedAttributeCount: 0
    },
    narrative: 'The front panel and block diagram differ.'
  });
}

function completedEntry(relativePath: string, model: ViSemanticComparisonModel): ViSemanticPrReviewEntry {
  return { relativePath, status: 'completed', hasDifferences: model.hasDifferences, model };
}

function review(entries: ViSemanticPrReviewEntry[]): ViSemanticPrReview {
  const withDifferences = entries.filter((e) => e.status === 'completed' && e.hasDifferences).length;
  const withoutDifferences = entries.filter((e) => e.status === 'completed' && !e.hasDifferences).length;
  const blockedOrFailed = entries.filter((e) => e.status !== 'completed').length;
  return {
    schema: VI_SEMANTIC_PR_REVIEW_SCHEMA,
    repositoryRoot: '/repo',
    baseHash: 'a',
    selectedHash: 'b',
    changedViCount: entries.length,
    reviewedCount: entries.length,
    entries,
    totals: { withDifferences, withoutDifferences, blockedOrFailed },
    narrative: 'summary'
  };
}

describe('viHasNoItemizedChanges', () => {
  it('flags an overview-only difference with zero itemized detail items', () => {
    expect(viHasNoItemizedChanges(noItemizedModel())).toBe(true);
  });

  it('does not flag a model with itemized detail changes', () => {
    expect(viHasNoItemizedChanges(makeModel())).toBe(false);
  });

  it('does not flag a genuine no-difference model', () => {
    const model = makeModel({
      hasDifferences: false,
      changedSurfaces: [],
      detailSections: [],
      totals: {
        changedSurfaceCount: 0,
        overviewImageCount: 0,
        detailSectionCount: 0,
        detailItemCount: 0,
        includedAttributeCount: 0,
        excludedAttributeCount: 0
      },
      narrative: 'No LabVIEW differences were detected between the two revisions.'
    });
    expect(viHasNoItemizedChanges(model)).toBe(false);
  });

  it('does not flag an attribute-only change (renders as detail items)', () => {
    const model = makeModel({
      changedSurfaces: ['vi-attributes'],
      detailSections: [
        { surface: 'vi-attributes', heading: 'VI Attribute - Miscellaneous', items: ['Icon changed'], itemCount: 1 }
      ],
      totals: {
        changedSurfaceCount: 1,
        overviewImageCount: 0,
        detailSectionCount: 1,
        detailItemCount: 1,
        includedAttributeCount: 0,
        excludedAttributeCount: 0
      }
    });
    expect(viHasNoItemizedChanges(model)).toBe(false);
  });
});

describe('detectNoItemizedChangeVis', () => {
  it('returns only the completed, no-itemized-change VIs in review order', () => {
    const flagged = detectNoItemizedChangeVis(
      review([
        completedEntry('src/A.vi', makeModel()),
        completedEntry('src/B.vi', noItemizedModel()),
        completedEntry('src/C.vi', noItemizedModel()),
        { relativePath: 'src/D.vi', status: 'failed', reason: 'runtime error' }
      ])
    );
    expect(flagged.map((v) => v.relativePath)).toEqual(['src/B.vi', 'src/C.vi']);
  });

  it('returns an empty array when every changed VI has real differences', () => {
    const flagged = detectNoItemizedChangeVis(
      review([completedEntry('src/A.vi', makeModel()), completedEntry('src/B.vi', makeModel())])
    );
    expect(flagged).toEqual([]);
  });

  it('ignores blocked or failed entries (an unknown is not a no-change signal)', () => {
    const flagged = detectNoItemizedChangeVis(
      review([
        { relativePath: 'src/A.vi', status: 'blocked-runtime', reason: 'no comparison runtime' },
        { relativePath: 'src/B.vi', status: 'failed', reason: 'runtime error' }
      ])
    );
    expect(flagged).toEqual([]);
  });
});
