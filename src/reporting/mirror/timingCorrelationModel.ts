// Deterministic 12fps-screen <-> 1Hz-perfmon timing-correlation model (VHS-REQ-713.7).
//
// The pure, testable core of the Part E timing-correlation capability proven on
// real hardware by `scripts`/the maintainer capture driver: it binds a decoded
// screen-frame series (each frame's mprr stopwatch strip decoded to centiseconds
// = a ground-truth clock, captured at `fps`) to a 1Hz perfmon sample series on a
// per-second grid, so the two independent deterministic samplers of the same
// wall time are correlated. A frame at index j belongs to perfmon second
// `floor(j / fps)` (both start together), giving, per second: how many frames
// landed in it (~fps), the observed on-screen stopwatch reading, and its delta
// from the previous second (~ 100 centiseconds at 12fps). A compact per-run
// signature summary folds the correlation and the paired resource samples so a
// downstream can compare runs (see `timingCorrelationSignature`).
//
// Design (reporting-orchestration guardrails): pure and deterministic, no I/O
// and no capture dependency. Frame decoding, perfmon capture, and stopwatch
// accuracy classification live in the maintainer capture harness; this module
// turns their data into a correlation model + signature.

export const TIMING_CORRELATION_SCHEMA = 'vi-history-suite/timing-correlation@v1';
export const TIMING_CORRELATION_SCHEMA_VERSION = 1;

/** A captured screen frame with its decoded mprr stopwatch reading. */
export interface TimingCorrelationFrame {
  readonly frameIndex: number;
  /** Decoded machine-strip centiseconds, or null when the frame did not decode. */
  readonly decodedCentiseconds: number | null;
  readonly wellFormed: boolean;
}

/** One 1Hz perfmon sample (channels start null when a counter was absent). */
export interface TimingCorrelationPerfmonSample {
  readonly cpuTotalPct: number | null;
  readonly memAvailMb: number | null;
  readonly diskTotalPct: number | null;
  readonly diskWriteBytesPerSec: number | null;
}

export interface BuildTimingCorrelationInput {
  /** Capture frame rate (frames per perfmon second); positive integer. */
  readonly fps: number;
  /** Perfmon sample interval in whole seconds (1 for the 1Hz contract). */
  readonly sampleIntervalSec: number;
  readonly frames: readonly TimingCorrelationFrame[];
  readonly perfmon: readonly TimingCorrelationPerfmonSample[];
  /** Effective fps from the shipped stopwatch-accuracy analyzer (optional passthrough). */
  readonly effectiveFps?: number | null;
  /** Stopwatch capture classification from the analyzer (optional passthrough). */
  readonly stopwatchClassification?: string | null;
}

export interface TimingCorrelationSecond {
  readonly secondIndex: number;
  readonly framesInSecond: number;
  readonly observedStopwatchCs: number | null;
  readonly observedDeltaCs: number | null;
  readonly cpuTotalPct: number | null;
  readonly memAvailMb: number | null;
  readonly diskTotalPct: number | null;
  readonly diskWriteBytesPerSec: number | null;
}

export interface TimingCorrelationSignatureSummary {
  readonly perfmonSampleCount: number;
  readonly frameCount: number;
  readonly wellFormedFrameCount: number;
  readonly effectiveFps: number | null;
  readonly stopwatchClassification: string | null;
  readonly medianFramesPerSecond: number | null;
  readonly medianObservedDeltaCs: number | null;
  readonly meanObservedDeltaCs: number | null;
  readonly meanCpuPct: number | null;
  readonly peakCpuPct: number | null;
  readonly meanMemAvailMb: number | null;
  readonly meanDiskWriteBytesPerSec: number | null;
  readonly meanDiskTotalPct: number | null;
}

export interface TimingCorrelationModel {
  readonly schema: typeof TIMING_CORRELATION_SCHEMA;
  readonly schemaVersion: typeof TIMING_CORRELATION_SCHEMA_VERSION;
  readonly fps: number;
  readonly sampleIntervalSec: number;
  readonly seconds: readonly TimingCorrelationSecond[];
  readonly signature: TimingCorrelationSignatureSummary;
}

