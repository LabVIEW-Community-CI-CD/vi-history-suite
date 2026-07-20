import type { ComparisonReportPacketRecord } from '../comparisonReportPacket';
import type { ComparisonCommandPlan } from '../comparisonReportPlan';
import {
  resolveWindowsPowerShellHostExecutable,
  encodeWindowsPowerShellScript,
  quotePowerShellLiteral,
  buildWindowsPowerShellArrayLiteral
} from './shellScriptEncoding';
import {
  LABVIEW_CLI_INI_OPEN_APP_KEY,
  LABVIEW_CLI_INI_AFTER_LAUNCH_KEY
} from './labviewCliIni';
import { WINDOWS_CONTAINER_TEMP_ROOT } from './containerLaunchConstants';

/**
 * Windows headless LabVIEWCLI launch-script builders extracted verbatim from
 * comparisonReportRuntimeExecution. Groups the shared headless launch-script core
 * (`buildHeadlessLabviewCliLaunchScript`) with its two provider wrappers — the
 * windows-container script (`buildWindowsContainerLabviewCliScript`, VHS-REQ-148)
 * and the win32 host-native headless opt-in command plan
 * (`buildWindowsHostNativeHeadlessCommandPlan`, VHS-REQ-665) — plus the
 * builder-only timeout/retry constants they parameterize the core with. Re-exported
 * by the parent to preserve the public API.
 */

const WINDOWS_CONTAINER_OPEN_APP_TIMEOUT_SECONDS = 180;
const WINDOWS_CONTAINER_AFTER_LAUNCH_TIMEOUT_SECONDS = 180;
const WINDOWS_CONTAINER_PRELAUNCH_WAIT_SECONDS = 8;
const WINDOWS_CONTAINER_STARTUP_RETRY_COUNT = 1;
const WINDOWS_CONTAINER_RETRY_DELAY_SECONDS = 8;

// VHS-REQ-665: win32 host-native headless (opt-in, LabVIEW 2026 x86 parity lane).
// Mirrors the windows-container headless launch technique (prelaunch LabVIEW
// `--headless`, tune the LabVIEWCLI.ini connect window, run the CLI, retry once
// on the cold-launch VI Server connect race -350000/-350051) but runs against a
// locally installed LabVIEW.exe instead of inside a container. This is the only
// path that exercises 32-bit LabVIEW 2026, which the x64-only windows-container
// authoritative provider cannot cover. Opt-in via `LV_RTE_WIN_HOSTNATIVE_HEADLESS=1`.
const WINDOWS_HOST_NATIVE_HEADLESS_OPEN_APP_TIMEOUT_SECONDS = 120;
const WINDOWS_HOST_NATIVE_HEADLESS_AFTER_LAUNCH_TIMEOUT_SECONDS = 120;
const WINDOWS_HOST_NATIVE_HEADLESS_PRELAUNCH_WAIT_SECONDS = 25;
const WINDOWS_HOST_NATIVE_HEADLESS_STARTUP_RETRY_COUNT = 1;
const WINDOWS_HOST_NATIVE_HEADLESS_RETRY_DELAY_SECONDS = 8;

export function buildWindowsContainerLabviewCliScript(
  executable: string,
  args: string[],
  labviewPath?: string,
  cliConnectTimeoutSeconds?: number
): string {
  return buildHeadlessLabviewCliLaunchScript(executable, args, labviewPath, cliConnectTimeoutSeconds, {
    metaTag: 'vi-history-suite-container-meta',
    defaultOpenAppTimeoutSeconds: WINDOWS_CONTAINER_OPEN_APP_TIMEOUT_SECONDS,
    defaultAfterLaunchTimeoutSeconds: WINDOWS_CONTAINER_AFTER_LAUNCH_TIMEOUT_SECONDS,
    prelaunchWaitSeconds: WINDOWS_CONTAINER_PRELAUNCH_WAIT_SECONDS,
    startupRetryCount: WINDOWS_CONTAINER_STARTUP_RETRY_COUNT,
    retryDelaySeconds: WINDOWS_CONTAINER_RETRY_DELAY_SECONDS,
    tempRoot: WINDOWS_CONTAINER_TEMP_ROOT
  });
}

interface HeadlessLabviewCliLaunchScriptOptions {
  /** Provenance meta-line tag, e.g. `vi-history-suite-container-meta`. */
  metaTag: string;
  /** Connect-window fallback + the value printed in the provenance meta line. */
  defaultOpenAppTimeoutSeconds: number;
  defaultAfterLaunchTimeoutSeconds: number;
  prelaunchWaitSeconds: number;
  startupRetryCount: number;
  retryDelaySeconds: number;
  /**
   * When set, the script pins `$env:TEMP`/`$env:TMP` to this root (windows-container
   * behavior). Omit for host-native, which uses the ambient temp directory.
   */
  tempRoot?: string;
}

