// Requirement coverage: VHS-REQ-707 (Mirror-Mode Dual Real-Runtime LabVIEW
// Validation) — the frame ⇄ perfmon ⇄ pipeline-state timing aligner (#2324).
// Pure/deterministic binding of deterministically recorded frame stopwatch
// strips to a perfmon series and the comparison pipeline states.
import { describe, expect, it } from 'vitest';

import { encodeMprrMachineStrip } from '../../src/reporting/mirror/perfmonMprrSync';
import {
  FRAME_TIMING_ALIGNMENT_SCHEMA,
  alignFramesToPerf,
  decodeStopwatchBitStrip,
  type AlignFramesToPerfInput
} from '../../src/reporting/mirror/frameTimingAlignment';

describe('decodeStopwatchBitStrip (VHS-REQ-707.20, #2324)', () => {
  it('round-trips a valid strip back to its centiseconds', () => {
    expect(decodeStopwatchBitStrip(encodeMprrMachineStrip(12345))).toBe(12345);
    expect(decodeStopwatchBitStrip(encodeMprrMachineStrip(0))).toBe(0);
  });

  it('returns null on a bad preamble', () => {
    const strip = encodeMprrMachineStrip(500);
    const badPreamble = (strip[0] === '1' ? '0' : '1') + strip.slice(1);
    expect(decodeStopwatchBitStrip(badPreamble)).toBeNull();
  });

  it('returns null on a bad checksum', () => {
    const strip = encodeMprrMachineStrip(500);
    // Flip the final checksum bit.
    const flipped = strip.slice(0, 39) + (strip[39] === '1' ? '0' : '1');
    expect(decodeStopwatchBitStrip(flipped)).toBeNull();
  });

  it('returns null on a malformed shape (wrong length, non-bit, non-string)', () => {
    expect(decodeStopwatchBitStrip('101')).toBeNull();
    expect(decodeStopwatchBitStrip(encodeMprrMachineStrip(1) + '0')).toBeNull();
    expect(decodeStopwatchBitStrip('x'.repeat(40))).toBeNull();
    expect(decodeStopwatchBitStrip(undefined)).toBeNull();
    expect(decodeStopwatchBitStrip(12345)).toBeNull();
  });
});

const STATES = [
  { state: 'STAGING', startMs: 0, endMs: 100 },
  { state: 'PREVIEW_LEFT', startMs: 100, endMs: 200 },
  { state: 'COMPARISON', startMs: 200, endMs: 300 }
];

function baseInput(): AlignFramesToPerfInput {
  // stopwatchMs = cs*10; epochOffsetMs = -1000 => aligned = stopwatchMs - 1000.
  // cs 101/111/121/125 -> aligned 10/110/210/250.
  return {
    frames: [101, 111, 121, 125].map((cs, i) => ({
      frameIndex: i,
      stripBits: encodeMprrMachineStrip(cs)
    })),
    perf: {
      t: [0, 100, 200, 300],
      cpuTotalPct: [10, 20, 30, 40],
      memAvailMb: [900, 800, 700, 600]
    },
    states: STATES,
    epochOffsetMs: -1000
  };
}

