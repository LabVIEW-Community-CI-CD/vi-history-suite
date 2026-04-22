[CmdletBinding()]
param(
  [string]$RunnerRoot = 'C:\GitLab-Runner',
  [string]$TaskName = 'VIHS Governed Runner Lanes'
)

$ErrorActionPreference = 'Stop'

$bootstrapDestination = Join-Path $RunnerRoot 'start-governed-runner-lanes.ps1'
$runnerConfig = Join-Path $RunnerRoot 'config.toml'
$startupReceiptPath = Join-Path $RunnerRoot 'receipts\governed-runner-startup\latest.json'
$expectedTaskExecutable = 'powershell.exe'
$expectedTaskArguments = "-NoLogo -NoProfile -File `"$bootstrapDestination`""
$expectedRequestConcurrencyPattern = '(?m)^\s*request_concurrency\s*=\s*2\s*$'

function Get-ConfiguredWindowsRunners {
  @(
    Get-CimInstance Win32_Process -Filter "name = 'gitlab-runner.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -like '* run *' -and $_.CommandLine -like "*$runnerConfig*" }
  )
}

$issues = [System.Collections.Generic.List[string]]::new()
$taskExecutable = ''
$taskArguments = ''
$taskState = ''
$lastTaskResult = $null
$taskHasLogonTrigger = $false
$requestConcurrency = $null
$startupReceipt = $null
$startupReceiptGeneratedAt = $null
$startupReceiptHealthy = $null

if (-not (Test-Path -LiteralPath $runnerConfig)) {
  $issues.Add("Missing governed Windows runner config at $runnerConfig.")
}
else {
  $configText = Get-Content -LiteralPath $runnerConfig -Raw
  if ($configText -match $expectedRequestConcurrencyPattern) {
    $requestConcurrency = 2
  }
  else {
    $issues.Add("Expected request_concurrency = 2 in $runnerConfig.")
  }
}

try {
  $registeredTask = Get-ScheduledTask -TaskName $TaskName
  $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
  $taskState = $registeredTask.State.ToString()
  $lastTaskResult = $taskInfo.LastTaskResult

  $taskActions = @($registeredTask.Actions)
  if ($taskActions.Count -ne 1) {
    $issues.Add("Expected exactly one scheduled-task action for $TaskName, found $($taskActions.Count).")
  }
  else {
    $taskExecutableRaw = $taskActions[0].Execute
    if ($null -eq $taskExecutableRaw) {
      $taskExecutableRaw = ''
    }
    $taskExecutable = [System.IO.Path]::GetFileName($taskExecutableRaw)
    if ($taskExecutable.ToLowerInvariant() -ne $expectedTaskExecutable) {
      $issues.Add("Expected task executable $expectedTaskExecutable, found $taskExecutable.")
    }

    $taskArguments = $taskActions[0].Arguments
    if ($null -eq $taskArguments) {
      $taskArguments = ''
    }
    if ($taskArguments -ne $expectedTaskArguments) {
      $issues.Add("Expected task arguments '$expectedTaskArguments', found '$taskArguments'.")
    }
  }

  $taskXml = Export-ScheduledTask -TaskName $TaskName
  if ($taskXml -match '<LogonTrigger\b') {
    $taskHasLogonTrigger = $true
  }
  else {
    $issues.Add("$TaskName no longer retains a logon trigger.")
  }
}
catch {
  $issues.Add("Could not inspect scheduled task $TaskName. $($_.Exception.Message)")
}

$windowsRunners = @(Get-ConfiguredWindowsRunners)
if ($windowsRunners.Count -ne 1) {
  $issues.Add("Expected exactly one configured gitlab-runner manager for $runnerConfig, found $($windowsRunners.Count).")
}

if (-not (Test-Path -LiteralPath $bootstrapDestination)) {
  $issues.Add("Missing installed bootstrap at $bootstrapDestination.")
}

if (Test-Path -LiteralPath $startupReceiptPath) {
  try {
    $startupReceipt = Get-Content -LiteralPath $startupReceiptPath -Raw | ConvertFrom-Json
    $startupReceiptGeneratedAt = $startupReceipt.generatedAt
    $startupReceiptHealthy = $startupReceipt.healthy
    if (-not $startupReceiptHealthy) {
      $issues.Add("Latest governed Windows startup receipt is not healthy: $startupReceiptPath")
    }
  }
  catch {
    $issues.Add("Could not parse governed Windows startup receipt at $startupReceiptPath. $($_.Exception.Message)")
  }
}
else {
  $issues.Add("Missing governed Windows startup receipt at $startupReceiptPath.")
}

[PSCustomObject]@{
  schema = 'vi-history-suite/windows-governed-runner-doctor@v1'
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  healthy = ($issues.Count -eq 0)
  taskName = $TaskName
  taskState = $taskState
  lastTaskResult = $lastTaskResult
  taskActionExecutable = $taskExecutable
  taskActionArguments = $taskArguments
  taskHasLogonTrigger = $taskHasLogonTrigger
  runnerConfig = $runnerConfig
  requestConcurrency = $requestConcurrency
  runnerProcessCount = $windowsRunners.Count
  runnerProcessIds = @($windowsRunners | ForEach-Object ProcessId)
  startupReceiptPath = $startupReceiptPath
  startupReceiptExists = (Test-Path -LiteralPath $startupReceiptPath)
  startupReceiptGeneratedAt = $startupReceiptGeneratedAt
  startupReceiptHealthy = $startupReceiptHealthy
  issues = @($issues)
} | ConvertTo-Json -Depth 8
