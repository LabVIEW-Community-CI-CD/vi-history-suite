#Requires -Version 5.1
<#
.SYNOPSIS
  Prepares a cold LabVIEW runtime state before local Vagrant testing.

.DESCRIPTION
  Stops stale LabVIEW, LabVIEWCLI, and LVCompare processes from inside the
  guest, closes first-run desktop interlopers that can steal the interactive
  session, then waits for VI Server TCP port 3363 to stop listening.
#>
param(
  [int]$ViServerPort = 3363,
  [int]$WaitAttempts = 18,
  [int]$WaitSeconds = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$runtimeProcessNames = @('LabVIEW', 'LabVIEWCLI', 'LVCompare')
$startupInterloperProcessNames = @(
  'msedge',
  'msedgewebview2',
  'MicrosoftEdgeUpdate',
  'OneDrive',
  'UserOOBEBroker',
  'SystemSettings'
)

function Write-Step([string]$Message) {
  $ts = Get-Date -Format 'HH:mm:ss'
  Write-Host "[$ts cold-labview] $Message"
}

function Test-PortListening([int]$Port) {
  $pattern = ":$Port.*LISTENING"
  $matches = netstat -an 2>$null | Select-String $pattern
  return [bool]$matches
}

function Stop-RuntimeProcess([System.Diagnostics.Process]$Process) {
  Write-Step "Stopping $($Process.ProcessName) pid=$($Process.Id)"
  try {
    Stop-Process -Id $Process.Id -Force -ErrorAction Stop
  } catch {
    Write-Step "Stop-Process failed for pid=$($Process.Id): $($_.Exception.Message)"
  }

  try {
    & taskkill.exe /PID $Process.Id /T /F | Out-Host
  } catch {
    Write-Step "taskkill by pid failed for pid=$($Process.Id): $($_.Exception.Message)"
  }
}

Write-Step "Preparing cold LabVIEW runtime state."

foreach ($processName in $runtimeProcessNames) {
  $processes = @(Get-Process -Name $processName -ErrorAction SilentlyContinue)
  if ($processes.Count -eq 0) {
    Write-Step "$processName is not running."
    continue
  }

  foreach ($process in $processes) {
    Stop-RuntimeProcess -Process $process
  }
}

foreach ($processName in $runtimeProcessNames) {
  try {
    & taskkill.exe /IM "$processName.exe" /T /F 2>$null | Out-Host
  } catch {
    Write-Step "taskkill by image found no remaining $processName.exe processes."
  }
}

Write-Step "Closing first-run desktop interlopers before LabVIEW launch."
foreach ($processName in $startupInterloperProcessNames) {
  $processes = @(Get-Process -Name $processName -ErrorAction SilentlyContinue)
  if ($processes.Count -eq 0) {
    Write-Step "$processName is not running."
    continue
  }

  foreach ($process in $processes) {
    Stop-RuntimeProcess -Process $process
  }
}

foreach ($processName in $startupInterloperProcessNames) {
  try {
    & taskkill.exe /IM "$processName.exe" /T /F 2>$null | Out-Host
  } catch {
    Write-Step "taskkill by image found no remaining $processName.exe processes."
  }
}

Write-Step "Waiting for VI Server port $ViServerPort to stop listening."
for ($attempt = 1; $attempt -le $WaitAttempts; $attempt += 1) {
  if (-not (Test-PortListening -Port $ViServerPort)) {
    Write-Step "Port $ViServerPort is no longer LISTENING."
    Write-Step "Cold LabVIEW preparation complete."
    exit 0
  }

  Write-Step "[$attempt/$WaitAttempts] Port $ViServerPort is still LISTENING."
  if ($attempt -lt $WaitAttempts) {
    Start-Sleep -Seconds $WaitSeconds
  }
}

throw "Port $ViServerPort remained LISTENING after $WaitAttempts attempts."
