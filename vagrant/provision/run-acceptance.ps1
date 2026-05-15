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
  [int]   $ViServerTimeoutSec = 60,
  [int]   $RuntimeTimeoutMs = 300000,
  [int]   $GitTimeoutMs = 300000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$WorkspaceRoot = 'C:\vihs-workspace'
$SharedRoot    = 'C:\vihs-shared'
$EvidenceRoot  = 'C:\vihs-evidence'
$LabVIEWStartupEvidencePath = Join-Path $EvidenceRoot 'labview-startup.json'
$LabVIEWActivationDialogEvidencePath = Join-Path $EvidenceRoot 'labview-activation-dialog.json'
$LabVIEWTimeoutScreenshotPath = Join-Path $EvidenceRoot 'labview-timeout-desktop.png'
$LabVIEWTimeoutScreenshotScriptPath = Join-Path $EvidenceRoot 'capture-labview-timeout-desktop.ps1'
$script:LastActivationDialogRescueAttempt = [datetime]::MinValue
$script:ActivationDialogRescueAttemptCount = 0
$desktopInterloperProcessNames = @(
  'msedge',
  'msedgewebview2',
  'MicrosoftEdgeUpdate',
  'OneDrive',
  'UserOOBEBroker',
  'SystemSettings'
)

function Write-Step([string]$Message) {
  $ts = (Get-Date -Format 'HH:mm:ss')
  Write-Host "[$ts acceptance] $Message"
}

