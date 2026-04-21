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
$expectedTaskExecutable = 'powershell.exe'
$expectedTaskArguments = "-NoLogo -NoProfile -File `"$bootstrapDestination`""
$expectedRequestConcurrencyPattern = '(?m)^\s*request_concurrency\s*=\s*2\s*$'

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

function Get-NormalizedSha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $hashBytes = $sha256.ComputeHash($stream)
  }
  finally {
    $stream.Dispose()
    $sha256.Dispose()
  }

  ([System.BitConverter]::ToString($hashBytes)).Replace('-', '')
}

function Assert-TextMatchesPattern {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Pattern,
    [Parameter(Mandatory = $true)]
    [string]$FailureMessage
  )

  $text = Get-Content -LiteralPath $Path -Raw
  if ($text -notmatch $Pattern) {
    throw $FailureMessage
  }
}

Assert-PathExists -Path $bootstrapSource -Guidance 'Run this assertion from the repo-owned runner asset pack.'
Assert-PathExists -Path $bootstrapDestination -Guidance 'Apply the repo-owned Windows runner surface before asserting host drift.'
Assert-PathExists -Path $runnerExe -Guidance 'Install gitlab-runner.exe under C:\GitLab-Runner before asserting the governed runner lanes.'
Assert-PathExists -Path $runnerConfig -Guidance 'Register the governed Windows runner first so C:\GitLab-Runner\config.toml exists.'

$registeredTask = Get-ScheduledTask -TaskName $TaskName
$taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
$taskActions = @($registeredTask.Actions)

if ($taskActions.Count -ne 1) {
  throw "Governed Windows runner assertion failed; expected exactly one scheduled-task action for $TaskName, found $($taskActions.Count)."
}

$taskExecutableRaw = $taskActions[0].Execute
if ($null -eq $taskExecutableRaw) {
  $taskExecutableRaw = ''
}
$taskExecutable = [System.IO.Path]::GetFileName($taskExecutableRaw)
if ($taskExecutable.ToLowerInvariant() -ne $expectedTaskExecutable) {
  throw "Governed Windows runner assertion failed; expected task executable $expectedTaskExecutable, found $taskExecutable."
}

$taskArguments = $taskActions[0].Arguments
if ($null -eq $taskArguments) {
  $taskArguments = ''
}
if ($taskArguments -ne $expectedTaskArguments) {
  throw "Governed Windows runner assertion failed; expected task arguments '$expectedTaskArguments', found '$taskArguments'."
}

$taskXml = Export-ScheduledTask -TaskName $TaskName
if ($taskXml -notmatch '<LogonTrigger\b') {
  throw "Governed Windows runner assertion failed; $TaskName no longer retains a logon trigger."
}

if ($registeredTask.State.ToString() -notin @('Ready', 'Running')) {
  throw "Governed Windows runner assertion failed; expected task state Ready or Running, found $($registeredTask.State)."
}

Assert-TextMatchesPattern `
  -Path $runnerConfig `
  -Pattern $expectedRequestConcurrencyPattern `
  -FailureMessage 'Governed Windows runner assertion failed; config.toml no longer retains request_concurrency = 2.'

$sourceSha256 = Get-NormalizedSha256 -Path $bootstrapSource
$destinationSha256 = Get-NormalizedSha256 -Path $bootstrapDestination
if ($sourceSha256 -ne $destinationSha256) {
  throw "Governed Windows runner assertion failed; installed bootstrap drift detected ($destinationSha256) versus repo source ($sourceSha256)."
}

$windowsRunners = @(Get-ConfiguredWindowsRunners)
if ($windowsRunners.Count -ne 1) {
  $runnerSummary = @($windowsRunners | ForEach-Object { "$($_.ProcessId): $($_.CommandLine)" })
  throw "Governed Windows runner assertion failed; expected exactly one configured gitlab-runner manager, found $($windowsRunners.Count). $($runnerSummary -join ' | ')"
}

[PSCustomObject]@{
  taskName = $TaskName
  taskState = $registeredTask.State.ToString()
  lastTaskResult = $taskInfo.LastTaskResult
  taskActionExecutable = $taskExecutable
  taskActionArguments = $taskArguments
  taskHasLogonTrigger = $true
  taskLogonType = $registeredTask.Principal.LogonType.ToString()
  taskPrincipalUserId = $registeredTask.Principal.UserId
  runnerConfig = $runnerConfig
  requestConcurrency = 2
  bootstrapSource = $bootstrapSource
  bootstrapDestination = $bootstrapDestination
  bootstrapSourceSha256 = $sourceSha256
  bootstrapDestinationSha256 = $destinationSha256
  runnerProcessIds = @($windowsRunners | ForEach-Object ProcessId)
} | ConvertTo-Json -Depth 4
