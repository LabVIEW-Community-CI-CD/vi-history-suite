import { describe, expect, it } from 'vitest';

import {
  formatPairOrdinalSummary,
  mapPairIdsToOrdinals
} from '../../src/dashboard/multiReportDashboardPairOrdinals';

describe('mapPairIdsToOrdinals', () => {
  it('resolves known ids, drops unknown, and sorts ascending', () => {
    const byId = new Map<string, number>([
      ['a', 3],
      ['b', 1],
      ['c', 2]
    ]);
    expect(mapPairIdsToOrdinals(['a', 'x', 'b', 'c'], byId)).toEqual([1, 2, 3]);
  });

  it('returns an empty array when nothing resolves', () => {
    expect(mapPairIdsToOrdinals(['x', 'y'], new Map())).toEqual([]);
  });
});

describe('formatPairOrdinalSummary', () => {
  it('renders the empty, single, and multi forms', () => {
    expect(formatPairOrdinalSummary([])).toBe('no pair positions retained');
    expect(formatPairOrdinalSummary([4])).toBe('pair 4');
    expect(formatPairOrdinalSummary([1, 2, 3])).toBe('pairs 1, 2, 3');
  });
});
