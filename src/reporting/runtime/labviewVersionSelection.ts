// LabVIEW version selection helpers (supporting VHS-REQ-659). Extracted verbatim
// from comparisonRuntimeLocator to keep pure requested-version normalization and
// candidate version matching separate from runtime locator orchestration (per the
// reporting-orchestration guardrails). Behavior is unchanged.
import type { RuntimeToolCandidate } from '../comparisonRuntimeLocator';

// Comparison reports require LabVIEW 2025 or newer; older years are gated out.
const MINIMUM_COMPARISON_REPORT_LABVIEW_YEAR = 2025;

// Normalize a raw requested LabVIEW version into a 4-digit year when one is
// present, otherwise the trimmed raw value (or `undefined` when blank).
export function normalizeRequestedLabviewVersion(rawVersion: string | undefined): string | undefined {
  const trimmed = rawVersion?.trim();
  if (!trimmed) {
    return undefined;
  }

  const yearMatch = trimmed.match(/\b(20\d{2})\b/u);
  return yearMatch?.[1] ?? trimmed;
}

// True when a requested version year is supported for comparison reports (>= the
// minimum year); non-numeric requests are treated as supported.
export function isSupportedComparisonReportLabviewVersion(requestedVersion: string): boolean {
  const requestedYear = Number.parseInt(requestedVersion, 10);
  if (!Number.isFinite(requestedYear)) {
    return true;
  }

  return requestedYear >= MINIMUM_COMPARISON_REPORT_LABVIEW_YEAR;
}

// True when a candidate matches the requested LabVIEW version (non-labview-exe
// candidates and absent requests always match).
export function matchesRequestedLabviewVersion(
  candidate: RuntimeToolCandidate,
  requestedVersion: string | undefined
): boolean {
  if (!requestedVersion || candidate.kind !== 'labview-exe') {
    return true;
  }

  return extractLabviewMajorVersion(candidate.path) === requestedVersion;
}

// Extract the 4-digit LabVIEW major-version year from a `.../LabVIEW <year>/...`
// executable path, or `undefined` when no version folder is recognized.
function extractLabviewMajorVersion(filePath: string): string | undefined {
  const normalized = filePath.replaceAll('\\', '/');
  const folderMatch = normalized.match(/\/LabVIEW(?:[- ])([^/]+)\/(?:LabVIEW\.exe|labview|labviewcommunity)$/iu);
  if (!folderMatch) {
    return undefined;
  }

  const yearMatch = folderMatch[1].match(/\b(20\d{2})\b/u);
  return yearMatch?.[1];
}
