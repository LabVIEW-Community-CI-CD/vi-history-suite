// Per-state run analytics for the single-pass comparison pipeline
// (VHS-REQ-707, epic #2344 Phase 1).
//
// Projects ONE comparison run (on one runtime, with the host frame recording
// either on or off) into per-pipeline-state analytics: each state's duration and
// the perfmon pressure sampled inside that state's window, plus the recorded
// frame count when a frame-timing alignment (VHS-REQ-707.20) is supplied. It is
// the per-run building block the cross-runtime / recording-overhead differ
// (crossRuntimePerfDiff) compares.
//
// The pipeline states (STAGING / PREVIEW_LEFT / PREVIEW_RIGHT / VALIDATION /
// COMPARISON / UNSTAGING, VHS-REQ-699) split into host-orchestrated states
// (runtime-independent) and runtime-executed states (previews + comparison), so
// the per-state analytics of two runtimes reveals exactly which states carry the
// runtime cost.
//
// Design (reporting-orchestration guardrails): pure and deterministic, no I/O.
// The state windows and the perfmon sample times share the run's elapsed-ms
// clock (the capture driver aligns them). Fail-closed at the input boundary;
// explicit null (never fabricated) for a state with no samples in its window.

import type { PipelineState } from '../comparisonPreviewPipeline';
import type { FrameTimingAlignment } from './frameTimingAlignment';

export const PER_STATE_RUN_ANALYTICS_SCHEMA = 'vi-history-suite/per-state-run-analytics@v1';
export const PER_STATE_RUN_ANALYTICS_SCHEMA_VERSION = 1;

/** The runtime a comparison run executed on. */
export type AnalyticsRuntime = 'host-native' | 'windows-container' | 'linux-container';

/** One pipeline-state window on the run's elapsed-ms clock (endMs exclusive). */
export interface PerStateWindow {
  readonly state: PipelineState;
  readonly startMs: number;
  readonly endMs: number;
}

/** The perfmon series to roll up per state (a `perfmon-sample-series@v1` subset). */
export interface PerStatePerfInput {
  readonly t: readonly number[];
  readonly cpuTotalPct: readonly (number | null)[];
  readonly memAvailMb: readonly (number | null)[];
  readonly diskTotalPct: readonly (number | null)[];
  readonly labviewCpuPct?: readonly (number | null)[];
  readonly labviewWorkingSetMb?: readonly (number | null)[];
}

export interface BuildPerStateRunAnalyticsInput {
  readonly runtime: AnalyticsRuntime;
  /** Whether the host-owned mprr frame recording was running during this run. */
  readonly recording: boolean;
  readonly states: readonly PerStateWindow[];
  readonly perf: PerStatePerfInput;
  /**
   * Optional frame-timing alignment (host-native, recording on): its per-state
   * rollup supplies the recorded frame count per state. Absent when no recording.
   */
  readonly alignment?: FrameTimingAlignment;
}

export interface PerStateRow {
  readonly state: PipelineState;
  readonly durationMs: number;
  /** Number of perfmon samples whose time fell inside this state's window. */
  readonly sampleCount: number;
  readonly meanCpuTotalPct: number | null;
  readonly peakCpuTotalPct: number | null;
  readonly meanMemAvailMb: number | null;
  readonly minMemAvailMb: number | null;
  readonly meanDiskTotalPct: number | null;
  readonly peakDiskTotalPct: number | null;
  readonly meanLabviewCpuPct: number | null;
  readonly peakLabviewWorkingSetMb: number | null;
  /** Recorded frames in this state (from the alignment), or null when no recording. */
  readonly frameCount: number | null;
}

export interface PerStateRunAnalytics {
  readonly schema: typeof PER_STATE_RUN_ANALYTICS_SCHEMA;
  readonly schemaVersion: typeof PER_STATE_RUN_ANALYTICS_SCHEMA_VERSION;
  readonly runtime: AnalyticsRuntime;
  readonly recording: boolean;
  readonly totalDurationMs: number;
  readonly states: PerStateRow[];
}

function finite(values: readonly (number | null)[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (value !== null && Number.isFinite(value)) {
      out.push(value);
    }
  }
  return out;
}

function mean(values: readonly (number | null)[]): number | null {
  const f = finite(values);
  if (f.length === 0) {
    return null;
  }
  return f.reduce((a, b) => a + b, 0) / f.length;
}

