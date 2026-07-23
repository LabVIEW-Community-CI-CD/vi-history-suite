// Requirement coverage: VHS-REQ-713 (Real Windows Full-Matrix Runtime Validation
// Host) — the deterministic 12fps-screen <-> 1Hz-perfmon timing-correlation model
// (VHS-REQ-713.7). Pure/deterministic binding of a decoded screen-frame series to
// a per-second perfmon grid.
import { describe, expect, it } from 'vitest';

import {
  TIMING_CORRELATION_SCHEMA,
  buildTimingCorrelationModel,
  type BuildTimingCorrelationInput,
  type TimingCorrelationFrame,
  type TimingCorrelationPerfmonSample
} from '../../src/reporting/mirror/timingCorrelationModel';

const FPS = 12;

// A clean 12fps capture: frame j decodes to round(j * 100 / 12) centiseconds, so
// the stopwatch advances exactly 100 cs per perfmon second.
function frames(count: number): TimingCorrelationFrame[] {
  return Array.from({ length: count }, (_, j) => ({
    frameIndex: j,
    decodedCentiseconds: Math.round((j * 100) / FPS),
    wellFormed: true
  }));
}

function perfmon(seconds: number): TimingCorrelationPerfmonSample[] {
  return Array.from({ length: seconds }, (_, i) => ({
    cpuTotalPct: 30 + (i % 5),
    memAvailMb: 9000 - i,
    diskTotalPct: 2 + (i % 3),
    diskWriteBytesPerSec: 2_600_000 + i * 1000
  }));
}

function baseInput(secondsCount = 60): BuildTimingCorrelationInput {
  return {
    fps: FPS,
    sampleIntervalSec: 1,
    frames: frames(secondsCount * FPS),
    perfmon: perfmon(secondsCount),
    effectiveFps: 12,
    stopwatchClassification: 'authoritative'
  };
}

