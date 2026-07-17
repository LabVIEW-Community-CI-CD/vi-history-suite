// Runtime path helpers (supporting VHS-REQ-659). Extracted verbatim from
// comparisonReportRuntimeExecution to keep pure path containment / dirname /
// assets-directory derivation separate from runtime orchestration (per the
// reporting-orchestration guardrails). Behavior is unchanged.
import * as path from 'node:path';

// True when `candidate` is `directory` itself or nested inside it (POSIX-normalized
// containment check for Linux short-path staging).
export function isPathInsideDirectory(candidate: string, directory: string): boolean {
  // Use path.posix on Linux short-path staging where both inputs are POSIX strings.
  const normalizedDir = path.posix.normalize(directory).replace(/\/+$/u, '');
  const normalizedCandidate = path.posix.normalize(candidate);
  if (normalizedCandidate === normalizedDir) {
    return true;
  }
  return normalizedCandidate.startsWith(`${normalizedDir}/`);
}

// Dirname that prefers POSIX semantics for explicit POSIX (leading-slash) paths
// and otherwise defers to the platform `path.dirname`.
export function posixDirname(filePath: string): string {
  if (filePath.startsWith('/')) {
    return path.posix.dirname(filePath);
  }

  return path.dirname(filePath);
}

// Derive the sibling assets-directory path for a report file (e.g.
// `report.html` -> `report_files`).
export function buildReportAssetsDirectoryPath(reportFilePath: string): string {
  return reportFilePath.replace(/\.html$/i, '') + '_files';
}
