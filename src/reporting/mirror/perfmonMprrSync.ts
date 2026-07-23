// Perfmon <-> mprr fiducial synchronization (VHS-REQ-707).
//
// The capstone of the dual-source perfmon foundation: it correlates a captured
// perfmon trace (from either mirror actor) with an mprr fiducial/stopwatch record
// so a resource event can be located in the deterministic-frame-rate replay video
// exactly. For each perfmon sample it derives the mprr frame index, the printed
// stopwatch reading, and the BIT-EXACT 40-bit machine strip mprr renders on that
// frame — so a downstream can match the perfmon-derived strip against the strip
// decoded from the real fiducial frame at that instant.
//
// CALIBRATION IS THE PRIORITY: spatial calibration is the prerequisite for trust,
// so the synchronization is authoritative only when the supplied calibration
// verdict is calibrated. The stopwatch encoding is reproduced verbatim from the
// authoritative mprr stopwatch surface (preamble + 24-bit centiseconds + XOR
// checksum), and the timing authority is mprr's 100ns monotonic base.
//
// Design (reporting-orchestration guardrails): pure and deterministic, no I/O.

import { STOPWATCH_PREAMBLE } from '../syncDiagnostics/syncPatternFailureSignature';
import type { MprrCalibrationResult } from '../syncDiagnostics/mprrCalibrationSurface';
import {
  FIRST_RUN_PERFMON_ARTIFACT_SCHEMA,
  type FirstRunPerfmonArtifact,
  type PerfmonActorSource
} from './perfmonSampleSeries';

export const PERFMON_MPRR_SYNC_SCHEMA = 'vi-history-suite/perfmon-mprr-sync@v1';
export const PERFMON_MPRR_SYNC_SCHEMA_VERSION = 1;

/** mprr's default full-screen live-capture frame rate (was 18; 12 fits the bounded-resource envelope). */
export const MPRR_DEFAULT_FRAME_RATE_HZ = 12;
/** mprr timing authority tick resolution: 100 nanoseconds (monotonic). */
export const MPRR_TICK_RESOLUTION_NS = 100;
export const MPRR_TIMING_AUTHORITY_ID = 'mprr-self-test-synthetic-monotonic-100ns';
/** 2^24 - 1: the largest centiseconds value the 24-bit strip payload can carry. */
export const MPRR_MAX_STRIP_CENTISECONDS = 16_777_215;

const TICKS_PER_MS = 10_000; // 1 ms / 100 ns

/**
 * Reproduce mprr's stopwatch machine strip verbatim: `10100101` preamble, a
 * 24-bit centiseconds payload, and an 8-bit XOR checksum of the payload bytes.
 */
export function encodeMprrMachineStrip(centiseconds: number): string {
  const bounded = Math.max(0, Math.min(MPRR_MAX_STRIP_CENTISECONDS, Math.floor(centiseconds)));
  const payloadBits = bounded.toString(2).padStart(24, '0');
  const highByte = (bounded >> 16) & 0xff;
  const middleByte = (bounded >> 8) & 0xff;
  const lowByte = bounded & 0xff;
  const checksum = highByte ^ middleByte ^ lowByte;
  const checksumBits = checksum.toString(2).padStart(8, '0');
  return `${STOPWATCH_PREAMBLE}${payloadBits}${checksumBits}`;
}

