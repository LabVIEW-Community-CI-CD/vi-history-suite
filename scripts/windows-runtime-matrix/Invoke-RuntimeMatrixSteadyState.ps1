<#
.SYNOPSIS
    Drives one Windows runtime-conflict scenario by starting a real LabVIEW at
    -HostVersion/-HostBitness, invoking `vihs --validate --proof-out` for the
    selected -LabviewVersion/-SelectedBitness, and asserting that the proof JSON
    carries -ExpectedBlockedReason. Covers the VHS-REQ-622 bitness-conflict
    directions (steady-*, same year / different bitness), the VHS-REQ-653
    version-conflict directions (version-*, same bitness / different year), the
    VHS-REQ-623 VI Server port admit direction (port-*, where
    -ExpectedBlockedReason is 'none' and -DerivePortFromSelectedIni asserts the
    observed proof port equals the VI Server port read from the SELECTED
    install's own LabVIEW.ini, and that the product read that exact ini -- never
    a hardcoded or operator-supplied constant; -PortMode 'non-default' arranges a
    non-default port in that ini before launch and fails the scenario if it does
    not resolve to a non-default port), and the VHS-REQ-713 match direction
    (match-*, Host == Selected, -ExpectedBlockedReason 'none' and -PortMode
    'default' arranging the default port and asserting the observed proof port is
    the documented Windows default). Because match-* and port-* for the same
    year/bitness share one install's ini, -PortMode backs up that ini, writes the
    requested mode before launch, and restores the original ini in the finally
    block so both directions are satisfiable without leaving operator config
    changed. The scenario id/family is opaque to this
    helper: it launches -HostVersion/-HostBitness, selects
    -LabviewVersion/-SelectedBitness, and asserts -ExpectedBlockedReason, so the
    Node driver's manifest (bitness/version/match/port) drives every cell of the
    2020/2025/2026 x86/x64 grid through the same helper.

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

    [switch]$DerivePortFromSelectedIni,

    [ValidateSet('default', 'non-default')]
    [string]$PortMode,

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

# VHS-REQ-623: the documented Windows VI Server default when server.tcp.port is
# absent from LabVIEW.ini (mirrors DEFAULT_WINDOWS_LABVIEW_TCP_PORT in the
# product's comparisonReportRuntimeExecution.ts).
$DefaultWindowsLabviewTcpPort = 3363

function Get-LabviewIniViServerPort {
    # Mirror the product's LabVIEW.ini VI Server parse semantics
    # (resolveWindowsLabviewTcpSettingsForLabviewPath): quoted or unquoted,
    # case-insensitive, line-anchored; an absent server.tcp.port means the
    # documented Windows default. Deriving the expected port from the SELECTED
    # install's own ini (which #2337 arranges per scenario, then restores) proves
    # the product read that exact ini and plumbed its configured port through,
    # rather than trusting a hardcoded or operator-supplied constant.
    param(
        [string]$IniPath
    )
    $facts = @{
        iniReadable             = $false
        serverTcpPortConfigured = $false
        serverTcpEnabled        = 'unknown'
        port                    = $DefaultWindowsLabviewTcpPort
    }
    if ([string]::IsNullOrWhiteSpace($IniPath) -or -not (Test-Path -LiteralPath $IniPath)) {
        return $facts
    }
    try {
        $iniText = Get-Content -LiteralPath $IniPath -Raw -ErrorAction Stop
    }
    catch {
        return $facts
    }
    $facts.iniReadable = $true
    # Windows LabVIEW defaults VI Server TCP on when the key is absent.
    $facts.serverTcpEnabled = $true
    $enabledMatch = [regex]::Match($iniText, '(?im)^\s*server\.tcp\.enabled\s*=\s*"?(true|false)"?\s*$')
    if ($enabledMatch.Success) {
        $facts.serverTcpEnabled = ($enabledMatch.Groups[1].Value.ToLowerInvariant() -eq 'true')
    }
    $portMatch = [regex]::Match($iniText, '(?im)^\s*server\.tcp\.port\s*=\s*"?(\d+)"?\s*$')
    if ($portMatch.Success) {
        $facts.serverTcpPortConfigured = $true
        $facts.port = [int]$portMatch.Groups[1].Value
    }
    return $facts
}

# #2337: the admit families assert OPPOSITE port modes on the SAME install
# (match-* wants the documented default port, port-* wants a non-default one),
# which is only satisfiable if the harness ARRANGES the requested mode per
# scenario. Before launch we back up the selected install's LabVIEW.ini, write
# (or clear) server.tcp.port to realize the requested mode, and restore the
# original ini in the finally block so the operator's configuration is untouched.
# A fixed non-default port keeps the run deterministic.
$NonDefaultRuntimeMatrixTcpPort = 3364

