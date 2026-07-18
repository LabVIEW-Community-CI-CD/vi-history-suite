// Windows `tasklist` CSV parsing and runtime-process name matching helpers
// (supporting VHS-REQ-659). Extracted verbatim from comparisonReportRuntimeExecution
// to keep pure parsing/normalization logic separate from runtime orchestration
// (per the reporting-orchestration guardrails). Behavior is unchanged.
import type { RuntimeObservedProcess } from '../comparisonReportRuntimeExecution';

// Parse one line of Windows `tasklist /fo csv` output into an observed-process
// record, or `undefined` when the line lacks a usable image name / PID.
export function parseWindowsTasklistCsvLine(line: string): RuntimeObservedProcess | undefined {
  const columns = parseCsvColumns(line);
  if (columns.length < 2) {
    return undefined;
  }

  const imageName = columns[0]?.trim();
  const pid = Number.parseInt(columns[1] ?? '', 10);
  if (!imageName || !Number.isFinite(pid)) {
    return undefined;
  }

  const sessionNumber = Number.parseInt((columns[3] ?? '').replaceAll(',', ''), 10);

  return {
    imageName,
    pid,
    sessionName: columns[2]?.trim() || undefined,
    sessionNumber: Number.isFinite(sessionNumber) ? sessionNumber : undefined,
    memUsage: columns[4]?.trim() || undefined
  };
}

// Parse an entire Windows `tasklist /fo csv /nh` stdout capture into observed-
// process records, dropping blank lines and rows the per-line parser rejects.
export function parseWindowsTasklistCsv(stdout: string): RuntimeObservedProcess[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseWindowsTasklistCsvLine)
    .filter((entry): entry is RuntimeObservedProcess => Boolean(entry));
}

function parseCsvColumns(line: string): string[] {
  const columns: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === ',' && !inQuotes) {
      columns.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  columns.push(current);
  return columns;
}

// True when `imageName` is one of the runtime process images observed during a
// comparison run (LabVIEW.exe, LabVIEWCLI.exe, LVCompare.exe).
export function isObservedRuntimeProcessName(imageName: string): boolean {
  return (
    isExactObservedRuntimeProcessName(imageName, 'LabVIEW.exe') ||
    isExactObservedRuntimeProcessName(imageName, 'LabVIEWCLI.exe') ||
    isExactObservedRuntimeProcessName(imageName, 'LVCompare.exe')
  );
}

// True when `imageName` matches `expected` case-insensitively after trimming.
export function isExactObservedRuntimeProcessName(imageName: string, expected: string): boolean {
  return imageName.trim().toLowerCase() === expected.toLowerCase();
}
