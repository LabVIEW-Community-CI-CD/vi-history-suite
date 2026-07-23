import { describe, expect, it } from 'vitest';

import {
  parseComparisonDetailItemGeometry,
  parseComparisonDetailItemsGeometry,
  hasDiagramCoordinate,
  toPoint
} from '../../src/dashboard/comparisonDetailItemGeometry';

// VHS-REQ-703.10 (epic #2262): structured geometry extraction from NI comparison
// report `diff-detail` items. Pure — real report strings in, structured records
// out. Coordinates are VI diagram space, not preview pixels.

describe('parseComparisonDetailItemGeometry (VHS-REQ-703.10)', () => {
  it('extracts kind, name, change type, and coordinate from a real "added at" item', () => {
    const r = parseComparisonDetailItemGeometry('Boolean Constant "Visible" - added at (1538,393)');
    expect(r.changeType).toBe('added');
    expect(r.objectKind).toBe('Boolean Constant');
    expect(r.objectName).toBe('Visible');
    expect(r.coordinate).toEqual({ x: 1538, y: 393 });
    expect(r.fromCoordinate).toBeUndefined();
    expect(r.text).toBe('Boolean Constant "Visible" - added at (1538,393)');
  });

  it('extracts a real "deleted at" SubVI item', () => {
    const r = parseComparisonDetailItemGeometry('SubVI "Finalize Text.vi" - deleted at (1397,358)');
    expect(r.changeType).toBe('deleted');
    expect(r.objectKind).toBe('SubVI');
    expect(r.objectName).toBe('Finalize Text.vi');
    expect(r.coordinate).toEqual({ x: 1397, y: 358 });
  });

  it('handles a kind-only item with no name or coordinate', () => {
    const r = parseComparisonDetailItemGeometry('SubVI - VI linkage');
    expect(r.changeType).toBe('other');
    expect(r.objectKind).toBe('SubVI');
    expect(r.objectName).toBeUndefined();
    expect(r.coordinate).toBeUndefined();
  });

  it('handles a bare descriptor with no kind, name, action, or coordinate', () => {
    const r = parseComparisonDetailItemGeometry('wiring changes');
    // "wiring changes" carries no recognized action verb (it is the report's
    // generic wiring bucket), no object kind/name, and no coordinate.
    expect(r.changeType).toBe('other');
    expect(r.objectKind).toBeUndefined();
    expect(r.objectName).toBeUndefined();
    expect(r.coordinate).toBeUndefined();
  });

  it('parses a move with from/to coordinates', () => {
    const r = parseComparisonDetailItemGeometry('SubVI "X.vi" - moved from (10,20) to (30,40)');
    expect(r.changeType).toBe('moved');
    expect(r.fromCoordinate).toEqual({ x: 10, y: 20 });
    expect(r.coordinate).toEqual({ x: 30, y: 40 });
  });

  it('tolerates whitespace inside the coordinate token', () => {
    const r = parseComparisonDetailItemGeometry('Numeric "N" - added at ( 12 , 34 )');
    expect(r.coordinate).toEqual({ x: 12, y: 34 });
  });

  it('returns a safe record for empty or non-string input', () => {
    expect(parseComparisonDetailItemGeometry('')).toEqual({ text: '', changeType: 'other' });
    expect(parseComparisonDetailItemGeometry(undefined)).toEqual({
      text: '',
      changeType: 'other'
    });
  });

  it('never loses the raw text', () => {
    const text = 'Some Unrecognized Detail Line';
    expect(parseComparisonDetailItemGeometry(text).text).toBe(text);
  });

  it('maps an array and reports coordinate presence', () => {
    const records = parseComparisonDetailItemsGeometry([
      'SubVI "VisibleTextMarker.vi" - added at (1570,358)',
      'wiring changes',
      'SubVI - VI missing'
    ]);
    expect(records).toHaveLength(3);
    expect(records.map((r) => hasDiagramCoordinate(r))).toEqual([true, false, false]);
    expect(records[0].objectName).toBe('VisibleTextMarker.vi');
  });
});

describe('toPoint numeric guard (VHS-REQ-703.10)', () => {
  it('returns undefined when a captured coordinate group is not a finite number', () => {
    // The POINT regex only ever captures digit runs, so this guard is defensive:
    // a match array whose captured groups are non-numeric must yield no point
    // rather than a NaN coordinate.
    expect(toPoint(['(x,y)', 'NaNnum', '5'] as unknown as RegExpMatchArray)).toBeUndefined();
    expect(toPoint(['(x,y)', '5', 'oops'] as unknown as RegExpMatchArray)).toBeUndefined();
  });

  it('returns the point for a valid numeric match and undefined for no match', () => {
    expect(toPoint(['(3,4)', '3', '4'] as unknown as RegExpMatchArray)).toEqual({ x: 3, y: 4 });
    expect(toPoint(null)).toBeUndefined();
  });
});
