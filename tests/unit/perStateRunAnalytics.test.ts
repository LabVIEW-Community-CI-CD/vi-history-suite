// Requirement coverage: VHS-REQ-707 (Mirror-Mode Dual Real-Runtime LabVIEW
// Validation) — per-state run analytics (epic #2344 Phase 1). Pure/deterministic
// projection of one comparison run into per-pipeline-state duration + perfmon
// rollups (+ recorded frame counts when a frame-timing alignment is supplied).
import { describe, expect, it } from 'vitest';

import { alignFramesToPerf } from '../../src/reporting/mirror/frameTimingAlignment';
import { encodeMprrMachineStrip } from '../../src/reporting/mirror/perfmonMprrSync';
import {
  PER_STATE_RUN_ANALYTICS_SCHEMA,
  buildPerStateRunAnalytics,
  type BuildPerStateRunAnalyticsInput
} from '../../src/reporting/mirror/perStateRunAnalytics';

const STATES = [
  { state: 'STAGING' as const, startMs: 0, endMs: 100 },
  { state: 'COMPARISON' as const, startMs: 100, endMs: 300 }
];

function baseInput(): BuildPerStateRunAnalyticsInput {
  return {
    runtime: 'host-native',
    recording: false,
    states: STATES,
    perf: {
      t: [0, 50, 100, 200, 250],
      cpuTotalPct: [10, 20, 30, 40, 50],
      memAvailMb: [900, 880, 800, 700, 650],
      diskTotalPct: [1, 2, 3, 4, 5]
    }
  };
}

