# Windows lvkit runtime provisioner (CI leg, local iteration).
# Installs Chocolatey -> Git for Windows + Python -> lvkit (pip) into a running
# NI LabVIEW Windows container, then records versions. Native PowerShell; invoked
# via `powershell -NoProfile -Command "Invoke-Expression (Get-Content <path> -Raw)"`
# (NO -File, NO -ExecutionPolicy Bypass) so it is CI-policy clean. Writes stepwise
# progress to C:\out\provision-result.txt so a failure is visible at its step.
$log = 'C:\out\provision-result.txt'
function step($m) { Add-Content -Path $log -Value ('[' + (Get-Date -Format HH:mm:ss) + '] ' + $m) }
Set-Content -Path $log -Value ('[provision] start ' + (Get-Date -Format o)) -Encoding utf8

# 1. Chocolatey (TLS 1.2). Do NOT set ErrorActionPreference=Stop globally: the
#    choco bootstrap emits WARNINGs that must not abort the run.
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
  Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1')) | Out-Null
  step ('choco: ' + ((& C:\ProgramData\chocolatey\bin\choco.exe --version) 2>&1))
} catch { step ('choco FAILED: ' + $_.Exception.Message); return }

# 2. Git for Windows + Python.
try {
  & C:\ProgramData\chocolatey\bin\choco.exe install -y git python --no-progress --limit-output | Out-Null
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
  step ('git: ' + ((& git --version) 2>&1))
  step ('python: ' + ((& python --version) 2>&1))
} catch { step ('git/python FAILED: ' + $_.Exception.Message); return }

# 3. lvkit via pip + put its Scripts dir on the machine PATH for future exec shells.
try {
  & python -m pip install --no-cache-dir --disable-pip-version-check lvkit | Out-Null
  $scripts = (& python -c "import sysconfig;print(sysconfig.get_path('scripts'))").Trim()
  $machine = [Environment]::GetEnvironmentVariable('Path','Machine')
  if ($machine -notlike "*$scripts*") { [Environment]::SetEnvironmentVariable('Path', ($machine.TrimEnd(';') + ';' + $scripts), 'Machine') }
  step ('lvkit: ' + ((& (Join-Path $scripts 'lvkit.exe') --version) 2>&1))
  step ('scripts-dir: ' + $scripts)
  step '[provision] OK'
} catch { step ('lvkit FAILED: ' + $_.Exception.Message) }
