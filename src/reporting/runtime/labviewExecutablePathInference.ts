// LabVIEW executable-path inference helpers (supporting VHS-REQ-621 / VHS-REQ-636
// / VHS-REQ-637). Extracted verbatim from comparisonReportRuntimeExecution to
// keep pure display-only path inference separate from runtime orchestration (per
// the reporting-orchestration guardrails). Behavior is unchanged.
import {
  MAXIMUM_HOST_LABVIEW_YEAR,
  MINIMUM_HOST_LABVIEW_YEAR
} from '../../tooling/labviewInstallCatalog';
import type { ObservedLabviewBitness } from '../comparisonReportRuntimeExecution';

/**
 * VHS-REQ-621: Infer LabVIEW.exe bitness from its filesystem path. The Windows
 * installer for LabVIEW always lands x86 under `Program Files (x86)\National
 * Instruments\...` and x64 under `Program Files\National Instruments\...`. This
 * pattern is the same canonical-path discipline used by the runtime locator's
 * documented scan paths, so reuse it instead of probing PE headers.
 */
export function inferLabviewBitnessFromExecutablePath(
  executablePath: string | undefined
): ObservedLabviewBitness | undefined {
  if (typeof executablePath !== 'string' || executablePath.trim().length === 0) {
    return undefined;
  }
  const normalized = executablePath.toLowerCase().replace(/\//g, '\\');
  if (normalized.includes('\\program files (x86)\\')) {
    return 'x86';
  }
  if (normalized.includes('\\program files\\')) {
    return 'x64';
  }
  return 'unknown';
}

/**
 * VHS-REQ-636: Best-effort LabVIEW major-version (year) inference from a running
 * `LabVIEW.exe` path, for diagnostic messages only. The Windows installer lays
 * each version under a `LabVIEW <year>` directory (for example
 * `C:\Program Files\National Instruments\LabVIEW 2026\LabVIEW.exe`), so a
 * canonical-path scan recovers the year without probing the binary. Returns the
 * 4-digit `20xx` year string, or `undefined` when no plausible year is present.
 * The result is display-only: callers must treat `undefined` as "year unknown"
 * and never block on it.
 */
export function inferLabviewYearFromExecutablePath(
  executablePath: string | undefined
): string | undefined {
  if (typeof executablePath !== 'string' || executablePath.trim().length === 0) {
    return undefined;
  }
  const match = executablePath.match(/labview[ _-]?(20\d{2})/i);
  return match ? match[1] : undefined;
}

/**
 * VHS-REQ-637: process observations only expose supported host LabVIEW years.
 * Older/newer parsed years remain useful for registry filtering and diagnostics,
 * but the open gate treats them as unknown.
 */
export function inferSupportedLabviewYearFromExecutablePath(
  executablePath: string | undefined
): string | undefined {
  const inferredYear = inferLabviewYearFromExecutablePath(executablePath);
  if (!inferredYear) {
    return undefined;
  }
  const year = Number(inferredYear);
  if (year < MINIMUM_HOST_LABVIEW_YEAR || year > MAXIMUM_HOST_LABVIEW_YEAR) {
    return undefined;
  }
  return inferredYear;
}
