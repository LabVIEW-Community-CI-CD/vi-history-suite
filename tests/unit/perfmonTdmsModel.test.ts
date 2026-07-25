// Requirement coverage: VHS-REQ-707 (Mirror-Mode dual real-runtime validation) —
// the first-run perfmon TDMS channel model (VHS-REQ-707.13). Pure and
// deterministic: an in-memory artifact projects to a TDMS-bound channel model
// with no I/O and no writer dependency.
import { describe, expect, it } from 'vitest';

import {
  buildFirstRunPerfmonArtifact,
  parsePdhCsv,
  type FirstRunPerfmonArtifact
} from '../../src/reporting/mirror/perfmonSampleSeries';
import {
  PERFMON_TDMS_CYCLES_GROUP,
  PERFMON_TDMS_MODEL_SCHEMA,
  PERFMON_TDMS_SAMPLES_GROUP,
  buildPerfmonTdmsModel,
  renderPerfmonTdmsLayoutSummary
} from '../../src/reporting/mirror/perfmonTdmsModel';

// A two-sample PDH-CSV carrying the system counters plus a LabVIEW process.
const CSV_WITH_LABVIEW = [
  String.raw`"(PDH-CSV 4.0) (UTC)(0)","\\H\Processor(_Total)\% Processor Time","\\H\Memory\Available MBytes","\\H\PhysicalDisk(_Total)\% Disk Time","\\H\Process(LabVIEW)\% Processor Time","\\H\Process(LabVIEW)\Working Set"`,
  '"07/23/2026 06:04:44.000","10","4000","5","20","104857600"',
  '"07/23/2026 06:04:45.000","60","3800","40","75","209715200"'
].join('\n');

// System counters only (no LabVIEW process was sampled).
const CSV_SYSTEM_ONLY = [
  String.raw`"(PDH-CSV 4.0) (UTC)(0)","\\H\Processor(_Total)\% Processor Time","\\H\Memory\Available MBytes","\\H\PhysicalDisk(_Total)\% Disk Time"`,
  '"07/23/2026 06:04:44.000","10","4000","5"',
  '"07/23/2026 06:04:45.000","60","3800","40"'
].join('\n');

function artifactFrom(csv: string, extra: Partial<Parameters<typeof buildFirstRunPerfmonArtifact>[0]> = {}): FirstRunPerfmonArtifact {
  return buildFirstRunPerfmonArtifact({
    source: 'self-hosted-runner',
    actor: 'vagrant-win-x86-hostnative',
    capturedAtIso: '2026-07-23T06:04:44.000Z',
    perf: parsePdhCsv(csv),
    ...extra
  });
}

