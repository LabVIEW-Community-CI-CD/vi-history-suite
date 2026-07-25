// First-run perfmon TDMS channel model (VHS-REQ-707).
//
// Projects a first-run-perfmon@v1 artifact into a TDMS-bound channel model: each
// perfmon sample series becomes a numeric channel, the run's cadence + peaks +
// actor identity become file/group/channel properties, and the per-cycle timing
// becomes a second channel group. This is the "channel-per-series foundation for
// the eventual TDMS embedding" made concrete: a real TDMS writer (NI TDMS API or
// an `.tdms` library) consumes this model without re-deriving anything.
//
// Design (reporting-orchestration guardrails): pure and deterministic, no I/O and
// no writer dependency. The model is data-at-rest a downstream writer serializes;
// missing samples stay `null` so the writer maps them to the TDMS no-value.

import {
  FIRST_RUN_PERFMON_ARTIFACT_SCHEMA,
  PERFMON_SAMPLE_SERIES_SCHEMA,
  type FirstRunPerfmonArtifact
} from './perfmonSampleSeries';

export const PERFMON_TDMS_MODEL_SCHEMA = 'vi-history-suite/perfmon-tdms-model@v1';
export const PERFMON_TDMS_MODEL_SCHEMA_VERSION = 1;

/** TDMS property values are scalar (string or float/int). */
export type PerfmonTdmsPropertyValue = string | number;

export interface PerfmonTdmsProperty {
  readonly name: string;
  readonly value: PerfmonTdmsPropertyValue;
}

/** One TDMS channel: a named numeric column plus its properties. `null` = no-value. */
export interface PerfmonTdmsChannel {
  readonly name: string;
  readonly unit: string;
  readonly description: string;
  readonly data: readonly (number | null)[];
  readonly properties: readonly PerfmonTdmsProperty[];
}

export interface PerfmonTdmsGroup {
  readonly name: string;
  readonly properties: readonly PerfmonTdmsProperty[];
  readonly channels: readonly PerfmonTdmsChannel[];
}

export interface PerfmonTdmsModel {
  readonly schema: typeof PERFMON_TDMS_MODEL_SCHEMA;
  readonly schemaVersion: typeof PERFMON_TDMS_MODEL_SCHEMA_VERSION;
  readonly fileProperties: readonly PerfmonTdmsProperty[];
  readonly groups: readonly PerfmonTdmsGroup[];
}

/** Stable TDMS group names. */
export const PERFMON_TDMS_SAMPLES_GROUP = 'resource-samples';
export const PERFMON_TDMS_CYCLES_GROUP = 'run-cycles';

interface ChannelSpec {
  readonly name: string;
  readonly unit: string;
  readonly description: string;
  readonly data: readonly (number | null)[];
  readonly peak: number | null;
}

/** Build a value channel, attaching cadence properties and a peak when present. */
function toChannel(spec: ChannelSpec, intervalSec: number): PerfmonTdmsChannel {
  const properties: PerfmonTdmsProperty[] = [
    { name: 'unit_string', value: spec.unit },
    { name: 'NI_ChannelName', value: spec.name },
    { name: 'description', value: spec.description },
    { name: 'wf_increment', value: intervalSec },
    { name: 'wf_start_offset', value: 0 },
    { name: 'wf_samples', value: spec.data.length }
  ];
  if (spec.peak !== null) {
    properties.push({ name: 'peak', value: spec.peak });
  }
  return {
    name: spec.name,
    unit: spec.unit,
    description: spec.description,
    data: spec.data,
    properties
  };
}

/**
 * Optional LabVIEW-log + replay-frame metadata the TDMS holds alongside the
 * perfmon series (VHS-REQ-718): the deterministic LabVIEW launch instants and
 * the replay-frame stream descriptor, so post-verification
 * (labviewFrameCorrelation) can correlate the LabVIEW-log timestamps to
 * individual frame indexes.
 */
export interface PerfmonTdmsLabviewFrameMetadata {
  readonly labviewProcessStartIso?: string;
  readonly labviewExecutionReadyIso?: string | null;
  readonly frameRateHz?: number;
  readonly frameCount?: number;
  readonly epochMsAtFrameZero?: number;
}

/**
 * Project a first-run perfmon artifact into a TDMS channel model. Fail-closed on
 * anything that is not a first-run-perfmon@v1 artifact carrying a parsed series.
 * Pure and deterministic: identical artifact (and metadata) in, identical model
 * out. When `metadata` is supplied (VHS-REQ-718.3), the LabVIEW-log instants and
 * the replay-frame stream descriptor are added as file properties so the TDMS
 * holds both the perfmon series and the launch/frame correlation inputs.
 */
