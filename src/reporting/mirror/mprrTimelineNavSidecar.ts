// ffmpeg/video navigation sidecar for the perfmon<->mprr synchronization
// (VHS-REQ-707, supporting). NET-NEW navigation layer that COMPOSES the governed
// perfmon-mprr-sync@v1 record (src/reporting/mirror/perfmonMprrSync.ts) — it does
// NOT re-derive frames/stopwatch/strip. For each resource event (a perfmon series
// peak that landed inside the captured frame window) it emits a video-navigable
// cue at timecode = frameIndex / frameRateHz, in two ffmpeg-consumable forms:
//   - WebVTT chapters (browser/player track), and
//   - ffmetadata chapters (ffmpeg -i in.mp4 -i chapters.ffmeta -map_metadata 1).
// So the captured stopwatch+screen replay video is searchable by CPU/mem hotspot:
// "which cycle was the CPU peak and what frame/timecode shows it".
//
// CALIBRATION IS THE PRIORITY (mprr): a synchronization is authoritative only on a
// calibrated capture, so the sidecar mirrors `sync.authoritative` — when false the
// artifacts are emitted but explicitly marked ADVISORY (timings not trustworthy).
// Pure and deterministic; no I/O (reporting-orchestration guardrail).

import type { PerfmonMprrSync, PerfmonMprrSyncPeak } from './perfmonMprrSync';

export const MPRR_TIMELINE_NAV_SCHEMA = 'vi-history-suite/mprr-timeline-nav@v1';
export const MPRR_TIMELINE_NAV_SCHEMA_VERSION = 1;

/** Format a millisecond offset as a WebVTT cue timestamp `HH:MM:SS.mmm`. */
export function formatVttTimestamp(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1_000);
  const millis = totalMs % 1_000;
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}

export interface MprrNavCue {
  readonly index: number;
  readonly series: string;
  readonly value: number;
  readonly frameIndex: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly timecode: string;
  readonly stopwatchCentiseconds: number;
  readonly title: string;
}

export interface MprrTimelineNav {
  readonly schema: typeof MPRR_TIMELINE_NAV_SCHEMA;
  readonly schemaVersion: typeof MPRR_TIMELINE_NAV_SCHEMA_VERSION;
  readonly frameRateHz: number;
  readonly authoritative: boolean;
  readonly advisory: boolean;
  readonly cueCount: number;
  /** Peaks that had no in-window frame index and could not be placed on the video. */
  readonly unplaceablePeakCount: number;
  readonly cues: readonly MprrNavCue[];
  readonly webvtt: string;
  readonly ffmetadata: string;
}

export interface BuildMprrTimelineNavOptions {
  /** Minimum cue duration in ms (default one frame interval); also the last cue's length. */
  readonly minCueDurationMs?: number;
  /** Video title stamped into the ffmetadata `[FORMAT]` section. */
  readonly title?: string;
}

function frameStartMs(frameIndex: number, frameIntervalMs: number): number {
  return frameIndex * frameIntervalMs;
}

/**
 * Build the navigation sidecar from a perfmon-mprr-sync@v1 record. Peaks without
 * an in-window frame index are skipped (counted in `unplaceablePeakCount`); the
 * remaining peaks become cues sorted by frame, each spanning to the next cue (or
 * `minCueDurationMs` for the last). Fail-closed on a non-object input.
 */
export function buildMprrTimelineNav(
  sync: PerfmonMprrSync,
  options: BuildMprrTimelineNavOptions = {}
): MprrTimelineNav {
  if (typeof sync !== 'object' || sync === null) {
    throw new Error('mprr-timeline-nav: sync must be a perfmon-mprr-sync@v1 object');
  }
  const frameRateHz = sync.frameRateHz > 0 ? sync.frameRateHz : 12;
  const frameIntervalMs = sync.frameIntervalMs > 0 ? sync.frameIntervalMs : 1000 / frameRateHz;
  const minCueDurationMs =
    typeof options.minCueDurationMs === 'number' && options.minCueDurationMs > 0
      ? options.minCueDurationMs
      : frameIntervalMs;

  const peaks = Array.isArray(sync.peaks) ? sync.peaks : [];
  const placeable = peaks.filter(
    (p): p is PerfmonMprrSyncPeak & { frameIndex: number } => typeof p.frameIndex === 'number'
  );
  const unplaceablePeakCount = peaks.length - placeable.length;
  const sorted = [...placeable].sort((a, b) => a.frameIndex - b.frameIndex);

  const cues: MprrNavCue[] = sorted.map((peak, i) => {
    const startMs = frameStartMs(peak.frameIndex, frameIntervalMs);
    const nextStartMs =
      i + 1 < sorted.length
        ? frameStartMs(sorted[i + 1].frameIndex, frameIntervalMs)
        : startMs + minCueDurationMs;
    const endMs = Math.max(nextStartMs, startMs + minCueDurationMs);
    const timecode = formatVttTimestamp(startMs);
    return {
      index: i,
      series: peak.series,
      value: peak.value,
      frameIndex: peak.frameIndex,
      startMs,
      endMs,
      timecode,
      stopwatchCentiseconds: peak.stopwatchCentiseconds,
      title: `${peak.series} peak ${peak.value} (frame ${peak.frameIndex}, ${timecode})`
    };
  });

  const authoritative = sync.authoritative === true;
  return {
    schema: MPRR_TIMELINE_NAV_SCHEMA,
    schemaVersion: MPRR_TIMELINE_NAV_SCHEMA_VERSION,
    frameRateHz,
    authoritative,
    advisory: !authoritative,
    cueCount: cues.length,
    unplaceablePeakCount,
    cues,
    webvtt: renderWebVtt(cues, authoritative),
    ffmetadata: renderFfmetadata(cues, options.title ?? 'mprr replay', authoritative)
  };
}

function renderWebVtt(cues: readonly MprrNavCue[], authoritative: boolean): string {
  const header = authoritative
    ? 'WEBVTT'
    : 'WEBVTT - ADVISORY (uncalibrated mprr capture; timings not authoritative)';
  const blocks = cues.map(
    (c, i) => `${i + 1}\n${formatVttTimestamp(c.startMs)} --> ${formatVttTimestamp(c.endMs)}\n${c.title}`
  );
  return [header, ...blocks].join('\n\n') + '\n';
}

function renderFfmetadata(cues: readonly MprrNavCue[], title: string, authoritative: boolean): string {
  const sanitize = (value: string): string => value.replace(/[\r\n]+/g, ' ').replace(/=/g, ':');
  const lines = [';FFMETADATA1', `title=${sanitize(title)}${authoritative ? '' : ' (advisory)'}`];
  for (const c of cues) {
    lines.push(
      '[CHAPTER]',
      'TIMEBASE=1/1000',
      `START=${Math.round(c.startMs)}`,
      `END=${Math.round(c.endMs)}`,
      `title=${sanitize(c.title)}`
    );
  }
  return lines.join('\n') + '\n';
}
