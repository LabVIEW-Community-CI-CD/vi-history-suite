// Requirement coverage: VHS-REQ-707 (Mirror-Mode dual real-runtime validation) —
// the first-run perfmon capture plan (VHS-REQ-707.14). Pure and deterministic:
// the builder returns a logman command plan as data with no process spawn.
import { describe, expect, it } from 'vitest';

import { parsePdhCsv } from '../../src/reporting/mirror/perfmonSampleSeries';
import {
  PERFMON_CAPTURE_PLAN_SCHEMA,
  PERFMON_SYSTEM_COUNTERS,
  PERFMON_FULL_PROFILE_SYSTEM_COUNTERS,
  buildWindowsPerfmonCapturePlan,
  describePerfmonCapturePlan,
  formatLogmanInterval,
  labviewProcessCounters,
  labviewProcessFullProfileCounters,
  type PerfmonCaptureRequest
} from '../../src/reporting/mirror/perfmonCapturePlan';

describe('formatLogmanInterval (VHS-REQ-707.14)', () => {
  it('formats whole seconds as [[hh:]mm:]ss', () => {
    expect(formatLogmanInterval(1)).toBe('00:00:01');
    expect(formatLogmanInterval(65)).toBe('00:01:05');
    expect(formatLogmanInterval(3661)).toBe('01:01:01');
  });

  it('fails closed on non-integer, zero, negative, and out-of-range intervals', () => {
    expect(() => formatLogmanInterval(0)).toThrow(/between 1 and 86399/);
    expect(() => formatLogmanInterval(-1)).toThrow(/between 1 and 86399/);
    expect(() => formatLogmanInterval(1.5)).toThrow(/between 1 and 86399/);
    expect(() => formatLogmanInterval(86_400)).toThrow(/between 1 and 86399/);
  });
});

describe('labviewProcessCounters (VHS-REQ-707.14)', () => {
  it('resolves the two LabVIEW process counters for an exact name', () => {
    expect(labviewProcessCounters('LabVIEW')).toEqual([
      String.raw`\Process(LabVIEW)\% Processor Time`,
      String.raw`\Process(LabVIEW)\Working Set`
    ]);
  });

  it('fails closed on an empty process name', () => {
    expect(() => labviewProcessCounters('  ')).toThrow(/non-empty process name/);
  });
});