function Set-QuietNpmEnvironment {
  $env:NO_UPDATE_NOTIFIER = '1'
  $env:NPM_CONFIG_UPDATE_NOTIFIER = 'false'
  $env:NPM_CONFIG_AUDIT = 'false'
  $env:NPM_CONFIG_FUND = 'false'
  $env:NPM_CONFIG_LOGLEVEL = 'error'
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
$LabVIEWIniPath = Join-Path (Split-Path -Parent $lvExe) 'LabVIEW.ini'

function Test-LabVIEWPortListening {
  return [bool](netstat -an 2>$null | Select-String ':3363.*LISTENING')
}

function Stop-DesktopInterloperProcesses {
  param([string]$Reason = 'before LabVIEW launch')

  foreach ($processName in $desktopInterloperProcessNames) {
    $processes = @(Get-Process -Name $processName -ErrorAction SilentlyContinue)
    if ($processes.Count -eq 0) {
      continue
    }

    foreach ($process in $processes) {
      Write-Step "Closing first-run desktop interloper $($process.ProcessName) pid=$($process.Id) $Reason."
      try {
        Stop-Process -Id $process.Id -Force -ErrorAction Stop
      } catch {
        Write-Step "Stop-Process failed for desktop interloper pid=$($process.Id): $($_.Exception.Message)"
      }

      try {
        & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
      } catch {
        Write-Step "taskkill by pid failed for desktop interloper pid=$($process.Id): $($_.Exception.Message)"
      }
    }

    try {
      & taskkill.exe /IM "$processName.exe" /T /F 2>$null | Out-Null
    } catch {
      Write-Step "taskkill by image found no remaining $processName.exe desktop interlopers."
    }
  }
}

function Get-LabVIEWProcessSnapshot {
  return @(Get-Process -Name LabVIEW -ErrorAction SilentlyContinue | ForEach-Object {
    [ordered]@{
      processName     = $_.ProcessName
      id              = $_.Id
      sessionId       = $_.SessionId
      path            = try { $_.Path } catch { $null };
      mainWindowTitle = $_.MainWindowTitle
      responding      = try { $_.Responding } catch { $null };
      startTime       = try { $_.StartTime.ToString('o') } catch { $null }
    }
  })
}

function Get-ExplorerSessionSnapshot {
  return @(Get-Process -Name explorer -ErrorAction SilentlyContinue | ForEach-Object {
    [ordered]@{
      processName = $_.ProcessName
      id          = $_.Id
      sessionId   = $_.SessionId
    }
  })
}

function Format-UnsignedHex32 {
  param($Value)

  if ($null -eq $Value) {
    return $null
  }

  try {
    return ('0x{0:X8}' -f ([uint32]$Value))
  } catch {
    return [string]$Value
  }
}

function Limit-EvidenceText {
  param(
    [AllowNull()][string]$Text,
    [int]$MaxLength = 1000
  )

  if ($null -eq $Text) {
    return $null
  }

  $normalized = $Text -replace '\s+', ' '
  if ($normalized.Length -le $MaxLength) {
    return $normalized
  }

  return "$($normalized.Substring(0, $MaxLength))..."
}

function Get-EventMessageText {
  param($Event)

  try {
    return [string]$Event.Message
  } catch {
    return ''
  }
}

function Get-InteractiveWindowSnapshot {
  try {
    return @(Get-Process -ErrorAction SilentlyContinue |
      Where-Object { $_.SessionId -ne 0 -and -not [string]::IsNullOrWhiteSpace($_.MainWindowTitle) } |
      Sort-Object ProcessName, Id |
      Select-Object -First 50 |
      ForEach-Object {
        [ordered]@{
          processName     = $_.ProcessName
          id              = $_.Id
          sessionId       = $_.SessionId
          mainWindowTitle = $_.MainWindowTitle
          responding      = try { $_.Responding } catch { $null };
          path            = try { $_.Path } catch { $null }
        }
      })
  } catch {
    return @([ordered]@{ error = $_.Exception.Message })
  }
}

function Get-RecentLabVIEWEventSnapshot {
  $events = New-Object System.Collections.Generic.List[object]
  $since = (Get-Date).AddMinutes(-20)
  $matchPattern = 'LabVIEW|National Instruments|VI Server|Application Error|Windows Error Reporting|TaskScheduler|Task Scheduler|SideBySide|\.NET Runtime'
  foreach ($logName in @('Application', 'System', 'Microsoft-Windows-TaskScheduler/Operational')) {
    try {
      $matchingEvents = @(Get-WinEvent -FilterHashtable @{ LogName = $logName; StartTime = $since } -MaxEvents 80 -ErrorAction Stop |
        Where-Object {
          $eventMessage = Get-EventMessageText -Event $_
          ($_.ProviderName -match $matchPattern) -or
          ($eventMessage -match $matchPattern)
        } |
        Select-Object -First 15)

      foreach ($event in $matchingEvents) {
        $events.Add([ordered]@{
          logName      = $logName
          providerName = $event.ProviderName
          id           = $event.Id
          levelDisplay = $event.LevelDisplayName
          timeCreated  = if ($event.TimeCreated) { $event.TimeCreated.ToString('o') } else { $null };
          message      = Limit-EvidenceText -Text (Get-EventMessageText -Event $event) -MaxLength 900
        }) | Out-Null
      }
    } catch {
      $events.Add([ordered]@{
        logName = $logName
        error   = $_.Exception.Message
      }) | Out-Null
    }
  }

  return @($events | Select-Object -First 30)
}

function Save-LabVIEWTimeoutDesktopScreenshot {
  $taskName = 'vihs-lv-timeout-screenshot'
  $result = [ordered]@{
    path          = $LabVIEWTimeoutScreenshotPath
    exists        = $false
    attempted     = $true
    taskName      = $taskName
    taskState     = $null
    taskResult    = $null
    taskResultHex = $null
    error         = $null
  }

  try {
    if (Test-Path -LiteralPath $LabVIEWTimeoutScreenshotPath) {
      Remove-Item -LiteralPath $LabVIEWTimeoutScreenshotPath -Force
    }

    $escapedScreenshotPath = $LabVIEWTimeoutScreenshotPath.Replace("'", "''")
    $screenshotScript = @"
`$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
`$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
`$bitmap = New-Object System.Drawing.Bitmap `$bounds.Width, `$bounds.Height
`$graphics = [System.Drawing.Graphics]::FromImage(`$bitmap)
try {
  `$graphics.CopyFromScreen(`$bounds.Location, [System.Drawing.Point]::Empty, `$bounds.Size)
  `$bitmap.Save('$escapedScreenshotPath', [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  `$graphics.Dispose()
  `$bitmap.Dispose()
}
"@
    $screenshotScript | Set-Content -LiteralPath $LabVIEWTimeoutScreenshotScriptPath -Encoding utf8
    $encodedScreenshotCommand = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($screenshotScript))

    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    $taskAction = New-ScheduledTaskAction `
      -Execute 'powershell.exe' `
      -Argument "-NoLogo -NoProfile -WindowStyle Hidden -EncodedCommand $encodedScreenshotCommand" `
      -WorkingDirectory $EvidenceRoot
    $taskTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(5)
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId 'vagrant' -LogonType Interactive -RunLevel Highest
    $taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 2)

    Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName

    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $deadline -and -not (Test-Path -LiteralPath $LabVIEWTimeoutScreenshotPath)) {
      Start-Sleep -Seconds 1
    }

    try {
      $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
      $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction Stop
      $result['taskState'] = [string]$task.State
      $result['taskResult'] = $taskInfo.LastTaskResult
      $result['taskResultHex'] = Format-UnsignedHex32 -Value $taskInfo.LastTaskResult
    } catch {
      $result['error'] = $_.Exception.Message
    }

    $result['exists'] = Test-Path -LiteralPath $LabVIEWTimeoutScreenshotPath
  } catch {
    $result['error'] = $_.Exception.Message
  } finally {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  }

  return $result
}

