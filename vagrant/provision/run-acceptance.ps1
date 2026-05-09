#Requires -Version 5.1
<#
.SYNOPSIS
  Installs the vi-history-suite vsix, configures VS Code settings, runs the governed
  report-smoke proof, and writes evidence to C:\vihs-evidence.

.DESCRIPTION
  Called by the `acceptance` Vagrant provisioner. Expects:
    - C:\vihs-workspace  - synced repo root (with compiled out\ from CI build)
    - C:\vihs-shared     - vsix artefact drop directory
    - C:\vihs-evidence   - output directory for reports and transcripts

  All transcript and report files are written under C:\vihs-evidence so the host
  CI runner can collect them via the synced folder.

  Exit codes: 0 = acceptance passed, 1 = acceptance failed.
#>
param(
  [string]$LabVIEWVersion = '2026',
  [string]$LabVIEWBitness = 'x86',
  [string]$HarnessId      = 'HARNESS-VHS-002',
  [string]$SelectedHash   = '8741bb08026c104100720c0ef48621e4ab7762fd',
  [string]$BaseHash       = 'c188cdec606aac3b17d8b17274baa19eef3e4017',
  [int]   $RuntimeTimeoutMs = 300000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$WorkspaceRoot = 'C:\vihs-workspace'
$SharedRoot    = 'C:\vihs-shared'
$EvidenceRoot  = 'C:\vihs-evidence'

function Write-Step([string]$Message) {
  $ts = (Get-Date -Format 'HH:mm:ss')
  Write-Host "[$ts acceptance] $Message"
}

function Resolve-VSCodeCli {
  foreach ($candidate in @(
    "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd",
    "$env:ProgramFiles\Microsoft VS Code\bin\code.cmd"
  )) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  $codeOnPath = Get-Command code -ErrorAction SilentlyContinue
  if ($codeOnPath) { return $codeOnPath.Source }
  throw "VS Code CLI not found. Run bootstrap provisioner first."
}

# ---------------------------------------------------------------------------
# 0. Locate artefacts
# ---------------------------------------------------------------------------
Write-Step "Resolving vsix artefact in $SharedRoot..."
$vsixFiles = @(Get-ChildItem -LiteralPath $SharedRoot -Filter '*.vsix' -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTimeUtc -Descending)
if ($vsixFiles.Count -eq 0) {
  throw "No .vsix file found in $SharedRoot. Ensure the CI build step uploaded the artefact."
}
$VsixPath = $vsixFiles[0].FullName
Write-Step "Using vsix: $VsixPath"

# ---------------------------------------------------------------------------
# 0.5. Ensure LabVIEW is running in the interactive (Session 1) desktop so that
#      the VI Server TCP port can initialise. WinRM sessions run in Session 0
#      where LabVIEW cannot create a message pump, so we launch LabVIEW via a
#      scheduled task using an Interactive principal to force Session 1.
# ---------------------------------------------------------------------------
Write-Step "Checking LabVIEW is running in an interactive session (VI Server)..."

$lvExe = "C:\Program Files (x86)\National Instruments\LabVIEW 2026\LabVIEW.exe"

function Wait-LabVIEWPort {
  param([int]$TimeoutSec = 120)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $port = netstat -an 2>$null | Select-String ':3363.*LISTENING'
    if ($port) { return $true }
    Start-Sleep -Seconds 5
  }
  return $false
}