describe('buildWindowsPerfmonCapturePlan (VHS-REQ-707.14)', () => {
  it('builds a system-only logman lifecycle plan', () => {
    const plan = buildWindowsPerfmonCapturePlan({
      collectorName: 'vihs-firstrun',
      outputCsvPath: 'C:/vihs-proof-tmp/perf.csv',
      sampleIntervalSec: 1
    });
    expect(plan.schema).toBe(PERFMON_CAPTURE_PLAN_SCHEMA);
    expect(plan.platform).toBe('windows');
    expect(plan.counters).toEqual([...PERFMON_SYSTEM_COUNTERS]);
    expect(plan.create.command).toBe('logman');
    expect(plan.create.args).toEqual([
      'create',
      'counter',
      'vihs-firstrun',
      '-f',
      'csv',
      '-o',
      'C:/vihs-proof-tmp/perf.csv',
      '-si',
      '00:00:01',
      '-c',
      String.raw`\Processor(_Total)\% Processor Time`,
      '-c',
      String.raw`\Memory\Available MBytes`,
      '-c',
      String.raw`\PhysicalDisk(_Total)\% Disk Time`,
      '-ow'
    ]);
    expect(plan.start.args).toEqual(['start', 'vihs-firstrun']);
    expect(plan.stop.args).toEqual(['stop', 'vihs-firstrun']);
    expect(plan.delete.args).toEqual(['delete', 'vihs-firstrun']);
  });

  it('adds the LabVIEW process counters when a process name is given', () => {
    const plan = buildWindowsPerfmonCapturePlan({
      collectorName: 'vihs-warm',
      outputCsvPath: 'C:/tmp/warm.csv',
      sampleIntervalSec: 2,
      labviewProcessName: 'LabVIEW'
    });
    expect(plan.counters).toHaveLength(5);
    expect(plan.counters).toContain(String.raw`\Process(LabVIEW)\% Processor Time`);
    expect(plan.counters).toContain(String.raw`\Process(LabVIEW)\Working Set`);
  });

  it('fails closed on an empty or whitespaced collector name and an empty output path', () => {
    expect(() => buildWindowsPerfmonCapturePlan({ collectorName: '', outputCsvPath: 'x', sampleIntervalSec: 1 })).toThrow(/collectorName/);
    expect(() => buildWindowsPerfmonCapturePlan({ collectorName: 'bad name', outputCsvPath: 'x', sampleIntervalSec: 1 })).toThrow(/collectorName/);
    expect(() => buildWindowsPerfmonCapturePlan({ collectorName: 'ok', outputCsvPath: '   ', sampleIntervalSec: 1 })).toThrow(/outputCsvPath/);
    // Missing (undefined) fields exercise the nullish fallbacks, not just empty strings.
    expect(() => buildWindowsPerfmonCapturePlan({ outputCsvPath: 'x', sampleIntervalSec: 1 } as unknown as PerfmonCaptureRequest)).toThrow(/collectorName/);
    expect(() => buildWindowsPerfmonCapturePlan({ collectorName: 'ok', sampleIntervalSec: 1 } as unknown as PerfmonCaptureRequest)).toThrow(/outputCsvPath/);
  });

  it('emits counters that round-trip through parsePdhCsv into the expected series (capture -> parse integration)', () => {
    const plan = buildWindowsPerfmonCapturePlan({
      collectorName: 'vihs-rt',
      outputCsvPath: 'C:/tmp/rt.csv',
      sampleIntervalSec: 1,
      labviewProcessName: 'LabVIEW'
    });
    // Synthesize the PDH-CSV header logman would emit from the planned counters.
    const header = ['"(PDH-CSV 4.0) (UTC)(0)"', ...plan.counters.map((c) => `"${c}"`)].join(',');
    const row = ['"07/23/2026 06:04:44.000"', ...plan.counters.map(() => '"5"')].join(',');
    const series = parsePdhCsv([header, row].join('\n'));
    expect(series.series.cpuTotalPct).toEqual([5]);
    expect(series.series.memAvailMb).toEqual([5]);
    expect(series.series.diskTotalPct).toEqual([5]);
    expect(series.series.labviewCpuPct).toEqual([5]);
    // Working set is bytes -> MB in the parser; 5 bytes rounds to 0 MB.
    expect(series.series.labviewWorkingSetMb).toEqual([0]);
  });
});

describe('describePerfmonCapturePlan (VHS-REQ-707.14)', () => {
  it('renders the counter set and the ordered commands deterministically', () => {
    const plan = buildWindowsPerfmonCapturePlan({
      collectorName: 'vihs-firstrun',
      outputCsvPath: 'C:/tmp/perf.csv',
      sampleIntervalSec: 1
    });
    const text = describePerfmonCapturePlan(plan);
    expect(text).toContain('Perfmon capture plan vi-history-suite/perfmon-capture-plan@v1 (windows)');
    expect(text).toContain('collector: vihs-firstrun');
    expect(text).toContain(String.raw`\Processor(_Total)\% Processor Time`);
    expect(text).toContain('logman create counter vihs-firstrun');
    expect(text).toContain('logman start vihs-firstrun');
    expect(text).toContain('logman delete vihs-firstrun');
  });
});