function peak(values: readonly (number | null)[]): number | null {
  const f = finite(values);
  return f.length === 0 ? null : Math.max(...f);
}

function trough(values: readonly (number | null)[]): number | null {
  const f = finite(values);
  return f.length === 0 ? null : Math.min(...f);
}

/**
 * Build per-state analytics for one run. For each state window, collects the
 * perfmon samples whose time falls inside `[startMs, endMs)` and rolls them up
 * (mean/peak CPU and disk, mean/min available memory), records the state's
 * duration, and — when a frame-timing alignment is supplied — the recorded frame
 * count for that state. Fail-closed at the input boundary; a state with no
 * samples in its window yields explicit null rollups (never fabricated).
 */
export function buildPerStateRunAnalytics(input: BuildPerStateRunAnalyticsInput): PerStateRunAnalytics {
  if (!input || typeof input !== 'object') {
    throw new Error('buildPerStateRunAnalytics requires an input object.');
  }
  if (input.runtime !== 'host-native' && input.runtime !== 'windows-container' && input.runtime !== 'linux-container') {
    throw new Error('runtime must be host-native, windows-container, or linux-container.');
  }
  if (typeof input.recording !== 'boolean') {
    throw new Error('recording must be a boolean.');
  }
  if (!Array.isArray(input.states)) {
    throw new Error('states must be an array.');
  }
  if (!input.perf || typeof input.perf !== 'object' || !Array.isArray(input.perf.t)) {
    throw new Error('perf.t must be an array of sample times.');
  }

  const perfTimes = input.perf.t;
  for (let i = 0; i < perfTimes.length; i += 1) {
    if (!Number.isFinite(perfTimes[i])) {
      throw new Error(`perf.t[${i}] must be a finite number.`);
    }
  }

  input.states.forEach((window, i) => {
    if (!window || typeof window !== 'object' || typeof window.state !== 'string' || window.state === '') {
      throw new Error(`states[${i}].state must be a non-empty string.`);
    }
    if (!Number.isFinite(window.startMs) || !Number.isFinite(window.endMs)) {
      throw new Error(`states[${i}] bounds must be finite numbers.`);
    }
    if (window.startMs > window.endMs) {
      throw new Error(`states[${i}] is reversed (startMs ${window.startMs} > endMs ${window.endMs}).`);
    }
  });

  const frameCountByState = new Map<PipelineState, number>();
  if (input.alignment) {
    for (const rollup of input.alignment.stateRollups) {
      frameCountByState.set(rollup.state, rollup.frameCount);
    }
  }

  const rows: PerStateRow[] = input.states.map((window) => {
    // Indices of the perfmon samples inside this state's window.
    const indices: number[] = [];
    for (let i = 0; i < perfTimes.length; i += 1) {
      if (perfTimes[i] >= window.startMs && perfTimes[i] < window.endMs) {
        indices.push(i);
      }
    }
    const pick = (series?: readonly (number | null)[]): (number | null)[] =>
      series ? indices.map((i) => series[i] ?? null) : [];

    const cpu = pick(input.perf.cpuTotalPct);
    const memory = pick(input.perf.memAvailMb);
    const disk = pick(input.perf.diskTotalPct);
    const lvCpu = pick(input.perf.labviewCpuPct);
    const lvWs = pick(input.perf.labviewWorkingSetMb);

    return {
      state: window.state,
      durationMs: window.endMs - window.startMs,
      sampleCount: indices.length,
      meanCpuTotalPct: mean(cpu),
      peakCpuTotalPct: peak(cpu),
      meanMemAvailMb: mean(memory),
      minMemAvailMb: trough(memory),
      meanDiskTotalPct: mean(disk),
      peakDiskTotalPct: peak(disk),
      meanLabviewCpuPct: mean(lvCpu),
      peakLabviewWorkingSetMb: peak(lvWs),
      frameCount: input.alignment ? frameCountByState.get(window.state) ?? 0 : null
    };
  });

  const totalDurationMs = rows.reduce((sum, row) => sum + row.durationMs, 0);

  return {
    schema: PER_STATE_RUN_ANALYTICS_SCHEMA,
    schemaVersion: PER_STATE_RUN_ANALYTICS_SCHEMA_VERSION,
    runtime: input.runtime,
    recording: input.recording,
    totalDurationMs,
    states: rows
  };
}