function Set-LabviewIniServerTcpPort {
    # Section-aware: server.tcp.port belongs under [LabVIEW]. Remove any existing
    # server.tcp.port line, then (unless -RemovePort) insert the key right after
    # the [LabVIEW] header (creating the section if absent).
    param(
        [string]$IniPath,
        [int]$Port,
        [switch]$RemovePort
    )
    $iniExists = Test-Path -LiteralPath $IniPath
    $lines = @()
    if ($iniExists) {
        $lines = @(Get-Content -LiteralPath $IniPath)
    }
    $withoutPort = @($lines | Where-Object { $_ -notmatch '(?i)^\s*server\.tcp\.port\s*=' })
    if ($RemovePort) {
        # If the ini is absent, the documented default port already applies --
        # leave it absent rather than launching LabVIEW with a harness-created
        # empty ini that could change behavior beyond clearing server.tcp.port.
        if (-not $iniExists) {
            return
        }
        Set-Content -LiteralPath $IniPath -Value $withoutPort -Encoding ASCII
        return
    }
    $portLine = "server.tcp.port=$Port"
    $headerIndex = -1
    for ($i = 0; $i -lt $withoutPort.Count; $i++) {
        if ($withoutPort[$i] -match '(?i)^\s*\[LabVIEW\]\s*$') { $headerIndex = $i; break }
    }
    if ($headerIndex -ge 0) {
        $result = @()
        $result += $withoutPort[0..$headerIndex]
        $result += $portLine
        if ($headerIndex + 1 -lt $withoutPort.Count) {
            $result += $withoutPort[($headerIndex + 1)..($withoutPort.Count - 1)]
        }
    }
    else {
        $result = @('[LabVIEW]', $portLine) + $withoutPort
    }
    Set-Content -LiteralPath $IniPath -Value $result -Encoding ASCII
}

