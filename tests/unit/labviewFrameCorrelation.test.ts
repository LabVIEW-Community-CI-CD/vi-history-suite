import { describe, expect, it } from 'vitest';

import {
  frameIndexOf,
  postVerifyLabviewFrameCorrelation
} from '../../src/reporting/mirror/labviewFrameCorrelation';

// Frame zero at epoch 0; LabVIEW process-start at 1500ms, execution-ready at
// 1500+2794 = 4294ms.
const input = (frameRateHz: number, frameCount = 100000) => ({
  frame: { frameRateHz, frameCount, epochMsAtFrameZero: 0 },
  labview: { processStartEpochMs: 1500, executionReadyEpochMs: 4294 }
});

describe('postVerifyLabviewFrameCorrelation (VHS-REQ-718.2)', () => {
  it('12 fps is viable: LabVIEW events map to bounded, sensible frame indexes', () => {
    const r = postVerifyLabviewFrameCorrelation(input(12));
    expect(r.frameRateHz).toBe(12);
    expect(Math.abs(r.frameIntervalMs - 83.3333)).toBeLessThan(1e-3);
    expect(r.processStartFrameIndex).toBe(18);
    expect(r.executionReadyFrameIndex).toBe(51);
    expect(r.launchSpanFrames).toBe(33);
    expect(r.launchDeadTimeMs).toBe(2794);
    expect(r.processStartQuantizationErrorMs).toBe(0);
    expect(Math.abs((r.executionReadyQuantizationErrorMs as number) - 44)).toBeLessThan(1e-6);
    expect(r.processStartWithinFrameWindow).toBe(true);
    expect(r.executionReadyWithinFrameWindow).toBe(true);
  });

  it('18 fps sharpens localization vs 12 fps (the measured difference)', () => {
    const r12 = postVerifyLabviewFrameCorrelation(input(12));
    const r18 = postVerifyLabviewFrameCorrelation(input(18));
    expect(r18.processStartFrameIndex).toBe(27);
    expect(r18.executionReadyFrameIndex).toBe(77);
    expect(r18.launchSpanFrames).toBe(50);
    expect(Math.abs((r18.executionReadyQuantizationErrorMs as number) - 16.2222)).toBeLessThan(1e-3);
    expect(r18.executionReadyQuantizationErrorMs as number).toBeLessThan(
      r12.executionReadyQuantizationErrorMs as number
    );
    expect(r18.launchSpanFrames as number).toBeGreaterThan(r12.launchSpanFrames as number);
    expect(r18.frameIntervalMs).toBeLessThan(r12.frameIntervalMs);
  });

  it('defaults to the mprr 12 fps replay rate when frameRateHz is omitted', () => {
    const r = postVerifyLabviewFrameCorrelation({
      frame: { epochMsAtFrameZero: 0, frameCount: 100000 },
      labview: { processStartEpochMs: 1500, executionReadyEpochMs: 4294 }
    });
    expect(r.frameRateHz).toBe(12);
    expect(r.processStartFrameIndex).toBe(18);
  });

  it('unmaps (null) an event beyond the captured frame window, not clamped', () => {
    const r = postVerifyLabviewFrameCorrelation(input(12, 20));
    expect(r.executionReadyFrameIndex).toBeNull();
    expect(r.executionReadyWithinFrameWindow).toBe(false);
    expect(r.processStartFrameIndex).toBe(18);
  });

  it('unmaps (null) an event before frame zero', () => {
    expect(frameIndexOf(-10, 0, 1000 / 12, null).frameIndex).toBeNull();
  });

  it('unmaps (null) a non-finite instant in frameIndexOf', () => {
    expect(frameIndexOf(Number.POSITIVE_INFINITY, 0, 1000 / 12, null).frameIndex).toBeNull();
  });

  it('treats an omitted frameCount as an unbounded window (frameCount reported null)', () => {
    const r = postVerifyLabviewFrameCorrelation({
      frame: { frameRateHz: 12, epochMsAtFrameZero: 0 },
      labview: { processStartEpochMs: 1500, executionReadyEpochMs: 4294 }
    });
    expect(r.frameCount).toBeNull();
    expect(r.processStartFrameIndex).toBe(18);
    expect(r.executionReadyFrameIndex).toBe(51);
    expect(r.processStartWithinFrameWindow).toBe(true);
  });

  it('handles a launch with no execution-ready marker (span/dead-time/exec fields null)', () => {
    const r = postVerifyLabviewFrameCorrelation({
      frame: { frameRateHz: 12, epochMsAtFrameZero: 0, frameCount: 100 },
      labview: { processStartEpochMs: 1500 }
    });
    expect(r.processStartFrameIndex).toBe(18);
    expect(r.executionReadyFrameIndex).toBeNull();
    expect(r.executionReadyQuantizationErrorMs).toBeNull();
    expect(r.launchSpanFrames).toBeNull();
    expect(r.launchDeadTimeMs).toBeNull();
    expect(r.executionReadyWithinFrameWindow).toBeNull();
  });

  it('treats a non-finite execution-ready marker as absent', () => {
    const r = postVerifyLabviewFrameCorrelation({
      frame: { frameRateHz: 12, epochMsAtFrameZero: 0, frameCount: 100 },
      labview: { processStartEpochMs: 1500, executionReadyEpochMs: Number.NaN }
    });
    expect(r.executionReadyFrameIndex).toBeNull();
    expect(r.launchDeadTimeMs).toBeNull();
  });

  it('fails closed on a bad frame rate or missing process-start', () => {
    expect(() =>
      postVerifyLabviewFrameCorrelation({
        frame: { frameRateHz: 0, epochMsAtFrameZero: 0, frameCount: 100 },
        labview: { processStartEpochMs: 1500 }
      })
    ).toThrow(/frameRateHz/);
    expect(() =>
      postVerifyLabviewFrameCorrelation({
        frame: { frameRateHz: Number.NaN, epochMsAtFrameZero: 0, frameCount: 100 },
        labview: { processStartEpochMs: 1500 }
      })
    ).toThrow(/frameRateHz/);
    expect(() =>
      postVerifyLabviewFrameCorrelation({
        frame: { frameRateHz: 12, epochMsAtFrameZero: Number.NaN, frameCount: 100 },
        labview: { processStartEpochMs: 1500 }
      })
    ).toThrow(/epochMsAtFrameZero/);
    expect(() =>
      postVerifyLabviewFrameCorrelation({
        frame: { frameRateHz: 12, epochMsAtFrameZero: 0, frameCount: 100 },
        labview: undefined as unknown as { processStartEpochMs: number }
      })
    ).toThrow(/processStartEpochMs/);
    expect(() =>
      postVerifyLabviewFrameCorrelation({
        frame: { frameRateHz: 12, epochMsAtFrameZero: 0, frameCount: 100 },
        labview: { processStartEpochMs: Number.NaN }
      })
    ).toThrow(/processStartEpochMs/);
  });
});
