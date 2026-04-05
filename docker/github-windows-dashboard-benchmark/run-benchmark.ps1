$ErrorActionPreference = 'Stop'

Set-Location -LiteralPath 'C:\workspace'

git config --global --add safe.directory C:/workspace | Out-Null

function Set-IniToken {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return
  }

  $content = Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue
  if ($null -eq $content) {
    $content = ''
  }

  if ($content -match ("(?m)^\s*{0}\s*=" -f [regex]::Escape($Key))) {
    $updated = [regex]::Replace(
      $content,
      ("(?m)^\s*{0}\s*=.*$" -f [regex]::Escape($Key)),
      ("{0}={1}" -f $Key, $Value)
    )
  } else {
    $updated = ($content.TrimEnd() + [Environment]::NewLine + ("{0}={1}" -f $Key, $Value) + [Environment]::NewLine)
  }

  Set-Content -LiteralPath $Path -Value $updated -Encoding utf8
}

$harnessCacheRoot = 'C:\workspace\.cache\harnesses'
if (Test-Path -LiteralPath $harnessCacheRoot) {
  Get-ChildItem -LiteralPath $harnessCacheRoot -Directory | ForEach-Object {
    $safeDirectory = $_.FullName.Replace('\', '/')
    git config --global --add safe.directory $safeDirectory | Out-Null
  }
}

function Get-EnvOrDefault {
  param(
    [string]$Name,
    [string]$DefaultValue
  )

  $value = [System.Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $DefaultValue
  }

  return $value
}

function Assert-LastExitCode {
  param(
    [string]$Message
  )

  if ($LASTEXITCODE -ne 0) {
    throw $Message
  }
}

$env:LV_RTE_HEADLESS = '1'
$labviewExePath = Get-EnvOrDefault `
  'VIHS_GITHUB_WINDOWS_BENCHMARK_LABVIEW_EXE_PATH' `
  'C:\Program Files\National Instruments\LabVIEW 2026\LabVIEW.exe'
$cliIniCandidates = @(
  'C:\ProgramData\National Instruments\LabVIEW CLI\LabVIEWCLI.ini',
  'C:\ProgramData\National Instruments\LabVIEWCLI\LabVIEWCLI.ini',
  'C:\Program Files\National Instruments\Shared\LabVIEW CLI\LabVIEWCLI.ini',
  'C:\Program Files (x86)\National Instruments\Shared\LabVIEW CLI\LabVIEWCLI.ini'
)
$cliIni = $cliIniCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($cliIni) {
  Set-IniToken -Path $cliIni -Key 'OpenAppReferenceTimeoutInSecond' -Value '180'
  Set-IniToken -Path $cliIni -Key 'AfterLaunchOpenAppReferenceTimeoutInSecond' -Value '180'
}

$benchmarkCliPath = 'C:\workspace\out\cli\runGitHubWindowsDashboardBenchmark.js'
if (-not (Test-Path -LiteralPath $benchmarkCliPath)) {
  throw "Prebuilt Windows benchmark CLI is missing at $benchmarkCliPath."
}

New-Item -ItemType Directory -Path 'C:\workspace\.cache' -Force | Out-Null
Write-Host 'VIHS_PROGRESS: Using prebuilt Windows benchmark workspace image.'
if ($cliIni) {
  Write-Host "VIHS_PROGRESS: Hardened LabVIEWCLI.ini for Windows benchmark startup: $cliIni"
}
if (Test-Path -LiteralPath $labviewExePath) {
  Write-Host "VIHS_PROGRESS: Prelaunching headless LabVIEW from $labviewExePath"
  Start-Process -FilePath $labviewExePath -ArgumentList '--headless' -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 20
}

$args = @(
  '--harness-id',
  (Get-EnvOrDefault 'VIHS_GITHUB_WINDOWS_BENCHMARK_HARNESS_ID' 'HARNESS-VHS-002')
)

if ($env:VIHS_GITHUB_WINDOWS_BENCHMARK_DASHBOARD_COMMIT_WINDOW) {
  $args += @(
    '--dashboard-commit-window',
    $env:VIHS_GITHUB_WINDOWS_BENCHMARK_DASHBOARD_COMMIT_WINDOW
  )
}

if ($env:VIHS_GITHUB_WINDOWS_BENCHMARK_ENGINE) {
  $args += @(
    '--engine',
    $env:VIHS_GITHUB_WINDOWS_BENCHMARK_ENGINE
  )
}

if ($env:VIHS_GITHUB_WINDOWS_BENCHMARK_LABVIEW_CLI_PATH) {
  $args += @(
    '--labview-cli-path',
    $env:VIHS_GITHUB_WINDOWS_BENCHMARK_LABVIEW_CLI_PATH
  )
}

if ($env:VIHS_GITHUB_WINDOWS_BENCHMARK_LABVIEW_EXE_PATH) {
  $args += @(
    '--labview-exe-path',
    $env:VIHS_GITHUB_WINDOWS_BENCHMARK_LABVIEW_EXE_PATH
  )
}

if ($env:VIHS_GITHUB_WINDOWS_BENCHMARK_LVCOMPARE_PATH) {
  $args += @(
    '--lvcompare-path',
    $env:VIHS_GITHUB_WINDOWS_BENCHMARK_LVCOMPARE_PATH
  )
}

if ($env:VIHS_GITHUB_WINDOWS_BENCHMARK_STRICT_RSRC_HEADER -eq 'true') {
  $args += '--strict-rsrc-header'
}

Write-Host 'VIHS_PROGRESS: Starting GitHub Windows dashboard benchmark.'
node $benchmarkCliPath @args
Assert-LastExitCode 'The prebuilt Windows benchmark CLI exited with a nonzero status.'
