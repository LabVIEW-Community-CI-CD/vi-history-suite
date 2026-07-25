// Requirement coverage: VHS-REQ-718.3 — the first-run perfmon <-> LabVIEW launch
// correlation stage. Pure + deterministic; TZ-independent by anchoring the
// perfmon capture start and the replay frame-zero to the SAME local instant the
// LabVIEW log reports, so cross-base deltas are exact on any host.
import { describe, expect, it } from 'vitest';

import { correlateFirstRunPerfmonLaunch } from '../../src/reporting/mirror/firstRunPerfmonLaunchCorrelation';
import { localIsoToEpochMs } from '../../src/reporting/mirror/perfmonLabviewCorrelation';

// #Date is second-precision (processStart .000); the execution-ready marker is
// 2.973 s later, so at 12 fps it lands 35 frames after process-start.
const LABVIEW_LOG = [
  '####',
  '#Date: Fri, Jul 24, 2026 11:02:31 AM',
  '#AppName: LabVIEW',
  '#Version: 26.1.2f2 64-bit',
  '#AppRunMode: Headless',
  '',
  '[HeadlessManager][7/24/2026 11:02:31.179 AM] Initializing headless LabVIEW',
  'starting LabVIEW Execution System 2 Thread 0 , capacity: 24 at [3867728553.97316504, (11:02:33.973165036 2026:07:24)]'
].join('\n');

// Same log without the execution-ready marker line.
const LABVIEW_LOG_NO_EXEC_READY = [
  '####',
  '#Date: Fri, Jul 24, 2026 11:02:31 AM',
  '#AppName: LabVIEW',
  '#AppRunMode: Headless',
  '',
  '[HeadlessManager][7/24/2026 11:02:31.179 AM] Initializing headless LabVIEW'
].join('\n');

const processStartMs = localIsoToEpochMs('2026-07-24T11:02:31.000') as number;
// Perfmon capture start = the SAME instant, expressed in UTC (as the artifact does).
const perfmonCapturedAtIso = new Date(processStartMs).toISOString();

describe('correlateFirstRunPerfmonLaunch (VHS-REQ-718.3)', () => {
  it('correlates a real launch: reconciles time bases and places markers in frames', () => {
    const out = correlateFirstRunPerfmonLaunch({
      perfmonCapturedAtIso,
      labviewLogText: LABVIEW_LOG,
      frameStream: { frameRateHz: 12, frameCount: 100, epochMsAtFrameZero: processStartMs }
    });
    expect(out.status).toBe('correlated');
    if (out.status !== 'correlated') return;

    expect(out.launchTiming.processStartIso).toBe('2026-07-24T11:02:31.000');
    expect(out.launchTiming.executionReadyIso).toBe('2026-07-24T11:02:33.973');

    // Anchored to the same instant -> exact deltas regardless of host time zone.
    expect(out.correlation.perfmonMinusProcessStartMs).toBe(0);
    expect(out.correlation.perfmonMinusExecutionReadyMs).toBe(-2973);
    expect(out.correlation.perfmonStartedBeforeProcessStart).toBe(true);

    expect(out.frameCorrelation.frameRateHz).toBe(12);
    expect(out.frameCorrelation.processStartFrameIndex).toBe(0);
    expect(out.frameCorrelation.executionReadyFrameIndex).toBe(35);
    expect(out.frameCorrelation.launchSpanFrames).toBe(35);
    expect(out.frameCorrelation.launchDeadTimeMs).toBe(2973);

    expect(out.tdmsMetadata).toEqual({
      labviewProcessStartIso: '2026-07-24T11:02:31.000',
      labviewExecutionReadyIso: '2026-07-24T11:02:33.973',
      frameRateHz: 12,
      frameCount: 100,
      epochMsAtFrameZero: processStartMs
    });
  });

  it('correlates a launch with no execution-ready marker (exec fields null/undefined)', () => {
    const out = correlateFirstRunPerfmonLaunch({
      perfmonCapturedAtIso,
      labviewLogText: LABVIEW_LOG_NO_EXEC_READY,
      frameStream: { frameRateHz: 12, frameCount: 100, epochMsAtFrameZero: processStartMs }
    });
    expect(out.status).toBe('correlated');
    if (out.status !== 'correlated') return;
    expect(out.launchTiming.executionReadyIso).toBeNull();
    expect(out.correlation.perfmonMinusExecutionReadyMs).toBeNull();
    expect(out.frameCorrelation.executionReadyFrameIndex).toBeNull();
    expect(out.frameCorrelation.launchDeadTimeMs).toBeNull();
    expect(out.tdmsMetadata.labviewExecutionReadyIso).toBeUndefined();
  });

  it('is unavailable (never throws) on a malformed LabVIEW log', () => {
    const out = correlateFirstRunPerfmonLaunch({
      perfmonCapturedAtIso,
      labviewLogText: 'not a labview log',
      frameStream: { frameRateHz: 12, frameCount: 100, epochMsAtFrameZero: 0 }
    });
    expect(out.status).toBe('unavailable');
    if (out.status !== 'unavailable') return;
    expect(out.reason).toMatch(/labview-log-parse-failed/);
  });

  it('is unavailable when the perfmon timestamp carries no explicit zone', () => {
    const out = correlateFirstRunPerfmonLaunch({
      perfmonCapturedAtIso: '2026-07-24T11:02:31.000',
      labviewLogText: LABVIEW_LOG,
      frameStream: { frameRateHz: 12, frameCount: 100, epochMsAtFrameZero: processStartMs }
    });
    expect(out.status).toBe('unavailable');
    if (out.status !== 'unavailable') return;
    expect(out.reason).toMatch(/perfmon-labview-correlation-failed/);
  });

  it('is unavailable on a non-positive replay frame rate', () => {
    const out = correlateFirstRunPerfmonLaunch({
      perfmonCapturedAtIso,
      labviewLogText: LABVIEW_LOG,
      frameStream: { frameRateHz: 0, frameCount: 100, epochMsAtFrameZero: processStartMs }
    });
    expect(out.status).toBe('unavailable');
    if (out.status !== 'unavailable') return;
    expect(out.reason).toMatch(/frame-post-verification-failed/);
  });
});
