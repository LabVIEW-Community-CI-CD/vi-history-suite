// Requirement coverage: VHS-REQ-707 (Mirror-Mode dual real-runtime validation) —
// the first-run perfmon sample-series parser and pull-request renderer
// (VHS-REQ-707.12). Deterministic, no I/O; fixtures mirror real `logman`
// PDH-CSV 4.0 output captured on a self-hosted Vagrant actor.
import { describe, expect, it } from 'vitest';

import {
  parsePdhCsv,
  renderPerfmonMermaidXychart,
  PERFMON_SAMPLE_SERIES_SCHEMA
} from '../../src/reporting/mirror/perfmonSampleSeries';

const HEADER_3 = String.raw`"(PDH-CSV 4.0) (Pacific Daylight Time)(420)","\\HARNESS\Processor(_Total)\% Processor Time","\\HARNESS\Memory\Available MBytes","\\HARNESS\PhysicalDisk(_Total)\% Disk Time"`;
const HEADER_5 = String.raw`"(PDH-CSV 4.0) (Pacific Daylight Time)(420)","\\HARNESS\Processor(_Total)\% Processor Time","\\HARNESS\Memory\Available MBytes","\\HARNESS\PhysicalDisk(_Total)\% Disk Time","\\HARNESS\Process(LabVIEW)\% Processor Time","\\HARNESS\Process(LabVIEW)\Working Set - Private"`;

describe('parsePdhCsv (VHS-REQ-707.12)', () => {
  it('parses the three system counters, blanks -> null, elapsed t + median interval + peaks', () => {
    const csv = [
      HEADER_3,
      '"07/23/2026 06:04:43.000"," ","4112"," "',
      '"07/23/2026 06:04:44.000","68.1","4117","1056.5"',
      '"07/23/2026 06:04:45.000","74.6","4155","296.5"'
    ].join('\n');
    const s = parsePdhCsv(csv);
    expect(s.schema).toBe(PERFMON_SAMPLE_SERIES_SCHEMA);
    expect(s.sampleCount).toBe(3);
    expect(s.t).toEqual([0, 1000, 2000]);
    expect(s.intervalMs).toBe(1000);
    // The leading warm-up sample reports blank cells; those are missing, not zero.
    expect(s.series.cpuTotalPct).toEqual([null, 68.1, 74.6]);
    expect(s.series.memAvailMb).toEqual([4112, 4117, 4155]);
    expect(s.series.diskTotalPct).toEqual([null, 1056.5, 296.5]);
    expect(s.series.labviewCpuPct).toBeUndefined();
    expect(s.series.labviewWorkingSetMb).toBeUndefined();
    expect(s.peaks.cpuTotalPct).toBe(74.6);
    expect(s.peaks.memAvailMb).toBe(4155);
    expect(s.peaks.diskTotalPct).toBe(1056.5);
  });

  it('captures LabVIEW process counters when present and converts working-set bytes to MB', () => {
    const csv = [
      HEADER_5,
      '"07/23/2026 06:04:44.000","10","4000","5","55.5","104857600"'
    ].join('\n');
    const s = parsePdhCsv(csv);
    expect(s.series.labviewCpuPct).toEqual([55.5]);
    // 104857600 bytes / (1024*1024) = 100 MB.
    expect(s.series.labviewWorkingSetMb).toEqual([100]);
    expect(s.peaks.labviewCpuPct).toBe(55.5);
    expect(s.peaks.labviewWorkingSetMb).toBe(100);
  });

  it('fails closed on empty text and on a non-PDH header', () => {
    expect(() => parsePdhCsv('')).toThrow(/non-empty/);
    expect(() => parsePdhCsv('"time","x"\n"07/23/2026 06:04:44.000","1"')).toThrow(/PDH-CSV/);
  });
});

