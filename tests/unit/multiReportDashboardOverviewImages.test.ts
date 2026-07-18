import { describe, expect, it } from 'vitest';

import {
  deriveOverviewCaptionPriority,
  groupOverviewImageAssets
} from '../../src/dashboard/multiReportDashboardOverviewImages';
import type { MultiReportDashboardImageAsset } from '../../src/dashboard/multiReportDashboard';

function asset(
  caption: string,
  position: number
): MultiReportDashboardImageAsset {
  return {
    caption,
    position,
    sourceFilePath: `${caption}-${position}.png`,
    dashboardRelativePath: `assets/${caption}-${position}.png`
  };
}

describe('deriveOverviewCaptionPriority', () => {
  it('ranks block diagram before front panel before other, case-insensitively', () => {
    expect(deriveOverviewCaptionPriority('Block Diagram Overview')).toBe(0);
    expect(deriveOverviewCaptionPriority('  front panel overview ')).toBe(1);
    expect(deriveOverviewCaptionPriority('Something Else')).toBe(2);
  });
});

describe('groupOverviewImageAssets', () => {
  it('groups by caption and sorts images by position within a group', () => {
    const grouped = groupOverviewImageAssets([
      asset('Front Panel Overview', 2),
      asset('Front Panel Overview', 1)
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].caption).toBe('Front Panel Overview');
    expect(grouped[0].images.map((image) => image.position)).toEqual([1, 2]);
  });

  it('orders groups by caption priority then original appearance order', () => {
    const grouped = groupOverviewImageAssets([
      asset('Other Section', 0),
      asset('Front Panel Overview', 0),
      asset('Block Diagram Overview', 0)
    ]);
    expect(grouped.map((group) => group.caption)).toEqual([
      'Block Diagram Overview',
      'Front Panel Overview',
      'Other Section'
    ]);
  });

  it('preserves original order for equal-priority captions', () => {
    const grouped = groupOverviewImageAssets([
      asset('Zeta Section', 0),
      asset('Alpha Section', 0)
    ]);
    expect(grouped.map((group) => group.caption)).toEqual(['Zeta Section', 'Alpha Section']);
  });

  it('returns an empty array for no assets', () => {
    expect(groupOverviewImageAssets([])).toEqual([]);
  });
});
