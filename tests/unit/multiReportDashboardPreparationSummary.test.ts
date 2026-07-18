import { describe, expect, it } from 'vitest';

import {
  formatDurationMinutesSeconds,
  formatSignedDurationMinutesSeconds,
  renderPreparationSummary
} from '../../src/dashboard/multiReportDashboardPreparationSummary';
import type { MultiReportDashboardPreparationSummary } from '../../src/dashboard/multiReportDashboard';

function baseSummary(
  overrides: Partial<MultiReportDashboardPreparationSummary>
): MultiReportDashboardPreparationSummary {
  return {
    mode: 'backfill-unavailable',
    pairsNeedingEvidenceCount: 0,
    preparedPairCount: 0,
    preparedGeneratedReportCount: 0,
    preparedBlockedPairCount: 0,
    preparedFailedPairCount: 0,
    preparedNoGeneratedReportCount: 0,
    preparedMissingRetainedArchiveCount: 0,
    ...overrides
  };
}

describe('formatDurationMinutesSeconds', () => {
  it('formats and ceils to whole seconds, flooring negatives to zero', () => {
    expect(formatDurationMinutesSeconds(0)).toBe('0m 0s');
    expect(formatDurationMinutesSeconds(65)).toBe('1m 5s');
    expect(formatDurationMinutesSeconds(59.1)).toBe('1m 0s');
    expect(formatDurationMinutesSeconds(-5)).toBe('0m 0s');
  });
});

describe('formatSignedDurationMinutesSeconds', () => {
  it('prefixes the sign based on magnitude', () => {
    expect(formatSignedDurationMinutesSeconds(65)).toBe('+1m 5s');
    expect(formatSignedDurationMinutesSeconds(-65)).toBe('-1m 5s');
    expect(formatSignedDurationMinutesSeconds(0)).toBe('+0m 0s');
  });
});

describe('renderPreparationSummary', () => {
  it('describes the retained-evidence-complete mode', () => {
    expect(renderPreparationSummary(baseSummary({ mode: 'retained-evidence-complete' }))).toContain(
      'already had retained comparison evidence'
    );
  });

  it('summarizes a clean backfill with no follow-up guidance', () => {
    const text = renderPreparationSummary(
      baseSummary({
        mode: 'backfilled-before-build',
        preparedPairCount: 2,
        preparedGeneratedReportCount: 2
      })
    );
    expect(text).toContain('2 adjacent pair(s) were refreshed');
    expect(text).toContain('Refresh outcomes: 2 generated reports');
    expect(text).not.toContain('Review the pair ledger');
  });

  it('adds follow-up guidance when backfill has blocked/failed pairs', () => {
    const text = renderPreparationSummary(
      baseSummary({
        mode: 'backfilled-before-build',
        preparedPairCount: 1,
        preparedBlockedPairCount: 1
      })
    );
    expect(text).toContain('1 blocked pair');
    expect(text).toContain('Review the pair ledger or Open compare');
  });

  it('describes the seeded mode with and without remaining evidence gaps', () => {
    expect(
      renderPreparationSummary(
        baseSummary({
          mode: 'seeded-retained-before-build',
          seededImportedPairCount: 3,
          pairsNeedingEvidenceCount: 0
        })
      )
    ).toContain('No additional local pair refresh was needed');
    expect(
      renderPreparationSummary(
        baseSummary({
          mode: 'seeded-retained-before-build',
          seededImportedPairCount: 3,
          pairsNeedingEvidenceCount: 2
        })
      )
    ).toContain('2 adjacent pair(s) remain missing');
  });

  it('describes the backfill-unavailable fallback', () => {
    expect(
      renderPreparationSummary(baseSummary({ mode: 'backfill-unavailable', pairsNeedingEvidenceCount: 4 }))
    ).toContain('4 adjacent pair(s) still lacked retained comparison evidence');
  });
});