# Check if VI Server port is already open (LabVIEW may already be running)
$portAlreadyOpen = netstat -an 2>$null | Select-String ':3363.*LISTENING'
if ($portAlreadyOpen) {
  Write-Step "LabVIEW VI Server already listening on port 3363."
} else {
  $lvRunning = Get-Process -Name LabVIEW -ErrorAction SilentlyContinue
  if (-not $lvRunning) {
    Write-Step "LabVIEW not running. Launching via scheduled task..."
    $taskName = 'vihs-lv-prelaunch'
    try {
      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

      $taskAction    = New-ScheduledTaskAction -Execute $lvExe
      $taskTrigger   = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5)
      $taskPrincipal = New-ScheduledTaskPrincipal -UserId 'vagrant' -LogonType Interactive -RunLevel Highest
      $taskSettings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)

      Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null
      Start-ScheduledTask -TaskName $taskName
    } catch {
      throw "Failed to launch LabVIEW via interactive scheduled task: $($_.Exception.Message)"
    }
    Write-Step "Scheduled task triggered. Waiting up to 120s for LabVIEW to initialise VI Server..."
  } else {
    Write-Step "LabVIEW is running (Session $($lvRunning.SessionId)). Waiting up to 60s for VI Server port 3363..."
  }

  if (-not (Wait-LabVIEWPort -TimeoutSec 120)) {
    throw "LabVIEW VI Server did not open port 3363 within 120 s. Check LabVIEW.ini and Windows Firewall."
  }
  Write-Step "LabVIEW VI Server ready on port 3363."
}

# ---------------------------------------------------------------------------
# 1. Install the vsix
# ---------------------------------------------------------------------------
Write-Step "Installing vsix via VS Code CLI..."
$codeCmd = Resolve-VSCodeCli
& $codeCmd --install-extension $VsixPath --force
if ($LASTEXITCODE -ne 0) {
  throw "'code --install-extension' failed (exit $LASTEXITCODE)."
}
Write-Step "Extension installed."

