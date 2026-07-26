<#
.SYNOPSIS
  Ensure the LabVIEW comparison FIXTURE repository is present in the guest so a
  CLEAN VM (fresh `vagrant up` from the box) can run the VHS-REQ-699 single-pass
  comparison-preview pipeline drivers without any manual guest setup.

.DESCRIPTION
  The pipeline drivers compare two revisions of a real VI. On a warm dev VM the
  fixture repos were cloned by hand, but that is guest-local state a clean import
  does not carry. This idempotent provisioner clones BOTH oracle corpora when
  absent and verifies their pinned revisions resolve, so a clean VM can run the
  full oracle cycle (lv_icon closure proof AND the af real-structural comparisons)
  with no manual guest setup:
    - ni/labview-icon-editor -> C:\repos\labview-icon-editor (the lv_icon.vi
      dependency-closure fixture; base + selected pins).
    - ni/actor-framework     -> C:\repos\actor-framework (the af comparison
      corpus; the peripheral non-password-protected VIs are the real-structural
      set). The af change-pair pins live in
      prototype/win-lvkit/correlation-fixtures/af-change-pairs.json; a full
      (unshallowed) clone resolves every pair.

  Idempotent: re-running is a no-op that re-verifies. Opt-in (run: never); enable
  once when baking a golden box, or on demand:
    vagrant provision --provision-with ensure-fixtures

  Overridable via environment:
    VIHS_FIXTURE_REPO_URL     (default https://github.com/ni/labview-icon-editor.git)
    VIHS_FIXTURE_DIR          (default C:\repos\labview-icon-editor)
    VIHS_FIXTURE_BASE         (default 537683398d8c5cb73533603b5c06b6eef62a6ac8)
    VIHS_FIXTURE_SELECTED     (default fc09736ae5e38c2016de081a9c8686256c9f2f9c)
    VIHS_AF_FIXTURE_REPO_URL  (default https://github.com/ni/actor-framework.git)
    VIHS_AF_FIXTURE_DIR       (default C:\repos\actor-framework)
    VIHS_AF_FIXTURE_SHAS      (default: a representative af pin subset to
                               smoke-verify; space/comma-separated list)
#>
#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "[ensure-fixtures] $Message"
}

$IconRepoUrl = if ($env:VIHS_FIXTURE_REPO_URL) { $env:VIHS_FIXTURE_REPO_URL } else { 'https://github.com/ni/labview-icon-editor.git' }
$IconFixtureDir = if ($env:VIHS_FIXTURE_DIR) { $env:VIHS_FIXTURE_DIR } else { 'C:\repos\labview-icon-editor' }
$IconBaseSha = if ($env:VIHS_FIXTURE_BASE) { $env:VIHS_FIXTURE_BASE } else { '537683398d8c5cb73533603b5c06b6eef62a6ac8' }
$IconSelectedSha = if ($env:VIHS_FIXTURE_SELECTED) { $env:VIHS_FIXTURE_SELECTED } else { 'fc09736ae5e38c2016de081a9c8686256c9f2f9c' }

$AfRepoUrl = if ($env:VIHS_AF_FIXTURE_REPO_URL) { $env:VIHS_AF_FIXTURE_REPO_URL } else { 'https://github.com/ni/actor-framework.git' }
$AfFixtureDir = if ($env:VIHS_AF_FIXTURE_DIR) { $env:VIHS_AF_FIXTURE_DIR } else { 'C:\repos\actor-framework' }
# A representative subset of af-change-pairs pins to smoke-verify after unshallow
# (the full history resolves the rest): 8b81599 (shared base/selected across
# several core pairs), 0b1ff88 (find-target-actor selected), 179d2f60 (inherits-
# from-an-actor selected). Override with a space/comma-separated list.
$AfShas = if ($env:VIHS_AF_FIXTURE_SHAS) {
  @($env:VIHS_AF_FIXTURE_SHAS -split '[,\s]+' | Where-Object { $_ })
} else {
  @(
    '8b81599d5bcded119df6eb48c946a90674007730',
    '0b1ff88de83e5ce02dc4f063f81921f8c551d266',
    '179d2f607d3ec0f9dfe7e2a0cc5a2843045ea569'
  )
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'git is not available in the guest; run the bootstrap provisioner first.'
}

function Test-Rev([string]$Sha) {
  git rev-parse --verify --quiet "$Sha^{commit}" > $null 2>&1
  return ($LASTEXITCODE -eq 0)
}

function Ensure-FixtureRepo {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$RepoUrl,
    [Parameter(Mandatory)][string]$FixtureDir,
    [Parameter(Mandatory)][string[]]$Shas
  )

  $parent = Split-Path -Parent $FixtureDir
  if (-not (Test-Path $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }

  if (-not (Test-Path (Join-Path $FixtureDir '.git'))) {
    Write-Step "[$Name] Cloning fixture repo $RepoUrl -> $FixtureDir ..."
    git clone $RepoUrl $FixtureDir
    if ($LASTEXITCODE -ne 0) { throw "[$Name] git clone failed ($LASTEXITCODE)" }
  } else {
    Write-Step "[$Name] Fixture repo already present at $FixtureDir"
  }

  Push-Location $FixtureDir
  try {
    # A shallow clone may lack the pinned commits; unshallow so every pinned
    # fixture revision resolves. Best-effort: a full clone already has everything.
    $isShallow = (git rev-parse --is-shallow-repository 2>$null)
    if ($isShallow -eq 'true') {
      Write-Step "[$Name] Unshallowing to include pinned fixture commits..."
      git fetch --unshallow 2>$null | Out-Null
    }

    foreach ($sha in $Shas) {
      if (-not (Test-Rev $sha)) {
        Write-Step "[$Name] Pinned commit $sha not found locally; fetching..."
        git fetch origin $sha 2>$null | Out-Null
        if (-not (Test-Rev $sha)) {
          git fetch --all --tags 2>$null | Out-Null
        }
      }
      if (Test-Rev $sha) {
        Write-Step "[$Name] verified: $sha"
      } else {
        throw "[$Name] Pinned fixture commit $sha does not resolve after fetch; the fixture repo may have diverged."
      }
    }
    Write-Step "[$Name] Fixture repository is ready ($($Shas.Count) pinned revision(s) resolve)."
  } finally {
    Pop-Location
  }
}

Ensure-FixtureRepo -Name 'icon-editor' -RepoUrl $IconRepoUrl -FixtureDir $IconFixtureDir -Shas @($IconBaseSha, $IconSelectedSha)
Ensure-FixtureRepo -Name 'actor-framework' -RepoUrl $AfRepoUrl -FixtureDir $AfFixtureDir -Shas $AfShas
Write-Step 'All fixture repositories are ready.'
