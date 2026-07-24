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
// The reference is the baseline "how this host performed"; positive duration or
// CPU deltas mean the candidate was slower / heavier. Host-orchestrated states
// (STAGING/VALIDATION/UNSTAGING) should show near-zero cross-runtime deltas (a
// control); the runtime-executed states (previews + comparison) carry the signal.
//
// Design (reporting-orchestration guardrails): pure and deterministic, no I/O.
// Fail-closed at the input boundary; a metric absent on either side yields an
// explicit null delta (never a fabricated zero), and a state present on only one
// side is surfaced rather than silently dropped.

import type { PipelineState } from '../comparisonPreviewPipeline';
import type { PerStateRow, PerStateRunAnalytics } from './perStateRunAnalytics';

export const CROSS_RUNTIME_PERF_DIFF_SCHEMA = 'vi-history-suite/cross-runtime-perf-diff@v1';
export const CROSS_RUNTIME_PERF_DIFF_SCHEMA_VERSION = 1;

/** What the differ is contrasting, for self-documenting evidence. */
export type PerfDiffKind = 'cross-runtime' | 'recording-overhead';

export interface PerStateDelta {
  readonly state: PipelineState;
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
  readonly referenceRuntime: string;
  readonly candidateRuntime: string;
  readonly referenceRecording: boolean;
  readonly candidateRecording: boolean;
  readonly deltas: PerStateDelta[];
  /** Total candidate − reference duration across states present in both. */
  readonly totalDurationDeltaMs: number;
  /** States present in only one of the two runs (mismatch surfaced, not hidden). */
  readonly unmatchedStates: PipelineState[];
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
  for (const [name, model] of [
    ['reference', reference],
    ['candidate', candidate]
  ] as const) {
    if (!model || typeof model !== 'object' || !Array.isArray(model.states)) {
      throw new Error(`${name} must be a per-state-run-analytics model.`);
    }
  }

  const kind: PerfDiffKind =
    options.kind ??
    (reference.runtime !== candidate.runtime
      ? 'cross-runtime'
      : 'recording-overhead');

  const referenceByState = new Map<PipelineState, PerStateRow>();
  for (const row of reference.states) {
    referenceByState.set(row.state, row);
  }
  const candidateByState = new Map<PipelineState, PerStateRow>();
  for (const row of candidate.states) {
    candidateByState.set(row.state, row);
  }

  // Reference-ordered states first, then any candidate-only states (first-seen).
  const orderedStates: PipelineState[] = [];
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

  const unmatchedStates: PipelineState[] = [];
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