describe('buildPerfmonTdmsModel (VHS-REQ-707.13)', () => {
  it('maps every series to a channel and cadence/peaks/actor to properties', () => {
    const artifact = artifactFrom(CSV_WITH_LABVIEW, {
      wallMs: 175000,
      cycles: [
        { cycleIndex: 1, durationMs: 120000, outcome: 'compared' },
        { cycleIndex: 2, durationMs: 4000, outcome: 'cache-hit' }
      ]
    });
    const model = buildPerfmonTdmsModel(artifact);

    expect(model.schema).toBe(PERFMON_TDMS_MODEL_SCHEMA);
    expect(model.schemaVersion).toBe(1);

    const fileProps = Object.fromEntries(model.fileProperties.map((p) => [p.name, p.value]));
    expect(fileProps.source).toBe('self-hosted-runner');
    expect(fileProps.actor).toBe('vagrant-win-x86-hostnative');
    expect(fileProps.source_schema).toBe('vi-history-suite/first-run-perfmon@v1');
    expect(fileProps.sample_count).toBe(2);
    expect(fileProps.cycle_count).toBe(2);
    expect(fileProps.wall_ms).toBe(175000);

    const samples = model.groups.find((g) => g.name === PERFMON_TDMS_SAMPLES_GROUP);
    expect(samples).toBeDefined();
    const channelNames = samples!.channels.map((c) => c.name);
    expect(channelNames).toEqual([
      'time_s',
      'cpu_total_pct',
      'mem_avail_mb',
      'disk_total_pct',
      'labview_cpu_pct',
      'labview_working_set_mb'
    ]);

    const cpu = samples!.channels.find((c) => c.name === 'cpu_total_pct')!;
    expect(cpu.unit).toBe('%');
    expect(cpu.data).toEqual([10, 60]);
    const cpuProps = Object.fromEntries(cpu.properties.map((p) => [p.name, p.value]));
    expect(cpuProps.wf_increment).toBeCloseTo(1, 6);
    expect(cpuProps.wf_samples).toBe(2);
    expect(cpuProps.peak).toBe(60);

    // Working set converts bytes -> MB in the parser and rides through as a channel.
    const ws = samples!.channels.find((c) => c.name === 'labview_working_set_mb')!;
    expect(ws.data).toEqual([100, 200]);

    // time_s channel is elapsed seconds from the first sample.
    const time = samples!.channels.find((c) => c.name === 'time_s')!;
    expect(time.unit).toBe('s');
    expect(time.data).toEqual([0, 1]);
  });

  it('holds the LabVIEW-log instants + replay-frame stream as file properties when supplied (supports VHS-REQ-718)', () => {
    const model = buildPerfmonTdmsModel(artifactFrom(CSV_SYSTEM_ONLY), {
      labviewProcessStartIso: '2026-07-24T22:44:53.000',
      labviewExecutionReadyIso: '2026-07-24T22:44:53.472',
      frameRateHz: 12,
      frameCount: 240,
      epochMsAtFrameZero: 1_700_000_000_000
    });
    const fileProps = Object.fromEntries(model.fileProperties.map((p) => [p.name, p.value]));
    expect(fileProps.labview_process_start_iso).toBe('2026-07-24T22:44:53.000');
    expect(fileProps.labview_execution_ready_iso).toBe('2026-07-24T22:44:53.472');
    expect(fileProps.frame_rate_hz).toBe(12);
    expect(fileProps.frame_count).toBe(240);
    expect(fileProps.epoch_ms_at_frame_zero).toBe(1_700_000_000_000);
  });

  it('omits the absent LabVIEW/frame properties (partial metadata; null exec-ready skipped)', () => {
    const model = buildPerfmonTdmsModel(artifactFrom(CSV_SYSTEM_ONLY), {
      labviewProcessStartIso: '2026-07-24T22:44:53.000',
      labviewExecutionReadyIso: null,
      frameRateHz: 18
    });
    const fileProps = Object.fromEntries(model.fileProperties.map((p) => [p.name, p.value]));
    expect(fileProps.labview_process_start_iso).toBe('2026-07-24T22:44:53.000');
    expect(fileProps.labview_execution_ready_iso).toBeUndefined();
    expect(fileProps.frame_rate_hz).toBe(18);
    expect(fileProps.frame_count).toBeUndefined();
    expect(fileProps.epoch_ms_at_frame_zero).toBeUndefined();
  });

  it('omits all LabVIEW/frame file properties when no metadata is supplied (backward compatible)', () => {
    const fileProps = Object.fromEntries(
      buildPerfmonTdmsModel(artifactFrom(CSV_SYSTEM_ONLY)).fileProperties.map((p) => [p.name, p.value])
    );
    expect(fileProps.labview_process_start_iso).toBeUndefined();
    expect(fileProps.frame_rate_hz).toBeUndefined();
    expect(fileProps.epoch_ms_at_frame_zero).toBeUndefined();
  });

  it('holds only the supplied subset when process-start and frame-rate are omitted', () => {
    const model = buildPerfmonTdmsModel(artifactFrom(CSV_SYSTEM_ONLY), {
      labviewExecutionReadyIso: '2026-07-24T22:44:53.472',
      frameCount: 240,
      epochMsAtFrameZero: 1_700_000_000_000
    });
    const fileProps = Object.fromEntries(model.fileProperties.map((p) => [p.name, p.value]));
    expect(fileProps.labview_process_start_iso).toBeUndefined();
    expect(fileProps.frame_rate_hz).toBeUndefined();
    expect(fileProps.labview_execution_ready_iso).toBe('2026-07-24T22:44:53.472');
    expect(fileProps.frame_count).toBe(240);
    expect(fileProps.epoch_ms_at_frame_zero).toBe(1_700_000_000_000);
  });

  it('adds a run-cycles group with index + duration channels and per-cycle outcome properties', () => {
    const artifact = artifactFrom(CSV_SYSTEM_ONLY, {
      cycles: [{ cycleIndex: 1, durationMs: 90000, outcome: 'compared' }]
    });
    const model = buildPerfmonTdmsModel(artifact);
    const cycles = model.groups.find((g) => g.name === PERFMON_TDMS_CYCLES_GROUP);
    expect(cycles).toBeDefined();
    expect(cycles!.channels.map((c) => c.name)).toEqual(['cycle_index', 'duration_ms']);
    expect(cycles!.channels.find((c) => c.name === 'duration_ms')!.data).toEqual([90000]);
    const cycleProps = Object.fromEntries(cycles!.properties.map((p) => [p.name, p.value]));
    expect(cycleProps.cycle_1_outcome).toBe('compared');
    expect(cycleProps.cycle_count).toBe(1);
  });

  it('omits LabVIEW channels, the cycles group, and wall_ms for a minimal system-only artifact', () => {
    const model = buildPerfmonTdmsModel(artifactFrom(CSV_SYSTEM_ONLY));
    expect(model.groups).toHaveLength(1);
    const samples = model.groups[0];
    expect(samples.name).toBe(PERFMON_TDMS_SAMPLES_GROUP);
    expect(samples.channels.map((c) => c.name)).toEqual(['time_s', 'cpu_total_pct', 'mem_avail_mb', 'disk_total_pct']);
    const fileProps = Object.fromEntries(model.fileProperties.map((p) => [p.name, p.value]));
    expect(fileProps).not.toHaveProperty('wall_ms');
  });

  it('carries a null peak as an omitted channel property (no numeric samples)', () => {
    // A single blank warm-up sample -> the series has no numeric value -> peak null.
    const csv = [
      String.raw`"(PDH-CSV 4.0) (UTC)(0)","\\H\Processor(_Total)\% Processor Time","\\H\Memory\Available MBytes","\\H\PhysicalDisk(_Total)\% Disk Time"`,
      '"07/23/2026 06:04:44.000"," "," "," "'
    ].join('\n');
    const model = buildPerfmonTdmsModel(artifactFrom(csv));
    const cpu = model.groups[0].channels.find((c) => c.name === 'cpu_total_pct')!;
    expect(cpu.data).toEqual([null]);
    expect(cpu.properties.find((p) => p.name === 'peak')).toBeUndefined();
  });

  it('fails closed on a non-artifact and on an artifact without a parsed series', () => {
    expect(() => buildPerfmonTdmsModel(undefined as unknown as FirstRunPerfmonArtifact)).toThrow(/first-run-perfmon@v1/);
    expect(() => buildPerfmonTdmsModel({ schema: 'nope' } as unknown as FirstRunPerfmonArtifact)).toThrow(/first-run-perfmon@v1/);
    const broken = { ...artifactFrom(CSV_SYSTEM_ONLY), perf: { schema: 'bad' } } as unknown as FirstRunPerfmonArtifact;
    expect(() => buildPerfmonTdmsModel(broken)).toThrow(/parsed perfmon sample series/);
  });
});

describe('renderPerfmonTdmsLayoutSummary (VHS-REQ-707.13)', () => {
  it('lists groups, channels, units, and sample depth deterministically', () => {
    const model = buildPerfmonTdmsModel(
      artifactFrom(CSV_WITH_LABVIEW, { cycles: [{ cycleIndex: 1, durationMs: 90000, outcome: 'compared' }] })
    );
    const summary = renderPerfmonTdmsLayoutSummary(model);
    expect(summary).toContain('TDMS model vi-history-suite/perfmon-tdms-model@v1 — 2 group(s)');
    expect(summary).toContain('group "resource-samples"');
    expect(summary).toContain('cpu_total_pct %: 2 sample(s)');
    expect(summary).toContain('group "run-cycles"');
    // cycle_index has an empty unit -> no trailing unit token.
    expect(summary).toContain('cycle_index: 1 sample(s)');
  });
});
