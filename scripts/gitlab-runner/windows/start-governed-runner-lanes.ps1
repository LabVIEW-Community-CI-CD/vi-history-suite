$ErrorActionPreference = 'Stop'

$runnerRoot = 'C:\GitLab-Runner'
$runnerExe = Join-Path $runnerRoot 'gitlab-runner.exe'
$runnerConfig = Join-Path $runnerRoot 'config.toml'
$logDir = Join-Path $runnerRoot 'logs'
$stdoutLog = Join-Path $logDir 'gitlab-runner-stdout.log'
$stderrLog = Join-Path $logDir 'gitlab-runner-stderr.log'
$linuxAssuranceDistro = 'Ubuntu'
$linuxAssuranceBootstrapCommand = '$HOME/gitlab-runner/start-linux-assurance.sh'
$linuxAssuranceWakeAttempts = 12
$linuxAssuranceWakeDelaySeconds = 10
$windowsProofRuntimeProcessNames = @(
  'LabVIEW'
  'LabVIEWCLI'
  'LVCompare'
)
$windowsProofRuntimeImageNames = @(
  'LabVIEW.exe'
  'LabVIEWCLI.exe'
  'LVCompare.exe'
)
$windowsProofRuntimeCleanupTimeoutSeconds = 10
$windowsProofRuntimeCleanupPollMilliseconds = 500

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

function Get-WindowsProofRuntimeProcesses {
  @(
    Get-Process -Name $windowsProofRuntimeProcessNames -ErrorAction SilentlyContinue |
      Sort-Object ProcessName, Id
  )
}

function Clear-WindowsProofRuntimeSurface {
  $deadlineUtc = [DateTime]::UtcNow.AddSeconds($windowsProofRuntimeCleanupTimeoutSeconds)
  while ($true) {
    $runtimeProcesses = Get-WindowsProofRuntimeProcesses
    if ($runtimeProcesses.Count -eq 0) {
      return
    }

    foreach ($runtimeProcess in $runtimeProcesses) {
      Stop-Process -Id $runtimeProcess.Id -Force -ErrorAction SilentlyContinue
      & taskkill.exe /PID $runtimeProcess.Id /T /F *> $null
    }
    foreach ($runtimeImageName in $windowsProofRuntimeImageNames) {
      & taskkill.exe /IM $runtimeImageName /T /F *> $null
    }

    Start-Sleep -Milliseconds $windowsProofRuntimeCleanupPollMilliseconds

    $remainingRuntimeProcesses = Get-WindowsProofRuntimeProcesses
    if ($remainingRuntimeProcesses.Count -eq 0) {
      return
    }
    if ([DateTime]::UtcNow -ge $deadlineUtc) {
      $remainingRuntimeProcessSummary = $remainingRuntimeProcesses |
        ForEach-Object { "$($_.ProcessName) ($($_.Id))" }
      throw "Windows proof runtime cleanup failed before cold runner admission; remaining processes: $($remainingRuntimeProcessSummary -join ', ')"
    }
  }
}

function Start-LinuxAssuranceSurface {
  $lastBootstrapFailure = ''

  for ($attempt = 1; $attempt -le $linuxAssuranceWakeAttempts; $attempt++) {
    $bootstrapOutput = & wsl.exe -d $linuxAssuranceDistro bash -lc $linuxAssuranceBootstrapCommand 2>&1
    $bootstrapExitCode = $LASTEXITCODE
    if ($bootstrapExitCode -eq 0) {
      return
    }

    $lastBootstrapFailure = [string]::Join([Environment]::NewLine, @($bootstrapOutput | ForEach-Object { "$_" }))
    if ($attempt -lt $linuxAssuranceWakeAttempts) {
      Start-Sleep -Seconds $linuxAssuranceWakeDelaySeconds
    }
  }

  throw "Governed Linux assurance bootstrap failed after $linuxAssuranceWakeAttempts attempts for distro $linuxAssuranceDistro. Last failure: $lastBootstrapFailure"
}

if (-not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

$windowsRunners = Remove-DuplicateWindowsRunners

if ($windowsRunners.Count -eq 0) {
  Clear-WindowsProofRuntimeSurface
  Start-Process -FilePath $runnerExe `
    -ArgumentList @('run', '--config', $runnerConfig) `
    -WorkingDirectory $runnerRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog | Out-Null
  Start-Sleep -Seconds 2
}

$windowsRunners = Remove-DuplicateWindowsRunners

Start-LinuxAssuranceSurface
