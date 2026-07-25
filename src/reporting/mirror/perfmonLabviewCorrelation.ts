// Perfmon <-> LabVIEW-log timestamp correlation (VHS-REQ-718, epic #2344).
//
// The mirror-mode first-run perfmon capture timestamps its samples in UTC
// (FirstRunPerfmonArtifact.capturedAtIso, `...Z`), while the deterministic
// per-launch LabVIEW log (parseLabVIEWLaunchTiming) records LOCAL wall-clock
// (no zone). Correlating the two therefore MUST normalize both to epoch
// milliseconds first — a naive same-string comparison is silently off by the
// host UTC offset (empirically -2h on a UTC+2 host). This module reconciles the
// two bases and reports the offset of the perfmon capture start from the LabVIEW
// launch markers, so a resource event can be located relative to the LabVIEW
// launch and (via labviewFrameCorrelation) to a replay frame index.
//
// Pure + deterministic, no I/O; fail-closed at the input boundary. The perfmon
// timestamp MUST carry an explicit zone (ES Date.parse treats a zone-less
// date-time as local, which would defeat the reconciliation).

import type { LabVIEWLaunchTiming } from './labviewLaunchTiming';

export const PERFMON_LABVIEW_CORRELATION_SCHEMA = 'vi-history-suite/perfmon-labview-correlation@v1';
export const PERFMON_LABVIEW_CORRELATION_SCHEMA_VERSION = 1;

/** The LabVIEW launch markers this correlation reads (a subset of the timing). */
export type LabviewLaunchInstants = Pick<
  LabVIEWLaunchTiming,
  'processStartIso' | 'executionReadyIso'
>;

export interface CorrelatePerfmonWithLabviewLogInput {
  /** Perfmon capture start, UTC ISO with an explicit zone (`...Z`). */
  readonly perfmonCapturedAtIso: string;
  /** LabVIEW launch markers (local wall-clock ISO, no zone). */
  readonly labview: LabviewLaunchInstants;
}

export interface PerfmonLabviewCorrelation {
  readonly schema: typeof PERFMON_LABVIEW_CORRELATION_SCHEMA;
  readonly schemaVersion: typeof PERFMON_LABVIEW_CORRELATION_SCHEMA_VERSION;
  readonly perfmonCapturedAtIso: string;
  readonly labviewProcessStartIso: string;
  readonly labviewExecutionReadyIso: string | null;
  /** perfmon capture start minus LabVIEW process-start, in ms (negative when the
   *  perfmon capture began first, i.e. it was running before LabVIEW's process). */
  readonly perfmonMinusProcessStartMs: number;
  /** perfmon capture start minus LabVIEW execution-ready, in ms, or null when the
   *  (failed) launch never wrote the execution-ready marker. */
  readonly perfmonMinusExecutionReadyMs: number | null;
  readonly perfmonStartedBeforeProcessStart: boolean;
  readonly perfmonStartedBeforeExecutionReady: boolean | null;
}

/** UTC ISO (`...Z` or explicit `+/-hh:mm`) -> epoch ms, or null when unparseable
 *  or missing an explicit zone. */
export function utcIsoToEpochMs(iso: string): number | null {
  if (typeof iso !== 'string' || iso.trim().length === 0) {
    return null;
  }
  const trimmed = iso.trim();
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
    return null;
  }
  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? null : ms;
}

/** LOCAL wall-clock ISO (`YYYY-MM-DDTHH:mm:ss(.fff)?`, no zone) -> epoch ms by
 *  interpreting the components in the host's local time zone; null on mismatch. */
export function localIsoToEpochMs(iso: string): number | null {
  if (typeof iso !== 'string') {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(iso.trim());
  if (!match) {
    return null;
  }
  const [, y, mo, d, h, mi, s, f] = match;
  const frac = f ? Number(f.padEnd(3, '0')) : 0;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), frac).getTime();
}

/**
 * VHS-REQ-718.1: correlate the perfmon capture start (UTC) with the LabVIEW
 * launch markers (local), normalizing both to epoch ms. Fail-closed on a
 * perfmon timestamp without an explicit zone or an unparseable process-start;
 * executionReady is optional.
 */
export function correlatePerfmonWithLabviewLog(
  input: CorrelatePerfmonWithLabviewLogInput
): PerfmonLabviewCorrelation {
  const perfmonMs = utcIsoToEpochMs(input.perfmonCapturedAtIso);
  if (perfmonMs === null) {
    throw new Error(
      'correlatePerfmonWithLabviewLog: perfmonCapturedAtIso must be a UTC ISO with an explicit zone.'
    );
  }
  const processStartMs = localIsoToEpochMs(input.labview.processStartIso);
  if (processStartMs === null) {
    throw new Error(
      'correlatePerfmonWithLabviewLog: labview.processStartIso must be a local wall-clock ISO.'
    );
  }
  const executionReadyIso = input.labview.executionReadyIso ?? null;
  const executionReadyMs = executionReadyIso !== null ? localIsoToEpochMs(executionReadyIso) : null;

  const perfmonMinusProcessStartMs = perfmonMs - processStartMs;
  const perfmonMinusExecutionReadyMs = executionReadyMs === null ? null : perfmonMs - executionReadyMs;

  return {
    schema: PERFMON_LABVIEW_CORRELATION_SCHEMA,
    schemaVersion: PERFMON_LABVIEW_CORRELATION_SCHEMA_VERSION,
    perfmonCapturedAtIso: input.perfmonCapturedAtIso,
    labviewProcessStartIso: input.labview.processStartIso,
    labviewExecutionReadyIso: executionReadyIso,
    perfmonMinusProcessStartMs,
    perfmonMinusExecutionReadyMs,
    perfmonStartedBeforeProcessStart: perfmonMinusProcessStartMs <= 0,
    perfmonStartedBeforeExecutionReady:
      perfmonMinusExecutionReadyMs === null ? null : perfmonMinusExecutionReadyMs <= 0
  };
}
