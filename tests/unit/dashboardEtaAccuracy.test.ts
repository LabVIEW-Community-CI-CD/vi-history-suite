import { describe, expect, it } from 'vitest';

import {
  buildDashboardPairEtaAccuracyRecord,
  buildDashboardPairProgressPrefix,
  buildPairEtaAccuracySample,
  deriveEstimatedPairSeconds,
  deriveEstimatedSecondsRemaining,
  formatEstimatedDuration
} from '../../src/dashboard/dashboardEtaAccuracy';

describe('dashboardEtaAccuracy', () => {
  it('derives pair-level estimates and remaining duration only from completed pairs', () => {
    expect(deriveEstimatedPairSeconds([])).toBeUndefined();
    expect(deriveEstimatedSecondsRemaining([], 2)).toBeUndefined();
    expect(deriveEstimatedPairSeconds([12_000, 18_000])).toBe(15);
    expect(deriveEstimatedSecondsRemaining([12_000, 18_000], 3)).toBe(45);
    expect(formatEstimatedDuration(75)).toBe('1m 15s');
    expect(
      buildDashboardPairProgressPrefix(1, 4, [12_000, 18_000])
    ).toContain('Preparing dashboard pair 2/4; est. 0m 45s left');
  });

  it('retains pair-level ETA samples and summary metrics', () => {
    const sample = buildPairEtaAccuracySample(1, 4, 15, 21_000, () =>
      Date.parse('2026-04-03T00:00:21.000Z')
    );
    expect(sample).toEqual({
      pairOrdinal: 2,
      pairCount: 4,
      estimatedPairSeconds: 15,
      actualPairSeconds: 21,
      absoluteErrorSeconds: 6,
      signedErrorSeconds: 6,
      sampledAt: '2026-04-03T00:00:21.000Z'
    });

    const record = buildDashboardPairEtaAccuracyRecord(
      3,
      3,
      [
        sample,
        buildPairEtaAccuracySample(2, 4, 20, 16_000, () =>
          Date.parse('2026-04-03T00:00:37.000Z')
        )
      ],
      () => Date.parse('2026-04-03T00:00:37.000Z')
    );

    expect(record).toMatchObject({
      recordedAt: '2026-04-03T00:00:37.000Z',
      stage: 'pair-preparation',
      preparedPairCount: 3,
      etaEligiblePairCount: 3,
      measuredPairCount: 2,
      unmeasuredPairCount: 1,
      excludedPairCount: 0,
      meanAbsoluteErrorSeconds: 5,
      maxAbsoluteErrorSeconds: 6,
      meanSignedErrorSeconds: 1,
      meanAbsolutePercentageError: 26.786
    });
  });

  it('retains a not-yet-measurable record when pairs were prepared but none had an estimate yet', () => {
    const record = buildDashboardPairEtaAccuracyRecord(1, 1, [], () =>
      Date.parse('2026-04-03T00:00:00.000Z')
    );

    expect(record).toEqual({
      recordedAt: '2026-04-03T00:00:00.000Z',
      stage: 'pair-preparation',
      preparedPairCount: 1,
      etaEligiblePairCount: 1,
      measuredPairCount: 0,
      unmeasuredPairCount: 1,
      excludedPairCount: 0,
      meanAbsoluteErrorSeconds: undefined,
      maxAbsoluteErrorSeconds: undefined,
      meanSignedErrorSeconds: undefined,
      meanAbsolutePercentageError: undefined,
      samples: []
    });
  });

  it('retains excluded prepared pairs outside the eta-eligible sample set', () => {
    const record = buildDashboardPairEtaAccuracyRecord(
      4,
      2,
      [
        buildPairEtaAccuracySample(3, 4, 15, 18_000, () =>
          Date.parse('2026-04-03T00:00:18.000Z')
        )
      ],
      () => Date.parse('2026-04-03T00:00:18.000Z')
    );

    expect(record).toMatchObject({
      preparedPairCount: 4,
      etaEligiblePairCount: 2,
      measuredPairCount: 1,
      unmeasuredPairCount: 1,
      excludedPairCount: 2
    });
  });
});