describe('alignFramesToPerf (VHS-REQ-707.20, #2324)', () => {
  it('binds each frame to its state and nearest perfmon sample via the stopwatch clock', () => {
    const result = alignFramesToPerf(baseInput());
    expect(result.schema).toBe(FRAME_TIMING_ALIGNMENT_SCHEMA);
    expect(result.decodedFrameCount).toBe(4);
    expect(result.undecodableFrameCount).toBe(0);

    expect(result.frames[0]).toMatchObject({
      frameIndex: 0,
      centiseconds: 101,
      stopwatchMs: 1010,
      alignedMs: 10,
      state: 'STAGING',
      perfSampleIndex: 0,
      perfSampleOffsetMs: 10,
      cpuTotalPct: 10,
      memAvailMb: 900
    });
    expect(result.frames[1]).toMatchObject({ alignedMs: 110, state: 'PREVIEW_LEFT', perfSampleIndex: 1, cpuTotalPct: 20 });
    expect(result.frames[2]).toMatchObject({ alignedMs: 210, state: 'COMPARISON', perfSampleIndex: 2, cpuTotalPct: 30 });
  });

  it('breaks a nearest-sample tie toward the earlier sample deterministically', () => {
    // Frame 3 aligns to 250: equidistant (50 ms) from t=200 and t=300 -> earlier.
    const result = alignFramesToPerf(baseInput());
    expect(result.frames[3]).toMatchObject({
      alignedMs: 250,
      state: 'COMPARISON',
      perfSampleIndex: 2,
      perfSampleOffsetMs: 50,
      cpuTotalPct: 30
    });
  });

  it('rolls per-state perfmon up as a mean over the frames in each state', () => {
    const result = alignFramesToPerf(baseInput());
    const byState = new Map(result.stateRollups.map((r) => [r.state, r]));
    expect(byState.get('STAGING')).toMatchObject({ frameCount: 1, meanCpuTotalPct: 10 });
    expect(byState.get('PREVIEW_LEFT')).toMatchObject({ frameCount: 1, meanCpuTotalPct: 20 });
    // Two COMPARISON frames (aligned 210 + 250), both nearest sample idx 2 (cpu 30).
    expect(byState.get('COMPARISON')).toMatchObject({ frameCount: 2, meanCpuTotalPct: 30 });
    // One rollup per unique state, in first-seen order.
    expect(result.stateRollups.map((r) => r.state)).toEqual(['STAGING', 'PREVIEW_LEFT', 'COMPARISON']);
  });

  it('fails closed on an undecodable frame: explicit nulls, counted, no state assignment', () => {
    const input: AlignFramesToPerfInput = {
      ...baseInput(),
      frames: [
        { frameIndex: 0, stripBits: encodeMprrMachineStrip(101) },
        { frameIndex: 1, stripBits: 'not-a-valid-strip' }
      ]
    };
    const result = alignFramesToPerf(input);
    expect(result.decodedFrameCount).toBe(1);
    expect(result.undecodableFrameCount).toBe(1);
    expect(result.frames[1]).toEqual({
      frameIndex: 1,
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
    // The undecodable frame contributes to no state rollup.
    const staging = result.stateRollups.find((r) => r.state === 'STAGING');
    expect(staging?.frameCount).toBe(1);
  });

  it('yields null perfmon fields (never fabricated) when there are no samples, but still assigns state', () => {
    const input: AlignFramesToPerfInput = {
      ...baseInput(),
      perf: { t: [], cpuTotalPct: [], memAvailMb: [] }
    };
    const result = alignFramesToPerf(input);
    expect(result.frames[0]).toMatchObject({
      state: 'STAGING',
      perfSampleIndex: null,
      perfSampleOffsetMs: null,
      cpuTotalPct: null,
      memAvailMb: null
    });
  });

  it('surfaces optional LabVIEW-process series when present and null when absent', () => {
    const withLv: AlignFramesToPerfInput = {
      ...baseInput(),
      perf: {
        t: [0, 100, 200, 300],
        cpuTotalPct: [10, 20, 30, 40],
        memAvailMb: [900, 800, 700, 600],
        labviewCpuPct: [5, 15, 25, 35],
        labviewWorkingSetMb: [100, 110, 120, 130]
      }
    };
    const result = alignFramesToPerf(withLv);
    expect(result.frames[0]).toMatchObject({ labviewCpuPct: 5, labviewWorkingSetMb: 100 });
    // Absent optional series -> null (baseInput has none).
    expect(alignFramesToPerf(baseInput()).frames[0].labviewCpuPct).toBeNull();
  });

  it('treats a null series cell as missing (null), not zero', () => {
    const input: AlignFramesToPerfInput = {
      ...baseInput(),
      perf: { t: [0, 100, 200, 300], cpuTotalPct: [null, 20, 30, 40], memAvailMb: [900, 800, 700, 600] }
    };
    const result = alignFramesToPerf(input);
    expect(result.frames[0].cpuTotalPct).toBeNull();
    // STAGING has only frame 0 (cpu null) -> mean null, not 0.
    expect(result.stateRollups.find((r) => r.state === 'STAGING')?.meanCpuTotalPct).toBeNull();
  });

  it('is deterministic: identical input yields identical output', () => {
    expect(alignFramesToPerf(baseInput())).toEqual(alignFramesToPerf(baseInput()));
  });

  it('fails closed at the input boundary', () => {
    // @ts-expect-error null input
    expect(() => alignFramesToPerf(null)).toThrow(/input object/);
    // @ts-expect-error frames not array
    expect(() => alignFramesToPerf({ ...baseInput(), frames: 'x' })).toThrow(/frames must be an array/);
    // @ts-expect-error states not array
    expect(() => alignFramesToPerf({ ...baseInput(), states: 'x' })).toThrow(/states must be an array/);
    expect(() =>
      alignFramesToPerf({ ...baseInput(), perf: { t: undefined as unknown as number[], cpuTotalPct: [], memAvailMb: [] } })
    ).toThrow(/perf\.t must be an array/);
    expect(() => alignFramesToPerf({ ...baseInput(), epochOffsetMs: Number.NaN })).toThrow(/epochOffsetMs/);
  });
});
