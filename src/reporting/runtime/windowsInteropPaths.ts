// Windows interop path normalization helpers (supporting VHS-REQ-624).
// Extracted verbatim from comparisonReportRuntimeExecution to keep pure
// path-shape normalization separate from runtime orchestration (per the
// reporting-orchestration guardrails). Behavior is unchanged.

// Normalize a file path to Windows drive-letter form for interop (accepts a
// drive-letter path or a `/mnt/<drive>/...` WSL path); returns `undefined` for
// blank or unmappable input.
export function normalizeWindowsInteropPath(filePath: string): string | undefined {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
    return trimmed.replaceAll('/', '\\');
  }

  const match = trimmed.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (!match) {
    return undefined;
  }

  const [, driveLetter, tail] = match;
  const normalizedTail = tail
    .split('/')
    .filter((segment) => segment.length > 0)
    .join('\\');
  return normalizedTail.length > 0
    ? `${driveLetter.toUpperCase()}:\\${normalizedTail}`
    : `${driveLetter.toUpperCase()}:\\`;
}

// Normalize an executable path to `/mnt/<drive>/...` form for interop (passes
// `/mnt/...` paths through, maps drive-letter paths); returns `undefined` for
// blank or unmappable input.
export function normalizeWindowsInteropExecutable(filePath: string): string | undefined {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith('/mnt/')) {
    return trimmed;
  }

  const windowsPathMatch = trimmed.match(/^([A-Za-z]):[\\/](.*)$/);
  if (!windowsPathMatch) {
    return undefined;
  }

  const [, driveLetter, tail] = windowsPathMatch;
  const normalizedTail = tail.replaceAll('\\', '/');
  return `/mnt/${driveLetter.toLowerCase()}/${normalizedTail}`;
}

// Normalize a path into a lowercase backslash form suitable for case-insensitive
// equality comparison of Windows/interop paths.
export function normalizeComparablePath(filePath?: string): string | undefined {
  const trimmed = filePath?.trim();
  if (!trimmed) {
    return undefined;
  }

  const windowsPath = normalizeWindowsInteropPath(trimmed) ?? trimmed.replaceAll('/', '\\');
  return windowsPath.replaceAll('/', '\\').toLowerCase();
}
