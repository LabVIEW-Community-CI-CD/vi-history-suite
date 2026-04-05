$ErrorActionPreference = 'Stop'

Set-Location -LiteralPath 'C:\workspace'

git config --global --add safe.directory C:/workspace | Out-Null

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

$benchmarkCliPath = 'C:\workspace\out\cli\runGitHubWindowsDashboardBenchmark.js'
if (-not (Test-Path -LiteralPath $benchmarkCliPath)) {
  throw "Prebuilt Windows benchmark CLI is missing at $benchmarkCliPath."
}

New-Item -ItemType Directory -Path 'C:\workspace\.cache' -Force | Out-Null
Write-Host 'VIHS_PROGRESS: Using prebuilt Windows benchmark workspace image.'

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