describe('renderPerfmonMermaidXychart (VHS-REQ-707.12)', () => {
  it('emits GitHub-native xychart-beta blocks for CPU/disk and memory, mapping missing samples to 0', () => {
    const csv = [
      HEADER_3,
      '"07/23/2026 06:04:43.000"," ","4112"," "',
      '"07/23/2026 06:04:44.000","68.1","4117","1056.5"'
    ].join('\n');
    const block = renderPerfmonMermaidXychart(parsePdhCsv(csv), { title: 'clean-vm first run' });
    expect(block).toContain('```mermaid');
    expect(block).toContain('xychart-beta');
    expect(block).toContain('clean-vm first run');
    expect(block).toContain('MBytes');
    // The missing warm-up CPU sample renders as 0; the real sample is preserved.
    expect(block).toContain('line [0, 68.1]');
    expect(block).toContain('line [4112, 4117]');
  });

  it('is deterministic', () => {
    const csv = [HEADER_3, '"07/23/2026 06:04:44.000","1","4000","2"'].join('\n');
    const s = parsePdhCsv(csv);
    expect(renderPerfmonMermaidXychart(s)).toBe(renderPerfmonMermaidXychart(s));
  });
});

describe('parsePdhCsv + renderer edge cases (VHS-REQ-707.12)', () => {
  it('throws on a PDH header with no counter columns', () => {
    expect(() => parsePdhCsv('"(PDH-CSV 4.0) (UTC)(0)"')).toThrow(/PDH-CSV/);
  });

  it('skips a no-quote line and a non-timestamp row, and treats a missing trailing cell as null', () => {
    const csv = [
      HEADER_3,
      'garbage-line-without-quotes',
      '"not-a-timestamp","1","2","3"',
      '"07/23/2026 06:04:44.000","10","4000"'
    ].join('\n');
    const s = parsePdhCsv(csv);
    expect(s.sampleCount).toBe(1);
    expect(s.series.cpuTotalPct).toEqual([10]);
    // The disk column is absent from the short row, so the cell is missing, not zero.
    expect(s.series.diskTotalPct).toEqual([null]);
  });

  it('derives an odd-count median interval from two samples', () => {
    const csv = [
      HEADER_3,
      '"07/23/2026 06:04:44.000","10","4000","5"',
      '"07/23/2026 06:04:46.000","12","4001","6"'
    ].join('\n');
    expect(parsePdhCsv(csv).intervalMs).toBe(2000);
  });

  it('takes the first column when a counter maps twice (two LabVIEW processes)', () => {
    const header = String.raw`"(PDH-CSV 4.0) (UTC)(0)","\\H\Processor(_Total)\% Processor Time","\\H\Process(LabVIEW)\% Processor Time","\\H\Process(LabVIEWCLI)\% Processor Time"`;
    const csv = [
      header,
      '"07/23/2026 06:04:44.000","10","20","30"',
      '"07/23/2026 06:04:45.000","11","21","31"'
    ].join('\n');
    const s = parsePdhCsv(csv);
    expect(s.series.cpuTotalPct).toEqual([10, 11]);
    expect(s.series.labviewCpuPct).toEqual([20, 21]);
  });

  it('reports null peaks for an all-blank series and still renders', () => {
    const s = parsePdhCsv([HEADER_3, '"07/23/2026 06:04:44.000"," ","4000"," "'].join('\n'));
    expect(s.peaks.cpuTotalPct).toBeNull();
    expect(s.peaks.diskTotalPct).toBeNull();
    expect(s.peaks.memAvailMb).toBe(4000);
    const block = renderPerfmonMermaidXychart(s);
    expect(block).toContain('First-run performance monitor');
    expect(block).toContain('line [0]');
  });

  it('renders a zero-sample capture without throwing', () => {
    const s = parsePdhCsv([HEADER_3, '"bad-row","1","2","3"'].join('\n'));
    expect(s.sampleCount).toBe(0);
    expect(renderPerfmonMermaidXychart(s)).toContain('x-axis "sample" 0 --> 0');
  });
});
