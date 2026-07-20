<#
.SYNOPSIS
  Ensure the LabVIEW comparison FIXTURE repository is present in the guest so a
  CLEAN VM (fresh `vagrant up` from the box) can run the VHS-REQ-699 single-pass
  comparison-preview pipeline drivers without any manual guest setup.

.DESCRIPTION
  The pipeline drivers compare two revisions of a real VI. On a warm dev VM the
  fixture repo (ni/labview-icon-editor) was cloned by hand to C:\repos\labview-
  icon-editor, but that is guest-local state a clean import does not carry. This
  idempotent provisioner clones the fixture (shallow-unshallow to include the two
  pinned fixture commits) when absent, and verifies the pinned revisions resolve.

  Idempotent: re-running is a no-op that re-verifies. Opt-in (run: never); enable
  once when baking a golden box, or on demand:
    vagrant provision --provision-with ensure-fixtures

  Overridable via environment:
    VIHS_FIXTURE_REPO_URL  (default https://github.com/ni/labview-icon-editor.git)
    VIHS_FIXTURE_DIR       (default C:\repos\labview-icon-editor)
    VIHS_FIXTURE_BASE      (default 537683398d8c5cb73533603b5c06b6eef62a6ac8)
    VIHS_FIXTURE_SELECTED  (default fc09736ae5e38c2016de081a9c8686256c9f2f9c)
#>
#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "[ensure-fixtures] $Message"
}

$RepoUrl = if ($env:VIHS_FIXTURE_REPO_URL) { $env:VIHS_FIXTURE_REPO_URL } else { 'https://github.com/ni/labview-icon-editor.git' }
$FixtureDir = if ($env:VIHS_FIXTURE_DIR) { $env:VIHS_FIXTURE_DIR } else { 'C:\repos\labview-icon-editor' }
$BaseSha = if ($env:VIHS_FIXTURE_BASE) { $env:VIHS_FIXTURE_BASE } else { '537683398d8c5cb73533603b5c06b6eef62a6ac8' }
$SelectedSha = if ($env:VIHS_FIXTURE_SELECTED) { $env:VIHS_FIXTURE_SELECTED } else { 'fc09736ae5e38c2016de081a9c8686256c9f2f9c' }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'git is not available in the guest; run the bootstrap provisioner first.'
}

$parent = Split-Path -Parent $FixtureDir
if (-not (Test-Path $parent)) {
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
}

if (-not (Test-Path (Join-Path $FixtureDir '.git'))) {
  Write-Step "Cloning fixture repo $RepoUrl -> $FixtureDir ..."
  git clone $RepoUrl $FixtureDir
  if ($LASTEXITCODE -ne 0) { throw "git clone failed ($LASTEXITCODE)" }
} else {
  Write-Step "Fixture repo already present at $FixtureDir"
}

Push-Location $FixtureDir
try {
  # A shallow clone may lack the pinned commits; unshallow + fetch all so the two
  # fixture revisions resolve. Best-effort: a full clone already has everything.
  $isShallow = (git rev-parse --is-shallow-repository 2>$null)
  if ($isShallow -eq 'true') {
    Write-Step 'Unshallowing to include pinned fixture commits...'
    git fetch --unshallow 2>$null | Out-Null
  }

  function Test-Rev([string]$Sha) {
    git rev-parse --verify --quiet "$Sha^{commit}" > $null 2>&1
    return ($LASTEXITCODE -eq 0)
  }

  foreach ($sha in @($BaseSha, $SelectedSha)) {
    if (-not (Test-Rev $sha)) {
      Write-Step "Pinned commit $sha not found locally; fetching..."
      git fetch origin $sha 2>$null | Out-Null
      if (-not (Test-Rev $sha)) {
        git fetch --all --tags 2>$null | Out-Null
      }
    }
    if (Test-Rev $sha) {
      Write-Step "verified: $sha"
    } else {
      throw "Pinned fixture commit $sha does not resolve after fetch; the fixture repo may have diverged."
    }
  }
  Write-Step 'Fixture repository is ready (both pinned revisions resolve).'
} finally {
  Pop-Location
}
