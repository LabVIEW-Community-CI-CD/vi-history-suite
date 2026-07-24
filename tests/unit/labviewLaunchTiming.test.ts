// Requirement coverage: VHS-REQ-707 (Mirror-Mode Dual Real-Runtime LabVIEW
// Validation) — deterministic LabVIEW launch-timing parser (VHS-REQ-707.24, epic
// #2344 Phase 1b). Pure parse of a per-launch LabVIEW/LabVIEWCLI application log
// into identity + lifecycle markers (the `#Date:` process start is second-
// precision; the init and execution-ready markers are millisecond-precision),
// separating launch dead time from active work. Samples mirror real host-native
// `%TEMP%` logs.
import { describe, expect, it } from 'vitest';

import {
  LABVIEW_LAUNCH_TIMING_SCHEMA,
  parseLabVIEWLaunchTiming
} from '../../src/reporting/mirror/labviewLaunchTiming';

// A real headless LabVIEW.exe application log (trimmed), as written to
// %TEMP%\LabVIEW_64_26.1.2f2_headless_<user>_cur.txt on each launch.
const HEADLESS_LABVIEW_LOG = [
  '####',
  '#Date: Fri, Jul 24, 2026 11:02:31 AM',
  '#OSName: Windows 10 Pro ',
  '#OSVers: 10.0',
  '#OSBuild: 26200',
  '#AppName: LabVIEW',
  '#Version: 26.1.2f2 64-bit',
  '#AppKind: FDS',
  '#AppRunMode: Headless',
  '#AppModDate: 4/24/2026 19:29 GMT',
  '#LabVIEW Base Address: 0x00007FF7C85A0000',
  '',
  '',
  '[HeadlessManager][7/24/2026 11:02:31.179 AM] Custom debug setting being applied in Headless Mode.',
  '[HeadlessManager][7/24/2026 11:02:31.179 AM] Initializing headless LabVIEW',
  '[HeadlessManager][7/24/2026 11:02:31.341 AM] Enabled logging of unwired errors in headless mode. Log file: C:\\Users\\x\\LabVIEW_240726_11-02-31_UnwiredErrors.log',
  'InitExecSystem() will use: 16 processors',
  'starting LabVIEW Execution System 2 Thread 0 , capacity: 24 at [3867728553.97316504, (11:02:33.973165036 2026:07:24)]',
  'starting LabVIEW Execution System 2 Thread 1 , capacity: 24 at [3867728553.97316504, (11:02:33.973165036 2026:07:24)]'
].join('\n');

// A real headless LabVIEWCLI (32-bit) application log (trimmed).
const HEADLESS_CLI_LOG = [
  '####',
  '#Date: Fri, Jul 24, 2026 11:05:34 AM',
  '#OSName: Windows 10 Enterprise ',
  '#AppName: LabVIEWCLI',
  '#Version: 26.1.2f2 32-bit',
  '#AppKind: AppLib',
  '#AppRunMode: Headless',
  '',
  '[HeadlessManager][7/24/2026 11:05:33.700 AM] Initializing headless LabVIEW',
  'starting LabVIEW Execution System 2 Thread 0 , capacity: 24 at [3867728735.36179924, (11:05:35.361799241 2026:07:24)]'
].join('\n');

