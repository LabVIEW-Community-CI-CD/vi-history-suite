// Deterministic LabVIEW launch-timing parser (VHS-REQ-707, epic #2344 Phase 1b).
//
// Empirically, a cold comparison-preview run's per-state DURATIONS are dominated
// by LabVIEW launch dead time (~97s of a ~161s cold preview), not the VI work.
// To separate launch dead time from active work, this pure parser reads the
// deterministic per-launch LabVIEW / LabVIEWCLI application log that is written
// on every instantiation (host-native / mirror-mode only — a container's LabVIEW
// runs inside the container and is not host-observable).
//
// Each launch writes `%TEMP%\LabVIEW[CLI]_<bits>_<ver>_<mode>_<user>_cur.txt`
// with deterministic markers (the `#Date:` header is SECOND-precision; the
// init and execution-ready markers below are MILLISECOND-precision):
//   #Date: Fri, Jul 24, 2026 11:02:31 AM        (process start + identity headers)
//   #AppName: LabVIEW    #Version: 26.1.2f2 64-bit    #AppRunMode: Headless
//   [HeadlessManager][7/24/2026 11:02:31.179 AM] Initializing headless LabVIEW
//   starting LabVIEW Execution System 2 Thread 0 ... at [<mono>, (11:02:33.973165036 2026:07:24)]
// The last line marks LabVIEW execution-ready — the true "LabVIEW open" moment.
//
// Design (reporting-orchestration guardrails): pure and deterministic, no I/O.
// Fail-closed at the input boundary (non-string / empty / not a LabVIEW log);
// explicit null (never fabricated) for a marker a failed launch never wrote.
// Emitted timestamps are LOCAL wall-clock strings (no trailing Z) because the
// log records local time; the derived `initToReadyMs` is computed from a shared
// component-epoch so the delta is correct regardless of the host time zone.

export const LABVIEW_LAUNCH_TIMING_SCHEMA = 'vi-history-suite/labview-launch-timing@v1';
export const LABVIEW_LAUNCH_TIMING_SCHEMA_VERSION = 1;

export interface LabVIEWLaunchTiming {
  readonly schema: typeof LABVIEW_LAUNCH_TIMING_SCHEMA;
  readonly schemaVersion: typeof LABVIEW_LAUNCH_TIMING_SCHEMA_VERSION;
  /** `#AppName` header (e.g. `LabVIEW`, `LabVIEWCLI`), or null when absent. */
  readonly appName: string | null;
  /** `#Version` header (e.g. `26.1.2f2 64-bit`), or null when absent. */
  readonly version: string | null;
  /** `#AppRunMode` header (e.g. `Headless`, `Interactive`), or null when absent. */
  readonly runMode: string | null;
  /** Process start from the `#Date:` header, as a local ISO string (no Z). The
   * `#Date:` header is second-precision, so the fractional part is always `.000`. */
  readonly processStartIso: string;
  /** `Initializing headless LabVIEW` marker time (local ISO, no Z), or null. */
  readonly initAtIso: string | null;
  /** Execution-ready marker time (local ISO, no Z), or null. */
  readonly executionReadyIso: string | null;
  /** executionReady − initAt in milliseconds (the in-process launch spin-up), or
   * null when either marker is absent. */
  readonly initToReadyMs: number | null;
}

interface Components {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly ms: number;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

/** Build a local-wall ISO-8601 string (no zone) from parsed components. */
function toLocalIso(c: Components): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  return `${p(c.year, 4)}-${p(c.month)}-${p(c.day)}T${p(c.hour)}:${p(c.minute)}:${p(c.second)}.${p(c.ms, 3)}`;
}

/** Component epoch (via Date.UTC) — only ever used for DELTAS, so the fixed UTC
 * interpretation cancels the host time zone and never leaks into output. */
function toComponentEpochMs(c: Components): number {
  return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second, c.ms);
}

/** Integer range guard (inclusive) so a syntactically-matching but out-of-range
 * component (e.g. day 99, hour 70) is rejected rather than silently normalized
 * by `Date.UTC` into an impossible timestamp or a misleading duration. */
function inRange(n: number, lo: number, hi: number): boolean {
  return Number.isInteger(n) && n >= lo && n <= hi;
}

/** Convert a 12-hour clock (with AM/PM) to 24-hour. */
function to24Hour(hour12: number, meridiem: string): number {
  const m = meridiem.toUpperCase();
  if (m === 'AM') {
    return hour12 === 12 ? 0 : hour12;
  }
  return hour12 === 12 ? 12 : hour12 + 12;
}

