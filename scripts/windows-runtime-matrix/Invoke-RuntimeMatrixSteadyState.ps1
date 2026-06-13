<#
.SYNOPSIS
    Drives one Windows runtime-conflict scenario by starting a real LabVIEW at
    -HostVersion/-HostBitness, invoking `vihs --validate --proof-out` for the
    selected -LabviewVersion/-SelectedBitness, and asserting that the proof JSON
    carries -ExpectedBlockedReason. Covers the VHS-REQ-622 bitness-conflict
    directions (steady-*, same year / different bitness), the VHS-REQ-653
    version-conflict directions (version-*, same bitness / different year), and
    the VHS-REQ-623 non-default VI Server port admit direction (port-*, where
    -ExpectedBlockedReason is 'none' and -ExpectedHostTcpPort asserts the
    observed proof port; the selected install must be configured on that
    non-default server.tcp.port).

.DESCRIPTION
    Called by `scripts/runWindowsRuntimeMatrix.js`. Emits a per-scenario log
    file at -ScenarioLogPath with shape:
        {
          pass: bool,
          failureReason?: string,
          durationMs: int,
          observed: {
            runtimeBlockedReason, hostBitness, selectedBitness,
            labviewExecutablePath, labviewProcessId, hostLabviewTcpPort
          },
          spawn: { exitCode, stdoutTail, stderrTail },
          proofPath: string
        }
    Exit code is 0 when the scenario passes; non-zero when any step fails.
    Does not throw on assertion failure — surfaces the failure through the
    log file and exit code so the Node driver can aggregate results.

.NOTES
    Cleanup: when -KeepRunning is not set, LabVIEW is closed before AND
    after the scenario so consecutive scenarios start from a clean
    baseline.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ScenarioId,

    [Parameter(Mandatory = $true)]
    [ValidateSet('x64', 'x86')]
    [string]$HostBitness,

    [Parameter(Mandatory = $true)]
    [ValidateSet('x64', 'x86')]
    [string]$SelectedBitness,

    [Parameter(Mandatory = $true)]
    [string]$LabviewVersion,

    [string]$HostVersion,

    [string]$ExpectedBlockedReason = 'windows-host-bitness-conflict',

    [int]$ExpectedHostTcpPort = 0,

    [Parameter(Mandatory = $true)]
    [string]$ProofOutPath,

    [Parameter(Mandatory = $true)]
    [string]$ScenarioLogPath,

    [int]$LabviewStartupTimeoutSeconds = 60,

    [int]$VihsTimeoutSeconds = 120,

    [switch]$KeepRunning
)

$ErrorActionPreference = 'Stop'

# The selected LabVIEW version drives the scoped settings; the host version is
# the LabVIEW that is actually launched. They match for bitness scenarios and
# differ for version scenarios (VHS-REQ-653).
if (-not $HostVersion) {
    $HostVersion = $LabviewVersion
}

function Get-LabviewExecutablePath {
    param(
        [string]$Bitness,
        [string]$Version
    )
    if ($Bitness -eq 'x64') {
        return "C:\Program Files\National Instruments\LabVIEW $Version\LabVIEW.exe"
    }
    return "C:\Program Files (x86)\National Instruments\LabVIEW $Version\LabVIEW.exe"
}

function Get-LabviewInstallRoot {
    param(
        [string]$Bitness,
        [string]$Version
    )
    if ($Bitness -eq 'x64') {
        return "C:\Program Files\National Instruments\LabVIEW $Version\"
    }
    return "C:\Program Files (x86)\National Instruments\LabVIEW $Version\"
}

function Get-StringTail {
    param(
        [string]$Value,
        [int]$MaxLength = 4000
    )
    if ([string]::IsNullOrEmpty($Value)) { return '' }
    if ($Value.Length -le $MaxLength) { return $Value }
    return $Value.Substring($Value.Length - $MaxLength)
}

