// Requirement coverage: VHS-REQ-713 (Real Windows Full-Matrix Runtime Validation
// Host) — the Part E perfmon -> TDMS -> mprr-sync -> bounded-RAM-replay pipeline
// composition (VHS-REQ-713.5). This is the deterministic, portable proof of the
// exact module composition that `scripts/windows-perfmon-mprr-driver.cjs` drives
// on real Windows hardware: it exercises the SHIPPED modules end to end on a
// synthetic PDH-CSV so the pipeline contract is guarded without a runtime.
import { describe, expect, it } from 'vitest';

import {
  FIRST_RUN_PERFMON_ARTIFACT_SCHEMA,
  buildFirstRunPerfmonArtifact,
  parsePdhCsv
} from '../../src/reporting/mirror/perfmonSampleSeries';
import {
  PERFMON_TDMS_MODEL_SCHEMA,
  PERFMON_TDMS_SAMPLES_GROUP,
  buildPerfmonTdmsModel
} from '../../src/reporting/mirror/perfmonTdmsModel';
import {
  PERFMON_MPRR_SYNC_SCHEMA,
  buildPerfmonMprrSync
} from '../../src/reporting/mirror/perfmonMprrSync';
import {
  DeterministicRollingBlockRing,
  MIN_RING_CAPACITY_BYTES,
  computeRequiredThreeBlockCapacityBytes,
  planRingAdmission
} from '../../src/reporting/mirror/deterministicRollingBlockRing';
import {
  analyzePerfmonSessionPattern,
  summarizePerfmonSession
} from '../../src/reporting/mirror/perfmonSessionPattern';
import {
  MPRR_CALIBRATION_MARKERS,
  evaluateMprrCalibration
} from '../../src/reporting/syncDiagnostics/mprrCalibrationSurface';

// A synthetic PDH-CSV in the exact shape typeperf/logman emit, with the system
// counters plus the LabVIEW process counters (a resident/warm capture).
function syntheticPdhCsv(rows: number): string {
  const host = 'VIHS-TEST';
  const header = [
    '"(PDH-CSV 4.0) (UTC)(0)"',
    `"\\\\${host}\\Processor(_Total)\\% Processor Time"`,
    `"\\\\${host}\\Memory\\Available MBytes"`,
    `"\\\\${host}\\PhysicalDisk(_Total)\\% Disk Time"`,
    `"\\\\${host}\\Process(LabVIEW)\\% Processor Time"`,
    `"\\\\${host}\\Process(LabVIEW)\\Working Set"`
  ].join(',');
  const lines = [header];
  const base = Date.UTC(2026, 6, 23, 6, 0, 0);
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
  for (let i = 0; i < rows; i += 1) {
    // PDH-CSV timestamps are MM/DD/YYYY HH:MM:SS.fff. This synthetic header is
    // (UTC) and the fields are UTC (parsePdhTimestampMs reads them via Date.UTC).
    const d = new Date(base + i * 1000);
    const ts = `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.000`;
    const cpu = (10 + i).toFixed(3);
    const mem = (8000 - i * 5).toFixed(3);
    const disk = (2 + (i % 3)).toFixed(3);
    const lvCpu = (5 + (i % 4)).toFixed(3);
    const lvWs = (500_000_000 + i * 1_000_000).toFixed(3);
    lines.push(`"${ts}","${cpu}","${mem}","${disk}","${lvCpu}","${lvWs}"`);
  }
  return `${lines.join('\r\n')}\r\n`;
}

function calibratedVerdict() {
  return evaluateMprrCalibration({
    borderVisible: true,
    markers: MPRR_CALIBRATION_MARKERS.map((m) => ({
      id: m.id,
      detectedColorRgb: { ...m.expectedColorRgb },
      withinExpectedBounds: true
    }))
  });
}

