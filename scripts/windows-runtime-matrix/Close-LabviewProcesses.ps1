<#
.SYNOPSIS
    Closes any running LabVIEW.exe processes whose ExecutablePath matches a
    bitness install root, so the runtime matrix harness can start a known
    LabVIEW bitness from a clean baseline.

.DESCRIPTION
    Path-based bitness filter modeled on the labview-icon-editor
    Close_LabVIEW.ps1 pattern but narrowed to this repository's harness:
      - x64 install root: C:\Program Files\National Instruments\LabVIEW <Year>\
      - x86 install root: C:\Program Files (x86)\National Instruments\LabVIEW <Year>\
    When -Bitness is x64 or x86, only matching processes are stopped. When
    -Bitness is 'any', every LabVIEW.exe is stopped. Stop-Process is invoked
    with -Force as a fallback after a graceful CloseMainWindow attempt.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('x64', 'x86', 'any')]
    [string]$Bitness,

    [Parameter(Mandatory = $true)]
    [string]$LabviewVersion,

    [int]$GracefulWaitSeconds = 5
)

$ErrorActionPreference = 'Stop'

function Get-InstallRoots {
    param(
        [string]$Version,
        [string]$Bitness
    )
    $x64Root = "C:\Program Files\National Instruments\LabVIEW $Version\"
    $x86Root = "C:\Program Files (x86)\National Instruments\LabVIEW $Version\"
    switch ($Bitness) {
        'x64' { return @($x64Root) }
        'x86' { return @($x86Root) }
        'any' { return @($x64Root, $x86Root) }
    }
}

$roots = Get-InstallRoots -Version $LabviewVersion -Bitness $Bitness
$processes = Get-CimInstance -ClassName Win32_Process -Filter "Name='LabVIEW.exe'" -ErrorAction SilentlyContinue

if (-not $processes) {
    Write-Output "Close-LabviewProcesses: no LabVIEW.exe processes observed (Bitness=$Bitness)"
    return
}

$matched = @()
foreach ($proc in $processes) {
    if (-not $proc.ExecutablePath) { continue }
    foreach ($root in $roots) {
        if ($proc.ExecutablePath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
            $matched += $proc
            break
        }
    }
}

if (-not $matched -or $matched.Count -eq 0) {
    Write-Output "Close-LabviewProcesses: no matching LabVIEW.exe processes (Bitness=$Bitness, Roots=$($roots -join ';'))"
    return
}

foreach ($proc in $matched) {
    Write-Output "Close-LabviewProcesses: stopping pid=$($proc.ProcessId) path=$($proc.ExecutablePath)"
    try {
        $live = Get-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue
        if ($live) {
            $live.CloseMainWindow() | Out-Null
            $live.WaitForExit($GracefulWaitSeconds * 1000) | Out-Null
        }
    }
    catch {
        Write-Output "Close-LabviewProcesses: graceful close failed for pid=$($proc.ProcessId): $($_.Exception.Message)"
    }

    try {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
    catch {
        Write-Output "Close-LabviewProcesses: Stop-Process -Force failed for pid=$($proc.ProcessId): $($_.Exception.Message)"
    }
}
