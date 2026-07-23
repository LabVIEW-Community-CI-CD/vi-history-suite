// Requirement coverage: VHS-REQ-707 (Mirror-Mode dual real-runtime validation) —
// the perfmon <-> mprr fiducial synchronization (VHS-REQ-707.17). Pure and
// deterministic: an artifact + an mprr frame reference + a calibration verdict in,
// a frame/stopwatch/strip correlation out. The stopwatch strip is reproduced
// bit-for-bit from the authoritative mprr stopwatch surface.
import { describe, expect, it } from 'vitest';

import {
  buildFirstRunPerfmonArtifact,
  parsePdhCsv,
  type FirstRunPerfmonArtifact
} from '../../src/reporting/mirror/perfmonSampleSeries';
import {
  MPRR_CALIBRATION_MARKERS,
  evaluateMprrCalibration,
  type CalibrationMarkerObservation
} from '../../src/reporting/syncDiagnostics/mprrCalibrationSurface';
import {
  MPRR_MAX_STRIP_CENTISECONDS,
  MPRR_TIMING_AUTHORITY_ID,
  buildPerfmonMprrSync,
  encodeMprrMachineStrip,
  formatMprrStopwatchText,
  renderPerfmonMprrSyncSummary
} from '../../src/reporting/mirror/perfmonMprrSync';

const CAPTURE_ISO = '2026-07-23T06:04:44.000Z';
const CAPTURE_EPOCH = Date.parse(CAPTURE_ISO);

const CSV_SYSTEM = [
  String.raw`"(PDH-CSV 4.0) (UTC)(0)","\\H\Processor(_Total)\% Processor Time","\\H\Memory\Available MBytes","\\H\PhysicalDisk(_Total)\% Disk Time"`,
  '"07/23/2026 06:04:44.000","10","4000","5"',
  '"07/23/2026 06:04:45.000","60","3800","40"'
].join('\n');

const CSV_LABVIEW = [
  String.raw`"(PDH-CSV 4.0) (UTC)(0)","\\H\Processor(_Total)\% Processor Time","\\H\Memory\Available MBytes","\\H\PhysicalDisk(_Total)\% Disk Time","\\H\Process(LabVIEW)\% Processor Time","\\H\Process(LabVIEW)\Working Set"`,
  '"07/23/2026 06:04:44.000","10","4000","5","20","104857600"',
  '"07/23/2026 06:04:45.000","60","3800","40","75","209715200"'
].join('\n');

function artifact(csv: string): FirstRunPerfmonArtifact {
  return buildFirstRunPerfmonArtifact({
    source: 'self-hosted-runner',
    actor: 'vagrant-win-x86-hostnative',
    capturedAtIso: CAPTURE_ISO,
    perf: parsePdhCsv(csv)
  });
}

function calibration(borderVisible: boolean) {
  const markers: CalibrationMarkerObservation[] = MPRR_CALIBRATION_MARKERS.map((m) => ({
    id: m.id,
    detectedColorRgb: { ...m.expectedColorRgb },
    withinExpectedBounds: true
  }));
  return evaluateMprrCalibration({ borderVisible, markers });
}

describe('encodeMprrMachineStrip (VHS-REQ-707.17)', () => {
  it('reproduces the 40-bit strip bit-for-bit', () => {
    // Zero centiseconds: preamble + 24 zero payload bits + 8 zero checksum bits.
    expect(encodeMprrMachineStrip(0)).toBe(`10100101${'0'.repeat(24)}${'0'.repeat(8)}`);

    // A value with a non-trivial XOR checksum: 0x010205 -> bytes 1,2,5 -> 1^2^5 = 6.
    const strip = encodeMprrMachineStrip(0x010205);
    expect(strip).toHaveLength(40);
    expect(strip.startsWith('10100101')).toBe(true);
    expect(strip.slice(8, 32)).toBe((0x010205).toString(2).padStart(24, '0'));
    expect(strip.slice(32)).toBe('00000110');
  });

  it('clamps out-of-range centiseconds into the 24-bit payload', () => {
    expect(encodeMprrMachineStrip(-5)).toBe(encodeMprrMachineStrip(0));
    expect(encodeMprrMachineStrip(MPRR_MAX_STRIP_CENTISECONDS + 100)).toBe(encodeMprrMachineStrip(MPRR_MAX_STRIP_CENTISECONDS));
  });
});

