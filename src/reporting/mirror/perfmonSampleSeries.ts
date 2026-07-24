// First-time-run performance-monitor sample series (VHS-REQ-707).
//
// A pure, deterministic parser + renderer for the perfmon sample-timing artifact
// captured during a first-time comparison run, on ANY mirror actor (a Vagrant
// self-hosted runner captures via Windows `logman` PDH-CSV; a Docker container
// actor captures an equivalent counter stream). The captured samples are the
// SAME shape regardless of source, so the mirror-benchmark perf payload, the
// eventual TDMS embedding (each series is a channel; the interval + peaks are
// channel properties), and the pull-request rendering all consume one contract.
//
// Design (reporting-orchestration guardrails): raw counter text in, a normalized
// columnar series out, no I/O. The heavy capture (running logman / reading a
// counter stream) lives in the actor harness; this module stays unit-testable
// without a runtime.

import { renderFrameTimingStateChart, type FrameTimingAlignment } from './frameTimingAlignment';

export const PERFMON_SAMPLE_SERIES_SCHEMA = 'vi-history-suite/perfmon-sample-series@v1';
export const PERFMON_SAMPLE_SERIES_SCHEMA_VERSION = 1;

/** Stable, plot-ready series keys. Parallel arrays map 1:1 to TDMS channels. */
export interface PerfmonSeriesColumns {
  /** Total processor time, percent (0-100). */
  readonly cpuTotalPct: (number | null)[];
  /** Available memory, megabytes. */
  readonly memAvailMb: (number | null)[];
  /** Total physical-disk active time, percent (can exceed 100 on some hosts). */
  readonly diskTotalPct: (number | null)[];
  /** LabVIEW process processor time, percent (present only when a LabVIEW process was sampled). */
  readonly labviewCpuPct?: (number | null)[];
  /** LabVIEW process working set (total), megabytes (present only when sampled). */
  readonly labviewWorkingSetMb?: (number | null)[];
}

/** One captured PDH counter as a generic, host-independent channel. */
export interface PerfmonChannel {
  /** PDH counter path with the leading `\\HOST` stripped (host-independent). */
  readonly counterPath: string;
  /** Raw per-sample values, aligned 1:1 with the series `t` array. */
  readonly samples: (number | null)[];
  /** Maximum numeric sample over the run (null when the channel had none). */
  readonly peak: number | null;
}

export interface PerfmonSampleSeries {
  readonly schema: typeof PERFMON_SAMPLE_SERIES_SCHEMA;
  readonly schemaVersion: typeof PERFMON_SAMPLE_SERIES_SCHEMA_VERSION;
  /** Median inter-sample spacing in milliseconds (derived from timestamps). */
  readonly intervalMs: number;
  readonly sampleCount: number;
  /** Elapsed milliseconds from the first sample (TDMS time channel). */
  readonly t: number[];
  readonly series: PerfmonSeriesColumns;
  /**
   * VHS-REQ-715: every captured counter as a generic, host-independent channel
   * (the PDH path with the leading `\\HOST` stripped), in header order, with raw
   * per-sample values aligned 1:1 with `t`. This is the full-metadata surface — a
   * superset of the *counters* behind the named `series` — so a consumer can read
   * any counter the tiered capture plan recorded (e.g. per-process Private Bytes,
   * IO Read Bytes/sec, page faults), not only the five named channels. Values are
   * RAW as captured: note the named `labviewWorkingSetMb` series is byte→MB
   * converted, whereas its channel keeps the raw byte value, so `channels` is a
   * superset of the *counters* behind the named `series`, but not a value-superset
   * of the named series' transformed values. Additive: the named `series`/`peaks`
   * are unchanged and the schema id stays `@v1`.
   */
  readonly channels: readonly PerfmonChannel[];
  /** Per-series maxima over the run (null when a series had no numeric samples). */
  readonly peaks: {
    readonly cpuTotalPct: number | null;
    readonly memAvailMb: number | null;
    readonly diskTotalPct: number | null;
    readonly labviewCpuPct?: number | null;
    readonly labviewWorkingSetMb?: number | null;
  };
}

const BYTES_PER_MB = 1024 * 1024;

