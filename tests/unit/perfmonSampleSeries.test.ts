// Requirement coverage: VHS-REQ-707 (Mirror-Mode dual real-runtime validation) —
// the first-run perfmon sample-series parser and pull-request renderer
// (VHS-REQ-707.12). Deterministic, no I/O; fixtures mirror real `logman`
// PDH-CSV 4.0 output captured on a self-hosted Vagrant actor.
import { describe, expect, it } from 'vitest';

import {
  parsePdhCsv,
  renderPerfmonMermaidXychart,
  buildFirstRunPerfmonArtifact,
  renderFirstRunPerfmonPrComment,
  PERFMON_SAMPLE_SERIES_SCHEMA,
  FIRST_RUN_PERFMON_ARTIFACT_SCHEMA
} from '../../src/reporting/mirror/perfmonSampleSeries';
import { alignFramesToPerf } from '../../src/reporting/mirror/frameTimingAlignment';
import { encodeMprrMachineStrip } from '../../src/reporting/mirror/perfmonMprrSync';

const HEADER_3 = String.raw`"(PDH-CSV 4.0) (Pacific Daylight Time)(420)","\\HARNESS\Processor(_Total)\% Processor Time","\\HARNESS\Memory\Available MBytes","\\HARNESS\PhysicalDisk(_Total)\% Disk Time"`;
const HEADER_5 = String.raw`"(PDH-CSV 4.0) (Pacific Daylight Time)(420)","\\HARNESS\Processor(_Total)\% Processor Time","\\HARNESS\Memory\Available MBytes","\\HARNESS\PhysicalDisk(_Total)\% Disk Time","\\HARNESS\Process(LabVIEW)\% Processor Time","\\HARNESS\Process(LabVIEW)\Working Set"`;

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

describe('buildFirstRunPerfmonArtifact + renderFirstRunPerfmonPrComment (VHS-REQ-707.12)', () => {
  const series = () =>
    parsePdhCsv(
      [
        HEADER_3,
        '"07/23/2026 06:04:44.000","10","4000","5"',
        '"07/23/2026 06:04:45.000","60","3800","40"'
      ].join('\n')
    );

  it('assembles a schema-versioned artifact from either source with cycles and wall time', () => {
    const artifact = buildFirstRunPerfmonArtifact({
      source: 'self-hosted-runner',
      actor: 'vagrant-win-x86-hostnative',
      capturedAtIso: '2026-07-23T06:04:43.000Z',
      perf: series(),
      wallMs: 175000,
      cycles: [{ cycleIndex: 1, durationMs: 120000, outcome: 'compared' }]
    });
    expect(artifact.schema).toBe(FIRST_RUN_PERFMON_ARTIFACT_SCHEMA);
    expect(artifact.source).toBe('self-hosted-runner');
    expect(artifact.wallMs).toBe(175000);
    expect(artifact.cycles).toHaveLength(1);
    expect(artifact.perf.schema).toBe(PERFMON_SAMPLE_SERIES_SCHEMA);
  });

  it('defaults wall to null and cycles to empty, and fails closed on bad input', () => {
    const artifact = buildFirstRunPerfmonArtifact({
      source: 'docker-container',
      actor: 'docker-linux-x64',
      capturedAtIso: '2026-07-23T06:04:43.000Z',
      perf: series()
    });
    expect(artifact.wallMs).toBeNull();
    expect(artifact.cycles).toEqual([]);
    const iso = '2026-07-23T06:04:43.000Z';
    expect(() =>
      buildFirstRunPerfmonArtifact({ source: 'bad' as never, actor: 'x', capturedAtIso: iso, perf: series() })
    ).toThrow(/source/);
    expect(() =>
      buildFirstRunPerfmonArtifact({ source: 'docker-container', actor: '  ', capturedAtIso: iso, perf: series() })
    ).toThrow(/actor/);
    expect(() =>
      buildFirstRunPerfmonArtifact({ source: 'docker-container', actor: 'x', capturedAtIso: '', perf: series() })
    ).toThrow(/capturedAtIso/);
    expect(() =>
      buildFirstRunPerfmonArtifact({
        source: 'docker-container',
        actor: 'x',
        capturedAtIso: iso,
        perf: { schema: 'nope' } as never
      })
    ).toThrow(/perfmon sample series/);
  });

  it('renders a PR comment with actor header, peak/pressure table, cycles, and the Mermaid chart', () => {
    const artifact = buildFirstRunPerfmonArtifact({
      source: 'self-hosted-runner',
      actor: 'vagrant-win-x86-hostnative',
      capturedAtIso: '2026-07-23T06:04:43.000Z',
      perf: series(),
      wallMs: 175000,
      cycles: [{ cycleIndex: 1, durationMs: 120000, outcome: 'compared' }]
    });
    const md = renderFirstRunPerfmonPrComment(artifact);
    expect(md).toContain('### First-run performance monitor — self-hosted-runner');
    expect(md).toContain('vagrant-win-x86-hostnative');
    expect(md).toContain('Peak CPU total | 60%');
    expect(md).toContain('Min available memory | 3800 MB');
    expect(md).toContain('Cycle 1 (compared) | 120000 ms');
    expect(md).toContain('wall 175000ms');
    expect(md).toContain('```mermaid');
  });

  it('includes LabVIEW process rows when the series carries them', () => {
    const perf = parsePdhCsv(
      [HEADER_5, '"07/23/2026 06:04:44.000","10","4000","5","55.5","104857600"'].join('\n')
    );
    const md = renderFirstRunPerfmonPrComment(
      buildFirstRunPerfmonArtifact({
        source: 'self-hosted-runner',
        actor: 'x',
        capturedAtIso: '2026-07-23T06:04:43.000Z',
        perf
      })
    );
    expect(md).toContain('Peak LabVIEW CPU');
    expect(md).toContain('Peak LabVIEW working set | 100 MB');
  });

  it('appends the per-state chart when a frame-timing alignment is supplied (VHS-REQ-707.21, #2342/#2343)', () => {
    const artifact = buildFirstRunPerfmonArtifact({
      source: 'self-hosted-runner',
      actor: 'x',
      capturedAtIso: '2026-07-23T06:04:43.000Z',
      perf: series()
    });
    const alignment = alignFramesToPerf({
      frames: [{ frameIndex: 0, stripBits: encodeMprrMachineStrip(10) }],
      perf: { t: [0, 100], cpuTotalPct: [10, 20], memAvailMb: [900, 800], diskTotalPct: [1, 2] },
      states: [{ state: 'STAGING', startMs: 0, endMs: 100 }],
      epochOffsetMs: 0
    });
    const withChart = renderFirstRunPerfmonPrComment(artifact, { stateAlignment: alignment });
    expect(withChart).toContain('#### Per-state resource pressure — self-hosted-runner');
    expect(withChart).toContain('x-axis [STAGING]');
    // Absent an alignment the section is omitted (not fabricated).
    expect(renderFirstRunPerfmonPrComment(artifact)).not.toContain('Per-state resource pressure');
  });
});

