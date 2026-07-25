import { describe, expect, it } from 'vitest';

import {
  correlatePerfmonWithLabviewLog,
  localIsoToEpochMs,
  utcIsoToEpochMs
} from '../../src/reporting/mirror/perfmonLabviewCorrelation';

// Format an epoch to a LOCAL wall-clock ISO (no zone), mirroring the LabVIEW log,
// so the cross-base assertions hold regardless of the host time zone.
function toLocalIso(epochMs: number): string {
  const d = new Date(epochMs);
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  return `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(
    d.getMinutes()
  )}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

describe('correlatePerfmonWithLabviewLog (VHS-REQ-718.1)', () => {
  it('round-trips a local ISO through local epoch (host-TZ independent)', () => {
    const epoch = Date.UTC(2026, 6, 24, 15, 2, 31, 179);
    expect(localIsoToEpochMs(toLocalIso(epoch))).toBe(epoch);
  });

  it('parses a UTC ISO with an explicit zone but rejects a zone-less one', () => {
    expect(utcIsoToEpochMs('1970-01-01T00:00:01.000Z')).toBe(1000);
    expect(utcIsoToEpochMs('2026-07-24T15:02:30.000')).toBeNull();
  });

  it('utcIsoToEpochMs handles offset zones and rejects empty/non-string/unparseable input', () => {
    expect(utcIsoToEpochMs('1970-01-01T00:00:01.000+00:00')).toBe(1000);
    expect(utcIsoToEpochMs('1970-01-01T01:00:01.000+0100')).toBe(1000);
    expect(utcIsoToEpochMs('')).toBeNull();
    expect(utcIsoToEpochMs('   ')).toBeNull();
    expect(utcIsoToEpochMs(undefined as unknown as string)).toBeNull();
    // Passes the zone regex but is not a real date -> Date.parse NaN -> null.
    expect(utcIsoToEpochMs('2026-13-40T25:61:61.000Z')).toBeNull();
  });

  it('localIsoToEpochMs accepts a fraction-less local ISO and rejects non-string input', () => {
    expect(localIsoToEpochMs('2026-07-24T15:02:30')).toBe(
      new Date(2026, 6, 24, 15, 2, 30, 0).getTime()
    );
    expect(localIsoToEpochMs(undefined as unknown as string)).toBeNull();
  });

  it('correlates across time bases (UTC perfmon vs LOCAL labview), TZ-independent', () => {
    const processStartMs = Date.UTC(2026, 6, 24, 15, 2, 31);
    const perfmonMs = processStartMs - 5000;
    const executionReadyMs = processStartMs + 2794;
    const res = correlatePerfmonWithLabviewLog({
      perfmonCapturedAtIso: new Date(perfmonMs).toISOString(),
      labview: {
        processStartIso: toLocalIso(processStartMs),
        executionReadyIso: toLocalIso(executionReadyMs)
      }
    });
    expect(res.perfmonMinusProcessStartMs).toBe(-5000);
    expect(res.perfmonMinusExecutionReadyMs).toBe(-5000 - 2794);
    expect(res.perfmonStartedBeforeProcessStart).toBe(true);
    expect(res.perfmonStartedBeforeExecutionReady).toBe(true);
  });

  it('reports null execution-ready delta when the marker is absent', () => {
    const res = correlatePerfmonWithLabviewLog({
      perfmonCapturedAtIso: new Date(Date.UTC(2026, 6, 24, 15, 2, 30)).toISOString(),
      labview: { processStartIso: toLocalIso(Date.UTC(2026, 6, 24, 15, 2, 31)), executionReadyIso: null }
    });
    expect(res.perfmonMinusExecutionReadyMs).toBeNull();
    expect(res.perfmonStartedBeforeExecutionReady).toBeNull();
  });

  it('reports the perfmon capture starting AFTER the LabVIEW launch (positive delta, flags false)', () => {
    const processStartMs = Date.UTC(2026, 6, 24, 15, 2, 31);
    const perfmonMs = processStartMs + 5000;
    const res = correlatePerfmonWithLabviewLog({
      perfmonCapturedAtIso: new Date(perfmonMs).toISOString(),
      labview: {
        processStartIso: toLocalIso(processStartMs),
        executionReadyIso: toLocalIso(processStartMs + 1000)
      }
    });
    expect(res.perfmonMinusProcessStartMs).toBe(5000);
    expect(res.perfmonStartedBeforeProcessStart).toBe(false);
    expect(res.perfmonStartedBeforeExecutionReady).toBe(false);
  });

  it('yields a null execution-ready delta when the marker is present but unparseable', () => {
    const res = correlatePerfmonWithLabviewLog({
      perfmonCapturedAtIso: '2026-07-24T15:02:30.000Z',
      labview: { processStartIso: toLocalIso(Date.UTC(2026, 6, 24, 15, 2, 31)), executionReadyIso: 'not-a-timestamp' }
    });
    expect(res.labviewExecutionReadyIso).toBe('not-a-timestamp');
    expect(res.perfmonMinusExecutionReadyMs).toBeNull();
    expect(res.perfmonStartedBeforeExecutionReady).toBeNull();
  });

  it('fails closed on a zone-less perfmon timestamp', () => {
    expect(() =>
      correlatePerfmonWithLabviewLog({
        perfmonCapturedAtIso: '2026-07-24T15:02:30.000',
        labview: { processStartIso: '2026-07-24T15:02:31.000', executionReadyIso: null }
      })
    ).toThrow(/perfmonCapturedAtIso/);
  });

  it('fails closed on a missing process-start marker', () => {
    expect(() =>
      correlatePerfmonWithLabviewLog({
        perfmonCapturedAtIso: '2026-07-24T15:02:30.000Z',
        labview: { processStartIso: 'not-a-timestamp', executionReadyIso: null }
      })
    ).toThrow(/processStartIso/);
  });
});