function Invoke-LabVIEWActivationDialogRescue {
  param([string]$Reason = 'during VI Server wait')

  $now = Get-Date
  if ($script:ActivationDialogRescueAttemptCount -ge 3) {
    return
  }
  if (($now - $script:LastActivationDialogRescueAttempt).TotalSeconds -lt 10) {
    return
  }

  $script:LastActivationDialogRescueAttempt = $now
  $script:ActivationDialogRescueAttemptCount += 1

  $taskName = 'vihs-lv-activation-dialog-rescue'
  $resultPath = $LabVIEWActivationDialogEvidencePath
  $escapedResultPath = $resultPath.Replace("'", "''")
  $rescueScript = @"
`$ErrorActionPreference = 'Stop'
`$result = [ordered]@{
  schema = 'vi-history-suite/vagrant-labview-activation-dialog@v1'
  capturedAt = (Get-Date -Format 'o')
  clicked = `$false
  clickedName = `$null
  windowName = `$null
  candidates = @()
  error = `$null
}
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  `$root = [System.Windows.Automation.AutomationElement]::RootElement
  `$buttonType = [System.Windows.Automation.ControlType]::Button
  `$buttonCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, `$buttonType)
  `$deadline = (Get-Date).AddSeconds(12)
  while ((Get-Date) -lt `$deadline -and -not `$result.clicked) {
    `$windows = `$root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach (`$window in `$windows) {
      `$windowName = [string]`$window.Current.Name
      if (`$windowName -notmatch 'LabVIEW|National Instruments|NI|Activation') {
        continue
      }

      `$buttons = `$window.FindAll([System.Windows.Automation.TreeScope]::Descendants, `$buttonCondition)
      foreach (`$button in `$buttons) {
        `$buttonName = [string]`$button.Current.Name
        if ([string]::IsNullOrWhiteSpace(`$buttonName)) {
          continue
        }
        `$result.candidates += [ordered]@{
          windowName = `$windowName
          buttonName = `$buttonName
          enabled = `$button.Current.IsEnabled
        }
      }

      `$target = `$null
      foreach (`$preferredName in @('Begin 7 Day Trial', 'Begin 7-Day Trial', 'Activate')) {
        foreach (`$button in `$buttons) {
          `$buttonName = [string]`$button.Current.Name
          if (`$button.Current.IsEnabled -and `$buttonName -eq `$preferredName) {
            `$target = `$button
            break
          }
        }
        if (`$target) { break }
      }

      if (`$target) {
        `$targetName = [string]`$target.Current.Name
        `$invokePattern = `$target.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        `$invokePattern.Invoke()
        `$result.clicked = `$true
        `$result.clickedName = `$targetName
        `$result.windowName = `$windowName
        break
      }
    }

    if (-not `$result.clicked) {
      Start-Sleep -Seconds 1
    }
  }
} catch {
  `$result.error = `$_.Exception.Message
}
`$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath '$escapedResultPath' -Encoding utf8
"@
  $encodedRescueCommand = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($rescueScript))

  Write-Step "Checking LabVIEW activation dialog rescue ($Reason, attempt $script:ActivationDialogRescueAttemptCount)."
  try {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    $taskAction = New-ScheduledTaskAction `
      -Execute 'powershell.exe' `
      -Argument "-NoLogo -NoProfile -WindowStyle Hidden -EncodedCommand $encodedRescueCommand" `
      -WorkingDirectory $EvidenceRoot
    $taskTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(1)
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId 'vagrant' -LogonType Interactive -RunLevel Highest
    $taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 1)

    Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
  } catch {
    [ordered]@{
      schema = 'vi-history-suite/vagrant-labview-activation-dialog@v1'
      capturedAt = (Get-Date -Format 'o')
      clicked = $false
      clickedName = $null
      windowName = $null
      candidates = @()
      error = $_.Exception.Message
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $resultPath -Encoding utf8
  }
}

