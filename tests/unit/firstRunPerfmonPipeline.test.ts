// Requirement coverage: VHS-REQ-707 (Mirror-Mode dual real-runtime validation) —
// the first-run perfmon pipeline (VHS-REQ-707.15). Deterministic: the capture
// boundary and clock are injected so the whole plan -> parse -> artifact ->
// {PR comment, TDMS model} chain runs with no process spawn or real capture.
import { describe, expect, it } from 'vitest';

import { runFirstRunPerfmonPipeline, type PerfmonCapturePlan } from '../../src/reporting/mirror/firstRunPerfmonPipeline';
import { localIsoToEpochMs } from '../../src/reporting/mirror/perfmonLabviewCorrelation';

const CSV = [
  String.raw`"(PDH-CSV 4.0) (UTC)(0)","\\H\Processor(_Total)\% Processor Time","\\H\Memory\Available MBytes","\\H\PhysicalDisk(_Total)\% Disk Time"`,
  '"07/23/2026 06:04:44.000","10","4000","5"',
  '"07/23/2026 06:04:45.000","60","3800","40"'
].join('\n');

const REQUEST = {
  collectorName: 'vihs-firstrun',
  outputCsvPath: 'C:/vihs-proof-tmp/perf.csv',
  sampleIntervalSec: 1
};

// A minimal real LabVIEW launch log: #Date process-start + execution-ready marker
// 2.973 s later (35 frames at 12 fps).
const LABVIEW_LOG = [
  '####',
  '#Date: Fri, Jul 24, 2026 11:02:31 AM',
  '#AppName: LabVIEW',
  '#AppRunMode: Headless',
  '',
  '[HeadlessManager][7/24/2026 11:02:31.179 AM] Initializing headless LabVIEW',
  'starting LabVIEW Execution System 2 Thread 0 , capacity: 24 at [3867728553.97316504, (11:02:33.973165036 2026:07:24)]'
].join('\n');
const LABVIEW_PROCESS_START_MS = localIsoToEpochMs('2026-07-24T11:02:31.000') as number;