/**
 * VHS-REQ-665: shared headless LabVIEWCLI launch script. Prelaunches LabVIEW
 * `--headless` (so the VI Server binds without an interactive desktop), tunes the
 * LabVIEWCLI.ini connect window, runs the CLI, and retries once on the cold-launch
 * VI Server connect race (-350000/-350051). Used by both the windows-container
 * provider (x64 authoritative) and the win32 host-native headless opt-in path
 * (x86 parity). The container-specific defaults keep byte-identical output for the
 * pre-existing container path.
 */
function buildHeadlessLabviewCliLaunchScript(
  executable: string,
  args: string[],
  labviewPath: string | undefined,
  cliConnectTimeoutSeconds: number | undefined,
  options: HeadlessLabviewCliLaunchScriptOptions
): string {
  const openAppTimeout =
    typeof cliConnectTimeoutSeconds === 'number' && Number.isInteger(cliConnectTimeoutSeconds) && cliConnectTimeoutSeconds > 0
      ? cliConnectTimeoutSeconds
      : options.defaultOpenAppTimeoutSeconds;
  const afterLaunchTimeout =
    typeof cliConnectTimeoutSeconds === 'number' && Number.isInteger(cliConnectTimeoutSeconds) && cliConnectTimeoutSeconds > 0
      ? cliConnectTimeoutSeconds
      : options.defaultAfterLaunchTimeoutSeconds;
  const cliIniCandidates = [
    'C:\\ProgramData\\National Instruments\\LabVIEW CLI\\LabVIEWCLI.ini',
    'C:\\ProgramData\\National Instruments\\LabVIEWCLI\\LabVIEWCLI.ini',
    'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.ini',
    'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.ini'
  ];
  const effectiveLabviewPath = labviewPath?.trim();

  return [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    'function Set-IniToken {',
    '  param([string]$Path, [string]$Key, [string]$Value)',
    '  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }',
    "  $content = Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue",
    "  if ($null -eq $content) { $content = '' }",
    "  if ($content -match (\"(?m)^\\s*{0}\\s*=\" -f [regex]::Escape($Key))) {",
    '    $updated = [regex]::Replace($content, ("(?m)^\\s*{0}\\s*=.*$" -f [regex]::Escape($Key)), ("{0}={1}" -f $Key, $Value))',
    '  } else {',
    '    $updated = ($content.TrimEnd() + [Environment]::NewLine + ("{0}={1}" -f $Key, $Value) + [Environment]::NewLine)',
    '  }',
    "  Set-Content -LiteralPath $Path -Value $updated -Encoding utf8",
    '}',
    ...(options.tempRoot
      ? [`$env:TEMP = ${quotePowerShellLiteral(options.tempRoot)}`, '$env:TMP = $env:TEMP']
      : []),
    `$cliPath = ${quotePowerShellLiteral(executable)}`,
    effectiveLabviewPath
      ? `$labviewPath = ${quotePowerShellLiteral(effectiveLabviewPath)}`
      : '$labviewPath = $null',
    `$args = ${buildWindowsPowerShellArrayLiteral(args)}`,
    `$cliIniCandidates = ${buildWindowsPowerShellArrayLiteral(cliIniCandidates)}`,
    '$cliIni = $cliIniCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1',
    'if ($cliIni) {',
    `  Set-IniToken -Path $cliIni -Key '${LABVIEW_CLI_INI_OPEN_APP_KEY}' -Value '${openAppTimeout}'`,
    `  Set-IniToken -Path $cliIni -Key '${LABVIEW_CLI_INI_AFTER_LAUNCH_KEY}' -Value '${afterLaunchTimeout}'`,
    '}',
    '$prelaunchAttempted = $false',
    "if (-not [string]::IsNullOrWhiteSpace([string]$labviewPath) -and (Test-Path -LiteralPath $labviewPath)) {",
    '  $prelaunchAttempted = $true',
    "  Start-Process -FilePath $labviewPath -ArgumentList '--headless' -WindowStyle Hidden | Out-Null",
    `  Start-Sleep -Seconds ${options.prelaunchWaitSeconds}`,
    '}',
    '$attempt = 0',
    '$maxAttempts = [Math]::Max(1, 1 + ' + options.startupRetryCount + ')',
    '$lastExit = 1',
    "$lastOutputText = ''",
    'while ($attempt -lt $maxAttempts) {',
    '  $attempt++',
    "  $previousErrorActionPreference = $ErrorActionPreference",
    "  $ErrorActionPreference = 'Continue'",
    '  try {',
    '    $output = @(& $cliPath @args 2>&1)',
    '    $lastExit = [int]$LASTEXITCODE',
    '  } finally {',
    '    $ErrorActionPreference = $previousErrorActionPreference',
    '  }',
    '  $output | ForEach-Object { if (-not [string]::IsNullOrWhiteSpace([string]$_)) { Write-Output $_ } }',
    "  $lastOutputText = @($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine",
    '  if ($lastExit -eq 0) { break }',
    "  $isStartupConnectivity = ($lastExit -in @(-350000, -350051) -or $lastOutputText -match '-350000' -or $lastOutputText -match '-350051' -or $lastOutputText -match '(?i)failed to establish a connection with LabVIEW')",
    '  if ($isStartupConnectivity -and $attempt -lt $maxAttempts) {',
    `    Start-Sleep -Seconds ${options.retryDelaySeconds}`,
    '    continue',
    '  }',
    '  break',
    '}',
    "$connectedPort = ''",
    "if ($lastOutputText -match 'Connection established with LabVIEW at port number ([0-9]+)\\.') {",
    '  $connectedPort = $Matches[1]',
    '}',
    `Write-Output ('[${options.metaTag}]retryAttempts={0};prelaunchAttempted={1};iniPath={2};connectedPort={3};openTimeout=${options.defaultOpenAppTimeoutSeconds};afterLaunchTimeout=${options.defaultAfterLaunchTimeoutSeconds}' -f $attempt, ($(if ($prelaunchAttempted) { 1 } else { 0 })), $cliIni, $connectedPort)`,
    'exit $lastExit'
  ].join('\n');
}