/** Parse the `#Date: Fri, Jul 24, 2026 11:02:31 AM` header. */
function parseHeaderDate(text: string): Components | null {
  const m = text.match(
    /^#Date:\s*[A-Za-z]{3},\s*([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/mu
  );
  if (!m) {
    return null;
  }
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) {
    return null;
  }
  const day = Number(m[2]);
  const hour12 = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  // Reject out-of-range calendar/clock fields (fail closed): a 12-hour clock hour
  // is 1..12, and a corrupted `#Date` (e.g. `Jul 99 ... 13:70:80`) must not pass.
  if (!inRange(day, 1, 31) || !inRange(hour12, 1, 12) || !inRange(minute, 0, 59) || !inRange(second, 0, 59)) {
    return null;
  }
  return {
    year: Number(m[3]),
    month,
    day,
    hour: to24Hour(hour12, m[7]),
    minute,
    second,
    ms: 0
  };
}

/** Parse a `[HeadlessManager][7/24/2026 11:02:31.179 AM] Initializing headless LabVIEW` line. */
function parseInitMarker(text: string): Components | null {
  const m = text.match(
    /\[(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\.(\d{1,3})\s*(AM|PM)\]\s*Initializing headless LabVIEW/u
  );
  if (!m) {
    return null;
  }
  const month = Number(m[1]);
  const day = Number(m[2]);
  const hour12 = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const ms = Number(m[7].padEnd(3, '0'));
  if (
    !inRange(month, 1, 12) || !inRange(day, 1, 31) || !inRange(hour12, 1, 12) ||
    !inRange(minute, 0, 59) || !inRange(second, 0, 59) || !inRange(ms, 0, 999)
  ) {
    return null;
  }
  return {
    year: Number(m[3]),
    month,
    day,
    hour: to24Hour(hour12, m[8]),
    minute,
    second,
    ms
  };
}

/** Parse the `starting LabVIEW Execution System ... (11:02:33.973165036 2026:07:24)` marker. */
function parseExecutionReadyMarker(text: string): Components | null {
  const m = text.match(
    /starting LabVIEW Execution System[^\r\n]*\((\d{1,2}):(\d{2}):(\d{2})\.(\d+)\s+(\d{4}):(\d{2}):(\d{2})\)/u
  );
  if (!m) {
    return null;
  }
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = Number(m[3]);
  // Fractional seconds are nanoseconds in the exec-system marker; truncate to ms.
  const ms = Number(m[4].slice(0, 3).padEnd(3, '0'));
  const month = Number(m[6]);
  const day = Number(m[7]);
  // The exec-system marker uses a 24-hour clock.
  if (
    !inRange(month, 1, 12) || !inRange(day, 1, 31) || !inRange(hour, 0, 23) ||
    !inRange(minute, 0, 59) || !inRange(second, 0, 59) || !inRange(ms, 0, 999)
  ) {
    return null;
  }
  return {
    year: Number(m[5]),
    month,
    day,
    hour,
    minute,
    second,
    ms
  };
}

/** Read a single `#Header:` value line, trimmed, or null when absent. */
function readHeaderValue(text: string, header: string): string | null {
  // Horizontal whitespace only (`[ \t]`, not `\s`) so an EMPTY value does not
  // greedily consume the newline and capture the following header line.
  const m = text.match(new RegExp(`^#${header}:[ \\t]*(.*)$`, 'mu'));
  if (!m) {
    return null;
  }
  const value = m[1].trim();
  return value.length > 0 ? value : null;
}

/**
 * Parse a LabVIEW / LabVIEWCLI per-launch application log into a deterministic
 * launch-timing model. Fails closed on a non-string / empty document and on a
 * document that is not a LabVIEW log (missing the `#Date:` header). Absent
 * launch markers surface as explicit null (never fabricated) so a failed launch
 * that never reached execution-ready is represented faithfully.
 */
export function parseLabVIEWLaunchTiming(logText: string): LabVIEWLaunchTiming {
  if (typeof logText !== 'string' || logText.trim().length === 0) {
    throw new Error('parseLabVIEWLaunchTiming requires non-empty log text.');
  }
  const processStart = parseHeaderDate(logText);
  if (!processStart) {
    throw new Error('parseLabVIEWLaunchTiming requires a LabVIEW log with a "#Date:" header.');
  }
  const initAt = parseInitMarker(logText);
  const executionReady = parseExecutionReadyMarker(logText);
  const initToReadyMs =
    initAt && executionReady ? toComponentEpochMs(executionReady) - toComponentEpochMs(initAt) : null;

  return {
    schema: LABVIEW_LAUNCH_TIMING_SCHEMA,
    schemaVersion: LABVIEW_LAUNCH_TIMING_SCHEMA_VERSION,
    appName: readHeaderValue(logText, 'AppName'),
    version: readHeaderValue(logText, 'Version'),
    runMode: readHeaderValue(logText, 'AppRunMode'),
    processStartIso: toLocalIso(processStart),
    initAtIso: initAt ? toLocalIso(initAt) : null,
    executionReadyIso: executionReady ? toLocalIso(executionReady) : null,
    initToReadyMs
  };
}
