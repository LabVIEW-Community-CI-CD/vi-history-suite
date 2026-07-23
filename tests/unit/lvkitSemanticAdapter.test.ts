import { describe, expect, it } from 'vitest';
import {
  buildViSemanticModelFromLvkitDiff,
  formatLvkitChangeAsDetailItem
} from '../../src/semantic/lvkit/lvkitSemanticAdapter';
import { VI_SEMANTIC_COMPARISON_SCHEMA } from '../../src/semantic/viSemanticModel';
import type { LvkitDiffChange, LvkitDiffDocument } from '../../src/semantic/lvkit/lvkitDiffModel';
import { LVKIT_DIFF_SCHEMA } from '../../src/semantic/lvkit/lvkitDiffModel';

function change(over: Partial<LvkitDiffChange> = {}): LvkitDiffChange {
  return { uid: '1', kind: 'node', change: 'added', ...over };
}

function doc(changes: LvkitDiffChange[], commonNodes = 0): LvkitDiffDocument {
  return { schema: LVKIT_DIFF_SCHEMA, changes, commonNodes };
}

const CTX = { title: 'lv_icon.vi', firstViPath: 'a.vi', secondViPath: 'b.vi' };

describe('formatLvkitChangeAsDetailItem (VHS-REQ-712.2)', () => {
  it('renders a subVI add in NI grammar with a coordinate', () => {
    expect(
      formatLvkitChangeAsDetailItem(
        change({ kind: 'node', change: 'added', label: 'VisibleTextMarker.vi', bounds: [1615, 358, 1647, 390] })
      )
    ).toBe('SubVI "VisibleTextMarker.vi" - added at (1615,358)');
  });

  it('renders a non-subVI node removal as a Node deletion', () => {
    expect(
      formatLvkitChangeAsDetailItem(
        change({ kind: 'node', change: 'removed', label: 'Add', bounds: [10, 20, 30, 40] })
      )
    ).toBe('Node "Add" - deleted at (10,20)');
  });

  it('renders a wire change and appends lvkit detail', () => {
    expect(
      formatLvkitChangeAsDetailItem(
        change({ kind: 'wire', change: 'removed', label: 'error in', detail: '\u2190 X.vi', bounds: [5, 6, 5, 6] })
      )
    ).toBe('Wire "error in" - deleted at (5,6) \u2014 \u2190 X.vi');
  });

  it('renders a move with from/to when both boxes are present', () => {
    expect(
      formatLvkitChangeAsDetailItem(
        change({ kind: 'node', change: 'moved', label: 'Loop', boundsBefore: [1, 2, 3, 4], bounds: [11, 22, 33, 44] })
      )
    ).toBe('Node "Loop" - moved from (1,2) to (11,22)');
  });

  it('uses the uid as the name when no label is present', () => {
    expect(formatLvkitChangeAsDetailItem(change({ uid: '42', label: undefined, bounds: undefined }))).toBe(
      'Node "42" - added'
    );
  });
});

describe('buildViSemanticModelFromLvkitDiff empty diff (VHS-REQ-712.3)', () => {
  it('reports no differences with an honest block-diagram scope', () => {
    const model = buildViSemanticModelFromLvkitDiff(doc([], 273), CTX);
    expect(model.schema).toBe(VI_SEMANTIC_COMPARISON_SCHEMA);
    expect(model.hasDifferences).toBe(false);
    expect(model.changedSurfaces).toEqual([]);
    expect(model.detailSections).toEqual([]);
    expect(model.overviewSections).toEqual([]);
    expect(model.attributes.included).toEqual(['block diagram']);
    expect(model.attributes.excluded).toEqual(['front panel', 'connector pane', 'VI attributes']);
    expect(model.runtime).toMatchObject({ provider: 'lvkit', engine: 'lvkit-diff' });
    expect(model.narrative).toContain('No block-diagram differences');
    expect(model.narrative).toContain('273 common nodes');
    expect(model.totals).toMatchObject({
      changedSurfaceCount: 0,
      overviewImageCount: 0,
      detailSectionCount: 0,
      detailItemCount: 0,
      includedAttributeCount: 1,
      excludedAttributeCount: 3
    });
  });
});

