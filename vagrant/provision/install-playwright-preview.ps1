<#
.SYNOPSIS
  Idempotently install a guest-local Playwright + Chromium for the interactive
  block-diagram preview browser validation (VHS-REQ-659).

.DESCRIPTION
  The maintainer Playwright drivers under vagrant/playwright/ need a real
  browser in the guest. The repo's node_modules is a VirtualBox synced folder
  shared with the (Linux) host, so Playwright MUST NOT be installed there — it
  would clobber the host's platform-specific binaries. This script installs into
  a guest-local directory (C:\vihs-pw) instead, and downloads the Chromium
  browser binary. Drivers are then run with
  NODE_PATH=C:\vihs-pw\node_modules.

  Idempotent: re-running is a fast no-op once the package and browser are
  present. Wire as an opt-in provisioner (run: never); enable once when baking a
  golden box so future `vagrant up`s from that box already have the browser.

  Usage:
    vagrant provision --provision-with playwright-preview

  Then run a driver, e.g.:
    $env:NODE_PATH = 'C:\vihs-pw\node_modules'
    node C:\vihs-workspace\vagrant\playwright\viPreviewRealViCaseStep.cjs
#>

$ErrorActionPreference = 'Stop'

$pwRoot = 'C:\vihs-pw'
Write-Host "[playwright-preview] Ensuring guest-local Playwright at $pwRoot ..."

New-Item -ItemType Directory -Force -Path $pwRoot | Out-Null
Set-Location $pwRoot

if (-not (Test-Path (Join-Path $pwRoot 'package.json'))) {
  npm init -y | Out-Null
}

$playwrightPkg = Join-Path $pwRoot 'node_modules\playwright'
if (Test-Path $playwrightPkg) {
  Write-Host '[playwright-preview] playwright package already present; skipping npm install.'
} else {
  Write-Host '[playwright-preview] Installing the playwright package (guest-local) ...'
  npm install playwright | Out-Null
}

# Download the Chromium browser binary into the guest user's ms-playwright cache.
# `playwright install` is itself idempotent (skips already-downloaded browsers).
Write-Host '[playwright-preview] Ensuring the Chromium browser binary ...'
npx playwright install chromium | Out-Null

$browserCache = Join-Path $env:LOCALAPPDATA 'ms-playwright'
if (Test-Path $browserCache) {
  $chromiumDirs = @(Get-ChildItem $browserCache -Filter 'chromium-*' -Directory -ErrorAction SilentlyContinue)
  if ($chromiumDirs.Count -ge 1) {
    Write-Host "[playwright-preview] Chromium present: $($chromiumDirs[0].Name)"
  } else {
    throw '[playwright-preview] Chromium browser directory not found after install.'
  }
} else {
  throw "[playwright-preview] ms-playwright cache not found at $browserCache after install."
}

Write-Host '[playwright-preview] Ready. Run a preview driver with NODE_PATH=C:\vihs-pw\node_modules.'
