// Post-verification: correlate LabVIEW-log timestamps to replay-frame indexes
// (VHS-REQ-718, epic #2344). Consumes a TDMS-shaped model that holds the
// LabVIEW-log instants AND the deterministic-frame-rate replay stream (the mprr
// 12-fps default; 18 fps sharpens localization at ~1.5x frame cost) and computes
// the performance counters that place each LabVIEW launch marker in a frame:
// process-start / execution-ready frame index, the launch span in frames, the
// launch dead-time in ms, and the sub-frame quantization residual.
//
// All times are EPOCH MS (the UTC/local reconciliation is done once at injection
// by perfmonLabviewCorrelation, not here), so this is pure integer/float math.
// The frame-index rule is identical to perfmonMprrSync.resolveFrameIndex so a
// LabVIEW event lands in the same frame a perfmon peak would: floor of (elapsed
// since frame zero / frame interval), unmapped (null) before frame zero or
// beyond the captured frame window (never clamped to an unrelated frame).

import { MPRR_DEFAULT_FRAME_RATE_HZ } from './perfmonMprrSync';

export const LABVIEW_FRAME_CORRELATION_SCHEMA = 'vi-history-suite/labview-frame-correlation@v1';
export const LABVIEW_FRAME_CORRELATION_SCHEMA_VERSION = 1;

/** The replay frame stream the TDMS holds alongside the LabVIEW-log instants. */
export interface FrameStreamReference {
  /** Frames-per-second of the deterministic replay stream (default 12). */
  readonly frameRateHz?: number;
  /** Number of captured frames; bounds the highest mappable index (0 => unbounded). */
  readonly frameCount?: number;
  /** Epoch ms of frame 0 (the replay stream's first frame). */
  readonly epochMsAtFrameZero: number;
}

/** The LabVIEW launch instants (epoch ms) the TDMS holds. */
export interface LabviewFrameInstants {
  readonly processStartEpochMs: number;
  readonly executionReadyEpochMs?: number | null;
}

export interface PostVerifyLabviewFrameCorrelationInput {
  readonly frame: FrameStreamReference;
  readonly labview: LabviewFrameInstants;
}

export interface LabviewFrameCorrelation {
  readonly schema: typeof LABVIEW_FRAME_CORRELATION_SCHEMA;
  readonly schemaVersion: typeof LABVIEW_FRAME_CORRELATION_SCHEMA_VERSION;
  readonly frameRateHz: number;
  readonly frameIntervalMs: number;
  readonly frameCount: number | null;
  readonly processStartFrameIndex: number | null;
  readonly executionReadyFrameIndex: number | null;
  readonly processStartQuantizationErrorMs: number | null;
  readonly executionReadyQuantizationErrorMs: number | null;
  readonly launchSpanFrames: number | null;
  readonly launchDeadTimeMs: number | null;
  readonly processStartWithinFrameWindow: boolean;
  readonly executionReadyWithinFrameWindow: boolean | null;
}

interface FrameResolution {
  readonly frameIndex: number | null;
  readonly elapsedSinceFrameZeroMs: number;
  readonly quantizationErrorMs: number | null;
}

/** Resolve an epoch-ms instant to a frame index, or null when it falls before
 *  frame zero or beyond the captured window (never clamped). */
export function frameIndexOf(
  epochMs: number,
  epochMsAtFrameZero: number,
  frameIntervalMs: number,
  maxFrameIndex: number | null
): FrameResolution {
  const elapsed = epochMs - epochMsAtFrameZero;
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    return { frameIndex: null, elapsedSinceFrameZeroMs: elapsed, quantizationErrorMs: null };
  }
  const raw = Math.floor(elapsed / frameIntervalMs);
  if (maxFrameIndex !== null && raw > maxFrameIndex) {
    return { frameIndex: null, elapsedSinceFrameZeroMs: elapsed, quantizationErrorMs: null };
  }
  return {
    frameIndex: raw,
    elapsedSinceFrameZeroMs: elapsed,
    quantizationErrorMs: elapsed - raw * frameIntervalMs
  };
}

/**
 * VHS-REQ-718.2: consume the TDMS-shaped frame stream + LabVIEW instants and
 * compute the frame-index performance counters. Pure + deterministic;
 * fail-closed on a non-positive frame rate, a non-finite frame-zero, or a
 * missing process-start instant.
 */
export function postVerifyLabviewFrameCorrelation(
  input: PostVerifyLabviewFrameCorrelationInput
): LabviewFrameCorrelation {
  const frameRateHz = input.frame.frameRateHz ?? MPRR_DEFAULT_FRAME_RATE_HZ;
  if (!Number.isFinite(frameRateHz) || frameRateHz <= 0) {
    throw new Error('postVerifyLabviewFrameCorrelation: frameRateHz must be a positive number.');
  }
  if (!Number.isFinite(input.frame.epochMsAtFrameZero)) {
    throw new Error('postVerifyLabviewFrameCorrelation: epochMsAtFrameZero must be a finite epoch in ms.');
  }
  if (!input.labview || !Number.isFinite(input.labview.processStartEpochMs)) {
    throw new Error('postVerifyLabviewFrameCorrelation: labview.processStartEpochMs must be a finite epoch in ms.');
  }
  const frameIntervalMs = 1000 / frameRateHz;
  const frameCount = input.frame.frameCount;
  const maxFrameIndex =
    typeof frameCount === 'number' && frameCount > 0 ? frameCount - 1 : null;

  const processStart = frameIndexOf(
    input.labview.processStartEpochMs,
    input.frame.epochMsAtFrameZero,
    frameIntervalMs,
    maxFrameIndex
  );
  const hasExecReady =
    input.labview.executionReadyEpochMs != null && Number.isFinite(input.labview.executionReadyEpochMs);
  const executionReady = hasExecReady
    ? frameIndexOf(
        input.labview.executionReadyEpochMs as number,
        input.frame.epochMsAtFrameZero,
        frameIntervalMs,
        maxFrameIndex
      )
    : null;

  const launchSpanFrames =
    executionReady && executionReady.frameIndex !== null && processStart.frameIndex !== null
      ? executionReady.frameIndex - processStart.frameIndex
      : null;
  const launchDeadTimeMs = hasExecReady
    ? (input.labview.executionReadyEpochMs as number) - input.labview.processStartEpochMs
    : null;

  return {
    schema: LABVIEW_FRAME_CORRELATION_SCHEMA,
    schemaVersion: LABVIEW_FRAME_CORRELATION_SCHEMA_VERSION,
    frameRateHz,
    frameIntervalMs,
    frameCount: typeof frameCount === 'number' && frameCount > 0 ? frameCount : null,
    processStartFrameIndex: processStart.frameIndex,
    executionReadyFrameIndex: executionReady ? executionReady.frameIndex : null,
    processStartQuantizationErrorMs: processStart.quantizationErrorMs,
    executionReadyQuantizationErrorMs: executionReady ? executionReady.quantizationErrorMs : null,
    launchSpanFrames,
    launchDeadTimeMs,
    processStartWithinFrameWindow: processStart.frameIndex !== null,
    executionReadyWithinFrameWindow: executionReady ? executionReady.frameIndex !== null : null
  };
}