describe('Windows perfmon -> TDMS -> mprr replay pipeline (VHS-REQ-713.5)', () => {
  it('projects a captured PDH-CSV into the first-run-perfmon@v1 artifact and perfmon-tdms-model@v1 channel model', () => {
    const perf = parsePdhCsv(syntheticPdhCsv(20));
    const artifact = buildFirstRunPerfmonArtifact({
      source: 'self-hosted-runner',
      actor: 'windows-host-2026-x64',
      capturedAtIso: '2026-07-23T06:00:00.000Z',
      perf,
      wallMs: 19_000,
      cycles: [{ cycleIndex: 1, durationMs: 19_000, outcome: 'compared' }]
    });
    expect(artifact.schema).toBe(FIRST_RUN_PERFMON_ARTIFACT_SCHEMA);

    const model = buildPerfmonTdmsModel(artifact);
    expect(model.schema).toBe(PERFMON_TDMS_MODEL_SCHEMA);
    const samples = model.groups.find((g) => g.name === PERFMON_TDMS_SAMPLES_GROUP);
    expect(samples).toBeTruthy();
    const channelNames = samples!.channels.map((c) => c.name);
    expect(channelNames).toEqual(
      expect.arrayContaining(['time_s', 'cpu_total_pct', 'mem_avail_mb', 'disk_total_pct'])
    );
    // The LabVIEW process channels are present when the capture resolved them.
    expect(channelNames).toEqual(
      expect.arrayContaining(['labview_cpu_pct', 'labview_working_set_mb'])
    );
  });

  it('synchronizes samples to the mprr stopwatch/frame timebase, authoritative only when calibrated (VHS-REQ-713.5)', () => {
    const perf = parsePdhCsv(syntheticPdhCsv(12));
    const artifact = buildFirstRunPerfmonArtifact({
      source: 'self-hosted-runner',
      actor: 'windows-host-2026-x64',
      capturedAtIso: '2026-07-23T06:00:00.000Z',
      perf,
      wallMs: 11_000,
      cycles: []
    });

    const authoritative = buildPerfmonMprrSync({
      artifact,
      frame: { epochMsAtFrameZero: Date.parse(artifact.capturedAtIso), frameRateHz: 12 },
      calibration: calibratedVerdict()
    });
    expect(authoritative.schema).toBe(PERFMON_MPRR_SYNC_SCHEMA);
    expect(authoritative.calibrated).toBe(true);
    expect(authoritative.authoritative).toBe(true);
    expect(authoritative.samples).toHaveLength(perf.sampleCount);
    // Bit-exact 40-bit machine strip + HH:MM:SS.cc stopwatch on every sample.
    for (const sample of authoritative.samples) {
      expect(sample.machineStripBits).toHaveLength(40);
      expect(sample.stopwatchText).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{2}$/);
    }

    // A non-calibrated verdict yields a non-authoritative synchronization.
    const nonAuthoritative = buildPerfmonMprrSync({
      artifact,
      frame: { epochMsAtFrameZero: Date.parse(artifact.capturedAtIso), frameRateHz: 12 },
      calibration: { calibrated: false } as ReturnType<typeof calibratedVerdict>
    });
    expect(nonAuthoritative.authoritative).toBe(false);
  });

  it('replays the TDMS/artifact byte stream through the bounded-RAM ring: fail-closed admission + byte-identical round-trip (VHS-REQ-713.5)', () => {
    const perf = parsePdhCsv(syntheticPdhCsv(30));
    const artifact = buildFirstRunPerfmonArtifact({
      source: 'self-hosted-runner',
      actor: 'windows-host-2026-x64',
      capturedAtIso: '2026-07-23T06:00:00.000Z',
      perf,
      wallMs: 29_000,
      cycles: [{ cycleIndex: 1, durationMs: 29_000, outcome: 'compared' }]
    });
    const model = buildPerfmonTdmsModel(artifact);
    const stream = Buffer.from(`${JSON.stringify(model)}\n${JSON.stringify(artifact)}`, 'utf8');

    const third = Math.ceil(stream.length / 3);
    const byteLedger = { 0: third, 1: third, 2: stream.length - 2 * third };
    const required = computeRequiredThreeBlockCapacityBytes(byteLedger);
    const blocked = planRingAdmission(Math.floor(required / 2), byteLedger);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/admission-control-blocked/);
    expect(planRingAdmission(required, byteLedger).ok).toBe(true);

    const capacity = Math.max(MIN_RING_CAPACITY_BYTES, required);
    const ring = new DeterministicRollingBlockRing(capacity);
    const chunkSize = Math.max(1, Math.floor(capacity / 4));
    const readBack = Buffer.alloc(stream.length);
    let cursor = 0;
    while (cursor < stream.length) {
      const end = Math.min(cursor + chunkSize, stream.length);
      const chunk = stream.subarray(cursor, end);
      const write = ring.write(new Uint8Array(chunk));
      expect(write.ok).toBe(true);
      const view = ring.read(write.absoluteStart, chunk.length);
      Buffer.from(view).copy(readBack, cursor);
      ring.advanceTail(write.absoluteEnd);
      cursor = end;
    }
    expect(Buffer.compare(readBack, stream)).toBe(0);
  });

  it('reports a cross-session pattern over two captures for agent troubleshooting (VHS-REQ-713.5)', () => {
    const coldArtifact = buildFirstRunPerfmonArtifact({
      source: 'self-hosted-runner',
      actor: 'windows-host-2026-x64',
      capturedAtIso: '2026-07-23T06:00:00.000Z',
      perf: parsePdhCsv(syntheticPdhCsv(15)),
      wallMs: 14_000,
      cycles: [{ cycleIndex: 1, durationMs: 14_000, outcome: 'compared' }]
    });
    const warmArtifact = buildFirstRunPerfmonArtifact({
      source: 'self-hosted-runner',
      actor: 'windows-host-2026-x64-resident',
      capturedAtIso: '2026-07-23T06:05:00.000Z',
      perf: parsePdhCsv(syntheticPdhCsv(15)),
      wallMs: 15_000,
      cycles: []
    });
    const pattern = analyzePerfmonSessionPattern([
      summarizePerfmonSession(coldArtifact, 'cold-compare'),
      summarizePerfmonSession(warmArtifact, 'warm-resident')
    ]);
    expect(pattern.sessionCount).toBe(2);
    expect(pattern.orderedSessionIds).toEqual(['cold-compare', 'warm-resident']);
  });
});
