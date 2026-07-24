// First-run perfmon capture plan (VHS-REQ-707).
//
// The "how to capture" half of the perfmon contract: a pure, deterministic
// builder that emits the Windows `logman` command plan a self-hosted runner (the
// Vagrant LabVIEW box) executes to record a first-run performance trace as a
// PDH-CSV — the exact input `parsePdhCsv` consumes. Extracting the plan turns the
// ad-hoc inline capture script into governed, testable, reproducible data.
//
// Process-counter caveat (learned from a real capture): `logman` resolves a
// `\Process(<name>)\...` counter instance when the collector STARTS, so a LabVIEW
// process counter only records samples when LabVIEW is already running at start.
// A cold first-run launch therefore captures the system counters only (which is
// the primary pressure signal); a warm cycle can opt in to the LabVIEW process
// counters by passing `labviewProcessName`. The series contract keeps the LabVIEW
// channels optional to match.
//
// Design (reporting-orchestration guardrails): pure and deterministic, returns a
// command plan as data; executing it (spawning `logman`) lives in the actor
// harness so this module stays unit-testable without a runtime.

export const PERFMON_CAPTURE_PLAN_SCHEMA = 'vi-history-suite/perfmon-capture-plan@v1';
export const PERFMON_CAPTURE_PLAN_SCHEMA_VERSION = 1;

/** The system resource counters captured on every actor (source-independent). */
export const PERFMON_SYSTEM_COUNTERS: readonly string[] = [
  String.raw`\Processor(_Total)\% Processor Time`,
  String.raw`\Memory\Available MBytes`,
  String.raw`\PhysicalDisk(_Total)\% Disk Time`
];

/** The LabVIEW process counters, resolved for an exact running process name. */
export function labviewProcessCounters(processName: string): string[] {
  const name = processName.trim();
  if (name.length === 0) {
    throw new Error('labviewProcessCounters requires a non-empty process name.');
  }
  return [String.raw`\Process(${name})\% Processor Time`, String.raw`\Process(${name})\Working Set`];
}

/**
 * VHS-REQ-715: the expanded ("full") system counter profile. A superset of
 * PERFMON_SYSTEM_COUNTERS adding the CPU user/privileged split, memory commit +
 * paging pressure, and disk throughput + queue depth. Every counter here was
 * verified available via `typeperf -q` on a real Windows host.
 */
export const PERFMON_FULL_PROFILE_SYSTEM_COUNTERS: readonly string[] = [
  String.raw`\Processor(_Total)\% Processor Time`,
  String.raw`\Processor(_Total)\% User Time`,
  String.raw`\Processor(_Total)\% Privileged Time`,
  String.raw`\Memory\Available MBytes`,
  String.raw`\Memory\Committed Bytes`,
  String.raw`\Memory\Pages/sec`,
  String.raw`\Memory\Page Faults/sec`,
  String.raw`\PhysicalDisk(_Total)\% Disk Time`,
  String.raw`\PhysicalDisk(_Total)\Disk Read Bytes/sec`,
  String.raw`\PhysicalDisk(_Total)\Disk Write Bytes/sec`,
  String.raw`\PhysicalDisk(_Total)\Avg. Disk Queue Length`
];

/**
 * VHS-REQ-715: the expanded ("full") LabVIEW process counter profile. A superset
 * of labviewProcessCounters adding the CPU user/privileged split, the full memory
 * footprint (private/virtual/working-set-private), paging, IO throughput, and
 * handle/thread growth — the signals most useful for correlating a VI change with
 * its per-process performance impact.
 */
export function labviewProcessFullProfileCounters(processName: string): string[] {
  const name = processName.trim();
  if (name.length === 0) {
    throw new Error('labviewProcessFullProfileCounters requires a non-empty process name.');
  }
  return [
    String.raw`\Process(${name})\% Processor Time`,
    String.raw`\Process(${name})\% User Time`,
    String.raw`\Process(${name})\% Privileged Time`,
    String.raw`\Process(${name})\Working Set`,
    String.raw`\Process(${name})\Working Set - Private`,
    String.raw`\Process(${name})\Private Bytes`,
    String.raw`\Process(${name})\Virtual Bytes`,
    String.raw`\Process(${name})\Page Faults/sec`,
    String.raw`\Process(${name})\IO Read Bytes/sec`,
    String.raw`\Process(${name})\IO Write Bytes/sec`,
    String.raw`\Process(${name})\Handle Count`,
    String.raw`\Process(${name})\Thread Count`
  ];
}

export interface PerfmonCaptureRequest {
  /** logman data-collector name (no whitespace). */
  readonly collectorName: string;
  /** Path logman writes the PDH-CSV to (logman appends a numeric suffix). */
  readonly outputCsvPath: string;
  /** Sample interval in whole seconds (1..86399). */
  readonly sampleIntervalSec: number;
  /** When set, adds the LabVIEW process counters for that exact running process. */
  readonly labviewProcessName?: string;
  /**
   * VHS-REQ-715 counter profile: `minimal` (default — the 3 system counters, plus
   * the 2 LabVIEW process counters when a process name is given) or `full` (the
   * expanded system + per-process metadata profiles).
   */
  readonly profile?: 'minimal' | 'full';
  /**
   * VHS-REQ-715: additional exact PDH counter paths to capture verbatim, appended
   * after the profile counters (deduped, order preserved). Lets a caller record
   * any counter the host exposes beyond the curated profiles.
   */
  readonly extraCounters?: readonly string[];
}

