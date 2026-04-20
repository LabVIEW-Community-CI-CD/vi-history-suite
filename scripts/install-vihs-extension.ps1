Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

param(
  [string]$CodeCommand = 'code',
  [string]$ExtensionId = 'svelderrainruiz.vi-history-suite',
  [string]$SettingsFilePath = $(Join-Path $env:APPDATA 'Code\User\settings.json'),
  [switch]$SkipInstall,
  [switch]$NonInteractive
)

$script:DefaultProvider = 'host'
$script:DefaultPlatform = 'windows'
$script:DefaultLabVIEWVersion = '2026'
$script:DefaultLabVIEWBitness = 'x64'
$script:SupportedHostLabVIEWVersions = @('2020', '2021', '2022', '2023', '2024', '2025', '2026')
$script:SupportedDockerLabVIEWVersion = '2026'

function Test-InteractiveConsole {
  if ($NonInteractive.IsPresent) {
    return $false
  }

  try {
    return -not [Console]::IsInputRedirected -and -not [Console]::IsOutputRedirected
  } catch {
    return $false
  }
}

function Resolve-ExtensionInstallRoot {
  param([string]$PublisherExtensionId)

  $extensionsRoot = Join-Path $HOME '.vscode\extensions'
  if (-not (Test-Path -LiteralPath $extensionsRoot)) {
    throw "VS Code extensions root not found at $extensionsRoot. Install VS Code and ensure `code` targets the stable Windows install."
  }

  $candidates = @(
    Get-ChildItem -LiteralPath $extensionsRoot -Directory -Filter "$PublisherExtensionId-*" |
      Sort-Object LastWriteTimeUtc -Descending
  )
  if ($candidates.Count -eq 0) {
    throw "Installed extension payload for $PublisherExtensionId was not found under $extensionsRoot after install."
  }

  return $candidates[0].FullName
}

function Resolve-VihsGlobalStorageRoot {
  param([string]$PublisherExtensionId)

  return Join-Path $env:APPDATA "Code\User\globalStorage\$PublisherExtensionId\local-runtime-settings-cli"
}

