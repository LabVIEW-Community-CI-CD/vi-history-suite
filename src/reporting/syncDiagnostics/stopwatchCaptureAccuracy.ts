/**
 * Stopwatch capture-accuracy analyzer (VHS-REQ-710 diagnostics family).
 *
 * The true value of printing the mprr stopwatch and capturing it is being able to
 * post-process the frames and MEASURE how accurately the recovered time tracks
 * real time at a given capture cadence (the governed 12 fps). Given a sequence of
 * captured frames — each with its capture timestamp and the centiseconds decoded
 * from its machine strip (see mprrStripImageDecoder) — this computes the effective
 * frame rate, inter-frame interval jitter, dropped/duplicate frame estimates, and
 * the recovered-time error, and classifies the run. The limiting accuracy is the
 * frame interval itself (~83 ms at 12 fps), which is coarser than the stopwatch's
 * 10 ms centisecond resolution, so authority is judged against one frame interval.
 *
 * Pure and deterministic: observations in, one accuracy report out. Fails closed
 * on an empty set.
 */

export const STOPWATCH_CAPTURE_ACCURACY_SCHEMA = 'vi-history-suite/stopwatch-capture-accuracy@v1';
export const STOPWATCH_CAPTURE_ACCURACY_SCHEMA_VERSION = 1;

export interface StopwatchFrameObservation {
  readonly frameIndex: number;
  readonly captureEpochMs: number;
  /** Centiseconds decoded from the frame's machine strip, or null when unreadable. */
  readonly decodedCentiseconds: number | null;
}

export type StopwatchAccuracyClassification = 'authoritative' | 'advisory' | 'insufficient';

export interface StopwatchCaptureAccuracy {
  readonly schema: typeof STOPWATCH_CAPTURE_ACCURACY_SCHEMA;
  readonly schemaVersion: typeof STOPWATCH_CAPTURE_ACCURACY_SCHEMA_VERSION;
  readonly nominalFps: number;
  readonly frameCount: number;
  readonly readableFrameCount: number;
  readonly expectedIntervalMs: number;
  readonly effectiveFps: number | null;
  readonly intervalMsMean: number | null;
  readonly intervalMsMin: number | null;
  readonly intervalMsMax: number | null;
  readonly intervalMsStdDev: number | null;
  readonly droppedFrameEstimate: number;
  readonly duplicateFrameEstimate: number;
  readonly stopwatchMaxAbsErrorMs: number | null;
  readonly stopwatchMeanAbsErrorMs: number | null;
  readonly toleranceMs: number;
  readonly classification: StopwatchAccuracyClassification;
  readonly summary: string;
}