describe('parsePdhCsv generic channels (VHS-REQ-715.1)', () => {
  it('emits every counter as a host-independent channel, aligned and a superset of the named series', () => {
    const csv = [
      HEADER_5,
      '"07/23/2026 06:04:44.000","68.1","4117","1056.5","12.5","2097152"',
      '"07/23/2026 06:04:45.000","74.6","4155","296.5","20.0","4194304"'
    ].join('\n');
    const s = parsePdhCsv(csv);
    // Five counter columns -> five channels, in header order, `\\HARNESS` stripped.
    expect(s.channels.map((c) => c.counterPath)).toEqual([
      String.raw`\Processor(_Total)\% Processor Time`,
      String.raw`\Memory\Available MBytes`,
      String.raw`\PhysicalDisk(_Total)\% Disk Time`,
      String.raw`\Process(LabVIEW)\% Processor Time`,
      String.raw`\Process(LabVIEW)\Working Set`
    ]);
    // Raw per-sample values, aligned 1:1 with t; peak is the numeric maximum.
    expect(s.channels[0].samples).toEqual([68.1, 74.6]);
    expect(s.channels[0].peak).toBe(74.6);
    // Channels keep RAW bytes (the named labviewWorkingSetMb series converts to MB).
    expect(s.channels[4].samples).toEqual([2097152, 4194304]);
    // Superset: the named cpu series equals its channel; every channel aligns to sampleCount.
    expect(s.series.cpuTotalPct).toEqual(s.channels[0].samples);
    for (const ch of s.channels) {
      expect(ch.samples).toHaveLength(s.sampleCount);
    }
  });

  it('maps the named working-set series to total Working Set, never the private variant (VHS-REQ-715.1)', () => {
    // The full profile captures BOTH `Working Set` and `Working Set - Private`.
    // The named series must deterministically be the TOTAL working set (not the
    // private variant, and independent of column order); the private counter is
    // still preserved as a generic channel.
    const header = String.raw`"(PDH-CSV 4.0)","\\HARNESS\Process(LabVIEW)\Working Set","\\HARNESS\Process(LabVIEW)\Working Set - Private"`;
    const csv = [header, '"07/23/2026 06:04:44.000","104857600","52428800"'].join('\n');
    const s = parsePdhCsv(csv);
    // 104857600 bytes -> 100 MB (total), NOT 52428800 -> 50 MB (private).
    expect(s.series.labviewWorkingSetMb).toEqual([100]);
    // Both counters remain generic channels with raw byte values.
    expect(s.channels.map((c) => c.counterPath)).toEqual([
      String.raw`\Process(LabVIEW)\Working Set`,
      String.raw`\Process(LabVIEW)\Working Set - Private`
    ]);
    expect(s.channels[1].samples).toEqual([52428800]);
  });

  it('captures an unrecognized counter as a channel even though it maps to no named series', () => {
    const header = String.raw`"(PDH-CSV 4.0)","\\HARNESS\Process(LabVIEW)\Private Bytes"`;
    const csv = [header, '"07/23/2026 06:04:44.000","1048576"'].join('\n');
    const s = parsePdhCsv(csv);
    expect(s.channels).toHaveLength(1);
    expect(s.channels[0].counterPath).toBe(String.raw`\Process(LabVIEW)\Private Bytes`);
    expect(s.channels[0].samples).toEqual([1048576]);
    expect(s.channels[0].peak).toBe(1048576);
  });
});
