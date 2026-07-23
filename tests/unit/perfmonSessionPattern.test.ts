// Requirement coverage: VHS-REQ-707 (Mirror-Mode dual real-runtime validation) —
// the cross-session perfmon pattern for agent troubleshooting (VHS-REQ-707.19).
// Pure and deterministic: per-session observations in, one interpretable pattern
// out (trends, anomalies, agent-readable interpretations).
import { describe, expect, it } from 'vitest';

import {
  buildFirstRunPerfmonArtifact,
  parsePdhCsv
} from '../../src/reporting/mirror/perfmonSampleSeries';
import {
  PERFMON_SESSION_PATTERN_SCHEMA,
  type PerfmonSessionObservation,
  analyzePerfmonSessionPattern,
  renderPerfmonSessionPatternReport,
  summarizePerfmonSession
} from '../../src/reporting/mirror/perfmonSessionPattern';

const CSV_LABVIEW = [
  String.raw`"(PDH-CSV 4.0) (UTC)(0)","\\H\Processor(_Total)\% Processor Time","\\H\Memory\Available MBytes","\\H\PhysicalDisk(_Total)\% Disk Time","\\H\Process(LabVIEW)\% Processor Time","\\H\Process(LabVIEW)\Working Set"`,
  '"07/23/2026 06:04:44.000","10","4000","5","20","104857600"',
  '"07/23/2026 06:04:45.000","60","3800","40","75","209715200"'
].join('\n');

function obs(
  over: Partial<PerfmonSessionObservation> & { sessionId: string; capturedAtIso: string }
): PerfmonSessionObservation {
  return {
    source: 'self-hosted-runner',
    actor: 'a',
    peakCpuPct: null,
    minMemAvailMb: null,
    peakDiskPct: null,
    peakLabviewCpuPct: null,
    peakLabviewWorkingSetMb: null,
    wallMs: null,
    sampleCount: 0,
    cycleCount: 0,
    ...over
  };
}

function isoAt(second: number): string {
  return `2026-07-23T06:00:${String(second).padStart(2, '0')}.000Z`;
}

describe('summarizePerfmonSession (VHS-REQ-707.19)', () => {
  it('derives the compact observation from a first-run artifact', () => {
    const artifact = buildFirstRunPerfmonArtifact({
      source: 'docker-container',
      actor: 'docker-x64',
      capturedAtIso: '2026-07-23T06:04:44.000Z',
      perf: parsePdhCsv(CSV_LABVIEW)
    });
    const observation = summarizePerfmonSession(artifact, 'sess-1');
    expect(observation).toMatchObject({
      sessionId: 'sess-1',
      source: 'docker-container',
      peakCpuPct: 60,
      minMemAvailMb: 3800,
      peakDiskPct: 40,
      peakLabviewCpuPct: 75,
      peakLabviewWorkingSetMb: 200,
      sampleCount: 2,
      cycleCount: 0
    });
  });

  it('fails closed on a bad artifact and an empty session id', () => {
    expect(() => summarizePerfmonSession({ schema: 'nope' } as never, 's')).toThrow(/first-run-perfmon@v1/);
    const artifact = buildFirstRunPerfmonArtifact({
      source: 'docker-container',
      actor: 'd',
      capturedAtIso: '2026-07-23T06:04:44.000Z',
      perf: parsePdhCsv(CSV_LABVIEW)
    });
    expect(() => summarizePerfmonSession(artifact, '  ')).toThrow(/non-empty string/);
  });
});