function Get-LabVIEWPrelaunchTaskSnapshot {
  param([string]$TaskName)

  if (-not $TaskName) {
    return $null
  }

  try {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction Stop
    return [ordered]@{
      taskName           = $TaskName
      state              = [string]$task.State
      principalUserId    = $task.Principal.UserId
      principalLogonType = [string]$task.Principal.LogonType
      principalRunLevel  = [string]$task.Principal.RunLevel
      actions            = @($task.Actions | ForEach-Object {
        [ordered]@{
          execute          = $_.Execute
          arguments        = $_.Arguments
          workingDirectory = $_.WorkingDirectory
        }
      })
      lastRunTime        = $taskInfo.LastRunTime
      lastTaskResult     = $taskInfo.LastTaskResult
      lastTaskResultHex  = Format-UnsignedHex32 -Value $taskInfo.LastTaskResult
      nextRunTime        = $taskInfo.NextRunTime
      numberOfMissedRuns = $taskInfo.NumberOfMissedRuns
    }
  } catch {
    return [ordered]@{
      taskName = $TaskName
      error    = $_.Exception.Message
    }
  }
}

function Get-LabVIEWIniSnapshot {
  if (-not (Test-Path -LiteralPath $LabVIEWIniPath)) {
    return [ordered]@{
      path  = $LabVIEWIniPath
      exists = $false
      viServerLines = @()
    }
  }

  $viServerLines = @(Get-Content -LiteralPath $LabVIEWIniPath -ErrorAction SilentlyContinue |
    Where-Object { $_ -match '^(server\.tcp\.|server\.app\.)' } |
    ForEach-Object { [string]$_ })

  return [ordered]@{
    path          = $LabVIEWIniPath
    exists        = $true
    viServerLines = $viServerLines
  }
}

function Get-LabVIEWFirewallSnapshot {
  try {
    $rules = @(Get-NetFirewallRule -DisplayName '*LabVIEW*3363*' -ErrorAction SilentlyContinue)
    return @($rules | ForEach-Object {
      $portFilter = $_ | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
      $appFilter = $_ | Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue
      $protocol = $null
      $localPort = $null
      $program = $null
      if ($portFilter) {
        $protocol = [string]$portFilter.Protocol
        $localPort = [string]$portFilter.LocalPort
      }
      if ($appFilter) {
        $program = [string]$appFilter.Program
      }
      [ordered]@{
        displayName = $_.DisplayName
        enabled     = [string]$_.Enabled
        direction   = [string]$_.Direction
        action      = [string]$_.Action
        profile     = [string]$_.Profile
        protocol    = $protocol
        localPort   = $localPort
        program     = $program
      }
    })
  } catch {
    return @([ordered]@{ error = $_.Exception.Message })
  }
}

