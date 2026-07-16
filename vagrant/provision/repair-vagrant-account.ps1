#Requires -Version 5.1
<#
.SYNOPSIS
  Interactive repair for a RESTRICTED `vagrant` guest account that blocks WinRM
  and VirtualBox guest-control logon on the vi-history-suite Windows Vagrant VM.

.DESCRIPTION
  Symptom this repairs (observed on the golden box):
    - `vagrant up` never completes the WinRM handshake ("Authentication failure.
      Retrying...") even though the desktop reaches the Windows 11 lock screen.
    - `vboxmanage guestcontrol <vm> --username vagrant --password ... run ...`
      fails with "The specified user account on the guest is RESTRICTED and can't
      be used to logon" (VBOX_E_IPRT_ERROR 0x80bb0005).

  Root cause is guest-side: the local `vagrant` account is disabled, has an
  expired/expiring password, is missing a network/local logon right, or is flagged
  "must change password at next logon". Because both WinRM and guest-control are
  blocked, this cannot be fixed from the host automation lane (chicken/egg); it
  MUST be run from an INTERACTIVE elevated PowerShell inside the VM console after
  logging in as `vagrant` (or any local administrator).

  This script is idempotent and only touches the local `vagrant` account plus the
  autologon values the Vagrant communicator relies on. It never contacts a domain
  and makes no network changes beyond enabling the WinRM listener firewall rule.

  Exit codes: 0 = success, 1 = fatal failure.

.PARAMETER UserName
  Local account to un-restrict. Defaults to `vagrant`.

.PARAMETER Password
  Password to (re)assert for the account so it matches the Vagrantfile
  communicator credentials. Defaults to `Vagrant1234!`.

.EXAMPLE
  # From an elevated PowerShell inside the VM:
  powershell -ExecutionPolicy Bypass -File C:\vihs-workspace\vagrant\provision\repair-vagrant-account.ps1
#>
[CmdletBinding()]
param(
  [string]$UserName = 'vagrant',
  [string]$Password = 'Vagrant1234!'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "[repair-vagrant-account] $Message"
}

function Test-IsElevated {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsElevated)) {
  throw "This script must run from an elevated (Run as administrator) PowerShell inside the VM console."
}

