import { describe, expect, it } from 'vitest';

import { createCycleMeter } from '../../src/reporting/runtime/cycleMeter';

describe('createCycleMeter (VHS-REQ-669.5)', () => {
  it('measures a single cycle duration and outcome with a deterministic clock', () => {
    const times = [100, 175];
    let index = 0;
    const meter = createCycleMeter(() => times[index++]);

    const handle = meter.startCycle();
    const measurement = handle.complete('rendered');

    expect(measurement.cycleIndex).toBe(1);
    expect(measurement.startedAtMs).toBe(100);
    expect(measurement.endedAtMs).toBe(175);
    expect(measurement.durationMs).toBe(75);
    expect(measurement.interCycleGapMs).toBeUndefined();
    expect(measurement.outcome).toBe('rendered');
    expect(meter.completedCycleCount).toBe(1);
  });

  it('reports the inter-cycle gap between back-to-back cycles', () => {
    // cycle 1: start 0 end 50; cycle 2: start 90 end 130 -> gap = 90 - 50 = 40.
    const times = [0, 50, 90, 130];
    let index = 0;
    const meter = createCycleMeter(() => times[index++]);

    const first = meter.startCycle().complete('rendered');
    const second = meter.startCycle().complete('command-exited-nonzero');

    expect(first.cycleIndex).toBe(1);
    expect(first.interCycleGapMs).toBeUndefined();
    expect(second.cycleIndex).toBe(2);
    expect(second.durationMs).toBe(40);
    expect(second.interCycleGapMs).toBe(40);
    expect(second.outcome).toBe('command-exited-nonzero');
    expect(meter.completedCycleCount).toBe(2);
  });

  it('throws if a cycle is completed twice', () => {
    const meter = createCycleMeter(() => 0);
    const handle = meter.startCycle();
    handle.complete('rendered');
    expect(() => handle.complete('rendered')).toThrow(/already completed/);
  });
});