function Get-ViServerPortSnapshot {
  $lines = @(netstat -ano 2>$null | Select-String ':3363' | ForEach-Object { [string]$_ })
  $listeningLines = @($lines | Where-Object { $_ -match 'LISTENING' })

  return [ordered]@{
    port           = 3363
    listening      = $listeningLines.Count -gt 0
    lineCount      = $lines.Count
    listeningCount = $listeningLines.Count
    lines          = $lines
  }
}

function Get-LabVIEWStartupDiagnostics {
  param(
    [string]$Phase,
    [string]$TaskName = '',
    [datetime]$WaitStartedAt = [datetime]::MinValue
  )

  $capturedAt = Get-Date
  $waitElapsedSec = $null
  if ($WaitStartedAt -ne [datetime]::MinValue) {
    $waitElapsedSec = [math]::Round(($capturedAt - $WaitStartedAt).TotalSeconds, 1)
  }

  $processes = @(Get-LabVIEWProcessSnapshot)
  $interactiveProcesses = @($processes | Where-Object { $_.sessionId -ne 0 })
  $nonRespondingProcesses = @($processes | Where-Object { $_.responding -eq $false })
  $portSnapshot = Get-ViServerPortSnapshot
  $taskSnapshot = Get-LabVIEWPrelaunchTaskSnapshot -TaskName $TaskName

  $lastObservedLabVIEWState = 'not-running'
  if ($portSnapshot.listening -and $interactiveProcesses.Count -gt 0) {
    $lastObservedLabVIEWState = 'interactive-running-vi-server-listening'
  } elseif ($portSnapshot.listening) {
    $lastObservedLabVIEWState = 'vi-server-listening-without-interactive-process'
  } elseif ($interactiveProcesses.Count -gt 0 -and $nonRespondingProcesses.Count -gt 0) {
    $lastObservedLabVIEWState = 'interactive-running-not-responding-vi-server-not-listening'
  } elseif ($interactiveProcesses.Count -gt 0) {
    $lastObservedLabVIEWState = 'interactive-running-vi-server-not-listening'
  } elseif ($processes.Count -gt 0) {
    $lastObservedLabVIEWState = 'noninteractive-running-vi-server-not-listening'
  }

  $failureCategory = $null
  $nextAction = $null
  if ($Phase -eq 'timeout') {
    if ($processes.Count -eq 0) {
      $failureCategory = 'labview-process-not-running'
      $nextAction = "LabVIEW did not remain running before VI Server opened. Inspect the prelaunch scheduled task result, recent LabVIEW/TaskScheduler events, and timeout desktop screenshot; then rerun Vagrant acceptance after repairing the interactive launch path."
    } elseif ($interactiveProcesses.Count -eq 0) {
      $failureCategory = 'labview-not-in-interactive-session'
      $nextAction = "LabVIEW is running outside the interactive vagrant desktop. Verify bootstrap autologon, Explorer session state, and the scheduled task principal before retrying Vagrant acceptance."
    } elseif ($nonRespondingProcesses.Count -gt 0) {
      $failureCategory = 'labview-interactive-not-responding'
      $nextAction = "LabVIEW is present in the interactive desktop but is not responding and VI Server never listened. Inspect the timeout desktop screenshot, activation-dialog evidence, and recent Windows events for blocked startup prompts."
    } else {
      $failureCategory = 'vi-server-not-listening'
      $nextAction = "LabVIEW is running in the interactive desktop but VI Server port 3363 did not listen. Check LabVIEW.ini server.tcp settings, Windows Firewall rule state, and LabVIEW startup events before retrying."
    }
  }

  return [ordered]@{
    phase                    = $Phase
    capturedAt               = $capturedAt.ToString('o')
    waitStartedAt            = if ($WaitStartedAt -ne [datetime]::MinValue) { $WaitStartedAt.ToString('o') } else { $null }
    waitElapsedSec           = $waitElapsedSec
    lastObservedLabVIEWState = $lastObservedLabVIEWState
    labviewProcessCount      = $processes.Count
    interactiveProcessCount  = $interactiveProcesses.Count
    nonRespondingProcessCount = $nonRespondingProcesses.Count
    viServerListening        = $portSnapshot.listening
    viServerPortSnapshot     = $portSnapshot
    prelaunchTask            = $taskSnapshot
    failureCategory          = $failureCategory
    nextAction               = $nextAction
  }
}