# ---------------------------------------------------------------------------
# 1. Ensure the local account exists and is enabled.
# ---------------------------------------------------------------------------
Write-Step "Ensuring local account '$UserName' exists and is enabled..."
$account = Get-LocalUser -Name $UserName -ErrorAction SilentlyContinue
if (-not $account) {
  Write-Step "Account '$UserName' not found - creating it."
  $securePassword = ConvertTo-SecureString -String $Password -AsPlainText -Force
  New-LocalUser -Name $UserName -Password $securePassword -FullName $UserName `
    -Description 'vi-history-suite Vagrant communicator account' -ErrorAction Stop | Out-Null
} else {
  # Re-assert the known password so it matches the Vagrantfile communicator creds.
  $securePassword = ConvertTo-SecureString -String $Password -AsPlainText -Force
  Set-LocalUser -Name $UserName -Password $securePassword -ErrorAction Stop
}

# `net user` is the most reliable surface for the logon-restriction flags.
Write-Step "Activating account and clearing logon restrictions via net user..."
net user $UserName /active:yes | Out-Host
if ($LASTEXITCODE -ne 0) { throw "net user /active:yes failed (exit $LASTEXITCODE)." }

# Remove any logon-hours restriction (a common 'RESTRICTED' cause on packaged boxes).
net user $UserName /time:all | Out-Host
if ($LASTEXITCODE -ne 0) { throw "net user /time:all failed (exit $LASTEXITCODE)." }

# ---------------------------------------------------------------------------
# 2. Stop the password from expiring and clear "must change at next logon".
# ---------------------------------------------------------------------------
Write-Step "Disabling password expiry and clearing 'must change password at next logon'..."
Set-LocalUser -Name $UserName -PasswordNeverExpires $true -ErrorAction Stop
# Clearing the change-required flag requires the WMI/CIM surface.
try {
  $cimUser = Get-CimInstance -ClassName Win32_UserAccount -Filter "Name='$UserName' AND LocalAccount=True" -ErrorAction Stop
  if ($cimUser -and $cimUser.PasswordExpires) {
    Set-CimInstance -InputObject $cimUser -Property @{ PasswordExpires = $false } -ErrorAction Stop
  }
} catch {
  Write-Step "PasswordExpires CIM adjustment warning: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
# 3. Ensure the account is a local administrator (bootstrap.ps1 runs privileged).
# ---------------------------------------------------------------------------
Write-Step "Ensuring '$UserName' is a member of the local Administrators group..."
$adminMember = Get-LocalGroupMember -Group 'Administrators' -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "*\$UserName" -or $_.Name -eq $UserName }
if (-not $adminMember) {
  Add-LocalGroupMember -Group 'Administrators' -Member $UserName -ErrorAction Stop
  Write-Step "Added '$UserName' to Administrators."
} else {
  Write-Step "'$UserName' already a local administrator."
}

# ---------------------------------------------------------------------------
# 4. Grant "Allow log on locally" and "Access this computer from the network".
#    Packaged boxes sometimes strip these rights, which reads as RESTRICTED.
# ---------------------------------------------------------------------------
Write-Step "Granting local and network logon rights via secedit..."
$sid = ([System.Security.Principal.NTAccount]("$env:COMPUTERNAME\$UserName")).Translate(
  [System.Security.Principal.SecurityIdentifier]
).Value

$tempDir = Join-Path -Path $env:TEMP -ChildPath ("vihs-secedit-" + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
$exportInf = Join-Path $tempDir 'export.inf'
$importInf = Join-Path $tempDir 'import.inf'
$secedb = Join-Path $tempDir 'secedit.sdb'
try {
  secedit /export /cfg "$exportInf" /quiet | Out-Null
  $lines = Get-Content -LiteralPath $exportInf

  function Merge-Right {
    param([string[]]$Lines, [string]$RightName, [string]$AddSid)
    $updated = $false
    for ($i = 0; $i -lt $Lines.Count; $i++) {
      if ($Lines[$i] -match "^$RightName\s*=") {
        if ($Lines[$i] -notmatch [regex]::Escape("*$AddSid")) {
          $Lines[$i] = $Lines[$i].TrimEnd() + ",*$AddSid"
        }
        $updated = $true
        break
      }
    }
    if (-not $updated) {
      # Append into the [Privilege Rights] section.
      $sectionIndex = ($Lines | Select-String -SimpleMatch '[Privilege Rights]' | Select-Object -First 1).LineNumber
      if ($sectionIndex) {
        $Lines = $Lines[0..($sectionIndex - 1)] + "$RightName = *$AddSid" + $Lines[$sectionIndex..($Lines.Count - 1)]
      }
    }
    return , $Lines
  }

  $lines = Merge-Right -Lines $lines -RightName 'SeInteractiveLogonRight' -AddSid $sid
  $lines = Merge-Right -Lines $lines -RightName 'SeNetworkLogonRight' -AddSid $sid

  $header = @(
    '[Unicode]',
    'Unicode=yes',
    '[Version]',
    'signature="$CHICAGO$"',
    'Revision=1'
  )
  $privilegeLines = $lines | Where-Object {
    $_ -match '^\[Privilege Rights\]' -or $_ -match '^Se\w+Right\s*='
  }
  Set-Content -LiteralPath $importInf -Value ($header + $privilegeLines) -Encoding Unicode

  secedit /import /db "$secedb" /cfg "$importInf" /quiet | Out-Null
  secedit /configure /db "$secedb" /areas USER_RIGHTS /quiet | Out-Null
  Write-Step "Logon rights granted for SID $sid."
} catch {
  Write-Step "secedit logon-rights warning: $($_.Exception.Message)"
} finally {
  Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# 5. Re-assert autologon so a disposable clone reaches an interactive desktop.
# ---------------------------------------------------------------------------
Write-Step "Re-asserting autologon for $env:COMPUTERNAME\$UserName..."
$winlogonPath = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
Set-ItemProperty -LiteralPath $winlogonPath -Name 'AutoAdminLogon' -Value '1' -Type String
Set-ItemProperty -LiteralPath $winlogonPath -Name 'ForceAutoLogon' -Value '1' -Type String
Set-ItemProperty -LiteralPath $winlogonPath -Name 'DefaultUserName' -Value $UserName -Type String
Set-ItemProperty -LiteralPath $winlogonPath -Name 'DefaultPassword' -Value $Password -Type String
Set-ItemProperty -LiteralPath $winlogonPath -Name 'DefaultDomainName' -Value $env:COMPUTERNAME -Type String

# ---------------------------------------------------------------------------
# 6. Ensure the WinRM listener is running so the next `vagrant up` handshake works.
# ---------------------------------------------------------------------------
Write-Step "Ensuring WinRM listener is enabled and running..."
sc.exe config winrm start= auto | Out-Host
Start-Service -Name winrm -ErrorAction SilentlyContinue
try {
  winrm quickconfig -quiet -force | Out-Host
} catch {
  Write-Step "winrm quickconfig warning: $($_.Exception.Message)"
}
winrm set winrm/config/service/auth '@{Basic="true"}' | Out-Host
winrm set winrm/config/service '@{AllowUnencrypted="true"}' | Out-Host

Write-Step "Repair complete. Re-run 'vagrant up' (or 'vagrant reload --provision') from the host."
Write-Step "If WinRM still fails, sign out and back in once so the cleared logon flags take effect."
exit 0
