$ErrorActionPreference = 'Stop'

Set-Location -LiteralPath 'C:\workspace'

git config --global --add safe.directory C:/workspace | Out-Null

Write-Host 'VIHS_PROGRESS: Installing benchmark workspace dependencies.'
npm ci
Write-Host 'VIHS_PROGRESS: Compiling benchmark workspace.'
npm run compile

$args = @(
  '--harness-id',
  ($env:VIHS_GITHUB_WINDOWS_BENCHMARK_HARNESS_ID ?? 'HARNESS-VHS-002')
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
node out/cli/runGitHubWindowsDashboardBenchmark.js @args
