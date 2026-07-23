// Requirement coverage: VHS-REQ-713 (Real Windows Full-Matrix Runtime Validation
// Host) — the cross-run timing-correlation signature (VHS-REQ-713.7). Pure fold of
// per-run signature summaries into a repeatable signature + determinism verdict.
import { describe, expect, it } from 'vitest';

import type { TimingCorrelationSignatureSummary } from '../../src/reporting/mirror/timingCorrelationModel';
import {
  DEFAULT_TIMING_TOLERANCE,
  TIMING_CORRELATION_SIGNATURE_SCHEMA,
  buildTimingCorrelationSignature
} from '../../src/reporting/mirror/timingCorrelationSignature';

function runSummary(overrides: Partial<TimingCorrelationSignatureSummary> = {}): TimingCorrelationSignatureSummary {
  return {
    perfmonSampleCount: 60,
    frameCount: 720,
    wellFormedFrameCount: 720,
    effectiveFps: 12,
    stopwatchClassification: 'authoritative',
    medianFramesPerSecond: 12,
    medianObservedDeltaCs: 100,
    meanObservedDeltaCs: 100,
    meanCpuPct: 31,
    peakCpuPct: 60,
    meanMemAvailMb: 9500,
    meanDiskWriteBytesPerSec: 2_640_000,
    meanDiskTotalPct: 2,
    ...overrides
  };
}

describe('buildTimingCorrelationSignature (VHS-REQ-713.7)', () => {
  it('folds three authoritative runs into a deterministic signature vector + PASS verdict', () => {
    const report = buildTimingCorrelationSignature([
      runSummary({ meanCpuPct: 30.9, meanDiskWriteBytesPerSec: 2_630_000 }),
      runSummary({ meanCpuPct: 30.3, meanDiskWriteBytesPerSec: 2_689_000 }),
      runSummary({ meanCpuPct: 31.9, meanDiskWriteBytesPerSec: 2_599_000 })
    ]);
    expect(report.schema).toBe(TIMING_CORRELATION_SIGNATURE_SCHEMA);
    expect(report.runCount).toBe(3);
    expect(report.verdict.timingDeterministic).toBe(true);
    expect(report.verdict.allAuthoritative).toBe(true);
    expect(report.acrossRuns.effectiveFps.stddev).toBe(0);
    expect(report.acrossRuns.medianObservedDeltaCs.mean).toBe(100);
    expect(report.signatureVector.stopwatchDeltaCsPerSecond).toBe(100);
    expect(report.signatureVector.framesPerSecond).toBe(12);
    expect(report.signatureVector.meanCpuPct).toBeGreaterThan(30);
    expect(report.tolerance).toEqual(DEFAULT_TIMING_TOLERANCE);
  });

  it('fails the determinism verdict when a run is not authoritative (VHS-REQ-713.7)', () => {
    const report = buildTimingCorrelationSignature([
      runSummary(),
      runSummary({ stopwatchClassification: 'advisory' })
    ]);
    expect(report.verdict.allAuthoritative).toBe(false);
    expect(report.verdict.timingDeterministic).toBe(false);
  });

  it('fails when the stopwatch delta drifts outside the 98..102cs band (VHS-REQ-713.7)', () => {
    const report = buildTimingCorrelationSignature([
      runSummary(),
      runSummary({ medianObservedDeltaCs: 108 })
    ]);
    expect(report.verdict.deltaCsInBand).toBe(false);
    expect(report.verdict.timingDeterministic).toBe(false);
  });

  it('fails when effective fps spreads too far across runs (VHS-REQ-713.7)', () => {
    const report = buildTimingCorrelationSignature([
      runSummary({ effectiveFps: 12 }),
      runSummary({ effectiveFps: 11.6 })
    ]);
    expect(report.verdict.effectiveFpsInBand).toBe(true);
    expect(report.verdict.effectiveFpsTight).toBe(false);
    expect(report.verdict.timingDeterministic).toBe(false);
  });

  it('honors custom tolerance bands (VHS-REQ-713.7)', () => {
    const report = buildTimingCorrelationSignature(
      [runSummary({ medianObservedDeltaCs: 108 }), runSummary({ medianObservedDeltaCs: 108 })],
      { ...DEFAULT_TIMING_TOLERANCE, minDeltaCs: 100, maxDeltaCs: 110 }
    );
    expect(report.verdict.deltaCsInBand).toBe(true);
    expect(report.verdict.timingDeterministic).toBe(true);
  });

  it('fails closed on fewer than two runs (VHS-REQ-713.7)', () => {
    expect(() => buildTimingCorrelationSignature([runSummary()])).toThrow(/at least two run summaries/);
    expect(() => buildTimingCorrelationSignature([])).toThrow(/at least two run summaries/);
  });
});
