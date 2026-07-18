// Comparison process-error normalization helpers (supporting VHS-REQ-659).
// Extracted verbatim from comparisonReportRuntimeExecution to keep pure
// error-shape normalization separate from runtime orchestration (per the
// reporting-orchestration guardrails). Behavior is unchanged.

// Extract a string error code (e.g. an errno like 'ENOENT') from an unknown
// caught value, or `undefined` when none is present.
export function extractErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object') {
    const code = (error as NodeJS.ErrnoException).code;
    if (typeof code === 'string') {
      return code;
    }
  }
  return undefined;
}

// Normalize an unknown caught process error into a stable { stdout, stderr,
// signal } shape, defaulting stderr to the error message when no stderr is
// present.
export function normalizeComparisonProcessError(error: unknown): {
  stdout: string;
  stderr: string;
  signal?: string;
} {
  if (error && typeof error === 'object') {
    const maybeError = error as {
      stdout?: string;
      stderr?: string;
      signal?: string;
      message?: string;
    };

    return {
      stdout: String(maybeError.stdout ?? ''),
      stderr: String(maybeError.stderr ?? maybeError.message ?? ''),
      signal: maybeError.signal ?? undefined
    };
  }

  return {
    stdout: '',
    stderr: String(error ?? '')
  };
}
