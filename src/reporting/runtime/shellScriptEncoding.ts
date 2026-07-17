// Shell script encoding and quoting helpers (supporting VHS-REQ-659). Extracted
// verbatim from comparisonReportRuntimeExecution to keep pure PowerShell/bash
// encoding and literal-quoting logic separate from runtime orchestration (per
// the reporting-orchestration guardrails). Behavior is unchanged.

// Resolve the PowerShell host executable used to run interop scripts: the bare
// `powershell.exe` on Windows, the `/mnt/c/...` WSL path on Linux, `undefined`
// otherwise.
export function resolveWindowsPowerShellHostExecutable(
  processPlatform: NodeJS.Platform
): string | undefined {
  if (processPlatform === 'win32') {
    return 'powershell.exe';
  }

  if (processPlatform === 'linux') {
    return '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
  }

  return undefined;
}

// Encode a PowerShell script as base64 of its UTF-16LE bytes (for
// `powershell -EncodedCommand`).
export function encodeWindowsPowerShellScript(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

// Quote a value as a single-quoted PowerShell string literal (doubling embedded
// single quotes).
export function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// Quote a value as a single-quoted bash string literal (escaping embedded single
// quotes via the `'"'"'` idiom).
export function quoteBashLiteral(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

// Render a PowerShell array literal `@('a', 'b')` from string values (each quoted
// via quotePowerShellLiteral).
export function buildWindowsPowerShellArrayLiteral(values: string[]): string {
  return `@(${values.map((value) => quotePowerShellLiteral(value)).join(', ')})`;
}

// Render a bash array literal `('a' 'b')` from string values (each quoted via
// quoteBashLiteral).
export function buildBashArrayLiteral(values: string[]): string {
  return `(${values.map((value) => quoteBashLiteral(value)).join(' ')})`;
}
