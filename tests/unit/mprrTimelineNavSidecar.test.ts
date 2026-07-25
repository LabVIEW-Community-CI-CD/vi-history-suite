import { describe, expect, it } from 'vitest';
import {
  buildMprrDrawtextOverlay,
  buildMprrTimelineNav,
  formatVttTimestamp,
  MPRR_DRAWTEXT_OVERLAY_SCHEMA,
  MPRR_TIMELINE_NAV_SCHEMA
} from '../../src/reporting/mirror/mprrTimelineNavSidecar';
import type { PerfmonMprrSync } from '../../src/reporting/mirror/perfmonMprrSync';

// VHS-REQ-707 (supporting): the ffmpeg/video navigation sidecar that composes the
// governed perfmon-mprr-sync@v1 record into WebVTT + ffmetadata chapters keyed to
// frame -> timecode (frame / frameRateHz). Pure; exercised without any capture.

function fakeSync(over: Partial<PerfmonMprrSync> = {}): PerfmonMprrSync {
  const base = {
    schema: 'vi-history-suite/perfmon-mprr-sync@v1',
    schemaVersion: 1,
    source: 'windows-native',
    actor: 'test-actor',
    timingAuthorityId: 'mprr-self-test-synthetic-monotonic-100ns',
    tickResolutionNs: 100,
    frameRateHz: 12,
    frameIntervalMs: 1000 / 12,
    epochMsAtFrameZero: 0,
    captureEpochMs: 0,
    calibrated: true,
    authoritative: true,
    allSamplesWithinFrameWindow: true,
    samples: [],
    peaks: [
      { series: 'cpu', value: 95, sampleIndex: 3, frameIndex: 240, stopwatchCentiseconds: 2000 },
      { series: 'mem', value: 800, sampleIndex: 0, frameIndex: 12, stopwatchCentiseconds: 100 },
      { series: 'cpu', value: 88, sampleIndex: 7, frameIndex: 600, stopwatchCentiseconds: 5000 },
      { series: 'loadAvg1', value: 4.2, sampleIndex: 9, frameIndex: null, stopwatchCentiseconds: 9000 }
    ]
  };
  return { ...base, ...over } as unknown as PerfmonMprrSync;
}

describe('formatVttTimestamp (#2377 nav sidecar)', () => {
  it('formats ms as HH:MM:SS.mmm', () => {
    expect(formatVttTimestamp(1000)).toBe('00:00:01.000');
    expect(formatVttTimestamp(20000)).toBe('00:00:20.000');
    expect(formatVttTimestamp(3_661_500)).toBe('01:01:01.500');
    expect(formatVttTimestamp(-5)).toBe('00:00:00.000');
  });
});

describe('buildMprrTimelineNav (#2377 nav sidecar)', () => {
  it('maps in-window peaks to frame-timed cues sorted by frame, skips unplaceable peaks', () => {
    const nav = buildMprrTimelineNav(fakeSync());
    expect(nav.schema).toBe(MPRR_TIMELINE_NAV_SCHEMA);
    expect(nav.cueCount).toBe(3); // the null-frame loadAvg1 peak is skipped
    expect(nav.unplaceablePeakCount).toBe(1);
    // sorted by frame: 12 (mem) -> 240 (cpu95) -> 600 (cpu88); frame 12 @12fps = 1000ms.
    expect(nav.cues.map((c) => c.frameIndex)).toEqual([12, 240, 600]);
    expect(nav.cues[0]).toMatchObject({ series: 'mem', value: 800, startMs: 1000, timecode: '00:00:01.000' });
    // each cue spans to the next cue's start.
    expect(nav.cues[0].endMs).toBe(20000);
    expect(nav.cues[1]).toMatchObject({ frameIndex: 240, startMs: 20000, endMs: 50000, timecode: '00:00:20.000' });
    expect(nav.authoritative).toBe(true);
    expect(nav.advisory).toBe(false);
  });

  it('emits a WebVTT track with HH:MM:SS.mmm cue ranges and descriptive titles', () => {
    const { webvtt } = buildMprrTimelineNav(fakeSync());
    expect(webvtt.startsWith('WEBVTT')).toBe(true);
    expect(webvtt).toContain('00:00:01.000 --> 00:00:20.000');
    expect(webvtt).toContain('mem peak 800 (frame 12, 00:00:01.000)');
    expect(webvtt).toContain('cpu peak 95 (frame 240, 00:00:20.000)');
  });

  it('emits ffmetadata chapters with a 1/1000 timebase and ms START/END', () => {
    const { ffmetadata } = buildMprrTimelineNav(fakeSync(), { title: 'replay=A' });
    expect(ffmetadata.startsWith(';FFMETADATA1')).toBe(true);
    expect(ffmetadata).toContain('[CHAPTER]');
    expect(ffmetadata).toContain('TIMEBASE=1/1000');
    expect(ffmetadata).toContain('START=1000');
    expect(ffmetadata).toContain('END=20000');
    // '=' in a title is sanitized so it cannot break the key=value grammar.
    expect(ffmetadata).toContain('title=replay:A');
  });

  it('marks artifacts ADVISORY when the mprr capture is not calibrated/authoritative', () => {
    const nav = buildMprrTimelineNav(fakeSync({ calibrated: false, authoritative: false }));
    expect(nav.authoritative).toBe(false);
    expect(nav.advisory).toBe(true);
    expect(nav.webvtt).toContain('ADVISORY');
    expect(nav.ffmetadata).toContain('(advisory)');
  });

  it('throws fail-closed on a non-object sync', () => {
    // @ts-expect-error deliberate wrong type
    expect(() => buildMprrTimelineNav(null)).toThrow(/perfmon-mprr-sync/);
  });
});