/** Format elapsed milliseconds as mprr's printed `HH:MM:SS.cc` stopwatch text. */
export function formatMprrStopwatchText(elapsedMs: number): string {
  const totalMs = Math.max(0, Math.floor(elapsedMs));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1_000);
  const centiseconds = Math.floor((totalMs % 1_000) / 10);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(centiseconds)}`;
}

export interface MprrFrameReference {
  /** Epoch ms (in the perfmon capture clock) when mprr frame zero / stopwatch start occurred. */
  readonly epochMsAtFrameZero: number;
  /** mprr capture frame rate; defaults to 12 fps. */
  readonly frameRateHz?: number;
  /** Total frames mprr captured; clamps the frame index upper bound when known. */
  readonly frameCount?: number;
  /** Timing authority id; defaults to the mprr monotonic-100ns authority. */
  readonly timingAuthorityId?: string;
}

export interface PerfmonMprrSyncSample {
  readonly sampleIndex: number;
  readonly elapsedMs: number;
  readonly epochMs: number;
  /** 100ns ticks since frame zero (mprr timing-authority base); may be negative before frame zero. */
  readonly authorityTicks: number;
  /** The mprr frame this sample maps to, or null when it falls outside the captured frame window. */
  readonly frameIndex: number | null;
  readonly stopwatchCentiseconds: number;
  readonly stopwatchText: string;
  /** The 40-bit machine strip mprr renders on that frame (bit-exact). */
  readonly machineStripBits: string;
}

export interface PerfmonMprrSyncPeak {
  readonly series: string;
  readonly value: number;
  readonly sampleIndex: number;
  readonly frameIndex: number | null;
  readonly stopwatchCentiseconds: number;
}

export interface PerfmonMprrSync {
  readonly schema: typeof PERFMON_MPRR_SYNC_SCHEMA;
  readonly schemaVersion: typeof PERFMON_MPRR_SYNC_SCHEMA_VERSION;
  readonly source: PerfmonActorSource;
  readonly actor: string;
  readonly timingAuthorityId: string;
  readonly tickResolutionNs: number;
  readonly frameRateHz: number;
  readonly frameIntervalMs: number;
  readonly epochMsAtFrameZero: number;
  readonly captureEpochMs: number;
  /** The spatial calibration verdict (the prerequisite for trust). */
  readonly calibrated: boolean;
  /** True only when the capture is calibrated; a synchronization is trusted only then. */
  readonly authoritative: boolean;
  /** True when every sample maps to a frame inside the captured frame window (no unmapped samples). */
  readonly allSamplesWithinFrameWindow: boolean;
  readonly samples: readonly PerfmonMprrSyncSample[];
  readonly peaks: readonly PerfmonMprrSyncPeak[];
}

export interface BuildPerfmonMprrSyncInput {
  readonly artifact: FirstRunPerfmonArtifact;
  readonly frame: MprrFrameReference;
  /** The mprr calibration verdict for this capture; synchronization is gated on it. */
  readonly calibration: MprrCalibrationResult;
}

interface PeakSpec {
  readonly series: string;
  readonly value: number | null | undefined;
  readonly data: readonly (number | null)[] | undefined;
}

/**
 * Correlate a perfmon artifact with an mprr fiducial/stopwatch reference. Fail
 * closed on a non-artifact, an unparsable capture time, a non-positive frame
 * rate, or a missing calibration verdict. Pure and deterministic.
 */
export function buildPerfmonMprrSync(input: BuildPerfmonMprrSyncInput): PerfmonMprrSync {
  const { artifact, frame, calibration } = input;
  if (!artifact || artifact.schema !== FIRST_RUN_PERFMON_ARTIFACT_SCHEMA) {
    throw new Error('buildPerfmonMprrSync requires a first-run-perfmon@v1 artifact.');
  }
  if (!calibration || typeof calibration.calibrated !== 'boolean') {
    throw new Error('buildPerfmonMprrSync requires an mprr calibration verdict.');
  }
  if (!frame || !Number.isFinite(frame.epochMsAtFrameZero)) {
    throw new Error('frame.epochMsAtFrameZero must be a finite epoch in milliseconds.');
  }
  const frameRateHz = frame.frameRateHz ?? MPRR_DEFAULT_FRAME_RATE_HZ;
  if (!Number.isFinite(frameRateHz) || frameRateHz <= 0) {
    throw new Error('frameRateHz must be a positive number.');
  }
  const captureEpochMs = Date.parse(artifact.capturedAtIso);
  if (!Number.isFinite(captureEpochMs)) {
    throw new Error('artifact.capturedAtIso must be a parsable ISO timestamp.');
  }

  const frameIntervalMs = 1000 / frameRateHz;
  const maxFrameIndex = typeof frame.frameCount === 'number' && frame.frameCount > 0 ? frame.frameCount - 1 : null;
  const perf = artifact.perf;

  const resolveFrameIndex = (elapsedSinceFrameZero: number): number | null => {
    // A sample before frame zero or beyond the known captured frame window is
    // unmapped (null) rather than clamped to an unrelated frame, so a resource
    // peak is never reported in a frame whose strip encodes a different time.
    if (elapsedSinceFrameZero < 0) {
      return null;
    }
    const raw = Math.floor(elapsedSinceFrameZero / frameIntervalMs);
    if (maxFrameIndex !== null && raw > maxFrameIndex) {
      return null;
    }
    return raw;
  };

  const samples: PerfmonMprrSyncSample[] = perf.t.map((elapsedMs, sampleIndex) => {
    const epochMs = captureEpochMs + elapsedMs;
    const elapsedSinceFrameZero = epochMs - frame.epochMsAtFrameZero;
    const clampedElapsed = Math.max(0, elapsedSinceFrameZero);
    const stopwatchCentiseconds = Math.floor(clampedElapsed / 10);
    return {
      sampleIndex,
      elapsedMs,
      epochMs,
      authorityTicks: Math.round(elapsedSinceFrameZero * TICKS_PER_MS),
      frameIndex: resolveFrameIndex(elapsedSinceFrameZero),
      stopwatchCentiseconds,
      stopwatchText: formatMprrStopwatchText(clampedElapsed),
      machineStripBits: encodeMprrMachineStrip(stopwatchCentiseconds)
    };
  });

  const peakSpecs: PeakSpec[] = [
    { series: 'cpuTotalPct', value: perf.peaks.cpuTotalPct, data: perf.series.cpuTotalPct },
    { series: 'memAvailMb', value: perf.peaks.memAvailMb, data: perf.series.memAvailMb },
    { series: 'diskTotalPct', value: perf.peaks.diskTotalPct, data: perf.series.diskTotalPct },
    { series: 'labviewCpuPct', value: perf.peaks.labviewCpuPct, data: perf.series.labviewCpuPct },
    { series: 'labviewWorkingSetMb', value: perf.peaks.labviewWorkingSetMb, data: perf.series.labviewWorkingSetMb }
  ];

  const peaks: PerfmonMprrSyncPeak[] = [];
  for (const spec of peakSpecs) {
    if (typeof spec.value !== 'number' || !spec.data) {
      continue;
    }
    const sampleIndex = spec.data.findIndex((value) => value === spec.value);
    if (sampleIndex < 0 || sampleIndex >= samples.length) {
      continue;
    }
    const sample = samples[sampleIndex];
    peaks.push({
      series: spec.series,
      value: spec.value,
      sampleIndex,
      frameIndex: sample.frameIndex,
      stopwatchCentiseconds: sample.stopwatchCentiseconds
    });
  }

  return {
    schema: PERFMON_MPRR_SYNC_SCHEMA,
    schemaVersion: PERFMON_MPRR_SYNC_SCHEMA_VERSION,
    source: artifact.source,
    actor: artifact.actor,
    timingAuthorityId: frame.timingAuthorityId ?? MPRR_TIMING_AUTHORITY_ID,
    tickResolutionNs: MPRR_TICK_RESOLUTION_NS,
    frameRateHz,
    frameIntervalMs,
    epochMsAtFrameZero: frame.epochMsAtFrameZero,
    captureEpochMs,
    calibrated: calibration.calibrated,
    authoritative: calibration.calibrated,
    allSamplesWithinFrameWindow: samples.every((sample) => sample.frameIndex !== null),
    samples,
    peaks
  };
}

/**
 * Render a deterministic, human-readable summary correlating each series peak to
 * its mprr frame and printed stopwatch reading.
 */
export function renderPerfmonMprrSyncSummary(sync: PerfmonMprrSync): string {
  const verdict = sync.authoritative ? 'AUTHORITATIVE' : 'UNCALIBRATED (advisory)';
  const mappedFrames = sync.samples
    .map((sample) => sample.frameIndex)
    .filter((index): index is number => index !== null);
  const frameSpan =
    mappedFrames.length > 0
      ? `${mappedFrames.reduce((a, b) => Math.min(a, b))}..${mappedFrames.reduce((a, b) => Math.max(a, b))}`
      : 'unmapped';
  const lines = [
    `perfmon<->mprr sync ${verdict} — ${sync.source} (${sync.actor})`,
    `- timing authority: ${sync.timingAuthorityId} @ ${sync.tickResolutionNs}ns`,
    `- frame rate: ${sync.frameRateHz} Hz (~${Math.round(sync.frameIntervalMs * 100) / 100}ms/frame)`,
    `- ${sync.samples.length} samples spanning frames ${frameSpan}`
  ];
  for (const peak of sync.peaks) {
    lines.push(
      `- peak ${peak.series} ${peak.value} at frame ${peak.frameIndex ?? 'unmapped'} (stopwatch ${formatMprrStopwatchText(peak.stopwatchCentiseconds * 10)})`
    );
  }
  return lines.join('\n');
}
