[CmdletBinding()]
param(
  [string]$RunnerRoot = 'C:\GitLab-Runner',
  [string]$TaskName = 'VIHS Governed Runner Lanes'
)

$ErrorActionPreference = 'Stop'

$bootstrapSource = Join-Path $PSScriptRoot 'start-governed-runner-lanes.ps1'
$bootstrapDestination = Join-Path $RunnerRoot 'start-governed-runner-lanes.ps1'
$runnerExe = Join-Path $RunnerRoot 'gitlab-runner.exe'
$runnerConfig = Join-Path $RunnerRoot 'config.toml'
$taskExecutable = 'powershell.exe'
$taskArguments = "-NoLogo -NoProfile -File `"$bootstrapDestination`""

function Assert-PathExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Guidance
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Path is missing. $Guidance"
  }
}

function Get-ConfiguredWindowsRunners {
  @(
    Get-CimInstance Win32_Process -Filter "name = 'gitlab-runner.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -like '* run *' -and $_.CommandLine -like "*$runnerConfig*" }
  )
}

Assert-PathExists -Path $bootstrapSource -Guidance 'Run this script from the repo-owned runner asset pack.'
Assert-PathExists -Path $runnerExe -Guidance 'Install gitlab-runner.exe under C:\GitLab-Runner before applying the governed runner lanes.'
Assert-PathExists -Path $runnerConfig -Guidance 'Register the governed Windows runner first so C:\GitLab-Runner\config.toml exists.'

if (-not (Get-Command $taskExecutable -ErrorAction SilentlyContinue)) {
  throw "$taskExecutable is not available on this Windows host."
}

New-Item -ItemType Directory -Path $RunnerRoot -Force | Out-Null
Copy-Item -LiteralPath $bootstrapSource -Destination $bootstrapDestination -Force

$interactiveUser = (whoami.exe).Trim()
$taskAction = New-ScheduledTaskAction -Execute $taskExecutable -Argument $taskArguments
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $interactiveUser -LogonType Interactive -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 5

$registeredTask = Get-ScheduledTask -TaskName $TaskName
$taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
$windowsRunners = @(Get-ConfiguredWindowsRunners)

if ($windowsRunners.Count -ne 1) {
  $runnerSummary = @($windowsRunners | ForEach-Object { "$($_.ProcessId): $($_.CommandLine)" })
  throw "Governed Windows runner apply failed; expected exactly one configured gitlab-runner manager after apply, found $($windowsRunners.Count). $($runnerSummary -join ' | ')"
}

[PSCustomObject]@{
  taskName = $TaskName
  taskState = $registeredTask.State.ToString()
  lastTaskResult = $taskInfo.LastTaskResult
  actionExecutable = $taskExecutable
  actionArguments = $taskArguments
  bootstrapDestination = $bootstrapDestination
  runnerProcessIds = @($windowsRunners | ForEach-Object ProcessId)
} | ConvertTo-Json -Depth 4
