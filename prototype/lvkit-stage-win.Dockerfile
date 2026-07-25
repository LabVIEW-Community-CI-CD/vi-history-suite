# escape=`
# Windows lvkit staging image (CI leg) — adds Git for Windows + Python + lvkit to
# the NI LabVIEW Windows container so lvkit's Python "derive from scratch"
# generation (which mirrors the VI's LabVIEW block diagram) runs in the SAME
# image that carries real LabVIEW. Native PowerShell only; no -ExecutionPolicy
# Bypass. Intended for hosted/self-hosted CI where build-time DNS resolves.
#
# NOTE: Docker Desktop's local Windows-container BUILDER has no DNS, so this fails
# to build on a dev box ("could not be resolved"); build it in CI, or provision at
# runtime with --dns for local iteration. Build:
#   docker build -f prototype/lvkit-stage-win.Dockerfile -t vihs-lvkit-stage-win:local .
FROM nationalinstruments/labview:2026q1patch2-windows

SHELL ["powershell", "-NoProfile", "-Command", "$ErrorActionPreference='Stop';"]

# 1. Chocolatey (TLS 1.2 required by community.chocolatey.org)
RUN [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072; `
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# 2. Git for Windows + Python (native, no reboot)
RUN C:\ProgramData\chocolatey\bin\choco.exe install -y git python --no-progress --limit-output

# 3. lvkit (LabVIEW-free VI parser/generator) + put its Scripts dir on the machine PATH
RUN $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine'); `
    python -m pip install --no-cache-dir --disable-pip-version-check lvkit; `
    $s = (python -c "import sysconfig;print(sysconfig.get_path('scripts'))").Trim(); `
    [Environment]::SetEnvironmentVariable('Path', ([Environment]::GetEnvironmentVariable('Path','Machine').TrimEnd(';') + ';' + $s), 'Machine')

# Keep-alive default so the image can run detached for exec-based iteration.
CMD ["cmd", "/c", "ping -t 127.0.0.1 > NUL"]
