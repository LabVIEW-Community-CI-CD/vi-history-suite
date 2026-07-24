// Requirement coverage: VHS-REQ-707 (Mirror-Mode Dual Real-Runtime LabVIEW
// Validation) — cross-runtime / recording-overhead per-state differ (epic #2344
// Phase 1). Pure/deterministic candidate-vs-reference per-state deltas.
import { describe, expect, it } from 'vitest';

import {
  buildPerStateRunAnalytics,
  type AnalyticsRuntime,
  type BuildPerStateRunAnalyticsInput
} from '../../src/reporting/mirror/perStateRunAnalytics';
import {
  CROSS_RUNTIME_PERF_DIFF_SCHEMA,
  diffPerStateAnalytics
} from '../../src/reporting/mirror/crossRuntimePerfDiff';

function run(
  runtime: AnalyticsRuntime,
  recording: boolean,
  comparisonEndMs: number,
  comparisonCpu: number[]
): ReturnType<typeof buildPerStateRunAnalytics> {
  const input: BuildPerStateRunAnalyticsInput = {
    runtime,
    recording,
    states: [
      { state: 'STAGING', startMs: 0, endMs: 100 },
      { state: 'COMPARISON', startMs: 100, endMs: comparisonEndMs }
    ],
    perf: {
      t: [0, 50, ...comparisonCpu.map((_, i) => 100 + i * 50)],
      cpuTotalPct: [10, 20, ...comparisonCpu],
      memAvailMb: [900, 880, ...comparisonCpu.map(() => 700)],
      diskTotalPct: [1, 2, ...comparisonCpu.map(() => 4)]
    }
  };
  return buildPerStateRunAnalytics(input);
}

describe('diffPerStateAnalytics (VHS-REQ-707.23, #2344)', () => {
  it('reports candidate-vs-reference per-state duration and perfmon deltas (cross-runtime)', () => {
    const reference = run('host-native', false, 300, [30, 40, 50]); // COMPARISON 200ms, cpu mean 40
    const candidate = run('windows-container', false, 500, [60, 70, 80]); // COMPARISON 400ms, cpu mean 70
    const diff = diffPerStateAnalytics(reference, candidate);
    expect(diff.schema).toBe(CROSS_RUNTIME_PERF_DIFF_SCHEMA);
    expect(diff.kind).toBe('cross-runtime'); // different runtimes
    expect(diff.referenceRuntime).toBe('host-native');
    expect(diff.candidateRuntime).toBe('windows-container');

    const staging = diff.deltas.find((d) => d.state === 'STAGING');
    expect(staging).toMatchObject({ inBoth: true, durationDeltaMs: 0, durationDeltaPct: 0 });

    const comparison = diff.deltas.find((d) => d.state === 'COMPARISON');
    expect(comparison).toMatchObject({
      inBoth: true,
      referenceDurationMs: 200,
      candidateDurationMs: 400,
      durationDeltaMs: 200,
      durationDeltaPct: 100,
      meanCpuDeltaPct: 30 // 70 - 40
    });
    expect(diff.totalDurationDeltaMs).toBe(200);
    expect(diff.unmatchedStates).toEqual([]);
  });

  it('auto-classifies same-runtime, recording-toggled runs as recording-overhead', () => {
    const off = run('host-native', false, 300, [30, 40, 50]);
    const on = run('host-native', true, 340, [45, 55, 65]); // slower + heavier with recording on
    const diff = diffPerStateAnalytics(off, on);
    expect(diff.kind).toBe('recording-overhead');
    expect(diff.referenceRecording).toBe(false);
    expect(diff.candidateRecording).toBe(true);
    const comparison = diff.deltas.find((d) => d.state === 'COMPARISON');
    expect(comparison?.durationDeltaMs).toBe(40);
    expect(comparison?.meanCpuDeltaPct).toBe(15); // 55 - 40
  });

  it('honors an explicit kind override', () => {
    const a = run('host-native', false, 300, [30, 40, 50]);
    const b = run('host-native', false, 300, [30, 40, 50]);
    expect(diffPerStateAnalytics(a, b, { kind: 'cross-runtime' }).kind).toBe('cross-runtime');
  });

  it('surfaces a state present on only one side rather than dropping it', () => {
    const reference = run('host-native', false, 300, [30, 40, 50]);
    const candidate = buildPerStateRunAnalytics({
      runtime: 'windows-container',
      recording: false,
      states: [
        { state: 'STAGING', startMs: 0, endMs: 100 },
        { state: 'COMPARISON', startMs: 100, endMs: 300 },
        { state: 'UNSTAGING', startMs: 300, endMs: 350 }
      ],
      perf: { t: [0, 320], cpuTotalPct: [10, 20], memAvailMb: [900, 700], diskTotalPct: [1, 4] }
    });
    const diff = diffPerStateAnalytics(reference, candidate);
    expect(diff.unmatchedStates).toEqual(['UNSTAGING']);
    const unstaging = diff.deltas.find((d) => d.state === 'UNSTAGING');
    expect(unstaging).toMatchObject({ inBoth: false, referenceDurationMs: null, durationDeltaMs: null });
  });

  it('returns a null delta (not zero) when a metric is missing on a side', () => {
    const reference = buildPerStateRunAnalytics({
      runtime: 'host-native',
      recording: false,
      states: [{ state: 'COMPARISON', startMs: 0, endMs: 100 }],
      // No samples in the window -> null cpu mean on the reference side.
      perf: { t: [500], cpuTotalPct: [30], memAvailMb: [700], diskTotalPct: [4] }
    });
    const candidate = run('windows-container', false, 100, [60]);
    const diff = diffPerStateAnalytics(reference, candidate);
    expect(diff.deltas.find((d) => d.state === 'COMPARISON')?.meanCpuDeltaPct).toBeNull();
  });

  it('is deterministic and fails closed on non-analytics input', () => {
    const a = run('host-native', false, 300, [30, 40, 50]);
    const b = run('windows-container', false, 300, [30, 40, 50]);
    expect(diffPerStateAnalytics(a, b)).toEqual(diffPerStateAnalytics(a, b));
    // @ts-expect-error null reference
    expect(() => diffPerStateAnalytics(null, b)).toThrow(/reference must be/);
    // @ts-expect-error bad candidate
    expect(() => diffPerStateAnalytics(a, { states: 'x' })).toThrow(/candidate must be/);
  });
});
