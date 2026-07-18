import { describe, expect, it } from 'vitest';

import {
  formatAttributeLedger,
  formatDetailHeadingLedger,
  formatDetailItemLedger,
  formatOverviewCaptionLedger,
  renderPairMetadataLedgerRow
} from '../../src/dashboard/multiReportDashboardPairLedger';
import type { ParsedNiComparisonReport } from '../../src/dashboard/niComparisonReportParser';
import type { MultiReportDashboardEntry } from '../../src/dashboard/multiReportDashboard';

function parsed(overrides: Partial<ParsedNiComparisonReport> = {}): ParsedNiComparisonReport {
  return {
    reportTitle: 'Diff',
    generationTime: '2026-07-17',
    firstViPath: 'a.vi',
    secondViPath: 'b.vi',
    overviewSections: [],
    includedAttributes: [],
    detailSections: [],
    ...overrides
  } as ParsedNiComparisonReport;
}

function entry(overrides: Partial<MultiReportDashboardEntry> = {}): MultiReportDashboardEntry {
  return {
    selectedSubject: 'Selected subject',
    selectedHash: '1234567890abcdef',
    baseSubject: 'Base subject',
    baseHash: 'fedcba0987654321',
    ...overrides
  } as MultiReportDashboardEntry;
}

describe('formatOverviewCaptionLedger', () => {
  it('renders none or a caption/image summary', () => {
    expect(formatOverviewCaptionLedger(parsed())).toBe('none');
    expect(
      formatOverviewCaptionLedger(
        parsed({ overviewSections: [{ caption: 'Block Diagram Overview', images: [{}, {}] }] as never })
      )
    ).toBe('Block Diagram Overview (2 image(s))');
  });
});

describe('formatAttributeLedger', () => {
  it('filters by included flag and joins labels', () => {
    const report = parsed({
      includedAttributes: [
        { label: 'Front Panel', included: true },
        { label: 'Cosmetic', included: false }
      ] as never
    });
    expect(formatAttributeLedger(report, true)).toBe('Front Panel');
    expect(formatAttributeLedger(report, false)).toBe('Cosmetic');
    expect(formatAttributeLedger(parsed(), true)).toBe('none');
  });
});

describe('formatDetailHeadingLedger', () => {
  it('renders none or heading/item counts', () => {
    expect(formatDetailHeadingLedger(parsed())).toBe('none');
    expect(
      formatDetailHeadingLedger(
        parsed({ detailSections: [{ heading: 'Wires', items: ['x'] }] as never })
      )
    ).toBe('Wires (1 item(s))');
  });
});

describe('formatDetailItemLedger', () => {
  it('flattens items or renders none', () => {
    expect(formatDetailItemLedger(parsed())).toBe('none');
    expect(
      formatDetailItemLedger(
        parsed({ detailSections: [{ heading: 'Wires', items: ['x', 'y'] }] as never })
      )
    ).toBe('x; y');
  });
});

describe('renderPairMetadataLedgerRow', () => {
  it('renders the no-metadata note when no parsed report is present', () => {
    const html = renderPairMetadataLedgerRow(entry({ parsedReport: undefined }), 0, 3);
    expect(html).toContain('Pair 1 of 3');
    expect(html).toContain('dashboard-pair-ledger-no-metadata');
    expect(html).toContain('<code>12345678</code>');
    expect(html).toContain('<code>fedcba09</code>');
  });

  it('renders the metadata grid when a parsed report is present', () => {
    const html = renderPairMetadataLedgerRow(
      entry({ parsedReport: parsed({ reportTitle: 'My Report' }) }),
      1,
      2
    );
    expect(html).toContain('Pair 2 of 2');
    expect(html).toContain('dashboard-pair-ledger-report');
    expect(html).toContain('My Report');
    expect(html).toContain('dashboard-pair-ledger-detail-items');
  });

  it('escapes HTML in the selected subject', () => {
    const html = renderPairMetadataLedgerRow(
      entry({ selectedSubject: '<script>', parsedReport: undefined }),
      0,
      1
    );
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