describe('parseLabVIEWLaunchTiming (VHS-REQ-707.24, #2344)', () => {
  it('parses a headless LabVIEW log into identity + lifecycle markers', () => {
    const t = parseLabVIEWLaunchTiming(HEADLESS_LABVIEW_LOG);
    expect(t.schema).toBe(LABVIEW_LAUNCH_TIMING_SCHEMA);
    expect(t.schemaVersion).toBe(1);
    expect(t.appName).toBe('LabVIEW');
    expect(t.version).toBe('26.1.2f2 64-bit');
    expect(t.runMode).toBe('Headless');
    expect(t.processStartIso).toBe('2026-07-24T11:02:31.000');
    expect(t.initAtIso).toBe('2026-07-24T11:02:31.179');
    expect(t.executionReadyIso).toBe('2026-07-24T11:02:33.973');
    // 11:02:33.973 − 11:02:31.179 = 2794 ms.
    expect(t.initToReadyMs).toBe(2794);
  });

  it('parses a LabVIEWCLI (32-bit) log', () => {
    const t = parseLabVIEWLaunchTiming(HEADLESS_CLI_LOG);
    expect(t.appName).toBe('LabVIEWCLI');
    expect(t.version).toBe('26.1.2f2 32-bit');
    expect(t.processStartIso).toBe('2026-07-24T11:05:34.000');
    expect(t.initAtIso).toBe('2026-07-24T11:05:33.700');
    expect(t.executionReadyIso).toBe('2026-07-24T11:05:35.361');
    expect(t.initToReadyMs).toBe(1661);
  });

  it('handles a PM meridiem correctly (12-hour → 24-hour)', () => {
    const log = [
      '#Date: Fri, Jul 24, 2026 1:07:09 PM',
      '#AppName: LabVIEW',
      '#AppRunMode: Headless',
      '[HeadlessManager][7/24/2026 1:07:09.500 PM] Initializing headless LabVIEW',
      'starting LabVIEW Execution System 2 Thread 0 at [1.0, (13:07:11.250000000 2026:07:24)]'
    ].join('\n');
    const t = parseLabVIEWLaunchTiming(log);
    expect(t.processStartIso).toBe('2026-07-24T13:07:09.000');
    expect(t.initAtIso).toBe('2026-07-24T13:07:09.500');
    expect(t.executionReadyIso).toBe('2026-07-24T13:07:11.250');
    expect(t.initToReadyMs).toBe(1750);
  });

  it('returns explicit null for absent markers (a failed launch never reached ready)', () => {
    const log = [
      '#Date: Fri, Jul 24, 2026 11:02:31 AM',
      '#AppName: LabVIEW',
      '#AppRunMode: Headless',
      '[HeadlessManager][7/24/2026 11:02:31.179 AM] Initializing headless LabVIEW',
      'Failed to initialize headless LabVIEW.'
    ].join('\n');
    const t = parseLabVIEWLaunchTiming(log);
    expect(t.initAtIso).toBe('2026-07-24T11:02:31.179');
    expect(t.executionReadyIso).toBeNull();
    expect(t.initToReadyMs).toBeNull();
  });

  it('returns null init/ready when only the #Date header is present', () => {
    const t = parseLabVIEWLaunchTiming('#Date: Fri, Jul 24, 2026 11:02:31 AM\n#AppName: LabVIEW');
    expect(t.processStartIso).toBe('2026-07-24T11:02:31.000');
    expect(t.initAtIso).toBeNull();
    expect(t.executionReadyIso).toBeNull();
    expect(t.initToReadyMs).toBeNull();
    expect(t.runMode).toBeNull();
  });

  it('is deterministic', () => {
    expect(parseLabVIEWLaunchTiming(HEADLESS_LABVIEW_LOG)).toEqual(
      parseLabVIEWLaunchTiming(HEADLESS_LABVIEW_LOG)
    );
  });

  it('converts 12 AM (midnight) and 12 PM (noon) correctly', () => {
    const midnight = parseLabVIEWLaunchTiming(
      '#Date: Fri, Jul 24, 2026 12:00:00 AM\n#AppName: LabVIEW'
    );
    expect(midnight.processStartIso).toBe('2026-07-24T00:00:00.000');
    const noon = parseLabVIEWLaunchTiming('#Date: Fri, Jul 24, 2026 12:00:00 PM\n#AppName: LabVIEW');
    expect(noon.processStartIso).toBe('2026-07-24T12:00:00.000');
  });

  it('treats an empty header value as absent (null)', () => {
    const t = parseLabVIEWLaunchTiming('#Date: Fri, Jul 24, 2026 11:02:31 AM\n#AppName:   \n#Version:');
    expect(t.appName).toBeNull();
    expect(t.version).toBeNull();
  });

  it('fails closed when the #Date month abbreviation is unrecognized', () => {
    expect(() => parseLabVIEWLaunchTiming('#Date: Fri, Xyz 24, 2026 11:02:31 AM\n#AppName: LabVIEW')).toThrow(
      /"#Date:" header/
    );
  });

  it('fails closed on empty, non-string, or non-LabVIEW-log input', () => {
    expect(() => parseLabVIEWLaunchTiming('')).toThrow(/non-empty log text/);
    expect(() => parseLabVIEWLaunchTiming('   ')).toThrow(/non-empty log text/);
    // @ts-expect-error non-string input
    expect(() => parseLabVIEWLaunchTiming(null)).toThrow(/non-empty log text/);
    expect(() => parseLabVIEWLaunchTiming('some random file\nwith no LabVIEW header')).toThrow(
      /"#Date:" header/
    );
  });

  it('rejects an out-of-range #Date (fails closed, not silently normalized)', () => {
    // day 99, hour 13 (invalid on a 12-hour clock), minute 70, second 80.
    expect(() =>
      parseLabVIEWLaunchTiming('#Date: Fri, Jul 99, 2026 13:70:80 PM\n#AppName: LabVIEW')
    ).toThrow(/"#Date:" header/);
  });

  it('drops an out-of-range init or execution-ready marker to null', () => {
    const log = [
      '#Date: Fri, Jul 24, 2026 11:02:31 AM',
      '#AppName: LabVIEW',
      // hour 13 is invalid on the 12-hour init marker; minute 70 invalid on exec.
      '[HeadlessManager][7/24/2026 13:02:31.179 AM] Initializing headless LabVIEW',
      'starting LabVIEW Execution System 2 Thread 0 at [1.0, (11:70:33.973000000 2026:07:24)]'
    ].join('\n');
    const t = parseLabVIEWLaunchTiming(log);
    expect(t.initAtIso).toBeNull();
    expect(t.executionReadyIso).toBeNull();
    expect(t.initToReadyMs).toBeNull();
  });

  it('reports #Date as second-precision (fractional part always .000)', () => {
    const t = parseLabVIEWLaunchTiming('#Date: Fri, Jul 24, 2026 11:02:31 AM\n#AppName: LabVIEW');
    expect(t.processStartIso.endsWith('.000')).toBe(true);
  });

  it('rejects an impossible calendar date (Feb 31) instead of normalizing it', () => {
    // Feb 31 passes the 1..31 day range but is not a real date; must fail closed
    // rather than emit 2026-02-31 / silently normalize the epoch.
    expect(() =>
      parseLabVIEWLaunchTiming('#Date: Sat, Feb 31, 2026 11:02:31 AM\n#AppName: LabVIEW')
    ).toThrow(/"#Date:" header/);
  });

  it('fails closed to null when execution-ready precedes init (negative duration)', () => {
    const log = [
      '#Date: Fri, Jul 24, 2026 11:02:31 AM',
      '#AppName: LabVIEW',
      '[HeadlessManager][7/24/2026 11:02:33.973 AM] Initializing headless LabVIEW',
      // execution-ready BEFORE init -> a negative delta must not be emitted.
      'starting LabVIEW Execution System 2 Thread 0 at [1.0, (11:02:31.179000000 2026:07:24)]'
    ].join('\n');
    const t = parseLabVIEWLaunchTiming(log);
    expect(t.initAtIso).toBe('2026-07-24T11:02:33.973');
    expect(t.executionReadyIso).toBe('2026-07-24T11:02:31.179');
    expect(t.initToReadyMs).toBeNull();
  });
});