function finiteValues(values: readonly (number | null)[]): number[] {
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function median(values: readonly (number | null)[]): number | null {
  const sorted = finiteValues(values).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return null;
  }
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: readonly (number | null)[]): number | null {
  const finite = finiteValues(values);
  if (finite.length === 0) {
    return null;
  }
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function peak(values: readonly (number | null)[]): number | null {
  const finite = finiteValues(values);
  return finite.length === 0 ? null : Math.max(...finite);
}

/**
 * Build the deterministic per-second timing-correlation model. Fail-closed on a
 * non-positive/non-integer fps, a non-positive sample interval, a missing frames
 * array, or an empty perfmon series. Pure and deterministic: identical inputs in,
 * identical model out.
 */
export function buildTimingCorrelationModel(input: BuildTimingCorrelationInput): TimingCorrelationModel {
  if (!Number.isInteger(input.fps) || input.fps <= 0) {
    throw new Error('fps must be a positive integer.');
  }
  if (!Number.isInteger(input.sampleIntervalSec) || input.sampleIntervalSec <= 0) {
    throw new Error('sampleIntervalSec must be a positive integer.');
  }
  if (!Array.isArray(input.frames)) {
    throw new Error('frames must be an array.');
  }
  if (!Array.isArray(input.perfmon) || input.perfmon.length === 0) {
    throw new Error('perfmon must be a non-empty sample array.');
  }

  const { fps, frames, perfmon } = input;
  // Frames captured per perfmon sample = fps x sampleIntervalSec (e.g. 12 frames
  // per 1s sample; 24 per 2s sample). Binding by frame index needs no wall clock.
  const framesPerSample = fps * input.sampleIntervalSec;
  // The first well-formed decoded stopwatch reading at/after a frame index (the
  // observed screen clock at the start of a perfmon sample), bounded to that
  // sample's frame window so a gap never borrows a later sample's reading.
  const firstDecodedAt = (startFrame: number): number | null => {
    const end = Math.min(startFrame + framesPerSample, frames.length);
    for (let j = startFrame; j < end; j += 1) {
      const frame = frames[j];
      if (frame && frame.wellFormed && typeof frame.decodedCentiseconds === 'number') {
        return frame.decodedCentiseconds;
      }
    }
    return null;
  };

  const seconds: TimingCorrelationSecond[] = [];
  let previousObserved: number | null = null;
  for (let secondIndex = 0; secondIndex < perfmon.length; secondIndex += 1) {
    const startFrame = secondIndex * framesPerSample;
    const windowFrames = frames.slice(startFrame, startFrame + framesPerSample);
    const framesInSecond = windowFrames.filter((frame) => frame && frame.wellFormed).length;
    const observedStopwatchCs = firstDecodedAt(startFrame);
    const observedDeltaCs =
      observedStopwatchCs !== null && previousObserved !== null ? observedStopwatchCs - previousObserved : null;
    const sample = perfmon[secondIndex];
    seconds.push({
      secondIndex,
      framesInSecond,
      observedStopwatchCs,
      observedDeltaCs,
      cpuTotalPct: sample.cpuTotalPct ?? null,
      memAvailMb: sample.memAvailMb ?? null,
      diskTotalPct: sample.diskTotalPct ?? null,
      diskWriteBytesPerSec: sample.diskWriteBytesPerSec ?? null
    });
    if (observedStopwatchCs !== null) {
      previousObserved = observedStopwatchCs;
    }
  }

  const signature: TimingCorrelationSignatureSummary = {
    perfmonSampleCount: perfmon.length,
    frameCount: frames.length,
    wellFormedFrameCount: frames.filter((frame) => frame && frame.wellFormed).length,
    effectiveFps: input.effectiveFps ?? null,
    stopwatchClassification: input.stopwatchClassification ?? null,
    medianFramesPerSecond: median(seconds.map((second) => second.framesInSecond)),
    medianObservedDeltaCs: median(seconds.map((second) => second.observedDeltaCs)),
    meanObservedDeltaCs: mean(seconds.map((second) => second.observedDeltaCs)),
    meanCpuPct: mean(perfmon.map((sample) => sample.cpuTotalPct)),
    peakCpuPct: peak(perfmon.map((sample) => sample.cpuTotalPct)),
    meanMemAvailMb: mean(perfmon.map((sample) => sample.memAvailMb)),
    meanDiskWriteBytesPerSec: mean(perfmon.map((sample) => sample.diskWriteBytesPerSec)),
    meanDiskTotalPct: mean(perfmon.map((sample) => sample.diskTotalPct))
  };

  return {
    schema: TIMING_CORRELATION_SCHEMA,
    schemaVersion: TIMING_CORRELATION_SCHEMA_VERSION,
    fps,
    sampleIntervalSec: input.sampleIntervalSec,
    seconds,
    signature
  };
}
