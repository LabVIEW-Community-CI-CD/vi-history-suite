[CmdletBinding()]
param(
  [int]$TimeoutSeconds = 45,
  [int]$PollMilliseconds = 500
)

$ErrorActionPreference = 'Stop'

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
$terminationStrategy = @(
  'close-main-window'
  'stop-process-force-by-pid'
  'taskkill-pid-tree'
  'win32-process-terminate'
  'taskkill-image-tree'
)

function Get-WindowsProofRuntimeProcesses {
  @(
    Get-Process -Name $windowsProofRuntimeProcessNames -ErrorAction SilentlyContinue |
      Sort-Object ProcessName, Id
  )
}

function ConvertTo-ProcessSnapshot {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$Processes
  )

  @(
    $Processes | ForEach-Object {
      [ordered]@{
        processName = $_.ProcessName
        pid = $_.Id
        path = if ($_.Path) { $_.Path } else { $null }
      }
    }
  )
}

function Invoke-WindowsProofRuntimeTermination {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$Processes
  )

  foreach ($process in $Processes) {
    try {
      if ($process.MainWindowHandle -ne 0) {
        $process.CloseMainWindow() | Out-Null
        $process.WaitForExit(1000) | Out-Null
      }
    } catch {
    }

    try {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    } catch {
    }

    try {
      & taskkill.exe /PID $process.Id /T /F *> $null
    } catch {
    }

    try {
      $cimProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.Id)" -ErrorAction SilentlyContinue
      if ($null -ne $cimProcess) {
        Invoke-CimMethod -InputObject $cimProcess -MethodName Terminate -ErrorAction SilentlyContinue | Out-Null
      }
    } catch {
    }
  }

  foreach ($imageName in $windowsProofRuntimeImageNames) {
    try {
      & taskkill.exe /IM $imageName /T /F *> $null
    } catch {
    }
  }
}

$attempts = @()
$deadlineUtc = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)

while ($true) {
  $runtimeProcesses = @(Get-WindowsProofRuntimeProcesses)
  if ($runtimeProcesses.Count -eq 0) {
    $result = [ordered]@{
      schema = 'vi-history-suite/windows-proof-runtime-recovery@v1'
      generatedAt = ([DateTime]::UtcNow).ToString("o", [System.Globalization.CultureInfo]::InvariantCulture)
      timeoutSeconds = $TimeoutSeconds
      pollMilliseconds = $PollMilliseconds
      status = 'clean'
      terminationStrategy = $terminationStrategy
      attemptCount = $attempts.Count
      attempts = @($attempts)
      remainingProcesses = @()
    }
    $result | ConvertTo-Json -Depth 8
    exit 0
  }

  $attempts += [PSCustomObject]@{
    observedAt = ([DateTime]::UtcNow).ToString("o", [System.Globalization.CultureInfo]::InvariantCulture)
    processes = ConvertTo-ProcessSnapshot -Processes $runtimeProcesses
  }

  Invoke-WindowsProofRuntimeTermination -Processes $runtimeProcesses
  Start-Sleep -Milliseconds $PollMilliseconds

  if ([DateTime]::UtcNow -ge $deadlineUtc) {
    $remainingProcesses = @(Get-WindowsProofRuntimeProcesses)
    $result = [ordered]@{
      schema = 'vi-history-suite/windows-proof-runtime-recovery@v1'
      generatedAt = ([DateTime]::UtcNow).ToString("o", [System.Globalization.CultureInfo]::InvariantCulture)
      timeoutSeconds = $TimeoutSeconds
      pollMilliseconds = $PollMilliseconds
      status = 'failed'
      terminationStrategy = $terminationStrategy
      attemptCount = $attempts.Count
      attempts = @($attempts)
      remainingProcesses = ConvertTo-ProcessSnapshot -Processes $remainingProcesses
    }
    $result | ConvertTo-Json -Depth 8
    $remainingSummary = @($remainingProcesses | ForEach-Object { "$($_.ProcessName) ($($_.Id))" })
    throw "Windows proof runtime recovery failed; remaining processes: $($remainingSummary -join ', ')"
  }
}
