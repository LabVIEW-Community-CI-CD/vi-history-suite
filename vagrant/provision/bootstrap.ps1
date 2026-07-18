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

function Set-RegistryDwordValue {
  param(
    [string]$Path,
    [string]$Name,
    [int]$Value
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -Path $Path -Force | Out-Null
  }

  New-ItemProperty -LiteralPath $Path -Name $Name -PropertyType DWord -Value $Value -Force | Out-Null
}

function Resolve-LocalUserSid {
  param([string]$UserName)

  foreach ($candidate in @("$env:COMPUTERNAME\$UserName", $UserName)) {
    try {
      return ([System.Security.Principal.NTAccount]$candidate).Translate(
        [System.Security.Principal.SecurityIdentifier]
      ).Value
    } catch {
      # Try the next candidate.
    }
  }

  return $null
}

function Set-VagrantUserDwordValue {
  param(
    [string]$RelativePath,
    [string]$Name,
    [int]$Value
  )

  Set-RegistryDwordValue -Path "HKCU:\$RelativePath" -Name $Name -Value $Value

  $vagrantSid = Resolve-LocalUserSid -UserName 'vagrant'
  if ($vagrantSid) {
    $hkuRoot = "Registry::HKEY_USERS\$vagrantSid"
    if (Test-Path -LiteralPath $hkuRoot) {
      Set-RegistryDwordValue -Path "$hkuRoot\$RelativePath" -Name $Name -Value $Value
    }
  }
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

# Local automation launches LabVIEW through an interactive scheduled task because WinRM
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

Write-Step "Suppressing Windows consumer backup and welcome prompts for local Vagrant desktop..."
$cloudContentPolicyPath = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent'
Set-RegistryDwordValue -Path $cloudContentPolicyPath -Name 'DisableWindowsConsumerFeatures' -Value 1
Set-RegistryDwordValue -Path $cloudContentPolicyPath -Name 'DisableCloudOptimizedContent' -Value 1
Set-RegistryDwordValue -Path $cloudContentPolicyPath -Name 'DisableConsumerAccountStateContent' -Value 1

$oobePolicyPath = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\OOBE'
Set-RegistryDwordValue -Path $oobePolicyPath -Name 'DisablePrivacyExperience' -Value 1

$oneDrivePolicyPath = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\OneDrive'
Set-RegistryDwordValue -Path $oneDrivePolicyPath -Name 'DisableFileSyncNGSC' -Value 1
Set-RegistryDwordValue -Path $oneDrivePolicyPath -Name 'DisableFileSync' -Value 1

$edgePolicyPath = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'
Set-RegistryDwordValue -Path $edgePolicyPath -Name 'HideFirstRunExperience' -Value 1
Set-RegistryDwordValue -Path $edgePolicyPath -Name 'BrowserSignin' -Value 0
Set-RegistryDwordValue -Path $edgePolicyPath -Name 'SyncDisabled' -Value 1
Set-RegistryDwordValue -Path $edgePolicyPath -Name 'NonRemovableProfileEnabled' -Value 0
Set-RegistryDwordValue -Path $edgePolicyPath -Name 'WebToBrowserSignInEnabled' -Value 0
Set-RegistryDwordValue -Path $edgePolicyPath -Name 'StartupBoostEnabled' -Value 0

$userCloudContentPolicyPath = 'Software\Policies\Microsoft\Windows\CloudContent'
Set-VagrantUserDwordValue -RelativePath $userCloudContentPolicyPath -Name 'DisableWindowsSpotlightFeatures' -Value 1
Set-VagrantUserDwordValue -RelativePath $userCloudContentPolicyPath -Name 'DisableWindowsSpotlightWindowsWelcomeExperience' -Value 1
Set-VagrantUserDwordValue -RelativePath $userCloudContentPolicyPath -Name 'DisableWindowsSpotlightOnActionCenter' -Value 1
Set-VagrantUserDwordValue -RelativePath $userCloudContentPolicyPath -Name 'DisableWindowsSpotlightOnSettings' -Value 1

$contentDeliveryPath = 'Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'
foreach ($contentDeliveryValue in @(
  'ContentDeliveryAllowed',
  'FeatureManagementEnabled',
  'OemPreInstalledAppsEnabled',
  'PreInstalledAppsEnabled',
  'PreInstalledAppsEverEnabled',
  'SilentInstalledAppsEnabled',
  'SoftLandingEnabled',
  'SubscribedContentEnabled',
  'SubscribedContent-310093Enabled',
  'SubscribedContent-338388Enabled',
  'SubscribedContent-338389Enabled',
  'SubscribedContent-338393Enabled',
  'SubscribedContent-353694Enabled',
  'SubscribedContent-353696Enabled',
  'SystemPaneSuggestionsEnabled'
)) {
  Set-VagrantUserDwordValue -RelativePath $contentDeliveryPath -Name $contentDeliveryValue -Value 0
}

$userProfileEngagementPath = 'Software\Microsoft\Windows\CurrentVersion\UserProfileEngagement'
Set-VagrantUserDwordValue -RelativePath $userProfileEngagementPath -Name 'ScoobeSystemSettingEnabled' -Value 0
Write-Step "Windows consumer backup and welcome prompts suppressed for vagrant desktop."

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

# ---------------------------------------------------------------------------
# 4b. Boot-time account self-heal (VHS-REQ-599 durability)
# ---------------------------------------------------------------------------
# A packaged box can ship with a `vagrant` account that Windows later flags as
# RESTRICTED (disabled, expired password, or a missing logon right), which makes
# `vagrant up` loop on WinRM "Authentication failure" at the lock screen. Because
# `vagrant package` does not reliably preserve the un-restricted state, install a
# SYSTEM startup scheduled task that re-applies repair-vagrant-account.ps1 before
# the WinRM handshake, so every clone self-heals without an interactive login.
Write-Step "Installing boot-time account self-heal scheduled task..."
$selfHealDir = 'C:\vagrant-selfheal'
if (-not (Test-Path -LiteralPath $selfHealDir)) {
  New-Item -ItemType Directory -Path $selfHealDir -Force | Out-Null
}
$repairSource = Join-Path $PSScriptRoot 'repair-vagrant-account.ps1'
$repairTarget = Join-Path $selfHealDir 'repair-vagrant-account.ps1'
# The provisioner uploads only bootstrap.ps1, so $PSScriptRoot may not contain the
# sibling repair script. Fall back to the mounted workspace synced folder, which is
# present during `vagrant up`/`vagrant provision`.
if (-not (Test-Path -LiteralPath $repairSource)) {
  $workspaceRepair = 'C:\vihs-workspace\vagrant\provision\repair-vagrant-account.ps1'
  if (Test-Path -LiteralPath $workspaceRepair) {
    $repairSource = $workspaceRepair
  }
}
if (Test-Path -LiteralPath $repairSource) {
  Copy-Item -LiteralPath $repairSource -Destination $repairTarget -Force
  Write-Step "Copied repair-vagrant-account.ps1 into $selfHealDir."
} else {
  Write-Step "WARNING: repair-vagrant-account.ps1 not found beside bootstrap; self-heal task will be skipped if the target is also absent."
}
if (Test-Path -LiteralPath $repairTarget) {
  $selfHealAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NonInteractive -ExecutionPolicy Bypass -File `"$repairTarget`""
  $selfHealTrigger = New-ScheduledTaskTrigger -AtStartup
  $selfHealPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $selfHealSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
  Register-ScheduledTask -TaskName 'VIHSVagrantSelfHeal' -Action $selfHealAction `
    -Trigger $selfHealTrigger -Principal $selfHealPrincipal -Settings $selfHealSettings -Force | Out-Null
  Write-Step "Boot-time self-heal task 'VIHSVagrantSelfHeal' registered."
} else {
  Write-Step "Self-heal task skipped: repair script not present in $selfHealDir."
}

# Enable LabVIEW VI Server TCP so LabVIEWCLI can connect and pre-authorize the
# listener. Without an explicit rule, Windows Defender can block behind an
# interactive prompt that local automation cannot answer.
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

$firewallRuleName = 'VIHS LabVIEW 2026 VI Server TCP 3363'
$existingFirewallRule = Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue
if ($existingFirewallRule) {
  Write-Step "LabVIEW VI Server firewall rule already configured."
  Set-NetFirewallRule -DisplayName $firewallRuleName -Enabled True -Action Allow -Profile Any -ErrorAction Stop
} else {
  Write-Step "Creating LabVIEW VI Server firewall rule for TCP 3363..."
  New-NetFirewallRule `
    -DisplayName $firewallRuleName `
    -Direction Inbound `
    -Action Allow `
    -Program $lvExe `
    -Protocol TCP `
    -LocalPort 3363 `
    -Profile Any | Out-Null
  Write-Step "LabVIEW VI Server firewall rule configured."
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