export interface AnalyzeStopwatchCaptureAccuracyInput {
  readonly nominalFps: number;
  readonly frames: readonly StopwatchFrameObservation[];
  /** Max recovered-time error for authority; defaults to 1.5 frame intervals. */
  readonly toleranceMs?: number;
  /** Minimum capture duration for authority; defaults to 2 * nominalFps seconds. */
  readonly minDurationMs?: number;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Analyze stopwatch capture accuracy. Deterministic; fails closed on an empty
 * frame set or a non-positive nominal frame rate.
 */
export function analyzeStopwatchCaptureAccuracy(input: AnalyzeStopwatchCaptureAccuracyInput): StopwatchCaptureAccuracy {
  if (!Number.isFinite(input.nominalFps) || input.nominalFps <= 0) {
    throw new Error('nominalFps must be a positive number.');
  }
  if (!Array.isArray(input.frames) || input.frames.length === 0) {
    throw new Error('analyzeStopwatchCaptureAccuracy requires at least one frame.');
  }

  const expectedIntervalMs = 1000 / input.nominalFps;
  const toleranceMs = input.toleranceMs ?? expectedIntervalMs * 1.5;
  const minDurationMs = input.minDurationMs ?? input.nominalFps * 2 * 1000;

  const ordered = [...input.frames].sort((a, b) => a.captureEpochMs - b.captureEpochMs);
  const frameCount = ordered.length;

  const intervals: number[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    intervals.push(ordered[i].captureEpochMs - ordered[i - 1].captureEpochMs);
  }
  const durationMs = frameCount > 1 ? ordered[frameCount - 1].captureEpochMs - ordered[0].captureEpochMs : 0;
  const effectiveFps = durationMs > 0 ? round(((frameCount - 1) * 1000) / durationMs) : null;
  const intervalMsMean = intervals.length > 0 ? round(mean(intervals)) : null;
  const intervalMsMin = intervals.length > 0 ? Math.min(...intervals) : null;
  const intervalMsMax = intervals.length > 0 ? Math.max(...intervals) : null;
  const intervalMsStdDev =
    intervals.length > 0 ? round(Math.sqrt(mean(intervals.map((v) => (v - mean(intervals)) ** 2)))) : null;

  const readable = ordered.filter(
    (frame) => frame.decodedCentiseconds !== null && Number.isFinite(frame.decodedCentiseconds)
  );
  const readableFrameCount = readable.length;

  // Dropped/duplicate estimates + recovered-time error over readable frames.
  let droppedFrameEstimate = 0;
  let duplicateFrameEstimate = 0;
  const absErrors: number[] = [];
  if (readableFrameCount >= 2) {
    const baseCs = readable[0].decodedCentiseconds as number;
    const baseMs = readable[0].captureEpochMs;
    for (let i = 0; i < readable.length; i += 1) {
      const recoveredElapsedMs = ((readable[i].decodedCentiseconds as number) - baseCs) * 10;
      const captureElapsedMs = readable[i].captureEpochMs - baseMs;
      absErrors.push(Math.abs(recoveredElapsedMs - captureElapsedMs));
      if (i > 0) {
        const csDelta = (readable[i].decodedCentiseconds as number) - (readable[i - 1].decodedCentiseconds as number);
        const captureGapMs = readable[i].captureEpochMs - readable[i - 1].captureEpochMs;
        const intervalsSpanned = captureGapMs / expectedIntervalMs;
        if (intervalsSpanned > 1.5) {
          droppedFrameEstimate += Math.round(intervalsSpanned) - 1;
        }
        if (csDelta === 0) {
          duplicateFrameEstimate += 1;
        }
      }
    }
  }
  const stopwatchMaxAbsErrorMs = absErrors.length > 0 ? round(Math.max(...absErrors)) : null;
  const stopwatchMeanAbsErrorMs = absErrors.length > 0 ? round(mean(absErrors)) : null;

  let classification: StopwatchAccuracyClassification;
  if (readableFrameCount < 2 || durationMs < minDurationMs) {
    classification = 'insufficient';
  } else if (stopwatchMaxAbsErrorMs !== null && stopwatchMaxAbsErrorMs <= toleranceMs) {
    classification = 'authoritative';
  } else {
    classification = 'advisory';
  }

  const summary =
    `stopwatch ${classification}: ${readableFrameCount}/${frameCount} readable, ` +
    `effective ${effectiveFps ?? 'n/a'} fps (nominal ${input.nominalFps}), ` +
    `jitter ${intervalMsStdDev ?? 'n/a'}ms, ` +
    `max err ${stopwatchMaxAbsErrorMs ?? 'n/a'}ms/${round(toleranceMs)}ms, ` +
    `dropped ~${droppedFrameEstimate}, duplicate ~${duplicateFrameEstimate}`;

  return {
    schema: STOPWATCH_CAPTURE_ACCURACY_SCHEMA,
    schemaVersion: STOPWATCH_CAPTURE_ACCURACY_SCHEMA_VERSION,
    nominalFps: input.nominalFps,
    frameCount,
    readableFrameCount,
    expectedIntervalMs: round(expectedIntervalMs),
    effectiveFps,
    intervalMsMean,
    intervalMsMin,
    intervalMsMax,
    intervalMsStdDev,
    droppedFrameEstimate,
    duplicateFrameEstimate,
    stopwatchMaxAbsErrorMs,
    stopwatchMeanAbsErrorMs,
    toleranceMs: round(toleranceMs),
    classification,
    summary
  };
}
