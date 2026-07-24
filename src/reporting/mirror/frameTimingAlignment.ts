// Frame ⇄ perfmon ⇄ pipeline-state timing alignment (VHS-REQ-707, #2324).
//
// The complement of `perfmonMprrSync` (which projects each perfmon sample onto
// the mprr replay clock): this module lays a benchmark run's perfmon series onto
// the DETERMINISTICALLY RECORDED VIDEO FRAMES and splits both across the single-
// pass comparison pipeline states, using mprr's deterministic stopwatch schema.
//
// Every recorded frame carries mprr's 40-bit machine strip
// (`[8-bit preamble 10100101][24-bit centiseconds][8-bit XOR checksum]`,
// centiseconds = floor(elapsedMs/10)), so each frame is a machine-decodable
// timestamp on the stopwatch clock. A single shared-wall-clock `epochOffsetMs`
// maps that stopwatch time onto the perfmon/state clock; each frame then binds to
// the NEAREST perfmon sample and to the pipeline state whose `[startMs, endMs)`
// window contains it. The output is a per-frame perf/state table plus a per-state
// rollup.
//
// Design (reporting-orchestration guardrails): pure and deterministic, no I/O.
// Fail-closed at the input boundary (bad shapes throw); fail-closed on the DATA
// (an undecodable frame strip or a missing perfmon sample yields explicit `null`,
// never a fabricated value). Consumes the frozen mprr stopwatch schema via
// `decodeMachineStrip`; no schema change here.

import { decodeMachineStrip } from '../syncDiagnostics/syncPatternFailureSignature';

export const FRAME_TIMING_ALIGNMENT_SCHEMA = 'vi-history-suite/frame-timing-alignment@v1';
export const FRAME_TIMING_ALIGNMENT_SCHEMA_VERSION = 1;

/** Centiseconds are 10 ms per the mprr stopwatch encoding. */
const CENTISECOND_MS = 10;

/**
 * Decode a 40-bit mprr machine-strip bit string to its centiseconds payload, or
 * `null` when the strip is not a fully valid stopwatch reading (bad shape, bad
 * preamble, or bad checksum). A thin fail-closed wrapper over `decodeMachineStrip`
 * — `wellFormed` there means only "40 clean bits", so this additionally requires
 * the preamble and checksum to verify before trusting the payload.
 */
export function decodeStopwatchBitStrip(stripBits: unknown): number | null {
  const decoded = decodeMachineStrip(stripBits);
  if (!decoded.wellFormed || !decoded.preambleOk || !decoded.checksumOk) {
    return null;
  }
  return decoded.centiseconds;
}

/** A single deterministically recorded frame carrying its mprr machine strip. */
export interface AlignmentFrameInput {
  /** Zero-based recorded-frame index. */
  readonly frameIndex: number;
  /** The 40-bit machine-strip string read from the recorded frame. */
  readonly stripBits: string;
}

/** A pipeline-state window on the perfmon/state wall clock (endMs exclusive). */
export interface AlignmentStateWindow {
  readonly state: string;
  readonly startMs: number;
  readonly endMs: number;
}

/**
 * The perfmon series to bind against — the `perfmon-sample-series@v1` columns
 * plus its elapsed sample times. Only the plot-ready series are consumed; the
 * optional LabVIEW-process series are absent when no LabVIEW process was sampled.
 */
export interface AlignmentPerfInput {
  /** Elapsed milliseconds from the first sample (parallel to every series). */
  readonly t: readonly number[];
  readonly cpuTotalPct: readonly (number | null)[];
  readonly memAvailMb: readonly (number | null)[];
  readonly labviewCpuPct?: readonly (number | null)[];
  readonly labviewWorkingSetMb?: readonly (number | null)[];
}

export interface AlignFramesToPerfInput {
  readonly frames: readonly AlignmentFrameInput[];
  readonly perf: AlignmentPerfInput;
  readonly states: readonly AlignmentStateWindow[];
  /**
   * Milliseconds added to a frame's stopwatch time to reach the perfmon/state
   * wall clock (one shared offset for the whole run).
   */
  readonly epochOffsetMs: number;
}

export interface AlignedFrameRow {
  readonly frameIndex: number;
  /** Decoded stopwatch centiseconds, or null when the strip is undecodable. */
  readonly centiseconds: number | null;
  /** Stopwatch time in ms (centiseconds × 10), or null. */
  readonly stopwatchMs: number | null;
  /** Stopwatch time mapped onto the perfmon/state clock (+ epochOffsetMs), or null. */
  readonly alignedMs: number | null;
  /** The pipeline state whose window contains alignedMs, or null. */
  readonly state: string | null;
  /** Index of the nearest perfmon sample, or null (undecodable frame / no samples). */
  readonly perfSampleIndex: number | null;
  /** |perf.t[perfSampleIndex] − alignedMs| in ms, or null. */
  readonly perfSampleOffsetMs: number | null;
  readonly cpuTotalPct: number | null;
  readonly memAvailMb: number | null;
  readonly labviewCpuPct: number | null;
  readonly labviewWorkingSetMb: number | null;
}

export interface AlignedStateRollup {
  readonly state: string;
  /** Frames whose decoded, aligned time fell inside this state's window. */
  readonly frameCount: number;
  readonly meanCpuTotalPct: number | null;
  readonly meanMemAvailMb: number | null;
  readonly meanLabviewCpuPct: number | null;
  readonly meanLabviewWorkingSetMb: number | null;
}