describe('buildMprrDrawtextOverlay (#2377 nav sidecar stretch)', () => {
  it('burns each resource-event window onto its frames with an enable range', () => {
    const overlay = buildMprrDrawtextOverlay(fakeSync());
    expect(overlay.schema).toBe(MPRR_DRAWTEXT_OVERLAY_SCHEMA);
    expect(overlay.segmentCount).toBe(3);
    expect(overlay.unplaceablePeakCount).toBe(1);
    // sorted by frame: 12 (mem) -> 240 (cpu95) -> 600 (cpu88).
    expect(overlay.segments[0]).toMatchObject({ frameIndex: 12, startSec: 1, endSec: 20 });
    expect(overlay.segments[0].text).toBe('mem 800 | f12 | 00.00.01.000');
    expect(overlay.segments[1]).toMatchObject({ frameIndex: 240, startSec: 20, endSec: 50 });
    expect(overlay.segments[0].filter).toContain("enable='between(t,1,20)'");
    expect(overlay.segments[0].filter).toContain("drawtext=text='mem 800 | f12 | 00.00.01.000'");
  });

  it('joins segments into one filtergraph and a runnable ffmpeg command', () => {
    const overlay = buildMprrDrawtextOverlay(fakeSync(), { framePattern: 'shot_%05d.png', outputPath: 'out.mp4' });
    expect(overlay.filtergraph.split(',drawtext=').length).toBe(3); // 3 chained drawtext filters
    expect(overlay.ffmpegCommand).toContain('-framerate 12');
    expect(overlay.ffmpegCommand).toContain('-i shot_%05d.png');
    expect(overlay.ffmpegCommand).toContain('-y out.mp4');
    expect(overlay.ffmpegCommand).toContain('-vf "');
  });

  it('sanitizes drawtext-hostile characters so they cannot break the filtergraph', () => {
    const sync = fakeSync({
      peaks: [{ series: "a:b,c'd", value: 1, sampleIndex: 0, frameIndex: 12, stopwatchCentiseconds: 0 }]
    });
    const { segments } = buildMprrDrawtextOverlay(sync);
    expect(segments[0].text).not.toMatch(/[:,'\\%]/);
    expect(segments[0].text).toContain('a.b cd'); // colon->'.', comma->space, quote dropped
  });

  it('burns ADVISORY into every label when the mprr capture is uncalibrated', () => {
    const overlay = buildMprrDrawtextOverlay(fakeSync({ calibrated: false, authoritative: false }));
    expect(overlay.advisory).toBe(true);
    expect(overlay.segments.every((s) => s.text.startsWith('ADVISORY '))).toBe(true);
  });

  it('degrades to a null passthrough filtergraph when no peak is placeable', () => {
    const overlay = buildMprrDrawtextOverlay(
      fakeSync({ peaks: [{ series: 'cpu', value: 1, sampleIndex: 0, frameIndex: null, stopwatchCentiseconds: 0 }] })
    );
    expect(overlay.segmentCount).toBe(0);
    expect(overlay.unplaceablePeakCount).toBe(1);
    expect(overlay.filtergraph).toBe('null');
    expect(overlay.ffmpegCommand).toContain('-vf "null"');
  });

  it('defaults to the frame-sequence assembler (back-compat)', () => {
    const overlay = buildMprrDrawtextOverlay(fakeSync());
    expect(overlay.assemblesFrom).toBe('frames');
    expect(overlay.runningClock).toBe(false);
    expect(overlay.ffmpegCommand).toContain('-framerate 12 -i frame_%06d.png');
  });

  it('assembles onto a real base video with chapters attached (working assembler)', () => {
    const overlay = buildMprrDrawtextOverlay(fakeSync(), {
      baseVideo: 'screen.mp4',
      chaptersPath: 'chapters.ffmeta',
      outputPath: 'session-nav.mp4'
    });
    expect(overlay.assemblesFrom).toBe('video');
    expect(overlay.ffmpegCommand).toContain('-i screen.mp4');
    expect(overlay.ffmpegCommand).not.toContain('-framerate');
    expect(overlay.ffmpegCommand).toContain('-i chapters.ffmeta -map_metadata 1');
    expect(overlay.ffmpegCommand).toContain('-y session-nav.mp4');
  });

  it('appends a backslash-escaped running mprr clock when requested', () => {
    const overlay = buildMprrDrawtextOverlay(fakeSync(), { runningClock: true });
    expect(overlay.runningClock).toBe(true);
    expect(overlay.filtergraph).toContain("text='%{pts\\:hms}'"); // colon stays escaped
    expect(overlay.filtergraph.split('drawtext=').length - 1).toBe(4); // 3 peaks + 1 clock
  });

  it('still emits the clock when no peak is placeable (not a null passthrough)', () => {
    const overlay = buildMprrDrawtextOverlay(
      fakeSync({ peaks: [{ series: 'cpu', value: 1, sampleIndex: 0, frameIndex: null, stopwatchCentiseconds: 0 }] }),
      { runningClock: true }
    );
    expect(overlay.segmentCount).toBe(0);
    expect(overlay.filtergraph).not.toBe('null');
    expect(overlay.filtergraph).toContain('%{pts\\:hms}');
  });

  it('applies a colon-free fontfile to every drawtext filter', () => {
    const overlay = buildMprrDrawtextOverlay(fakeSync(), { fontFile: '/fonts/DejaVuSans.ttf', runningClock: true });
    const drawtexts = overlay.filtergraph.split(',').filter((f) => f.startsWith('drawtext='));
    expect(drawtexts.length).toBe(4); // 3 peaks + clock
    expect(drawtexts.every((f) => f.includes("fontfile='/fonts/DejaVuSans.ttf':"))).toBe(true);
  });
});
