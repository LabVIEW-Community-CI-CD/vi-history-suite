// Cross-runtime / recording-overhead per-state performance differ
// (VHS-REQ-707, epic #2344 Phase 1).
//
// Compares two `per-state-run-analytics@v1` models produced by
// buildPerStateRunAnalytics and reports, per pipeline state, how the CANDIDATE
// differs from the REFERENCE. One differ serves both comparisons the epic needs:
//   - cross-runtime: reference = host-native run, candidate = container run.
//   - recording-overhead: reference = host recording-OFF, candidate = host
//     recording-ON (the cost the host-owned frame recording adds per state).
//
// The reference is the baseline "how this host performed"; every delta is
// candidate MINUS reference. Sign convention differs by metric: for duration,
// CPU percent, and disk percent a POSITIVE delta means the candidate was slower
// or heavier; for AVAILABLE memory a NEGATIVE delta means the candidate had less
// memory free (i.e. HIGHER memory pressure). Host-orchestrated states
// (STAGING/VALIDATION/UNSTAGING) should show near-zero cross-runtime deltas (a
// control); the runtime-executed states (previews + comparison) carry the signal.
//
// Design (reporting-orchestration guardrails): pure and deterministic, no I/O.
// Fail-closed at the input boundary; a metric absent on either side yields an
// explicit null delta (never a fabricated zero), and a state present on only one
// side is surfaced rather than silently dropped.

import type { TimedPipelineState } from '../comparisonPreviewPipeline';
import { ANALYTICS_RUNTIMES, PER_STATE_RUN_ANALYTICS_SCHEMA } from './perStateRunAnalytics';
import type { AnalyticsRuntime, PerStateRow, PerStateRunAnalytics } from './perStateRunAnalytics';

export const CROSS_RUNTIME_PERF_DIFF_SCHEMA = 'vi-history-suite/cross-runtime-perf-diff@v1';
export const CROSS_RUNTIME_PERF_DIFF_SCHEMA_VERSION = 1;

/** What the differ is contrasting, for self-documenting evidence. */
export type PerfDiffKind = 'cross-runtime' | 'recording-overhead';

export interface PerStateDelta {
  readonly state: TimedPipelineState;
  /** True when the state exists in both runs (a delta is defined). */
  readonly inBoth: boolean;
  readonly referenceDurationMs: number | null;
  readonly candidateDurationMs: number | null;
  readonly durationDeltaMs: number | null;
  /** candidate/reference − 1, as a percentage; null when reference is 0 or absent. */
  readonly durationDeltaPct: number | null;
  readonly meanCpuDeltaPct: number | null;
  readonly meanMemAvailDeltaMb: number | null;
  readonly meanDiskDeltaPct: number | null;
}

export interface CrossRuntimePerfDiff {
  readonly schema: typeof CROSS_RUNTIME_PERF_DIFF_SCHEMA;
  readonly schemaVersion: typeof CROSS_RUNTIME_PERF_DIFF_SCHEMA_VERSION;
  readonly kind: PerfDiffKind;
  readonly referenceRuntime: AnalyticsRuntime;
  readonly candidateRuntime: AnalyticsRuntime;
  readonly referenceRecording: boolean;
  readonly candidateRecording: boolean;
  readonly deltas: PerStateDelta[];
  /** Total candidate − reference duration across states present in both. */
  readonly totalDurationDeltaMs: number;
  /** States present in only one of the two runs (mismatch surfaced, not hidden). */
  readonly unmatchedStates: TimedPipelineState[];
}

function delta(reference: number | null, candidate: number | null): number | null {
  if (reference === null || candidate === null) {
    return null;
  }
  return candidate - reference;
}

/**
 * Diff two per-state run-analytics models. For each state in the reference, emits
 * the candidate−reference duration and perfmon deltas (null when either side is
 * absent). States present on only one side are listed in `unmatchedStates` and
 * still emitted with `inBoth=false` and null deltas. Fail-closed on non-analytics
 * input.
 */