describe('analyzePerfmonSessionPattern (VHS-REQ-707.19)', () => {
  it('fails closed on an empty observation set', () => {
    expect(() => analyzePerfmonSessionPattern([])).toThrow(/at least one session observation/);
  });

  it('reports insufficient history for a single session', () => {
    const pattern = analyzePerfmonSessionPattern([obs({ sessionId: 's1', capturedAtIso: isoAt(1), peakCpuPct: 10 })]);
    expect(pattern.schema).toBe(PERFMON_SESSION_PATTERN_SCHEMA);
    expect(pattern.sessionCount).toBe(1);
    expect(pattern.trends).toHaveLength(0);
    expect(pattern.interpretations[0]).toMatch(/Insufficient session history/);
  });

  it('flags a monotonic rising LabVIEW working set as a possible memory leak', () => {
    const pattern = analyzePerfmonSessionPattern([
      obs({ sessionId: 's1', capturedAtIso: isoAt(1), peakLabviewWorkingSetMb: 100 }),
      obs({ sessionId: 's2', capturedAtIso: isoAt(2), peakLabviewWorkingSetMb: 150 }),
      obs({ sessionId: 's3', capturedAtIso: isoAt(3), peakLabviewWorkingSetMb: 220 }),
      obs({ sessionId: 's4', capturedAtIso: isoAt(4), peakLabviewWorkingSetMb: 300 })
    ]);
    const ws = pattern.trends.find((t) => t.metric === 'labviewWorkingSetPeakMb')!;
    expect(ws.direction).toBe('rising');
    expect(ws.monotonic).toBe(true);
    expect(ws.deltaFirstToLast).toBe(200);
    expect(pattern.interpretations.some((s) => /possible memory leak/.test(s))).toBe(true);
  });

  it('flags falling available memory as rising memory pressure', () => {
    const pattern = analyzePerfmonSessionPattern([
      obs({ sessionId: 's1', capturedAtIso: isoAt(1), minMemAvailMb: 4000 }),
      obs({ sessionId: 's2', capturedAtIso: isoAt(2), minMemAvailMb: 3500 }),
      obs({ sessionId: 's3', capturedAtIso: isoAt(3), minMemAvailMb: 2000 })
    ]);
    const mem = pattern.trends.find((t) => t.metric === 'memAvailMinMb')!;
    expect(mem.direction).toBe('falling');
    expect(pattern.interpretations.some((s) => /rising memory pressure/.test(s))).toBe(true);
  });

  it('reports rising CPU and disk trends', () => {
    const pattern = analyzePerfmonSessionPattern([
      obs({ sessionId: 's1', capturedAtIso: isoAt(1), peakCpuPct: 10, peakDiskPct: 5 }),
      obs({ sessionId: 's2', capturedAtIso: isoAt(2), peakCpuPct: 20, peakDiskPct: 15 }),
      obs({ sessionId: 's3', capturedAtIso: isoAt(3), peakCpuPct: 30, peakDiskPct: 25 })
    ]);
    expect(pattern.interpretations.some((s) => /Peak CPU is trending up/.test(s))).toBe(true);
    expect(pattern.interpretations.some((s) => /Peak disk activity is trending up/.test(s))).toBe(true);
  });

  it('detects an anomalous session by z-score', () => {
    const sessions = [5, 5, 5, 5, 5, 5, 80].map((disk, i) =>
      obs({ sessionId: `s${i + 1}`, capturedAtIso: isoAt(i + 1), peakDiskPct: disk })
    );
    const pattern = analyzePerfmonSessionPattern(sessions);
    const anomaly = pattern.anomalies.find((a) => a.sessionId === 's7');
    expect(anomaly).toBeDefined();
    expect(anomaly!.metric).toBe('diskPeakPct');
    expect(Math.abs(anomaly!.zScore)).toBeGreaterThan(2);
    expect(pattern.interpretations.some((s) => /anomalous peak disk activity/.test(s))).toBe(true);
  });

  it('orders sessions by capture time and reports no trend when flat', () => {
    const pattern = analyzePerfmonSessionPattern([
      obs({ sessionId: 'late', capturedAtIso: isoAt(9), peakCpuPct: 10, minMemAvailMb: 4000, peakDiskPct: 5 }),
      obs({ sessionId: 'early', capturedAtIso: isoAt(1), peakCpuPct: 10, minMemAvailMb: 4000, peakDiskPct: 5 })
    ]);
    expect(pattern.orderedSessionIds).toEqual(['early', 'late']);
    const cpu = pattern.trends.find((t) => t.metric === 'cpuPeakPct')!;
    expect(cpu.direction).toBe('flat');
    expect(cpu.monotonic).toBe(false);
    expect(pattern.interpretations).toEqual(['No significant cross-session resource trend detected across 2 sessions.']);
  });

  it('skips a metric with fewer than two defined points', () => {
    const pattern = analyzePerfmonSessionPattern([
      obs({ sessionId: 's1', capturedAtIso: isoAt(1), peakCpuPct: 10, peakLabviewWorkingSetMb: 100 }),
      obs({ sessionId: 's2', capturedAtIso: isoAt(2), peakCpuPct: 20 }),
      obs({ sessionId: 's3', capturedAtIso: isoAt(3), peakCpuPct: 30 })
    ]);
    expect(pattern.trends.find((t) => t.metric === 'labviewWorkingSetPeakMb')).toBeUndefined();
    expect(pattern.trends.find((t) => t.metric === 'cpuPeakPct')).toBeDefined();
  });
});

describe('renderPerfmonSessionPatternReport (VHS-REQ-707.19)', () => {
  it('renders interpretations and the trend table', () => {
    const pattern = analyzePerfmonSessionPattern([
      obs({ sessionId: 's1', capturedAtIso: isoAt(1), peakLabviewWorkingSetMb: 100 }),
      obs({ sessionId: 's2', capturedAtIso: isoAt(2), peakLabviewWorkingSetMb: 300 })
    ]);
    const report = renderPerfmonSessionPatternReport(pattern);
    expect(report).toContain('Perfmon cross-session pattern — 2 session(s)');
    expect(report).toContain('trends:');
    expect(report).toContain('peak LabVIEW working set: rising');
  });
});
