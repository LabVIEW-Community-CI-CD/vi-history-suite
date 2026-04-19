$ErrorActionPreference = 'Stop'

$runnerRoot = 'C:\GitLab-Runner'
$runnerExe = Join-Path $runnerRoot 'gitlab-runner.exe'
$runnerConfig = Join-Path $runnerRoot 'config.toml'
$logDir = Join-Path $runnerRoot 'logs'
$stdoutLog = Join-Path $logDir 'gitlab-runner-stdout.log'
$stderrLog = Join-Path $logDir 'gitlab-runner-stderr.log'

function Get-ConfiguredWindowsRunners {
  @(
    Get-CimInstance Win32_Process -Filter "name = 'gitlab-runner.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -like '* run *' -and $_.CommandLine -like '*C:\GitLab-Runner\config.toml*' }
  )
}

function Remove-DuplicateWindowsRunners {
  $windowsRunners = Get-ConfiguredWindowsRunners
  if ($windowsRunners.Count -gt 1) {
    $duplicateWindowsRunners = $windowsRunners |
      Sort-Object CreationDate -Descending |
      Select-Object -Skip 1
    foreach ($duplicateWindowsRunner in $duplicateWindowsRunners) {
      Stop-Process -Id $duplicateWindowsRunner.ProcessId -Force
    }
    $windowsRunners = Get-ConfiguredWindowsRunners
  }
  return $windowsRunners
}

if (-not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

$windowsRunners = Remove-DuplicateWindowsRunners

if ($windowsRunners.Count -eq 0) {
  Start-Process -FilePath $runnerExe `
    -ArgumentList @('run', '--config', $runnerConfig) `
    -WorkingDirectory $runnerRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog | Out-Null
  Start-Sleep -Seconds 2
}

$windowsRunners = Remove-DuplicateWindowsRunners

wsl.exe -d Ubuntu bash -lc '$HOME/gitlab-runner/start-linux-assurance.sh' | Out-Null