describe('buildViSemanticModelFromLvkitDiff rich diff (VHS-REQ-712.3)', () => {
  const model = buildViSemanticModelFromLvkitDiff(
    doc(
      [
        change({ uid: '19725', kind: 'node', change: 'added', label: 'VisibleTextMarker.vi', bounds: [1615, 358, 1647, 390] }),
        change({ uid: '4343', kind: 'node', change: 'removed', label: 'Finalize Text.vi', bounds: [1442, 358, 1474, 390] }),
        change({ uid: '19644', kind: 'wire', change: 'removed', label: 'error in', detail: '\u2190 X.vi' })
      ],
      273
    ),
    { ...CTX, revisions: { baseHash: '537683', selectedHash: 'fc09736' }, labviewVersion: '2026' }
  );

  it('projects every change onto the block-diagram surface', () => {
    expect(model.hasDifferences).toBe(true);
    expect(model.changedSurfaces).toEqual(['block-diagram']);
    expect(model.detailSections).toHaveLength(1);
    expect(model.detailSections[0].surface).toBe('block-diagram');
    expect(model.detailSections[0].items).toEqual([
      'SubVI "VisibleTextMarker.vi" - added at (1615,358)',
      'SubVI "Finalize Text.vi" - deleted at (1442,358)',
      'Wire "error in" - deleted \u2014 \u2190 X.vi'
    ]);
  });

  it('parses per-item diagram geometry from the coordinates', () => {
    const geometry = model.detailSections[0].itemGeometry;
    expect(geometry).toBeDefined();
    expect(geometry?.[0]).toMatchObject({
      changeType: 'added',
      objectKind: 'SubVI',
      objectName: 'VisibleTextMarker.vi',
      coordinate: { x: 1615, y: 358 }
    });
    expect(geometry?.[1]).toMatchObject({ changeType: 'deleted', objectName: 'Finalize Text.vi' });
  });

  it('classifies subVI changes as dependency and wire changes as behavioral (shared classifier)', () => {
    expect(model.changeKinds).toContain('dependency');
    expect(model.changeKinds).toContain('behavioral');
    // dependency + behavioral are high-risk kinds.
    expect(model.riskLevel).toBe('high');
    expect(['high', 'low']).toContain(model.classificationConfidence);
    expect(model.classification?.length).toBe(3);
  });

  it('records provenance, totals, and an lvkit runtime', () => {
    expect(model.revisions).toEqual({ baseHash: '537683', selectedHash: 'fc09736' });
    expect(model.runtime).toEqual({ provider: 'lvkit', engine: 'lvkit-diff', labviewVersion: '2026' });
    expect(model.vi).toEqual({ title: 'lv_icon.vi', firstViPath: 'a.vi', secondViPath: 'b.vi' });
    expect(model.totals.detailItemCount).toBe(3);
    expect(model.totals.changedSurfaceCount).toBe(1);
    expect(model.narrative).toContain('lvkit found 3 block-diagram changes');
    expect(model.narrative).toContain('273 common nodes');
    expect(model.narrative).toContain('block diagram only');
  });
});

describe('buildViSemanticModelFromLvkitDiff modified/moved changes (VHS-REQ-712.3)', () => {
  it('tallies modified/moved nodes and omits absent vi paths from the context', () => {
    const model = buildViSemanticModelFromLvkitDiff(
      doc(
        [
          change({ uid: '1', kind: 'node', change: 'modified', label: 'Case Structure', bounds: [5, 6, 7, 8] }),
          change({ uid: '2', kind: 'node', change: 'moved', label: 'Loop', boundsBefore: [1, 2, 3, 4], bounds: [11, 22, 33, 44] })
        ],
        10
      ),
      // Context WITHOUT firstViPath/secondViPath exercises the false arm of the
      // spread-ternaries that add those vi fields.
      { title: 'x.vi' }
    );
    expect(model.hasDifferences).toBe(true);
    // 'modified' -> mapChangeVerb 'changed'; both changes fall into the tally
    // else branch (nodesModified).
    expect(model.detailSections[0].items[0]).toBe('Node "Case Structure" - changed at (5,6)');
    expect(model.detailSections[0].items[1]).toBe('Node "Loop" - moved from (1,2) to (11,22)');
    // buildNarrative reports the modified-node segment (tally.nodesModified > 0).
    expect(model.narrative).toContain('2 nodes modified');
    expect(model.vi).toEqual({ title: 'x.vi' });
  });
});

describe('formatLvkitChangeAsDetailItem unrecognized kind and verb (VHS-REQ-712.2)', () => {
  it('title-cases an unrecognized object kind and preserves an unknown change verb', () => {
    // kind is neither 'wire' nor 'node' -> title-cased verbatim; an unknown
    // change verb is preserved (mapChangeVerb default case).
    expect(
      formatLvkitChangeAsDetailItem(
        change({ kind: 'structure' as never, change: 'resized' as never, label: 'Frame', bounds: [9, 9, 9, 9] })
      )
    ).toBe('Structure "Frame" - resized at (9,9)');
  });
});