export interface PerfmonCaptureCommand {
  readonly description: string;
  readonly command: string;
  readonly args: readonly string[];
}

export interface PerfmonCapturePlan {
  readonly schema: typeof PERFMON_CAPTURE_PLAN_SCHEMA;
  readonly schemaVersion: typeof PERFMON_CAPTURE_PLAN_SCHEMA_VERSION;
  readonly platform: 'windows';
  readonly collectorName: string;
  readonly counters: readonly string[];
  readonly sampleIntervalSec: number;
  readonly outputCsvPath: string;
  /** Ordered lifecycle: create the collector, start it, run the comparison, stop, then delete. */
  readonly create: PerfmonCaptureCommand;
  readonly start: PerfmonCaptureCommand;
  readonly stop: PerfmonCaptureCommand;
  readonly delete: PerfmonCaptureCommand;
}

/** Format whole seconds as logman's `-si` `[[hh:]mm:]ss` interval string. */
export function formatLogmanInterval(sampleIntervalSec: number): string {
  if (!Number.isInteger(sampleIntervalSec) || sampleIntervalSec < 1 || sampleIntervalSec > 86_399) {
    throw new Error('sampleIntervalSec must be a whole number of seconds between 1 and 86399.');
  }
  const hh = Math.floor(sampleIntervalSec / 3600);
  const mm = Math.floor((sampleIntervalSec % 3600) / 60);
  const ss = sampleIntervalSec % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

/**
 * Build the Windows `logman` capture plan. Fail-closed on an empty collector name
 * or output path and on an out-of-range interval. Pure and deterministic:
 * identical request in, identical plan out.
 */
export function buildWindowsPerfmonCapturePlan(request: PerfmonCaptureRequest): PerfmonCapturePlan {
  const collectorName = (request.collectorName ?? '').trim();
  if (collectorName.length === 0 || /\s/u.test(collectorName)) {
    throw new Error('collectorName must be a non-empty name without whitespace.');
  }
  const outputCsvPath = (request.outputCsvPath ?? '').trim();
  if (outputCsvPath.length === 0) {
    throw new Error('outputCsvPath must be a non-empty path.');
  }
  const interval = formatLogmanInterval(request.sampleIntervalSec);

  const profile = request.profile ?? 'minimal';
  if (profile !== 'minimal' && profile !== 'full') {
    throw new Error(`profile must be 'minimal' or 'full' (received ${JSON.stringify(request.profile)}).`);
  }
  const systemCounters =
    profile === 'full' ? PERFMON_FULL_PROFILE_SYSTEM_COUNTERS : PERFMON_SYSTEM_COUNTERS;
  const counters = [...systemCounters];
  if (request.labviewProcessName !== undefined) {
    counters.push(
      ...(profile === 'full'
        ? labviewProcessFullProfileCounters(request.labviewProcessName)
        : labviewProcessCounters(request.labviewProcessName))
    );
  }
  if (request.extraCounters !== undefined) {
    if (!Array.isArray(request.extraCounters)) {
      throw new Error('extraCounters must be an array of counter-path strings.');
    }
    for (const raw of request.extraCounters) {
      const counter = typeof raw === 'string' ? raw.trim() : '';
      if (counter.length === 0) {
        throw new Error('extraCounters entries must be non-empty counter-path strings.');
      }
      counters.push(counter);
    }
  }
  // Dedupe preserving first-seen order: a counter can appear in both a profile and
  // extraCounters, and logman rejects a duplicate `-c` on some hosts.
  const seenCounters = new Set<string>();
  const dedupedCounters = counters.filter((counter) =>
    seenCounters.has(counter) ? false : (seenCounters.add(counter), true)
  );

  const createArgs: string[] = ['create', 'counter', collectorName, '-f', 'csv', '-o', outputCsvPath, '-si', interval];
  for (const counter of dedupedCounters) {
    createArgs.push('-c', counter);
  }
  createArgs.push('-ow'); // overwrite an existing collector definition.

  return {
    schema: PERFMON_CAPTURE_PLAN_SCHEMA,
    schemaVersion: PERFMON_CAPTURE_PLAN_SCHEMA_VERSION,
    platform: 'windows',
    collectorName,
    counters: dedupedCounters,
    sampleIntervalSec: request.sampleIntervalSec,
    outputCsvPath,
    create: { description: 'Create the PDH-CSV counter collector', command: 'logman', args: createArgs },
    start: { description: 'Start sampling (do this before the first-run comparison)', command: 'logman', args: ['start', collectorName] },
    stop: { description: 'Stop sampling (do this after the comparison completes)', command: 'logman', args: ['stop', collectorName] },
    delete: { description: 'Remove the collector definition', command: 'logman', args: ['delete', collectorName] }
  };
}

/**
 * Render a deterministic, human-readable description of a capture plan (the
 * ordered commands and the counter set) for a runbook, a log, or a pull request.
 */
export function describePerfmonCapturePlan(plan: PerfmonCapturePlan): string {
  const lines = [
    `Perfmon capture plan ${plan.schema} (${plan.platform})`,
    `- collector: ${plan.collectorName}`,
    `- interval: ${plan.sampleIntervalSec}s -> ${plan.outputCsvPath}`,
    `- counters (${plan.counters.length}):`,
    ...plan.counters.map((counter) => `  - ${counter}`),
    '- commands:'
  ];
  for (const step of [plan.create, plan.start, plan.stop, plan.delete]) {
    lines.push(`  - ${step.command} ${step.args.join(' ')}`);
  }
  return lines.join('\n');
}