export function buildPerfmonTdmsModel(
  artifact: FirstRunPerfmonArtifact,
  metadata?: PerfmonTdmsLabviewFrameMetadata
): PerfmonTdmsModel {
  if (!artifact || artifact.schema !== FIRST_RUN_PERFMON_ARTIFACT_SCHEMA) {
    throw new Error('buildPerfmonTdmsModel requires a first-run-perfmon@v1 artifact.');
  }
  const perf = artifact.perf;
  if (!perf || perf.schema !== PERFMON_SAMPLE_SERIES_SCHEMA) {
    throw new Error('buildPerfmonTdmsModel requires a parsed perfmon sample series.');
  }

  const intervalSec = Math.round((perf.intervalMs / 1000) * 1_000_000) / 1_000_000;

  const fileProperties: PerfmonTdmsProperty[] = [
    { name: 'schema', value: PERFMON_TDMS_MODEL_SCHEMA },
    { name: 'source_schema', value: FIRST_RUN_PERFMON_ARTIFACT_SCHEMA },
    { name: 'source', value: artifact.source },
    { name: 'actor', value: artifact.actor },
    { name: 'captured_at_iso', value: artifact.capturedAtIso },
    { name: 'interval_ms', value: perf.intervalMs },
    { name: 'sample_count', value: perf.sampleCount },
    { name: 'cycle_count', value: artifact.cycles.length }
  ];
  if (artifact.wallMs !== null) {
    fileProperties.push({ name: 'wall_ms', value: artifact.wallMs });
  }
  // VHS-REQ-718.3: hold the LabVIEW-log instants + replay-frame stream descriptor
  // so the TDMS carries both the perfmon series and the launch/frame correlation
  // inputs post-verification consumes.
  if (metadata) {
    if (typeof metadata.labviewProcessStartIso === 'string') {
      fileProperties.push({ name: 'labview_process_start_iso', value: metadata.labviewProcessStartIso });
    }
    if (typeof metadata.labviewExecutionReadyIso === 'string') {
      fileProperties.push({ name: 'labview_execution_ready_iso', value: metadata.labviewExecutionReadyIso });
    }
    if (typeof metadata.frameRateHz === 'number') {
      fileProperties.push({ name: 'frame_rate_hz', value: metadata.frameRateHz });
    }
    if (typeof metadata.frameCount === 'number') {
      fileProperties.push({ name: 'frame_count', value: metadata.frameCount });
    }
    if (typeof metadata.epochMsAtFrameZero === 'number') {
      fileProperties.push({ name: 'epoch_ms_at_frame_zero', value: metadata.epochMsAtFrameZero });
    }
  }

  const channelSpecs: ChannelSpec[] = [
    { name: 'time_s', unit: 's', description: 'Elapsed time from the first sample', data: perf.t.map((ms) => Math.round((ms / 1000) * 1000) / 1000), peak: null },
    { name: 'cpu_total_pct', unit: '%', description: 'Total processor time', data: perf.series.cpuTotalPct, peak: perf.peaks.cpuTotalPct },
    { name: 'mem_avail_mb', unit: 'MB', description: 'Available memory', data: perf.series.memAvailMb, peak: perf.peaks.memAvailMb },
    { name: 'disk_total_pct', unit: '%', description: 'Total physical-disk active time', data: perf.series.diskTotalPct, peak: perf.peaks.diskTotalPct }
  ];
  if (perf.series.labviewCpuPct) {
    channelSpecs.push({
      name: 'labview_cpu_pct',
      unit: '%',
      description: 'LabVIEW process processor time',
      data: perf.series.labviewCpuPct,
      peak: perf.peaks.labviewCpuPct ?? null
    });
  }
  if (perf.series.labviewWorkingSetMb) {
    channelSpecs.push({
      name: 'labview_working_set_mb',
      unit: 'MB',
      description: 'LabVIEW process working set',
      data: perf.series.labviewWorkingSetMb,
      peak: perf.peaks.labviewWorkingSetMb ?? null
    });
  }

  const samplesGroup: PerfmonTdmsGroup = {
    name: PERFMON_TDMS_SAMPLES_GROUP,
    properties: [
      { name: 'source', value: artifact.source },
      { name: 'actor', value: artifact.actor },
      { name: 'interval_ms', value: perf.intervalMs },
      { name: 'sample_count', value: perf.sampleCount }
    ],
    channels: channelSpecs.map((spec) => toChannel(spec, intervalSec))
  };

  const groups: PerfmonTdmsGroup[] = [samplesGroup];

  if (artifact.cycles.length > 0) {
    const cycleProperties: PerfmonTdmsProperty[] = [{ name: 'cycle_count', value: artifact.cycles.length }];
    for (const cycle of artifact.cycles) {
      cycleProperties.push({ name: `cycle_${cycle.cycleIndex}_outcome`, value: cycle.outcome });
    }
    groups.push({
      name: PERFMON_TDMS_CYCLES_GROUP,
      properties: cycleProperties,
      channels: [
        {
          name: 'cycle_index',
          unit: '',
          description: 'Run cycle index',
          data: artifact.cycles.map((cycle) => cycle.cycleIndex),
          properties: [{ name: 'unit_string', value: '' }, { name: 'wf_samples', value: artifact.cycles.length }]
        },
        {
          name: 'duration_ms',
          unit: 'ms',
          description: 'Cycle wall duration',
          data: artifact.cycles.map((cycle) => cycle.durationMs),
          properties: [{ name: 'unit_string', value: 'ms' }, { name: 'wf_samples', value: artifact.cycles.length }]
        }
      ]
    });
  }

  return {
    schema: PERFMON_TDMS_MODEL_SCHEMA,
    schemaVersion: PERFMON_TDMS_MODEL_SCHEMA_VERSION,
    fileProperties,
    groups
  };
}

/**
 * Render a compact, deterministic text summary of a TDMS model's layout (groups,
 * channels, and sample depth) so the eventual embedding target is legible in a
 * pull request or a log without opening the binary.
 */
export function renderPerfmonTdmsLayoutSummary(model: PerfmonTdmsModel): string {
  const lines = [`TDMS model ${model.schema} — ${model.groups.length} group(s)`];
  for (const group of model.groups) {
    lines.push(`- group "${group.name}" (${group.channels.length} channel(s), ${group.properties.length} propertie(s))`);
    for (const channel of group.channels) {
      const unit = channel.unit.length > 0 ? ` ${channel.unit}` : '';
      lines.push(`  - ${channel.name}${unit}: ${channel.data.length} sample(s)`);
    }
  }
  return lines.join('\n');
}