function Write-LabVIEWStartupEvidence {
  param(
    [string]$Phase,
    [string]$TaskName = '',
    [datetime]$WaitStartedAt = [datetime]::MinValue,
    [switch]$CaptureDesktopScreenshot
  )

  $desktopScreenshot = $null
  if ($CaptureDesktopScreenshot) {
    $desktopScreenshot = Save-LabVIEWTimeoutDesktopScreenshot
  }
  $startupDiagnostics = Get-LabVIEWStartupDiagnostics -Phase $Phase -TaskName $TaskName -WaitStartedAt $WaitStartedAt

  $evidence = [ordered]@{
    schema                  = 'vi-history-suite/vagrant-labview-startup@v1'
    capturedAt              = (Get-Date -Format 'o')
    phase                   = $Phase
    failureCategory         = $startupDiagnostics.failureCategory
    nextAction              = $startupDiagnostics.nextAction
    startupDurationSec      = $startupDiagnostics.waitElapsedSec
    lastObservedLabVIEWState = $startupDiagnostics.lastObservedLabVIEWState
    labviewExe              = $lvExe
    viServerPort            = 3363
    viServerTimeoutSec      = $ViServerTimeoutSec
    prelaunchTask           = Get-LabVIEWPrelaunchTaskSnapshot -TaskName $TaskName
    labviewProcesses        = @(Get-LabVIEWProcessSnapshot)
    explorerSessions        = @(Get-ExplorerSessionSnapshot)
    interactiveWindows      = @(Get-InteractiveWindowSnapshot)
    labviewIni              = Get-LabVIEWIniSnapshot
    firewallRules           = @(Get-LabVIEWFirewallSnapshot)
    viServerPortSnapshot    = $startupDiagnostics.viServerPortSnapshot
    viServerPortLines       = @($startupDiagnostics.viServerPortSnapshot.lines)
    recentEvents            = @(Get-RecentLabVIEWEventSnapshot)
    startupDiagnostics      = $startupDiagnostics
    timeoutDesktopScreenshot = $desktopScreenshot
  }

  $evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $LabVIEWStartupEvidencePath -Encoding utf8
}

function Wait-LabVIEWPort {
  param(
    [int]$TimeoutSec = 120,
    [string]$TaskName = ''
  )
  $waitStartedAt = Get-Date
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $nextProgressLog = Get-Date
  while ((Get-Date) -lt $deadline) {
    Stop-DesktopInterloperProcesses -Reason 'during VI Server wait'

    if ((Get-LabVIEWProcessSnapshot).Count -gt 0) {
      Invoke-LabVIEWActivationDialogRescue -Reason 'during VI Server wait'
    }

    if (Test-LabVIEWPortListening) {
      Write-LabVIEWStartupEvidence -Phase 'vi-server-ready' -TaskName $TaskName -WaitStartedAt $waitStartedAt
      return $true
    }

    if ((Get-Date) -ge $nextProgressLog) {
      $processSummary = @(Get-LabVIEWProcessSnapshot | ForEach-Object { "pid=$($_.id),session=$($_.sessionId)" })
      $taskSnapshot = Get-LabVIEWPrelaunchTaskSnapshot -TaskName $TaskName
      $taskSummary = if ($taskSnapshot -and $taskSnapshot.Contains('error')) {
        "task-error=$($taskSnapshot.error)"
      } elseif ($taskSnapshot) {
        "task-state=$($taskSnapshot.state),last-result=$($taskSnapshot.lastTaskResult)"
      } else {
        'task=none'
      }
      Write-Step "Waiting for VI Server port 3363; LabVIEW processes: $(if ($processSummary.Count -gt 0) { $processSummary -join '; ' } else { 'none' }); $taskSummary."
      Write-LabVIEWStartupEvidence -Phase 'waiting-for-vi-server' -TaskName $TaskName -WaitStartedAt $waitStartedAt
      $nextProgressLog = (Get-Date).AddSeconds(30)
    }

    Start-Sleep -Seconds 5
  }
  Write-LabVIEWStartupEvidence -Phase 'timeout' -TaskName $TaskName -WaitStartedAt $waitStartedAt -CaptureDesktopScreenshot
  return $false
}