describe('perfmon full-profile capture + generic channels (VHS-REQ-715.1, VHS-REQ-715.2)', () => {
  const base = { collectorName: 'c', outputCsvPath: 'o', sampleIntervalSec: 1 };

  it('defaults to the minimal profile (the 3 system counters, unchanged)', () => {
    const plan = buildWindowsPerfmonCapturePlan({ ...base });
    expect(plan.counters).toEqual([...PERFMON_SYSTEM_COUNTERS]);
  });

  it('captures the expanded system counter set under the full profile', () => {
    const plan = buildWindowsPerfmonCapturePlan({ ...base, profile: 'full' });
    expect(plan.counters).toEqual([...PERFMON_FULL_PROFILE_SYSTEM_COUNTERS]);
    expect(plan.counters).toContain(String.raw`\Memory\Committed Bytes`);
    expect(plan.counters).toContain(String.raw`\PhysicalDisk(_Total)\Disk Read Bytes/sec`);
  });

  it('adds the expanded LabVIEW process counters under the full profile', () => {
    const plan = buildWindowsPerfmonCapturePlan({ ...base, profile: 'full', labviewProcessName: 'LabVIEW' });
    expect(plan.counters).toEqual([
      ...PERFMON_FULL_PROFILE_SYSTEM_COUNTERS,
      ...labviewProcessFullProfileCounters('LabVIEW')
    ]);
    expect(plan.counters).toContain(String.raw`\Process(LabVIEW)\Private Bytes`);
    expect(plan.counters).toContain(String.raw`\Process(LabVIEW)\IO Read Bytes/sec`);
  });

  it('appends arbitrary extra counters, deduped with order preserved', () => {
    const plan = buildWindowsPerfmonCapturePlan({
      ...base,
      extraCounters: [
        String.raw`\Processor(_Total)\% Processor Time`, // already in the minimal profile -> deduped
        String.raw`\Network Interface(*)\Bytes Total/sec`
      ]
    });
    expect(plan.counters).toEqual([
      ...PERFMON_SYSTEM_COUNTERS,
      String.raw`\Network Interface(*)\Bytes Total/sec`
    ]);
  });

  it('fails closed on an empty extra counter', () => {
    expect(() => buildWindowsPerfmonCapturePlan({ ...base, extraCounters: ['   '] })).toThrow(
      /extraCounters/
    );
  });

  it('fails closed on an unrecognized profile', () => {
    expect(() =>
      buildWindowsPerfmonCapturePlan({ ...base, profile: 'expanded' as never })
    ).toThrow(/profile must be/);
  });

  it('fails closed on a non-array extraCounters (a bare string must not iterate per-char)', () => {
    expect(() =>
      buildWindowsPerfmonCapturePlan({ ...base, extraCounters: '\\Processor(_Total)\\% Processor Time' as never })
    ).toThrow(/extraCounters must be an array/);
  });

  it('round-trips a full-profile capture into generic host-independent channels', () => {
    const plan = buildWindowsPerfmonCapturePlan({ ...base, profile: 'full', labviewProcessName: 'LabVIEW' });
    // Synthesize a 2-sample PDH-CSV with a \\HOST prefix on every counter path.
    const header = ['"(PDH-CSV 4.0)"', ...plan.counters.map((c) => `"\\\\HOST${c}"`)].join(',');
    const mkRow = (ts: string, v: number) =>
      [`"${ts}"`, ...plan.counters.map(() => `"${v}"`)].join(',');
    const csv = [header, mkRow('01/01/2026 00:00:00.000', 1), mkRow('01/01/2026 00:00:01.000', 2)].join('\n');
    const series = parsePdhCsv(csv);
    // Every captured counter is a channel, host prefix stripped, aligned to t.
    expect(series.channels.length).toBe(plan.counters.length);
    expect(series.channels.map((ch) => ch.counterPath)).toEqual([...plan.counters]);
    for (const ch of series.channels) {
      expect(ch.samples).toEqual([1, 2]);
      expect(ch.peak).toBe(2);
    }
    // channels is a superset of the named series, AND surfaces per-process
    // full-profile metadata that the 5 named channels never carried.
    expect(series.channels.some((ch) => ch.counterPath === String.raw`\Processor(_Total)\% Processor Time`)).toBe(true);
    expect(series.channels.some((ch) => ch.counterPath === String.raw`\Process(LabVIEW)\Private Bytes`)).toBe(true);
    expect(series.channels.some((ch) => ch.counterPath === String.raw`\Process(LabVIEW)\Thread Count`)).toBe(true);
  });
});