function Test-WindowsPathsEqual {
    param(
        [string]$First,
        [string]$Second
    )
    if ([string]::IsNullOrWhiteSpace($First) -or [string]::IsNullOrWhiteSpace($Second)) {
        return $false
    }
    $normalize = {
        param($value)
        $value.Trim().Replace('/', '\').TrimEnd('\').ToLowerInvariant()
    }
    return ((& $normalize $First) -eq (& $normalize $Second))
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

# #2337: per-scenario port-mode arrangement state (see Set-LabviewIniServerTcpPort).
# The selected install's ini is the one the launched LabVIEW reads (host==selected
# for the match/port families) and the one Get-LabviewIniViServerPort derives from.
$selectedExeForIni = Get-LabviewExecutablePath -Bitness $SelectedBitness -Version $LabviewVersion
$portModeIniPath = Join-Path (Split-Path -Parent $selectedExeForIni) 'LabVIEW.ini'
$portModeIniBackup = $null

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
        hostLabviewIniPath       = $null
    }
    portOracle    = $null
    portMode      = $PortMode
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

    # #2337: arrange the requested port mode in the selected install's ini before
    # launch so LabVIEW starts on the correct VI Server port; the original ini is
    # restored in the finally block. '<absent>' records that the file did not
    # exist so restore deletes the harness-created ini.
    if ($PortMode) {
        if (Test-Path -LiteralPath $portModeIniPath) {
            $portModeIniBackup = "$portModeIniPath.vihs-matrix-backup"
            Copy-Item -LiteralPath $portModeIniPath -Destination $portModeIniBackup -Force
        }
        else {
            $portModeIniBackup = '<absent>'
        }
        if ($PortMode -eq 'non-default') {
            Set-LabviewIniServerTcpPort -IniPath $portModeIniPath -Port $NonDefaultRuntimeMatrixTcpPort
        }
        else {
            Set-LabviewIniServerTcpPort -IniPath $portModeIniPath -RemovePort
        }
        Write-Output "[$ScenarioId] arranged '$PortMode' VI Server port in $portModeIniPath"
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
    $hostIniPath = $null
    if ($proofJson.PSObject.Properties.Match('runtime').Count -gt 0 -and
        $null -ne $proofJson.runtime) {
        if ($proofJson.runtime.PSObject.Properties.Match('blockedReason').Count -gt 0) {
            $blockedReason = $proofJson.runtime.blockedReason
        }
        if ($proofJson.runtime.PSObject.Properties.Match('hostLabviewTcpPort').Count -gt 0) {
            $hostTcpPort = $proofJson.runtime.hostLabviewTcpPort
        }
        if ($proofJson.runtime.PSObject.Properties.Match('hostLabviewIniPath').Count -gt 0) {
            $hostIniPath = $proofJson.runtime.hostLabviewIniPath
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
    $payload.observed.hostLabviewIniPath = $hostIniPath

    $failures = @()
    if ($observedBlockedReason -ne $expectedBlockedReasonNormalized) {
        $failures += "expected runtimeBlockedReason='$expectedBlockedReasonNormalized', observed='$observedBlockedReason'"
    }
    # VHS-REQ-623: the port-admit scenario derives its expected VI Server port
    # from the SELECTED install's own LabVIEW.ini (the same source of truth the
    # product reads) instead of a hardcoded or operator-supplied constant, then
    # proves the product (a) read that exact selected ini and (b) plumbed its
    # configured port through to the validation proof. This stays correct no
    # matter what port the operator configures, or which install they select.
    if ($DerivePortFromSelectedIni) {
        $selectedExe = Get-LabviewExecutablePath -Bitness $SelectedBitness -Version $LabviewVersion
        $selectedIni = Join-Path (Split-Path -Parent $selectedExe) 'LabVIEW.ini'
        $iniFacts = Get-LabviewIniViServerPort -IniPath $selectedIni
        $derivedExpectedPort = [int]$iniFacts.port
        $iniPathMatches = Test-WindowsPathsEqual -First $hostIniPath -Second $selectedIni
        $portMatches = ($null -ne $hostTcpPort -and [int]$hostTcpPort -eq $derivedExpectedPort)
        $payload.portOracle = @{
            selectedLabviewIniPath  = $selectedIni
            derivedExpectedTcpPort  = $derivedExpectedPort
            serverTcpPortConfigured = [bool]$iniFacts.serverTcpPortConfigured
            serverTcpEnabled        = $iniFacts.serverTcpEnabled
            isNonDefaultPort        = ($derivedExpectedPort -ne $DefaultWindowsLabviewTcpPort)
            iniReadable             = [bool]$iniFacts.iniReadable
            observedLabviewIniPath  = $hostIniPath
            observedTcpPort         = $hostTcpPort
            iniPathMatches          = [bool]$iniPathMatches
            portMatches             = [bool]$portMatches
        }
        if (-not $iniPathMatches) {
            $failures += "expected hostLabviewIniPath='$selectedIni', observed='$hostIniPath'"
        }
        if (-not $portMatches) {
            $failures += "expected hostLabviewTcpPort=$derivedExpectedPort (derived from $selectedIni), observed='$hostTcpPort'"
        }
        # #2337: the non-default admit family must provably exercise a non-default
        # port; fail if the selected install resolves to the documented default.
        if ($PortMode -eq 'non-default' -and $derivedExpectedPort -eq $DefaultWindowsLabviewTcpPort) {
            $failures += "port family requires a NON-DEFAULT VI Server port, but the selected ini ($selectedIni) resolves to the default $DefaultWindowsLabviewTcpPort"
        }
    }

    # #2337: the default admit family (match-*) must provably run on the
    # documented Windows default VI Server port; it does not derive from the ini
    # (there is nothing to override), it asserts the observed proof port directly.
    if ($PortMode -eq 'default') {
        if ($null -eq $hostTcpPort -or [int]$hostTcpPort -ne $DefaultWindowsLabviewTcpPort) {
            $failures += "match family requires the DEFAULT VI Server port $DefaultWindowsLabviewTcpPort, observed hostLabviewTcpPort='$hostTcpPort'"
        }
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
    # #2337: restore the operator's original ini regardless of outcome.
    if ($PortMode -and $portModeIniPath) {
        try {
            if ($portModeIniBackup -eq '<absent>') {
                if (Test-Path -LiteralPath $portModeIniPath) {
                    Remove-Item -LiteralPath $portModeIniPath -Force
                }
            }
            elseif ($portModeIniBackup -and (Test-Path -LiteralPath $portModeIniBackup)) {
                Copy-Item -LiteralPath $portModeIniBackup -Destination $portModeIniPath -Force
                Remove-Item -LiteralPath $portModeIniBackup -Force
            }
        }
        catch {
            # A silent swallow here could leave the operator's LabVIEW.ini modified
            # with no signal (risky on a hardening host). Surface it on the console
            # AND in the retained scenario log (backup path + scenario id) so a
            # partial restore is visible in CI artifacts and the operator can
            # recover the ini from the .vihs-matrix-backup copy.
            $restoreWarning =
                "[$ScenarioId] FAILED to restore $portModeIniPath after -PortMode '$PortMode'; " +
                "backup retained at '$portModeIniBackup': $($_.Exception.Message)"
            Write-Warning $restoreWarning
            $payload.iniRestoreWarning = $restoreWarning
        }
    }
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