export interface FrameTimingAlignment {
  readonly schema: typeof FRAME_TIMING_ALIGNMENT_SCHEMA;
  readonly schemaVersion: typeof FRAME_TIMING_ALIGNMENT_SCHEMA_VERSION;
  readonly epochOffsetMs: number;
  readonly frames: AlignedFrameRow[];
  readonly stateRollups: AlignedStateRollup[];
  readonly decodedFrameCount: number;
  readonly undecodableFrameCount: number;
}

function meanOfFinite(values: (number | null)[]): number | null {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (value !== null && Number.isFinite(value)) {
      sum += value;
      count += 1;
    }
  }
  return count === 0 ? null : sum / count;
}

function seriesValueAt(series: readonly (number | null)[] | undefined, index: number): number | null {
  if (!series) {
    return null;
  }
  const value = series[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Bind each recorded frame to the nearest perfmon sample and to the pipeline
 * state that contains its aligned time, then roll the per-frame perf up per
 * state. Fail-closed at the input boundary; explicit `null` (never fabricated)
 * for an undecodable frame or a missing perfmon sample.
 */
export function alignFramesToPerf(input: AlignFramesToPerfInput): FrameTimingAlignment {
  if (!input || typeof input !== 'object') {
    throw new Error('alignFramesToPerf requires an input object.');
  }
  if (!Array.isArray(input.frames)) {
    throw new Error('frames must be an array.');
  }
  if (!Array.isArray(input.states)) {
    throw new Error('states must be an array.');
  }
  if (!input.perf || !Array.isArray(input.perf.t)) {
    throw new Error('perf.t must be an array of sample times.');
  }
  if (!Number.isFinite(input.epochOffsetMs)) {
    throw new Error('epochOffsetMs must be a finite number.');
  }

  const perfTimes = input.perf.t;

  const findNearestSample = (alignedMs: number): { index: number; offsetMs: number } | null => {
    if (perfTimes.length === 0) {
      return null;
    }
    let bestIndex = -1;
    let bestOffset = Number.POSITIVE_INFINITY;
    for (let i = 0; i < perfTimes.length; i += 1) {
      const sampleTime = perfTimes[i];
      if (!Number.isFinite(sampleTime)) {
        continue;
      }
      const offset = Math.abs(sampleTime - alignedMs);
      if (offset < bestOffset) {
        bestOffset = offset;
        bestIndex = i;
      }
    }
    return bestIndex === -1 ? null : { index: bestIndex, offsetMs: bestOffset };
  };

  const findState = (alignedMs: number): string | null => {
    for (const window of input.states) {
      if (alignedMs >= window.startMs && alignedMs < window.endMs) {
        return window.state;
      }
    }
    return null;
  };

  const rows: AlignedFrameRow[] = [];
  let decodedFrameCount = 0;
  let undecodableFrameCount = 0;

  for (const frame of input.frames) {
    const centiseconds = decodeStopwatchBitStrip(frame.stripBits);
    if (centiseconds === null) {
      undecodableFrameCount += 1;
      rows.push({
        frameIndex: frame.frameIndex,
        centiseconds: null,
        stopwatchMs: null,
        alignedMs: null,
        state: null,
        perfSampleIndex: null,
        perfSampleOffsetMs: null,
        cpuTotalPct: null,
        memAvailMb: null,
        labviewCpuPct: null,
        labviewWorkingSetMb: null
      });
      continue;
    }

    decodedFrameCount += 1;
    const stopwatchMs = centiseconds * CENTISECOND_MS;
    const alignedMs = stopwatchMs + input.epochOffsetMs;
    const nearest = findNearestSample(alignedMs);
    const sampleIndex = nearest?.index ?? null;

    rows.push({
      frameIndex: frame.frameIndex,
      centiseconds,
      stopwatchMs,
      alignedMs,
      state: findState(alignedMs),
      perfSampleIndex: sampleIndex,
      perfSampleOffsetMs: nearest?.offsetMs ?? null,
      cpuTotalPct: sampleIndex === null ? null : seriesValueAt(input.perf.cpuTotalPct, sampleIndex),
      memAvailMb: sampleIndex === null ? null : seriesValueAt(input.perf.memAvailMb, sampleIndex),
      labviewCpuPct: sampleIndex === null ? null : seriesValueAt(input.perf.labviewCpuPct, sampleIndex),
      labviewWorkingSetMb:
        sampleIndex === null ? null : seriesValueAt(input.perf.labviewWorkingSetMb, sampleIndex)
    });
  }

  // Per-state rollup, one entry per unique state name in first-seen order.
  const stateOrder: string[] = [];
  for (const window of input.states) {
    if (!stateOrder.includes(window.state)) {
      stateOrder.push(window.state);
    }
  }
  const stateRollups: AlignedStateRollup[] = stateOrder.map((state) => {
    const stateRows = rows.filter((row) => row.state === state);
    return {
      state,
      frameCount: stateRows.length,
      meanCpuTotalPct: meanOfFinite(stateRows.map((row) => row.cpuTotalPct)),
      meanMemAvailMb: meanOfFinite(stateRows.map((row) => row.memAvailMb)),
      meanLabviewCpuPct: meanOfFinite(stateRows.map((row) => row.labviewCpuPct)),
      meanLabviewWorkingSetMb: meanOfFinite(stateRows.map((row) => row.labviewWorkingSetMb))
    };
  });

  return {
    schema: FRAME_TIMING_ALIGNMENT_SCHEMA,
    schemaVersion: FRAME_TIMING_ALIGNMENT_SCHEMA_VERSION,
    epochOffsetMs: input.epochOffsetMs,
    frames: rows,
    stateRollups,
    decodedFrameCount,
    undecodableFrameCount
  };
}
