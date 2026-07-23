// First-run perfmon capture orchestration script (VHS-REQ-707).
//
// Renders the hardened Windows PowerShell script that EXECUTES a capture plan on
// an actor. The target is a Windows container (or the Vagrant box) that is only
// expected to have native Windows PowerShell 5.1 — no Node.js, no PowerShell Core
// (`pwsh`), and no bash — so this script uses only built-in cmdlets, .NET types,
// and `logman.exe`.
//
// Hardening (a prior fragile capture wrote a 0-byte log and no window record
// because a blanket `$ErrorActionPreference = 'Stop'` aborted at a Node call
// before cleanup ran):
//   - Every native invocation runs under `'Continue'` inside try/catch/finally so
//     a nonzero exit, stderr text, or a missing executable never aborts the run;
//     the exit code is read back explicitly (not from the output stream).
//   - The collector is always stopped and deleted, and the window record is always
//     written, from a `finally` block — even when the comparison fails.
//   - The window record is written with `[System.IO.File]::WriteAllText` (UTF-8,
//     no BOM) so a downstream `JSON.parse` never chokes on a byte-order mark.
//   - The actual PDH-CSV path (logman appends a numeric suffix) is resolved and
//     recorded so the host renderer never guesses the filename.
//
// Design (reporting-orchestration guardrails): pure and deterministic — returns
// script text only; encoding/spawning it lives in the actor harness.

import { buildWindowsPowerShellArrayLiteral, quotePowerShellLiteral } from '../runtime/shellScriptEncoding';
import { PERFMON_CAPTURE_PLAN_SCHEMA, type PerfmonCapturePlan } from './perfmonCapturePlan';

export interface PerfmonCaptureScriptInput {
  /** The plan whose logman argument vectors this script executes. */
  readonly plan: PerfmonCapturePlan;
  /** The comparison executable to run inside the capture window (e.g. LabVIEWCLI.exe). */
  readonly comparisonExecutable: string;
  /** Arguments passed to the comparison executable. */
  readonly comparisonArgs: readonly string[];
  /** Absolute path the window record JSON is written to (UTF-8, no BOM). */
  readonly windowJsonPath: string;
  /** Optional warm-up seconds after starting the collector before the comparison. */
  readonly settleSeconds?: number;
}

/**
 * Render the hardened native-PowerShell capture script. Fail-closed on a bad
 * plan, an empty comparison executable or window path, or a negative settle.
 * Pure and deterministic: identical input in, identical script out.
 */
export function renderWindowsPerfmonCaptureScript(input: PerfmonCaptureScriptInput): string {
  if (!input.plan || input.plan.schema !== PERFMON_CAPTURE_PLAN_SCHEMA) {
    throw new Error('renderWindowsPerfmonCaptureScript requires a perfmon-capture-plan@v1 plan.');
  }
  const executable = (input.comparisonExecutable ?? '').trim();
  if (executable.length === 0) {
    throw new Error('comparisonExecutable must be a non-empty path.');
  }
  const windowJsonPath = (input.windowJsonPath ?? '').trim();
  if (windowJsonPath.length === 0) {
    throw new Error('windowJsonPath must be a non-empty path.');
  }
  const settleSeconds = input.settleSeconds ?? 0;
  if (!Number.isInteger(settleSeconds) || settleSeconds < 0) {
    throw new Error('settleSeconds must be a whole number of seconds >= 0.');
  }

  const plan = input.plan;
  const lines: string[] = [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    `$collector = ${quotePowerShellLiteral(plan.collectorName)}`,
    `$csvOut = ${quotePowerShellLiteral(plan.outputCsvPath)}`,
    `$windowPath = ${quotePowerShellLiteral(windowJsonPath)}`,
    `$executable = ${quotePowerShellLiteral(executable)}`,
    `$compareArgs = ${buildWindowsPowerShellArrayLiteral([...input.comparisonArgs])}`,
    `$createArgs = ${buildWindowsPowerShellArrayLiteral([...plan.create.args])}`,
    `$startArgs = ${buildWindowsPowerShellArrayLiteral([...plan.start.args])}`,
    `$stopArgs = ${buildWindowsPowerShellArrayLiteral([...plan.stop.args])}`,
    `$deleteArgs = ${buildWindowsPowerShellArrayLiteral([...plan.delete.args])}`,
    '',
    '# Native Windows PowerShell 5.1 only; no external runtimes are available here.',
    '$script:LastNativeExit = 0',
    'function Invoke-Native([string]$file, [string[]]$fileArgs) {',
    '  $prev = $ErrorActionPreference',
    "  $ErrorActionPreference = 'Continue'",
    '  try {',
    '    & $file @fileArgs 2>&1 | ForEach-Object { if (-not [string]::IsNullOrWhiteSpace([string]$_)) { Write-Output $_ } }',
    '    $script:LastNativeExit = $LASTEXITCODE',
    '  } catch {',
    "    Write-Output ('native invocation failed: ' + $_.Exception.Message)",
    '    $script:LastNativeExit = 127',
    '  } finally {',
    '    $ErrorActionPreference = $prev',
    '  }',
    '}',
    '',
    '# Remove any stale collector from a prior run; never abort if it is absent.',
    "Invoke-Native 'logman' $deleteArgs",
    '',
    '$startMs = 0',
    '$endMs = 0',
    '$exitCode = 1',
    '$csvPath = ""',
    '$captureReady = $false',
    'try {',
    "  Invoke-Native 'logman' $createArgs",
    '  if ($script:LastNativeExit -eq 0) {',
    "    Invoke-Native 'logman' $startArgs",
    '    if ($script:LastNativeExit -eq 0) { $captureReady = $true }',
    '  }',
    '  if ($captureReady) {'
  ];
  if (settleSeconds > 0) {
    lines.push(`    Start-Sleep -Seconds ${settleSeconds}`);
  }
  lines.push(
    '    $startMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()',
    '    Invoke-Native $executable $compareArgs',
    '    $exitCode = $script:LastNativeExit',
    '    $endMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()',
    '  }',
    '} finally {',
    '  # Always stop and remove the collector and always write the window record.',
    "  Invoke-Native 'logman' $stopArgs",
    "  Invoke-Native 'logman' $deleteArgs",
    '  if ($startMs -eq 0) { $startMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }',
    '  if ($endMs -eq 0) { $endMs = $startMs }',
    '  $dir = Split-Path -Parent $csvOut',
    '  $base = [System.IO.Path]::GetFileNameWithoutExtension($csvOut)',
    "  $match = Get-ChildItem -LiteralPath $dir -Filter ($base + '*.csv') -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1",
    '  if ($match) { $csvPath = $match.FullName }',
    "  if ($exitCode -eq 0) { $outcome = 'compared' } else { $outcome = 'failed' }",
    '  $cycle = [ordered]@{ cycleIndex = 1; durationMs = ($endMs - $startMs); outcome = $outcome }',
    '  $window = [ordered]@{',
    '    startMs = $startMs',
    '    endMs = $endMs',
    '    exitCode = $exitCode',
    '    captureReady = $captureReady',
    '    csvPath = $csvPath',
    '    cycles = @($cycle)',
    '  }',
    '  $json = $window | ConvertTo-Json -Depth 5',
    '  [System.IO.File]::WriteAllText($windowPath, $json)',
    '}',
    'exit $exitCode'
  );
  return lines.join('\n');
}