describe('buildPerStateRunAnalytics (VHS-REQ-707.22, #2344)', () => {
  it('rolls perfmon samples up per state window and records durations', () => {
    const result = buildPerStateRunAnalytics(baseInput());
    expect(result.schema).toBe(PER_STATE_RUN_ANALYTICS_SCHEMA);
    expect(result.runtime).toBe('host-native');
    expect(result.totalDurationMs).toBe(300);

    const staging = result.states[0];
    expect(staging).toMatchObject({
      state: 'STAGING',
      durationMs: 100,
      sampleCount: 2,
      meanCpuTotalPct: 15,
      peakCpuTotalPct: 20,
      minMemAvailMb: 880,
      meanDiskTotalPct: 1.5,
      peakDiskTotalPct: 2,
      frameCount: null
    });

    const comparison = result.states[1];
    expect(comparison).toMatchObject({
      state: 'COMPARISON',
      durationMs: 200,
      sampleCount: 3,
      meanCpuTotalPct: 40,
      peakCpuTotalPct: 50,
      minMemAvailMb: 650,
      meanDiskTotalPct: 4,
      peakDiskTotalPct: 5
    });
  });

  it('yields null rollups (never fabricated) for a state with no samples in its window', () => {
    const input: BuildPerStateRunAnalyticsInput = {
      ...baseInput(),
      states: [
        { state: 'STAGING', startMs: 0, endMs: 100 },
        { state: 'UNSTAGING', startMs: 1000, endMs: 1100 }
      ]
    };
    const result = buildPerStateRunAnalytics(input);
    const unstaging = result.states[1];
    expect(unstaging.sampleCount).toBe(0);
    expect(unstaging.meanCpuTotalPct).toBeNull();
    expect(unstaging.peakCpuTotalPct).toBeNull();
    expect(unstaging.minMemAvailMb).toBeNull();
    expect(unstaging.durationMs).toBe(100);
  });

  it('surfaces per-state recorded frame counts when a frame-timing alignment is supplied', () => {
    const alignment = alignFramesToPerf({
      // cs 1/3 -> 10/30 ms (STAGING); cs 15 -> 150 ms (COMPARISON).
      frames: [1, 3, 15].map((cs, i) => ({ frameIndex: i, stripBits: encodeMprrMachineStrip(cs) })),
      perf: { t: [0, 150], cpuTotalPct: [10, 20], memAvailMb: [900, 800], diskTotalPct: [1, 2] },
      states: STATES,
      epochOffsetMs: 0
    });
    const result = buildPerStateRunAnalytics({ ...baseInput(), recording: true, alignment });
    expect(result.recording).toBe(true);
    expect(result.states.find((s) => s.state === 'STAGING')?.frameCount).toBe(2);
    expect(result.states.find((s) => s.state === 'COMPARISON')?.frameCount).toBe(1);
  });

  it('reports null (not a fabricated 0) for a state the alignment does not cover (#2344 review)', () => {
    const alignment = alignFramesToPerf({
      frames: [{ frameIndex: 0, stripBits: encodeMprrMachineStrip(1) }], // STAGING only
      perf: { t: [0, 100], cpuTotalPct: [10, 20], memAvailMb: [900, 800], diskTotalPct: [1, 2] },
      states: [{ state: 'STAGING', startMs: 0, endMs: 100 }],
      epochOffsetMs: 0
    });
    const result = buildPerStateRunAnalytics({ ...baseInput(), recording: true, alignment });
    expect(result.states.find((s) => s.state === 'STAGING')?.frameCount).toBe(1);
    // COMPARISON is absent from the alignment's rollups -> null, surfacing the mismatch.
    expect(result.states.find((s) => s.state === 'COMPARISON')?.frameCount).toBeNull();
  });

  it('fails closed on an inconsistent or malformed alignment (#2344 review)', () => {
    const alignment = alignFramesToPerf({
      frames: [{ frameIndex: 0, stripBits: encodeMprrMachineStrip(1) }],
      perf: { t: [0, 100], cpuTotalPct: [10, 20], memAvailMb: [900, 800], diskTotalPct: [1, 2] },
      states: STATES,
      epochOffsetMs: 0
    });
    // An alignment implies a recording ran.
    expect(() => buildPerStateRunAnalytics({ ...baseInput(), recording: false, alignment })).toThrow(/recording=true/);
    // Frames are host-native only.
    expect(() =>
      buildPerStateRunAnalytics({ ...baseInput(), runtime: 'windows-container', recording: true, alignment })
    ).toThrow(/host-native runtime/);
    // Must be a real frame-timing-alignment@v1 model.
    expect(() =>
      // @ts-expect-error bogus alignment shape
      buildPerStateRunAnalytics({ ...baseInput(), recording: true, alignment: { stateRollups: [] } })
    ).toThrow(/frame-timing-alignment@v1 model/);
    // A corrupted rollup entry (bad frameCount) fails closed rather than propagating.
    const corrupt = structuredClone(alignment) as { stateRollups: { frameCount: number }[] };
    (corrupt.stateRollups[0] as { frameCount: unknown }).frameCount = Number.NaN;
    expect(() =>
      buildPerStateRunAnalytics({ ...baseInput(), recording: true, alignment: corrupt as never })
    ).toThrow(/frameCount must be a non-negative integer/);
  });

  it('treats a null perfmon cell as missing, not zero', () => {
    const input: BuildPerStateRunAnalyticsInput = {
      ...baseInput(),
      perf: { t: [0, 50], cpuTotalPct: [null, null], memAvailMb: [900, 880], diskTotalPct: [1, 2] }
    };
    const result = buildPerStateRunAnalytics(input);
    expect(result.states[0].meanCpuTotalPct).toBeNull();
    expect(result.states[0].meanMemAvailMb).toBe(890);
  });

  it('is deterministic: identical input yields identical output', () => {
    expect(buildPerStateRunAnalytics(baseInput())).toEqual(buildPerStateRunAnalytics(baseInput()));
  });

  it('fails closed at the input boundary', () => {
    // @ts-expect-error null input
    expect(() => buildPerStateRunAnalytics(null)).toThrow(/input object/);
    // @ts-expect-error bad runtime
    expect(() => buildPerStateRunAnalytics({ ...baseInput(), runtime: 'nope' })).toThrow(/runtime must be/);
    // @ts-expect-error non-boolean recording
    expect(() => buildPerStateRunAnalytics({ ...baseInput(), recording: 'yes' })).toThrow(/recording must be a boolean/);
    // @ts-expect-error states not array
    expect(() => buildPerStateRunAnalytics({ ...baseInput(), states: 'x' })).toThrow(/states must be an array/);
    expect(() =>
      buildPerStateRunAnalytics({ ...baseInput(), perf: { t: undefined as unknown as number[], cpuTotalPct: [], memAvailMb: [], diskTotalPct: [] } })
    ).toThrow(/perf\.t must be an array/);
    expect(() =>
      buildPerStateRunAnalytics({ ...baseInput(), perf: { t: [0, Number.NaN], cpuTotalPct: [1, 2], memAvailMb: [1, 2], diskTotalPct: [1, 2] } })
    ).toThrow(/perf\.t\[1\] must be a finite number/);
    expect(() =>
      buildPerStateRunAnalytics({ ...baseInput(), perf: { t: [0, 50, 25], cpuTotalPct: [1, 2, 3], memAvailMb: [1, 2, 3], diskTotalPct: [1, 2, 3] } })
    ).toThrow(/perf\.t must be non-decreasing/);
    // A mandatory series shorter than perf.t must fail closed, not read as missing.
    expect(() =>
      buildPerStateRunAnalytics({ ...baseInput(), perf: { t: [0, 50], cpuTotalPct: [1], memAvailMb: [1, 2], diskTotalPct: [1, 2] } })
    ).toThrow(/perf\.cpuTotalPct length/);
    // A non-finite (NaN) or non-number cell must fail closed, not be swallowed as "missing".
    expect(() =>
      buildPerStateRunAnalytics({ ...baseInput(), perf: { t: [0, 50], cpuTotalPct: [1, Number.NaN], memAvailMb: [1, 2], diskTotalPct: [1, 2] } })
    ).toThrow(/perf\.cpuTotalPct\[1\] must be null or a finite number/);
    expect(() =>
      buildPerStateRunAnalytics({ ...baseInput(), perf: { t: [0, 50], cpuTotalPct: [1, 2], memAvailMb: [1, 2], diskTotalPct: [1, 'x' as unknown as number] } })
    ).toThrow(/perf\.diskTotalPct\[1\] must be null or a finite number/);
    // null cells (explicitly missing samples) remain valid.
    expect(() =>
      buildPerStateRunAnalytics({ ...baseInput(), perf: { t: [0, 50], cpuTotalPct: [1, null], memAvailMb: [null, 2], diskTotalPct: [1, 2] } })
    ).not.toThrow();
    expect(() =>
      // @ts-expect-error missing diskTotalPct
      buildPerStateRunAnalytics({ ...baseInput(), perf: { t: [0, 50], cpuTotalPct: [1, 2], memAvailMb: [1, 2] } })
    ).toThrow(/perf\.diskTotalPct must be an array/);
    expect(() =>
      buildPerStateRunAnalytics({ ...baseInput(), states: [{ state: 'STAGING', startMs: 100, endMs: 0 }] })
    ).toThrow(/startMs < endMs/);
    expect(() =>
      buildPerStateRunAnalytics({ ...baseInput(), states: [{ state: 'STAGING', startMs: 50, endMs: 50 }] })
    ).toThrow(/startMs < endMs/);
    // Overlapping windows would double-count samples across states.
    expect(() =>
      buildPerStateRunAnalytics({
        ...baseInput(),
        states: [
          { state: 'STAGING', startMs: 0, endMs: 150 },
          { state: 'COMPARISON', startMs: 100, endMs: 300 }
        ]
      })
    ).toThrow(/overlaps the previous window/);
    // Duplicate state labels break the 1-row-per-state contract.
    expect(() =>
      buildPerStateRunAnalytics({
        ...baseInput(),
        states: [
          { state: 'STAGING', startMs: 0, endMs: 100 },
          { state: 'STAGING', startMs: 100, endMs: 200 }
        ]
      })
    ).toThrow(/duplicates state 'STAGING'/);
    // Terminal pipeline markers are not part of the timed-state model.
    expect(() =>
      // @ts-expect-error COMPLETE is not a TimedPipelineState
      buildPerStateRunAnalytics({ ...baseInput(), states: [{ state: 'COMPLETE', startMs: 0, endMs: 100 }] })
    ).toThrow(/is not one of the six timed pipeline states/);
  });
});
