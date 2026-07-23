// Cross-run timing-correlation signature (VHS-REQ-713.7).
//
// The pure post-processor that folds the per-run signature summaries produced by
// `buildTimingCorrelationModel` (one per captured run) into a single repeatable
// signature + a fail-closed determinism verdict. The timing metrics
// (effective fps, frames per perfmon second, and the on-screen stopwatch delta
// per second) must be tight and consistent across runs for the 12fps-screen <->
// 1Hz-perfmon correlation to be deterministic; the resource metrics (CPU, disk
// write) are folded into the signature vector and reported with their spread but
// are not part of the determinism gate (they vary with system load).
//
// Design (reporting-orchestration guardrails): pure and deterministic, no I/O.

import type { TimingCorrelationSignatureSummary } from './timingCorrelationModel';

export const TIMING_CORRELATION_SIGNATURE_SCHEMA = 'vi-history-suite/timing-correlation-signature@v1';
export const TIMING_CORRELATION_SIGNATURE_SCHEMA_VERSION = 1;

export interface TimingCorrelationToleranceBands {
  /** Inclusive effective-fps band every run must fall within. */
  readonly minEffectiveFps: number;
  readonly maxEffectiveFps: number;
  /** Maximum allowed spread (max - min) of effective fps across runs. */
  readonly maxEffectiveFpsSpread: number;
  /** Inclusive band for the median observed stopwatch delta (centiseconds) per second. */
  readonly minDeltaCs: number;
  readonly maxDeltaCs: number;
  /** Inclusive band for the median frames-per-second. */
  readonly minFramesPerSecond: number;
  readonly maxFramesPerSecond: number;
}

// 12fps capture / 1Hz perfmon: 12 frames per second, 100 centiseconds per second.
export const DEFAULT_TIMING_TOLERANCE: TimingCorrelationToleranceBands = Object.freeze({
  minEffectiveFps: 11.5,
  maxEffectiveFps: 12.5,
  maxEffectiveFpsSpread: 0.3,
  minDeltaCs: 98,
  maxDeltaCs: 102,
  minFramesPerSecond: 11,
  maxFramesPerSecond: 13
});

export interface AcrossRunStat {
  readonly values: readonly number[];
  readonly mean: number | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly stddev: number | null;
  /** Coefficient of variation (stddev / |mean|), or null when mean is 0/absent. */
  readonly cov: number | null;
}

export interface TimingCorrelationSignatureVector {
  readonly effectiveFps: number | null;
  readonly framesPerSecond: number | null;
  readonly stopwatchDeltaCsPerSecond: number | null;
  readonly meanCpuPct: number | null;
  readonly meanDiskWriteBytesPerSec: number | null;
}

export interface TimingCorrelationSignatureReport {
  readonly schema: typeof TIMING_CORRELATION_SIGNATURE_SCHEMA;
  readonly schemaVersion: typeof TIMING_CORRELATION_SIGNATURE_SCHEMA_VERSION;
  readonly runCount: number;
  readonly tolerance: TimingCorrelationToleranceBands;
  readonly acrossRuns: {
    readonly effectiveFps: AcrossRunStat;
    readonly medianFramesPerSecond: AcrossRunStat;
    readonly medianObservedDeltaCs: AcrossRunStat;
    readonly meanCpuPct: AcrossRunStat;
    readonly meanDiskWriteBytesPerSec: AcrossRunStat;
  };
  readonly signatureVector: TimingCorrelationSignatureVector;
  readonly verdict: {
    readonly timingDeterministic: boolean;
    readonly allAuthoritative: boolean;
    readonly effectiveFpsInBand: boolean;
    readonly effectiveFpsTight: boolean;
    readonly deltaCsInBand: boolean;
    readonly framesPerSecondInBand: boolean;
  };
}

function statOf(values: readonly (number | null)[]): AcrossRunStat {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (finite.length === 0) {
    return { values: [], mean: null, min: null, max: null, stddev: null, cov: null };
  }
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const variance = finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / finite.length;
  const stddev = Math.sqrt(variance);
  return {
    values: finite,
    mean,
    min: Math.min(...finite),
    max: Math.max(...finite),
    stddev,
    cov: mean !== 0 ? stddev / Math.abs(mean) : null
  };
}

function inBand(stat: AcrossRunStat, min: number, max: number): boolean {
  return stat.min !== null && stat.max !== null && stat.min >= min && stat.max <= max;
}

/**
 * Fold per-run signature summaries into a cross-run signature report. Fail-closed
 * on fewer than two runs. Pure and deterministic. The determinism verdict gates
 * only the timing metrics (fps / frames-per-second / stopwatch-delta-per-second);
 * resource metrics are folded into the signature vector for comparison.
 */
export function buildTimingCorrelationSignature(
  runs: readonly TimingCorrelationSignatureSummary[],
  tolerance: TimingCorrelationToleranceBands = DEFAULT_TIMING_TOLERANCE
): TimingCorrelationSignatureReport {
  if (!Array.isArray(runs) || runs.length < 2) {
    throw new Error('buildTimingCorrelationSignature requires at least two run summaries.');
  }

  const effectiveFps = statOf(runs.map((run) => run.effectiveFps));
  const medianFramesPerSecond = statOf(runs.map((run) => run.medianFramesPerSecond));
  const medianObservedDeltaCs = statOf(runs.map((run) => run.medianObservedDeltaCs));
  const meanCpuPct = statOf(runs.map((run) => run.meanCpuPct));
  const meanDiskWriteBytesPerSec = statOf(runs.map((run) => run.meanDiskWriteBytesPerSec));

  const allAuthoritative = runs.every((run) => run.stopwatchClassification === 'authoritative');
  const effectiveFpsInBand = inBand(effectiveFps, tolerance.minEffectiveFps, tolerance.maxEffectiveFps);
  const effectiveFpsTight =
    effectiveFps.min !== null &&
    effectiveFps.max !== null &&
    effectiveFps.max - effectiveFps.min <= tolerance.maxEffectiveFpsSpread;
  const deltaCsInBand = inBand(medianObservedDeltaCs, tolerance.minDeltaCs, tolerance.maxDeltaCs);
  const framesPerSecondInBand = inBand(
    medianFramesPerSecond,
    tolerance.minFramesPerSecond,
    tolerance.maxFramesPerSecond
  );
  const timingDeterministic =
    allAuthoritative && effectiveFpsInBand && effectiveFpsTight && deltaCsInBand && framesPerSecondInBand;

  return {
    schema: TIMING_CORRELATION_SIGNATURE_SCHEMA,
    schemaVersion: TIMING_CORRELATION_SIGNATURE_SCHEMA_VERSION,
    runCount: runs.length,
    tolerance,
    acrossRuns: { effectiveFps, medianFramesPerSecond, medianObservedDeltaCs, meanCpuPct, meanDiskWriteBytesPerSec },
    signatureVector: {
      effectiveFps: effectiveFps.mean,
      framesPerSecond: medianFramesPerSecond.mean,
      stopwatchDeltaCsPerSecond: medianObservedDeltaCs.mean,
      meanCpuPct: meanCpuPct.mean,
      meanDiskWriteBytesPerSec: meanDiskWriteBytesPerSec.mean
    },
    verdict: {
      timingDeterministic,
      allAuthoritative,
      effectiveFpsInBand,
      effectiveFpsTight,
      deltaCsInBand,
      framesPerSecondInBand
    }
  };
}