describe('formatMprrStopwatchText (VHS-REQ-707.17)', () => {
  it('renders HH:MM:SS.cc', () => {
    expect(formatMprrStopwatchText(0)).toBe('00:00:00.00');
    expect(formatMprrStopwatchText(1_183)).toBe('00:00:01.18');
    expect(formatMprrStopwatchText(3_661_230)).toBe('01:01:01.23');
  });
});

describe('buildPerfmonMprrSync (VHS-REQ-707.17)', () => {
  it('correlates samples to frames, stopwatch, and the bit-exact strip when calibrated', () => {
    const sync = buildPerfmonMprrSync({
      artifact: artifact(CSV_SYSTEM),
      frame: { epochMsAtFrameZero: CAPTURE_EPOCH }, // default 12 fps, frame zero == capture start
      calibration: calibration(true)
    });

    expect(sync.schema).toBe('vi-history-suite/perfmon-mprr-sync@v1');
    expect(sync.calibrated).toBe(true);
    expect(sync.authoritative).toBe(true);
    expect(sync.frameRateHz).toBe(12);
    expect(sync.frameIntervalMs).toBeCloseTo(83.333, 2);
    expect(sync.timingAuthorityId).toBe(MPRR_TIMING_AUTHORITY_ID);
    expect(sync.tickResolutionNs).toBe(100);

    // Sample 0 is at capture start == frame zero: frame 0, stopwatch 0.
    expect(sync.samples[0]).toMatchObject({ sampleIndex: 0, elapsedMs: 0, frameIndex: 0, stopwatchCentiseconds: 0, authorityTicks: 0 });
    expect(sync.samples[0].machineStripBits).toBe(encodeMprrMachineStrip(0));

    // Sample 1 is 1000ms later: 100 centiseconds, 100ns ticks = 1000 * 10000.
    expect(sync.samples[1].stopwatchCentiseconds).toBe(100);
    expect(sync.samples[1].authorityTicks).toBe(10_000_000);
    expect(sync.samples[1].machineStripBits).toBe(encodeMprrMachineStrip(100));
    expect(sync.samples[1].stopwatchText).toBe('00:00:01.00');

    // Peak CPU (60) is at sample index 1 -> its frame + stopwatch.
    const cpuPeak = sync.peaks.find((p) => p.series === 'cpuTotalPct')!;
    expect(cpuPeak).toMatchObject({ value: 60, sampleIndex: 1, stopwatchCentiseconds: 100 });
    expect(cpuPeak.frameIndex).toBe(sync.samples[1].frameIndex);
  });

  it('maps frame indices exactly at a clean frame rate', () => {
    const sync = buildPerfmonMprrSync({
      artifact: artifact(CSV_SYSTEM),
      frame: { epochMsAtFrameZero: CAPTURE_EPOCH, frameRateHz: 10 }, // 100ms/frame
      calibration: calibration(true)
    });
    expect(sync.samples[0].frameIndex).toBe(0);
    expect(sync.samples[1].frameIndex).toBe(10); // 1000ms / 100ms
  });

  it('marks out-of-window samples unmapped (null) and stays advisory when uncalibrated', () => {
    const sync = buildPerfmonMprrSync({
      artifact: artifact(CSV_SYSTEM),
      frame: { epochMsAtFrameZero: CAPTURE_EPOCH, frameRateHz: 10, frameCount: 5 },
      calibration: calibration(false)
    });
    expect(sync.authoritative).toBe(false); // not calibrated -> advisory only
    expect(sync.calibrated).toBe(false);
    expect(sync.samples[1].frameIndex).toBeNull(); // beyond frameCount -> unmapped, not clamped
    expect(sync.allSamplesWithinFrameWindow).toBe(false);
    expect(sync.samples.length).toBe(2); // still produced
  });

  it('marks pre-fiducial samples unmapped (null) with negative authority ticks', () => {
    const sync = buildPerfmonMprrSync({
      artifact: artifact(CSV_SYSTEM),
      frame: { epochMsAtFrameZero: CAPTURE_EPOCH + 5_000 }, // frame zero 5s AFTER capture start
      calibration: calibration(true)
    });
    expect(sync.samples[0].frameIndex).toBeNull();
    expect(sync.allSamplesWithinFrameWindow).toBe(false);
    expect(sync.samples[0].stopwatchCentiseconds).toBe(0);
    expect(sync.samples[0].authorityTicks).toBe(-50_000_000); // -5000ms * 10000
  });

  it('correlates the LabVIEW process peaks when present', () => {
    const sync = buildPerfmonMprrSync({
      artifact: artifact(CSV_LABVIEW),
      frame: { epochMsAtFrameZero: CAPTURE_EPOCH },
      calibration: calibration(true)
    });
    expect(sync.peaks.map((p) => p.series)).toEqual(
      expect.arrayContaining(['cpuTotalPct', 'memAvailMb', 'diskTotalPct', 'labviewCpuPct', 'labviewWorkingSetMb'])
    );
    expect(sync.peaks.find((p) => p.series === 'labviewCpuPct')!.value).toBe(75);
  });

  it('fails closed on a bad artifact, missing calibration, bad epoch, bad frame rate, and unparsable capture time', () => {
    const cal = calibration(true);
    expect(() =>
      buildPerfmonMprrSync({ artifact: { schema: 'nope' } as never, frame: { epochMsAtFrameZero: 0 }, calibration: cal })
    ).toThrow(/first-run-perfmon@v1/);
    expect(() =>
      buildPerfmonMprrSync({ artifact: artifact(CSV_SYSTEM), frame: { epochMsAtFrameZero: 0 }, calibration: undefined as never })
    ).toThrow(/calibration verdict/);
    expect(() =>
      buildPerfmonMprrSync({ artifact: artifact(CSV_SYSTEM), frame: { epochMsAtFrameZero: Number.NaN }, calibration: cal })
    ).toThrow(/epochMsAtFrameZero/);
    expect(() =>
      buildPerfmonMprrSync({ artifact: artifact(CSV_SYSTEM), frame: { epochMsAtFrameZero: 0, frameRateHz: 0 }, calibration: cal })
    ).toThrow(/frameRateHz/);
    const badTime = { ...artifact(CSV_SYSTEM), capturedAtIso: 'not-a-date' } as FirstRunPerfmonArtifact;
    expect(() => buildPerfmonMprrSync({ artifact: badTime, frame: { epochMsAtFrameZero: 0 }, calibration: cal })).toThrow(/capturedAtIso/);
  });
});

describe('renderPerfmonMprrSyncSummary (VHS-REQ-707.17)', () => {
  it('summarizes the correlation with per-peak frame + stopwatch', () => {
    const sync = buildPerfmonMprrSync({
      artifact: artifact(CSV_SYSTEM),
      frame: { epochMsAtFrameZero: CAPTURE_EPOCH, frameRateHz: 10 },
      calibration: calibration(true)
    });
    const summary = renderPerfmonMprrSyncSummary(sync);
    expect(summary).toContain('perfmon<->mprr sync AUTHORITATIVE — self-hosted-runner (vagrant-win-x86-hostnative)');
    expect(summary).toContain('frame rate: 10 Hz');
    expect(summary).toContain('peak cpuTotalPct 60 at frame 10 (stopwatch 00:00:01.00)');

    const advisory = renderPerfmonMprrSyncSummary(
      buildPerfmonMprrSync({ artifact: artifact(CSV_SYSTEM), frame: { epochMsAtFrameZero: CAPTURE_EPOCH }, calibration: calibration(false) })
    );
    expect(advisory).toContain('UNCALIBRATED (advisory)');
  });
});