export function diffPerStateAnalytics(
  reference: PerStateRunAnalytics,
  candidate: PerStateRunAnalytics,
  options: { readonly kind?: PerfDiffKind } = {}
): CrossRuntimePerfDiff {
  const validate = (name: string, value: unknown): void => {
    const m = value as {
      schema?: unknown;
      runtime?: unknown;
      recording?: unknown;
      states?: unknown;
    } | null;
    if (
      !m ||
      typeof m !== 'object' ||
      m.schema !== PER_STATE_RUN_ANALYTICS_SCHEMA ||
      typeof m.runtime !== 'string' ||
      m.runtime === '' ||
      !(ANALYTICS_RUNTIMES as readonly string[]).includes(m.runtime) ||
      typeof m.recording !== 'boolean' ||
      !Array.isArray(m.states)
    ) {
      throw new Error(`${name} must be a per-state-run-analytics@v1 model.`);
    }
    // Each row must be well-formed so a malformed model cannot yield NaN deltas
    // or an undefined state key, and states must be unique (the differ collapses
    // rows by state into a Map, so duplicates would be lossy). Fail closed.
    const seenStates = new Set<string>();
    m.states.forEach((row, i) => {
      const r = row as { state?: unknown; durationMs?: unknown } | null;
      if (!r || typeof r !== 'object' || typeof r.state !== 'string' || r.state === '') {
        throw new Error(`${name}.states[${i}].state must be a non-empty string.`);
      }
      if (seenStates.has(r.state)) {
        throw new Error(`${name}.states[${i}] duplicates state '${r.state}' (each state must appear once).`);
      }
      seenStates.add(r.state);
      if (typeof r.durationMs !== 'number' || !Number.isFinite(r.durationMs)) {
        throw new Error(`${name}.states[${i}].durationMs must be a finite number.`);
      }
      for (const field of ['meanCpuTotalPct', 'meanMemAvailMb', 'meanDiskTotalPct'] as const) {
        const metric = (r as Record<string, unknown>)[field];
        if (metric !== null && (typeof metric !== 'number' || !Number.isFinite(metric))) {
          throw new Error(`${name}.states[${i}].${field} must be a finite number or null.`);
        }
      }
    });
  };
  validate('reference', reference);
  validate('candidate', candidate);
  if (options.kind !== undefined && options.kind !== 'cross-runtime' && options.kind !== 'recording-overhead') {
    throw new Error("options.kind must be 'cross-runtime' or 'recording-overhead'.");
  }

  const kind: PerfDiffKind =
    options.kind ??
    (reference.runtime !== candidate.runtime
      ? 'cross-runtime'
      : 'recording-overhead');

  const referenceByState = new Map<TimedPipelineState, PerStateRow>();
  for (const row of reference.states) {
    referenceByState.set(row.state, row);
  }
  const candidateByState = new Map<TimedPipelineState, PerStateRow>();
  for (const row of candidate.states) {
    candidateByState.set(row.state, row);
  }

  // Reference-ordered states first, then any candidate-only states (first-seen).
  const orderedStates: TimedPipelineState[] = [];
  for (const row of reference.states) {
    if (!orderedStates.includes(row.state)) {
      orderedStates.push(row.state);
    }
  }
  for (const row of candidate.states) {
    if (!orderedStates.includes(row.state)) {
      orderedStates.push(row.state);
    }
  }

  const unmatchedStates: TimedPipelineState[] = [];
  let totalDurationDeltaMs = 0;

  const deltas: PerStateDelta[] = orderedStates.map((state) => {
    const ref = referenceByState.get(state) ?? null;
    const cand = candidateByState.get(state) ?? null;
    const inBoth = ref !== null && cand !== null;
    if (!inBoth) {
      unmatchedStates.push(state);
    }
    const referenceDurationMs = ref ? ref.durationMs : null;
    const candidateDurationMs = cand ? cand.durationMs : null;
    const durationDeltaMs = delta(referenceDurationMs, candidateDurationMs);
    if (durationDeltaMs !== null) {
      totalDurationDeltaMs += durationDeltaMs;
    }
    const durationDeltaPct =
      referenceDurationMs !== null && referenceDurationMs !== 0 && candidateDurationMs !== null
        ? ((candidateDurationMs - referenceDurationMs) / referenceDurationMs) * 100
        : null;

    return {
      state,
      inBoth,
      referenceDurationMs,
      candidateDurationMs,
      durationDeltaMs,
      durationDeltaPct,
      meanCpuDeltaPct: delta(ref?.meanCpuTotalPct ?? null, cand?.meanCpuTotalPct ?? null),
      meanMemAvailDeltaMb: delta(ref?.meanMemAvailMb ?? null, cand?.meanMemAvailMb ?? null),
      meanDiskDeltaPct: delta(ref?.meanDiskTotalPct ?? null, cand?.meanDiskTotalPct ?? null)
    };
  });

  return {
    schema: CROSS_RUNTIME_PERF_DIFF_SCHEMA,
    schemaVersion: CROSS_RUNTIME_PERF_DIFF_SCHEMA_VERSION,
    kind,
    referenceRuntime: reference.runtime,
    candidateRuntime: candidate.runtime,
    referenceRecording: reference.recording,
    candidateRecording: candidate.recording,
    deltas,
    totalDurationDeltaMs,
    unmatchedStates
  };
}
