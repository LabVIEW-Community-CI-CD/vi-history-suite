// Cross-session perfmon pattern for agent troubleshooting (VHS-REQ-707).
//
// The consumer of the perfmon record is the AGENT: over multiple interactive
// sessions with a human, the agent needs longitudinal resource context (CPU, RAM,
// disk, LabVIEW footprint) correlated across sessions so it can recognize a
// PATTERN — a memory leak creeping up, rising CPU pressure, or an anomalous
// session — and interpret it while troubleshooting. This module turns a series of
// per-session perfmon summaries into a deterministic, schema-versioned pattern the
// MCP hands the agent (the bounded-RAM ring is how the raw replay is consumed
// without overflowing; this is what the agent reasons over).
//
// Design (reporting-orchestration guardrails): pure and deterministic, no I/O.

import {
  FIRST_RUN_PERFMON_ARTIFACT_SCHEMA,
  type FirstRunPerfmonArtifact,
  type PerfmonActorSource
} from './perfmonSampleSeries';

export const PERFMON_SESSION_PATTERN_SCHEMA = 'vi-history-suite/perfmon-session-pattern@v1';
export const PERFMON_SESSION_PATTERN_SCHEMA_VERSION = 1;

/** A compact one-session resource summary the agent correlates across sessions. */
export interface PerfmonSessionObservation {
  readonly sessionId: string;
  readonly capturedAtIso: string;
  readonly source: PerfmonActorSource;
  readonly actor: string;
  readonly peakCpuPct: number | null;
  readonly minMemAvailMb: number | null;
  readonly peakDiskPct: number | null;
  readonly peakLabviewCpuPct: number | null;
  readonly peakLabviewWorkingSetMb: number | null;
  readonly wallMs: number | null;
  readonly sampleCount: number;
  readonly cycleCount: number;
}

function minOfSeries(values: readonly (number | null)[]): number | null {
  let min: number | null = null;
  for (const value of values) {
    if (value !== null && (min === null || value < min)) {
      min = value;
    }
  }
  return min;
}

/** Derive the compact session observation from a first-run perfmon artifact. */
export function summarizePerfmonSession(artifact: FirstRunPerfmonArtifact, sessionId: string): PerfmonSessionObservation {
  if (!artifact || artifact.schema !== FIRST_RUN_PERFMON_ARTIFACT_SCHEMA) {
    throw new Error('summarizePerfmonSession requires a first-run-perfmon@v1 artifact.');
  }
  if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    throw new Error('sessionId must be a non-empty string.');
  }
  const perf = artifact.perf;
  return {
    sessionId,
    capturedAtIso: artifact.capturedAtIso,
    source: artifact.source,
    actor: artifact.actor,
    peakCpuPct: perf.peaks.cpuTotalPct,
    minMemAvailMb: minOfSeries(perf.series.memAvailMb),
    peakDiskPct: perf.peaks.diskTotalPct,
    peakLabviewCpuPct: perf.peaks.labviewCpuPct ?? null,
    peakLabviewWorkingSetMb: perf.peaks.labviewWorkingSetMb ?? null,
    wallMs: artifact.wallMs,
    sampleCount: perf.sampleCount,
    cycleCount: artifact.cycles.length
  };
}

export type TrendDirection = 'rising' | 'falling' | 'flat';

export interface MetricTrend {
  readonly metric: string;
  readonly label: string;
  readonly higherIsWorse: boolean;
  readonly count: number;
  readonly first: number;
  readonly last: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly deltaFirstToLast: number;
  readonly slopePerSession: number;
  readonly direction: TrendDirection;
  readonly monotonic: boolean;
}

export interface PerfmonSessionAnomaly {
  readonly sessionId: string;
  readonly metric: string;
  readonly label: string;
  readonly value: number;
  readonly zScore: number;
}

export interface PerfmonSessionPattern {
  readonly schema: typeof PERFMON_SESSION_PATTERN_SCHEMA;
  readonly schemaVersion: typeof PERFMON_SESSION_PATTERN_SCHEMA_VERSION;
  readonly sessionCount: number;
  readonly orderedSessionIds: readonly string[];
  readonly trends: readonly MetricTrend[];
  readonly anomalies: readonly PerfmonSessionAnomaly[];
  readonly interpretations: readonly string[];
}

