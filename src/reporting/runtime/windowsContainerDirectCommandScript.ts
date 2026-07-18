import {
  quotePowerShellLiteral,
  buildWindowsPowerShellArrayLiteral
} from './shellScriptEncoding';

/**
 * Pure Windows-container direct-command PowerShell script builder extracted verbatim
 * from comparisonReportRuntimeExecution. `buildWindowsContainerDirectCommandScript`
 * emits the PowerShell that runs an executable with its arguments inside a Windows
 * container, capturing merged stdout/stderr, filtering blank lines, and propagating the
 * child exit code. Isolated from runtime-execution orchestration and imported back to
 * preserve behavior.
 *
 * Supporting VHS-REQ-659.
 */
export function buildWindowsContainerDirectCommandScript(executable: string, args: string[]): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    `$executable = ${quotePowerShellLiteral(executable)}`,
    `$args = ${buildWindowsPowerShellArrayLiteral(args)}`,
    "$previousErrorActionPreference = $ErrorActionPreference",
    "$ErrorActionPreference = 'Continue'",
    'try {',
    '  $output = @(& $executable @args 2>&1)',
    '} finally {',
    '  $ErrorActionPreference = $previousErrorActionPreference',
    '}',
    '$output | ForEach-Object { if (-not [string]::IsNullOrWhiteSpace([string]$_)) { Write-Output $_ } }',
    'exit $LASTEXITCODE'
  ].join('\n');
}