function Render-JavaScriptLauncher {
  param([string]$ModulePath)

  $escapedModulePath = $ModulePath.Replace('\', '\\').Replace("'", "\'")
  return @(
    '#!/usr/bin/env node'
    "const path = require('node:path');"
    "const modulePath = '$escapedModulePath';"
    'let cli;'
    'try {'
    '  cli = require(modulePath);'
    '} catch (error) {'
    '  console.error(''VI History runtime-settings CLI launcher is stale or incomplete. Run "VI History: Prepare Local Runtime Settings CLI" again to refresh the generated launcher files.'');'
    '  if (error instanceof Error && error.message) {'
    '    console.error(`Module: ${path.resolve(modulePath)}`);'
    '    console.error(error.message);'
    '  }'
    '  process.exitCode = 1;'
    '  return;'
    '}'
    'if (!cli || typeof cli.runLocalRuntimeSettingsCliMain !== ''function'') {'
    '  console.error(''VI History runtime-settings CLI launcher is stale or incomplete. Run "VI History: Prepare Local Runtime Settings CLI" again to refresh the generated launcher files.'');'
    '  console.error(`Module: ${path.resolve(modulePath)}`);'
    '  process.exitCode = 1;'
    '  return;'
    '}'
    'void cli.runLocalRuntimeSettingsCliMain(process.argv.slice(2)).then((code) => {'
    '  process.exitCode = code;'
    '});'
    ''
  ) -join "`n"
}

function Render-WindowsLauncher {
  return @(
    '@echo off'
    'set SCRIPT_DIR=%~dp0'
    'where node >nul 2>nul'
    'if errorlevel 1 ('
    '  >&2 echo VI History runtime-settings CLI requires a usable Node.js runtime on PATH. Install or restore Node.js, then rerun "VI History: Prepare Local Runtime Settings CLI" to refresh the launcher if this dependency changed.'
    '  exit /b 1'
    ')'
    'node "%SCRIPT_DIR%run-local-runtime-settings-cli.js" %*'
    ''
  ) -join "`r`n"
}

function Ensure-WindowsUserPathPrepend {
  param([string]$PathEntry)

  $normalizedTarget = $PathEntry.Trim().TrimEnd('\')
  $currentUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $entries = @()
  if ($currentUserPath) {
    $entries = @(
      $currentUserPath -split ';' |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ }
    )
  }

  $alreadyPresent = $entries | Where-Object { $_.TrimEnd('\') -ieq $normalizedTarget } | Select-Object -First 1
  if ($alreadyPresent) {
    return
  }

  $updated = @($PathEntry) + $entries
  [Environment]::SetEnvironmentVariable('Path', ($updated -join ';'), 'User')
}

function Ensure-VihsLaunchers {
  param(
    [string]$PublisherExtensionId,
    [string]$ExtensionInstallRoot
  )

  $globalStorageRoot = Resolve-VihsGlobalStorageRoot -PublisherExtensionId $PublisherExtensionId
  $modulePath = Join-Path $ExtensionInstallRoot 'out\tooling\localRuntimeSettingsCli.js'
  if (-not (Test-Path -LiteralPath $modulePath)) {
    throw "Installed CLI module not found at $modulePath."
  }

  New-Item -ItemType Directory -Force -Path $globalStorageRoot | Out-Null

  Set-Content -LiteralPath (Join-Path $globalStorageRoot 'run-local-runtime-settings-cli.js') -Value (Render-JavaScriptLauncher -ModulePath $modulePath) -Encoding utf8
  Set-Content -LiteralPath (Join-Path $globalStorageRoot 'vihs.cmd') -Value (Render-WindowsLauncher) -Encoding ascii
  Set-Content -LiteralPath (Join-Path $globalStorageRoot 'vihs-runtime-settings.cmd') -Value (Render-WindowsLauncher) -Encoding ascii

  Ensure-WindowsUserPathPrepend -PathEntry $globalStorageRoot
  return $globalStorageRoot
}

function Read-SettingsText {
  param([string]$TargetPath)

  if (-not (Test-Path -LiteralPath $TargetPath)) {
    return '{}'
  }

  $raw = Get-Content -LiteralPath $TargetPath -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return '{}'
  }

  return $raw
}

function Set-OrAppend-TopLevelStringProperty {
  param(
    [string]$JsoncText,
    [string]$PropertyName,
    [string]$PropertyValue
  )

  $escapedPropertyName = [regex]::Escape($PropertyName)
  $quotedValue = '"' + $PropertyValue.Replace('"', '\"') + '"'
  $replacePattern = "(\s*""$escapedPropertyName""\s*:\s*)""(?:[^""\\]|\\.)*"""
  if ([regex]::IsMatch($JsoncText, $replacePattern)) {
    return ([regex]::new($replacePattern)).Replace($JsoncText, ('$1' + $quotedValue), 1)
  }

  $trimmed = $JsoncText.TrimEnd()
  if (-not $trimmed.EndsWith('}')) {
    throw 'VS Code settings.json must end with a JSON object closing brace.'
  }

  $lastBraceIndex = $trimmed.LastIndexOf('}')
  $beforeBrace = $trimmed.Substring(0, $lastBraceIndex).TrimEnd()
  $indent = '  '
  if ($beforeBrace.EndsWith('{')) {
    return "{`r`n$indent`"$PropertyName`": $quotedValue`r`n}"
  }

  if (-not $beforeBrace.TrimEnd().EndsWith(',')) {
    $beforeBrace += ','
  }

  return "$beforeBrace`r`n$indent`"$PropertyName`": $quotedValue`r`n}"
}

function Write-VihsSettings {
  param(
    [string]$TargetPath,
    [string]$Provider,
    [string]$LabVIEWVersion,
    [string]$LabVIEWBitness
  )

  $directory = Split-Path -Parent $TargetPath
  if (-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }

  $settingsText = Read-SettingsText -TargetPath $TargetPath
  $settingsText = Set-OrAppend-TopLevelStringProperty -JsoncText $settingsText -PropertyName 'viHistorySuite.runtimeProvider' -PropertyValue $Provider
  $settingsText = Set-OrAppend-TopLevelStringProperty -JsoncText $settingsText -PropertyName 'viHistorySuite.labviewVersion' -PropertyValue $LabVIEWVersion
  $settingsText = Set-OrAppend-TopLevelStringProperty -JsoncText $settingsText -PropertyName 'viHistorySuite.labviewBitness' -PropertyValue $LabVIEWBitness
  Set-Content -LiteralPath $TargetPath -Value ($settingsText.TrimEnd() + "`r`n") -Encoding utf8
}

function Get-TopLevelStringProperty {
  param(
    [string]$JsoncText,
    [string]$PropertyName
  )

  $escapedPropertyName = [regex]::Escape($PropertyName)
  $match = [regex]::Match($JsoncText, '"' + $escapedPropertyName + '"\s*:\s*"(?<value>(?:[^"\\]|\\.)*)"')
  if (-not $match.Success) {
    return $null
  }

  return $match.Groups['value'].Value
}

function Get-VihsSettings {
  param([string]$TargetPath)

  $settingsText = Read-SettingsText -TargetPath $TargetPath
  return [ordered]@{
    Provider = Get-TopLevelStringProperty -JsoncText $settingsText -PropertyName 'viHistorySuite.runtimeProvider'
    LabVIEWVersion = Get-TopLevelStringProperty -JsoncText $settingsText -PropertyName 'viHistorySuite.labviewVersion'
    LabVIEWBitness = Get-TopLevelStringProperty -JsoncText $settingsText -PropertyName 'viHistorySuite.labviewBitness'
  }
}

function Ensure-DefaultSettings {
  param([string]$TargetPath)

  $current = Get-VihsSettings -TargetPath $TargetPath
  if ($current.Provider -and $current.LabVIEWVersion -and $current.LabVIEWBitness) {
    return $current
  }

  Write-VihsSettings -TargetPath $TargetPath -Provider $script:DefaultProvider -LabVIEWVersion $script:DefaultLabVIEWVersion -LabVIEWBitness $script:DefaultLabVIEWBitness
  Write-Host "Seeded default VI History runtime settings at $TargetPath with $($script:DefaultProvider)/$($script:DefaultPlatform)/$($script:DefaultLabVIEWVersion)/$($script:DefaultLabVIEWBitness)."
  return Get-VihsSettings -TargetPath $TargetPath
}

function Read-Choice {
  param(
    [string]$Label,
    [string[]]$AllowedValues,
    [string]$DefaultValue
  )

  while ($true) {
    $response = (Read-Host "$Label [$DefaultValue]").Trim().ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($response)) {
      return $DefaultValue
    }

    if ($AllowedValues -contains $response) {
      return $response
    }

    Write-Host "Choose one of: $($AllowedValues -join ', ')."
  }
}

function Test-HostLabVIEWInstalled {
  param([string]$LabVIEWVersion)

  $candidate = Join-Path 'C:\Program Files\National Instruments' "LabVIEW $LabVIEWVersion\LabVIEW.exe"
  return Test-Path -LiteralPath $candidate
}

function Invoke-InteractiveSettingsWizard {
  param([string]$TargetPath)

  $current = Ensure-DefaultSettings -TargetPath $TargetPath
  $provider = if ($current.Provider -eq 'docker') { 'docker' } else { 'host' }
  $labviewVersion =
    if ($current.LabVIEWVersion -and ($script:SupportedHostLabVIEWVersions -contains $current.LabVIEWVersion)) {
      $current.LabVIEWVersion
    } else {
      $script:DefaultLabVIEWVersion
    }
  $labviewBitness = if ($current.LabVIEWBitness -eq 'x86') { 'x86' } else { 'x64' }

  Write-Host "Current VI History install settings: provider=$provider, platform=$($script:DefaultPlatform), labviewVersion=$labviewVersion, labviewBitness=$labviewBitness"
  $provider = Read-Choice -Label 'Provider' -AllowedValues @('host', 'docker') -DefaultValue $provider

  while ($true) {
    if ($provider -eq 'docker') {
      $labviewVersion = Read-Choice -Label 'LabVIEW year' -AllowedValues @($script:SupportedDockerLabVIEWVersion) -DefaultValue $script:SupportedDockerLabVIEWVersion
      $labviewBitness = Read-Choice -Label 'Bitness' -AllowedValues @('x64') -DefaultValue 'x64'
      break
    }

    $labviewVersion = Read-Choice -Label 'LabVIEW year' -AllowedValues $script:SupportedHostLabVIEWVersions -DefaultValue $labviewVersion
    if (-not (Test-HostLabVIEWInstalled -LabVIEWVersion $labviewVersion)) {
      Write-Host "LabVIEW $labviewVersion not installed."
      continue
    }

    $labviewBitness = Read-Choice -Label 'Bitness' -AllowedValues @('x86', 'x64') -DefaultValue $labviewBitness
    break
  }

  Write-VihsSettings -TargetPath $TargetPath -Provider $provider -LabVIEWVersion $labviewVersion -LabVIEWBitness $labviewBitness

  return [ordered]@{
    Provider = $provider
    Platform = $script:DefaultPlatform
    LabVIEWVersion = $labviewVersion
    LabVIEWBitness = $labviewBitness
  }
}

function Write-FollowUpGuidance {
  param(
    $Settings,
    [string]$GlobalStorageRoot
  )

  Write-Host "settingsFilePath=$SettingsFilePath"
  Write-Host "viHistorySuite.runtimeProvider=$($Settings.Provider)"
  Write-Host "viHistorySuite.labviewVersion=$($Settings.LabVIEWVersion)"
  Write-Host "viHistorySuite.labviewBitness=$($Settings.LabVIEWBitness)"
  Write-Host "launcherRoot=$GlobalStorageRoot"
  Write-Host 'Next commands:'
  Write-Host '  vihs'
  Write-Host '  vihs --validate'

  if ($Settings.Provider -eq 'docker') {
    Write-Host "If you selected docker, confirm docker readiness in the same session:"
    Write-Host "  docker info --format '{{.OSType}}'"
  }
}

function Install-VihsExtension {
  param(
    [string]$CliCommand,
    [string]$PublisherExtensionId
  )

  $command = Get-Command -Name $CliCommand -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "VS Code CLI '$CliCommand' was not found on PATH. Install Visual Studio Code and ensure `code` resolves in this PowerShell session."
  }

  Write-Host "Installing $PublisherExtensionId from the VS Code Marketplace..."
  & $CliCommand --install-extension $PublisherExtensionId --force
  if ($LASTEXITCODE -ne 0) {
    throw "VS Code Marketplace install failed for $PublisherExtensionId."
  }
}

if (-not $SkipInstall.IsPresent) {
  Install-VihsExtension -CliCommand $CodeCommand -PublisherExtensionId $ExtensionId
}

$extensionInstallRoot = Resolve-ExtensionInstallRoot -PublisherExtensionId $ExtensionId
$globalStorageRoot = Ensure-VihsLaunchers -PublisherExtensionId $ExtensionId -ExtensionInstallRoot $extensionInstallRoot

if (Test-InteractiveConsole) {
  $persisted = Invoke-InteractiveSettingsWizard -TargetPath $SettingsFilePath
  Write-FollowUpGuidance -Settings $persisted -GlobalStorageRoot $globalStorageRoot
  exit 0
}

$persisted = Ensure-DefaultSettings -TargetPath $SettingsFilePath
Write-Host 'Interactive input was not available. Retained or seeded the governed default settings bundle and printed the next admitted `vihs` commands instead.'
Write-FollowUpGuidance -Settings $persisted -GlobalStorageRoot $globalStorageRoot
