# escape=`
# Windows lvkit staging image (CI leg), version-bound to the DEV-TOOLS RELEASE tag.
# Adds Git for Windows + Python + lvkit to the NI LabVIEW Windows container so
# lvkit's Python "derive from scratch" generation (which mirrors the VI's LabVIEW
# block diagram) runs in the SAME image that carries real LabVIEW + its vi.lib
# (so wired SubVIs like `VISA Configure Serial Port` resolve). Native PowerShell
# only; no -ExecutionPolicy Bypass. For hosted/self-hosted CI where build DNS
# resolves.
#
# The image is NAMED AFTER THE DEV-TOOLS RELEASE TAG so it is a versioned,
# pullable artifact bound to a known-good toolset (devtools-release@v1):
#   docker build -f prototype/lvkit-stage-win.Dockerfile `
#     --build-arg DEVTOOLS_VERSION=2.2.1 --build-arg DEVTOOLS_CHANNEL=prerelease `
#     --build-arg DEVTOOLS_CONTENT_DIGEST=<digest> `
#     -t ghcr.io/labview-community-ci-cd/vihs-lvkit-stage-win:devtools-v2.2.1 .
#
# NOTE: Docker Desktop's local Windows BUILDER has no DNS, so build in CI (or
# provision at runtime with --dns + prototype/win-lvkit/provision.ps1 for local
# iteration).
FROM nationalinstruments/labview:2026q1patch2-windows

# Version binding to the dev-tools release channel (schema vi-history-suite/devtools-release@v1).
ARG DEVTOOLS_VERSION=2.2.1
ARG DEVTOOLS_CHANNEL=prerelease
ARG DEVTOOLS_CONTENT_DIGEST=unset

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

# 4. Bake the win-lvkit scripts in (provision reference + the born-from-scratch
#    derive runner) so the image is self-contained -- no bind mount needed.
COPY prototype/win-lvkit/ C:/win-lvkit/

# Provenance: bind the image identity to the dev-tools release tag + content digest.
LABEL com.vi-history-suite.devtools.version=$DEVTOOLS_VERSION `
      com.vi-history-suite.devtools.channel=$DEVTOOLS_CHANNEL `
      com.vi-history-suite.devtools.content-digest=$DEVTOOLS_CONTENT_DIGEST `
      com.vi-history-suite.base-image=nationalinstruments/labview:2026q1patch2-windows `
      org.opencontainers.image.version=$DEVTOOLS_VERSION `
      org.opencontainers.image.title=vihs-lvkit-stage-win

# Keep-alive default so the image can run detached for exec-based iteration.
CMD ["cmd", "/c", "ping -t 127.0.0.1 > NUL"]
