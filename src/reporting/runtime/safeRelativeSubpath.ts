/**
 * Pure relative-subpath safety predicate extracted verbatim from
 * comparisonReportRuntimeExecution. `isSafeRelativeSubpath` rejects absolute POSIX
 * paths, Windows drive-qualified paths, empty segments, and `.`/`..` traversal
 * segments so only contained, non-escaping relative subpaths are accepted. Isolated
 * from runtime-execution orchestration and imported back to preserve behavior.
 *
 * Supporting VHS-REQ-624.
 */
export function isSafeRelativeSubpath(candidate: string): boolean {
  if (!candidate || candidate.startsWith('/') || /^[A-Za-z]:/.test(candidate)) {
    return false;
  }
  return candidate
    .split('/')
    .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}