describe('buildTimingCorrelationModel (VHS-REQ-713.7)', () => {
  it('binds a 60s 12fps capture to 60 perfmon seconds with 12 frames and a 100cs stopwatch delta each second', () => {
    const model = buildTimingCorrelationModel(baseInput(60));
    expect(model.schema).toBe(TIMING_CORRELATION_SCHEMA);
    expect(model.fps).toBe(12);
    expect(model.seconds).toHaveLength(60);
    for (const second of model.seconds) {
      expect(second.framesInSecond).toBe(12);
    }
    // Deltas: null for the first second, exactly 100 thereafter.
    expect(model.seconds[0].observedDeltaCs).toBeNull();
    for (const second of model.seconds.slice(1)) {
      expect(second.observedDeltaCs).toBe(100);
    }
    expect(model.signature.medianFramesPerSecond).toBe(12);
    expect(model.signature.medianObservedDeltaCs).toBe(100);
    expect(model.signature.frameCount).toBe(720);
    expect(model.signature.wellFormedFrameCount).toBe(720);
    expect(model.signature.perfmonSampleCount).toBe(60);
    expect(model.signature.effectiveFps).toBe(12);
    expect(model.signature.stopwatchClassification).toBe('authoritative');
    expect(model.signature.meanCpuPct).toBeGreaterThan(29);
  });

  it('is deterministic: identical input yields identical output (VHS-REQ-713.7)', () => {
    expect(buildTimingCorrelationModel(baseInput(5))).toEqual(buildTimingCorrelationModel(baseInput(5)));
  });

  it('scales the per-sample frame window by sampleIntervalSec (VHS-REQ-713.7)', () => {
    // 2s sample interval at 12fps -> 24 frames per perfmon sample; stopwatch
    // advances ~200 centiseconds per 2s sample.
    const model = buildTimingCorrelationModel({
      fps: FPS,
      sampleIntervalSec: 2,
      frames: frames(3 * FPS * 2),
      perfmon: perfmon(3),
      effectiveFps: 12,
      stopwatchClassification: 'authoritative'
    });
    expect(model.seconds).toHaveLength(3);
    for (const second of model.seconds) {
      expect(second.framesInSecond).toBe(24);
    }
    expect(model.seconds[1].observedDeltaCs).toBe(200);
    expect(model.seconds[2].observedDeltaCs).toBe(200);
  });

  it('does not borrow a later second reading across a decode gap in a second (VHS-REQ-713.7)', () => {
    const input: BuildTimingCorrelationInput = {
      ...baseInput(2),
      // Second 0 (frames 0..11) all fail to decode; second 1 decodes.
      frames: frames(24).map((f) => (f.frameIndex < FPS ? { ...f, decodedCentiseconds: null, wellFormed: false } : f))
    };
    const model = buildTimingCorrelationModel(input);
    expect(model.seconds[0].framesInSecond).toBe(0);
    expect(model.seconds[0].observedStopwatchCs).toBeNull();
    expect(model.seconds[1].observedStopwatchCs).toBe(100);
    // No previous observed reading, so the delta stays null rather than fabricated.
    expect(model.seconds[1].observedDeltaCs).toBeNull();
  });

  it('carries the paired resource sample into each correlation second (VHS-REQ-713.7)', () => {
    const model = buildTimingCorrelationModel(baseInput(3));
    expect(model.seconds[0].cpuTotalPct).toBe(30);
    expect(model.seconds[0].diskWriteBytesPerSec).toBe(2_600_000);
    expect(model.seconds[2].diskWriteBytesPerSec).toBe(2_602_000);
  });

  it('fails closed on invalid inputs (VHS-REQ-713.7)', () => {
    expect(() => buildTimingCorrelationModel({ ...baseInput(1), fps: 0 })).toThrow(/fps must be a positive integer/);
    expect(() => buildTimingCorrelationModel({ ...baseInput(1), fps: 1.5 })).toThrow(/fps must be a positive integer/);
    expect(() => buildTimingCorrelationModel({ ...baseInput(1), sampleIntervalSec: 0 })).toThrow(
      /sampleIntervalSec must be a positive integer/
    );
    expect(() => buildTimingCorrelationModel({ ...baseInput(1), perfmon: [] })).toThrow(
      /perfmon must be a non-empty sample array/
    );
    // frames must be an array (line-guard branch).
    expect(() =>
      buildTimingCorrelationModel({ ...baseInput(1), frames: undefined as unknown as TimingCorrelationFrame[] })
    ).toThrow(/frames must be an array/);
  });

  it('passes through null effective fps and classification when the analyzer values are omitted (VHS-REQ-713.7)', () => {
    const model = buildTimingCorrelationModel({
      fps: FPS,
      sampleIntervalSec: 1,
      frames: frames(FPS),
      perfmon: perfmon(1)
    });
    expect(model.signature.effectiveFps).toBeNull();
    expect(model.signature.stopwatchClassification).toBeNull();
  });

  it('folds null perfmon channels and unreadable frames to null aggregates (VHS-REQ-713.7)', () => {
    const nullPerfmon: TimingCorrelationPerfmonSample[] = Array.from({ length: 3 }, () => ({
      cpuTotalPct: null,
      memAvailMb: null,
      diskTotalPct: null,
      diskWriteBytesPerSec: null
    }));
    const unreadableFrames: TimingCorrelationFrame[] = Array.from({ length: 3 * FPS }, (_, j) => ({
      frameIndex: j,
      decodedCentiseconds: null,
      wellFormed: false
    }));
    const model = buildTimingCorrelationModel({
      fps: FPS,
      sampleIntervalSec: 1,
      frames: unreadableFrames,
      perfmon: nullPerfmon
    });
    expect(model.signature.wellFormedFrameCount).toBe(0);
    expect(model.signature.medianFramesPerSecond).toBe(0);
    // All deltas/resources are null -> the median/mean/peak helpers return null.
    expect(model.signature.medianObservedDeltaCs).toBeNull();
    expect(model.signature.meanObservedDeltaCs).toBeNull();
    expect(model.signature.meanCpuPct).toBeNull();
    expect(model.signature.peakCpuPct).toBeNull();
    expect(model.signature.meanDiskWriteBytesPerSec).toBeNull();
    expect(model.seconds[0].observedStopwatchCs).toBeNull();
    expect(model.seconds[0].cpuTotalPct).toBeNull();
  });

  it('treats a well-formed frame carrying a null decoded reading as unread (VHS-REQ-713.7)', () => {
    // All frames report wellFormed but never decode a numeric centiseconds value.
    const wellFormedButNull: TimingCorrelationFrame[] = Array.from({ length: FPS }, (_, j) => ({
      frameIndex: j,
      decodedCentiseconds: null,
      wellFormed: true
    }));
    const model = buildTimingCorrelationModel({
      fps: FPS,
      sampleIntervalSec: 1,
      frames: wellFormedButNull,
      perfmon: perfmon(1)
    });
    expect(model.seconds[0].framesInSecond).toBe(FPS);
    expect(model.seconds[0].observedStopwatchCs).toBeNull();
  });

  it('rejects a non-finite decoded reading (NaN/Infinity) as unread (VHS-REQ-713.7)', () => {
    // A well-formed frame whose decode produced NaN/Infinity must not propagate
    // into observedStopwatchCs/observedDeltaCs (fail closed on malformed decode).
    const nonFinite: TimingCorrelationFrame[] = Array.from({ length: FPS }, (_, j) => ({
      frameIndex: j,
      decodedCentiseconds: j % 2 === 0 ? Number.NaN : Number.POSITIVE_INFINITY,
      wellFormed: true
    }));
    const model = buildTimingCorrelationModel({
      fps: FPS,
      sampleIntervalSec: 1,
      frames: nonFinite,
      perfmon: perfmon(1)
    });
    expect(model.seconds[0].framesInSecond).toBe(FPS);
    expect(model.seconds[0].observedStopwatchCs).toBeNull();
  });
});