# ---------------------------------------------------------------------------
# 2. Configure VS Code settings (non-interactive, defaults to host/2026/x64)
# ---------------------------------------------------------------------------
Write-Step "Configuring VI History Suite runtime settings..."
$installScript = Join-Path $WorkspaceRoot 'scripts\install-vihs-extension.ps1'
if (-not (Test-Path -LiteralPath $installScript)) {
  throw "Install script not found: $installScript. Is C:\vihs-workspace synced correctly?"
}
& powershell.exe -NoLogo -NoProfile -NonInteractive -File $installScript `
    -SkipInstall `
    -NonInteractive `
    -CodeCommand $codeCmd
if ($LASTEXITCODE -ne 0) {
  throw "Settings configuration script failed (exit $LASTEXITCODE)."
}
Write-Step "Settings configured."

# ---------------------------------------------------------------------------
# 3. Stage workspace to local drive and install npm deps
# ---------------------------------------------------------------------------
# The workspace is a VirtualBox shared folder (network path). node_modules from
# the Linux host may have symlinks that Windows cannot handle. Stage the project
# to a local drive so npm install works cleanly without touching the shared folder.
$StageRoot = 'C:\vihs-stage'
Write-Step "Staging workspace to $StageRoot for Windows-native npm install..."

if (Test-Path -LiteralPath $StageRoot) {
  Remove-Item -LiteralPath $StageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $StageRoot | Out-Null

# Copy package files and compiled output (not node_modules)
Copy-Item -LiteralPath (Join-Path $WorkspaceRoot 'package.json') -Destination $StageRoot
Copy-Item -LiteralPath (Join-Path $WorkspaceRoot 'package-lock.json') -Destination $StageRoot -ErrorAction SilentlyContinue
$outSrc = Join-Path $WorkspaceRoot 'out'
if (Test-Path -LiteralPath $outSrc) {
  Copy-Item -LiteralPath $outSrc -Destination (Join-Path $StageRoot 'out') -Recurse
}

Push-Location $StageRoot
try {
  npm install --omit=dev 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed (exit $LASTEXITCODE)."
  }
} finally {
  Pop-Location
}
Write-Step "npm deps installed in $StageRoot."

# ---------------------------------------------------------------------------
# 4. Verify compiled proof CLI is present
# ---------------------------------------------------------------------------
$ProofCli = Join-Path $StageRoot 'out\cli\runGovernedProof.js'
if (-not (Test-Path -LiteralPath $ProofCli)) {
  throw "Compiled proof CLI not found at $ProofCli. The CI build job must upload the out\ directory."
}
Write-Step "Proof CLI present: $ProofCli"

# ---------------------------------------------------------------------------
# 5. Prepare evidence directory
# ---------------------------------------------------------------------------
$RunTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$RunEvidenceRoot = Join-Path $EvidenceRoot $RunTimestamp
New-Item -ItemType Directory -Force -Path $RunEvidenceRoot | Out-Null
Write-Step "Evidence will be written to: $RunEvidenceRoot"

# ---------------------------------------------------------------------------
# 6. Run the governed report-smoke proof
# ---------------------------------------------------------------------------
Write-Step "Running governed report-smoke proof (this invokes LabVIEWCLI and may take several minutes)..."

$proofArgs = @(
  $ProofCli,
  'report-smoke',
  '--harness-id',        $HarnessId,
  '--selected-hash',     $SelectedHash,
  '--base-hash',         $BaseHash,
  '--platform',          'win32',
  '--execution-mode',    'host-only',
  '--bitness',           $LabVIEWBitness,
  '--runtime-timeout-ms', $RuntimeTimeoutMs.ToString()
)

$transcriptPath = Join-Path $RunEvidenceRoot 'proof-run.txt'
$transcriptLines = [System.Collections.Generic.List[string]]::new()
$transcriptLines.Add("$ node $($proofArgs -join ' ')")
$transcriptLines.Add('')

Push-Location $StageRoot
try {
  $result = & node @proofArgs 2>&1 | Tee-Object -Variable capturedOutput
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}

foreach ($line in $capturedOutput) {
  $transcriptLines.Add([string]$line)
}
$transcriptLines | Set-Content -LiteralPath $transcriptPath -Encoding utf8

Write-Step "Proof exit code: $exitCode"

# ---------------------------------------------------------------------------
# 7. Collect harness report from .cache\harness-reports\<harnessId>
# ---------------------------------------------------------------------------
$HarnessReportSrc = Join-Path $StageRoot ".cache\harness-reports\$HarnessId"
$HarnessReportDst = Join-Path $RunEvidenceRoot 'harness-report'

if (Test-Path -LiteralPath $HarnessReportSrc) {
  Write-Step "Copying harness report to evidence..."
  Copy-Item -LiteralPath $HarnessReportSrc -Destination $HarnessReportDst -Recurse -Force
} else {
  Write-Step "WARNING: Harness report directory not found at $HarnessReportSrc. The proof may not have produced output."
}

# ---------------------------------------------------------------------------
# 8. Write a run manifest
# ---------------------------------------------------------------------------
$reportJsonPath = Join-Path $HarnessReportDst 'comparison-report-smoke.json'
$reportStatus   = 'unknown'
$runtimeState   = 'unknown'
if (Test-Path -LiteralPath $reportJsonPath) {
  try {
    $reportData  = Get-Content -LiteralPath $reportJsonPath -Raw | ConvertFrom-Json
    $reportStatus = $reportData.reportStatus
    $runtimeState = $reportData.runtimeExecutionState
  } catch {
    Write-Step "WARNING: Could not parse comparison report JSON."
  }
}

$manifest = [ordered]@{
  schema              = 'vi-history-suite/vagrant-vsix-acceptance@v1'
  generatedAt         = (Get-Date -Format 'o')
  harnessId           = $HarnessId
  selectedHash        = $SelectedHash
  baseHash            = $BaseHash
  vsixPath            = $VsixPath
  labviewVersion      = $LabVIEWVersion
  labviewBitness      = $LabVIEWBitness
  proofExitCode       = $exitCode
  reportStatus        = $reportStatus
  runtimeExecutionState = $runtimeState
  evidenceRoot        = $RunEvidenceRoot
}
$manifestPath = Join-Path $RunEvidenceRoot 'manifest.json'
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding utf8

Write-Step "Manifest written: $manifestPath"
Write-Host ($manifest | ConvertTo-Json -Depth 4)

# ---------------------------------------------------------------------------
# 9. Fail if proof did not succeed
# ---------------------------------------------------------------------------
if ($exitCode -ne 0) {
  Write-Step "FAIL: Proof CLI exited with code $exitCode. See transcript: $transcriptPath"
  exit 1
}

if ($runtimeState -ne 'succeeded') {
  Write-Step "FAIL: Proof completed but runtimeExecutionState='$runtimeState' (expected 'succeeded')."
  exit 1
}

Write-Step "PASS: Governed report-smoke proof succeeded. reportStatus=$reportStatus"
exit 0
