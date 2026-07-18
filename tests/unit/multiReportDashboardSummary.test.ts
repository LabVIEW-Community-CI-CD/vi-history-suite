import { describe, expect, it } from 'vitest';

import { buildDashboardSummary } from '../../src/dashboard/multiReportDashboardSummary';
import type { MultiReportDashboardEntry } from '../../src/dashboard/multiReportDashboard';

function entry(overrides: Partial<MultiReportDashboardEntry> = {}): MultiReportDashboardEntry {
  return {
    pairId: 'p1',
    archiveStatus: 'archived',
    generatedReportExists: true,
    pairEvidenceState: 'archived-generated-report',
    overviewImageCount: 0,
    detailItemCount: 0,
    runtimeProviderLabel: 'host / labview-2026 / x64 / win32',
    parsedReport: undefined,
    ...overrides
  } as MultiReportDashboardEntry;
}

describe('buildDashboardSummary', () => {
  it('reports a complete window when nothing is missing', () => {
    const summary = buildDashboardSummary([entry({ pairId: 'a' }), entry({ pairId: 'b' })]);
    expect(summary.representedPairCount).toBe(2);
    expect(summary.archivedPairCount).toBe(2);
    expect(summary.missingPairCount).toBe(0);
    expect(summary.windowCompletenessState).toBe('complete');
    expect(summary.generatedReportCount).toBe(2);
  });

  it('flags an incomplete window and lists missing pair ids', () => {
    const summary = buildDashboardSummary([
      entry({ pairId: 'a' }),
      entry({ pairId: 'b', archiveStatus: 'missing', generatedReportExists: false })
    ]);
    expect(summary.missingPairCount).toBe(1);
    expect(summary.missingPairIds).toEqual(['b']);
    expect(summary.windowCompletenessState).toBe('incomplete-missing-archives');
  });

  it('counts failed and blocked evidence states with their pair ids', () => {
    const summary = buildDashboardSummary([
      entry({ pairId: 'a', pairEvidenceState: 'archived-failed', generatedReportExists: false }),
      entry({ pairId: 'b', pairEvidenceState: 'archived-blocked', generatedReportExists: false })
    ]);
    expect(summary.failedPairCount).toBe(1);
    expect(summary.failedPairIds).toEqual(['a']);
    expect(summary.blockedPairCount).toBe(1);
    expect(summary.blockedPairIds).toEqual(['b']);
  });

  it('aggregates provider summaries with pair counts', () => {
    const summary = buildDashboardSummary([
      entry({ pairId: 'a', runtimeProviderLabel: 'host / x / y / z' }),
      entry({ pairId: 'b', runtimeProviderLabel: 'host / x / y / z' }),
      entry({ pairId: 'c', runtimeProviderLabel: 'docker / x / y / z' })
    ]);
    expect(summary.providerSummaries[0]).toEqual({ label: 'host / x / y / z', pairCount: 2 });
    expect(summary.providerSummaries).toHaveLength(2);
  });

  it('aggregates overview/attribute/detail summaries with pair ordinals from parsed reports', () => {
    const summary = buildDashboardSummary([
      entry({
        pairId: 'a',
        parsedReport: {
          firstViPath: 'a.vi',
          secondViPath: 'b.vi',
          overviewSections: [{ caption: 'Block Diagram Overview', images: [{}, {}] }],
          includedAttributes: [{ label: 'Front Panel', included: true }],
          detailSections: [{ heading: 'Wires', items: ['x', 'y'] }]
        } as never
      })
    ]);
    expect(summary.comparedPathSummaries[0].pairOrdinals).toEqual([1]);
    expect(summary.overviewCaptionSummaries[0]).toMatchObject({
      caption: 'Block Diagram Overview',
      pairCount: 1,
      imageCount: 2
    });
    expect(summary.includedAttributeSummaries[0].includedPairCount).toBe(1);
    expect(summary.detailHeadingSummaries[0].itemCount).toBe(2);
    expect(summary.detailItemSummaries.map((item) => item.item).sort()).toEqual(['x', 'y']);
    expect(summary.evidenceStateSummaries[0].pairCount).toBe(1);
  });
});