function Write-ScenarioLog {
    param(
        [hashtable]$Payload,
        [string]$Path
    )
    $directory = Split-Path -Parent $Path
    if ($directory -and -not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }
    ($Payload | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Resolve-VihsInvocation {
    param([string]$RepoRoot)
    $candidate = Get-Command 'vihs.cmd' -ErrorAction SilentlyContinue
    if ($candidate) {
        return @{ FilePath = $candidate.Source; PrefixArgs = @() }
    }
    $candidate = Get-Command 'vihs' -ErrorAction SilentlyContinue
    if ($candidate) {
        return @{ FilePath = $candidate.Source; PrefixArgs = @() }
    }
    $compiled = Join-Path $RepoRoot 'out\tooling\localRuntimeSettingsCli.js'
    if (Test-Path -LiteralPath $compiled) {
        return @{ FilePath = 'node'; PrefixArgs = @($compiled) }
    }
    throw "vihs CLI not on PATH and compiled module $compiled not found; run 'npm run compile' first."
}

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Definition
$closeScript = Join-Path $scriptDirectory 'Close-LabviewProcesses.ps1'

$payload = @{
    scenarioId    = $ScenarioId
    pass          = $false
    failureReason = $null
    durationMs    = 0
    observed      = @{
        runtimeBlockedReason     = $null
        hostBitness              = $null
        selectedBitness          = $SelectedBitness
        hostVersion              = $HostVersion
        selectedVersion          = $LabviewVersion
        labviewExecutablePath    = $null
        labviewProcessId         = $null
        hostLabviewTcpPort       = $null
    }
    spawn         = @{
        exitCode   = $null
        stdoutTail = $null
        stderrTail = $null
    }
    proofPath     = $ProofOutPath
}

try {
    Write-Output "[$ScenarioId] closing any pre-existing LabVIEW.exe"
    & $closeScript -Bitness 'any' -LabviewVersion $LabviewVersion | Out-Null
    if ($HostVersion -ne $LabviewVersion) {
        & $closeScript -Bitness 'any' -LabviewVersion $HostVersion | Out-Null
    }

    $labviewExe = Get-LabviewExecutablePath -Bitness $HostBitness -Version $HostVersion
    $labviewRoot = Get-LabviewInstallRoot -Bitness $HostBitness -Version $HostVersion
    if (-not (Test-Path -LiteralPath $labviewExe)) {
        throw "LabVIEW $HostVersion $HostBitness not found at $labviewExe"
    }

    Write-Output "[$ScenarioId] starting LabVIEW $HostVersion $HostBitness at $labviewExe"
    $labviewProcess = Start-Process -FilePath $labviewExe -PassThru
    $payload.observed.labviewProcessId = $labviewProcess.Id

    # Wait for the CIM record to show our exact path (i.e., the OS has
    # registered the process), bounded by -LabviewStartupTimeoutSeconds.
    $deadline = (Get-Date).AddSeconds($LabviewStartupTimeoutSeconds)
    $observed = $null
    while ((Get-Date) -lt $deadline) {
        $candidates = Get-CimInstance -ClassName Win32_Process -Filter "Name='LabVIEW.exe'" -ErrorAction SilentlyContinue
        if ($candidates) {
            foreach ($candidate in $candidates) {
                if ($candidate.ExecutablePath -and `
                    $candidate.ExecutablePath.StartsWith($labviewRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                    $observed = $candidate
                    break
                }
            }
        }
        if ($observed) { break }
        Start-Sleep -Milliseconds 500
    }

    if (-not $observed) {
        throw "LabVIEW $HostBitness did not appear under $labviewRoot within $LabviewStartupTimeoutSeconds s"
    }
    $payload.observed.labviewExecutablePath = $observed.ExecutablePath
    $payload.observed.hostBitness = $HostBitness

    # Materialize a scoped settings.json so this run does not depend on the
    # operator's persisted VS Code settings.
    $proofDir = Split-Path -Parent $ProofOutPath
    if (-not (Test-Path -LiteralPath $proofDir)) {
        New-Item -ItemType Directory -Force -Path $proofDir | Out-Null
    }
    $scopedSettingsPath = Join-Path $proofDir "$ScenarioId.settings.json"
    $scopedSettings = @{
        'viHistorySuite.runtimeProvider' = 'host'
        'viHistorySuite.labviewVersion'  = $LabviewVersion
        'viHistorySuite.labviewBitness'  = $SelectedBitness
    }
    ($scopedSettings | ConvertTo-Json -Depth 4) | Set-Content -LiteralPath $scopedSettingsPath -Encoding UTF8

    Write-Output "[$ScenarioId] invoking vihs --validate (selected=$LabviewVersion $SelectedBitness)"
    $repoRoot = Resolve-Path (Join-Path $scriptDirectory '..\..')
    $vihsInvocation = Resolve-VihsInvocation -RepoRoot $repoRoot.Path
    $vihsArgs = @(
        $vihsInvocation.PrefixArgs +
        @(
            '--validate',
            '--settings-file', $scopedSettingsPath,
            '--proof-out', (Split-Path -Parent $ProofOutPath)
        )
    )

    $stdoutFile = Join-Path $proofDir "$ScenarioId.vihs.stdout.log"
    $stderrFile = Join-Path $proofDir "$ScenarioId.vihs.stderr.log"
    $vihsProcess = Start-Process -FilePath $vihsInvocation.FilePath -ArgumentList $vihsArgs `
        -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile `
        -PassThru -NoNewWindow
    $vihsExited = $vihsProcess.WaitForExit($VihsTimeoutSeconds * 1000)
    if (-not $vihsExited) {
        try { Stop-Process -Id $vihsProcess.Id -Force -ErrorAction SilentlyContinue } catch {}
        throw "vihs --validate did not complete within $VihsTimeoutSeconds s"
    }
    $payload.spawn.exitCode   = $vihsProcess.ExitCode
    $payload.spawn.stdoutTail = Get-StringTail (Get-Content -LiteralPath $stdoutFile -Raw -ErrorAction SilentlyContinue)
    $payload.spawn.stderrTail = Get-StringTail (Get-Content -LiteralPath $stderrFile -Raw -ErrorAction SilentlyContinue)

    # vihs --proof-out points to a directory; it writes JSON files inside.
    # Find the most recent proof file and copy/move it to $ProofOutPath so the
    # Node driver's evidence aggregator can find it by a stable path.
    $latestProof = Get-ChildItem -LiteralPath (Split-Path -Parent $ProofOutPath) -Filter '*.json' `
        -File -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -ne $ProofOutPath } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $latestProof) {
        throw "vihs --validate did not produce a proof JSON in $(Split-Path -Parent $ProofOutPath)"
    }
    Copy-Item -LiteralPath $latestProof.FullName -Destination $ProofOutPath -Force

    $proofJson = Get-Content -LiteralPath $ProofOutPath -Raw | ConvertFrom-Json
    # The runtime-validation-proof@v1 schema nests the blocked reason under
    # `runtime.blockedReason`; the flat `runtimeBlockedReason` token only exists
    # in the CLI stdout, not in the proof JSON. VHS-REQ-623: the observed host
    # VI Server port is nested under `runtime.hostLabviewTcpPort`.
    $blockedReason = $null
    $hostTcpPort = $null
    if ($proofJson.PSObject.Properties.Match('runtime').Count -gt 0 -and
        $null -ne $proofJson.runtime) {
        if ($proofJson.runtime.PSObject.Properties.Match('blockedReason').Count -gt 0) {
            $blockedReason = $proofJson.runtime.blockedReason
        }
        if ($proofJson.runtime.PSObject.Properties.Match('hostLabviewTcpPort').Count -gt 0) {
            $hostTcpPort = $proofJson.runtime.hostLabviewTcpPort
        }
    }

    # The admit/success direction (-ExpectedBlockedReason 'none') expects no
    # block; normalize a null/empty proof blockedReason to the 'none' token the
    # Node driver asserts against.
    $observedBlockedReason =
        if ($null -eq $blockedReason -or $blockedReason -eq '') { 'none' } else { $blockedReason }
    $expectedBlockedReasonNormalized =
        if ([string]::IsNullOrEmpty($ExpectedBlockedReason)) { 'none' } else { $ExpectedBlockedReason }
    $payload.observed.runtimeBlockedReason = $observedBlockedReason
    $payload.observed.hostLabviewTcpPort = $hostTcpPort

    $failures = @()
    if ($observedBlockedReason -ne $expectedBlockedReasonNormalized) {
        $failures += "expected runtimeBlockedReason='$expectedBlockedReasonNormalized', observed='$observedBlockedReason'"
    }
    # VHS-REQ-623: when an expected non-default VI Server port is supplied, the
    # observed proof port must match it (the port-admit scenario).
    if ($ExpectedHostTcpPort -gt 0 -and [int]$hostTcpPort -ne $ExpectedHostTcpPort) {
        $failures += "expected hostLabviewTcpPort=$ExpectedHostTcpPort, observed='$hostTcpPort'"
    }

    if ($failures.Count -gt 0) {
        $payload.failureReason = ($failures -join '; ')
    }
    else {
        $payload.pass = $true
    }
}
catch {
    $payload.failureReason = $_.Exception.Message
}
finally {
    if (-not $KeepRunning) {
        try { & $closeScript -Bitness 'any' -LabviewVersion $LabviewVersion | Out-Null } catch {}
        if ($HostVersion -ne $LabviewVersion) {
            try { & $closeScript -Bitness 'any' -LabviewVersion $HostVersion | Out-Null } catch {}
        }
    }
    $stopwatch.Stop()
    $payload.durationMs = [int]$stopwatch.ElapsedMilliseconds
    Write-ScenarioLog -Payload $payload -Path $ScenarioLogPath
}

if (-not $payload.pass) {
    exit 1
}
exit 0