/**
 * VHS-REQ-665: wrap a bare win32 host-native LabVIEWCLI command plan in the shared
 * headless launch script so LabVIEW is prelaunched `--headless` (binding the VI
 * Server without an interactive desktop) before the CLI connects. This is the
 * opt-in path that lets a non-interactive session (e.g. a Vagrant WinRM session 0)
 * drive a real comparison against a locally installed 32-bit LabVIEW 2026 — the
 * bitness the x64-only windows-container authoritative provider cannot cover.
 * Returns `undefined` for non-`labview-cli` engines or when no PowerShell host is
 * resolvable, leaving the caller's bare command plan unchanged.
 */
export function buildWindowsHostNativeHeadlessCommandPlan(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan,
  processPlatform: NodeJS.Platform,
  cliConnectTimeoutSeconds?: number
): ComparisonCommandPlan | undefined {
  if (record.runtimeSelection.engine !== 'labview-cli') {
    return undefined;
  }

  const hostExecutable = resolveWindowsPowerShellHostExecutable(processPlatform);
  if (!hostExecutable) {
    return undefined;
  }

  const script = buildHeadlessLabviewCliLaunchScript(
    commandPlan.executable,
    commandPlan.args,
    record.runtimeSelection.labviewExe?.path,
    cliConnectTimeoutSeconds,
    {
      metaTag: 'vi-history-suite-hostnative-meta',
      defaultOpenAppTimeoutSeconds: WINDOWS_HOST_NATIVE_HEADLESS_OPEN_APP_TIMEOUT_SECONDS,
      defaultAfterLaunchTimeoutSeconds: WINDOWS_HOST_NATIVE_HEADLESS_AFTER_LAUNCH_TIMEOUT_SECONDS,
      prelaunchWaitSeconds: WINDOWS_HOST_NATIVE_HEADLESS_PRELAUNCH_WAIT_SECONDS,
      startupRetryCount: WINDOWS_HOST_NATIVE_HEADLESS_STARTUP_RETRY_COUNT,
      retryDelaySeconds: WINDOWS_HOST_NATIVE_HEADLESS_RETRY_DELAY_SECONDS
    }
  );

  return {
    executable: hostExecutable,
    args: ['-NoProfile', '-EncodedCommand', encodeWindowsPowerShellScript(script)]
  };
}

/**
 * VHS-REQ-665: decide whether the opt-in win32 host-native headless wrap applies.
 * The wrap is used only when the extension both runs natively on Windows
 * (`processPlatform === 'win32'`) and targets a win32 effective runtime, and the
 * opt-in `LV_RTE_WIN_HOSTNATIVE_HEADLESS=1` toggle is set. Extracted as a pure
 * predicate so the gate is directly unit-testable without exporting orchestration
 * internals; `prepareExecutionContext` delegates to it with no behavior change.
 */
export function shouldWrapWindowsHostNativeHeadless(
  processPlatform: NodeJS.Platform,
  effectiveRuntimePlatform: string,
  hostNativeHeadlessToggle: string | undefined
): boolean {
  return (
    processPlatform === 'win32' &&
    effectiveRuntimePlatform === 'win32' &&
    hostNativeHeadlessToggle === '1'
  );
}
