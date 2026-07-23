// Requirement coverage: VHS-REQ-710 (NI LabVIEW setup diagnostics family) — the
// stopwatch capture-accuracy analyzer (VHS-REQ-710.10). Measures how accurately
// the decoded stopwatch tracks real time at a nominal capture cadence (12 fps).
import { describe, expect, it } from 'vitest';

import {
  STOPWATCH_CAPTURE_ACCURACY_SCHEMA,
  type StopwatchFrameObservation,
  analyzeStopwatchCaptureAccuracy
} from '../../src/reporting/syncDiagnostics/stopwatchCaptureAccuracy';

// A clean 12 fps run: frames ~83.33ms apart, centiseconds = round(elapsedMs/10).
function cleanRun(count: number): StopwatchFrameObservation[] {
  const interval = 1000 / 12;
  return Array.from({ length: count }, (_, i) => {
    const captureEpochMs = Math.round(i * interval);
    return { frameIndex: i, captureEpochMs, decodedCentiseconds: Math.round(captureEpochMs / 10) };
  });
}

describe('analyzeStopwatchCaptureAccuracy (VHS-REQ-710.10)', () => {
  it('classifies a clean 12 fps run authoritative with ~12 effective fps and tiny error', () => {
    const result = analyzeStopwatchCaptureAccuracy({ nominalFps: 12, frames: cleanRun(12), minDurationMs: 500 });
    expect(result.schema).toBe(STOPWATCH_CAPTURE_ACCURACY_SCHEMA);
    expect(result.classification).toBe('authoritative');
    expect(result.effectiveFps).toBeGreaterThan(11.5);
    expect(result.effectiveFps).toBeLessThan(12.5);
    expect(result.expectedIntervalMs).toBeCloseTo(83.333, 2);
    expect(result.readableFrameCount).toBe(12);
    expect(result.stopwatchMaxAbsErrorMs).toBeLessThan(result.toleranceMs);
    expect(result.droppedFrameEstimate).toBe(0);
    expect(result.duplicateFrameEstimate).toBe(0);
  });

  it('estimates dropped capture frames from large capture gaps', () => {
    const frames: StopwatchFrameObservation[] = [
      { frameIndex: 0, captureEpochMs: 0, decodedCentiseconds: 0 },
      { frameIndex: 1, captureEpochMs: 83, decodedCentiseconds: 8 },
      { frameIndex: 2, captureEpochMs: 417, decodedCentiseconds: 42 }, // ~4 intervals gap
      { frameIndex: 3, captureEpochMs: 500, decodedCentiseconds: 50 }
    ];
    const result = analyzeStopwatchCaptureAccuracy({ nominalFps: 12, frames, minDurationMs: 400 });
    expect(result.droppedFrameEstimate).toBeGreaterThanOrEqual(3);
  });

  it('estimates duplicate frames when the stopwatch does not advance', () => {
    const frames: StopwatchFrameObservation[] = [
      { frameIndex: 0, captureEpochMs: 0, decodedCentiseconds: 10 },
      { frameIndex: 1, captureEpochMs: 83, decodedCentiseconds: 10 }, // duplicate (no advance)
      { frameIndex: 2, captureEpochMs: 167, decodedCentiseconds: 17 }
    ];
    const result = analyzeStopwatchCaptureAccuracy({ nominalFps: 12, frames, minDurationMs: 100 });
    expect(result.duplicateFrameEstimate).toBe(1);
  });

  it('is advisory when recovered time drifts beyond one frame interval', () => {
    const frames = cleanRun(12).map((f, i) => (i === 6 ? { ...f, decodedCentiseconds: f.decodedCentiseconds + 60 } : f));
    const result = analyzeStopwatchCaptureAccuracy({ nominalFps: 12, frames, minDurationMs: 500 });
    expect(result.stopwatchMaxAbsErrorMs).toBeGreaterThan(result.toleranceMs);
    expect(result.classification).toBe('advisory');
  });

  it('is insufficient with too few readable frames or too short a run', () => {
    const oneReadable = cleanRun(4).map((f, i) => (i === 0 ? f : { ...f, decodedCentiseconds: null }));
    expect(analyzeStopwatchCaptureAccuracy({ nominalFps: 12, frames: oneReadable }).classification).toBe('insufficient');
    // Readable but shorter than the default 2*fps-seconds minimum duration.
    expect(analyzeStopwatchCaptureAccuracy({ nominalFps: 12, frames: cleanRun(6) }).classification).toBe('insufficient');
  });

  it('computes over readable frames only when some strips are unreadable', () => {
    const frames = cleanRun(12).map((f, i) => (i % 3 === 1 ? { ...f, decodedCentiseconds: null } : f));
    const result = analyzeStopwatchCaptureAccuracy({ nominalFps: 12, frames, minDurationMs: 500 });
    expect(result.frameCount).toBe(12);
    expect(result.readableFrameCount).toBe(8);
  });

  it('fails closed on an empty frame set and a non-positive fps', () => {
    expect(() => analyzeStopwatchCaptureAccuracy({ nominalFps: 12, frames: [] })).toThrow(/at least one frame/);
    expect(() => analyzeStopwatchCaptureAccuracy({ nominalFps: 0, frames: cleanRun(3) })).toThrow(/positive number/);
  });

  it('handles a single frame with null interval stats and an explicit tolerance', () => {
    const result = analyzeStopwatchCaptureAccuracy({
      nominalFps: 12,
      frames: [{ frameIndex: 0, captureEpochMs: 0, decodedCentiseconds: 0 }],
      toleranceMs: 200
    });
    expect(result.frameCount).toBe(1);
    expect(result.effectiveFps).toBeNull();
    expect(result.intervalMsMean).toBeNull();
    expect(result.intervalMsMin).toBeNull();
    expect(result.intervalMsMax).toBeNull();
    expect(result.intervalMsStdDev).toBeNull();
    expect(result.stopwatchMaxAbsErrorMs).toBeNull();
    expect(result.toleranceMs).toBe(200);
    expect(result.classification).toBe('insufficient');
  });
});
