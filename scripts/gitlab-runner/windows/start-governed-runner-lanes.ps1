$ErrorActionPreference = 'Stop'

$runnerRoot = 'C:\GitLab-Runner'
$runnerExe = Join-Path $runnerRoot 'gitlab-runner.exe'
$runnerConfig = Join-Path $runnerRoot 'config.toml'
$logDir = Join-Path $runnerRoot 'logs'
$stdoutLog = Join-Path $logDir 'gitlab-runner-stdout.log'
$stderrLog = Join-Path $logDir 'gitlab-runner-stderr.log'
$startupReceiptRoot = Join-Path $runnerRoot 'receipts\governed-runner-startup'
$linuxAssuranceDistroOverrideEnvironmentVariable = 'VIHS_LINUX_ASSURANCE_DISTRO'
$linuxAssuranceDistro = [Environment]::GetEnvironmentVariable($linuxAssuranceDistroOverrideEnvironmentVariable)
if ([string]::IsNullOrWhiteSpace($linuxAssuranceDistro)) {
  $linuxAssuranceDistro = 'Ubuntu-24.04'
}
else {
  $linuxAssuranceDistro = $linuxAssuranceDistro.Trim()
}
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
$script:startupIssues = [System.Collections.Generic.List[string]]::new()
$script:startupReceipt = [ordered]@{
  schema = 'vi-history-suite/governed-runner-startup@v1'
  generatedAt = $null
  runnerRoot = $runnerRoot
  runnerConfig = $runnerConfig
  logDir = $logDir
  windowsRunnerCountBefore = 0
  windowsRunnerCountAfter = 0
  windowsRunnerProcessIdsAfter = @()
  coldAdmissionRuntimeCleanupAttempted = $false
  linuxAssuranceBootstrap = [ordered]@{
    distro = $linuxAssuranceDistro
    distroOverrideEnvironmentVariable = $linuxAssuranceDistroOverrideEnvironmentVariable
    bootstrapCommand = $linuxAssuranceBootstrapCommand
    wakeAttempts = $linuxAssuranceWakeAttempts
    wakeDelaySeconds = $linuxAssuranceWakeDelaySeconds
    attempted = $false
    attemptCount = 0
    succeeded = $false
    helperHealthy = $null
    helperLatestReceiptPath = $null
    helperTimestampedReceiptPath = $null
  }
  healthy = $false
  issues = @()
}

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
    $script:startupReceipt.linuxAssuranceBootstrap.attempted = $true
    $script:startupReceipt.linuxAssuranceBootstrap.attemptCount = $attempt
    $bootstrapOutput = & wsl.exe -d $linuxAssuranceDistro bash -lc $linuxAssuranceBootstrapCommand 2>&1
    $bootstrapExitCode = $LASTEXITCODE
    $bootstrapText = [string]::Join([Environment]::NewLine, @($bootstrapOutput | ForEach-Object { "$_" }))
    $bootstrapPayload = $null
    try {
      if (-not [string]::IsNullOrWhiteSpace($bootstrapText)) {
        $bootstrapPayload = $bootstrapText | ConvertFrom-Json
      }
    }
    catch {
      $bootstrapPayload = $null
    }

    if ($null -ne $bootstrapPayload) {
      $script:startupReceipt.linuxAssuranceBootstrap.helperHealthy = $bootstrapPayload.healthy
      $script:startupReceipt.linuxAssuranceBootstrap.helperLatestReceiptPath = $bootstrapPayload.latestReceiptPath
      $script:startupReceipt.linuxAssuranceBootstrap.helperTimestampedReceiptPath = $bootstrapPayload.timestampedReceiptPath
    }

    if ($bootstrapExitCode -eq 0) {
      $script:startupReceipt.linuxAssuranceBootstrap.succeeded = $true
      return
    }

    $lastBootstrapFailure = $bootstrapText
    if ($attempt -lt $linuxAssuranceWakeAttempts) {
      Start-Sleep -Seconds $linuxAssuranceWakeDelaySeconds
    }
  }

  throw "Governed Linux assurance bootstrap failed after $linuxAssuranceWakeAttempts attempts for distro $linuxAssuranceDistro. Last failure: $lastBootstrapFailure"
}

function Write-StartupReceipt {
  if (-not (Test-Path -LiteralPath $startupReceiptRoot)) {
    New-Item -ItemType Directory -Path $startupReceiptRoot -Force | Out-Null
  }

  $generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  $timestampLeaf = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ss-fffZ')
  $timestampedReceiptPath = Join-Path $startupReceiptRoot "$timestampLeaf.json"
  $latestReceiptPath = Join-Path $startupReceiptRoot 'latest.json'

  $script:startupReceipt.generatedAt = $generatedAt
  $script:startupReceipt.latestReceiptPath = $latestReceiptPath
  $script:startupReceipt.timestampedReceiptPath = $timestampedReceiptPath
  $script:startupReceipt.issues = @($script:startupIssues.ToArray())

  $startupReceiptJson = $script:startupReceipt | ConvertTo-Json -Depth 12
  Set-Content -LiteralPath $timestampedReceiptPath -Value $startupReceiptJson -Encoding utf8
  Set-Content -LiteralPath $latestReceiptPath -Value $startupReceiptJson -Encoding utf8
}

if (-not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

try {
  $windowsRunners = Remove-DuplicateWindowsRunners
  $script:startupReceipt.windowsRunnerCountBefore = $windowsRunners.Count

  if ($windowsRunners.Count -eq 0) {
    $script:startupReceipt.coldAdmissionRuntimeCleanupAttempted = $true
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

  $script:startupReceipt.windowsRunnerCountAfter = $windowsRunners.Count
  $script:startupReceipt.windowsRunnerProcessIdsAfter = @($windowsRunners | ForEach-Object ProcessId)
  $script:startupReceipt.healthy = $true
}
catch {
  $script:startupIssues.Add($_.Exception.Message)
  $script:startupReceipt.healthy = $false
  throw
}
finally {
  if (-not $script:startupReceipt.windowsRunnerCountAfter) {
    $windowsRunnersAfter = @(Get-ConfiguredWindowsRunners)
    $script:startupReceipt.windowsRunnerCountAfter = $windowsRunnersAfter.Count
    $script:startupReceipt.windowsRunnerProcessIdsAfter = @($windowsRunnersAfter | ForEach-Object ProcessId)
  }

  Write-StartupReceipt
}