Stop-DesktopInterloperProcesses -Reason 'before LabVIEW launch'

# Check if VI Server port is already open (LabVIEW may already be running)
$portAlreadyOpen = netstat -an 2>$null | Select-String ':3363.*LISTENING'
if ($portAlreadyOpen) {
  Write-Step "LabVIEW VI Server already listening on port 3363."
} else {
  $taskName = ''
  $lvRunning = Get-Process -Name LabVIEW -ErrorAction SilentlyContinue
  if (-not $lvRunning) {
    Write-Step "LabVIEW not running. Launching via scheduled task..."
    $taskName = 'vihs-lv-prelaunch'
    try {
      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

      $taskAction    = New-ScheduledTaskAction -Execute $lvExe -WorkingDirectory (Split-Path -Parent $lvExe)
      $taskTrigger   = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(15)
      $taskPrincipal = New-ScheduledTaskPrincipal -UserId 'vagrant' -LogonType Interactive -RunLevel Highest
      $taskSettings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)

      Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null
      Write-LabVIEWStartupEvidence -Phase 'task-registered' -TaskName $taskName
      Start-ScheduledTask -TaskName $taskName
      Write-LabVIEWStartupEvidence -Phase 'task-start-requested' -TaskName $taskName
    } catch {
      throw "Failed to launch LabVIEW via interactive scheduled task: $($_.Exception.Message)"
    }
    Write-Step "Scheduled task triggered with a near-future fallback. Waiting up to ${ViServerTimeoutSec}s for LabVIEW to initialise VI Server..."
  } else {
    Write-Step "LabVIEW is running (Session $($lvRunning.SessionId)). Waiting up to ${ViServerTimeoutSec}s for VI Server port 3363..."
  }

  if (-not (Wait-LabVIEWPort -TimeoutSec $ViServerTimeoutSec -TaskName $taskName)) {
    throw "LabVIEW VI Server did not open port 3363 within $ViServerTimeoutSec s. Check LabVIEW.ini, Windows Firewall, scheduled-task state, retained startup evidence at $LabVIEWStartupEvidencePath, and timeout desktop screenshot at $LabVIEWTimeoutScreenshotPath."
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
# 2. Configure VS Code settings (non-interactive, defaults to host/2026/x86)
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

$runtimeSettingsLauncher = Join-Path $env:APPDATA 'Code\User\globalStorage\svelderrainruiz.vi-history-suite\local-runtime-settings-cli\vihs.cmd'
if (-not (Test-Path -LiteralPath $runtimeSettingsLauncher)) {
  throw "Runtime settings launcher not found after install bootstrap: $runtimeSettingsLauncher"
}
& $runtimeSettingsLauncher `
    --provider host `
    --labview-version $LabVIEWVersion `
    --labview-bitness $LabVIEWBitness
if ($LASTEXITCODE -ne 0) {
  throw "Runtime settings launcher failed to force host/$LabVIEWVersion/$LabVIEWBitness settings (exit $LASTEXITCODE)."
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
Set-QuietNpmEnvironment

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
  & cmd.exe /d /s /c 'npm.cmd install --omit=dev --no-audit --no-fund --update-notifier=false --loglevel=error 2>&1'
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
$env:VI_HISTORY_SUITE_GIT_TIMEOUT_MS = $GitTimeoutMs.ToString()
Write-Step "Harness Git operations are bounded by ${GitTimeoutMs}ms."

$proofArgs = @(
  $ProofCli,
  'report-smoke',
  '--harness-id',        $HarnessId,
  '--selected-hash',     $SelectedHash,
  '--base-hash',         $BaseHash,
  '--platform',          'win32',
  '--execution-mode',    'host-only',
  '--bitness',           $LabVIEWBitness,
  '--allow-existing-windows-host-runtime',
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