describe('runFirstRunPerfmonPipeline (VHS-REQ-707.15)', () => {
  it('composes plan -> capture -> parse -> artifact -> {PR comment, TDMS model}', () => {
    let seenPlan: PerfmonCapturePlan | undefined;
    const result = runFirstRunPerfmonPipeline(
      {
        request: REQUEST,
        source: 'self-hosted-runner',
        actor: 'vagrant-win-x86-hostnative',
        cycles: [{ cycleIndex: 1, durationMs: 120000, outcome: 'compared' }]
      },
      {
        capture: (plan) => {
          seenPlan = plan;
          return { csvText: CSV, startMs: 1000, endMs: 176000 };
        },
        now: () => 9_999
      }
    );

    // The capture received the fully-built plan.
    expect(seenPlan?.collectorName).toBe('vihs-firstrun');
    expect(result.plan.counters).toHaveLength(3);

    // Artifact reflects the injected window + cycles.
    expect(result.artifact.source).toBe('self-hosted-runner');
    expect(result.artifact.actor).toBe('vagrant-win-x86-hostnative');
    expect(result.artifact.wallMs).toBe(175000);
    expect(result.artifact.capturedAtIso).toBe(new Date(1000).toISOString());
    expect(result.artifact.cycles).toHaveLength(1);

    // Downstream renders both surfaces.
    expect(result.prComment).toContain('### First-run performance monitor — self-hosted-runner');
    expect(result.prComment).toContain('```mermaid');
    expect(result.tdmsModel.schema).toBe('vi-history-suite/perfmon-tdms-model@v1');
    expect(result.tdmsModel.groups.map((g) => g.name)).toEqual(['resource-samples', 'run-cycles']);
  });

  it('uses cycles returned by the capture when the input omits them', () => {
    const result = runFirstRunPerfmonPipeline(
      { request: REQUEST, source: 'docker-container', actor: 'docker-x64' },
      {
        capture: () => ({ csvText: CSV, startMs: 0, endMs: 5000, cycles: [{ cycleIndex: 7, durationMs: 42, outcome: 'cache-hit' }] }),
        now: () => 0
      }
    );
    expect(result.artifact.cycles).toEqual([{ cycleIndex: 7, durationMs: 42, outcome: 'cache-hit' }]);
    expect(result.artifact.source).toBe('docker-container');
  });

  it('input cycles override capture cycles', () => {
    const result = runFirstRunPerfmonPipeline(
      { request: REQUEST, source: 'docker-container', actor: 'd', cycles: [{ cycleIndex: 1, durationMs: 1, outcome: 'input' }] },
      { capture: () => ({ csvText: CSV, cycles: [{ cycleIndex: 9, durationMs: 9, outcome: 'capture' }] }), now: () => 0 }
    );
    expect(result.artifact.cycles).toEqual([{ cycleIndex: 1, durationMs: 1, outcome: 'input' }]);
  });

  it('falls back to the default clock and a null wall when the capture returns no window', () => {
    const result = runFirstRunPerfmonPipeline(
      { request: REQUEST, source: 'self-hosted-runner', actor: 'a' },
      { capture: () => ({ csvText: CSV }) } // no now -> default Date.now; no window -> wallMs null
    );
    expect(result.artifact.wallMs).toBeNull();
    expect(result.artifact.cycles).toEqual([]);
    expect(result.artifact.capturedAtIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('treats a reversed window (endMs < startMs) as no window instead of a negative wall', () => {
    const result = runFirstRunPerfmonPipeline(
      { request: REQUEST, source: 'self-hosted-runner', actor: 'a' },
      { capture: () => ({ csvText: CSV, startMs: 176000, endMs: 1000 }), now: () => 4242 }
    );
    // endMs < startMs would compute a negative wall; the pipeline nulls it and
    // falls back to the injected clock for capturedAtIso.
    expect(result.artifact.wallMs).toBeNull();
    expect(result.artifact.capturedAtIso).toBe(new Date(4242).toISOString());
  });

  it('fails closed on a missing capture function and a non-CSV capture result', () => {
    expect(() =>
      runFirstRunPerfmonPipeline({ request: REQUEST, source: 'docker-container', actor: 'a' }, {} as never)
    ).toThrow(/requires a capture function/);
    expect(() =>
      runFirstRunPerfmonPipeline(
        { request: REQUEST, source: 'docker-container', actor: 'a' },
        { capture: () => ({ csvText: 123 as unknown as string }) }
      )
    ).toThrow(/PDH-CSV string/);
  });

  it('enriches with the LabVIEW launch correlation and stamps the TDMS when a launch log + frame stream are supplied (VHS-REQ-718)', () => {
    const result = runFirstRunPerfmonPipeline(
      {
        request: REQUEST,
        source: 'self-hosted-runner',
        actor: 'vagrant-win-x86-hostnative',
        labviewLaunch: {
          logText: LABVIEW_LOG,
          frameStream: { frameRateHz: 12, frameCount: 100, epochMsAtFrameZero: LABVIEW_PROCESS_START_MS }
        }
      },
      { capture: () => ({ csvText: CSV, startMs: 1000, endMs: 176000 }), now: () => 0 }
    );

    expect(result.launchCorrelation?.status).toBe('correlated');
    if (result.launchCorrelation?.status === 'correlated') {
      expect(result.launchCorrelation.frameCorrelation.processStartFrameIndex).toBe(0);
      expect(result.launchCorrelation.frameCorrelation.executionReadyFrameIndex).toBe(35);
    }

    // The launch/frame metadata is stamped onto the TDMS file properties.
    const fileProps = Object.fromEntries(result.tdmsModel.fileProperties.map((p) => [p.name, p.value]));
    expect(fileProps.labview_process_start_iso).toBe('2026-07-24T11:02:31.000');
    expect(fileProps.labview_execution_ready_iso).toBe('2026-07-24T11:02:33.973');
    expect(fileProps.frame_rate_hz).toBe(12);
    expect(fileProps.frame_count).toBe(100);
    expect(fileProps.epoch_ms_at_frame_zero).toBe(LABVIEW_PROCESS_START_MS);

    // The primary perfmon contract is untouched by the enrichment.
    expect(result.prComment).toContain('```mermaid');
    expect(result.artifact.wallMs).toBe(175000);
  });

  it('keeps the perfmon contract intact and reports unavailable (never throws) on a malformed launch log', () => {
    const result = runFirstRunPerfmonPipeline(
      {
        request: REQUEST,
        source: 'docker-container',
        actor: 'docker-x64',
        labviewLaunch: { logText: 'not a labview log', frameStream: { epochMsAtFrameZero: 0 } }
      },
      { capture: () => ({ csvText: CSV, startMs: 0, endMs: 5000 }), now: () => 0 }
    );
    expect(result.launchCorrelation?.status).toBe('unavailable');
    // No launch/frame properties are stamped when correlation is unavailable.
    const fileProps = Object.fromEntries(result.tdmsModel.fileProperties.map((p) => [p.name, p.value]));
    expect(fileProps.labview_process_start_iso).toBeUndefined();
    expect(fileProps.frame_rate_hz).toBeUndefined();
    // Primary artifact + PR comment still produced.
    expect(result.prComment).toContain('```mermaid');
    expect(result.tdmsModel.schema).toBe('vi-history-suite/perfmon-tdms-model@v1');
  });

  it('omits launchCorrelation and TDMS launch metadata entirely when no launch input is supplied', () => {
    const result = runFirstRunPerfmonPipeline(
      { request: REQUEST, source: 'self-hosted-runner', actor: 'a' },
      { capture: () => ({ csvText: CSV, startMs: 1000, endMs: 2000 }), now: () => 0 }
    );
    expect(result.launchCorrelation).toBeUndefined();
    const fileProps = Object.fromEntries(result.tdmsModel.fileProperties.map((p) => [p.name, p.value]));
    expect(fileProps.labview_process_start_iso).toBeUndefined();
    expect(fileProps.epoch_ms_at_frame_zero).toBeUndefined();
  });
});
