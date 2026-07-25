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

interface NavCueComputation {
  readonly cues: readonly MprrNavCue[];
  readonly unplaceablePeakCount: number;
  readonly frameRateHz: number;
  readonly frameIntervalMs: number;
  readonly authoritative: boolean;
}

/**
 * Shared peak->cue projection used by every video artifact (WebVTT/ffmetadata
 * chapters and the drawtext overlay). Peaks without an in-window frame index are
 * skipped (counted in `unplaceablePeakCount`); the rest are sorted by frame and
 * each spans to the next cue (or `minCueDurationMs` for the last). Fail-closed on
 * a non-object input so a malformed sync can never silently yield empty artifacts.
 */
function computeNavCues(
  sync: PerfmonMprrSync,
  options: BuildMprrTimelineNavOptions = {}
): NavCueComputation {
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

  return {
    cues,
    unplaceablePeakCount,
    frameRateHz,
    frameIntervalMs,
    authoritative: sync.authoritative === true
  };
}

/**
 * Build the navigation sidecar from a perfmon-mprr-sync@v1 record, emitting WebVTT
 * and ffmetadata chapters. Mirrors `sync.authoritative`; ADVISORY when uncalibrated.
 */
export function buildMprrTimelineNav(
  sync: PerfmonMprrSync,
  options: BuildMprrTimelineNavOptions = {}
): MprrTimelineNav {
  const { cues, unplaceablePeakCount, frameRateHz, authoritative } = computeNavCues(sync, options);
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

// --- drawtext overlay (stretch: burn the active resource event onto each frame) ---

export const MPRR_DRAWTEXT_OVERLAY_SCHEMA = 'vi-history-suite/mprr-drawtext-overlay@v1';
export const MPRR_DRAWTEXT_OVERLAY_SCHEMA_VERSION = 1;

export interface MprrDrawtextSegment {
  readonly frameIndex: number;
  readonly startSec: number;
  readonly endSec: number;
  /** Sanitized, drawtext-safe label burned onto the frames in this window. */
  readonly text: string;
  /** The single `drawtext=...:enable='between(t,start,end)'` filter for this window. */
  readonly filter: string;
}

export interface MprrDrawtextOverlay {
  readonly schema: typeof MPRR_DRAWTEXT_OVERLAY_SCHEMA;
  readonly schemaVersion: typeof MPRR_DRAWTEXT_OVERLAY_SCHEMA_VERSION;
  readonly frameRateHz: number;
  readonly authoritative: boolean;
  readonly advisory: boolean;
  readonly segmentCount: number;
  readonly unplaceablePeakCount: number;
  /** Whether a running mprr clock (`%{pts\:hms}`) overlay was appended. */
  readonly runningClock: boolean;
  /** Whether the assembler reads a frame sequence or an existing base video. */
  readonly assemblesFrom: 'frames' | 'video';
  readonly segments: readonly MprrDrawtextSegment[];
  /** Comma-joined drawtext filters (or `null` passthrough when there is nothing to burn). */
  readonly filtergraph: string;
  /** Ready-to-run ffmpeg assembler: burns the overlay (+ optional chapters) onto the source. */
  readonly ffmpegCommand: string;
}

export interface BuildMprrDrawtextOverlayOptions extends BuildMprrTimelineNavOptions {
  /** Frame filename pattern fed to `ffmpeg -i` (default `frame_%06d.png`). */
  readonly framePattern?: string;
  /** Output video path in the generated command (default `mprr-overlay.mp4`). */
  readonly outputPath?: string;
  readonly fontSize?: number;
  /** drawtext x/y expressions (default top-left inset). */
  readonly x?: string;
  readonly y?: string;
  /**
   * Assemble onto an EXISTING base video (e.g. a real screen recording) instead of a
   * frame sequence. When set, the command reads `-i <baseVideo>` rather than
   * `-framerate <fps> -i <framePattern>`.
   */
  readonly baseVideo?: string;
  /** Attach an ffmetadata chapters file via `-i <chaptersPath> -map_metadata 1`. */
  readonly chaptersPath?: string;
  /** Append a running mprr clock overlay (`%{pts\:hms}`, bottom-left). */
  readonly runningClock?: boolean;
  /**
   * drawtext `fontfile` for every overlay. On Windows there is no fontconfig and a
   * drive-letter `:` breaks the filter grammar, so pass a COLON-FREE path (copy the
   * `.ttf` local) — see the assembler recipe above {@link buildMprrDrawtextOverlay}.
   */
  readonly fontFile?: string;
}

/**
 * ffmpeg `drawtext` special characters cannot be reliably escaped across shells, so
 * the burned label is reduced to an unambiguous charset instead: `:` becomes `.`
 * (so timecodes stay readable), `,` becomes a space (so it cannot split the
 * comma-joined filtergraph), and quote/backslash/percent are dropped.
 */
function drawtextSanitize(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/:/g, '.')
    .replace(/,/g, ' ')
    .replace(/['\\%]/g, '')
    .trim();
}

function toSeconds(ms: number): number {
  return Number((Math.max(0, ms) / 1000).toFixed(3));
}

/**
 * Build an ffmpeg `drawtext` overlay filtergraph from a perfmon-mprr-sync@v1 record:
 * each resource-event window burns `<series> <value> | f<frame> | <timecode>` onto the
 * frames it spans (`enable='between(t,start,end)'`), so the assembled replay video is
 * self-describing without an external chapter track. ADVISORY is burned into every
 * label when the mprr capture is uncalibrated. Composes {@link computeNavCues}; pure.
 *
 * `ffmpegCommand` is a WORKING assembler, not just the frame-sequence command. Assembler
 * recipe (validated on Windows ffmpeg 8.x against a real capture):
 *   - `-vf` is passed INLINE as one arg (a `-/vf` filter file read was flaky);
 *   - the emitted filter string is BOM-free (plain UTF-8);
 *   - a literal `%` breaks drawtext, so burned labels use words (the sanitizer drops `%`);
 *   - the running clock keeps its colon backslash-escaped (`%{pts\:hms}`) even in quotes;
 *   - `fontFile` must be a COLON-FREE path on Windows (no fontconfig; copy the `.ttf` local).
 * Set `baseVideo` to burn onto a real screen recording, `chaptersPath` to attach the
 * ffmetadata chapters, and `runningClock` for the live mprr clock.
 */
export function buildMprrDrawtextOverlay(
  sync: PerfmonMprrSync,
  options: BuildMprrDrawtextOverlayOptions = {}
): MprrDrawtextOverlay {
  const { cues, unplaceablePeakCount, frameRateHz, authoritative } = computeNavCues(sync, options);
  const framePattern = options.framePattern ?? 'frame_%06d.png';
  const outputPath = options.outputPath ?? 'mprr-overlay.mp4';
  const fontSize = typeof options.fontSize === 'number' && options.fontSize > 0 ? options.fontSize : 24;
  const x = options.x ?? '20';
  const y = options.y ?? '20';
  const prefix = authoritative ? '' : 'ADVISORY ';
  // Colon-free fontfile per the Windows recipe; empty -> ffmpeg's built-in default font.
  const fontPart = options.fontFile ? `fontfile='${options.fontFile}':` : '';

  const segments: MprrDrawtextSegment[] = cues.map((c) => {
    const startSec = toSeconds(c.startMs);
    const endSec = toSeconds(c.endMs);
    const text = drawtextSanitize(`${prefix}${c.series} ${c.value} | f${c.frameIndex} | ${c.timecode}`);
    const filter =
      `drawtext=${fontPart}text='${text}':x=${x}:y=${y}:fontsize=${fontSize}:fontcolor=white:` +
      `box=1:boxcolor=black@0.5:enable='between(t,${startSec},${endSec})'`;
    return { frameIndex: c.frameIndex, startSec, endSec, text, filter };
  });

  const filters = segments.map((s) => s.filter);
  // The running mprr clock is a FIXED, known-safe ffmpeg expansion (NOT user data, so it is
  // never sanitized); its colon MUST stay backslash-escaped even inside the quotes.
  if (options.runningClock) {
    filters.push(
      `drawtext=${fontPart}text='%{pts\\:hms}':x=${x}:y=h-th-20:fontsize=${fontSize}:` +
        `fontcolor=yellow:box=1:boxcolor=black@0.5`
    );
  }
  const filtergraph = filters.length > 0 ? filters.join(',') : 'null';

  // Working assembler: read a frame sequence OR an existing base video, optionally attach an
  // ffmetadata chapters file (metadata mapped from that input), and apply the overlay inline.
  const assemblesFrom: 'frames' | 'video' = options.baseVideo ? 'video' : 'frames';
  const input = options.baseVideo
    ? `-i ${options.baseVideo}`
    : `-framerate ${frameRateHz} -i ${framePattern}`;
  const chaptersPart = options.chaptersPath ? ` -i ${options.chaptersPath} -map_metadata 1` : '';
  const ffmpegCommand = `ffmpeg ${input}${chaptersPart} -vf "${filtergraph}" -y ${outputPath}`;

  return {
    schema: MPRR_DRAWTEXT_OVERLAY_SCHEMA,
    schemaVersion: MPRR_DRAWTEXT_OVERLAY_SCHEMA_VERSION,
    frameRateHz,
    authoritative,
    advisory: !authoritative,
    segmentCount: segments.length,
    unplaceablePeakCount,
    runningClock: options.runningClock === true,
    assemblesFrom,
    segments,
    filtergraph,
    ffmpegCommand
  };
}