export interface AnalyzePerfmonSessionPatternOptions {
  /** Absolute z-score above which a session value is flagged anomalous (default 2). */
  readonly anomalyZThreshold?: number;
  /** Absolute slope below which a trend is flat (default 1e-9). */
  readonly flatEpsilon?: number;
}

interface MetricSpec {
  readonly metric: string;
  readonly label: string;
  readonly higherIsWorse: boolean;
  readonly extract: (observation: PerfmonSessionObservation) => number | null;
}

const METRIC_SPECS: readonly MetricSpec[] = [
  { metric: 'cpuPeakPct', label: 'peak CPU', higherIsWorse: true, extract: (o) => o.peakCpuPct },
  { metric: 'memAvailMinMb', label: 'minimum available memory', higherIsWorse: false, extract: (o) => o.minMemAvailMb },
  { metric: 'diskPeakPct', label: 'peak disk activity', higherIsWorse: true, extract: (o) => o.peakDiskPct },
  { metric: 'labviewCpuPeakPct', label: 'peak LabVIEW CPU', higherIsWorse: true, extract: (o) => o.peakLabviewCpuPct },
  { metric: 'labviewWorkingSetPeakMb', label: 'peak LabVIEW working set', higherIsWorse: true, extract: (o) => o.peakLabviewWorkingSetMb }
];

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function linearSlope(values: readonly number[]): number {
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += (i - xMean) * (i - xMean);
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

function isMonotonic(values: readonly number[]): boolean {
  let nonDecreasing = true;
  let nonIncreasing = true;
  let changed = false;
  for (let i = 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta > 0) {
      nonIncreasing = false;
      changed = true;
    } else if (delta < 0) {
      nonDecreasing = false;
      changed = true;
    }
  }
  return changed && (nonDecreasing || nonIncreasing);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Analyze a set of per-session perfmon observations into a cross-session pattern
 * the agent can interpret. Deterministic: observations are ordered by capture
 * time, and trends/anomalies/interpretations are derived without randomness.
 * Fails closed on an empty observation set.
 */
export function analyzePerfmonSessionPattern(
  observations: readonly PerfmonSessionObservation[],
  options: AnalyzePerfmonSessionPatternOptions = {}
): PerfmonSessionPattern {
  if (!Array.isArray(observations) || observations.length === 0) {
    throw new Error('analyzePerfmonSessionPattern requires at least one session observation.');
  }
  const anomalyZThreshold = options.anomalyZThreshold ?? 2;
  const flatEpsilon = options.flatEpsilon ?? 1e-9;

  const ordered = [...observations].sort((a, b) => a.capturedAtIso.localeCompare(b.capturedAtIso));
  const orderedSessionIds = ordered.map((observation) => observation.sessionId);

  const trends: MetricTrend[] = [];
  const anomalies: PerfmonSessionAnomaly[] = [];

  for (const spec of METRIC_SPECS) {
    const points: Array<{ sessionId: string; value: number }> = [];
    for (const observation of ordered) {
      const value = spec.extract(observation);
      if (value !== null && Number.isFinite(value)) {
        points.push({ sessionId: observation.sessionId, value });
      }
    }
    if (points.length < 2) {
      continue;
    }
    const values = points.map((point) => point.value);
    const slope = linearSlope(values);
    const direction: TrendDirection = slope > flatEpsilon ? 'rising' : slope < -flatEpsilon ? 'falling' : 'flat';
    trends.push({
      metric: spec.metric,
      label: spec.label,
      higherIsWorse: spec.higherIsWorse,
      count: values.length,
      first: values[0],
      last: values[values.length - 1],
      // Iterative reduce (not Math.min(...values)) to avoid an argument-spread
      // stack overflow when many sessions are analyzed.
      min: values.reduce((a, b) => Math.min(a, b)),
      max: values.reduce((a, b) => Math.max(a, b)),
      mean: round(mean(values)),
      deltaFirstToLast: round(values[values.length - 1] - values[0]),
      slopePerSession: round(slope),
      direction,
      monotonic: isMonotonic(values)
    });

    // Anomaly detection needs a meaningful spread (>= 3 points and non-zero stddev).
    if (values.length >= 3) {
      const avg = mean(values);
      const variance = mean(values.map((value) => (value - avg) * (value - avg)));
      const stddev = Math.sqrt(variance);
      if (stddev > 0) {
        for (const point of points) {
          const zScore = (point.value - avg) / stddev;
          if (Math.abs(zScore) > anomalyZThreshold) {
            anomalies.push({ sessionId: point.sessionId, metric: spec.metric, label: spec.label, value: point.value, zScore: round(zScore) });
          }
        }
      }
    }
  }

  const interpretations = buildInterpretations(ordered.length, trends, anomalies);

  return {
    schema: PERFMON_SESSION_PATTERN_SCHEMA,
    schemaVersion: PERFMON_SESSION_PATTERN_SCHEMA_VERSION,
    sessionCount: ordered.length,
    orderedSessionIds,
    trends,
    anomalies,
    interpretations
  };
}

function trendFor(trends: readonly MetricTrend[], metric: string): MetricTrend | undefined {
  return trends.find((trend) => trend.metric === metric);
}

function buildInterpretations(
  sessionCount: number,
  trends: readonly MetricTrend[],
  anomalies: readonly PerfmonSessionAnomaly[]
): string[] {
  const interpretations: string[] = [];
  if (sessionCount < 2) {
    interpretations.push(`Insufficient session history (${sessionCount}) to establish a cross-session pattern; capture more sessions.`);
    return interpretations;
  }

  const workingSet = trendFor(trends, 'labviewWorkingSetPeakMb');
  if (workingSet && workingSet.monotonic && workingSet.direction === 'rising') {
    interpretations.push(
      `LabVIEW working set rose monotonically across ${workingSet.count} sessions (+${round(workingSet.deltaFirstToLast)} MB first-to-last) — consistent with a possible memory leak; investigate.`
    );
  }
  const memAvail = trendFor(trends, 'memAvailMinMb');
  if (memAvail && memAvail.direction === 'falling') {
    interpretations.push(
      `Minimum available memory is trending down across ${memAvail.count} sessions (${round(memAvail.deltaFirstToLast)} MB first-to-last) — rising memory pressure.`
    );
  }
  const cpu = trendFor(trends, 'cpuPeakPct');
  if (cpu && cpu.direction === 'rising') {
    interpretations.push(`Peak CPU is trending up across ${cpu.count} sessions (+${round(cpu.deltaFirstToLast)}% first-to-last).`);
  }
  const disk = trendFor(trends, 'diskPeakPct');
  if (disk && disk.direction === 'rising') {
    interpretations.push(`Peak disk activity is trending up across ${disk.count} sessions (+${round(disk.deltaFirstToLast)}% first-to-last).`);
  }
  for (const anomaly of anomalies) {
    interpretations.push(`Session ${anomaly.sessionId} shows an anomalous ${anomaly.label} (${anomaly.value}, z=${anomaly.zScore}).`);
  }
  if (interpretations.length === 0) {
    interpretations.push(`No significant cross-session resource trend detected across ${sessionCount} sessions.`);
  }
  return interpretations;
}

/**
 * Render the pattern as an agent/human-readable troubleshooting report: the
 * ordered interpretations followed by the per-metric trend table.
 */
export function renderPerfmonSessionPatternReport(pattern: PerfmonSessionPattern): string {
  const lines = [`Perfmon cross-session pattern — ${pattern.sessionCount} session(s)`];
  for (const interpretation of pattern.interpretations) {
    lines.push(`- ${interpretation}`);
  }
  if (pattern.trends.length > 0) {
    lines.push('trends:');
    for (const trend of pattern.trends) {
      lines.push(
        `  - ${trend.label}: ${trend.direction} (first ${trend.first} -> last ${trend.last}, mean ${trend.mean}${trend.monotonic ? ', monotonic' : ''})`
      );
    }
  }
  return lines.join('\n');
}
