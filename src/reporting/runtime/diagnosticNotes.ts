// Diagnostic note assembly and command-arg helpers (supporting VHS-REQ-659).
// Extracted verbatim from comparisonReportRuntimeExecution to keep pure note
// merging / observation formatting / arg parsing separate from runtime
// orchestration (per the reporting-orchestration guardrails). Behavior is
// unchanged.
import type { RuntimeProcessObservation } from '../comparisonReportRuntimeExecution';

// True when the CLI stdout consists solely of the "started logging in file:"
// banner (i.e. no other diagnostic content was emitted).
export function isLabviewCliLogOnlyStdout(stdout: string): boolean {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return (
    lines.length === 1 &&
    /^LabVIEWCLI started logging in file:\s*\S+/i.test(lines[0])
  );
}

// Merge multiple note groups into one array, preserving order and dropping
// duplicates.
export function mergeDiagnosticNotes(...noteGroups: Array<string[] | undefined>): string[] {
  const merged: string[] = [];
  for (const noteGroup of noteGroups) {
    for (const note of noteGroup ?? []) {
      if (!merged.includes(note)) {
        merged.push(note);
      }
    }
  }

  return merged;
}

// Format retained banner/exit process-observation snapshots into human-readable
// diagnostic notes.
export function buildProcessObservationNotes(
  observations:
    | {
        bannerSnapshot?: RuntimeProcessObservation;
        exitSnapshot?: RuntimeProcessObservation;
      }
    | undefined
): string[] {
  const notes: string[] = [];
  for (const observation of [observations?.bannerSnapshot, observations?.exitSnapshot]) {
    if (!observation) {
      continue;
    }

    const observedProcessNames =
      observation.observedProcessNames.length > 0
        ? observation.observedProcessNames.join(', ')
        : 'none';

    notes.push(
      `At the retained ${observation.trigger} snapshot (${observation.capturedAt}), observed LabVIEW-related processes: ${observedProcessNames}.`
    );

    if (observation.labviewCliProcessObserved && !observation.labviewProcessObserved) {
      notes.push(
        `At the retained ${observation.trigger} snapshot, LabVIEWCLI.exe was observed while LabVIEW.exe was not observed.`
      );
    }

    if (!observation.lvcompareProcessObserved) {
      notes.push(
        `At the retained ${observation.trigger} snapshot, LVCompare.exe was not observed.`
      );
    }
  }

  return notes;
}

// Return the value following `optionName` in an argv array, or `undefined` when
// the option is absent or has no non-empty value.
export function extractCommandOptionValue(args: string[], optionName: string): string | undefined {
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === optionName) {
      const value = args[index + 1]?.trim();
      return value ? value : undefined;
    }
  }

  return undefined;
}
