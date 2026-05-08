#Requires -Version 5.1
<#
.SYNOPSIS
  One-time bootstrap provisioner for the vi-history-suite Windows 11 Vagrant VM.
  Run by `vagrant provision --provision-with bootstrap` (or on first `vagrant up`).

.DESCRIPTION
  - Verifies VS Code is installed and `code` is on PATH
  - Verifies Node.js >= 18 is installed; installs LTS via winget if absent
  - Verifies git is installed
  - Ensures VirtualBox Guest Additions share mounts are accessible
  Exit codes: 0 = success, 1 = fatal failure
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "[bootstrap] $Message"
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Test-CommandAvailable([string]$Name) {
  return [bool](Get-Command -Name $Name -ErrorAction SilentlyContinue)
}

function Get-NodeMajorVersion {
  try {
    $raw = (node --version 2>$null).TrimStart('v')
    return [int]($raw -split '\.')[0]
  } catch {
    return 0
  }
}

function Install-NodeLts {
  Write-Step "Node.js not found or too old - attempting install."
  # Try MSI from shared folder first (works without winget)
  $sharedMsi = 'C:\vihs-shared\node-lts-x64.msi'
  if (Test-Path -LiteralPath $sharedMsi) {
    Write-Step "Installing Node.js from shared folder MSI: $sharedMsi"
    $proc = Start-Process msiexec.exe -ArgumentList "/i `"$sharedMsi`" /quiet /norestart ADDLOCAL=ALL" -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
      throw "Node.js MSI install failed (exit $($proc.ExitCode))."
    }
  } elseif (Test-CommandAvailable 'winget') {
    Write-Step "Installing Node.js via winget."
    winget install --id OpenJS.NodeJS.LTS --exact --accept-source-agreements --accept-package-agreements --silent
    if ($LASTEXITCODE -ne 0) {
      throw "winget Node.js install failed (exit $LASTEXITCODE)."
    }
  } else {
    throw "Cannot install Node.js: neither C:\vihs-shared\node-lts-x64.msi nor winget is available."
  }
  # Refresh PATH for this session
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
              [System.Environment]::GetEnvironmentVariable('Path', 'User')
  Write-Step "Node.js installed. Version: $(node --version)"
}

# ---------------------------------------------------------------------------
# 1. Git
# ---------------------------------------------------------------------------
Write-Step "Checking git..."
if (-not (Test-CommandAvailable 'git')) {
  throw "git is not available. The VM box must have git installed."
}
Write-Step "git: $(git --version)"

# ---------------------------------------------------------------------------
# 2. Node.js
# ---------------------------------------------------------------------------
Write-Step "Checking Node.js..."
$nodeMajor = Get-NodeMajorVersion
if ($nodeMajor -lt 18) {
  Install-NodeLts
  $nodeMajor = Get-NodeMajorVersion
}
if ($nodeMajor -lt 18) {
  throw "Node.js >= 18 is required. Found major version: $nodeMajor"
}
Write-Step "Node.js: $(node --version)"
Write-Step "npm:     $(npm --version)"

# ---------------------------------------------------------------------------
# 3. VS Code - code CLI
# ---------------------------------------------------------------------------
Write-Step "Checking VS Code CLI..."
$codeCmd = $null
foreach ($candidate in @(
  "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd",
  "$env:ProgramFiles\Microsoft VS Code\bin\code.cmd"
)) {
  if (Test-Path -LiteralPath $candidate) {
    $codeCmd = $candidate
    break
  }
}
if (-not $codeCmd) {
  # Fall back to whatever is on PATH
  $codeOnPath = Get-Command code -ErrorAction SilentlyContinue
  if ($codeOnPath) { $codeCmd = $codeOnPath.Source }
}
if (-not $codeCmd) {
  throw "VS Code CLI not found. Install Visual Studio Code in the VM before provisioning."
}
Write-Step "VS Code CLI: $codeCmd"
& $codeCmd --version
if ($LASTEXITCODE -ne 0) {
  throw "'code --version' failed (exit $LASTEXITCODE). Verify the VS Code install."
}

# ---------------------------------------------------------------------------
# 4. LabVIEW 2026
# ---------------------------------------------------------------------------
Write-Step "Checking LabVIEW 2026..."
# 32-bit LabVIEW installs under Program Files (x86)
$lvExe = 'C:\Program Files (x86)\National Instruments\LabVIEW 2026\LabVIEW.exe'
if (-not (Test-Path -LiteralPath $lvExe)) {
  throw "LabVIEW 2026 not found at expected path: $lvExe. The VM box must have LabVIEW installed."
}
Write-Step "LabVIEW 2026 present: $lvExe"

# CI launches LabVIEW through an interactive scheduled task because WinRM
# sessions run outside the desktop. Ensure disposable clones create that
# desktop session after the post-bootstrap reload.
Write-Step "Configuring vagrant autologon for interactive LabVIEW launch..."
$winlogonPath = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
$computerName = $env:COMPUTERNAME
Set-ItemProperty -LiteralPath $winlogonPath -Name 'AutoAdminLogon' -Value '1' -Type String
Set-ItemProperty -LiteralPath $winlogonPath -Name 'ForceAutoLogon' -Value '1' -Type String
Set-ItemProperty -LiteralPath $winlogonPath -Name 'DefaultUserName' -Value 'vagrant' -Type String
Set-ItemProperty -LiteralPath $winlogonPath -Name 'DefaultPassword' -Value 'Vagrant1234!' -Type String
Set-ItemProperty -LiteralPath $winlogonPath -Name 'DefaultDomainName' -Value $computerName -Type String
Write-Step "Autologon configured for $computerName\vagrant."

Write-Step "Configuring WinRM for Vagrant communicator after reload..."
sc.exe config winrm start= auto | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "Failed to configure WinRM service startup (exit $LASTEXITCODE)."
}
try {
  $publicProfiles = Get-NetConnectionProfile -ErrorAction Stop | Where-Object { $_.NetworkCategory -eq 'Public' }
  foreach ($profile in $publicProfiles) {
    Write-Step "Setting network profile '$($profile.Name)' to Private for WinRM firewall rules..."
    Set-NetConnectionProfile -InterfaceIndex $profile.InterfaceIndex -NetworkCategory Private -ErrorAction Stop
  }
} catch {
  Write-Step "Network profile normalization warning: $($_.Exception.Message)"
}
Start-Service -Name winrm -ErrorAction Stop
try {
  Test-WSMan -ComputerName localhost -ErrorAction Stop | Out-Null
} catch {
  throw "WinRM local probe failed after configuration: $($_.Exception.Message)"
}
winrm set winrm/config/service/auth '@{Basic="true"}' | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "Failed to enable WinRM Basic auth (exit $LASTEXITCODE)."
}
winrm set winrm/config/service '@{AllowUnencrypted="true"}' | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "Failed to allow unencrypted WinRM for local NAT communicator (exit $LASTEXITCODE)."
}
Write-Step "WinRM configured for Vagrant communicator."

# Enable LabVIEW VI Server TCP so LabVIEWCLI can connect
$lvIniPath = 'C:\Program Files (x86)\National Instruments\LabVIEW 2026\LabVIEW.ini'
if (Test-Path -LiteralPath $lvIniPath) {
  $iniContent = Get-Content -LiteralPath $lvIniPath -Raw -ErrorAction SilentlyContinue
  if ($iniContent -notmatch 'server\.tcp\.enabled') {
    Write-Step "Enabling LabVIEW VI Server TCP in LabVIEW.ini..."
    $viServerBlock = "server.tcp.enabled=TRUE`r`nserver.tcp.port=3363`r`nserver.app.propertiesEnabled=TRUE`r`n"
    if ($iniContent -match '\[LabVIEW\]') {
      $iniContent = $iniContent -replace '(\[LabVIEW\])', "`$1`r`n$viServerBlock"
    } else {
      $iniContent = "[LabVIEW]`r`n$viServerBlock`r`n$iniContent"
    }
    Set-Content -LiteralPath $lvIniPath -Value $iniContent -Encoding ASCII -NoNewline
    Write-Step "LabVIEW.ini updated."
  } else {
    Write-Step "LabVIEW VI Server TCP already configured."
  }
}

# ---------------------------------------------------------------------------
# 5. Shared folder mounts
# ---------------------------------------------------------------------------
Write-Step "Verifying shared folder mounts..."
foreach ($share in @('C:\vihs-workspace', 'C:\vihs-shared', 'C:\vihs-evidence')) {
  if (-not (Test-Path -LiteralPath $share)) {
    throw "Shared folder not mounted: $share. VirtualBox Guest Additions may be missing or the VM needs a restart."
  }
}
Write-Step "All shared folders accessible."

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
Write-Step "Bootstrap complete."
exit 0