/** Split one PDH-CSV line into its quoted fields (values never contain commas). */
function splitPdhCsvLine(line: string): string[] {
  const fields: string[] = [];
  const matcher = /"((?:[^"]|"")*)"/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(line)) !== null) {
    fields.push(match[1].replace(/""/g, '"'));
  }
  return fields;
}

/** A blank PDH cell (empty or whitespace, e.g. the leading warm-up sample) is missing data. */
function parseCell(raw: string | undefined): number | null {
  if (raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Parse a PDH-CSV timestamp `MM/DD/YYYY HH:mm:ss.fff` to epoch milliseconds. */
function parsePdhTimestampMs(raw: string): number | null {
  const match = raw
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/u);
  if (!match) {
    return null;
  }
  const [, mm, dd, yyyy, hh, mi, ss, fff] = match;
  const ms = Date.UTC(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(mi),
    Number(ss),
    fff ? Number(fff.padEnd(3, '0')) : 0
  );
  return Number.isFinite(ms) ? ms : null;
}

type SeriesKey = 'cpuTotalPct' | 'memAvailMb' | 'diskTotalPct' | 'labviewCpuPct' | 'labviewWorkingSetMb';

/** Map a PDH counter path to a stable series key (source-independent). */
function counterKeyFor(counterPath: string): SeriesKey | null {
  const path = counterPath.toLowerCase();
  if (path.includes('\\processor(_total)\\% processor time')) {
    return 'cpuTotalPct';
  }
  if (path.includes('\\memory\\available mbytes')) {
    return 'memAvailMb';
  }
  if (path.includes('\\physicaldisk(_total)\\% disk time')) {
    return 'diskTotalPct';
  }
  if (path.includes('\\process(') && path.includes('\\% processor time')) {
    return 'labviewCpuPct';
  }
  // Map the named working-set series to the process TOTAL Working Set only, never
  // the `Working Set - Private` variant. The full profile captures BOTH counters,
  // so a loose `working set` match would be order-dependent; excluding the private
  // variant makes the named series deterministically the total working set (the
  // private counter is still preserved as a generic channel).
  if (
    path.includes('\\process(') &&
    path.includes('working set') &&
    !path.includes('working set - private')
  ) {
    return 'labviewWorkingSetMb';
  }
  return null;
}

/** Strip the leading `\\HOST` machine prefix so a counter path is host-independent. */
function normalizeCounterPath(counterPath: string): string {
  return counterPath.replace(/^\\\\[^\\]+/u, '');
}

function medianInterval(timestamps: number[]): number {
  const deltas: number[] = [];
  for (let i = 1; i < timestamps.length; i += 1) {
    const delta = timestamps[i] - timestamps[i - 1];
    if (Number.isFinite(delta) && delta > 0) {
      deltas.push(delta);
    }
  }
  if (deltas.length === 0) {
    return 0;
  }
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  return deltas.length % 2 === 0 ? Math.round((deltas[mid - 1] + deltas[mid]) / 2) : deltas[mid];
}

function peakOf(values: (number | null)[]): number | null {
  let peak: number | null = null;
  for (const value of values) {
    if (value !== null && (peak === null || value > peak)) {
      peak = value;
    }
  }
  return peak;
}

/**
 * Parse a Windows `logman` PDH-CSV 4.0 capture into a normalized, plot-ready
 * perfmon sample series. Fails closed on a document without a recognizable
 * PDH-CSV header row. Every counter column is preserved as a generic,
 * host-independent `channel` (in header order); recognized counters
 * additionally populate their stable named `series`. The LabVIEW process
 * series appear only when the capture included a matching `\Process(...)`
 * counter.
 */
export function parsePdhCsv(csvText: string): PerfmonSampleSeries {
  if (typeof csvText !== 'string' || csvText.trim().length === 0) {
    throw new Error('parsePdhCsv requires non-empty PDH-CSV text.');
  }
  const lines = csvText.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error('parsePdhCsv requires at least a header row.');
  }
  const header = splitPdhCsvLine(lines[0]);
  if (header.length < 2 || !/^\(PDH-CSV/u.test(header[0])) {
    throw new Error('parsePdhCsv header must be a PDH-CSV 4.0 counter row.');
  }
  // header[0] is the timestamp column; header[1..] are counter paths.
  const columnKeys = header.slice(1).map(counterKeyFor);
  // VHS-REQ-715: every counter column becomes a generic host-independent channel,
  // in header order, regardless of whether it maps to a named series.
  const channelPaths = header.slice(1).map(normalizeCounterPath);
  const channelSamples: (number | null)[][] = channelPaths.map(() => []);
  const timestamps: number[] = [];
  const columns: Record<SeriesKey, (number | null)[]> = {
    cpuTotalPct: [],
    memAvailMb: [],
    diskTotalPct: [],
    labviewCpuPct: [],
    labviewWorkingSetMb: []
  };
  const seen = new Set<SeriesKey>();

  for (let i = 1; i < lines.length; i += 1) {
    const fields = splitPdhCsvLine(lines[i]);
    if (fields.length === 0) {
      continue;
    }
    const tsMs = parsePdhTimestampMs(fields[0]);
    if (tsMs === null) {
      continue;
    }
    timestamps.push(tsMs);
    // Full-metadata channels: capture EVERY column's raw value this row (null when
    // absent), keeping each channel aligned 1:1 with the timestamps/`t` array.
    // Parse each cell ONCE into rowCells and reuse it for both the generic channel
    // and the recognized named series below (no per-cell double parse).
    const rowCells: (number | null)[] = new Array(channelPaths.length);
    for (let c = 0; c < channelPaths.length; c += 1) {
      const cell = parseCell(fields[c + 1]);
      rowCells[c] = cell;
      channelSamples[c].push(cell);
    }
    // Accumulate per recognized column; default missing columns to null this row.
    const rowSeen = new Set<SeriesKey>();
    for (let c = 0; c < columnKeys.length; c += 1) {
      const key = columnKeys[c];
      // Skip unrecognized columns and any counter that already populated its
      // series this row (first matching column wins, so two `Process(LabVIEW*)`
      // instances cannot double-push and misalign the parallel arrays).
      if (!key || rowSeen.has(key)) {
        continue;
      }
      let value = rowCells[c];
      if (value !== null && key === 'labviewWorkingSetMb') {
        value = Math.round((value / BYTES_PER_MB) * 100) / 100;
      }
      columns[key].push(value);
      rowSeen.add(key);
      seen.add(key);
    }
  }

  const firstTs = timestamps.length > 0 ? timestamps[0] : 0;
  const t = timestamps.map((ts) => ts - firstTs);
  const channels: PerfmonChannel[] = channelPaths.map((counterPath, i) => ({
    counterPath,
    samples: channelSamples[i],
    peak: peakOf(channelSamples[i])
  }));
  const series: PerfmonSeriesColumns = {
    cpuTotalPct: columns.cpuTotalPct,
    memAvailMb: columns.memAvailMb,
    diskTotalPct: columns.diskTotalPct,
    ...(seen.has('labviewCpuPct') ? { labviewCpuPct: columns.labviewCpuPct } : {}),
    ...(seen.has('labviewWorkingSetMb') ? { labviewWorkingSetMb: columns.labviewWorkingSetMb } : {})
  };

  return {
    schema: PERFMON_SAMPLE_SERIES_SCHEMA,
    schemaVersion: PERFMON_SAMPLE_SERIES_SCHEMA_VERSION,
    intervalMs: medianInterval(timestamps),
    sampleCount: timestamps.length,
    t,
    series,
    channels,
    peaks: {
      cpuTotalPct: peakOf(columns.cpuTotalPct),
      memAvailMb: peakOf(columns.memAvailMb),
      diskTotalPct: peakOf(columns.diskTotalPct),
      ...(seen.has('labviewCpuPct') ? { labviewCpuPct: peakOf(columns.labviewCpuPct) } : {}),
      ...(seen.has('labviewWorkingSetMb') ? { labviewWorkingSetMb: peakOf(columns.labviewWorkingSetMb) } : {})
    }
  };
}

function mermaidLine(values: (number | null)[]): string {
  // xychart-beta requires numeric points; a missing sample renders as 0.
  return `    line [${values.map((v) => (v === null ? 0 : Math.round(v * 100) / 100)).join(', ')}]`;
}

/**
 * Render a perfmon sample series as a GitHub-native Mermaid `xychart-beta` fenced
 * block so a pull request prints the first-run performance trace at runtime with
 * no external image host. CPU and disk percent share one chart; memory (MB) is a
 * second chart because its scale differs. Deterministic: identical series in,
 * identical block out.
 */
export function renderPerfmonMermaidXychart(
  series: PerfmonSampleSeries,
  options: { readonly title?: string } = {}
): string {
  const title = options.title ?? 'First-run performance monitor';
  const n = series.sampleCount;
  const xAxisMax = n > 0 ? n - 1 : 0;
  const cpuMax = Math.max(100, Math.ceil((series.peaks.cpuTotalPct ?? 0) / 10) * 10);
  const memMax = Math.max(1, Math.ceil((series.peaks.memAvailMb ?? 0) / 100) * 100);
  const lines = [
    '```mermaid',
    'xychart-beta',
    `    title "${title.replace(/"/gu, "'")} — CPU/disk % (n=${n})"`,
    `    x-axis "sample" 0 --> ${xAxisMax}`,
    `    y-axis "percent" 0 --> ${cpuMax}`,
    mermaidLine(series.series.cpuTotalPct),
    mermaidLine(series.series.diskTotalPct),
    '```',
    '',
    '```mermaid',
    'xychart-beta',
    `    title "${title.replace(/"/gu, "'")} — memory available (MB)"`,
    `    x-axis "sample" 0 --> ${xAxisMax}`,
    `    y-axis "MBytes" 0 --> ${memMax}`,
    mermaidLine(series.series.memAvailMb),
    '```'
  ];
  return lines.join('\n');
}

export const FIRST_RUN_PERFMON_ARTIFACT_SCHEMA = 'vi-history-suite/first-run-perfmon@v1';
export const FIRST_RUN_PERFMON_ARTIFACT_SCHEMA_VERSION = 1;

/** The mirror actor a first-run capture came from (both feed one artifact contract). */
export type PerfmonActorSource = 'docker-container' | 'self-hosted-runner';

/**
 * Minimal, decoupled per-cycle timing (a subset of runtime/cycleMeter's
 * CycleMeasurement) carried alongside the sample series so the artifact records
 * both the sampled resource trace and the run's own cycle timing.
 */
export interface PerfmonCycleMeasurement {
  readonly cycleIndex: number;
  readonly durationMs: number;
  readonly outcome: string;
}

/**
 * The whole first-run performance-monitor artifact: the sampled resource series,
 * the run's cycle timing, and the actor identity, from either mirror source. It
 * is the payload printed on a pull request now and embedded into TDMS later (each
 * perf series is a channel; actor, source, interval, and peaks are properties).
 */
export interface FirstRunPerfmonArtifact {
  readonly schema: typeof FIRST_RUN_PERFMON_ARTIFACT_SCHEMA;
  readonly schemaVersion: typeof FIRST_RUN_PERFMON_ARTIFACT_SCHEMA_VERSION;
  readonly source: PerfmonActorSource;
  readonly actor: string;
  readonly capturedAtIso: string;
  readonly wallMs: number | null;
  readonly perf: PerfmonSampleSeries;
  readonly cycles: readonly PerfmonCycleMeasurement[];
}

export interface BuildFirstRunPerfmonArtifactInput {
  readonly source: PerfmonActorSource;
  readonly actor: string;
  readonly capturedAtIso: string;
  readonly perf: PerfmonSampleSeries;
  readonly wallMs?: number | null;
  readonly cycles?: readonly PerfmonCycleMeasurement[];
}

/**
 * Assemble a first-run perfmon artifact, fail-closed on a bad source, actor, or a
 * series that is not a parsed perfmon sample series. Pure and deterministic.
 */
export function buildFirstRunPerfmonArtifact(
  input: BuildFirstRunPerfmonArtifactInput
): FirstRunPerfmonArtifact {
  if (input.source !== 'docker-container' && input.source !== 'self-hosted-runner') {
    throw new Error('buildFirstRunPerfmonArtifact source must be docker-container or self-hosted-runner.');
  }
  if (typeof input.actor !== 'string' || input.actor.trim().length === 0) {
    throw new Error('buildFirstRunPerfmonArtifact actor must be a non-empty string.');
  }
  if (!input.perf || input.perf.schema !== PERFMON_SAMPLE_SERIES_SCHEMA) {
    throw new Error('buildFirstRunPerfmonArtifact requires a parsed perfmon sample series.');
  }
  if (typeof input.capturedAtIso !== 'string' || input.capturedAtIso.trim().length === 0) {
    throw new Error('buildFirstRunPerfmonArtifact capturedAtIso must be a non-empty ISO timestamp.');
  }
  return {
    schema: FIRST_RUN_PERFMON_ARTIFACT_SCHEMA,
    schemaVersion: FIRST_RUN_PERFMON_ARTIFACT_SCHEMA_VERSION,
    source: input.source,
    actor: input.actor.trim(),
    capturedAtIso: input.capturedAtIso,
    wallMs: typeof input.wallMs === 'number' && Number.isFinite(input.wallMs) ? input.wallMs : null,
    perf: input.perf,
    cycles: Array.isArray(input.cycles) ? input.cycles : []
  };
}

function minOf(values: (number | null)[]): number | null {
  let min: number | null = null;
  for (const value of values) {
    if (value !== null && (min === null || value < min)) {
      min = value;
    }
  }
  return min;
}

function fmtPct(value: number | null): string {
  return value === null ? 'n/a' : `${Math.round(value * 10) / 10}%`;
}

/**
 * Render the full artifact as a self-contained pull-request comment: an actor +
 * timing header, a peak/pressure summary table, and the Mermaid xychart trace.
 * Printed on the PR at runtime for either mirror source with no external image
 * host. Deterministic.
 */
export function renderFirstRunPerfmonPrComment(
  artifact: FirstRunPerfmonArtifact,
  options: { readonly stateAlignment?: FrameTimingAlignment } = {}
): string {
  const p = artifact.perf;
  const minMem = minOf(p.series.memAvailMb);
  const cadence =
    artifact.wallMs !== null
      ? `${p.sampleCount} samples @ ~${p.intervalMs}ms, wall ${artifact.wallMs}ms`
      : `${p.sampleCount} samples @ ~${p.intervalMs}ms`;
  const table = [
    '| metric | value |',
    '| --- | ---: |',
    `| Peak CPU total | ${fmtPct(p.peaks.cpuTotalPct)} |`,
    `| Peak disk active | ${fmtPct(p.peaks.diskTotalPct)} |`,
    `| Min available memory | ${minMem === null ? 'n/a' : `${minMem} MB`} |`
  ];
  if (p.series.labviewCpuPct) {
    table.push(`| Peak LabVIEW CPU | ${fmtPct(p.peaks.labviewCpuPct ?? null)} |`);
  }
  if (p.series.labviewWorkingSetMb) {
    const peakWs = p.peaks.labviewWorkingSetMb ?? null;
    table.push(`| Peak LabVIEW working set | ${peakWs === null ? 'n/a' : `${peakWs} MB`} |`);
  }
  for (const cycle of artifact.cycles) {
    table.push(`| Cycle ${cycle.cycleIndex} (${cycle.outcome}) | ${cycle.durationMs} ms |`);
  }
  const sections = [
    `### First-run performance monitor — ${artifact.source}`,
    '',
    `- actor: \`${artifact.actor}\``,
    `- captured: ${artifact.capturedAtIso}`,
    `- cadence: ${cadence}`,
    '',
    ...table,
    '',
    renderPerfmonMermaidXychart(p, { title: `${artifact.source} first run` })
  ];
  // VHS-REQ-707.21 (#2342): when a run also carries a frame-timing alignment
  // (recorded frame stopwatch strips bound to this perf series across the
  // pipeline states), append the per-state chart. The alignment is populated by
  // the frame-recording capability sequenced in #2324; absent it, the section is
  // simply omitted rather than fabricated.
  if (options.stateAlignment) {
    sections.push(
      '',
      `#### Per-state resource pressure — ${artifact.source}`,
      '',
      renderFrameTimingStateChart(options.stateAlignment, { title: `${artifact.source} per state` })
    );
  }
  return sections.join('\n');
}
